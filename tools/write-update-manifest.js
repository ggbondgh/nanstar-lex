const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const releaseDir = path.join(root, "release");
const repository = process.env.GITHUB_REPOSITORY || "ggbondgh/nanstar-lex";
const versionCode = Number(process.env.ANDROID_VERSION_CODE || 1);
const versionName = process.env.ANDROID_VERSION_NAME || "0.1.0";
const apkUrl = `https://github.com/${repository}/releases/latest/download/nanstar-lex.apk`;

const manifest = {
  app: "NanStar Lex",
  platform: "android",
  packageName: "com.zncosmos.nanstarlex",
  versionCode,
  versionName,
  apkUrl,
  releaseUrl: `https://github.com/${repository}/releases/latest`,
  commit: process.env.GITHUB_SHA || "",
  releasedAt: new Date().toISOString()
};

fs.mkdirSync(releaseDir, { recursive: true });
fs.writeFileSync(path.join(releaseDir, "update.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote update manifest for ${versionName} (${versionCode})`);
