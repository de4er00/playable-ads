// Per-network packaging rules, from each network's spec (see docs/networks.md for sources).
import { strToU8, zipSync } from "fflate";

export const BUDGET = 2 * 1024 * 1024; // Meta's single-HTML limit, the strictest of the eight

const MRAID = '<script src="mraid.js"></script>';
const GOOGLE_EXIT = '<script type="text/javascript" src="https://tpc.googlesyndication.com/pagead/gadgets/html5/api/exitapi.js"></script>';
const GOOGLE_ORIENTATION = '<meta name="ad.orientation" content="portrait,landscape">';
const TIKTOK_SDK = '<script src="https://sf16-muse-va.ibytedtos.com/obj/union-fe-nc-i18n/playable/sdk/playable-sdk.js"></script>';

export const NETWORKS = {
  applovin: { pack: "html", cta: "mraid.open(url)", head: [MRAID] },
  unity: { pack: "html", cta: "mraid.open(url)", head: [MRAID] },
  liftoff: { pack: "html", cta: "Liftoff.open()", head: [MRAID] },
  google: { pack: "zip", cta: "ExitApi.exit()", head: [GOOGLE_ORIENTATION, GOOGLE_EXIT] },
  meta: { pack: "html", cta: "FbPlayableAd.onCTAClick()", head: [] },
  moloco: { pack: "html", cta: "FbPlayableAd.onCTAClick()", head: [] },
  mintegral: { pack: "zip", cta: "window.install()", head: [] },
  tiktok: { pack: "zip", cta: "window.openAppStore()", head: [], bodyEnd: [TIKTOK_SDK] },
};

/** Stamp the network into a built single-file HTML. */
export function stampHtml(html, network) {
  const spec = NETWORKS[network];
  if (!spec) throw new Error(`unknown network ${network}`);
  const head = [`<meta name="playable-network" content="${network}">`, ...spec.head].join("\n");
  let out = html.replace(/<head>/i, `<head>\n${head}`);
  if (spec.bodyEnd) out = out.replace(/<\/body>/i, `${spec.bodyEnd.join("\n")}\n</body>`);
  return out;
}

/**
 * Turn the stamped HTML into the files a network accepts.
 * Returns [{ name, bytes }] where name is the file to upload.
 */
export function packageFor(network, html, name) {
  const spec = NETWORKS[network];
  const page = strToU8(html);
  if (spec.pack === "html") return [{ name: "index.html", bytes: page }];
  if (network === "mintegral") {
    // Mintegral wants the archive, the folder inside it and the HTML to share one name.
    return [{ name: `${name}.zip`, bytes: zipSync({ [name]: { [`${name}.html`]: page } }, { level: 9 }) }];
  }
  const files = { "index.html": page };
  if (network === "tiktok") files["config.json"] = strToU8(JSON.stringify({ playable_orientation: 0, playable_languages: ["en"] }));
  return [{ name: `${name}.zip`, bytes: zipSync(files, { level: 9 }) }];
}
