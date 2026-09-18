// 把 pdf.js 的 worker 源码内联成一个 `export default "…"` 的虚拟模块。
//
// **两份构建脚本共用这一个文件**（源仓库的 `scripts/build.mjs` 与插件仓的
// `esbuild.config.mjs`）——`virtual:pdf-worker-src` 这个模块名是
// `src/entry-pdf-runtime.js` 写死的，两边各写一份 inliner 迟早会分叉，
// 而分叉的症状是「有一边打包失败」或者更糟：**打出一份 worker 版本对不上的产物**，
// 运行时炸一句「API version does not match Worker version」，里面一个字段名都没有。
//
// @param {string} root 仓库根目录（用来找 node_modules）。两份脚本的根不一样，
//   所以它是个参数，不在这个文件里写死。

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ⚠️ **legacy，不是 build。** 与 `src/entry-pdf-runtime.js` 里那句 import 必须是
 * 同一份构建：主包用 legacy、worker 用 build（或者反过来）会炸上面说的那句
 * 「API version does not match」。两处都写死 legacy，**别改成能配的**。
 */
const WORKER_REL = "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs";

/** 每片多长。见下面那段「为什么要切片」。 */
const CHUNK = 40_000;

export function inlinePdfWorker(root) {
  const path = join(root, WORKER_REL);
  let src;
  try {
    src = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(
      `找不到 pdf.js 的 worker：${WORKER_REL}\n` +
        "  先跑 `npm i`。路径写错时报的就是这个 ENOENT，看着像 pdfjs 装坏了，实际只是路径拼错。"
    );
  }
  return {
    name: "inline-pdf-worker",
    setup(b) {
      // 用插件而不是 esbuild 的 define：define 会把 1.3MB 的串塞进配置对象里
      // 参与各种比较，慢且容易出错；插件直接产出一个虚拟模块，走正常模块通道。
      b.onResolve({ filter: /^virtual:pdf-worker-src$/ }, () => ({
        path: "pdf-worker-src",
        namespace: "vsrc",
      }));
      b.onLoad({ filter: /.*/, namespace: "vsrc" }, () => {
        // **切片再 join，不要直接 JSON.stringify 一整个 worker。**
        //
        // 源仓库那边必须这样：产物会被塞进 vault 的一张 markdown 笔记、由 Obsidian
        // 的编辑器打开，而 CodeMirror 面对一行 127 万字符的字符串字面量会明显卡顿
        // 甚至假死（症状是「晶体库打不开了」，跟 pdf.js 一点关系都看不出来）。
        //
        // 插件仓这边其实不需要（main.js 不会被编辑器打开），但**这里不分支**：
        // 同一份逻辑两份产物跑出不同形状，是排查时最费时间的那类差异。
        const parts = [];
        for (let i = 0; i < src.length; i += CHUNK) {
          parts.push(JSON.stringify(src.slice(i, i + CHUNK)));
        }
        return { contents: `export default [\n${parts.join(",\n")}\n].join("");`, loader: "js" };
      });
    },
  };
}
