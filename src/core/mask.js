// #12 / #13 共用的「遮住 ↔ 揭开」开关。
//
// 语义（两份工单共用同一套，用户学一次就够）：
//   - 默认遮住；
//   - **点击**那枚封条切换，再点又遮上，如此循环；
//   - 悬停不揭开。这是和 #6「概念」故意的差异：#6 是"扫一眼"，这里是"自测"——
//     手停在上面不该把答案送出去，非得点一下才算作数；
//   - 已经揭开的不会因为别处被点又遮回去：每个开关只管自己那份内容，
//     没有全局的"点空白处全遮上"；
//   - 第一次揭开才把内容交出去（#12 交出去的是宿主渲染这种大开销，#13 是几个词条）。
//
// 控件与内容分开：开关**永远**是那枚封条/小签，内容本身不是按钮。
// 这样正文里的代码块（#11）、宿主渲染出来的双链、可选中文字都不会被开关吃掉——
// 点代码块是去开悬浮窗，不是"把这一段又遮上"。
//
// 样式在 styles.js 的 #12/#13 一节：遮住态 = 青色虚线封条 + 斜纹（沿用 #6 概念遮罩、
// #11 占位条那套"这里被盖住了"的语言），揭开态 = 封条缩成左边缘一枚暗青小签。
// 两态只差"封条在不在"，扫一眼就能分辨。

import { EL } from "./dom.js";

const REVEALED = "revealed";

/**
 * 建一个遮罩开关。
 * @param {object}   opts
 * @param {string}   [opts.cls]        附加类名（区分卡头 / 全息分段两处落点）
 * @param {string}   [opts.label]      封条左端的小字（如「第 2 段」「关键词」），空则不占位
 * @param {string}   [opts.hint]       遮住态右端的提示语
 * @param {Function} [opts.onReveal]   第一次揭开时调用一次，参数是这个开关本身
 * @param {boolean}  [opts.revealed]   出生即揭开（#9 复习模式：渲染即摊开，一个字都不用点）
 * @returns {HTMLElement} root，内容容器在 root._body
 */
export function createMask({ cls, label, hint = "点击展开", onReveal, revealed: open } = {}) {
  const root = EL("div", "kb-v13-mask" + (cls ? " " + cls : ""));
  const cover = EL("div", "kb-v13-mask-cover");
  const body = EL("div", "kb-v13-mask-body");

  // 封条是个真按钮，不是装饰：键盘要能 Tab 到、Enter/Space 要能开合
  cover.tabIndex = 0;
  cover.setAttribute("role", "button");
  if (label) cover.appendChild(EL("span", "kb-v13-mask-label", label));
  cover.appendChild(EL("span", "kb-v13-mask-hint", hint));
  root.append(cover, body);

  root._body = body;
  root._cover = cover;
  root._onReveal = onReveal;
  // 遮住态的秘密（正文 / 关键词）不该被读屏念出来：内容这会儿根本还没交出去
  root._setAria = () => {
    const on = revealed(root);
    cover.setAttribute("aria-expanded", on ? "true" : "false");
    cover.setAttribute("aria-label", (label ? label + "，" : "") + (on ? "点击遮上" : hint));
  };
  root._setAria();

  const toggle = (e) => {
    // #13 的封条长在卡片里，卡片自己有个"整块可点 = 开全息面板"的委托监听；
    // 这里不拦住的话，点封条会连带把面板也打开，等于自测途中被弹一脸正文。
    if (e) e.stopPropagation();
    toggleMask(root);
  };
  cover.addEventListener("click", toggle);
  cover.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
    e.preventDefault(); // 空格别顺手把卡片区滚走
    toggle(e);
  });

  // 出生即揭开走的是同一个 revealMask：惰性那条规矩不能破——复习模式下分段正文
  // 也得在这一刻交给宿主渲染，而不是等谁点一下
  if (open) revealMask(root);

  return root;
}

/**
 * #9 整片扫一遍遮罩，全揭开或全遮上。切模式用。
 *
 * 不逐个记账（谁建的、建在哪儿），是因为遮罩落在好几处——卡头关键词条、全息分段、
 * 以及将来可能加的——漏记一处的表现是「切了模式那一块没反应」，最难查的那类。
 * 扫一遍的代价只是几次 querySelectorAll。
 *
 * @param {HTMLElement} root 子树根。注意全息面板挂在 overlay 上、不在 fs 里，
 *                           调用方得两棵树各扫一遍（见 app.js 的 applyMode）。
 */
export function setAllMasks(root, on) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll(".kb-v13-mask").forEach(on ? revealMask : concealMask);
}

export function revealed(root) {
  return !!root && root.classList.contains(REVEALED);
}

export function toggleMask(root) {
  if (revealed(root)) concealMask(root);
  else revealMask(root);
}

export function revealMask(root) {
  if (!root || revealed(root)) return;
  root.classList.add(REVEALED);
  if (root._setAria) root._setAria();
  // 惰性：内容只交出去一次。_rendered 必须在调用 _onReveal **之前**落下——
  // 宿主渲染是异步的，用户连点两下时第二次揭开不能又渲染一遍（#6 同款护栏）。
  if (!root._rendered) {
    root._rendered = true;
    if (root._onReveal) root._onReveal(root);
  }
}

export function concealMask(root) {
  if (!root || !revealed(root)) return;
  root.classList.remove(REVEALED);
  if (root._setAria) root._setAria();
}
