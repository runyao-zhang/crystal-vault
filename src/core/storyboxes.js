// 3.0 刀 23：故事线/结构窗里的**收纳方框**。用户 09-27 要的。
//
// 一句话：**把几张卡收进一个可以命名、可以收起的框里**，框里的卡照样能往外连蓝线。
//
// ---- 框有两个来源，这是这一节唯一需要先讲清的事 ----
//
//   **晶体框**（算出来的）  当前这一层下面，**每一个直接子晶体**自动一个框。
//                           成员 = 那颗子晶体（含它的子树）里的卡，名字默认 = 文件夹名。
//                           ⚠️ **不落盘**：文件夹一改名，落盘的成员表就和盘上对不上了，
//                           而那种错法没有任何东西会报出来。算出来的永远是对的。
//   **手动框**（存下来的）  用户自己建的，成员是明确的卡片路径，存在视图状态的 `boxes`。
//
// 两者共用同一套东西：同一个 id 空间、同一张 `boxNames` 名字覆盖表、
// 同一个 `collapsedBoxes` 收起表、同一套渲染与交互。**只有成员怎么来不一样。**
//
// ---- 收起之后（用户第 4 条）----
//
// 框一收起，里面的卡不画、**连着它们的线也不画**。但「那边还有东西」这件事不能丢：
//   · 外面凡是**有蓝线连进去**的卡，卡上点一个**黄色实心圆点**；
//   · 鼠标悬停那张卡时，**和它有关联的、正收着的框**，边框绕一圈闪。
// 不这么做的话，收起等于「把线删了」——而用户明明没删，那读起来是「我的双链丢了」。

import { importsUnder } from "./storyimports.js";
// 3.0 刀 35：框的落盘（每颗晶体一个 `.crystal-boxes.json`）。见 boxfile.js 头上那段。
import { queueBoxFile } from "./boxfile.js";

const BOX_PAD = 22;
/** 标题栏高度。收起时那个框就只剩这一条。 */
const BAR_H = 26;
/** 收起态的宽度：够写下一个名字。 */
const COLLAPSED_W = 220;
/** 手动框的默认尺寸与下限。**框是你画的**，所以它得有个一开始就够大的身子
 *  ——第一版拿"一张卡那么大"当空框，落点小得几乎拖不进去。 */
const MIN_BOX_W = 260;
const MIN_BOX_H = 180;
const DEFAULT_BOX_W = 360;
const DEFAULT_BOX_H = 260;
/** 新框落座的起点。用手动框的个数错开，免得连建两个叠在一起。 */
const NEW_BOX_X = 60;
const NEW_BOX_Y = 60;

/** 晶体的 key 用 `c:` 前缀，手动框用 `m:`——两套 id 同一个空间，不会撞。 */
export const crystalBoxId = (key) => "c:" + key;
const isManualBoxId = (id) => String(id || "").indexOf("m:") === 0;

/** 当前这一层的**直接子晶体** key。`cardsUnder` 是递归的，这里只要一层。 */
function childKeys(ctx, path) {
  const p = path || [];
  try {
    return (ctx.model.keysAt ? ctx.model.keysAt(p) : []) || [];
  } catch (e) {
    return [];
  }
}

function cardsUnderPath(ctx, path) {
  const out = [];
  const walk = (p) => {
    for (const c of ctx.model.cardsAt ? ctx.model.cardsAt(p) || [] : []) out.push(c);
    for (const k of childKeys(ctx, p)) walk(p.concat([k]));
  };
  walk(path || []);
  return out;
}

/** 视图状态里那张名字表。收起表和框表同理——**读防御，写前先确保形状**。 */
function view(ctx) {
  const st = ctx && ctx.state ? ctx.state : null;
  if (!st) return null;
  // ⚠️ **走草稿，不走 state.view** —— 和 `cardLinks` / `crystalPos` / `linkSides`
  // 那些布局状态同一条规矩（`canvas.js` 的 `layoutOf` 就是 `draft || view`）。
  //
  // 为什么这条是硬的：进故事线（含阅读器里那扇结构窗）就是进相机档，那一刻
  // `beginDraft` 会开一份草稿；关库时 `commitDraft` 把草稿铺回 `state.view`。
  // 建框只写 `state.view` 的话，提交那一刻会被**草稿里那份旧快照盖掉**——
  // 表现是「在故事线里建的框，一关库就没了」，而且不报错。
  const v = st.draft || st.view;
  return v && typeof v === "object" ? v : null;
}

function namesOf(ctx) {
  const v = view(ctx);
  const n = v && v.boxNames;
  return n && typeof n === "object" && !Array.isArray(n) ? n : {};
}

function collapsedOf(ctx) {
  const v = view(ctx);
  return v && Array.isArray(v.collapsedBoxes) ? v.collapsedBoxes : [];
}

/**
 * 3.0 刀 33：这一层是哪一层。与 `cardLinks` / `imports` 用的是同一把钥匙
 * ——`crystalPath` 是**链**（`resolveChain(key)`，如 `["Python","Python/数据分析"]`）。
 *
 * ⚠️ 一把钥匙写两遍迟早会漂（一处写成 key、一处写成链），所以这一层的
 * 每个函数都走它，不再就地 `join`。
 */
const keyOf = (path) => (path || []).join(" ");

/**
 * 读某一层的框表。**只读，一个字节都不改。**
 *
 * ⚠️ 这一条是硬的：`assignCards`（每拖一次卡就跑）要靠它判"这一层有没有框"，
 * 而它要是顺手 `v.boxes[k] = []`，`isDraftDirty` 的 `x: o.boxes` 就会当场
 * 和存档那份对不上——**屏幕右下角那个「未保存」小点会无缘无故亮起来**，
 * 而用户什么都没动。一个永远亮着的标记等于没有标记。
 */
function readBucket(ctx, path) {
  const v = view(ctx);
  const t = v && v.boxes;
  if (!t || typeof t !== "object" || Array.isArray(t)) return null;
  const list = t[keyOf(path)];
  return Array.isArray(list) ? list : null;
}

/** 某一层的手动框（没有就当空的）。**每帧都会调，所以走只读那条。** */
function manualOf(ctx, path) {
  return readBucket(ctx, path) || [];
}

/** 所有层的手动框（按 id 找框、分配新 id 要跨层看）。 */
function allBoxes(ctx) {
  const v = view(ctx);
  const t = v && v.boxes;
  if (!t || typeof t !== "object" || Array.isArray(t)) return [];
  const out = [];
  for (const list of Object.values(t)) if (Array.isArray(list)) out.push(...list);
  return out;
}

/**
 * 按 id 找一个框，**跨层找**。
 *
 * 能跨层是因为 **id 是全局唯一的**（`createBox` 分配新号时会扫所有层，
 * 见那边）。这样 `boxNames` / `collapsedBoxes` 那两张按 id 索引的表
 * 一个字都不用改——它们的键本来就要求全局唯一。
 */
function findBox(ctx, id) {
  const s = String(id || "");
  if (!s) return null;
  for (const b of allBoxes(ctx)) if (String(b.id) === s) return b;
  return null;
}

/** 这个文件夹**直属**的卡（不含子文件夹里的）。珊瑚橙分割线要的就是它。 */
function ownPaths(ctx, path) {
  const out = [];
  for (const c of ctx.model.cardsAt ? ctx.model.cardsAt(path) || [] : []) out.push(c.path);
  return out;
}

/**
 * 3.0 刀 47（用户 10-01 第 1 条）：递归发金框——`path` 底下**每一层**文件夹，
 * 只要子树里有卡就发一个。
 *
 * ---- 为什么非改不可 ----
 *
 * 原来只有**直接子晶体**发框，成员是它的**整棵子树**。于是 A 里嵌着 B1、B2，
 * B2 里又嵌着 C 的时候，屏幕上只有 A 一个金框，四层的卡全摊平混在一起——
 * **层级完全看不出来**，而这正是这个窗口存在的意义。
 *
 * 现在每一层都发，框就自然嵌套了。用户拍板的画法（横排切）：
 *   · 一个框内部，**左边是它自己的卡，右边是它的子文件夹**；
 *   · 两者之间一条**珊瑚橙 `#FF6B6B` 实线**（跨层）；
 *   · 兄弟子文件夹之间一条**金色实线**（同级，金同金框的金）。
 * 分割线怎么算见下面 `splitLines`。
 *
 * ---- 成员仍然是「整棵子树」，这一条是硬的 ----
 *
 * 不是只算直属的那些。三条理由，少一条都会当场出洋相：
 *   · **父框的矩形 = 成员包围盒**——成员不全，子框就画到父框外面去了；
 *   · 拖动按 `paths` 整体平移（用户第 4 条），漏掉后代就是"拖了父框，
 *     子框和里面的卡留在原地"；
 *   · 收起也靠它：收一个框要把里面**所有后代**一起收掉。
 *
 * 而"这一层自己的卡"单独挂在 `own` 上——珊瑚橙线要的正是这两者之差。
 *
 * ⚠️ **顺序即层叠顺序**：这里父先子后（`out` 是同一个数组，手动框最后才 push），
 *    同档 z-index 下 DOM 顺序就决定了子框压在父框上。别改成先子后父。
 */
function emitCrystalBoxes(ctx, path, parentId, names, collapsed, out) {
  for (const k of childKeys(ctx, path)) {
    const sub = (path || []).concat([k]);
    const kids = cardsUnderPath(ctx, sub);
    // 一个空框在屏幕上是个没有解释的方印。但**"自己没卡、下面有卡"的文件夹
    // 照样要发**——`kids` 是递归的，已经把它算进来了，它就是有内容的那一层。
    if (!kids.length) continue;
    const id = crystalBoxId(sub.join("/"));
    out.push({
      id,
      name: names[id] || String(k),
      paths: kids.map((c) => c.path),
      own: ownPaths(ctx, sub),
      collapsed: collapsed.has(id),
      crystal: true,
      // 谁罩着它。渲染要靠它排层叠顺序、判"被收起的父框罩住"，画分割线也要用。
      parent: parentId,
      // 嵌套深度（**相对这一层**，不是相对库根）。"最里面的那个才是它家"要比较它。
      depth: (path || []).length,
    });
    emitCrystalBoxes(ctx, sub, id, names, collapsed, out);
  }
}

/**
 * 这一层该画哪些框。**顺序即层叠顺序**：金框父先子后，手动框最后（压在最上面）。
 *
 * @returns {Array<{id:string, name:string, paths:string[], own:string[],
 *   collapsed:boolean, crystal:boolean, parent:(string|null), depth:number}>}
 */
export function boxesOf(ctx, path) {
  const names = namesOf(ctx);
  const collapsed = new Set(collapsedOf(ctx));
  const out = [];

  // 1) 晶体框：**子树里每一个文件夹一个**（用户 10-01 第 1 条）。
  emitCrystalBoxes(ctx, path, null, names, collapsed, out);

  // 2) 手动框。成员被删光的丢掉——同上面「空框不画」那条。
  //    ⚠️ 成员表里可能留着已经不在这一层的路径（卡被挪走了），**渲染时按当前
  //    这一层的卡表过滤**，别在这里判——那要问 model，而这个函数会被每帧调。
  const live = new Set();
  for (const c of cardsUnderPath(ctx, path)) live.add(c.path);
  // 3.0 刀 31：**引进来的卡也算"在这一层上"。**
  //
  // 不算的话，用户把外来卡拖进框的**下一帧**它就被下面那个 filter 剔掉了：
  // 框里明明摆着那张卡，框却不认它——展开收起时它跟着消失又出现，
  // 或者干脆被当成"框外"的卡。而这一切都不报错。
  for (const p of importsUnder(ctx, path)) live.add(p);
  for (const b of manualOf(ctx, path)) {
    // ⚠️ **空框照样要画**（`paths` 是空数组也放行）。
    //
    // 这一条是踩出来的，而且它把整条路堵死了：建完框要能把卡**拖进去**，
    // 而拖进去的前提是屏幕上**看得见那个框**。第一版这里写的是
    // `if (!paths.length) continue;`（理由是"一个空框是个没有解释的方印"），
    // 于是「点 ＋ 框 一点反应都没有」——用户 09-27 报的正是这个。
    //
    // 晶体框不一样：它是算出来的，没卡就等于没那颗子晶体，跳过是对的
    // （上面那个 `continue` 留着）。
    const paths = (Array.isArray(b.paths) ? b.paths : []).filter((p) => live.has(p));
    const bx = Number(b.x);
    const by = Number(b.y);
    out.push({
      id: String(b.id),
      name: names[b.id] || String(b.name || "方框"),
      paths,
      collapsed: collapsed.has(String(b.id)),
      crystal: false,
      // 手动框的几何**全是它自己记的**（用户 09-27 拍板的 B：框是你画的，
      // 卡片只是归属，框不为迁就它们变形）。没记过就用默认值。
      x: Number.isFinite(bx) ? bx : NEW_BOX_X,
      y: Number.isFinite(by) ? by : NEW_BOX_Y,
      w: Math.max(MIN_BOX_W, Number(b.w) || DEFAULT_BOX_W),
      h: Math.max(MIN_BOX_H, Number(b.h) || DEFAULT_BOX_H),
    });
  }
  return out;
}

/**
 * `卡片路径 -> 罩着它的**所有**框 id`。
 *
 * ⚠️ **1.3.88 起是"一串"不是"一个"**，这是金框改成递归之后必须跟着改的地方。
 * 原来一张卡只归一个框（后出现的赢），因为框之间是**互不相交**的：一个文件夹的
 * 整棵子树一个框。现在父框罩着子框、子框罩着它里面的卡——C 的一张卡同时住在
 * C 的框、B2 的框、A 的框里，**每一层都得算数**。
 *
 * 只留一个的后果全在"收起"上：收了 A 却只记着 C 的话，C 的卡照样画在屏幕上
 * ——而用户明明把 A 收起来了。这不会报错，只会让人以为"收起坏了"。
 *
 * 数组是**由外到内**排的（`boxesOf` 就是父先子后），所以"最里面那个"取最后一个。
 */
export function membersOf(boxes) {
  const m = new Map();
  for (const b of boxes) {
    for (const p of b.paths) {
      const cur = m.get(p);
      if (cur) cur.push(b.id);
      else m.set(p, [b.id]);
    }
  }
  return m;
}

/** 收起来的框 id 集合——画线、画卡、画点三处都要问它。 */
export function collapsedSet(boxes) {
  const s = new Set();
  for (const b of boxes) if (b.collapsed) s.add(b.id);
  return s;
}

/**
 * 这条边走的两端里，有没有谁落在**收起来的框**里。
 *
 * 有就整条不画（用户第 4 条：「一律隐藏外部连线」）。**框内部的线也一并不画**
 * ——里面的卡本来就没画。
 */
export function edgeHidden(members, collapsed, aPath, bPath) {
  if (!collapsed.size) return false;
  const buried = (p) => {
    const ids = members.get(p);
    return !!(ids && ids.some((id) => collapsed.has(id)));
  };
  return buried(aPath) || buried(bPath);
}

/**
 * 罩着这个点的**最里面那个**、而且**正收着**的框 id（没有就回 null）。
 *
 * 用在"线的一头被收起来了"这件事上：要给外面那一头的卡点个黄点，
 * 黄点点下去要能闪到对应的框。嵌套之后可能有**好几层**都收着，
 * 该闪的是**最里面**那个——它是"东西到底在哪"最精确的答案。
 */
export function innermostCollapsed(members, collapsed, path) {
  const ids = members.get(path);
  if (!ids) return null;
  for (let i = ids.length - 1; i >= 0; i--) if (collapsed.has(ids[i])) return ids[i];
  return null;
}

// ---- 渲染 ----

/**
 * 一个框的矩形。**渲染和命中判定唯一的算法出处**。
 *
 * 这一段原来在 `renderBoxes` 和 `hitBoxAt` 里**各写了一份**（那边还留着一句
 * "几何必须和 renderBoxes 用同一套"的注释）。两套写法漂开的表现是
 * 「框明明拖进去了、松手却什么都没发生」——不报错，只是不生效。
 * 3.0 刀 47 收成一份。
 *
 * @returns {{x:number,y:number,w:number,h:number}|null}
 *   晶体框没有算得出位置的成员时回 `null`（= 不画，也不参与命中）。
 */
export function rectOf(b, pos, NODE_W, NODE_H) {
  if (b.crystal) {
    const at = (b.paths || []).map((p) => pos.get(p)).filter(Boolean);
    if (!at.length) return null;
    const minX = Math.min(...at.map((p) => p.x));
    const minY = Math.min(...at.map((p) => p.y));
    const maxX = Math.max(...at.map((p) => p.x)) + NODE_W;
    const maxY = Math.max(...at.map((p) => p.y)) + NODE_H;
    return {
      x: minX - BOX_PAD,
      y: minY - BOX_PAD - BAR_H,
      w: maxX - minX + BOX_PAD * 2,
      h: maxY - minY + BOX_PAD * 2 + BAR_H,
    };
  }
  const w = Math.max(MIN_BOX_W, Number(b.w) || DEFAULT_BOX_W);
  const h = Math.max(MIN_BOX_H, Number(b.h) || DEFAULT_BOX_H);
  // ⚠️ 兜底用的是 `NEW_BOX_X/Y`（建框时那个落座点）。这里原来写的是
  // `MIN_X` / `MIN_Y` ——**那两个常量在这个仓里根本不存在**。今天走不到
  // （`boxesOf` 给手动框的 x/y 一定填了有限数），但它是颗哑弹：
  // 哪天有人从别处构造一个没有坐标的框，等着的是一次 ReferenceError，
  // 而渲染里抛错是一整屏白掉，不是"少画一个框"。
  const x = Number.isFinite(Number(b.x)) ? Number(b.x) : NEW_BOX_X;
  const y = Number.isFinite(Number(b.y)) ? Number(b.y) : NEW_BOX_Y;
  return { x, y, w, h };
}

/**
 * 3.0 刀 47（用户 10-01 第 1 条）：每个金框内部该画哪几条分割线。
 *
 * 两种线、两个含义，用户点名过：
 *   · **珊瑚橙 `#FF6B6B` 实线** = **跨层**：这个文件夹**自己的卡** ↔ 它的**子文件夹**；
 *   · **金色实线**（同金框那个金）= **同级**：两个兄弟子文件夹之间。
 *
 * 位置怎么定：**落在"两坨东西之间的空档正中"**。
 *   · 珊瑚橙：`own` 里最靠右那张卡的右边缘 ↔ 其余（= 后代）里最靠左那张的左边缘；
 *   · 金色：左兄弟框的右边缘 ↔ 右兄弟框的左边缘。
 * 两坨东西**贴在一起甚至重叠**时（双链把它们拉到一起了）没有空档可取，就取两者
 * 的中点——线会压在卡片上，但至少位置是确定的、不会跳。
 *
 * ⚠️ 只对**有父框**的框算金色线。这一层（`crystalPath`）自己**不画框**（用户拍的），
 *    所以这一层的直接子框之间没有父框可挂——那一段自然没有金线。
 *
 * @returns {Map<string, Array<{x:number, gold:boolean}>>} 键是**父框** id，
 *   `x` 是**相对父框左边缘**的像素（渲染时直接当 left 用）。
 */
function splitLines(boxes, pos, NODE_W, NODE_H) {
  const out = new Map();
  const kids = new Map(); // 父框 id（没有父的记 ""）-> 它下面那一排子框
  for (const b of boxes) {
    if (!b.crystal) continue;
    const p = b.parent == null ? "" : String(b.parent);
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(b);
  }
  const push = (id, x, gold) => {
    if (!out.has(id)) out.set(id, []);
    out.get(id).push({ x, gold });
  };
  for (const b of boxes) {
    if (!b.crystal) continue;
    const geo = rectOf(b, pos, NODE_W, NODE_H);
    if (!geo) continue;
    // (a) 珊瑚橙：本级的卡 ↔ 子文件夹的卡。**"两者之差"就是 `own` 与非 `own`**。
    const own = new Set(b.own || []);
    const ownRight = [];
    const subLeft = [];
    for (const p of b.paths) {
      const at = pos.get(p);
      if (!at) continue;
      if (own.has(p)) ownRight.push(at.x + NODE_W);
      else subLeft.push(at.x);
    }
    // 只有一边有东西就不画——没有"分割"可言（比如这个文件夹自己没卡，
    // 或者它压根没有子文件夹）。
    if (ownRight.length && subLeft.length) {
      push(b.id, (Math.max(...ownRight) + Math.min(...subLeft)) / 2 - geo.x, false);
    }
    // (b) 金色：兄弟之间。`kids` 里的次序就是 `boxesOf` 的次序（从左到右）。
    const ch = kids.get(String(b.id)) || [];
    for (let i = 0; i + 1 < ch.length; i++) {
      const l = rectOf(ch[i], pos, NODE_W, NODE_H);
      const r = rectOf(ch[i + 1], pos, NODE_W, NODE_H);
      if (!l || !r) continue;
      push(b.id, (l.x + l.w + r.x) / 2 - geo.x, true);
    }
  }
  return out;
}

/**
 * 这张卡**属于哪个金框**——嵌套时取**最深**的那个（最里面那个才是"它家"）。
 *
 * 用户 10-01 第 3 条：「任意一个金色方框里面的卡片不可以移动到该金色方框之外」。
 * 判据不用几何、直接用成员表：`boxesOf` 里 `paths` 是递归的，所以一张卡会同时
 * 出现在它自己和每一层祖先的 `paths` 里，`depth` 最大的那个就是它的家。
 */
export function innermostCrystalBox(boxes, path) {
  const s = String(path);
  let best = null;
  for (const b of boxes) {
    if (!b.crystal) continue;
    if (b.paths.indexOf(s) < 0) continue;
    if (!best || (b.depth || 0) > (best.depth || 0)) best = b;
  }
  return best;
}

/**
 * 把一个 `w×h` 的东西夹进矩形 `r` 里（用户 10-01 第 3 条：蓝框不许移出金框）。
 *
 * 东西**比框还大**时不去硬塞，就贴着左上角——"挪不动"读起来是对的，
 * 而"被甩到某个角落"不是。
 */
export function clampInto(r, x, y, w, h) {
  if (!r) return { x, y };
  const maxX = Math.max(r.x, r.x + r.w - w);
  const maxY = Math.max(r.y, r.y + r.h - h);
  return {
    x: Math.min(Math.max(x, r.x), maxX),
    y: Math.min(Math.max(y, r.y), maxY),
  };
}

/**
 * 把框画出来。**节点之前调用**——框要在卡片的**后面**。
 *
 * @param {HTMLElement} host 舞台（`ctx.canvas`）
 * @param {Map<string,{x:number,y:number}>} pos  卡片当前位置
 * @param {Function} el  createElement 助手
 * @returns {Map<string, HTMLElement>} 框 id -> 元素（悬停闪烁要用）
 */
export function renderBoxes(host, boxes, pos, el, NODE_W, NODE_H) {
  const made = new Map();
  if (!boxes.length) return made;
  // 3.0 刀 47：**被收起来的框罩住的那些框，整个不画。**
  //
  // 框变成嵌套的之后这条非有不可：收起 B2 却照画 C 的框，屏幕上就会剩一个
  // 孤零零的 C 框悬在 B2 的标题条外面——而它里面的卡明明已经跟着 B2 一起收走了。
  // 那读起来是「框坏了」，不是「我把它收起来了」。
  const byId = new Map(boxes.map((b) => [String(b.id), b]));
  const buried = (b) => {
    let cur = b;
    // 圈数上限是防**数据里出现环**（手改过视图状态就可能）。没有它的话这里会
    // 转到天荒地老，而表现是"整个结构窗白屏"——比少画一个框难查得多。
    for (let i = 0; i < 64 && cur && cur.parent; i++) {
      const up = byId.get(String(cur.parent));
      if (!up) break;
      if (up.collapsed) return true;
      cur = up;
    }
    return false;
  };
  // 分割线先算好（用户 10-01 第 1 条），下面按框取用。**挂在父框自己身上**，
  // 所以父框一动它们跟着动，不用单独维护坐标。
  const splits = splitLines(boxes, pos, NODE_W, NODE_H);
  for (const b of boxes) {
    if (buried(b)) continue;
    // 几何算法**只有一份**，在 `rectOf` 里（`hitBoxAt` 走的是同一个函数）。
    // 两边各写一套的话，"看到的框"和"判到的框"迟早会漂开，而表现是
    // 「拖进去了、什么都没发生」——这条注释原来就写在 `hitBoxAt` 那边，
    // 刀 47 索性把算法收到一处。
    //
    // 两种框的几何**来路仍然完全不同**（用户 09-27 拍板的 B）：
    //   · **手动框** = 你自己画的一个框。位置和大小全由你定（存在框自己身上），
    //     卡片只是"归属"——**框不会为了迁就它们而变形**。空框和有卡一个样。
    //   · **晶体框** = 算出来的外壳，跟着里面卡片的包围盒走。它是文件夹长出来的，
    //     不是谁画的，所以没有"你自己定的大小"这回事。
    const geo = rectOf(b, pos, NODE_W, NODE_H);
    if (!geo) continue; // 没卡的子晶体 = 没那颗，不画是对的
    const cx = geo.x + geo.w / 2;
    // 收起态的条摆在重心上（**不是矩形左上角**，见下面那段）。手动框的"重心"
    // 稍微偏上一丁点：它是一块自己画的板，摆正中间反而不像那条标题。
    const cy = b.crystal ? geo.y + geo.h / 2 : geo.y + BAR_H / 2 + 8;

    const node = el(
      "div",
      "kb-v13-sbox" +
        (b.crystal ? " kb-v13-sbox-crystal" : " kb-v13-sbox-manual") +
        (b.collapsed ? " kb-v13-sbox-collapsed" : "")
    );
    node.dataset.box = b.id;
    if (b.collapsed) {
      // 收起：只剩一条标题栏，摆在自己的重心附近——**不摆在矩形左上角**，
      // 因为矩形可能是按展开时的大小定的，收起后那个位置会离得很远。
      node.style.left = Math.round(cx) + "px";
      node.style.top = Math.round(cy) + "px";
      node.style.width = COLLAPSED_W + "px";
      node.style.height = BAR_H + "px";
    } else {
      node.style.left = geo.x + "px";
      node.style.top = geo.y + "px";
      node.style.width = geo.w + "px";
      node.style.height = geo.h + "px";
    }

    const bar = el("div", "kb-v13-sbox-bar");
    const toggle = el("button", "kb-v13-sbox-toggle", b.collapsed ? "▸" : "▾");
    toggle.type = "button";
    toggle.title = b.collapsed ? "展开这个框" : "收起这个框（里面的卡和线一起收起来）";
    toggle.dataset.boxToggle = b.id;
    const name = el("span", "kb-v13-sbox-name");
    name.textContent = b.name;
    name.title = b.crystal ? "这是「" + b.paths.length + " 张卡」所属的子晶体。点一下改名。" : "点一下改名";
    name.dataset.boxName = b.id;
    const count = el("span", "kb-v13-sbox-count");
    count.textContent = b.paths.length + " 张";
    bar.append(toggle, name, count);
    // 只有**手动框**给一颗 ✕。晶体框删不掉——它是文件夹长出来的，
    // 要"删"得去删那个文件夹，而那是「删除晶体」，另一件事、另一个按钮。
    if (!b.crystal) {
      const del = el("button", "kb-v13-sbox-del", "✕");
      del.type = "button";
      // ⚠️ 这句话必须写出来。用户按这颗之前最怕的就是「这一下会不会把我的卡弄没」——
      // 而答案是**不会**：框只是个分组，卡片一张都不动。
      del.title = "删掉这个框。卡片一张都不会动——框只是个分组。";
      del.setAttribute("data-box-del", b.id);
      bar.appendChild(del);
    }
    node.appendChild(bar);
    // 3.0 刀 47：分割线（用户 10-01 第 1 条）。**只画展开态**——收起时整个框
    // 只剩一条标题栏，里面什么都看不见，画线是没有意义的。
    //
    // 挂在**这个框自己身上**（作为子节点）：父框一被拖动，lines 跟着走，
    // 不用在拖动那段里单独维护它们的坐标。
    if (!b.collapsed) {
      for (const s of splits.get(String(b.id)) || []) {
        const line = el("div", "kb-v13-sbox-split" + (s.gold ? " kb-v13-sbox-split-gold" : ""));
        line.style.left = Math.round(s.x) + "px";
        // 让开标题栏（`BAR_H`），底下留一点不贴边。从常量算，不写死像素。
        line.style.top = BAR_H + 6 + "px";
        line.style.bottom = "8px";
        node.appendChild(line);
      }
    }
    // 手动框右下角那颗抓手：**框是你画的**，所以大小得能自己定（用户拍板的 B）。
    // 晶体框不给抓手——它的形状是算出来的，拉它没有意义。
    if (!b.crystal && !b.collapsed) {
      const grip = el("div", "kb-v13-sbox-grip");
      grip.setAttribute("data-box-grip", b.id);
      grip.title = "拖这里改这个框的大小";
      node.appendChild(grip);
    }
    host.appendChild(node);
    made.set(b.id, node);
  }
  return made;
}

/**
 * 悬停带黄点的卡 → 它关联的、正收着的框绕边闪一圈（用户第 4 条）。
 *
 * 用**委托**而不是给每张卡挂监听：卡片每帧重建，逐张挂会漏、也会堆积。
 * 绑在舞台上，一次就够（同 `itemdrag.js` 那条「事件绑舞台」的教训）。
 */
export function bindBoxHover(host, getEls) {
  const clear = () => {
    const els = getEls();
    if (!els) return;
    for (const n of els.values()) n.classList.remove("kb-v13-sbox-flash");
  };
  const show = (ids) => {
    clear();
    const els = getEls();
    if (!els) return;
    for (const id of ids) {
      const n = els.get(id);
      if (n) n.classList.add("kb-v13-sbox-flash");
    }
  };
  host.addEventListener("mouseover", (e) => {
    const t = e.target;
    const hit = t && t.closest ? t.closest(".kb-v13-snode[data-boxes]") : null;
    if (!hit) return;
    const ids = String(hit.dataset.boxes || "").split("").filter(Boolean);
    show(ids);
  });
  host.addEventListener("mouseout", (e) => {
    const t = e.target;
    if (t && t.closest && t.closest(".kb-v13-snode[data-boxes]")) clear();
  });
}

// ---- 改视图状态的小动作（渲染之外的三件事：建、改名、收起） ----

/** `ctx.state.view` 上那几张表先确保形状，再动其中一格。**不整体重建**。 */
function ensure(ctx) {
  const v = view(ctx);
  if (!v) return null;
  // ⚠️ 3.0 刀 33 起 `boxes` 是**两层表**。这里把**老的扁平数组**也一并吃掉
  // （`Array.isArray` → 换成空表）：正常情况下 `sanitizeBoxes` 已经转换过了，
  // 但视图状态还有别的来路（`resetLayout`、测试、别处的适配层），
  // 漏一个就会出现"往数组上挂键"的写法——**不报错，只是框全不见了**。
  if (!v.boxes || typeof v.boxes !== "object" || Array.isArray(v.boxes)) v.boxes = {};
  if (!v.boxNames || typeof v.boxNames !== "object" || Array.isArray(v.boxNames)) v.boxNames = {};
  if (!Array.isArray(v.collapsedBoxes)) v.collapsedBoxes = [];
  return v;
}

/** 写之前把形状摆正，再把**这一层**的框表拿出来（没有就建）。 */
function writeBucket(ctx, path) {
  const v = ensure(ctx);
  if (!v) return null;
  const k = keyOf(path);
  if (!Array.isArray(v.boxes[k])) v.boxes[k] = [];
  return v.boxes[k];
}

function afterWrite(ctx) {
  if (ctx.flushViewState) ctx.flushViewState();
  // 3.0 刀 35：框变了就**排队把它那一层的边车写出去**（防抖，见 boxfile.js）。
  // 建框 / 改名 / 收起 / 删框 / 改归属都汇到这里；**拖动和缩放走 `setBoxRect`，
  // 那里自己排**（它有意不重画，见那条注释）。
  //
  // ⚠️ **收链数组，不是拼好的层键**——晶体文件夹名里可以带空格，
  // 拼字符串再切会切错（见 `folderOfChain` 那段）。
  queueBoxFile(ctx, ctx.state.crystalPath);
  if (ctx.refreshStoryline) ctx.refreshStoryline();
}

/**
 * 建一个手动框，收下这几张卡。id 用「现有 m: 里最大的号 +1」——确定性、不用随机数。
 *
 * ⚠️ **号是跨层扫出来的**，所以 id 全局唯一。这不是洁癖：`boxNames` 和
 * `collapsedBoxes` 是**按 id 索引**的两张独立表，id 一旦在某两层里撞上，
 * 改一个框的名字会连着把另一层的同名框一起改了。
 */
/**
 * @param {{x:number,y:number}} [center] 框**以哪个世界坐标点为中心**坐下。
 *   不给就用 `NEW_BOX_X/Y` 那个默认角落。调用方一般直接把 `viewportCenter(ctx)`
 *   的结果丢进来——**收的是中心不是左上角**，退半个身位这件事由这里做，
 *   因为"框有多大"只有这一层知道（见下面那段「用户 09-29 报的」）。
 */
export function createBox(ctx, paths, center) {
  // ⚠️ **没有"这一层"就不建。** 结构窗那颗「＋ 框」是**一直摆着**的
  // （刀 24 有意如此），包括"还没挑晶体"的时候——那会儿 `crystalPath` 是空的，
  // 建出来的框会落进 `""` 那个桶里。而晶体库只在有路径时才画故事线，
  // 于是**没有任何一屏会渲染它**：用户看不见它、也点不到它那颗 ✕，
  // 它会永久占着一个 id 跟着存档走。宁可当时就说一句。
  const path = ctx.state.crystalPath;
  if (!Array.isArray(path) || !path.length) return null;
  const list = writeBucket(ctx, path);
  if (!list) return null;
  let max = 0;
  for (const b of allBoxes(ctx)) {
    const m = /^m:(\d+)$/.exec(String(b && b.id));
    if (m) max = Math.max(max, Number(m[1]));
  }
  const id = "m:" + (max + 1);
  // ⚠️ **空框也要有落脚点**：它没有成员，包围盒算不出来，而"看得见"正是
  // 把卡拖进去的前提。
  //
  // 用户 09-29 报的：「新建…不建在当前窗口的中央，而是建立在固定的地方，
  // 如果我的视口远离那个固定位置，还要回去找」。原来这里写死世界的 (60,60)，
  // 视口一推远，新建的框就在屏幕外——**建完得先推回去找它**，那一步完全没有道理。
  // 现在由调用方把**视口中心**传进来（`storyspot.js` 的 `viewportCenter`）。
  //
  // 收的是**中心**，而框的 x/y 存的是左上角，所以两边各退半个身子。
  // 退不到精确的"正中"也无所谓——那是给眼睛用的。
  const fallback = { x: NEW_BOX_X + (list.length % 6) * 44, y: NEW_BOX_Y + (list.length % 6) * 44 };
  const x =
    center && Number.isFinite(Number(center.x)) ? Number(center.x) - DEFAULT_BOX_W / 2 : fallback.x;
  const y =
    center && Number.isFinite(Number(center.y)) ? Number(center.y) - DEFAULT_BOX_H / 2 : fallback.y;
  list.push({
    id,
    name: "方框 " + (max + 1),
    paths: (paths || []).slice(),
    x,
    y,
    w: DEFAULT_BOX_W,
    h: DEFAULT_BOX_H,
  });
  afterWrite(ctx);
  return id;
}

/**
 * 改一个**手动框**的位置/大小。**只动框自己**——卡片一张不挪
 * （用户 09-27 拍板的 B：框是你画的框，卡片只是归属）。
 */
export function setBoxRect(ctx, id, rect) {
  const b = findBox(ctx, id);
  if (!b) return;
  if (rect && Number.isFinite(Number(rect.x))) b.x = Number(rect.x);
  if (rect && Number.isFinite(Number(rect.y))) b.y = Number(rect.y);
  if (rect && Number.isFinite(Number(rect.w))) b.w = Math.max(MIN_BOX_W, Number(rect.w));
  if (rect && Number.isFinite(Number(rect.h))) b.h = Math.max(MIN_BOX_H, Number(rect.h));
  // 拖动过程中**不重画**（那一块可能正拿着指针捕获），所以这里只落盘，
  // 由调用方自己改 DOM。同 storyline 里那段框拖动。
  if (ctx.flushViewState) ctx.flushViewState();
  // ⚠️ **3.0 刀 35 审查逮出来的致命一条：这里原来只有上面那一句。**
  //
  // `setBoxRect` 是**拖动和缩放一个框的唯一出口**（storyline 里那两处），
  // 而它不排队写边车的话：拖一下框 → 只有本地视图状态变了 → 关库时
  // `flushBoxFiles` 看到队是空的直接返回 → 下次开库读到的是边车里的旧矩形 →
  // **框跳回原处**。同一台机器上、不需要任何巧合就会发生。
  //
  // 同一段拖动的收尾里，成员卡片是排了 `queueCardPos` 的（刀 34 那条），
  // 方框这一半漏了——两个半张脸对不上，正是这一刀要防的那类事。
  queueBoxFile(ctx, ctx.state.crystalPath);
}

export function renameBox(ctx, id, name) {
  // 名字表是**按 id 索引的一张独立表**，id 全局唯一（见 createBox），
  // 所以这里不需要知道它在哪一层。
  const v = ensure(ctx);
  if (!v || !id) return;
  const n = String(name || "").trim().slice(0, 80);
  if (!n) return;
  v.boxNames[String(id)] = n;
  afterWrite(ctx);
}

// ⚠️ **3.0 刀 30 起，"一张卡进框 / 出框"只有一个入口：下面那个 `assignCards`。**
//
// 这里原来还有一对单张的（`addCardToBox` / `removeCardFromBox`）加一个查询（`boxOfPath`），
// 是拖单张卡那条路用的。框选整批拖走接上来之后，单张那条路并进了 `assignCards`
// （"批里只有一张"就是它的特例），**三张全都删了**——不是不礼貌，是留着必出事：
// 两套写 `boxes[].paths` 的代码迟早会漂成两种归属判据，而用户看到的只是
// 「有时候拖进去、有时候不进」。要单张行为，调 `assignCards(ctx, [path], …)`。

/** 删掉一个框。**只删框，卡片一张不动**——这句话要写在按钮的 title 上。 */
export function deleteBox(ctx, id) {
  const v = ensure(ctx);
  if (!v || !id) return;
  const s = String(id);
  // 跨层找它住哪一格，**只从那一格里 splice**（不整表 filter：
  // 那会把别的层的框一起重建成新数组，引用一换，正拿着它的调用方就失联了）。
  for (const [k, list] of Object.entries(v.boxes)) {
    if (!Array.isArray(list)) continue;
    const i = list.findIndex((b) => String(b.id) === s);
    if (i < 0) continue;
    list.splice(i, 1);
    // 空了就把这一格删掉，别在存档里留一串空数组（同 `unimportCard` 那条）。
    if (!list.length) delete v.boxes[k];
    break;
  }
  delete v.boxNames[s];
  const i = v.collapsedBoxes.indexOf(s);
  if (i >= 0) v.collapsedBoxes.splice(i, 1);
  afterWrite(ctx);
}

/**
 * 世界坐标上有没有落在某个框里。`hitBoxAt` 用**框的矩形**判，不用 DOM 的
 * `elementFromPoint`——框是 `pointer-events:none`，命中测试永远轮不到它。
 *
 * @param {Array} boxes 同 renderBoxes 用的那一份（里面有算好的几何吗？没有——
 *   所以这里按 `pos` + NODE_W/NODE_H 重算一次，与 renderBoxes 同一套算法）。
 */
export function hitBoxAt(boxes, pos, NODE_W, NODE_H, pt) {
  if (!pt) return null;
  // 倒着扫（手动框排在数组最后、金框是子框在后）→ **先命中的是最里面那个**。
  // 这正是要的：一张卡"掉进哪个框"问的是最精确的那个答案。
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (b.collapsed) continue;
    const r = rectOf(b, pos, NODE_W, NODE_H);
    if (!r) continue;
    if (pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h) return b;
  }
  return null;
}

/**
 * 3.0 刀 30：**一批卡**一起判归属（落框 / 移出）。框选之后整批拖走那条路走它。
 *
 * 为什么不是"逐个调 `addCardToBox` / `removeCardFromBox`"：那两个每调一次都会
 * `afterWrite` → `flushViewState` + `refreshStoryline`，而结构窗的 refresh 是
 * **整窗重画**。一次拖 8 张就是 8 次全量重建，屏幕上会一顿一顿地闪。
 * 这里先把"每张卡该进哪个框"全算完，再**一次**改模型、**一次**落盘。
 *
 * ⚠️ 和单张那条路**判据必须一样**：`hitBoxAt` 认的是**卡片中心**落在框的矩形里。
 * 两处各写一套的话，「拖一张进去」和「框选一批拖进去」会给出不同答案，
 * 而用户看到的只是"有时候进去有时候不进"。
 *
 * @param {string[]} targets 要重新判归属的卡片路径
 * @returns {{changed:boolean, crystalHit:(string|null)}}
 *   `changed` = 真的改了东西吗（决定要不要落盘）；
 *   `crystalHit` = 有卡落在了**子晶体框**上（那个框收不下它，见下）。
 */
export function assignCards(ctx, targets, boxes, pos, NODE_W, NODE_H) {
  const v = view(ctx);
  if (!v || !targets || !targets.length) return { changed: false, crystalHit: null };
  // 先把结果全算出来。这一步**不碰模型**——算的过程中模型在变的话，
  // 后面的 hitBoxAt 拿到的 geometry 和最终写进去的就对不上了。
  const want = new Map();
  // 3.0 刀 31：**子晶体框收不下卡**，而它是屏幕上最大最好认的那个落点，
  // 所以「拖进去了、什么都没发生」是很容易撞上的一下。
  //
  // 收不下的理由不是懒：子晶体框的成员是**文件夹长出来的**（`boxesOf` 里算的，
  // 有意不落盘——文件夹一改名，落盘的成员表就和盘上对不上了）。一张卡在不在
  // 那个框里，等价于"它在不在那个文件夹里"，而这件事不该由一次拖动来回答。
  // 这里只**如实报告**这一下落在哪儿，说不说话由调用方定（这一层不认识"说什么"）。
  let crystalHit = null;
  for (const p of targets) {
    const at = pos.get(p);
    if (!at) continue;
    const center = { x: at.x + NODE_W / 2, y: at.y + NODE_H / 2 };
    const hit = hitBoxAt(boxes, pos, NODE_W, NODE_H, center);
    // ⚠️ `hitBoxAt` 是**倒着扫**的（手动框排在数组后面，先命中），所以走到
    //    「命中的是子晶体框」这一支，等价于"没有任何手动框罩着它"。
    if (hit && hit.crystal) crystalHit = crystalHit || String(hit.id);
    want.set(p, hit && !hit.crystal ? String(hit.id) : null);
  }
  if (!want.size) return { changed: false, crystalHit };

  // 3.0 刀 33：**只在当前这一层里改。** 卡片是拖在这一屏上的，它该进的框
  // 也只会是这一屏上画着的那些——别的层的框根本不在 `boxes` 里，
  // 更不该被这一下顺手改掉。
  // （`boxesOf(ctx, path)` 与这里用的是同一把 `crystalPath` 钥匙，
  // 两边对得上，所以界面上看到的框和这里能改到的框是同一批。）
  //
  // **这一层一个手动框都没有 → 归属无从改起，收工。** 走只读的 `readBucket`
  // 而不是会建桶的那个：建一张空表会白白把草稿弄"脏"（见 `readBucket` 那条）。
  //
  // ⚠️ **这一句必须排在 `crystalHit` 算完之后。** 它原来在函数开头，于是
  // "这一层只有子晶体框、还没建过手动框"（**这个功能的默认状态**）时提前返回，
  // `crystalHit` 恒为 null —— 刀 31 那条「子晶体框装不进外来卡，用 ＋框 建个
  // 手动框」的提示**永远不响**。表现正是那条注释自己最忌讳的"点了没反应"。
  const list = readBucket(ctx, ctx.state.crystalPath);
  if (!list) return { changed: false, crystalHit };

  let changed = false;
  // 1) 先把这一批从**所有**框里摘干净（连它本来待着的那个也摘）。
  //    过滤而不是 splice：一张卡只该出现一次，逐个 splice 要处理下标漂移。
  for (const b of list) {
    if (!Array.isArray(b.paths)) b.paths = [];
    const keep = b.paths.filter((p) => !want.has(p) || want.get(p) === String(b.id));
    if (keep.length !== b.paths.length) {
      b.paths = keep;
      changed = true;
    }
  }
  // 2) 再把该进框的放进去。`want` 里值是 null 的（落在所有框外面）到此为止
  //    ——那就是"拖出来 = 移出"，第 1 步已经做完了。
  for (const [p, id] of want) {
    if (!id) continue;
    const box = list.find((b) => String(b.id) === id);
    if (!box) continue;
    if (box.paths.indexOf(p) < 0) {
      box.paths.push(p);
      changed = true;
    }
  }
  if (changed) afterWrite(ctx);
  return { changed, crystalHit };
}

export function toggleBox(ctx, id) {
  const v = ensure(ctx);
  if (!v || !id) return;
  const s = String(id);
  const i = v.collapsedBoxes.indexOf(s);
  if (i >= 0) v.collapsedBoxes.splice(i, 1);
  else v.collapsedBoxes.push(s);
  afterWrite(ctx);
}

/** 框收了没有——渲染之外的地方（比如「＋ 框」那颗按钮的文案）要问。 */
export const isBoxCollapsed = (ctx, id) => collapsedOf(ctx).indexOf(String(id)) >= 0;
export { isManualBoxId };
