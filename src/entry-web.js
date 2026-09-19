// 原型入口：把核心 + 假适配层 + 网页渲染器拼起来，暴露给页面和测试。

import "katex/dist/katex.min.css";
import { mount } from "./core/app.js";
import { createFakeAdapter } from "./adapters/fake.js";
import { createFakePdfRenderer, fakePdfBytes, pdfCalls } from "./adapters/fake-pdf.js";
import { createLazyPdfRenderer } from "./core/pdfdoc.js";
import { createWebRenderer } from "./adapters/web-render.js";
import { createModel, parseLinks } from "./core/model.js";
import { splitFrontmatter } from "./adapter.js";

let handle = null;

/**
 * 用给定的卡片数据挂载一套晶体库。
 * @param {object} opts
 * @param {Array}  opts.cards
 * @param {HTMLElement} [opts.container]
 * @param {object} [opts.assets]
 * @param {Function} [opts.onOpenNote] (path, { split, line }) => void，验证 openNote 用
 * @param {Function} [opts.onMountEditor] (el, {path, text}) => (EditorHandle|null|undefined)，
 *   原生编辑器探针（3.0 刀 9 第三版）。浏览器里没有真的宿主编辑器，注入假的才验得到那条分支。
 * @param {Function} [opts.onCreateFolder] (path) => (result|undefined)，建文件夹探针。
 * @param {Function} [opts.onTrashFolder] (path) => (result|undefined)，**删**文件夹探针（刀 12）。
 *   测试靠它验「新晶体建在哪个路径」——返回值只能验成功与否，建在哪儿才是要点。
 * @param {Function} [opts.onWriteCard] (path, content, opts) => (WriteResult|undefined)，
 *   写盘探针兼故障注入：返回非 undefined 时该结果原样采用、不写盘
 * @param {Array}  [opts.docs]      3.0 刀 6：可读文献清单（见 adapter.js 的 Doc）
 * @param {object} [opts.binaries]  路径 -> 字节。PDF 用 fakePdfBytes() 造，见 fake-pdf.js
 * @param {object} [opts.pdfRenderer] 3.0 刀 6：假 PDF 渲染器（createFakePdfRenderer）。
 *   **原型这边不内联 pdf.js**——2MB 会让每一条用例的 page.goto 都慢一截，
 *   而这里要验的是阅读器的排布与交互，不是 pdf.js 自己（那是真机的活）。
 */
export async function boot({
  cards,
  container,
  assets = {},
  docs = [],
  binaries = {},
  render: customRender,
  onOpenNote,
  onWriteCard,
  onMountEditor,
  onCreateFolder,
  onTrashFolder,
  scratch,
  pdfRenderer = null,
  storyLayout,
} = {}) {
  const mountEl = container || document.getElementById("kb-mount");
  mountEl.innerHTML = "";

  const list = cards || window.__ARI_CARDS__ || [];

  let renderer = null;
  // 测试注入探针渲染器；原型用网页渲染器近似 Obsidian 原生排版。
  // 延迟建渲染器，是为了让它能拿到适配层的 assetUrl —— 图片解析走契约里的那个方法，
  // 而不是在这里另开一条旁路。
  const adapter = createFakeAdapter({
    cards: list,
    assets,
    docs,
    binaries,
    // openNote 在原型里没有真正的宿主可跳，只能把调用原样交出去。
    // 不透传的话，测试就验不到「split 有没有原封不动传到宿主」这件事。
    onOpenNote,
    // 同理：原型没有真文件可写，writeCard 的探针要把「写什么进去了」交出去。
    onWriteCard,
    // 3.0 刀 9 第三版：原型里**没有**宿主原生编辑器，只有测试注入假的才验得到
    // 「宿主给了编辑器、核心真的用它」那条分支。
    onMountEditor,
    onCreateFolder,
    onTrashFolder,
    scratch,
    render: (md, el, srcPath) => {
      renderer = renderer || customRender || createWebRenderer({ assetUrl: adapter.assetUrl });
      return renderer(md, el, srcPath);
    },
  });

  // 3.0 刀 5 / 刀 6：storyLayout 与 pdfRenderer 都从参数透传给 mount。
  // **两个都不走适配层契约**——契约的语义是「宿主能力」，而一个纯核心的排布算法、
  // 一个纯核心的渲染实现都不是；测试注入 stub 就能证明可替换。
  handle = await mount({ adapter, container: mountEl, storyLayout, pdfRenderer, scratch });
  window.__ARI__ = handle;
  // 适配层也交出去：假适配层上的 emitModify（模拟「卡片在别处被改了」）没有别的
  // 入口能调到，而 #18 那条路只能从宿主侧发起。真宿主没有这个需要——它的事件
  // 是从 vault 来的。
  window.__ARI_ADAPTER__ = adapter;
  return handle;
}

export {
  mount,
  createFakeAdapter,
  createWebRenderer,
  createModel,
  parseLinks,
  splitFrontmatter,
  // 3.0 刀 6：假 PDF 那三件。测试里要用它们造夹具与看调用流水——
  // 函数塞不过 page.evaluate，所以只能从页面这一侧暴露出去。
  createFakePdfRenderer,
  fakePdfBytes,
  pdfCalls,
  // 「把一段源码跑起来」那条两档降级（核心的真实现，不是假货）。
  // 它在真机上第一次打开 PDF 时才会走，而**那一趟我在这儿验不了**——
  // 测试环境没有 CSP。但这两档里能验的部分（new Function 那一档、
  // 以及「读不到源码时给一句人能读的话」）可以在这儿验掉，见 reader.spec.js。
  createLazyPdfRenderer,
};
