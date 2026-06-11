const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const androidDir = path.join(root, "android");
const command = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const args = ["assembleDebug"];

if (process.env.ANDROID_VERSION_CODE) {
  args.push(`-PversionCode=${process.env.ANDROID_VERSION_CODE}`);
}

if (process.env.ANDROID_VERSION_NAME) {
  args.push(`-PversionName=${process.env.ANDROID_VERSION_NAME}`);
}

const result = spawnSync(command, args, {
  cwd: androidDir,
  stdio: "inherit",
  shell: process.platform === "win32"
});

process.exit(result.status ?? 1);
