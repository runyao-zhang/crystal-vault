// #17 公式围栏的悬浮窗 —— 浮窗引擎（floatwin.js）的公式前端。
//
// 围栏块先由 mathfence.js 就地换成渲染好的公式（一个 .kb-v13-mathfence 容器），
// 这里再给那个容器挂一个悬浮入口。点开是把**容器整个**搬进窗，原位留一条占位，
// 收回时把同一个节点搬回去——与代码窗、图片窗同一个做法，不复制、不重新渲染。
//
// 搬的是已经排好版的节点，所以窗里的公式和正文里一模一样。也不需要重渲：
// 「MathJax 排版要求节点已在文档里」那条约束管的是**首次**排版，而搬来搬去
// 这个节点始终在文档里（窗挂在遮罩上）。
//
// 与代码窗的分工：共用 floatwin 引擎与 .kb-v13-cfloat 那套窗体皮肤，差别只有三处——
//   1. 认的是 .kb-v13-mathfence 容器，不是 <pre>；
//   2. 标题栏报围栏语言（latex / math / tex），不报「N 行」（公式没有行数这个概念）；
//   3. 内容盒的皮肤另在 styles.js 里补一份——容器离开了 .kb-v13-holo-body 的作用域。
//
// 宽公式不靠开宽窗解决：窗开多宽由内容量出来，放不下时在**窗内**横向滚
// （styles.js 里 .katex-display 那条 overflow-x:auto），与正文里的表现一致。

import { EL } from "./dom.js";
import { openFloat, findFloat } from "./floatwin.js";

const BODY_PAD_X = 12; // 与 .kb-v13-cfloat-body 的 padding 一致，换算内容盒要用
const BODY_PAD_Y = 10;
const MIN_W = 240; // 再窄公式就该滚得没法看了
const MIN_H = 120;
// 内容盒默认宽。为什么是定值而不是量出来的，见下面 measure 那段——实测"公式想要多宽"
// 在 DOM 里没有出口。520 比面板正文（实测 400）略宽，够放绝大多数行间公式。
const DEFAULT_CONTENT_W = 520;

// 围栏语言。mathfence.js 换掉 <pre> 之前把它存进了容器的 data——那之后没有别的出处。
function fenceOf(holder) {
  return String((holder.dataset && holder.dataset.kbFence) || "公式");
}

/**
 * 渲染完成后在正文里挂悬浮入口。
 * 必须在 expandMathFences 落地之后调用——容器是那一步才建出来的。
 */
export function attachMathFloats(ctx, box) {
  box.querySelectorAll(".kb-v13-mathfence").forEach((holder) => {
    if (holder._kbFloatSrc) return; // 重入保护：同一个节点只挂一次（与 codefloat 同一个约定）
    holder._kbFloatSrc = true;
    holder.classList.add("kb-v13-cfloat-src");
    // 键盘可达：Tab 到、Enter 开。也必须**可聚焦**——openFloat 收尾会 focus 它，
    // 焦点落在不可聚焦的元素上等于把键盘用户扔回 body。
    holder.tabIndex = 0;
    holder.setAttribute("role", "button");
    holder.setAttribute("aria-label", "公式（" + fenceOf(holder) + "）");
    holder.setAttribute("aria-expanded", "false");

    holder.addEventListener("click", (e) => {
      // 公式里可能有真交互元素：KaTeX 的 \href 会渲染成 <a>
      if (e.target.closest && e.target.closest("a,button,input,select,textarea")) return;
      // 已经浮在窗里就不动它——那是在看公式、选公式，不是"把窗收掉"。
      // 收窗走占位条的「收回」、窗上的 ✕ 与 Esc 三条路，见 floatwin.js。
      if (findFloat(ctx, holder)) return;
      openMathFloat(ctx, holder);
    });

    holder.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
      e.preventDefault(); // 别让空格顺带把正文滚走
      e.stopPropagation();
      if (findFloat(ctx, holder)) return;
      openMathFloat(ctx, holder);
    });
  });
}

function openMathFloat(ctx, holder) {
  const lang = EL("span", "kb-v13-cfloat-lang");
  lang.textContent = fenceOf(holder);

  openFloat(ctx, {
    // 复用代码窗那套窗体：外壳、占位条、抓角、拖拽全都一样，没必要再养第二套皮肤。
    // 内容盒的差异（公式 vs 代码）由 styles.js 按作用域分开管。
    cls: "kb-v13-cfloat",
    unit: holder,
    // 只放语言名，右端不写占位串——「N 行」对公式没有意义，空着比编一个数字诚实
    barItems: [lang],
    closeTitle: "收回公式",
    ariaLabel: "公式悬浮窗",
    // 同一个动作在两处叫同一个名字（占位条按钮 =「收回」，窗口关闭 =「收回公式」）
    slotText: "公式已移到悬浮窗",
    pad: { x: BODY_PAD_X, y: BODY_PAD_Y },
    minW: MIN_W,
    minH: MIN_H,
    ratio: null, // 自由改宽高：公式多宽是排版选择，不该锁死
    // 公式没多宽，别按视口比例预先缩——缩了只是白白多出横向滚动。放不下交给视口夹取兜底。
    maxFrac: { w: 1, h: 1 },
    // 宽度只能给定值：容器是块级，里面那几层（.katex-display / .katex / .katex-html）
    // 也全是块级铺满，实测两种宽窄差很远的公式量出来是同一个数、且谁都不溢出——
    // 「公式想要多宽」在 DOM 里没有出口。这与代码窗给 720 是同一个处置：那边锚的是
    // 库内最长的一行代码（实测 643px），这里没有可锚的东西，就取面板正文（实测 400px）
    // 略宽的一个整数档。真放不下会在窗内横向滚，也随时可以拖角自己调；调过的尺寸
    // 由 floatwin 按节点记住，下次开还是你摆的那个。
    //
    // 高度是真的量出来的：容器没有 padding/border，子元素的 margin 与它折叠，
    // 所以量到的就是公式本身的高度（实测：单行 17px，带积分与分式的 33px）。
    measure: () => {
      const r = holder.getBoundingClientRect();
      return { w: DEFAULT_CONTENT_W, h: Math.max(1, Math.round(r.height)) };
    },
  });
}
