// 3.0 刀 34：「**就摆在你正看着的地方**」——新东西落座的视口中心。
//
// 用户 09-29 报的：「新建卡片或者收纳方框时候，不建在当前窗口的中央，而是建立在
// 固定的地方，如果我的视口远离那个固定位置，还要回去找」。
//
// 两个都确实是写死的：收纳方框建在世界的 (60,60)（`NEW_BOX_X/Y`），而新建的卡片
// 干脆没有位置——它落到**排布算法自己的坐标系**里（也是从原点起算的）。
// 用户的视口推远之后，新建的东西就在屏幕外面，只能推回去找。
//
// 这个模块只做一件事：问**当前这台相机**，视口正中对应的世界坐标是哪儿。
// 三种东西共用它：引进来的卡、新建的收纳方框、新建的卡片。
//
// ⚠️ 量不到就**回 null**，调用方自己退到各自的默认落点。量不到的场合是真的
// （还没进相机档、窗口收进收纳栏、舞台尺寸是 0×0），而那会儿"视口中心"这个
// 概念本来就不存在——硬凑一个 0,0 出来比回 null 更糟。

/**
 * 视口正中对应的**世界坐标**（没进相机档 / 量不到就回 null）。
 *
 * ⚠️ 相机在每一屏是**各有一台**的：晶体库那台在 `ctx._panzoom`，结构窗那台是
 * 影子对象上的 `fake._panzoom`（它指向那一扇窗自己的 panzer，见 embedstory）。
 * 所以这个函数必须吃"当前那一屏的 ctx"，不能拿全局那个。
 */
export function viewportCenter(ctx) {
  return viewportPoint(ctx, 0.5, 0.5);
}

/**
 * 3.0 刀 39：**"这一层上某个位置，对应世界坐标的哪儿"**。
 *
 * `fx` / `fy` 是**画面里的比例**：`(0,0)` 是左上角、`(1,1)` 是右下角、
 * `(0.95, 0.5)` 是"右边留 5%、上下居中"。
 *
 * ⚠️⚠️ **这个函数存在的全部意义就是那次换算。** 用户 09-29 报的
 * 「新卡还是建在默认坐标，不在我打开的这个视口里」，根因就是有人（我）
 * 把 `ctx.viewRect()` 的结果**当世界坐标用了**——而它给的是**这一层在屏幕上的矩形**
 * （全屏时就是 `0,0,窗口宽高`）。屏幕坐标和世界坐标只有在"相机停在原点、缩放 1"
 * 时才重合，所以那个位置跟用户推到哪儿**毫无关系**。
 *
 * 用户原话把这件事说得比我清楚：「**当前视口是指当前正在打开的那个视口，
 * 不是原始视口——原始视口是最初默认打开的位置**」。`clientToWorld` 读的正是
 * **相机此刻**的位置，所以它天然就是"当前视口"。
 *
 * ⚠️ 量不到就**回 null**，调用方各自退到默认落点。量不到的场合是真的
 * （还没进相机档、窗口收进收纳栏、舞台尺寸 0×0）。
 */
export function viewportPoint(ctx, fx, fy) {
  const pz = ctx && ctx._panzoom;
  const st = ctx && ctx.stage;
  if (!pz || !st || typeof pz.clientToWorld !== "function") return null;
  const r = st.getBoundingClientRect ? st.getBoundingClientRect() : null;
  // 0×0 = 这一屏此刻不在屏幕上（收进收纳栏 / 被挂起 / 还没量过）。
  if (!r || r.width < 2 || r.height < 2) return null;
  const ax = Number.isFinite(fx) ? Math.min(Math.max(fx, 0), 1) : 0.5;
  const ay = Number.isFinite(fy) ? Math.min(Math.max(fy, 0), 1) : 0.5;
  try {
    const w = pz.clientToWorld(r.left + r.width * ax, r.top + r.height * ay);
    if (Number.isFinite(w.x) && Number.isFinite(w.y)) return { x: w.x, y: w.y };
  } catch (e) {
    /* 相机半路被拆了——回 null，让调用方用默认落点 */
  }
  return null;
}
