// npm run site — the GitHub Pages site in docs/: the portfolio page plus a preview build of each demo.
// Run after build:all, which produces the previews and dist/report.json.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = process.env.PAGES_URL || "https://de4er00.github.io/playable-ads/";
const REPO = process.env.REPO_URL || "https://github.com/de4er00/playable-ads";

const DEMOS = [
  {
    id: "stealth",
    title: "Shadow Step: 2D stealth (PixiJS)",
    sub: "Draw a path with your finger. A straight line walks into the flashlight; the route behind the crates gets you to the guard's back. The cone is a ray-cast polygon, and the same polygon decides whether you are seen.",
    variants: { a: "camera sweep, Level 2 card", b: "hand from frame one, gear card", c: "faster sweep, longer reach" },
  },
  {
    id: "tanks",
    title: "Tank Rush: 3D arena (Three.js)",
    sub: "Hold and drag to aim; the tank fires on its own. Crates break first, then three tanks, then the bunker. Models are boxes, cylinders and an extruded hull with an inverted-hull outline, built at load time.",
    variants: { a: "fly-in camera, Level 2 card", b: "no fly-in, double barrel card", c: "tougher enemies, faster fire" },
  },
];
const NETWORKS = ["applovin", "unity", "liftoff", "google", "meta", "moloco", "mintegral", "tiktok"];

const report = JSON.parse(readFileSync(join(root, "dist", "report.json"), "utf8"));
const out = join(root, "docs");
mkdirSync(out, { recursive: true });

let demosHtml = "";
for (const d of DEMOS) {
  const preview = join(root, "dist", "site", d.id, "index.html");
  if (!existsSync(preview)) continue;
  mkdirSync(join(out, d.id), { recursive: true });
  copyFileSync(preview, join(out, d.id, "index.html"));
  const qr = await QRCode.toString(`${PAGES}${d.id}/`, { type: "svg", margin: 1, color: { dark: "#17131f", light: "#ffffff" } });
  demosHtml += `
    <section class="demo-wrap">
      <h2>${d.title}</h2>
      <p class="sub">${d.sub}</p>
      <div class="demo" data-demo="${d.id}">
        <div class="phone"><iframe title="${d.title}" allow="autoplay"></iframe></div>
        <div class="controls">
          <a class="mobile-play" href="${d.id}/">Play full screen</a>
          <div class="row"><b>Variant</b>${Object.entries(d.variants)
            .map(([k, v], i) => `<button data-v="${k}"${i === 0 ? ' class="on"' : ""} title="${v}">${k.toUpperCase()}: ${v}</button>`)
            .join("")}</div>
          <div class="row"><b>Network</b><select>${NETWORKS.map((n) => `<option>${n}</option>`).join("")}</select>
            <button data-rotate>Rotate</button><button data-restart>Restart</button></div>
          <div class="log"></div>
          <table><thead><tr><th>Network</th><th>File</th><th>Size</th><th>Store call</th></tr></thead><tbody></tbody></table>
          <div class="qr">${qr}<span>Open on a phone: the playable runs full screen there.<br/>Add <code>?fps</code> to the address for a frame-rate overlay.</span></div>
        </div>
      </div>
    </section>`;
}

const page = readFileSync(join(root, "site", "index.html"), "utf8")
  .replace("__DEMOS__", demosHtml)
  .replace("__REPO__", REPO)
  .replace("__SIZES__", JSON.stringify(report.map(({ demo, variant, network, file, size, cta }) => ({ demo, variant, network, file, size, cta }))));
writeFileSync(join(out, "index.html"), page);
writeFileSync(join(out, ".nojekyll"), "");
console.log(`site written to docs/ (${DEMOS.length} demos), QR codes point to ${PAGES}`);
