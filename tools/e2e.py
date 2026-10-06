"""Play every network build headless against that network's stub SDK and check the rules networks enforce.

    python tools/e2e.py              # all networks, variant a, plus variants b and c on AppLovin
    python tools/e2e.py --shots DIR  # also save screenshots of key moments

Checks per build: no request leaves the file except the network's own SDK script; the game does not start
before the ad is viewable (MRAID networks); no AudioContext before the first touch; the first tap does not
open the store; a straight path gets spotted; the route behind the crates reaches the end card; the CTA
calls the network's function; no console errors; both orientations render.
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


def screen_of(page: Page, x: float, y: float) -> tuple[float, float]:
    p = page.evaluate(f"window.__playable.game.worldToScreen({{x: {x}, y: {y}}})")
    return p["x"], p["y"]


def drag(page: Page, route: list[tuple[float, float]], steps: int = 6) -> None:
    pts = [screen_of(page, x, y) for x, y in route]
    page.mouse.move(*pts[0])
    page.mouse.down()
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        for i in range(1, steps + 1):
            page.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps)
    page.mouse.up()


def state(page: Page) -> str:
    return page.evaluate("window.__playable.game.state")


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
        if page.evaluate("window.__playable.game.state") != "intro" or page.evaluate("window.__playable.game.stateTime") > 0:
            problems.append("started before the ad was viewable")
        page.evaluate("window.__fireViewable(true)")
    if not wait_state(page, READY[demo], 6):
        problems.append(f"never reached the first input (state {state(page)})")
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


def play_stealth(page: Page, network: str, viewport: dict, shots: Path | None, tag: str) -> list[str]:
    problems: list[str] = []
    # Straight up the middle: the flashlight must catch it.
    drag(page, [(360, 860), (370, 600), (400, 420)])
    if not wait_state(page, "spotted", 5):
        problems.append(f"straight path was not spotted (state {state(page)})")
    elif shots:
        time.sleep(0.25)
        page.screenshot(path=str(shots / f"{tag}_2_spotted.png"))
    if page.evaluate("window.__audioContexts") != 1:
        problems.append("no AudioContext after the first touch")
    if not wait_state(page, "await", 4):
        problems.append("did not return to input after being spotted")
    if shots:
        time.sleep(1.2)
        page.screenshot(path=str(shots / f"{tag}_3_hint.png"))

    route_pts = page.evaluate("window.__playable.route")
    drag(page, [(p["x"], p["y"]) for p in route_pts], steps=8)
    if not wait_state(page, "end", 12):
        problems.append(f"route behind the crates did not finish the level (state {state(page)})")
    else:
        time.sleep(0.6)
        if shots:
            page.screenshot(path=str(shots / f"{tag}_4_end.png"))
        page.mouse.click(viewport["width"] / 2, viewport["height"] / 2)
        time.sleep(0.2)
        calls = page.evaluate("window.__calls")
        if EXPECTED_CTA[network] not in calls:
            problems.append(f"end card tap did not call {EXPECTED_CTA[network]} (calls {calls})")
        if network == "mintegral" and ("gameReady" not in calls or "gameEnd" not in calls):
            problems.append(f"Mintegral hooks missing (calls {calls})")

    return problems


def play_tanks(page: Page, network: str, viewport: dict, shots: Path | None, tag: str) -> list[str]:
    problems: list[str] = []
    for i in range(3):
        end = time.time() + 10
        while time.time() < end and page.evaluate(f"window.__playable.game.enemyAlive({i})"):
            p = page.evaluate(f"window.__playable.game.enemyScreen({i})")
            page.mouse.move(p["x"], p["y"])
            page.mouse.down()
            time.sleep(0.3)
        page.mouse.up()
        if page.evaluate(f"window.__playable.game.enemyAlive({i})"):
            problems.append(f"enemy {i} survived 10 s of fire")
        if i == 0 and shots:
            page.screenshot(path=str(shots / f"{tag}_2_fight.png"))
    if page.evaluate("window.__audioContexts") != 1:
        problems.append("no AudioContext after the first touch")
    if not wait_state(page, "end", 6):
        problems.append(f"no end card after the last enemy (state {state(page)})")
        return problems
    time.sleep(0.6)
    if shots:
        page.screenshot(path=str(shots / f"{tag}_4_end.png"))
    page.mouse.click(viewport["width"] / 2, viewport["height"] / 2)
    time.sleep(0.2)
    calls = page.evaluate("window.__calls")
    if EXPECTED_CTA[network] not in calls:
        problems.append(f"end card tap did not call {EXPECTED_CTA[network]} (calls {calls})")
    if network == "mintegral" and ("gameReady" not in calls or "gameEnd" not in calls):
        problems.append(f"Mintegral hooks missing (calls {calls})")
    return problems


READY = {"stealth": "await", "tanks": "play"}
PLAY = {"stealth": play_stealth, "tanks": play_tanks}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", nargs="*", default=["stealth", "tanks"])
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
