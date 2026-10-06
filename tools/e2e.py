"""Play every network build headless against that network's stub SDK and check the rules networks enforce.

    python tools/e2e.py              # all networks, variant a, plus variants b and c on AppLovin
    python tools/e2e.py --shots DIR  # also save screenshots of key moments

Checks per build: no request leaves the file except the network's own SDK script; the game does not start
before the ad is viewable (MRAID networks); no AudioContext before the first touch; the first tap does not
open the store; the game answers real input (Mech Rush: dragging steers the squad; Spiral Siege: dragging a
unit onto its twin merges them, the summon button buys a unit); a tap on an upgrade card picks it; the run
reaches its end card and the CTA there calls the network's function; no console errors; both orientations.

After the input checks the game's own frame loop is paused and game time is moved on with the build's test
hook (fastForward, only exposed with ?e2e): a software-rendered headless browser draws about a frame a second,
and the network rules don't depend on how fast time passes.
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
import time
import zipfile
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

EXPECTED_CTA = {
    "applovin": "mraid.open",
    "unity": "mraid.open",
    "liftoff": "Liftoff.open",
    "google": "ExitApi.exit",
    "meta": "FbPlayableAd.onCTAClick",
    "moloco": "FbPlayableAd.onCTAClick",
    "mintegral": "install",
    "tiktok": "openAppStore",
}
MRAID_NETWORKS = {"applovin", "unity", "liftoff"}
ALLOWED_EXTERNAL = {
    "google": "tpc.googlesyndication.com/pagead/gadgets/html5/api/exitapi.js",
    "tiktok": "ibytedtos.com/obj/union-fe-nc-i18n/playable/sdk/playable-sdk.js",
}

# Stand-in for each SDK. MRAID starts "loading" and only becomes viewable when the test says so.
STUB = """
(() => {
  const net = %s;
  window.__calls = [];
  window.__audioContexts = 0;
  const RealCtx = window.AudioContext;
  window.AudioContext = function (...a) { window.__audioContexts++; return new RealCtx(...a); };
  const rec = (name) => (...a) => window.__calls.push(name);
  if (["applovin", "unity", "liftoff"].includes(net)) {
    const ls = {};
    let state = "loading", viewable = false;
    window.mraid = {
      getState: () => state, isViewable: () => viewable,
      addEventListener: (n, f) => (ls[n] ||= []).push(f), removeEventListener() {},
      open: rec("mraid.open"),
    };
    setTimeout(() => { state = "default"; (ls.ready || []).forEach((f) => f()); }, 100);
    window.__fireViewable = (v = true) => { viewable = v; (ls.viewableChange || []).forEach((f) => f(v)); };
  }
  if (net === "liftoff") window.Liftoff = { open: rec("Liftoff.open") };
  if (net === "google") window.ExitApi = { exit: rec("ExitApi.exit") };
  if (net === "meta" || net === "moloco") window.FbPlayableAd = { onCTAClick: rec("FbPlayableAd.onCTAClick") };
  if (net === "mintegral") { window.install = rec("install"); window.gameReady = rec("gameReady"); window.gameEnd = rec("gameEnd"); }
  if (net === "tiktok") window.openAppStore = rec("openAppStore");
})();
"""


def entry_for(network_dir: Path, tmp: Path) -> Path:
    html = network_dir / "index.html"
    if html.exists():
        return html
    archive = next(network_dir.glob("*.zip"))
    out = tmp / network_dir.parent.name / network_dir.name
    with zipfile.ZipFile(archive) as z:
        z.extractall(out)
    found = sorted(out.rglob("*.html"))
    assert len(found) == 1, f"{archive.name}: expected one HTML, got {found}"
    return found[0]


def state(page: Page) -> str:
    return page.evaluate("window.__playable.game.state")


def wait_true(page: Page, js: str, timeout: float) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        if page.evaluate(js):
            return True
        time.sleep(0.05)
    return False


def wait_state(page: Page, wanted: str, timeout: float) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        if state(page) == wanted:
            return True
        time.sleep(0.05)
    return False


def check_build(browser, demo: str, network: str, entry: Path, viewport: dict, shots: Path | None, tag: str) -> list[str]:
    problems: list[str] = []
    page = browser.new_page(viewport=viewport, device_scale_factor=1)
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    external: list[str] = []

    def route(r):
        url = r.request.url
        if url.startswith("file:") and not url.endswith("mraid.js"):
            return r.continue_()
        if url.endswith("mraid.js"):  # injected by the SDK in production
            return r.fulfill(status=200, content_type="text/javascript", body="")
        allowed = ALLOWED_EXTERNAL.get(network)
        if allowed and allowed in url:
            return r.fulfill(status=200, content_type="text/javascript", body="")
        external.append(url)
        return r.abort()

    page.route("**/*", route)
    page.add_init_script(STUB % json.dumps(network))
    page.goto(entry.as_uri() + "?e2e=1")
    page.wait_for_function("window.__playable !== undefined", timeout=15000)

    if network in MRAID_NETWORKS:
        time.sleep(1.2)
        if page.evaluate("window.__playable.game.stateTime") > 0:
            problems.append("started before the ad was viewable")
        page.evaluate("window.__fireViewable(true)")
    if not wait_true(page, "window.__playable.game.stateTime > 0.3", 8):
        problems.append(f"the game never started (state {state(page)})")
    if shots:
        page.screenshot(path=str(shots / f"{tag}_1_start.png"))

    if page.evaluate("window.__audioContexts") != 0:
        problems.append("AudioContext created before the first touch")

    # First tap lands on PLAY NOW: it must not reach the store.
    cta_box = page.evaluate("window.__playable.game.ctaPoint()")
    page.mouse.click(cta_box["x"], cta_box["y"])
    time.sleep(0.2)
    store_calls = [c for c in page.evaluate("window.__calls") if c == EXPECTED_CTA[network]]
    if store_calls:
        problems.append("first tap opened the store")

    problems += PLAY[demo](page, network, viewport, shots, tag)

    if external:
        problems.append(f"external requests: {external}")
    if errors:
        problems.append(f"console errors: {errors[:3]}")
    page.close()
    return problems


G = "window.__playable.game"


def pick_card(page: Page, demo: str, viewport: dict, index: int) -> None:
    """Taps card `index` of the three on the upgrade screen (same layout maths as the games' ui.ts)."""
    w, h = viewport["width"], viewport["height"]
    portrait = h >= w
    if demo == "siege":
        scale = min(1, (w - 24) / 528, h * 0.62 / 300)
        y = h * (0.48 if portrait else 0.58)
    else:
        scale = min(1, (w - 24) / 528, h * 0.7 / 300)
        y = h * (0.48 if portrait else 0.56)
    # wait until the cards have dropped in: a loaded headless runner can go seconds between animation frames
    wait_true(page, f"{G}.ui.cards.children.filter(c => c.card).every(c => Math.abs(c.y - c.targetY) < 3)", 5)
    page.mouse.click(w / 2 + (index - 1) * 176 * scale, y)


def finish(page: Page, network: str, viewport: dict, shots: Path | None, tag: str) -> list[str]:
    """Runs game time to the end card, then taps it: the store call must be the network's own."""
    problems: list[str] = []
    page.evaluate(f"{G}.pause()")
    end = time.time() + 90
    while time.time() < end and state(page) != "end":
        if state(page) == "pick":
            time.sleep(0.3)
        else:
            page.evaluate(f"{G}.fastForward(2)")
    if state(page) != "end":
        problems.append(f"no end card (state {state(page)})")
        return problems
    time.sleep(0.8)
    page.evaluate(f"{G}.fastForward(0.2)")
    if shots:
        page.screenshot(path=str(shots / f"{tag}_4_end.png"))
    page.mouse.click(viewport["width"] / 2, viewport["height"] * 0.86)
    time.sleep(0.2)
    calls = page.evaluate("window.__calls")
    if EXPECTED_CTA[network] not in calls:
        problems.append(f"end card tap did not call {EXPECTED_CTA[network]} (calls {calls})")
    if network == "mintegral" and ("gameReady" not in calls or "gameEnd" not in calls):
        problems.append(f"Mintegral hooks missing (calls {calls})")
    return problems


def play_mechrush(page: Page, network: str, viewport: dict, shots: Path | None, tag: str) -> list[str]:
    problems: list[str] = []
    # hold the squad and drag it to the right: the squad must follow the finger
    # (two tries: on a loaded runner the first touch can land while the intro camera is still moving)
    for _ in range(2):
        p = page.evaluate(f"{G}.roadToScreen({G}.sim.x, {G}.sim.z)")
        target = page.evaluate(f"{G}.roadToScreen(2.5, {G}.sim.z)")
        page.mouse.move(p["x"], p["y"])
        page.mouse.down()
        for i in range(1, 9):
            page.mouse.move(p["x"] + (target["x"] - p["x"]) * i / 8, p["y"])
        page.evaluate(f"{G}.fastForward(0.6)")
        page.mouse.up()
        x = page.evaluate(f"{G}.sim.x")
        if x >= 0.8:
            break
    if x < 0.8:
        problems.append(f"dragging did not steer the squad (x {x:.2f})")
    if page.evaluate("window.__audioContexts") != 1:
        problems.append("no AudioContext after the first touch")
    if shots:
        page.screenshot(path=str(shots / f"{tag}_2_run.png"))
    page.evaluate(f"{G}.pause()")
    end = time.time() + 60
    while time.time() < end and state(page) not in ("pick", "end"):
        page.evaluate(f"{G}.fastForward(1)")
    if state(page) != "pick":
        problems.append(f"no upgrade cards (state {state(page)})")
        return problems
    pick_card(page, "mechrush", viewport, 2)
    if not wait_true(page, f"{G}.picks.length > 0", 4):
        pick_card(page, "mechrush", viewport, 2)  # one retry: a frame that lands late on a loaded runner
    if not wait_true(page, f"{G}.picks.length > 0", 4):
        problems.append("a tap on a card did not pick it")
    elif page.evaluate(f"{G}.picks[0]") != "rockets":
        problems.append(f"tapped the third card, got {page.evaluate(f'{G}.picks[0]')}")
    return problems + finish(page, network, viewport, shots, tag)


def play_siege(page: Page, network: str, viewport: dict, shots: Path | None, tag: str) -> list[str]:
    problems: list[str] = []
    # drag the first unit onto its twin: they must merge into one level-2 unit
    a = page.evaluate(f"{G}.cellToScreen(0)")
    b = page.evaluate(f"{G}.cellToScreen(1)")
    page.mouse.move(a["x"], a["y"])
    page.mouse.down()
    for i in range(1, 9):
        page.mouse.move(a["x"] + (b["x"] - a["x"]) * i / 8, a["y"] + (b["y"] - a["y"]) * i / 8)
    page.mouse.up()
    levels = page.evaluate(f"{G}.sim.board.map(u => u ? u.level : 0)")
    if levels[:2] != [0, 2]:
        problems.append(f"dragging a unit onto its twin did not merge them (board {levels})")
    if page.evaluate("window.__audioContexts") != 1:
        problems.append("no AudioContext after the first touch")
    # the summon button buys a level-1 unit (coins can't be compared: kills pay out while the game runs)
    sp = page.evaluate(f"{G}.summonPoint()")
    page.mouse.click(sp["x"], sp["y"])
    if not wait_true(page, f"{G}.sim.summons === 1 && {G}.sim.board.filter(u => u).length === 2", 3):
        problems.append("the summon button did not buy a unit")
    page.evaluate(f"{G}.fastForward(0.4)")
    if shots:
        page.screenshot(path=str(shots / f"{tag}_2_board.png"))
    page.evaluate(f"{G}.pause()")
    end = time.time() + 60
    while time.time() < end and state(page) not in ("pick", "end"):
        page.evaluate(f"{G}.fastForward(1)")
    if state(page) != "pick":
        problems.append(f"no element cards (state {state(page)})")
        return problems
    pick_card(page, "siege", viewport, 0)
    if not wait_true(page, f"{G}.sim.element !== null", 4):
        pick_card(page, "siege", viewport, 0)
    if not wait_true(page, f"{G}.sim.element !== null", 4):
        problems.append("a tap on a card did not pick it")
    elif page.evaluate(f"{G}.sim.element") != "water":
        problems.append(f"tapped the first card, got {page.evaluate(f'{G}.sim.element')}")
    return problems + finish(page, network, viewport, shots, tag)


PLAY = {"mechrush": play_mechrush, "siege": play_siege}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", nargs="*", default=["mechrush", "siege"])
    ap.add_argument("--shots", type=Path)
    args = ap.parse_args()
    if args.shots:
        args.shots.mkdir(parents=True, exist_ok=True)
    jobs = [("a", n) for n in EXPECTED_CTA] + [("b", "applovin"), ("c", "applovin")]
    failed = 0
    total = 0
    with sync_playwright() as p, tempfile.TemporaryDirectory() as tmp:
        browser = p.chromium.launch(args=["--force-color-profile=srgb", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        for demo, variant, network in [(d, v, n) for d in args.demo for v, n in jobs]:
            entry = entry_for(DIST / demo / variant / network, Path(tmp) / demo)
            for orient, vp in (("portrait", {"width": 390, "height": 844}), ("landscape", {"width": 844, "height": 390})):
                if orient == "landscape" and not (variant == "a" and network in ("applovin", "google")):
                    continue
                tag = f"{demo}_{variant}_{network}_{orient}"
                problems = check_build(browser, demo, network, entry, vp, args.shots, tag)
                total += 1
                status = "ok" if not problems else "FAIL"
                failed += bool(problems)
                print(f"{status:4s} {tag}" + ("" if not problems else "\n     " + "\n     ".join(problems)))
        browser.close()
    print(f"\n{total - failed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
