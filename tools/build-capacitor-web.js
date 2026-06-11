const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "dist");

const entries = [
  "_headers",
  "app.js",
  "index.html",
  "manifest.webmanifest",
  "styles.css",
  "sw.js",
  "data",
  "icons"
];

function copyRecursive(source, target) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const child of fs.readdirSync(source)) {
      copyRecursive(path.join(source, child), path.join(target, child));
    }
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const entry of entries) {
  const source = path.join(root, entry);
  if (!fs.existsSync(source)) continue;
  copyRecursive(source, path.join(outDir, entry));
}

console.log(`Built Capacitor web assets in ${outDir}`);
