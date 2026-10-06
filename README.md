# Playable ads

Two playable ads in the market language of 2026, built as a portfolio. Mech Rush is a squad runner with number gates, a pick-one-of-three upgrade and a boss. Spiral Siege is a merge tower defense against a snake horde crawling a spiral. Both are 3D on Three.js with a PixiJS layer for the HUD, cards and numbers. There are no image, model or audio files: every mesh, texture and sound is generated in code.

Live page with both demos in a phone frame, variant and network switches and a QR code for your phone: **https://de4er00.github.io/playable-ads/**

- **Build:** one command turns each demo into three A/B variants for eight ad networks (48 files). Every file is checked against a 2 MB budget, Meta's single-HTML limit and the strictest of the eight.
- **Test:** 60 unit tests on the game rules, and a headless test that plays every network build against that network's SDK stub with all external requests blocked.

| | Single HTML | ZIP (Google, Mintegral, TikTok) |
|---|---|---|
| Mech Rush | 1.19 MB | 338 KB |
| Spiral Siege | 1.18 MB | 334 KB |

## The two demos

### Mech Rush (squad runner)

Drag to steer a squad of mini mechs along a bridge over a canyon. Number gates add, multiply or subtract the squad; drone hordes and a barricade eat into it; a card screen offers one of three upgrades (twin barrel, rocket pod, shield drone); then a boss mech slams the squad while it shoots back.

- **Rules apart from rendering.** The whole run is a plain simulation (`demos/mechrush/src/sim.ts`), unit-tested without a browser.
- **The ending is designed, not left to luck.** When the boss appears, its health is set from the damage the squad can still deal. Variant `a` always wins narrowly; variant `b` always loses with the boss under 25%, for a "so close" fail ending. Tests check both for every upgrade card.
- **Crowds.** Up to 90 mechs and 60 drones are instanced meshes with merged vertex-coloured parts: a handful of draw calls.
- **Cameras.** The boss shot and the landscape framing are solved numerically against the HUD, so nothing hides under the logo or the button on any screen.
- **Variants:**
  - `a`: fly-in hook, narrow win;
  - `b`: the boss survives, "so close" end card;
  - `c`: no intro, the first gates come sooner.

### Spiral Siege (merge tower defense)

A spiked red snake crawls out of a portal and coils round a spiral road toward the tower. Mages on a 3×2 board shoot it. Drag a mage onto its twin and they merge into the next level; kills pay coins for Summon; tower level 2 offers an element (frost slows, chain bolt jumps, wildfire burns). Then the boss snake comes, and what is left of the first snake gets through and bites the tower.

- **Rules apart from rendering.** Path, snake, board, merges, coins, XP, elements and the boss are a plain simulation (`demos/siege/src/sim.ts`) with tests for active and idle play and every element.
- **Left alone, the ad plays itself.** After a moment without a touch, a hand shows the next merge or the summon button, then makes the move. An untouched ad still shows the whole game.
- **The snake.** Each segment follows the road by arc length and closes the gap a kill leaves; segments are instanced and slither, flash on hits and pop into debris and coins.
- **Variants:**
  - `a`: the snake starts at the portal, narrow win;
  - `b`: the boss reaches the tower, "so close" end card;
  - `c`: rush hook, the snake is halfway in from the first second.

## Build and test

```
npm ci
npm run build:all     # dist/<demo>/<variant>/<network>/ + dist/report.md
npm run site          # the GitHub Pages site in docs/
npm test              # 60 unit tests (vitest)
python tools/e2e.py   # plays every network build (needs: pip install playwright)
```

The game is compiled once per variant. A network differs only in what is stamped into the HTML and in how it is packaged (`build/networks.mjs`), so the full build of 48 files takes seconds.

For models there are stand pages next to each game (`demos/<demo>/stand.html`, run `npm run dev:siege` and open `/stand.html?view=units`): every model large under the game's lights, to judge it before it goes into the scene.

## Networks

| Network | Package | Store call | Extras |
|---|---|---|---|
| AppLovin | single HTML | `mraid.open(url)` | `mraid.js` |
| Unity | single HTML | `mraid.open(url)` | `mraid.js`, starts on `viewableChange` |
| Liftoff | single HTML | `Liftoff.open()`, falls back to `mraid.open` | `mraid.js` |
| Google Ads | ZIP | `ExitApi.exit()` | `exitapi.js`, `ad.orientation` meta |
| Meta | single HTML, 2 MB max | `FbPlayableAd.onCTAClick()` | |
| Moloco | single HTML | `FbPlayableAd.onCTAClick()` | no MRAID |
| Mintegral | ZIP, archive, folder and HTML share a name | `window.install()` | `gameReady()`, `gameEnd()` |
| TikTok | ZIP with `config.json` | `window.openAppStore()` | playable SDK script |

ironSource is not in the list: its ad demand closed on 30.04.2026 and moved to Unity. Sources for each rule are in [NETWORKS.md](NETWORKS.md).

## The kit

Both demos sit on `kit/`, which handles what networks reject builds for, plus what the two games share:

- **`boot`.**
  - Without MRAID the game starts at once.
  - With MRAID it waits for `ready`, then for `isViewable()` or `viewableChange(true)`, with a 2 s fallback for SDKs that never send it.
  - It pauses the game and the audio when the ad is hidden.
- **`cta`.**
  - One `open()` that calls the network's own store function, and never `window.open`.
  - It does nothing until the player has touched the game, because a first tap that goes to the store is grounds for rejection. A first tap on PLAY NOW only arms the button.
- **`audio`.** Sounds are synthesised with WebAudio. The `AudioContext` is not created before the first touch.
- **`lowpoly`.** Code-built models: parts placed and painted one colour each, merged per moving piece.
- **`hud`.** The PixiJS widgets: outlined text, glossy buttons, rarity cards.
- **`fps`.** Add `?fps` to any build for a frame-rate and slow-frame overlay on a real device.

## What the end-to-end test checks

`tools/e2e.py` opens each network build headless with a stub of that network's SDK and blocks every request except the network's own script. It runs 24 cases: all eight networks for variant `a` of both games, variants `b` and `c` on AppLovin, and landscape on two networks. Each case checks that:
- the game does not start before the ad is viewable;
- there is no `AudioContext` before the first touch;
- a first tap on PLAY NOW does not reach the store;
- the game answers real input: in Mech Rush dragging steers the squad, in Spiral Siege dragging a mage onto its twin merges them and Summon buys a unit;
- a tap on an upgrade card picks that card;
- the run reaches its end card, and a tap there calls the right store function, plus Mintegral's `gameReady` and `gameEnd`;
- there are no console errors and no external requests.

## How it was made

TypeScript, Vite with vite-plugin-singlefile, Three.js r186, PixiJS 8, vitest, fflate, and Playwright for the end-to-end checks.

I used Claude Code as a coding assistant. The game designs, the balance targets, the network rules, the tests and the code review are mine.

Both games are concepts made for this portfolio. The names and store links are placeholders.

MIT license.
