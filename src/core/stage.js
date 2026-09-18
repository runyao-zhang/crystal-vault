// 3.0 刀 2：显示模式的枚举与切换。
//
// 四档，作用域两两互斥：
//   ring      根层   —— 晶体围成一圈（今天的默认，一字未改）
//   canvas    根层   —— 在一块可以平移缩放的平面上自由摆放
//   grid      层内   —— 某个晶体里的卡阵（今天的默认，一字未改）
//   storyline 层内   —— 某个晶体里的全部卡片同屏 + 按双链连线（刀 5）
//
// 为什么不拆成「环/画布」×「卡阵/故事线」两个独立开关：两个轴永远不会同时
// 成立（根层不可能显示故事线），拆开就凭空多出两个无意义的格子，而每个格子
// 都是一条要写测试、要写过渡、要写退出路径的状态。
//
// ⚠️ 命名：这里是 `state.stage`（一个字符串），而 `ctx.stage` 是**舞台那个 DOM 节点**。
// 两者同名但完全不同，读代码时留意上下文。不改成别的名字是因为 `state.stage`
// 说的正是「舞台里画什么」，而 `mode` 已经被「回忆/复习」占了（state.mode）。
//
// 关键不变量：**stage 是推导出来的，不是另存的**。它由「人在根层还是层内」+
// 偏好里的两档决定，和 crystalPath 由 openCrystal 推出来是同一条纪律。

/**
 * 这一档做出来了没有。
 *
 * 存在的意义是：**没做出来的档不许摆出来**。刀 2 第一版把「故事线」也摆上了，
 * 于是进晶体之后按那颗按钮——偏好改了、按钮上的字也翻了，但渲染器那边没人接，
 * 屏幕一个像素不动。**按了没反应而按钮自己变了字，比不显示更糟**：
 * 它让人以为坏了，而不是「还没做」。
 *
 * 刀 5 落地时把 storyline 改成 true，按钮自己就回来了——不必再动别处的代码。
 */
const AVAILABLE = { ring: true, canvas: true, grid: true, storyline: true };

/**
 * 此刻该用哪一档。
 *
 * 推导而不是存一份的理由：存一份就多了一处会跟 openCrystal 不同步的状态——
 * 那种 bug 的表现是「退到环上了但画布还在」，而且只在特定顺序下复现。
 */
export function stageOf(ctx) {
  const prefs = (ctx.state && ctx.state.prefs) || {};
  const inLevel = !!(ctx.state && ctx.state.openCrystal);
  const want = inLevel
    ? prefs.levelStage === "storyline"
      ? "storyline"
      : "grid"
    : prefs.rootStage === "canvas"
      ? "canvas"
      : "ring";
  // 存档里可能留着一个**还没做出来的档**（比如刀 2 那版把「故事线」摆出来给人点过，
  // 值就写进偏好了）。这里跟着 AVAILABLE 退回去，老存档就自愈了，不必去动
  // sanitizePrefs——偏好层只认「这个名字合不合法」，不认「做没做出来」，
  // 那两件事分开管：哪天故事线上线了，那些存档里的值自己就活了。
  if (AVAILABLE[want]) return want;
  return inLevel ? "grid" : "ring";
}

/** 这一档要不要「世界层带相机」 */
export function isCameraStage(stage) {
  return stage === "canvas" || stage === "storyline";
}

function setPref(ctx, key, value) {
  ctx.state.prefs = { ...(ctx.state.prefs || {}), [key]: value };
  // 不把 prefs 传出去：落盘那一份要过 collectPrefs（它自己会 sanitize），
  // 由 ctx 那边从 state 上取，免得这里也拼一遍形状。
  if (ctx.savePrefs) ctx.savePrefs();
}

/**
 * 切到某一档并**把舞台重新搭出来**。
 *
 * 这一段必须做四件事，少一件就是一种「点了没反应」或者「两条逻辑抢一个事件」：
 *
 *   1. **退订滚轮**。翻页滚轮绑在 stage 上（cardgrid.js 的 bindScrollListeners），
 *      而 canvas 是 stage 的后代——不退订的话，画布上滚轮会**同时**触发翻页和缩放。
 *   2. 改偏好（这是**偏好**不是视图状态：它说的是「我喜欢怎么看」，
 *      不是「我上次看到哪儿」，所以存 prefs 那个键，清视角不该把它清了）。
 *   3. 重搭舞台（renderCrystals 会按新的 state.stage 分发）。
 *   4. 收支两条 UI：左右两栏按钮在画布模式下要藏起来（那儿没有两栏可谈），
 *      容器上挂一个模式类给 CSS 用（gridStage 的 overflow 要放开）。
 */
export function applyStage(ctx) {
  const next = stageOf(ctx);
  const prev = ctx.state.stage;
  ctx.state.stage = next;

  if (prev !== next) {
    // 1. 先退订。无论从哪一档到哪一档，滚轮的归属都变了。
    if (ctx.unbindScrollListeners) ctx.unbindScrollListeners();
    if (ctx.stageHooks && ctx.stageHooks.onLeave) ctx.stageHooks.onLeave(prev, next);
  }

  // 4. CSS 钩子
  if (ctx.fs) ctx.fs.classList.toggle("kb-v13-canvas-mode", next === "canvas");

  if (ctx.stageHooks && ctx.stageHooks.onEnter) ctx.stageHooks.onEnter(next, prev);

  if (ctx.refreshFacets) ctx.refreshFacets();
  return next;
}

/**
 * 用户在顶栏按了「画布 / 晶体环」。
 *
 * 换的是**当前作用域**那一档：在根层就换根层那档，在某颗晶体里就换层内那档。
 * 一个按钮管一处，用户不必先想「我现在在哪一档的作用域里」。
 */
export function toggleStage(ctx) {
  const cur = stageOf(ctx);

  // 没做出来的档按不动。挡在这里而不是只把按钮藏起来：按钮藏了，快捷键、
  // 控制台、将来别处的入口仍可能走到这条路上——而它一旦走通，用户得到的是
  // 「按钮翻字了、屏幕没动」这种最让人疑惑的结果。
  const next = otherStage(ctx);
  if (!AVAILABLE[next]) return ctx.state.stage;

  if (cur === "canvas" || cur === "ring") {
    setPref(ctx, "rootStage", cur === "canvas" ? "ring" : "canvas");
  } else {
    setPref(ctx, "levelStage", cur === "storyline" ? "grid" : "storyline");
  }
  applyStage(ctx);
  // ⚠️ **不写 `if (ctx.renderCrystals)`**。这里原来是防御性写法，而它恒定取假
  // ——app.js 那道线当时压根没接上，于是「切画布不重画」被这个 if 吞成了
  // 「什么都不发生」：晶体一直待在环上算出来的位置，只是被 canvas 的 transform
  // 推着走，看起来**确实像**个画布，测试因此全绿。
  //
  // 教训：核心总是会被应用层完整接线的，那种「万一没有呢」的 if 不会让人更安全，
  // 只会把「线没接」这种必死的错误降级成静默的哑行为。该炸就让它炸。
  ctx.renderCrystals();
  // 光重画舞台还不够：**卡阵里的卡片是 applyExpanded 填进去的**，
  // 而 renderCrystals 只画晶体与背景。少了这一句，从故事线切回卡阵时
  // 卡片区是空的——节点清掉了、卡也没来，屏幕上一片干净。
  if (ctx.landAfterStageChange) ctx.landAfterStageChange();
  return ctx.state.stage;
}

/**
 * 从某一层退出去时，把**层内那一档**收回卡阵。
 *
 * 用户定的：故事线里点「‹ 返回」之后，再进来应该是卡阵，而不是又落回故事线。
 * 他的原话是「我希望这时候恢复卡阵模式」——把「返回」理解成**离开这个故事线视图**，
 * 那它当然该把这一档一起带走。返回之后还停在故事线上，等于这个按钮只退了一半。
 *
 * 只管层内那一档：根层的「环 / 画布」是一件长期偏好（画布是工作台，不该因为
 * 点了一次返回就被换成环），层内的「卡阵 / 故事线」是**看某一颗晶体的方式**，
 * 那种东西跟着那次浏览走才对。
 *
 * 调用点是两个「往上走」的路口（drillUp / drillToDepth），**不是** collapseCrystal：
 * 后者也被「打开晶体库时恢复上次看到哪儿」走到，那条路上把偏好抹掉是另一回事。
 */
export function resetLevelStage(ctx) {
  if ((ctx.state.prefs || {}).levelStage !== "storyline") return false;
  setPref(ctx, "levelStage", "grid");
  return true;
}

/** 换一档之后会去到哪儿 */
function otherStage(ctx) {
  const cur = stageOf(ctx);
  if (cur === "canvas") return "ring";
  if (cur === "storyline") return "grid";
  if (cur === "ring") return "canvas";
  return "storyline";
}

/**
 * 顶栏那颗按钮此刻该显示什么（供 UI 与测试读同一份口径）。
 * 返回 `null` 表示**这一档没有可换的去处**，调用方应当把按钮收起来。
 */
export function stageLabel(ctx) {
  if (!AVAILABLE[otherStage(ctx)]) return null;
  const s = stageOf(ctx);
  if (s === "canvas") return "晶体环";
  if (s === "storyline") return "卡阵";
  if (s === "ring") return "画布";
  return "故事线";
}
