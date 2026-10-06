# Playable ads

Two playable ads built as a portfolio. One is a 2D stealth level on PixiJS, the other a 3D tank arena on Three.js. There are no image, model or audio files: every shape, mesh and sound is generated in code.

Live page with both demos in a phone frame, variant and network switches and a QR code for your phone: **https://de4er00.github.io/playable-ads/**

- **Build:** one command turns each demo into three A/B variants for eight ad networks (48 files). Every file is checked against a 2 MB budget, Meta's single-HTML limit and the strictest of the eight.
- **Test:** a headless test plays every network build against that network's SDK stub, with all external requests blocked.

| | Single HTML | ZIP (Google, Mintegral, TikTok) |
|---|---|---|
| Shadow Step (PixiJS) | 576 KB | 175 KB |
| Tank Rush (Three.js) | 577 KB | 153 KB |

## The two demos

### Shadow Step (2D, PixiJS v8)

Drag a path with your finger and the hero follows it. A straight line walks into the guard's flashlight: a "!" pops up, the screen shakes, and the hand shows the route behind the crates. That route reaches the guard's back. Then come the takedown and the coins, and an end card.

The fail is honest. A player who finds the route behind the crates on the first try wins straight away.

- **Flashlight.** The cone is a ray-cast visibility polygon: 64 rays clipped by the crates and walls. The same polygon is drawn and used for detection, so the player never sees light that does not count, and never gets caught outside it (`demos/stealth/src/level.ts`).
- **Characters.** They are assembled from shapes. Feet step by distance walked, and the hero's headband tails are short spring chains.
- **Variants:**
  - `a`: camera sweep in, Level 2 card;
  - `b`: no intro, the hand is shown from the first frame, gear card;
  - `c`: faster sweep and longer reach.

### Tank Rush (3D, Three.js)

Hold and drag to aim; the tank fires every 0.4 s while the finger is down.
- **Order of play.** Crates screen each enemy and break first. Three tanks go down, then the bunker blows and the end card follows.
- **Enemy fire.** Enemies hold fire until the player's first shot, so the ad does not play itself while it waits. Their shells can hit the player, but the ad never ends in a loss.

How it is built:
- **Rules.** Gameplay lives in a plain simulation with no Three.js inside (`demos/tanks/src/sim.ts`). The renderer only reads its state and turns its events into effects, which is why the rules are unit-tested without a browser.
- **Models.** Boxes, cylinders and an extruded rounded hull, with an inverted-hull outline and blob shadows instead of shadow maps.
- **Camera.** The angle is fixed. On every resize a small solver finds the distance and target that fit the arena between the HUD bands. One scene works from a tall phone to a tablet in landscape.
- **Variants:**
  - `a`: fly-in camera;
  - `b`: no intro, "double barrel" upgrade card;
  - `c`: tougher, faster-firing enemies.

## Build and test

```
npm ci
npm run build:all     # dist/<demo>/<variant>/<network>/ + dist/report.md
npm run site          # the GitHub Pages site in docs/
npm test              # 54 unit tests (vitest)
python tools/e2e.py   # plays every network build (needs: pip install playwright)
```

The game is compiled once per variant. A network differs only in what is stamped into the HTML and in how it is packaged (`build/networks.mjs`), so the full build of 48 files takes a few seconds.

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

Both demos sit on `kit/`, which handles what networks reject builds for:

- **`boot`.**
  - Without MRAID the game starts at once.
  - With MRAID it waits for `ready`, then for `isViewable()` or `viewableChange(true)`, with a 2 s fallback for SDKs that never send it.
  - It pauses the game and the audio when the ad is hidden.
- **`cta`.**
  - One `open()` that calls the network's own store function, and never `window.open`.
  - It does nothing until the player has touched the game, because a first tap that goes to the store is grounds for rejection. A first tap on PLAY NOW only arms the button.
- **`audio`.** Sounds are synthesised with WebAudio. The `AudioContext` is not created before the first touch.
- **`layout`.** One world placed for portrait and landscape. The 50×50 px top corners are kept empty for the network's close button.
- **`fps`.** Add `?fps` to any build for a frame-rate and slow-frame overlay on a real device.

## What the end-to-end test checks

`tools/e2e.py` opens each network build headless with a stub of that network's SDK and blocks every request except the network's own script. It runs 24 cases: all eight networks for variant `a`, variants `b` and `c` on AppLovin, and landscape on two networks. Each case checks that:
- the game does not start before the ad is viewable;
- there is no `AudioContext` before the first touch;
- a first tap on PLAY NOW does not reach the store;
- in Shadow Step, a straight path gets spotted and the route behind the crates finishes the level;
- in Tank Rush, holding fire on each enemy destroys all three;
- the end card calls the right store function, plus Mintegral's `gameReady` and `gameEnd`;
- there are no console errors and no external requests.

## How it was made

TypeScript, Vite with vite-plugin-singlefile, PixiJS 8, Three.js r186, vitest, fflate, and Playwright for the end-to-end checks.

I wrote the code together with Claude Code as the coding agent. The game design, the level and arena layouts, the network rules and the tests are mine. The agent wrote much of the rendering code under my review.

Both games are concepts made for this portfolio. The names and store links are placeholders.

MIT license.
