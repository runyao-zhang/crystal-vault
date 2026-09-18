// 3.0 刀 4：方框模块——比晶体更高一层的东西。
//
// 一个长方形，可以取名、可以把晶体拖进去、可以套进另一个方框。
// 它是**空间上的**分组，不是文件夹：晶体在 vault 里的位置一个字都不动，
// 方框只存在于视图状态里（`modules` + `membership`，两个字段早就留好了）。
//
// ## 一条贯穿全文的纪律：逻辑嵌套、扁平渲染
//
// **绝不用 DOM 嵌套来表达「框里有框」。** renderCrystals 每次渲染都会
// `querySelectorAll(".kb-v13-crystal").remove()` 再重挂——任何被 reparent 进方框的
// 晶体，下一次渲染就被搬回晶体层，表现是「方框里的东西随机跳出来」。
// 所以：所有方框都是 canvas 的**平铺兄弟**，「在里面」只由坐标和 z 序表达，
// 拖动父框时按 delta **递归**推子框和成员晶体。

import { EL, esc, swallowNextClick } from "./dom.js";
import { CRYSTAL_SIZE } from "./layout.js";
import { MIN_MODULE_W, MIN_MODULE_H } from "./viewstate.js";
import { layoutOf, worldPosOf } from "./canvas.js";
import { beginInlineRename, UNNAMED } from "./inlinerename.js";

const DRAG_THRESHOLD = 4;
/** 新建方框的尺寸。够摆下两三颗晶体，又不至于第一次就把半屏盖住。 */
const NEW_W = 320;
const NEW_H = 220;

// ============================================================
// 读
// ============================================================

export function modulesOf(ctx) {
  const l = layoutOf(ctx);
  return Array.isArray(l.modules) ? l.modules : [];
}

export function membershipOf(ctx) {
  const l = layoutOf(ctx);
  return l.membership && typeof l.membership === "object" ? l.membership : {};
}

export function moduleById(ctx, id) {
  return modulesOf(ctx).find((m) => m.id === id) || null;
}

/** 深度：顶层是 0。渲染时 z 序与拖动的 delta 传播都用它 */
export function depthOf(ctx, id, seen) {
  const seenSet = seen || new Set();
  if (seenSet.has(id)) return 0; // 成环不该发生（sanitize 断过），但递归不能赌
  seenSet.add(id);
  const m = moduleById(ctx, id);
  if (!m || !m.parent) return 0;
  return 1 + depthOf(ctx, m.parent, seenSet);
}

/**
 * 命中判定：某个世界坐标点落在哪个方框里。**取最深的那个**（innermost wins）。
 *
 * 纯数学，不读 DOM。方框的 {x,y,w,h} 本来就在 state 里、本来就是世界坐标，
 * 换算一下就完了——比 getBoundingClientRect 稳，也不怕将来方框有旋转。
 *
 * ⚠️ 别用 `elementFromPoint`：方框是 `pointer-events:none` 的，
 * 它返回的永远是底下的晶体或舞台。这个坑不看注释一定会踩。
 */
export function moduleAtPoint(ctx, wx, wy, exclude) {
  let best = null;
  for (const m of modulesOf(ctx)) {
    if (exclude && exclude.has(m.id)) continue;
    if (wx < m.x || wy < m.y || wx > m.x + m.w || wy > m.y + m.h) continue;
    if (!best || depthOf(ctx, m.id) > depthOf(ctx, best.id)) best = m;
  }
  return best;
}

/** 自己 + 全体后代。拖框时用来排除「不能掉进自己肚子里」。 */
function selfAndDescendants(ctx, id) {
  const s = new Set([id]);
  for (const d of descendantsOf(ctx, id)) s.add(d.id);
  return s;
}

/** 这个方框的全体后代（不含自己）。删框时要连着处理它们。 */
function descendantsOf(ctx, id) {
  const out = [];
  const walk = (pid) => {
    for (const m of modulesOf(ctx)) {
      if (m.parent !== pid) continue;
      out.push(m);
      walk(m.id);
    }
  };
  walk(id);
  return out;
}

// ============================================================
// 层
// ============================================================

const LAYER_CLASS = "kb-v13-modules";

/** 方框层。插在 canvas 的**最前面**——它要在晶体下面（见 styles.js 的 z-index 预算）。 */
function ensureLayer(ctx) {
  if (ctx._modulesLayer && ctx._modulesLayer.parentNode) return ctx._modulesLayer;
  let layer = ctx.canvas.querySelector("." + LAYER_CLASS);
  if (!layer) {
    layer = EL("div", LAYER_CLASS);
    ctx.canvas.insertBefore(layer, ctx.canvas.firstChild);
  }
  ctx._modulesLayer = layer;
  return layer;
}

// ============================================================
// 画
// ============================================================

function buildModuleEl(ctx, m) {
  const el = EL("div", "kb-v13-module");
  el.dataset.id = m.id;
  el.dataset.depth = String(depthOf(ctx, m.id));
  el.style.zIndex = String(depthOf(ctx, m.id) + 1);
  el.innerHTML =
    '<div class="kb-v13-module-bar">' +
    '<span class="kb-v13-module-name">' + esc(m.name) + "</span>" +
    '<button type="button" class="kb-v13-module-del" title="删掉这个方框（里面的晶体留在原地）">×</button>' +
    "</div>" +
    '<div class="kb-v13-module-grip" title="拖这里改大小"></div>';
  syncModuleEl(el, m);
  return el;
}

/** 把方框的几何写进元素（拖动过程中只走这一条，不重建 DOM——重建会丢指针捕获） */
function syncModuleEl(el, m) {
  el.style.left = m.x + "px";
  el.style.top = m.y + "px";
  el.style.width = m.w + "px";
  el.style.height = m.h + "px";
}

/** 只把位置写回去，不重建——晶体拖动时要用 */
export function applyCrystalPositions(ctx) {
  const keys = ctx.model.crystalKeys;
  for (const el of ctx.canvas.querySelectorAll(".kb-v13-crystal")) {
    const key = el.dataset.key;
    if (!key) continue;
    const p = worldPosOf(ctx, key, keys);
    el.style.left = p.x + "px";
    el.style.top = p.y + "px";
    el.dataset.homeX = p.x;
    el.dataset.homeY = p.y;
  }
}

export function renderModules(ctx) {
  const layer = ensureLayer(ctx);
  layer.innerHTML = "";
  // 方框只活在画布模式下。别的档里 membership 照样留着（切回去还在），
  // 只是不画——**数据与显示分开**，切档不该动用户的归属。
  if (ctx.state.stage !== "canvas") return;
  for (const m of modulesOf(ctx)) layer.appendChild(buildModuleEl(ctx, m));
}

// ============================================================
// 改
// ============================================================

let seq = 0;
function newId() {
  seq += 1;
  return "m" + Date.now().toString(36) + "-" + seq;
}

/**
 * 新建一个方框，位置取当前**视口中心**对应的世界坐标。
 *
 * 取视口中心而不是世界中心：用户点了「+ 方框」，新的框就该出现在他**正看着的
 * 地方**。放到世界原点上的话，推远之后点新建会「什么都没发生」。
 */
export function addModule(ctx) {
  const stage = ctx.stage.getBoundingClientRect();
  const pz = ctx._panzoom;
  const c = pz
    ? pz.clientToWorld(stage.left + stage.width / 2, stage.top + stage.height / 2)
    : { x: 0, y: 0 };
  const m = {
    id: newId(),
    name: UNNAMED,
    x: Math.round(c.x - NEW_W / 2),
    y: Math.round(c.y - NEW_H / 2),
    w: NEW_W,
    h: NEW_H,
    parent: null,
  };
  const l = layoutOf(ctx);
  if (!Array.isArray(l.modules)) l.modules = [];
  l.modules.push(m);
  renderModules(ctx);
  if (ctx.refreshStageUi) ctx.refreshStageUi();
  return m;
}

/**
 * 删掉一个方框。三件事都要做，少一件都是一种「过一会儿才发现的坏」：
 *   1. 指向它的 membership **必须一起清掉**——不清的话，下次读盘时那些条目
 *      被 sanitizeMembership 静默丢弃，表现是「晶体自己散开」，不报错、查半天。
 *   2. 它的子框提到自己那一层去（parent 改指祖父），不然子框会变成孤儿：
 *      画得出来，但拖动父框时不再跟着走。
 *   3. 成员晶体**留在原地**——位置是独立的，不该跟着框一起消失。
 */
export function removeModule(ctx, id) {
  const l = layoutOf(ctx);
  const m = moduleById(ctx, id);
  if (!m) return false;
  const grand = m.parent || null;
  l.modules = modulesOf(ctx).filter((x) => x.id !== id);
  for (const d of descendantsOf(ctx, id)) {
    if (d.parent === id) d.parent = grand;
  }
  const mem = membershipOf(ctx);
  for (const [key, mid] of Object.entries(mem)) {
    if (mid === id) delete mem[key];
  }
  renderModules(ctx);
  if (ctx.refreshStageUi) ctx.refreshStageUi();
  return true;
}

/**
 * 把一个方框（连同它的子框和成员晶体）挪一段距离。
 *
 * **递归**，因为「框里有框」在 DOM 上是平的（见文件头）——
 * 父框走了，子框和成员必须自己走。
 */
export function moveModuleBy(ctx, id, dx, dy, seen) {
  const guard = seen || new Set();
  if (guard.has(id) || (!dx && !dy)) return;
  guard.add(id);
  const m = moduleById(ctx, id);
  if (!m) return;
  m.x += dx;
  m.y += dy;

  const mem = membershipOf(ctx);
  const l = layoutOf(ctx);
  if (!l.crystalPos) l.crystalPos = {};
  for (const [key, mid] of Object.entries(mem)) {
    if (mid !== id) continue;
    // 成员晶体必须**先落到 crystalPos 上**再挪。它可能本来没有记录
    // （一直待在默认排布上），不写的话它这一下是跟着框动了，
    // 下次渲染又跳回默认位置——看着就是「框动了，里面的晶体又跑回去了」。
    const keys = ctx.model.crystalKeys;
    const cur = l.crystalPos[key] || worldPosOf(ctx, key, keys);
    l.crystalPos[key] = { x: cur.x + dx, y: cur.y + dy };
  }
  for (const c of modulesOf(ctx)) {
    if (c.parent === id) moveModuleBy(ctx, c.id, dx, dy, guard);
  }
}

// ============================================================
// 拖晶体进方框
// ============================================================

/**
 * 一次晶体拖动结束时调用：看它落在哪个方框里，据此改归属。
 *
 * 落下时**同时把位置记进 crystalPos**。只记归属不记位置的话，一颗从没被拖过的
 * 晶体被放进框里之后，仍会画在它的默认位置上——而那个位置多半在框外，
 * 用户看到的是「拖进去了，但框是空的」。
 */
export function dropCrystal(ctx, key) {
  const keys = ctx.model.crystalKeys;
  const l = layoutOf(ctx);
  if (!l.crystalPos) l.crystalPos = {};
  const p = l.crystalPos[key] || worldPosOf(ctx, key, keys);
  l.crystalPos[key] = { x: p.x, y: p.y };

  const box = moduleAtPoint(ctx, p.x + CRYSTAL_SIZE / 2, p.y + CRYSTAL_SIZE / 2);
  const mem = membershipOf(ctx);
  if (box) mem[key] = box.id;
  else delete mem[key];
  if (ctx.refreshStageUi) ctx.refreshStageUi();
}

// ============================================================
// 交互：拖框 / 改尺寸 / 改名 / 删框
// ============================================================

/** 标题栏的高度量不出来（框还没画），落点取「框顶往下 12px」——一定在标题栏里 */
const BAR_PROBE_Y = 12;

function syncAllGeometry(ctx) {
  const layer = ensureLayer(ctx);
  for (const el of layer.querySelectorAll(".kb-v13-module")) {
    const m = moduleById(ctx, el.dataset.id);
    if (m) syncModuleEl(el, m);
  }
  applyCrystalPositions(ctx);
}

/** 松手时决定这个框属于谁：抓的是标题栏，就按标题栏的中心算「我把它放在哪儿了」 */
function dropModule(ctx, id) {
  const m = moduleById(ctx, id);
  if (!m) return;
  const cx = m.x + Math.min(m.w, 160) / 2;
  const cy = m.y + BAR_PROBE_Y;
  // 不能掉进自己或自己的后代肚子里——那会造出一个环，
  // 而环的下场是渲染无限递归 / 拖动时 delta 来回传。
  const box = moduleAtPoint(ctx, cx, cy, selfAndDescendants(ctx, id));
  m.parent = box ? box.id : null;
}

/**
 * 方框上的全部交互。走**事件委托**挂在方框层上——方框是每次渲染重建的，
 * 一个个绑会漏，而漏了不报错，只是「有的框能拖有的不能」。
 */
export function bindModuleInteractions(ctx) {
  const layer = ensureLayer(ctx);
  // ⚠️ **pointermove / pointerup 绑在舞台上，不是绑在方框层上。**
  //
  // 方框层是 `pointer-events:none` 的（框体不能抢事件，否则框里的晶体就点不着），
  // 于是指针一旦离开方框的矩形，事件的 target 就变成舞台——而舞台**不是方框层的
  // 祖先**，`pointermove` 再也冒泡不到那一层。grip 只有 18px 宽、阈值是 4px，
  // **第一步移动就已经出框**：表现是「拖右下角完全没反应」，而 pointerdown
  // 明明收到了（grip 自己有 pointer-events:auto），所以看起来格外像「事件丢了」。
  //
  // 舞台铺满视口、又在冒泡路径的顶端，绑它就没这个问题——panzoom 与晶体拖动
  // 也是这么绑的。
  //
  // pointerdown 留在层上：那里能靠 `stopPropagation` 干净地挡住舞台的「点空白」，
  // 而**同一个元素上的两个监听器之间 stopPropagation 是没用的**——留在层上
  // 才有明确的边界。
  const stageEl = ctx.stage;
  let drag = null;

  const cam = () => (ctx._panzoom ? ctx._panzoom.camera() : { x: 0, y: 0, k: 1 });

  layer.addEventListener("pointerdown", (e) => {
    if (ctx.state.stage !== "canvas" || e.button !== 0) return;
    const box = e.target && e.target.closest && e.target.closest(".kb-v13-module");
    if (!box) return;
    const id = box.dataset.id;
    const grip = e.target.closest(".kb-v13-module-grip");
    const bar = e.target.closest(".kb-v13-module-bar");
    if (!grip && !bar) return;
    const m = moduleById(ctx, id);
    if (!m) return;
    e.stopPropagation(); // 别让舞台把它当成「点空白」
    drag = {
      id: e.pointerId,
      kind: grip ? "resize" : "move",
      moduleId: id,
      el: box,
      sx: e.clientX,
      sy: e.clientY,
      k: cam().k || 1,
      w0: m.w,
      h0: m.h,
      moved: false,
      // 增量式：每一下只走「上一次到这里」的那一小段，delta 传播因此是递归一次
      // 而不是每帧重算一遍「相对起点」——后者在嵌套里会越传越乱。
      lastX: e.clientX,
      lastY: e.clientY,
    };
  });

  stageEl.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.sx) < DRAG_THRESHOLD && Math.abs(e.clientY - drag.sy) < DRAG_THRESHOLD) {
        return;
      }
      drag.moved = true;
      stageEl.setPointerCapture(drag.id);
      drag.el.classList.add("kb-v13-dragging");
    }
    const dx = (e.clientX - drag.lastX) / drag.k;
    const dy = (e.clientY - drag.lastY) / drag.k;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;

    if (drag.kind === "move") {
      moveModuleBy(ctx, drag.moduleId, dx, dy);
    } else {
      const m = moduleById(ctx, drag.moduleId);
      if (m) {
        m.w = Math.max(MIN_MODULE_W, drag.w0 + (e.clientX - drag.sx) / drag.k);
        m.h = Math.max(MIN_MODULE_H, drag.h0 + (e.clientY - drag.sy) / drag.k);
      }
    }
    syncAllGeometry(ctx);
  });

  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    d.el.classList.remove("kb-v13-dragging");
    try {
      stageEl.releasePointerCapture(e.pointerId);
    } catch (err) {
      /* 指针没了 */
    }
    if (!d.moved) return; // 没真拖 = 一次普通点击，留给下面的 click
    if (d.kind === "move") dropModule(ctx, d.moduleId);
    // 层序可能变了（换了父），重建一次最省事——松手之后不再有指针捕获，
    // 重建不会打断任何东西。
    renderModules(ctx);
    if (ctx.refreshStageUi) ctx.refreshStageUi();
    swallowNextClick(layer);
  };
  stageEl.addEventListener("pointerup", end);
  stageEl.addEventListener("pointercancel", end);

  // 点名字 → 就地改名；点 × → 删框
  layer.addEventListener("click", (e) => {
    if (ctx.state.stage !== "canvas") return;
    const box = e.target.closest && e.target.closest(".kb-v13-module");
    if (!box) return;
    e.stopPropagation();
    const id = box.dataset.id;
    if (e.target.closest(".kb-v13-module-del")) {
      removeModule(ctx, id);
      return;
    }
    const nameEl = e.target.closest(".kb-v13-module-name");
    if (!nameEl) return;
    const m = moduleById(ctx, id);
    if (!m) return;
    beginInlineRename(nameEl, m.name, (name) => {
      const cur = moduleById(ctx, id);
      if (!cur) return;
      cur.name = name;
      renderModules(ctx);
      if (ctx.refreshStageUi) ctx.refreshStageUi();
    });
  });
}
