// 3.0 刀 9 第二版：桌面**页窗**里的缩放与平移（PDF 页）。
//
// ---- 为什么另起一份，不直接用 imgzoom.js ----
//
// `imgzoom.js` 那一套的骨架是「**窗按图的形状拉，图在窗里铺满**」：
// 窗的比例由 `floatwin.js` 锁死，图的尺寸归 CSS 的 `width:100%`，手动缩放只乘
// 一个 `transform`。页窗这边**骨架完全一样**（窗按页的形状拉，见 desk.js 的
// `clampRatioBox`；画布归 CSS 的 `width:100%`；缩放乘 transform），所以算法照抄。
//
// 但代码不能共用：`imgzoom.js` 从头到尾都在跟一个 `<img>` 打交道
// （`naturalWidth`、`img.draggable`、`img.style.width`、还原内联样式），
// 而这里管的是一个 `.kb-v13-desk-stage`——里面是画布加文字层两层。
// `panzoom.js` 开头把这条判断写死了：「真正能共享的只有约六十行手势管道，
// 复制一次的代价远小于维护一个双模型抽象——**但纪律要抄对**」。
//
// ---- 与图那一份**故意不同**的一条：鼠标拖动不平移 ----
//
// 图上按住拖动是平移；页上按住拖动必须是**划选文字**（刀 7 的文字层，
// 用户点名要能选中复制）。两件事抢同一个手势，只能让一个赢——赢的是划选。
// 平移改走：**中键拖动**（鼠标）与**单指拖动**（触摸，那里本来就没有划选）。
//
// 滚轮缩放以**光标为中心**、双击回到 100%——这两条与图完全一致。

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 6;
// 滚轮灵敏度。与 imgzoom.js 同值：鼠标一格 deltaY 约 100，触摸板是小增量连发，
// 指数映射让两者都顺。
const WHEEL_K = 0.0015;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 把「现在缩放多少、画面中心对着页上的哪一点」写到 stage 上。
 *
 * `fx`/`fy` 是**比例**（0 = 最左/最上，1 = 最右/最下），不是像素——存像素的话
 * 窗一改尺寸（画布跟着窗铺满），同一个像素值所指的位置就变了，画面会莫名滑向一边。
 * 与 imgzoom.js 同一条。
 *
 * @param {HTMLElement} stage 被 transform 的那一层
 * @param {HTMLElement} box   裁切它的那一层（量尺寸用）
 * @param {{zoom:number, fx:number, fy:number}} st **就地改**（fx/fy 会被夹回范围内）
 */
export function applyPageZoom(stage, box, st) {
  if (!stage || !box) return;
  const bw = box.clientWidth;
  const bh = box.clientHeight;
  // 还没上树 / 还没量出尺寸这一小段什么都不做：硬算的话基准是 0，缩放比当场 NaN。
  if (bw <= 0 || bh <= 0) return;
  const dw = bw * st.zoom;
  const dh = bh * st.zoom;
  // 装得下就居中（本来也没有可推的余地）；装不下才允许推，且推不出页外。
  const halfX = dw > 0 ? bw / 2 / dw : 0.5;
  const halfY = dh > 0 ? bh / 2 / dh : 0.5;
  st.fx = dw <= bw ? 0.5 : clamp(st.fx, halfX, 1 - halfX);
  st.fy = dh <= bh ? 0.5 : clamp(st.fy, halfY, 1 - halfY);
  const tx = bw / 2 - st.fx * dw;
  const ty = bh / 2 - st.fy * dh;
  // 基准态（倍数 1、正中对齐）下**不写 transform**——那正是「一页正好铺满窗」，
  // 浏览器按 CSS 摆出来的样子。与 imgzoom.js 那条纪律同源。
  stage.style.transform =
    st.zoom === 1 && Math.abs(tx) < 0.01 && Math.abs(ty) < 0.01
      ? ""
      : "translate(" + tx + "px," + ty + "px) scale(" + st.zoom + ")";
  box.classList.toggle("kb-v13-desk-pannable", dw > bw + 0.5 || dh > bh + 0.5);
}

/** 以「窗内某一点」为中心缩放。算法只有一句话：光标底下那一页，缩完还在光标底下。 */
function zoomTo(box, st, cx, cy, target) {
  const z2 = clamp(target, ZOOM_MIN, ZOOM_MAX);
  if (!(z2 > 0) || Math.abs(z2 - st.zoom) < 1e-6) return;
  const bw = box.clientWidth;
  const bh = box.clientHeight;
  if (bw <= 0 || bh <= 0) return;
  const dw = bw * st.zoom;
  const dh = bh * st.zoom;
  const u = st.fx + (cx - bw / 2) / dw;
  const v = st.fy + (cy - bh / 2) / dh;
  st.zoom = z2;
  st.fx = u - (cx - bw / 2) / (bw * z2);
  st.fy = v - (cy - bh / 2) / (bh * z2);
}

/**
 * 把滚轮 / 双击 / 中键拖动 / 捏合接到一扇页窗上。
 *
 * @param {object} spec
 * @param {HTMLElement} spec.box   裁切盒（`.kb-v13-desk-page`）——事件都绑在它上面
 * @param {HTMLElement|() => HTMLElement} spec.stage 被 transform 的那一层。
 *   ⚠️ **传函数**（reader.js 就是这么传的）：重画一页时那一层会被整个清掉重建
 *   （`mountDeskWin` 开头 `box.textContent = ""`），攥着老节点的话，缩放会老老实实
 *   作用在一个**已经脱离文档**的元素上——**不报错，只是屏幕上的东西一动不动**。
 *   这一条是量出来的：`stage === document.querySelector(...)` 是 `false`。
 * @param {{zoom:number, fx:number, fy:number}} spec.state **活的那个状态对象**
 * @param {(st) => void} [spec.onCommit] 用户停手（双击重置、松手）时回调，用来存档
 * @returns {() => void} 摘监听
 */
export function bindPageZoom(spec) {
  const { box, state } = spec;
  const commit = spec.onCommit || (() => {});
  // 每一帧都现问一次「现在那一层是谁」，见上面那条 ⚠️
  const stageEl = () => (typeof spec.stage === "function" ? spec.stage() : spec.stage);

  const paint = () => applyPageZoom(stageEl(), box, state);

  // ---- 滚轮 ----
  box.addEventListener(
    "wheel",
    (e) => {
      // 别让页面/卡片跟着滚。非 passive 是被动监听器里唯一能 preventDefault 的写法。
      e.preventDefault();
      e.stopPropagation();
      // deltaMode：0=像素 1=行 2=页。只按像素算的话，行模式的一格只有 3，
      // 指数映射下约等于没反应。
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? box.clientHeight : 1;
      const r = box.getBoundingClientRect();
      zoomTo(box, state, e.clientX - r.left, e.clientY - r.top, state.zoom * Math.exp(-e.deltaY * unit * WHEEL_K));
      paint();
      commit(state);
    },
    { passive: false }
  );

  // ---- 双击 = 回到「一页正好铺满窗」----
  // 与图那一份同一个意思：放大迷路之后要的是回家，不是在 100% 与 200% 之间切。
  // 只重置视图，**不动窗**——窗的大小是用户拿右下角抓手摆出来的。
  box.addEventListener("dblclick", (e) => {
    if (e.target && e.target.closest && e.target.closest("input")) return;
    e.preventDefault();
    state.zoom = 1;
    state.fx = 0.5;
    state.fy = 0.5;
    paint();
    commit(state);
  });

  // ---- 平移：中键（鼠标）/ 单指（触摸）----
  const pointers = new Map();
  let pan = null;
  let pinch = null;

  const between = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function syncGesture() {
    const pts = [...pointers.values()];
    if (pts.length >= 2) {
      pinch = { dist: between(pts[0], pts[1]), mx: (pts[0].x + pts[1].x) / 2, my: (pts[0].y + pts[1].y) / 2 };
      pan = null;
    } else if (pts.length === 1) {
      pan = { x: pts[0].x, y: pts[0].y, fx: state.fx, fy: state.fy };
      pinch = null;
    } else {
      pan = null;
      pinch = null;
    }
  }

  box.addEventListener("pointerdown", (e) => {
    // ⚠️ **鼠标左键绝不接手**：它要留给划选文字（见文件头）。中键才是平移。
    if (e.pointerType === "mouse" && e.button !== 1) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      box.setPointerCapture(e.pointerId);
    } catch (err) {
      /* 合成事件拿不到捕获，退化成普通监听也能用 */
    }
    syncGesture();
    if (e.pointerType === "mouse") e.preventDefault(); // 别触发中键的自动滚动
  });

  box.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.values()];
    const r = box.getBoundingClientRect();
    const bw = box.clientWidth;
    const bh = box.clientHeight;
    const dw = bw * state.zoom;
    const dh = bh * state.zoom;
    if (!(dw > 0) || !(dh > 0)) return;

    if (pinch && pts.length >= 2) {
      const dist = between(pts[0], pts[1]);
      const mx = (pts[0].x + pts[1].x) / 2;
      const my = (pts[0].y + pts[1].y) / 2;
      if (pinch.dist > 0) zoomTo(box, state, mx - r.left, my - r.top, state.zoom * (dist / pinch.dist));
      // 两指整体挪动 = 平移：捏合只管缩放，同时进行的位移另算，两个手势能叠加。
      state.fx -= (mx - pinch.mx) / (bw * state.zoom);
      state.fy -= (my - pinch.my) / (bh * state.zoom);
      pinch = { dist, mx, my };
      paint();
      return;
    }
    if (!pan) return;
    state.fx = pan.fx - (e.clientX - pan.x) / dw;
    state.fy = pan.fy - (e.clientY - pan.y) / dh;
    paint();
  });

  const release = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    try {
      box.releasePointerCapture(e.pointerId);
    } catch (err) {
      /* 同上 */
    }
    syncGesture();
    commit(state);
  };
  box.addEventListener("pointerup", release);
  box.addEventListener("pointercancel", release);

  paint();

  return function unbind() {
    // 窗关掉时整棵子树一起没了，监听跟着走——这里只把状态清干净，
    // 免得闭包里那张 pointers 表在窗还原之后还留着上一次的坐标。
    pointers.clear();
  };
}
