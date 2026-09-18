// 3.0 刀 5：在世界层里拖一个东西。晶体和故事线的卡片节点共用这一份。
//
// 抽出来的理由不是省几行，是**那条教训只该活在一个地方**：
// 事件必须绑在**舞台**上，不能绑在被拖的那一层——被拖的东西住在
// `pointer-events:none` 的层里（空白处要穿透），指针一离开它的矩形，
// 事件的 target 就变成舞台，而舞台不是那一层的祖先，`pointermove` 再也
// 冒泡不上去。晶体有 140px 把问题藏住了，方框的抓手只有 18px 就露馅了。
// 这个坑我这轮踩了两次，不该有第三次。

import { swallowNextClick } from "./dom.js";

/** 超过这个像素才算「拖」，之内当点击——不然东西就点不中、打不开了 */
const DRAG_THRESHOLD = 4;

/**
 * @param {object} cfg
 *   @param {string} cfg.selector   被拖的东西的选择器
 *   @param {(el) => string} cfg.keyOf  从元素上取身份键
 *   @param {string} cfg.stage      只在哪一档里生效（"canvas" / "storyline"）
 *   @param {(ctx, key) => {x,y}} cfg.posOf  它此刻在哪（世界坐标）
 *   @param {(ctx, key, p) => void} cfg.writePos 落定
 *   @param {(ctx, key) => void} [cfg.onDrop] 松手时（用来判归属之类）
 */
export function bindItemDrag(ctx, cfg) {
  // ⚠️ 绑舞台，不是绑被拖的那一层。理由见文件头。
  const g = ctx.stage;
  let drag = null;

  g.addEventListener("pointerdown", (e) => {
    if (ctx.state.stage !== cfg.stage || e.button !== 0) return;
    if (!e.target || !e.target.closest) return;
    // 被拖的东西里头可能有**控件**（比如卡片四边的连接点）。按在控件上不算
    // 「拖这个东西」——那是控件自己的手势。
    //
    // ⚠️ 这条不能靠 stopPropagation 解决：两个监听器**都在舞台上**，
    // 同一个元素上的两个监听器之间 stopPropagation 是没用的。而且真让它启动了
    // 更糟——它会 setPointerCapture(舞台)，之后 pointerup 的 target 就变成舞台，
    // 连接点那边「落在哪张卡上」当场查不到，线连不上，还一声不响。
    if (cfg.ignore && e.target.closest(cfg.ignore)) return;
    const el = e.target.closest(cfg.selector);
    if (!el) return;
    const key = cfg.keyOf(el);
    if (!key) return;
    const cam = ctx._panzoom ? ctx._panzoom.camera() : { x: 0, y: 0, k: 1 };
    drag = {
      id: e.pointerId,
      el,
      key,
      sx: e.clientX,
      sy: e.clientY,
      from: cfg.posOf(ctx, key),
      k: cam.k || 1,
      moved: false,
      x: 0,
      y: 0,
    };
  });

  g.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved) {
      // 阈值之内不捕获：按下就捕获会把 click 吃掉，东西就点不开了
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      g.setPointerCapture(drag.id);
      drag.el.classList.add("kb-v13-dragging");
    }
    // 屏幕位移要**除以相机缩放**：相机缩了 k 倍，屏幕走 100px 世界只走 100/k。
    // 忘了这一步的表现是「放大之后拖起来飞得离谱」。
    const x = drag.from.x + dx / drag.k;
    const y = drag.from.y + dy / drag.k;
    drag.x = x;
    drag.y = y;
    drag.el.style.left = x + "px";
    drag.el.style.top = y + "px";
    // 拖动过程中也要告诉调用方。**必须有这一步**：被拖的东西周围可能挂着
    // 别的东西（故事线的连线就是），它们要跟着走——只更新自己的 left/top，
    // 那些东西会留在原地，看着就是「卡片跑了、线还钉在原地」。
    if (cfg.onMove) cfg.onMove(ctx, drag.key, { x, y });
  });

  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    d.el.classList.remove("kb-v13-dragging");
    try {
      g.releasePointerCapture(e.pointerId);
    } catch (err) {
      /* 指针已经没了 */
    }
    if (!d.moved) return; // 没真拖 = 一次普通点击，留给点击逻辑
    cfg.writePos(ctx, d.key, { x: d.x, y: d.y });
    if (cfg.onDrop) cfg.onDrop(ctx, d.key);
    // 拖完那一下会接着冒出一个 click。不掐掉的话，每拖一次都顺手打开一张卡
    swallowNextClick(g);
    if (ctx.refreshStageUi) ctx.refreshStageUi();
  };
  g.addEventListener("pointerup", end);
  g.addEventListener("pointercancel", end);
}
