// 插件仓的构建。**这是插件仓自己的**，和源仓库（ari-crystal）那份不是一回事：
// 源仓库那份要产四样（原型 / 落回笔记的 / pdf 运行时 / 插件），
// 这一份只产两样：`main.js` 与 `styles.css`。
//
// ⚠️ 两个必须记住的约束：
//
//   1. **`obsidian` 和 electron 那一票必须 external**——它们由宿主提供，
//      打进来会在加载时报错。
//   2. **本仓的 `package.json` 里没有 `"type": "module"`，而且不能加。**
//      加了之后 Node 会把 `main.js` 当 ES module 加载，而它是 CommonJS
//      （`module.exports = ...`）——结果是一个**不报错**的空模块，
//      Obsidian 那边表现为「插件加载了但什么都没发生」。
//      所以这个配置文件叫 `.mjs`（显式 ESM），而不是 `.js`。

import esbuild from "esbuild";
import process from "node:process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { inlinePdfWorker } from "./inline-pdf-worker.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));

const banner = `/* Crystal Vault - built from https://github.com/runyao-zhang/crystal-vault */`;

const ctx = await esbuild.context({
  entryPoints: ["src/entry-plugin.js"],
  bundle: true,
  // Obsidian 用 CommonJS 加载 main.js。别改成 esm。
  format: "cjs",
  // 对齐 Obsidian 支持的最低 Electron，别按本机 Node 的版本写。
  target: "es2018",
  platform: "browser",
  logLevel: "info",
  sourcemap: process.argv.includes("--watch") ? "inline" : false,
  treeShaking: true,
  // ⚠️ **发布要压缩。** 官方插件守则里明写着「Do minimize `main.js` for releasing」。
  //
  // 而且源仓库那份（`scripts/build.mjs` 的插件目标）**本来就压**——两份构建
  // 各写各的，迟早会像这样分叉，而分叉的症状是「本地试的和用户下到的不是一回事」。
  // 第一版就是漏了这一行：2.05MB 变 2.72MB，而且源码原样躺在用户的插件目录里。
  minify: true,
  outfile: "main.js",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", "node:*"],
  // pdf.js 的 worker 要内联进来（`virtual:pdf-worker-src`），否则打包直接失败。
  plugins: [inlinePdfWorker(ROOT)],
  banner: { js: banner },
});

if (process.argv.includes("--watch")) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}

// styles.css —— 从源码里那份 CSS 导出来的，**不是手抄的第二份**。
// 手抄的代价是改了样式表忘了改它，而症状是「有一半样式对、另一半不对」。
const { default: css } = await import("./src/entry-styles.js");
writeFileSync("styles.css", css);
console.log("styles.css 写好了");
