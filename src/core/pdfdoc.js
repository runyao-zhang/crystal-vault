// 3.0 刀 6：pdf.js 那一层薄胶水。**核心不 import pdf.js**——库由宿主那一侧
// 建好、连同 worker 源码一起从 mount 参数递进来（见 entry-obsidian.js）。
//
// 这么切是因为这一层**测不了**：它要真 Worker、真 blob URL、真 CSP，而测试跑在
// 一个没有这些约束的 Chromium 里，验了也不算数。刀 5 的教训摆在那儿——测试环境
// 里没有「焦点留在编辑器」这回事，于是四条用例全绿、真机上功能是死的。
// 所以规矩是：**测不了的部分必须尽可能小**。这里只剩「把 pdf.js 递过来的字节
// 渲染进一张 canvas」，其余（一屏摆几页、怎么翻、错误怎么显示）全在 reader.js 里，
// 用假 pdf 库就能完整验。
//
// 下面这段 worker 的接法是从 3.0 刀 0 的 spike 原样搬过来的，**三条都是在真机上
// 撞出来的，别当成可选优化**：
//
//   1. **worker 是必需的，不是优化。** pdf.js v6 没有主线程模式：不给 worker 就是
//      `No "GlobalWorkerOptions.workerSrc" specified.`。退路阶梯在这里就塌了一档。
//   2. **必须用 `pdfjs-dist/legacy/build/`，不是 `build/`。** pdf.js 用了
//      `Map.prototype.getOrInsertComputed`（Chrome 140+ 才有），`build` 变体不带补丁，
//      在 Obsidian 的 Electron 里报 `__privateGet(...).getOrInsertComputed is not a function`。
//      legacy 带 core-js 补丁，代价是 150KB——别为了省这 150KB 换回去。
//   3. **worker 源码必须切片内联**（打包期做，见 scripts/build.mjs）。整块塞进去会
//      在产物里造出一行 127 万字符，而这 bundle 最终要由 Obsidian 的编辑器打开，
//      CodeMirror 遇到百万字符的单行会卡死。表现是「晶体库打不开了」，跟 pdf.js
//      一点关系都看不出来。

/**
 * 建一个 PDF 渲染器。**宿主没有这份能力时返回 null**——阅读器按「这份读不了」
 * 处理，而不是崩掉。契约里没有这一项，它是 mount 参数（和刀 5 的 storyLayout 同一条纪律）。
 *
 * @param {object} spec
 * @param {object} spec.pdfjs      pdfjs-dist 的 legacy 构建（模块命名空间对象）
 * @param {string} spec.workerSrc  pdf.worker 的源码全文，会被做成 blob URL
 * @returns {{open: (bytes: ArrayBuffer|Uint8Array) => Promise<object>}|null}
 */
/**
 * 懒加载版的 PDF 渲染器：**点开第一份 PDF 时才把整个运行时读进来**。
 *
 * 为什么要有它（3.0 刀 6 修订）：pdf.js 曾经是内联进那张 markdown 笔记的，
 * 结果笔记从 7,665 行涨到 30,260 行、346KB 涨到 2.6MB，Obsidian 的编辑器
 * **直接打不开它**——而块在笔记里，笔记打不开，块就永远没机会跑。
 * 现在它躺在 vault 里另外一份 .js 上，由 `loadSource` 按需取回。
 *
 * ## 两档降级（这一段是整份文件里唯一「猜」的地方）
 *
 * 「把一段字符串跑起来」在宿主里有两条路，**哪条通取决于那个宿主怎么设 CSP**：
 *
 *   1. `new Function(src)` —— 需要 `'unsafe-eval'`。**最可能通的一条**：
 *      Dataview 自己的 dataviewjs 就是在跑用户写的 JS（本库本体就是），
 *      它不通的话整个 Dataview 都不成立。
 *   2. blob URL + `<script src>` + onload —— 需要 `script-src` 放行 `blob:`。
 *
 * 两条都摆上、依次试，是因为**我没有办法在这儿验它们**：测试环境里没有 CSP，
 * 验了也不算数（刀 5 的教训——那四条用例全绿、真机上功能是死的）。与其赌一条，
 * 不如两条都写：每条只有几行，而「都不通」时那句错误会把原因说清楚。
 *
 * 为什么不用动态 `import()`：这份运行时打成的是 **IIFE**（`var PDFRUNTIME = …`），
 * 它没有 `export`，import 回来的模块是空的。IIFE 只有这两种跑法。
 * ——这也是它必须是 IIFE 的原因：`new Function` 里放 ESM 的 `export` 是语法错。
 *
 * ⚠️ 真机第一次打开 PDF 时如果两条全挂，屏幕上会出现「两条路都没能把它跑起来」。
 * 那不是 pdf.js 坏了，是宿主不让跑外部脚本，届时要换方案（见路线图·刀 6 修订）。
 *
 * @param {() => Promise<string>} loadSource 取运行时源码全文（宿主给：从 vault 读）
 * @param {Document} [doc] 第 2 档要用；不给就只试第 1 档
 */
export function createLazyPdfRenderer(loadSource, doc) {
  let built = null; // 建好就不再建：2MB 的解析只该发生一次
  let pending = null; // 并发调用共用同一次加载

  async function ensure() {
    if (built) return built;
    if (pending) return pending;
    pending = (async () => {
      const src = await loadSource();
      if (!src) throw new Error("宿主没给出 PDF 运行时的内容（读不到那份文件？）");
      const payload = await runToGetPayload(src, doc);
      const api = createPdfRenderer({
        pdfjs: payload && payload.pdfjs,
        workerSrc: payload && payload.workerSrc,
      });
      if (!api) throw new Error("读到了 PDF 运行时，但它里面没有该有的东西");
      built = api;
      return api;
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  }

  return {
    /** 运行时到底跑起来没有。测试/排障用——不跑它，只是问一句。 */
    ready: () => !!built,

    async open(bytes) {
      const api = await ensure();
      return api.open(bytes);
    },
  };
}

/**
 * 把一段 IIFE 源码跑起来，拿回它挂在全局上的 `PDFRUNTIME`。
 *
 * 两条路依次试，**前一条失败只记下原因、不中断**——两条都不通时把所有原因
 * 一起报出来，因为「为什么不通」恰恰是下一步最需要的信息。
 */
async function runToGetPayload(src, doc) {
  const reasons = [];

  // 1) new Function。**返回值直接从函数体里抠出来**，不去读全局：
  //    IIFE 里的 `var PDFRUNTIME = …` 在这个函数的作用域里是局部的，
  //    `new Function(src)()` 跑完之后全局上根本没有这个名字。
  try {
    const got = new Function(
      src + "\n;return typeof PDFRUNTIME === 'undefined' ? null : PDFRUNTIME;"
    )();
    if (got && got.pdfjs) return got;
    reasons.push("new Function：跑完了，但它没交出 pdfjs");
  } catch (e) {
    reasons.push("new Function：" + ((e && e.message) || e));
  }

  // 2) <script src=blob:>。经典脚本，`var PDFRUNTIME` 在顶层会变成全局属性，
  //    所以这一档拿的是 globalThis 而不是返回值。要等 onload。
  try {
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const tag = doc.createElement("script");
    tag.src = url;
    await new Promise((resolve, reject) => {
      tag.onload = resolve;
      tag.onerror = () => reject(new Error("脚本没加载起来（多半是 CSP 挡了 blob:）"));
      (doc.head || doc.body || doc.documentElement).appendChild(tag);
      // 兜底：onload 在某些环境下不会被触发，别把用户卡在这儿
      setTimeout(resolve, 10000);
    });
    tag.remove();
    URL.revokeObjectURL(url);
    const got = globalThis.PDFRUNTIME;
    if (got && got.pdfjs) return got;
    reasons.push("<script src=blob:>：加载完了，但它没交出 pdfjs");
  } catch (e) {
    reasons.push("<script src=blob:>：" + ((e && e.message) || e));
  }

  throw new Error("两条路都没能把它跑起来 —— " + reasons.join("；"));
}

export function createPdfRenderer({ pdfjs, workerSrc } = {}) {
  if (!pdfjs || typeof pdfjs.getDocument !== "function") return null;
  if (!workerSrc || typeof Worker !== "function" || typeof URL.createObjectURL !== "function") {
    return null;
  }

  // 这个进程里建过几个 worker。刀 0 的 spike 靠它证明了「no-worker 那轮真的没走 worker」，
  // 留着是因为它会救下一次「以为走了 worker、其实没走」的调试。
  let built = 0;

  /**
   * 建一个**只属于这一份文档**的 worker。
   *
   * 3.0 刀 9 之前这里是反过来的：一个实例共用一份 worker，挂在
   * `pdfjs.GlobalWorkerOptions.workerPort` 上——那是个**模块级全局槽，只有一个位置**。
   * 所以 `open()` 一进来必须先 `dropWorker()` 把上一份 terminate 掉，否则下一份会拿到
   * 一个正在被销毁的端口，报「the worker is being destroyed」（react-pdf #1838）。
   *
   * 那套写法能跑，但代价是**两份 PDF 永远不能同时开着**：开第二份，第一份当场白屏。
   * 阅读器要「一页一扇窗、还能混摆两份文献」，这条路就走不通了。
   *
   * 现在把 worker 直接递给 `getDocument({ worker })`——pdf.js 见 `src.worker` 是
   * PDFWorker 实例就用它自己的（`pdf.mjs` 里那句 `src.worker instanceof PDFWorker`），
   * **压根不碰那个全局槽**。每份文档自带端口、谁关谁自己收，于是 #1838 那类毛病
   * 是**从结构上没有了**，而不是靠「每次记得擦干净」。
   *
   * 代价是每份打开的文档各留一个 worker 线程。阅读器同时开几份，可以接受。
   */
  function makeWorker() {
    const blob = new Blob([workerSrc], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    // type 必须是 "module"：worker 源码里有 import.meta，按经典脚本解析会直接语法错。
    const port = new Worker(url, { type: "module" });
    built++;
    return {
      worker: new pdfjs.PDFWorker({ port }),
      dispose() {
        try {
          port.terminate();
        } catch (e) {
          /* 已经没了，无所谓 */
        }
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          /* 同上 */
        }
      },
    };
  }

  return {
    /** 这个进程里累计建过几个 worker。给测试/排障用。 */
    workerCount: () => built,

    /**
     * 打开一份 PDF。
     *
     * @param {ArrayBuffer|Uint8Array} bytes
     * @returns {Promise<object>} 一份「能翻能画」的文档句柄。**用完必须 close()**。
     */
    async open(bytes) {
      // 这一份自己的 worker。**没有「先清上一份」这一步了**——见 makeWorker 的注释：
      // 每份文档自带端口，上一份活得好好的。这正是「能混摆两份文献」要的东西。
      const w = makeWorker();

      const task = pdfjs.getDocument({
        data: bytes,
        worker: w.worker,
        // 宿主里没有可 fetch 的地址，资源目录也一条都不给（vault 里没有 cmaps/、
        // 没有 standard_fonts/、没有 wasm）。与其让它去猜、去发请求，不如提前关掉，
        // 让失败发生在明面上——见刀 0 spike 的 entry.js。
        cMapUrl: undefined,
        standardFontDataUrl: undefined,
        wasmUrl: undefined,
        // 能 eval 时 pdf.js 会走一条更快的路径，而宿主有 CSP。v5+ 用 quickjs WASM
        // 替代它——我们不给 wasm，所以这条路直接关掉。
        isEvalSupported: false,
      });

      let doc;
      try {
        doc = await task.promise;
      } catch (e) {
        // 打不开（坏文件、加密、截断）就把这个 worker 收掉再往上抛。
        // 不收的话它会挂在那儿——从前共用一份 worker，下一份文档顺手就把它擦了；
        // 现在一份文档一个，没人替它收。
        w.dispose();
        throw e;
      }
      // 页面尺寸缓存。getPage 本身有内部缓存，这里缓存的是**算出来的视口**——
      // 布局每重排一次都要问一圈，不值得每次重算。
      const sizes = new Map();

      async function viewportOf(index) {
        const page = await doc.getPage(index);
        const vp = page.getViewport({ scale: 1 });
        return { w: vp.width, h: vp.height };
      }

      return {
        pages: doc.numPages,

        /** 第 index 页在 scale=1 下的尺寸（pt）。**1 基**，与 pdf.js 一致。 */
        async size(index) {
          if (!sizes.has(index)) sizes.set(index, await viewportOf(index));
          return sizes.get(index);
        },

        /**
         * 第 index 页的文字项，给透明的文本层用（3.0 刀 7）。
         *
         * **只把数据取回来，一个位置都不算**——摆哪儿归 `core/textlayer.js`，
         * 那一半是纯函数、能在 node 侧断言；这一半测不了，所以尽量薄。
         *
         * ⚠️ **要在 `render` 之前调**：`render` 末尾会 `page.cleanup()`，之后再要文字
         * 就得让 pdf.js 重新去取一遍页面资源。取回来的东西一样，但那条路上多一个
         * 「cleanup 之后还能不能取」的未知数，而这里没有任何理由去赌它。
         *
         * @param {number} index 1 基
         * @param {number} scale **必须与画 canvas 的那一档一致**——canvas 的 CSS 尺寸
         *   就是这一档（后备存储那一份乘了 dpr，是另一回事）。两者不一致时文字层会
         *   整体等比错开，而且**不会报错**。
         * @returns {Promise<{items: Array, view: {scale: number, transform: number[]}}>}
         */
        async textItems(index, scale) {
          const page = await doc.getPage(index);
          const vp = page.getViewport({ scale: scale > 0 ? scale : 1 });
          const content = await page.getTextContent();
          return {
            items: (content && content.items) || [],
            view: { scale: vp.scale, transform: vp.transform },
          };
        },

        /**
         * 把第 index 页画进 canvas。
         *
         * @param {number} index 1 基
         * @param {HTMLCanvasElement} canvas
         * @param {{scale?: number, dpr?: number}} opts
         *   dpr 是「一个 CSS 像素有几个物理像素」：画布按 scale*dpr 出像素，
         *   CSS 尺寸按 scale 写回去。高分屏上不这么干就是糊的。
         */
        async render(index, canvas, opts = {}) {
          const scale = opts.scale || 1;
          const dpr = opts.dpr || 1;
          const page = await doc.getPage(index);
          const vp = page.getViewport({ scale: scale * dpr });
          canvas.width = Math.max(1, Math.floor(vp.width));
          canvas.height = Math.max(1, Math.floor(vp.height));
          canvas.style.width = Math.floor(vp.width / dpr) + "px";
          canvas.style.height = Math.floor(vp.height / dpr) + "px";
          const c2d = canvas.getContext("2d");
          await page.render({ canvasContext: c2d, viewport: vp }).promise;
          page.cleanup();
        },

        /**
         * 收工。**每一份文档都必须 close**——它自带一个 worker 线程和一个 blob URL，
         * 没人替它收（从前共用一份，下一份打开时会顺手擦掉；现在不是了）。
         */
        async close() {
          try {
            // v6 里 PDFDocumentProxy 上**没有** destroy——销毁走 loadingTask。
            await task.destroy();
          } catch (e) {
            /* 已经关过了 */
          }
          sizes.clear();
          w.dispose();
        },
      };
    },
  };
}
