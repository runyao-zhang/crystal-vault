// 视图状态（#10）：形状、默认值、以及「一份坏状态该被怎么对待」。
//
// 这是纯函数模块——不碰 localStorage、不碰 DOM。适配层只负责把字符串读进来、
// 写出去；「认不认得出、哪些字段能用」全在这里判定。好处是换宿时时版本规则
// 不必各写一遍，坏状态的行为也能单独测。
//
// 唯一的硬要求：**sanitizeViewState 绝不抛异常**。
// 一份截断的 JSON、一个来自未来版本的状态、一堆缺胳膊少腿的字段，
// 最差都只能退化成默认视角——绝不能把晶体库锁死在打不开的状态。

import { toStr } from "./dom.js";

export const VIEW_STATE_VERSION = 1;

/**
 * 相机的缩放上下限。超出这个范围画布不是看不清就是没有意义，直接夹回来。
 *
 * 下限从 0.2 降到 0.05（3.0 刀 2）：故事线一屏要摊开一颗晶体的全部卡片，
 * 30 张横排就是 7800px 宽——`fit()` 需要 k ≈ 0.18，夹在 0.2 上就**装不下**，
 * 而「一眼看全局」正是故事线存在的理由。
 *
 * 语义上「小到看不清」比「根本看不到」轻：看不清可以滚轮放大，装不下没有出路。
 * 老的存档里不可能存在小于 0.2 的 k，所以**不用升版本号**。
 */
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 4;

/** 模块方框的最小尺寸，和拖拽时的下限是同一个数。 */
export const MIN_MODULE_W = 80;
export const MIN_MODULE_H = 60;

export function defaultViewState() {
  return {
    v: VIEW_STATE_VERSION,
    camera: { x: 0, y: 0, k: 1 },
    modules: [],
    membership: {},
    crystalPos: {},
    // 3.0 刀 5：故事线里**手工连的线**。形状 {晶体key: [{from, to, fromSide, toSide}]}。
    // 键是晶体（故事线是按晶体看的），值里两端都是**卡片路径**。
    cardLinks: {},
    // 3.0 刀 13：蓝线（双链）**接在卡片的哪一边**。同样按晶体分，
    // 形状 {晶体key: [{from, to, fromSide, toSide}]}。
    //
    // 单开一张表、不塞进 cardLinks：那张表里每一条都是**用户亲手画的金线**
    // （有向、带 bends、能框选能删），而这一张记的是**他自己写的 [[双链]]
    // 在屏幕上的接法**——线是笔记里的，库只是记下"他当时从哪个连接点拖出来"。
    // 混在一起的话，drawManualLines / hitManual / 拐点下标回写三处都要先分辨
    // "这是哪种线"。
    //
    // ⚠️ from/to 存**字典序小的在前**（与 storyline.js 的 mergePairs 同一套），
    // 所以查找时两个方向都要试——别只按存进去的顺序查。
    linkSides: {},
    // 3.0 刀 13：被右键藏掉入链出链的那几张卡（**卡片路径**，平的）。
    // 平的就够：路径在全库唯一，而且一张卡只属于一颗晶体，
    // 在哪扇窗里藏的，回到库的故事线就还藏着——不需要再拿晶体名当键。
    hiddenLinks: [],
    openCrystal: null,
    selectedCrystal: null,
    selectedCard: null,
    scrollOffset: 0,
  };
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** 有限数才认，其余一律退回 fallback（NaN / "12" / undefined 都不算数） */
function num(v, fallback) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/** 可空字符串：非字符串 / 空串一律成 null，省得下游要同时判两种「没有」 */
function nullableStr(v) {
  const s = toStr(v);
  return s ? s : null;
}

/** 相机消毒。**导出的**：结构窗那扇窗的存档里也有一台相机（3.0 刀 9-D），
 *  它住在 prefs 而不是 viewstate，但「什么算一台合法的相机」只该有一份定义。 */
export function sanitizeCamera(raw) {
  const def = { x: 0, y: 0, k: 1 };
  if (!isObj(raw)) return def;
  return {
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    k: clamp(num(raw.k, 1), MIN_SCALE, MAX_SCALE),
  };
}

function sanitizeModules(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const m of raw) {
    if (!isObj(m)) continue;
    const id = toStr(m.id);
    if (!id || seen.has(id)) continue; // 没有 id 或 id 重复的框，留着只会让归属指向不明
    seen.add(id);
    out.push({
      id,
      name: toStr(m.name) || "未命名模块",
      x: num(m.x, 0),
      y: num(m.y, 0),
      w: Math.max(MIN_MODULE_W, num(m.w, 240)),
      h: Math.max(MIN_MODULE_H, num(m.h, 160)),
      parent: nullableStr(m.parent),
    });
  }

  // 父指针只准指向真实存在、且不是自己的模块；顺着父链能绕回来的（成环）也断掉。
  // 这一步放在这里而不是等 #17 的拖拽校验，是因为坏状态也会走到这条路径——
  // 一个成环的父子关系会让渲染无限递归，那正是「锁死」的一种。
  for (const m of out) {
    m.parent = resolveParent(m, seen, out);
  }
  return out;
}

function resolveParent(m, ids, all) {
  if (!m.parent || m.parent === m.id || !ids.has(m.parent)) return null;
  const byId = new Map(all.map((x) => [x.id, x]));
  const walked = new Set([m.id]);
  let cur = m.parent;
  while (cur) {
    if (walked.has(cur)) return null; // 成环 → 断开，退成顶层
    walked.add(cur);
    const node = byId.get(cur);
    if (!node) return null;
    cur = node.parent === cur.id ? null : node.parent;
  }
  return m.parent;
}

/** 归属表：值必须是存在的模块 id，否则这条归属作废（晶体回到散着） */
function sanitizeMembership(raw, modules) {
  if (!isObj(raw)) return {};
  const ids = new Set(modules.map((m) => m.id));
  const out = {};
  for (const [key, val] of Object.entries(raw)) {
    const id = toStr(val);
    if (key && ids.has(id)) out[key] = id;
  }
  return out;
}

/**
 * 手工连的线。**绝不抛**，逐条退化：任何一条坏了只丢那一条，不整份作废。
 *
 * 两端都必须是非空字符串、方向必须是四个之一；连到不存在的卡上不管——
 * 那张卡可能是被删了，而删卡不该顺手把别的线也弄没。渲染时找不到对方
 * 自然就不画（见 storyline.js），那是「安静少一根线」，不是「整屏崩掉」。
 */
const SIDES = ["top", "right", "bottom", "left"];
function sanitizeCardLinks(raw) {
  if (!isObj(raw)) return {};
  const out = {};
  for (const [key, list] of Object.entries(raw)) {
    if (!key || !Array.isArray(list)) continue;
    const keep = [];
    const seen = new Set();
    for (const l of list) {
      if (!isObj(l)) continue;
      const from = toStr(l.from);
      const to = toStr(l.to);
      if (!from || !to || from === to) continue;
      const fs = SIDES.indexOf(toStr(l.fromSide)) >= 0 ? toStr(l.fromSide) : "right";
      const ts = SIDES.indexOf(toStr(l.toSide)) >= 0 ? toStr(l.toSide) : "left";
      const sig = from + "\u0000" + to + "\u0000" + fs + "\u0000" + ts;
      if (seen.has(sig)) continue; // 同一条线被点两次不该留两条
      seen.add(sig);
      // 拐点（用户双击加上去的）。**数量封顶到 8**：一来再多就不像流程图了、
      // 屏幕上也没法看，二来这是从盘里读回来的**不可信输入**，没有上限的话
      // 一个坏文件就能塞进十万个点，把每一帧的渲染拖死。
      // 坏点**逐个丢掉**而不是整条线作废——丢一条线是用户看得见的损失，
      // 丢一个点他再双击一下就有了。
      const bends = [];
      if (Array.isArray(l.bends)) {
        for (const b of l.bends.slice(0, 8)) {
          if (!isObj(b)) continue;
          const bx = num(b.x, null);
          const by = num(b.y, null);
          if (bx === null || by === null) continue;
          bends.push({ x: bx, y: by });
        }
      }
      const one = { from, to, fromSide: fs, toSide: ts };
      if (bends.length) one.bends = bends;
      keep.push(one);
    }
    if (keep.length) out[key] = keep;
  }
  return out;
}

/**
 * 蓝线的接法提示（3.0 刀 13）。**绝不抛**，逐条退化——但比 sanitizeCardLinks 严：
 *
 * 一端的方向认不出来就**整条丢掉**，而不是像金线那样补一个缺省方向。
 * 两者坏掉的代价不一样：金线缺了方向还得画，随便挑一个总比不画强；
 * 而这一张是**提示**——丢了就退成「没有提示」，渲染那边会按两张卡的左右关系
 * 自动挑一条，那本来就是这个功能没做之前的样子。给一条提示补一个瞎猜的方向，
 * 反而会把线接到用户从来没说过的地方去，而他没有任何办法看出那是猜的。
 *
 * 数量封顶是**渲染护栏**：sideHintMap 每一帧都要按这份数据建一次 Map，
 * 一个坏文件塞进十万条，每一帧就建十万项。超出的丢掉后面的——那是用户最近
 * 拖的，但总比界面卡死强（与 bends 封顶 8 同一个理由）。
 */
const MAX_LINK_SIDES = 2000;
function sanitizeLinkSides(raw) {
  if (!isObj(raw)) return {};
  const out = {};
  for (const [key, list] of Object.entries(raw)) {
    if (!key || !Array.isArray(list)) continue;
    const keep = [];
    const seen = new Set();
    for (const l of list) {
      if (keep.length >= MAX_LINK_SIDES) break;
      if (!isObj(l)) continue;
      const from = toStr(l.from);
      const to = toStr(l.to);
      if (!from || !to || from === to) continue;
      const fs = toStr(l.fromSide);
      const ts = toStr(l.toSide);
      if (SIDES.indexOf(fs) < 0 || SIDES.indexOf(ts) < 0) continue; // 缺一头就整条丢
      // 同一对只留最先那条。**签名不带方向**：from/to 已经是字典序规范过的，
      // 带上方向反而会把"同一对的两份矛盾提示"当成两条不同的线放进来。
      if (seen.has(from + " " + to)) continue;
      seen.add(from + " " + to);
      keep.push({ from, to, fromSide: fs, toSide: ts });
    }
    if (keep.length) out[key] = keep;
  }
  return out;
}

/**
 * 被藏起来的卡（3.0 刀 13）。**绝不抛**：非字符串、空串、重复一律丢。
 *
 * 不校验「这张卡还在不在」——那要问 model，而这里是个纯函数。
 * 卡片被删之后留下一条悬空路径的代价是零：渲染时按路径查位置，查不到
 * 本来也不会画（与 cardLinks 那条「连到不存在的卡上不管」同一口径）。
 */
const MAX_HIDDEN_LINKS = 2000;
function sanitizeHiddenLinks(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const p of raw) {
    if (out.length >= MAX_HIDDEN_LINKS) break;
    // **只认字符串**，不用 toStr 转。别处转是因为那些格子装的是 id / 名字，
    // 数字转成字符串无害；这一格装的是**卡片路径**，把 42 转成 "42" 会造出
    // 一条永远匹配不上任何卡片的悬空项——看着像条数据，实际是垃圾。
    if (typeof p !== "string" || !p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

function sanitizeCrystalPos(raw) {
  if (!isObj(raw)) return {};
  const out = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!key || !isObj(val)) continue;
    const x = num(val.x, null);
    const y = num(val.y, null);
    if (x === null || y === null) continue;
    out[key] = { x, y };
  }
  return out;
}

/**
 * 把「从宿主读回来的任意东西」变回一份可用的视图状态。
 *
 * 两档退化：
 *   - **整体丢弃**：不是对象、版本号对不上（含来自未来版本的）→ 回默认视角。
 *     版本对不上意味着字段含义可能已经变了，逐字段抢救反而会拼出一份四不像。
 *   - **逐字段退化**：版本对得上但某个字段坏了 → 只有那个字段回默认，
 *     其余照常。用户排好的画布不该因为一个坐标是 null 就全丢。
 */
export function sanitizeViewState(raw) {
  const def = defaultViewState();
  if (!isObj(raw)) return def;
  if (raw.v !== VIEW_STATE_VERSION) return def;

  const modules = sanitizeModules(raw.modules);
  return {
    v: VIEW_STATE_VERSION,
    camera: sanitizeCamera(raw.camera),
    modules,
    membership: sanitizeMembership(raw.membership, modules),
    crystalPos: sanitizeCrystalPos(raw.crystalPos),
    cardLinks: sanitizeCardLinks(raw.cardLinks),
    linkSides: sanitizeLinkSides(raw.linkSides),
    hiddenLinks: sanitizeHiddenLinks(raw.hiddenLinks),
    openCrystal: nullableStr(raw.openCrystal),
    selectedCrystal: nullableStr(raw.selectedCrystal),
    selectedCard: nullableStr(raw.selectedCard),
    scrollOffset: Math.max(0, Math.floor(num(raw.scrollOffset, 0))),
  };
}

/**
 * 只清「屏幕」那四样，**保留布局**（3.0 刀 3）。
 *
 * 「忘掉上次看到哪儿」这颗按钮的文案从一开始就只承诺了这四样
 * ——「清掉记住的那颗晶体、那一页和最后翻开的那张卡」，一个字都没提画布。
 * 而实现走的是 `state.view = defaultViewState()`，等价于把用户摆好的画布、
 * 相机位置一起写没了。**所以这是把实现修到和承诺一致，不是改需求。**
 *
 * 拆开之后，「恢复默认」（画布）和「忘掉」（屏幕）是两件事、两个按钮，
 * 语义不再重叠——这也正是它们该有的样子。
 */
export function forgetScreen(view) {
  const base = view && typeof view === "object" ? view : defaultViewState();
  return {
    ...base,
    openCrystal: null,
    selectedCrystal: null,
    selectedCard: null,
    scrollOffset: 0,
  };
}

/** 从当前运行时状态里取出要落盘的那一份（ctx.state → 视图状态） */
export function collectViewState(state) {
  const base = state && state.view ? state.view : defaultViewState();
  return {
    ...base,
    v: VIEW_STATE_VERSION,
    openCrystal: nullableStr(state && state.openCrystal),
    selectedCrystal: nullableStr(state && state.selectedCrystal),
    selectedCard: nullableStr(state && state.selectedCard),
    scrollOffset: Math.max(0, Math.floor(num(state && state.scrollOffset, 0))),
  };
}
