// 3.0 刀 6 修订：pdf.js 的**独立运行时**。
//
// 它单独打包成一个文件，落回 vault 时**不写进那张 markdown 笔记**，而是作为
// 旁边一个 .js 躺着。理由是那次翻车：
//
//   内联进笔记之后，那张笔记从 7,665 行涨到 30,260 行、346KB 涨到 2.6MB，
//   Obsidian 的编辑器直接打不开它——**而 dataviewjs 块在笔记里，笔记打不开，
//   块就永远没机会跑**。更别说块每次渲染都要在主线程把 2.5MB 跑一遍。
//
// 刀 0 的结论里其实写过「内联会造出百万字符的单行」，当时的对策是切片；
// 切片只解决了「一行太长」，**没解决「整篇还是 2.6MB」**。教训是：
// 一个通过了检查的数字，不能拿来代替那个检查本来想防住的事。
//
// 现在这一份由阅读器**按需读进来**（点开第一份 PDF 时才读），读进来之后
// 用 pdfdoc.js 里那条「三档降级」把它跑起来。
//
// ⚠️ 主包（entry-obsidian.js）**不许再 import pdf.js**。一 import，esbuild 就把它
// 合进那张笔记里，一切照旧。这条没有任何自动检查会替你守——`dist/crystal-vault.js`
// 的体积就是那条线，见 scripts/build.mjs 末尾的体检。

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.min.mjs";
import WORKER_SRC from "virtual:pdf-worker-src";

// 这两样就是 pdfdoc.js 的 createPdfRenderer 要的东西，原样交出去。
// 名字写成 PDFRUNTIME 是为了和主包的 ARI 分开——两个 IIFE 会先后跑在同一个
// 全局里，重名的话后一个把前一个盖掉，而且不报错。
export { pdfjs, WORKER_SRC as workerSrc };
