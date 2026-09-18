// 假的 PDF 渲染器（3.0 刀 6）。**给测试用的**，与 fake.js 同一族：
// 原型和测试因此能在没有 pdf.js、没有 Worker、没有 CSP 的环境里跑完整条
// 「打开文献 → 一屏摆 N 页 → 翻页 → 边看边记」的链路。
//
// 为什么需要它：真的那一层（pdfdoc.js）要真 Worker、真 blob URL、真 CSP——
// 而测试跑在一个**没有这些约束**的 Chromium 里，验了也不算数（刀 5 的教训：
// 测试环境里没有「焦点留在编辑器」这回事，于是四条用例全绿、真机上功能是死的）。
// 所以规矩是「测不了的部分必须尽小」：真 pdf.js 只在 pdfdoc.js 那 40 行胶水里，
// 而**怎么用它**（一屏摆几页、页码怎么翻、画布按什么比例铺）全在 reader.js，
// 那个用这个假货就能完整验。
//
// ---- 假 PDF 的「字节」怎么读 ----
//
// 真 PDF 有文件头有交叉引用表，假货不需要。这里约定前 6 个字节就是全部参数，
// 于是测试只要 `new Uint8Array([6, 2, 100, 3, 20])` 就能造出「6 页、612×792」
// 这样一个确定的夹具——不必在页面里注册什么全局表，也不必把函数塞过
// page.evaluate（那个塞不过去）。真 PDF 的字节随便填什么都行：只有前 6 个字节
// 会被看，其余原样忽略。
//
//   字节 0    : 页数
//   字节 1..2 : 页宽（大端 16 位）
//   字节 3..4 : 页高（大端 16 位）
//   字节 5    : 1 = open 时抛错（测「这份打不开」那条路）

/** 造一份假 PDF 的字节。见文件头那张表。 */
export function fakePdfBytes({ pages = 1, w = 612, h = 792, fail = false } = {}) {
  const b = new Uint8Array(6);
  b[0] = pages & 0xff;
  b[1] = (w >> 8) & 0xff;
  b[2] = w & 0xff;
  b[3] = (h >> 8) & 0xff;
  b[4] = h & 0xff;
  b[5] = fail ? 1 : 0;
  return b;
}

/** 假渲染器记下的调用流水。测试在页面里读它，断言「真的画了、画了几次、按多大比例」。 */
export function pdfCalls() {
  return (globalThis.__PDF_CALLS__ = globalThis.__PDF_CALLS__ || []);
}

// ---- 假的文字层内容（3.0 刀 7） ----
//
// 固定值，测试直接拿它对断言。三条要满足，不然验不出东西：
//   · **多行**——一行的假数据验不出 `<br>`、也验不出纵向错位
//   · **横向起点不全一样**——第三行故意缩进，整层横向偏移一点点就看得出来
//   · **长度不同**——`width` 与字符串长度不成正比时，scaleX 那步写错了也看不出来
//
// 坐标一律是 **PDF 用户空间**（原点左下、单位 pt），与 pdf.js 的 `TextItem` 一致。
export const FAKE_TEXT_SIZE = 12; // 字号
export const FAKE_TEXT_TOP = 100; // 第一行基线距页顶多少 pt
export const FAKE_TEXT_LEAD = 20; // 行距
export const FAKE_TEXT_LINES = [
  { text: "第一行文字 alpha", x: 72, w: 120 },
  { text: "second line beta", x: 72, w: 108 },
  { text: "第三行 gamma", x: 108, w: 86 },
];

/**
 * 建一个假 PDF 渲染器。形状与 pdfdoc.js 的 `createPdfRenderer` 返回的东西**逐字段对齐**
 * ——对着的一旦漂移，测试验的就不是真那条路了。
 */
export function createFakePdfRenderer() {
  return {
    async open(bytes) {
      const b =
        bytes instanceof Uint8Array
          ? bytes
          : new Uint8Array(bytes && bytes.byteLength ? bytes : []);
      if (b[5] === 1) throw new Error("假渲染器：按约定这里要失败");
      const pages = b.length ? b[0] : 0;
      const w = b.length >= 5 ? (b[1] << 8) | b[2] : 612;
      const h = b.length >= 5 ? (b[3] << 8) | b[4] : 792;
      pdfCalls().push({ op: "open", pages, w, h });

      let closed = false;
      return {
        pages,
        async size() {
          return { w, h };
        },
        /**
         * 假的文字项。**形状与 pdfdoc.js 的 `textItems` 逐字段对齐**，包括
         * `view.transform` 的值——那不是随便编的，是 pdf.js `PageViewport`
         * 对无旋转、MediaBox 从 (0,0) 起的页面算出来的那一份：
         *   `[s, 0, 0, -s, 0, h*s]`（y 在这里翻过来，所以文字层的坐标原点在左上）
         * 假的那一份要是自己发明一个矩阵，测出来的「对齐」就一点意义都没有。
         */
        async textItems(index, scale) {
          if (closed) throw new Error("假渲染器：文档已经关了还在读文字");
          const s = scale > 0 ? scale : 1;
          pdfCalls().push({ op: "text", index, scale: s });
          const items = FAKE_TEXT_LINES.map((line, i) => ({
            str: line.text,
            // 文字矩阵：字号 + 左下角原点。y 从「距页顶」换算成 PDF 的「距页底」。
            transform: [FAKE_TEXT_SIZE, 0, 0, FAKE_TEXT_SIZE, line.x, h - (FAKE_TEXT_TOP + i * FAKE_TEXT_LEAD)],
            width: line.w,
            hasEOL: true,
          }));
          return { items, view: { scale: s, transform: [s, 0, 0, -s, 0, h * s] } };
        },
        async render(index, canvas, opts = {}) {
          if (closed) throw new Error("假渲染器：文档已经关了还在画");
          pdfCalls().push({ op: "render", index, scale: opts.scale, dpr: opts.dpr });
          const k = (opts.scale || 1) * (opts.dpr || 1);
          canvas.width = Math.max(1, Math.round(w * k));
          canvas.height = Math.max(1, Math.round(h * k));
        },
        async close() {
          closed = true;
          pdfCalls().push({ op: "close" });
        },
      };
    },
  };
}
