// esbuild.js — bundles the extension and copies webview assets.
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** Copy static webview assets (html/css/js are authored as plain files under src/webview/assets). */
function copyWebviewAssets() {
  const srcDir = path.join(__dirname, "src", "webview", "assets");
  const outDir = path.join(__dirname, "dist", "webview");
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(outDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    fs.copyFileSync(path.join(srcDir, file), path.join(outDir, file));
  }
}

const copyPlugin = {
  name: "copy-webview-assets",
  setup(build) {
    build.onEnd(() => {
      copyWebviewAssets();
      console.log("[esbuild] webview assets copied");
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    target: "node18",
    outfile: "dist/extension.js",
    external: ["vscode"],
    logLevel: "info",
    plugins: [copyPlugin],
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
