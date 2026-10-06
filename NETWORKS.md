# Network rules used by the build

Checked in October 2026. Each line is what `build/networks.mjs` and `kit/` do, and where the rule comes from.

| Network | What the build does | Source |
|---|---|---|
| AppLovin | One HTML with everything inline, `mraid.js`, store via `mraid.open()`. Waits for `ready`. No sound before the first touch. The first tap never opens the store. Portrait and landscape. 5 MB limit. | AppLovin playable creative specs (support.applovin.com) |
| Unity Ads | One minified `index.html`, MRAID 3.0 provided by the webview, `mraid.open()`. Does not start before `viewableChange`. No automatic store redirect. Both orientations. Under 5 MB. | docs.unity.com, "Playable technical specifications" |
| Liftoff (Vungle) | One HTML, MRAID supported, `Liftoff.open()` or `mraid.open()`. Checks `isViewable()` after ready, with a fallback if `viewableChange` never arrives. No own close button; the top corners are kept free. | docs.liftoff.io, Interactive API integration |
| Google Ads (App campaigns) | ZIP with `index.html`, `exitapi.js` from tpc.googlesyndication.com, `ExitApi.exit()`, `<meta name="ad.orientation" content="portrait,landscape">`. Relative paths only. 5 MB, 512 files max. | support.google.com/google-ads/answer/9981650 |
| Meta | One HTML up to 2 MB (a ZIP may be 5 MB), `FbPlayableAd.onCTAClick()`, no JS redirects. | developers.facebook.com/docs/app-ads/formats/playable-ad |
| Moloco | One HTML, `FbPlayableAd.onCTAClick()`, no `mraid.js`, everything as data URIs. | Moloco help centre, via a Segwise summary (the official page returned 403) |
| Mintegral | HTML or ZIP; inside the ZIP the archive, folder and HTML share a name. `window.install()`, plus `gameReady()` and `gameEnd()`. No own close button or loading screen. 5 MB. | PlayTurbo docs (doc.playturbo.com), Segwise summary |
| TikTok / Pangle | ZIP with `index.html` and `config.json` (`playable_orientation`: 0 = any) at the top level. The playable SDK script goes at the end of the body before the game's script. `window.openAppStore()`. No `mraid.js`, no HTTP requests. 5 MB after compression. | ads.tiktok.com/help/article/playable-ads |
| ironSource | Not built: ironSource Ads demand closed on 30.04.2026 and moved to Unity Vector. | unity.com/products/ironsource-ads-sunset |

Before a real campaign, re-check two things: the TikTok SDK URL casing in the TikTok playable tool, and Moloco's limit in the Moloco dashboard (sources disagree between 2 MB and 5 MB for a single HTML).
