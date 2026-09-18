// #10 全息面板（主卡片）可拖动。
//
// 为什么需要它：代码块点开会浮出一扇窗（#11 的 .kb-v13-cfloat），那扇窗自己有
// 标题栏拖动和右下角改尺寸。可它压在卡片上时，卡片本身动不了——被压住的那半张
// 正文就再也看不到。两头都得能挪，这个模块补的是卡片这头。
//
// 手法与 codefloat.js 的 bindDrag 同源（Pointer Events，手机/笔都认），两处差别
// 都是「面板 ≠ 独立小窗」逼出来的：
//
//   1. **阈值**。面板整块可点：上面有蒙层封条、代码块、双链。按下即算拖动的话，
//      这些一个都点不着了。所以位移超过 DRAG_THRESHOLD 才真正进入拖动，
//      没超过就什么都不做，点击原样穿过去。
//   2. **不做布局位移，只做 transform**。面板是 overlay（display:flex）居中的
//      子元素，改 left/top 等于跟 flex 打架；translate 则完全不碰那条居中规则，
//      复位只要把 transform 清空。
//
// 面板一动，那一圈卫星和连线就得跟着（hologram.js 的 shiftSatellites）——
// 否则拖开之后连线还指着老地方，看着像坏了。

import { refreshSatellites, shiftSatellites } from "./hologram.js";

// 位移小于这个数算点击。4px 是手抖的量级：比它小的一定是"想点一下"。
const DRAG_THRESHOLD = 4;
// 面板离视口边缘的最小间距，与 codefloat.js 的 EDGE 同一个数
const EDGE = 8;
// 拖动结束后多久之内把那次 click 吞掉。浏览器在 pointerup 之后还会补一个 click，
// 落点常常正好停在起手的那枚封条上——不掐掉的话，拖一把面板 = 顺手把某一段遮罩掀了。
const SWALLOW_CLICK_MS = 250;

function panelOf(ctx) {
  return ctx.overlay ? ctx.overlay.querySelector(".kb-v13-hologram") : null;
}

function offsetOf(ctx) {
  return ctx._holoOffset || { x: 0, y: 0 };
}

/**
 * 面板复位到居中。关闭面板时调（hologram.js 的 closeHologram 走 ctx.resetPanelOffset）。
 * 换卡时**不**调：点卫星连着翻几张卡时，面板不该每次都蹦回正中。
 */
export function resetPanelOffset(ctx) {
  ctx._holoOffset = { x: 0, y: 0 };
  const panel = panelOf(ctx);
  if (panel) {
    panel.style.transform = "";
    panel.classList.remove("kb-v13-holo-dragging");
  }
  if (ctx.satContainer) ctx.satContainer.classList.remove("kb-v13-sat-dragging");
}

/**
 * 这一下按下该不该当作拖动起点。
 *
 * 两处例外：按钮/链接（关掉、编辑、宿主插的复制按钮），以及代码块——代码是要
 * 划选复制走的，从代码上按住仍然是划选。
 */
function canStartDrag(panel, e) {
  const t = e.target;
  if (!t || !t.closest) return false;
  if (t.closest("button, a, input, select, textarea")) return false;
  if (t.closest("pre, code")) return false;
  // 编辑表单整块不拖。逐个排除控件是不够的——行标题、提示语、留白都不是控件，
  // 在鼠标下会被当成拖动手柄：想选个词，面板先跑了。（触摸本来就只认标题行。）
  if (t.closest(".kb-v13-editform")) return false;
  // 触摸：只认标题那一行。理由是滚动——面板自己是 overflow-y:scroll 的（长概念会
  // 撑过 82vh），整块可拖就意味着整块不能再滚，手机上正文就滚不动了，
  // 而滚正文比挪面板要紧得多。标题那一行由样式放开了 touch-action（styles.js 的
  // #10 一节），两处是一件事的两半。鼠标 / 触控笔没有这个约束，整块都能拖。
  if (e.pointerType === "touch" && !t.closest(".kb-v13-holo-title")) return false;
  return true;
}

/**
 * 位移夹取。base 是面板**未平移**时的矩形，所以先把候选偏移还原成绝对边界再判。
 *
 * 面板比视口还宽/还高时两个边界会反过来，用 min/max 兜成一个合法区间，
 * 免得夹出空集把面板钉死在某个角上。
 */
function clampOffset(ctx, base, x, y) {
  const vw = ctx.win.innerWidth;
  const vh = ctx.win.innerHeight;

  const ax = EDGE - base.left;
  const bx = vw - EDGE - base.left - base.w;
  x = Math.min(Math.max(x, Math.min(ax, bx)), Math.max(ax, bx));

  const ay = EDGE - base.top;
  const by = vh - EDGE - base.top - base.h;
  y = Math.min(Math.max(y, Math.min(ay, by)), Math.max(ay, by));

  return { x, y };
}

export function bindPanelDrag(ctx) {
  const panel = panelOf(ctx);
  if (!panel) return;

  // 拖动刚结束时那一下 click 要吞掉（见 SWALLOW_CLICK_MS）。挂在捕获阶段，
  // 抢在封条/代码块自己的监听之前。
  let swallowUntil = 0;
  panel.addEventListener(
    "click",
    (e) => {
      if (Date.now() >= swallowUntil) return;
      e.stopPropagation();
      e.preventDefault();
    },
    true
  );

  panel.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return; // 只认左键；触摸没有 button 语义
    if (!canStartDrag(panel, e)) return;

    const from = offsetOf(ctx);
    // 起手这一刻面板**没被平移**时该在哪儿：rect 里已经含了当前 transform，减掉才是基准。
    // 拖动全程用同一个 base，所以夹取算的是绝对边界，不会一路累积误差。
    const r = panel.getBoundingClientRect();
    const base = { left: r.left - from.x, top: r.top - from.y, w: r.width, h: r.height };
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        moved = true;
        // 指针捕获**到这里才要**：按下就捕获的话，click 会被改派到面板自己身上，
        // 封条和代码块就都点不着了（Chrome 会把兼容鼠标事件一起重定向）。
        try {
          panel.setPointerCapture(ev.pointerId);
        } catch (err) {
          /* 指针已经不活跃（合成事件）时拿不到捕获，退化成普通监听也能用 */
        }
        panel.classList.add("kb-v13-holo-dragging");
        // 拖到一半的半截选区跟着面板走会很难看，拖起来就先清掉
        const sel = ctx.win.getSelection && ctx.win.getSelection();
        if (sel && sel.removeAllRanges) sel.removeAllRanges();
      }
      const next = clampOffset(ctx, base, from.x + dx, from.y + dy);
      ctx._holoOffset = next;
      panel.style.transform = "translate(" + next.x + "px," + next.y + "px)";
      shiftSatellites(ctx, next.x, next.y);
    };

    const up = () => {
      panel.removeEventListener("pointermove", move);
      panel.removeEventListener("pointerup", up);
      panel.removeEventListener("pointercancel", up);
      try {
        panel.releasePointerCapture(e.pointerId);
      } catch (err) {
        /* 同上 */
      }
      if (!moved) return; // 没到阈值就是一次普通点击，什么都不做
      panel.classList.remove("kb-v13-holo-dragging");
      // 平移本身位置已经对了，重排是为了把可能被挪出视口的卫星按新中心夹回来
      refreshSatellites(ctx);
      swallowUntil = Date.now() + SWALLOW_CLICK_MS;
    };

    panel.addEventListener("pointermove", move);
    panel.addEventListener("pointerup", up);
    panel.addEventListener("pointercancel", up);
  });
}
