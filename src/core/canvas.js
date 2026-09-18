// 3.0 刀 2：画布模式——晶体摆在一块固定的世界平面上，整片可以平移缩放。
//
// 世界坐标是**固定的**（1440×900，见 layout 的 REF_W/REF_H），不随视口变。
// 这一点是有意的：位置若按视口算，用户平移一段之后拉一下窗口，
// 整片晶体就会跳一下——因为「世界」跟着视口一起变了。固定的世界 + 一台相机，
// 拉窗口只是换了个取景框，东西都在原地。
//
// 与 crystals.js 的关系：**只能单向**（本文件 import 它的 makeCrystalEl，
// 它不 import 本文件）。调度那一下走 `ctx.renderCanvasStage` 这根线，
// 和仓里 refreshOrphans / hideTooltip 那几个走 ctx 是同一个套路——
// 互相 import 会绕成环。

import { CRYSTAL_SIZE, REF_W, REF_H } from "./layout.js";
import { bindItemDrag } from "./itemdrag.js";
import { makeCrystalEl, placeCrystal } from "./crystals.js";
import { bindPanZoom } from "./panzoom.js";

/** 世界平面的尺寸。固定值，与当前视口无关（理由见文件头）。 */
export const WORLD = { w: REF_W, h: REF_H };

/**
 * 一颗晶体的默认世界坐标（没有 crystalPos 记录时用这个）。
 *
 * 就是环上那套算法，只是把中心从「舞台中心」换成「世界中心」。
 * 于是从环切到画布时，晶体相对彼此的**排布一模一样**——变的只是
 * 现在它躺在一块更大的平面上，可以推着看。
 */
export function defaultWorldPos(key, keys) {
  const i = keys.indexOf(key);
  const n = keys.length || 1;
  const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
  const radius = Math.min(WORLD.w, WORLD.h) * 0.28;
  return {
    x: WORLD.w / 2 + Math.cos(angle) * radius - CRYSTAL_SIZE / 2,
    y: WORLD.h / 2 + Math.sin(angle) * radius - CRYSTAL_SIZE / 2,
  };
}

// ============================================================
// 布局草稿（3.0 刀 3）
// ============================================================
//
// 「布局」是这四样：相机、方框、归属、晶体位置。它们的写入跟「上次看到哪儿」
// 完全不是一回事——那四样是浏览留下的痕迹，这四样是用户**摆**出来的东西。
//
// 进画布模式时开一份草稿，拖动只改草稿；离开画布时提交。
//
// 为什么不直接写 state.view（那更简单）：**「恢复默认」需要有个可以丢掉的东西**。
// 没有草稿的话，拖动早就落盘了，「恢复默认」就只能是一句道歉。有了草稿，
// 那两颗按钮才都是真的——这也是我为什么**没有**做「记住当前」那颗按钮：
// 在自动落盘的模型下它点了会什么都不发生，而那正是我刚在「故事线」那颗按钮上
// 修掉的谎。默认就是记住的，不想要就点「恢复默认」——比摆一颗假的诚实。

/** 此刻算数的布局：有草稿用草稿，没有就用落盘那份 */
export function layoutOf(ctx) {
  return ctx.state.draft || ctx.state.view || {};
}

/** 开一份草稿。已经有了就不动——草稿活在整个「在画布里的这段时间」。 */
export function beginDraft(ctx) {
  if (ctx.state.draft) return;
  const v = ctx.state.view || {};
  // 深拷一层：草稿上的改动绝不能顺着引用改到 state.view 上去，
  // 否则「恢复默认」什么也回不去。
  ctx.state.draft = {
    camera: { x: 0, y: 0, k: 1, ...(v.camera || {}) },
    modules: (v.modules || []).map((m) => ({ ...m })),
    membership: { ...(v.membership || {}) },
    crystalPos: { ...(v.crystalPos || {}) },
    // ⚠️ 加了新字段**记得也加到这里**。这个是踩过的：刀 5 的手工连线一开始
    // 没被拷进来，于是进故事线那一刻草稿里是空的，写进去的是"一条都没有"，
    // 关库提交时又把存档盖成空的——**用户画的线静默消失**。
    // 草稿是"布局的第五样"，它漏一样，那样就是只读的。
    cardLinks: JSON.parse(JSON.stringify(v.cardLinks || {})),
  };
}

/** 草稿和落盘那份**是不是同一回事**（决定要不要亮「未保存」） */
export function isDraftDirty(ctx) {
  if (!ctx.state.draft) return false;
  const a = ctx.state.draft;
  const b = ctx.state.view || {};
  const pick = (o) => ({
    c: o.camera || {},
    m: o.modules || [],
    b: o.membership || {},
    p: o.crystalPos || {},
    // 「未保存」小点也必须算上手工连线，否则画了一根线屏幕却不说"未保存"——
    // 那个标记的全部意义就是"我刚摆的东西算不算数"，少说一样就等于说假话。
    l: o.cardLinks || {},
  });
  return JSON.stringify(pick(a)) !== JSON.stringify(pick(b));
}

/** 提交：草稿并进 state.view 并立刻落盘 */
export function commitDraft(ctx) {
  if (!ctx.state.draft) return false;
  const d = ctx.state.draft;
  ctx.state.view = { ...(ctx.state.view || {}), ...d };
  ctx.state.draft = null;
  if (ctx.flushViewState) ctx.flushViewState();
  else if (ctx.persistViewState) ctx.persistViewState();
  return true;
}

/**
 * 「恢复默认」：丢掉草稿，布局四样一起回默认。
 *
 * 相机回原点、「默认」只准有一个含义——不要做成「有的东西回默认、有的留在原地」，
 * 那种半吊子默认用户没法预期。晶体的位置清空之后由布局算法重新摆（见 worldPosOf）。
 */
export function resetLayout(ctx) {
  ctx.state.draft = null;
  const v = ctx.state.view || {};
  ctx.state.view = {
    ...v,
    camera: { x: 0, y: 0, k: 1 },
    modules: [],
    membership: {},
    crystalPos: {},
  };
  if (ctx.flushViewState) ctx.flushViewState();
  else if (ctx.persistViewState) ctx.persistViewState();
  // 相机紧接着由 applyCamera 按新的默认重铺（它在 renderCrystals 那一趟里）
  return true;
}

/** 一颗晶体此刻该在哪：有记录用记录，没有就用默认排布 */
export function worldPosOf(ctx, key, keys) {
  const saved = layoutOf(ctx).crystalPos;
  const p = saved && saved[key];
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y };
  return defaultWorldPos(key, keys);
}

/** 所有晶体的世界包围盒——`fit()` 拿它把整片框进视口 */
export function worldBounds(ctx) {
  const keys = ctx.model.crystalKeys;
  if (!keys.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const k of keys) {
    const p = worldPosOf(ctx, k, keys);
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + CRYSTAL_SIZE);
    y1 = Math.max(y1, p.y + CRYSTAL_SIZE);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * 画布模式的晶体层。**和 renderRing 是两套**，不是同一个函数换个参数——
 * 环的位置按视口算、画布的位置按世界算，混成一个函数迟早会有人传错参数。
 */
export function renderCanvasStage(ctx) {
  const keys = ctx.model.crystalKeys;
  keys.forEach((key, i) => {
    const el = makeCrystalEl(ctx, key, CRYSTAL_SIZE, i);
    const p = worldPosOf(ctx, key, keys);
    placeCrystal(el, p.x, p.y);
    ctx.canvas.appendChild(el);
  });
}

// ============================================================
// 相机
// ============================================================

/** 相机是不是从没被真正动过（还是那份出厂默认值） */
function isPristine(view) {
  const c = (view && view.camera) || {};
  return (Number(c.x) || 0) === 0 && (Number(c.y) || 0) === 0 && (Number(c.k) || 1) === 1;
}

/**
 * 建/取这个屏幕上的平移缩放器。它绑在 canvas 上，而 canvas 从挂载起就一直在，
 * 所以这一个实例可以活很久——不用每次渲染都重建。
 */
export function ensurePanZoom(ctx) {
  if (ctx._panzoom) return ctx._panzoom;
  const view = ctx.state.view || {};
  // ⚠️ 绑的是**舞台**，不是 canvas。
  //
  // canvas 是被变换过的：平移把它推走之后，舞台边上会空出一条**没有 canvas 的
  // 死区**——在那儿按下去抓不到任何东西，于是推出去就推不回来，推得够远直接卡死。
  // 舞台永远铺满视口，绑它就没有这个问题。
  //
  // wheel 也一起绑在舞台上了，那不会和翻页滚轮打架：翻页那对监听只在
  // **进晶体时**才绑（cardgrid 的 bindScrollListeners），而画布模式是根层的，
  // 那时它们根本没绑。两边同时存在的唯一一档是刀 5 的故事线，由
  // stage.js 的 applyStage 在切档时显式退订来保证互斥。
  // 手势落点与测量基准都是舞台；**被变换的是 canvas**——三者绝不能混。
  // 第一版把 transform 写到舞台上（落点即变换目标），于是「一边算一边改尺子」，
  // 世界坐标全错、晶体跟着舞台一起动，症状是「一缩放就跑飞」。
  ctx._panzoom = bindPanZoom({ gesture: ctx.stage, view: ctx.canvas, frame: ctx.stage }, {
    initial: layoutOf(ctx).camera || { x: 0, y: 0, k: 1 },
    onChange(cam) {
      // 写**草稿**，不直接写 state.view —— 「恢复默认」要有个能丢掉的东西。
      // （落盘时机由 commitDraft 管：离开画布时提交。）
      const layout = layoutOf(ctx);
      if (layout) layout.camera = cam;
      if (ctx.refreshStageUi) ctx.refreshStageUi();
    },
  });
  return ctx._panzoom;
}

/** 相机进/出：进画布模式时套上，离开时**清干净** */
export function applyCamera(ctx, active) {
  if (!active) {
    // ⚠️ 必须清成空串，不能写成 translate(0,0) scale(1)。
    // 非画布模式下 stage 的几何代码全都要「逐像素等于改动前」，
    // 而空的 transform 才是 `none`；写成单位矩阵的话 getComputedStyle
    // 会给你 matrix(1,0,0,1,0,0)，层叠上下文也就跟着建起来了。
    if (ctx.canvas) ctx.canvas.style.transform = "";
    if (ctx._panzoom) {
      ctx._panzoom.destroy();
      ctx._panzoom = null;
    }
    return;
  }
  const pz = ensurePanZoom(ctx);
  // 读**草稿**：进画布时草稿刚从 state.view 拷过来，所以首次进来读到的就是
  // 上次落盘那份；而这一趟里被拖动改过的值也在草稿上，不会被旧的覆盖掉。
  const layout = layoutOf(ctx);
  // 出厂默认的相机 = 还没摆弄过。这时**框一下**，让整片落进视口；
  // 否则世界是 1440×900 而视口可能只有 1200×700，一进去就看不全。
  // 用户自己推过之后就不再自动框——「上次画布推到哪儿」是他摆的，不该被覆盖。
  if (isPristine(layout)) {
    // ⚠️ 走 `ctx.worldBounds()`，**不是本文件那个 worldBounds**。
    // 那个算的是晶体的包围盒；层内（故事线）要框的是卡片节点，两回事。
    // 写成局部那个的话，切到故事线时 fit 会拿晶体的尺寸去框一屏卡片——
    // 表现是「一进去节点就在屏幕外面」，而相机数字看着还挺正常。
    // app.js 那边按档分发，这里只认这一个口子。
    pz.fit(ctx.worldBounds(), { padding: 72, maxK: 1 });
    // 自动框**不是用户动作**，所以要同时写进落盘那份——不写的话，一进画布
    // 草稿和存储就不一样了，「未保存」标记当场亮起，而用户什么都还没动。
    // 一个永远亮着的标记等于没有标记。
    if (ctx.state.view) ctx.state.view.camera = pz.camera();
  } else {
    pz.setCamera(layout.camera || { x: 0, y: 0, k: 1 }, { silent: true });
  }
}

// ============================================================
// 拖晶体（3.0 刀 3）
// ============================================================

/** 超过这个像素才算「拖」，之内当点击——不然晶体就选不中、进不去了 */
const DRAG_THRESHOLD = 4;

/**
 * 让画布里的晶体可以拖。
 *
 * 三条纪律都在 itemdrag.js 里（阈值之内不捕获 / 位移要除以缩放 / 拖完吞 click），
 * 连同那条最贵的教训——**事件绑舞台，不绑被拖的那一层**。这里只剩「晶体是什么、
 * 它在哪、落到哪儿算数」这几句。
 */
export function bindCrystalDrag(ctx) {
  bindItemDrag(ctx, {
    selector: ".kb-v13-crystal",
    keyOf: (el) => el.dataset.key,
    stage: "canvas",
    posOf: (c, key) => worldPosOf(c, key, c.model.crystalKeys),
    writePos: (c, key, p) => {
      const l = layoutOf(c);
      if (l.crystalPos) l.crystalPos[key] = p;
    },
    // 落到哪儿了：可能掉进某个方框（归属变了），也可能掉在空白处（退出原来那个）。
    // 判定走 modules.js，这里只负责喊一声。
    onDrop: (c, key) => c.onCrystalDropped(key),
  });
}
