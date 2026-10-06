import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module used by the Node build script
import { NETWORKS, packageFor, stampHtml } from "../build/networks.mjs";

const HTML = "<!doctype html><html><head><title>x</title></head><body><canvas></canvas></body></html>";

describe("network packaging", () => {
  it("stamps every build with its network", () => {
    for (const network of Object.keys(NETWORKS)) {
      expect(stampHtml(HTML, network)).toContain(`<meta name="playable-network" content="${network}">`);
    }
  });

  it("adds mraid.js only where the SDK provides MRAID", () => {
    for (const network of ["applovin", "unity", "liftoff"]) expect(stampHtml(HTML, network)).toContain('src="mraid.js"');
    for (const network of ["google", "meta", "moloco", "mintegral", "tiktok"]) expect(stampHtml(HTML, network)).not.toContain("mraid.js");
  });

  it("gives Google its orientation meta and exit API", () => {
    const html = stampHtml(HTML, "google");
    expect(html).toContain('<meta name="ad.orientation" content="portrait,landscape">');
    expect(html).toContain("exitapi.js");
  });

  it("puts the TikTok SDK at the end of the body", () => {
    const html = stampHtml(HTML, "tiktok");
    expect(html.indexOf("playable-sdk.js")).toBeGreaterThan(html.indexOf("<canvas>"));
    expect(html.indexOf("playable-sdk.js")).toBeLessThan(html.indexOf("</body>"));
  });

  it("ships a single HTML to AppLovin, Unity, Liftoff, Meta and Moloco", () => {
    for (const network of ["applovin", "unity", "liftoff", "meta", "moloco"]) {
      const [file] = packageFor(network, stampHtml(HTML, network), "stealth_a");
      expect(file.name).toBe("index.html");
    }
  });

  it("zips TikTok with index.html and config.json at the top level", () => {
    const [file] = packageFor("tiktok", stampHtml(HTML, "tiktok"), "stealth_a");
    const files = unzipSync(file.bytes);
    expect(Object.keys(files).sort()).toEqual(["config.json", "index.html"]);
    expect(JSON.parse(strFromU8(files["config.json"])).playable_orientation).toBe(0);
  });

  it("names Mintegral's archive, folder and HTML the same", () => {
    const [file] = packageFor("mintegral", stampHtml(HTML, "mintegral"), "stealth_a");
    expect(file.name).toBe("stealth_a.zip");
    const entries = Object.keys(unzipSync(file.bytes)).filter((n) => !n.endsWith("/"));
    expect(entries).toEqual(["stealth_a/stealth_a.html"]);
  });

  it("zips Google with index.html", () => {
    const [file] = packageFor("google", stampHtml(HTML, "google"), "stealth_a");
    expect(Object.keys(unzipSync(file.bytes))).toEqual(["index.html"]);
  });
});
