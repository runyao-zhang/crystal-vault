// 3.0 刀 7：PDF 页面上的**透明文本层**——把画在 canvas 上的那些字变成真能选中的文字。
//
// 为什么要它：PDF 是画在一张 `<canvas>` 上的一堆像素，选不中、复制不了。读讲义时
// 看到一个定义想抄进笔记，只能手打。pdf.js 本来就把每个字的位置算好了
// （`getTextContent`），把那层数据摆成一排**透明、但真在 DOM 里**的 span 盖在画布上，
// 浏览器原生的拖选 / Ctrl+C 就自己生效了。所有 PDF 阅读器都是这么做的。
//
// ---- 为什么不用 pdf.js 自带的 TextLayer 类 ----
//
// pdf.js v6 明明导出了 `TextLayer`，直接用最省事。**不用它**，因为它把版式押在
// pdf.js 的**内部 CSS 契约**上：它调 `setLayerDimensions()`，那条写的是
//
//   style.width = "round(down, var(--total-scale-factor) * 612px, var(--scale-round-x))"
//
// 而 `--total-scale-factor` / `--scale-round-x` / `--scale-round-y` 这三个变量
// **只有 pdf.js 自己的 viewer.css 会定义**。我们不给，整条声明就失效——宽高设不上、
// 字号不生效，**但没有任何报错**，表现是文字层和画面整个错开。升级 pdf.js 时这套变量
// 还可能再变。这正好是本仓反复吃亏的那类坏法（「改错了不报错、只是坏掉」），所以自己算。
//
// **代价（要知情）：竖排与 RTL 不做。** 讲义、教材、课件的正文都是横排左起，
// 先按这个来；真碰上了再说。
//
// ---- 这一层只负责「算」，不碰 DOM ----
//
// 它是个纯函数，和 reader.js 的 `computeGrid` 一样可以在 node 侧直接断言。
// 「量出 span 的自然宽度、写 scaleX」那一步要有 DOM 才做得了，留在 reader.js——
// 这里只交出**想要多宽**（`wantWidth`），于是「量不出 / 量不准」不会污染这一半。

/**
 * 基线上方占字高的比例。
 *
 * `tx[5]` 是**基线**在视口空间里的 y，而 CSS 的 `top` 定的是行盒的顶边，
 * 所以中间差一个 ascent。pdf.js 自己按字体族查一张表（`TextLayer.#getAscent`），
 * 那张表是私有的；而 vault 里既没有 `standard_fonts/` 也没有 `cmaps/`——
 * pdf.js 画到 canvas 上的本来就是替换字体，用它的中位取值就够。
 *
 * **只影响高亮框压得准不准，不影响选中哪几个字**，所以偏一两个像素可以接受。
 */
export const TEXT_ASCENT = 0.8;

/** 6 元矩阵得是 6 个有限数，否则后面每一项都会算出 NaN */
function isMatrix(m) {
  if (!m || typeof m.length !== "number" || m.length < 6) return false;
  for (let i = 0; i < 6; i++) {
    if (!isFinite(m[i])) return false;
  }
  return true;
}

/**
 * 两个 6 元矩阵相乘。**与 pdf.js 的 `Util.transform(m1, m2)` 逐项等价**——
 * 抄的是它的定义（`[a,b,c,d,e,f]` 即 `[[a,b,0],[c,d,0],[e,f,1]]`），不是自己推的。
 *
 * 自己写而不是 import 它，是为了让这个文件不依赖 pdf.js：核心侧一旦 import，
 * 接缝守卫（seam.spec.js）和小体积这两条就都破了。
 */
function mul(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/**
 * 把 pdf.js 的文字项算成一排 span 该怎么摆。
 *
 * @param {Array} items pdf.js `getTextContent()` 的 `items`，**原样**：
 *   `{str, transform: [a,b,c,d,e,f], width, hasEOL}`。
 *   `transform` 是 PDF 用户空间的文字矩阵（原点左下），`width` 是 PDF 单位下的宽度。
 * @param {{scale: number, transform: number[]}} view
 *   来自 `page.getViewport({ scale })`。**scale 必须与画 canvas 的那一档一致**
 *   （canvas 的 CSS 尺寸就是这一档，后备存储那一份乘了 dpr、那是另一回事）。
 *   两者一旦不一致，文字层会整体等比错开，而且不会报错。
 * @returns {{spans: Array<{text, left, top, fontHeight, wantWidth, eol}>}}
 *   坐标全是**画布 CSS 像素**、原点在画布左上角。
 *   `eol: true` 表示这一项后面要补一个 `<br>`——否则复制出来的一整段会挤成一行。
 */
export function layoutTextLayer(items, view) {
  const spans = [];
  const list = Array.isArray(items) ? items : [];
  const vt = view && view.transform;
  const scale = view ? Number(view.scale) : NaN;

  // 视口矩阵不合法就什么都摆不出来。**宁可整层空着**：算出来的位置全是 NaN 的话，
  // 浏览器会把 span 丢在 (0,0)，表现是「选中的字全在页角」——比没有还难查。
  if (!isMatrix(vt)) return { spans };
  if (!isFinite(scale) || scale <= 0) return { spans };

  for (const it of list) {
    if (!it) continue;
    const text = typeof it.str === "string" ? it.str : "";
    // 空串 / 纯空白：不建 span。pdf.js 的 items 里这种很常见（换行、排版空档），
    // 每一个都建一个 span 的话，DOM 会平白大一截，而它们本来就选不出东西。
    if (!text.trim()) continue;

    const m = mul(vt, it.transform);
    if (!isMatrix(m)) continue;

    const fontHeight = Math.hypot(m[2], m[3]);
    // 退化矩阵（缩放为 0）在坏 PDF 里真的会出现。算出 NaN 的话整个 span 会静默
    // 落到 (0,0)，所以这里**丢掉这一项**——丢一项只少一个字，NaN 会毁掉整层。
    if (!isFinite(fontHeight) || fontHeight <= 0) continue;

    const left = m[4];
    const top = m[5] - fontHeight * TEXT_ASCENT;
    if (!isFinite(left) || !isFinite(top)) continue;

    // pdf.js 自己的算法就是 `item.width * viewport.scale`（见 TextLayer 里
    // `canvasWidth * this.#scale / width` 那一句）。**不要再乘 dpr**——上面那张
    // 画布的 CSS 尺寸就是 scale 这一档。
    const wantWidth = Number(it.width) * scale;

    spans.push({
      text,
      left,
      top,
      fontHeight,
      wantWidth: isFinite(wantWidth) && wantWidth > 0 ? wantWidth : 0,
      // 复制出来的换行全靠它。少了它，拖过一整段粘出来是一长条。
      eol: !!it.hasEOL,
    });
  }

  return { spans };
}
