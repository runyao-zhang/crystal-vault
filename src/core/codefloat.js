// #11 代码块悬浮窗 —— 浮窗引擎（floatwin.js）的代码块前端。
//
// 正文渲染整段交给宿主（ADR-0002），核心不碰 markdown，所以这里的做法是
// 「渲染完成后在正文里找 <pre>」，给每个挂一个悬浮入口。
//
// 点开后是把这个 <pre> 节点**整个搬进**悬浮窗，原位留一条占位；收回时把
// **同一个节点**搬回去。不复制文本、不重新渲染。理由：语法高亮、复制按钮、
// 插件挂的事件都是宿主渲染时留在那个节点上的，另起一份等于把它们全丢掉，
// 还得自己追一套主题配色；搬节点则全部跟着走，窗体里的代码和正文里一模一样。
//
// 代价：节点离开了 `.kb-v13-holo-body`（在真宿主里还有 `.markdown-rendered`）的
// 样式作用域，那段皮肤得在 styles.js 里给窗体重来一份，见 #11 一节。
//
// 通用部分（建窗、占位、拖动、夹取、尺寸记忆、收窗）在 floatwin.js；这个文件只管
// 「什么语言、几行、默认开多宽、拖角怎么变」这四件代码块特有的事。
//
// 尺寸是按库里最长的一行代码定的，不是随手填的：现状是全息面板固定 500px，
// 正文区再扣掉内边距，一行只有 398px（1440 视口下实测）。而「02-散点图scatter」里
// 那句 `plt.xticks(...)  # 刻度换成真实日期` 实测要 643px，在正文里只能横向滚——
// 720 是给这一行留的整数档。开窗后再按内容兜一次底，比 720 还长的行也不会折。

import { EL } from "./dom.js";
import { openFloat, findFloat } from "./floatwin.js";

const DEFAULT_W = 720; // 库内最长一行代码实测所需宽度的上一个整数档（窗的外框宽）
const BODY_PAD_X = 12; // 与 .kb-v13-cfloat-body 的 padding 一致，换算内容盒要用
const BODY_PAD_Y = 10;
const MIN_W = 320; // 再窄必然折行，那还不如不开
const MIN_H = 160;
// 内容盒想要的宽度：把 DEFAULT_W 换算成"扣掉内边距与边框之后"的数。
// 定宽的是窗，量的是内容，两个数之间差着这一圈，混着用就会差 26px。
const WANT_CONTENT_W = DEFAULT_W - (BODY_PAD_X + 1) * 2;

function langOf(pre) {
  const code = pre.querySelector("code");
  const m = code && String(code.className || "").match(/language-([\w+#.-]+)/);
  return m ? m[1] : "代码";
}

// 行数取 <code> 的文本：<pre> 里可能被宿主插了复制按钮，那些文字不算行
function linesOf(pre) {
  const body = pre.querySelector("code") || pre;
  const t = String(body.textContent || "").replace(/\s+$/, "");
  return t ? t.split("\n").length : 0;
}

/**
 * 渲染完成后在正文里挂悬浮入口。
 * 必须在 renderMarkdown 落地之后调用——宿主渲染是异步的，早一步里面还没有 <pre>。
 */
export function attachCodeFloats(ctx, box) {
  box.querySelectorAll("pre").forEach((pre) => {
    if (pre._kbFloatSrc) return; // 重入保护：同一个节点只挂一次
    pre._kbFloatSrc = true;
    pre.classList.add("kb-v13-cfloat-src");
    // 键盘可达：Tab 到、Enter/Space 开合
    pre.tabIndex = 0;
    pre.setAttribute("role", "button");
    pre.setAttribute("aria-label", "代码块（" + langOf(pre) + "，" + linesOf(pre) + " 行）");
    pre.setAttribute("aria-expanded", "false");

    pre.addEventListener("click", (e) => {
      // 宿主常往 <pre> 里塞复制按钮之类的交互元素，点在它们身上不该开窗
      if (e.target.closest && e.target.closest("a,button,input,select,textarea")) return;
      // 已经浮在窗里就不动它——那是在看代码、选词，不是"把窗收掉"。
      // 收窗走占位条的「收回」、窗上的 ✕ 与 Esc 三条路（见 floatwin.js）。
      if (findFloat(ctx, pre)) return;
      openCodeFloat(ctx, pre);
    });

    pre.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
      e.preventDefault(); // 别让空格顺带把正文滚走
      e.stopPropagation();
      if (findFloat(ctx, pre)) return;
      openCodeFloat(ctx, pre);
    });
  });
}

function openCodeFloat(ctx, pre) {
  const lang = EL("span", "kb-v13-cfloat-lang");
  lang.textContent = langOf(pre);
  // 行数靠右端：跟左边的语言名一头一尾，不是中间点串起来的模板写法
  const lines = EL("span", "kb-v13-cfloat-lines");
  lines.textContent = linesOf(pre) + " 行";

  openFloat(ctx, {
    cls: "kb-v13-cfloat",
    unit: pre,
    barItems: [lang, lines],
    closeTitle: "收回代码",
    ariaLabel: "代码悬浮窗",
    // 同一个动作在两处叫同一个名字（占位条按钮 =「收回」，窗口关闭 =「收回代码」）
    slotText: "代码已移到悬浮窗",
    pad: { x: BODY_PAD_X, y: BODY_PAD_Y },
    minW: MIN_W,
    minH: MIN_H,
    ratio: null, // 代码窗自由改宽高：折行与否是排版选择，不是"坏了"
    // 代码块没有那么宽的，别按视口比例预先缩——缩了就是白白多出横向滚动。
    // 放不下交给 applyBox 的视口夹取兜底。
    maxFrac: { w: 1, h: 1 },
    // 量的是刚搬进窗、窗还没有宽度时的那个 <pre>：它此刻的宽就是代码想占的宽
    measure: () => {
      const r = pre.getBoundingClientRect();
      return { w: Math.max(WANT_CONTENT_W, r.width), h: r.height };
    },
  });
}
