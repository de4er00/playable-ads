// npm run build:all — every demo x every variant x every network, plus a preview build for the site.
// The game is compiled once per variant; networks only differ in the HTML stamp and the packaging.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { BUDGET, NETWORKS, packageFor, stampHtml } from "./networks.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv.slice(2);
const demos = ["mechrush", "siege"].filter((d) => existsSync(join(root, "demos", d, "src", "main.ts")) && (!only.length || only.includes(d)));

async function compile(demo, variantId) {
  const outDir = join(root, ".vite", `${demo}-${variantId ?? "preview"}`);
  await build({
    root: join(root, "demos", demo),
    configFile: false,
    logLevel: "warn",
    define: variantId ? { __VARIANT_ID__: JSON.stringify(variantId) } : {},
    plugins: [viteSingleFile({ removeViteModuleLoader: true })],
    build: { outDir, emptyOutDir: true, assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 4096, reportCompressedSize: false },
  });
  return readFileSync(join(outDir, "index.html"), "utf8");
}

const rows = [];
const failures = [];
rmSync(join(root, "dist"), { recursive: true, force: true });

for (const demo of demos) {
  const variants = Object.keys(JSON.parse(readFileSync(join(root, "demos", demo, "variants.json"), "utf8")));
  const preview = await compile(demo, null);
  const previewDir = join(root, "dist", "site", demo);
  mkdirSync(previewDir, { recursive: true });
  writeFileSync(join(previewDir, "index.html"), preview);

  for (const variant of variants) {
    const html = await compile(demo, variant);
    for (const network of Object.keys(NETWORKS)) {
      const name = `${demo}_${variant}_${network}`;
      const dir = join(root, "dist", demo, variant, network);
      mkdirSync(dir, { recursive: true });
      for (const file of packageFor(network, stampHtml(html, network), name)) {
        writeFileSync(join(dir, file.name), file.bytes);
        const size = file.bytes.length;
        rows.push({ demo, variant, network, file: file.name, size, cta: NETWORKS[network].cta });
        if (size > BUDGET) failures.push(`${demo}/${variant}/${network}/${file.name}: ${(size / 1024).toFixed(0)} KB > ${(BUDGET / 1024).toFixed(0)} KB`);
      }
    }
    console.log(`${demo} ${variant}: ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB single HTML`);
  }
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const report = [
  "| demo | variant | network | file | size | CTA |",
  "|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.demo} | ${r.variant} | ${r.network} | ${r.file} | ${kb(r.size)} | \`${r.cta}\` |`),
].join("\n");
writeFileSync(join(root, "dist", "report.json"), JSON.stringify(rows, null, 1));
writeFileSync(join(root, "dist", "report.md"), `# Build report\n\nBudget: ${kb(BUDGET)} per file (Meta's single-HTML limit).\n\n${report}\n`);
console.log(`\n${rows.length} files, largest ${kb(Math.max(...rows.map((r) => r.size)))}. Report: dist/report.md`);
if (failures.length) {
  console.error(`\nOver budget:\n${failures.join("\n")}`);
  process.exit(1);
}
