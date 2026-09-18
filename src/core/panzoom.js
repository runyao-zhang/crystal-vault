// 3.0 刀 2：整片画面的平移与缩放。**纯手势层**——它不认识晶体、不认识卡片，
// 只认「一个元素 + 一台相机」。
//
// 为什么不复用 imgzoom.js 那一套：那套看着像，实际不是一件事。
// imgzoom 存的是 `{fx, fy}` ——「窗中心对着图上哪一点」的**比例**，因为它的
// 「100% 基准」会随窗尺寸变（适应档 = 窗内容盒），存像素会漂。而画布的世界尺寸
// 是稳定的，存绝对位移才对。
// 硬抽一个「通用原语」就得把两种基准模型塞进一个抽象里，抽出来的东西对两边
// 都不好用。真正能共享的只有约六十行手势管道，复制一次的代价远小于维护一个
// 双模型抽象——**但纪律要抄对**（见下面每条的注释）。

import { MIN_SCALE, MAX_SCALE } from "./viewstate.js";
import { swallowNextClick } from "./dom.js";

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * 把一个元素变成可以平移缩放的画布。
 *
 * 三个角色**必须是分开的**，混起来会出一类很难看懂的错：
 *
 * @param {HTMLElement} el.gesture 事件落点——指针与滚轮绑在这一层。
 *   它要**整个视口都盖得住**，否则平移把内容推远之后边上会出现抓不住的死区，
 *   推出去就推不回来。（实测踩过：绑在被变换的那一层上就是这样。）
 * @param {HTMLElement} el.view 被写 transform 的那一层（世界层）。
 * @param {HTMLElement} el.frame 量坐标用的基准——**绝不能被变换**。
 *   它提供「世界原点在屏幕上的哪儿」，有 transform 的话这个基准会随缩放漂移，
 *   算出来的世界坐标全是错的。
 *
 * ⚠️ `gesture` 和 `frame` 通常就是同一个元素（舞台），但**绝不能和 view 是同一个**
 * ——把 transform 写到测量基准自己身上，等于一边算一边改尺子。
 *
 * @param {object} opts
 *   @param {{x,y,k}} opts.initial 初始相机
 *   @param {(cam) => void} opts.onChange 相机变了（拖动过程中会连着调，调用方自己防抖）
 */
export function bindPanZoom({ gesture, view, frame }, opts = {}) {
  // 变换约定：transform-origin 是 `0 0`，于是 screen = world * k + t。
  // **camera.x / camera.y 就是 t 本身**，不是「画面中心指着世界的哪一点」。
  // 理由：画布的世界尺寸是稳定的（不像图片窗那样基准随窗变），绝对值最直接，
  // 正变换和逆变换各只有一行。
  //
  // ⚠️ 这是**不可逆**的语义：一旦发布，改含义就必须给视图状态升版本号，
  // 而升版本号会让 `raw.v !== 1 → 整体丢弃`，把用户摆好的方框一起冲掉。
  // 改这里之前先想清楚。
  let cam = {
    x: Number(opts.initial && opts.initial.x) || 0,
    y: Number(opts.initial && opts.initial.y) || 0,
    k: clamp(Number(opts.initial && opts.initial.k) || 1, MIN_SCALE, MAX_SCALE),
  };

  let dragging = null; // {pointerId, startX, startY, camX, camY}
  let destroyed = false;

  function apply() {
    // 只写 view 那一层。非画布模式下要的是 `transform = ""`（逐像素等于改动前），
    // 那件事由调用方自己清（canvas.js 的 applyCamera），这里只管画布模式。
    view.style.transform =
      "translate(" + cam.x + "px," + cam.y + "px) scale(" + cam.k + ")";
  }

  function emit() {
    apply();
    if (opts.onChange) opts.onChange({ ...cam });
  }

  function frameOrigin() {
    const r = frame.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height };
  }

  /** 屏幕（client）坐标 → 世界坐标。整块画布只有这一处做这个换算。 */
  function clientToWorld(clientX, clientY) {
    const o = frameOrigin();
    return { x: (clientX - o.left - cam.x) / cam.k, y: (clientY - o.top - cam.y) / cam.k };
  }

  /** 以某个屏幕点为锚缩放：那个点下面的世界坐标**保持不动** */
  function zoomAt(clientX, clientY, factor) {
    const w = clientToWorld(clientX, clientY);
    const k2 = clamp(cam.k * factor, MIN_SCALE, MAX_SCALE);
    if (k2 === cam.k) return;
    const o = frameOrigin();
    cam.k = k2;
    cam.x = clientX - o.left - w.x * k2;
    cam.y = clientY - o.top - w.y * k2;
    emit();
  }

  /**
   * 把一块世界坐标区域框进视口。
   *
   * `maxK` 是「最多放大到多少」——一个只有两颗晶体的库不该被 fit 拉到 4 倍糊在脸上。
   */
  function fit(bbox, o = {}) {
    if (!bbox || !(bbox.w > 0) || !(bbox.h > 0)) return;
    const pad = o.padding == null ? 64 : o.padding;
    const maxK = o.maxK == null ? 1 : o.maxK;
    const r = frameOrigin();
    const k = clamp(
      Math.min((r.w - pad * 2) / bbox.w, (r.h - pad * 2) / bbox.h),
      MIN_SCALE,
      Math.min(MAX_SCALE, maxK)
    );
    cam.k = k;
    cam.x = r.w / 2 - (bbox.x + bbox.w / 2) * k;
    cam.y = r.h / 2 - (bbox.y + bbox.h / 2) * k;
    emit();
  }

  // ---- 手势 ----

  function onWheel(e) {
    if (destroyed) return;
    // ⚠️ 三件事缺一不可：
    //   preventDefault  —— 不然页面/宿主会跟着滚
    //   stopPropagation —— 挡住**翻页滚轮**（cardgrid 的 bindScrollListeners，
    //     它绑的也是舞台）。两个同元素的监听器之间，冒泡阶段的 stopPropagation
    //     是没用的——所以这里真正的保障不是它，而是 stage.js 的 applyStage
    //     在切档时**显式退订**翻页那对监听：相机档和翻页档互斥，
    //     同一时刻只有一个绑着。这一句留着是防以后有人把两条路接在一起。
    //   passive:false   —— 否则 preventDefault 无效
    e.preventDefault();
    e.stopPropagation();

    // ctrl/meta + wheel 是浏览器给的**免费捏合**：触控板上双指捏合在网页里
    // 就报成 ctrl+wheel。自己再模拟一套捏合是重复劳动。
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * 0.002);
      zoomAt(e.clientX, e.clientY, factor);
      return;
    }
    if (e.shiftKey) cam.x -= e.deltaY;
    else {
      cam.x -= e.deltaX;
      cam.y -= e.deltaY;
    }
    emit();
  }

  function onPointerDown(e) {
    if (destroyed || e.button !== 0) return;
    // 只在**空白处**开始拖。按下落在晶体/卡片上就交给它们自己——
    // 画布拖动不抢子元素的点击（不然晶体就点不开了）。
    if (e.target !== gesture) return;
    // ⚠️ 阈值之内不要指针捕获：按下就捕获会把 click 吃掉，
    // 于是「点空白取消选中」这条就没了。这和 holodrag.js 是同一个教训。
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
  }

  function onPointerMove(e) {
    if (!dragging || e.pointerId !== dragging.id) return;
    const dx = e.clientX - dragging.x;
    const dy = e.clientY - dragging.y;
    if (!dragging.moved) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      dragging.moved = true;
      gesture.setPointerCapture(dragging.id);
      gesture.classList.add("kb-v13-panning");
    }
    cam.x = dragging.cx + dx;
    cam.y = dragging.cy + dy;
    emit();
  }

  function onPointerUp(e) {
    if (!dragging || e.pointerId !== dragging.id) return;
    const moved = dragging.moved;
    dragging = null;
    gesture.classList.remove("kb-v13-panning");
    try {
      gesture.releasePointerCapture(e.pointerId);
    } catch (err) {
      /* 指针已经没了，无所谓 */
    }
    if (!moved) return; // 没真拖 = 一次普通点击，留给点击逻辑
    // 拖完那一下会接着冒出一个 click。不掐掉的话，每平移一次都会顺手
    // 执行一次「点空白」——把选中清了。
    swallowNextClick(gesture);
  }

  gesture.addEventListener("wheel", onWheel, { passive: false });
  gesture.addEventListener("pointerdown", onPointerDown);
  gesture.addEventListener("pointermove", onPointerMove);
  gesture.addEventListener("pointerup", onPointerUp);
  gesture.addEventListener("pointercancel", onPointerUp);

  apply();

  return {
    camera: () => ({ ...cam }),
    setCamera(next, o = {}) {
      cam = {
        // 位置**不夹取**：sanitizeCamera 对 x/y 只做有限数校验，这里再夹一道
        // 只会造出「上次存的合法值这次被改」这种莫名其妙的行为。
        // 推远了推不回来这件事由「手势落点是整个舞台」解决，不靠夹位置。
        x: Number(next && next.x) || 0,
        y: Number(next && next.y) || 0,
        k: clamp(Number(next && next.k) || 1, MIN_SCALE, MAX_SCALE),
      };
      apply();
      if (!o.silent && opts.onChange) opts.onChange({ ...cam });
    },
    zoomAt,
    fit,
    clientToWorld,
    destroy() {
      destroyed = true;
      gesture.removeEventListener("wheel", onWheel);
      gesture.removeEventListener("pointerdown", onPointerDown);
      gesture.removeEventListener("pointermove", onPointerMove);
      gesture.removeEventListener("pointerup", onPointerUp);
      gesture.removeEventListener("pointercancel", onPointerUp);
      gesture.classList.remove("kb-v13-panning");
    },
  };
}

export { MIN_SCALE, MAX_SCALE };
