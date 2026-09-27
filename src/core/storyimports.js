// 3.0 刀 31：**从别的晶体引一张卡进这一屏**（用户 09-27 拍板的 Q1=C）。
//
// 要解决的问题：`cardsUnder` 是**文件夹递归**的，所以一颗晶体天然只画得下
// 它自己文件夹里的卡。可用户要的场景是「跨级连蓝色线」——A 晶体里的卡想连到
// B 晶体里的卡，光靠收纳方框做不到（方框只收本层的卡）。
//
// 交互是用户定的：**引进来先飘着，再由他自己拖进某个收纳方框**。
// 「飘着」不是装饰，是这一刀的全部要点——它明确说了**不自动归位**：
// 引进来那张卡不属于这颗晶体的任何文件夹，所以它不该混进排布里
// （见下面 `importedCards` 那段：排布算法只吃文件夹里的卡）。
//
// ---- 表存在哪儿 ----
//
// 视图状态的 `imports`，形状与 `cardLinks` **完全一样**：
//     { "<晶体路径用空格连起来>": [卡片路径, ...] }
// 用同一套键是因为它们回答的是同一个问题——「**这一层**上的东西」。
// 分开写两套键的话，换一颗晶体看的时候两边会对不上。
//
// ⚠️ 位置**不存这张表里**，存 `crystalPos`（那张现成的位置表，键就是卡片路径）。
//    理由是「位置」这件事在这份代码里已经有一个唯一的住址了；再开一张
//    `importPos` 就等于同一条规则写两遍，而拖过一张卡之后两边会不一致。

import { NODE_W, NODE_H } from "./storylayout.js";

/** 这一层是哪一层。与 `cardLinks` / `manualLinks` 用的是同一把钥匙。 */
const keyOf = (ctx) => (ctx.state.crystalPath || []).join(" ");

/**
 * 视图状态里那张表 —— **读**。
 *
 * ⚠️ 走草稿（`draft || view`），和 `cardLinks` / `crystalPos` / 收纳方框那几张
 * 同一条规矩（`canvas.js` 的 `layoutOf` 就是 `draft || view`）。读落盘那份的话，
 * 用户在结构窗里引进来的卡，一关库就会被草稿里那份旧快照盖掉——**不报错，东西没了**。
 *
 * **读不写**：这条路每帧都会被调，顺手 `v.imports = {}` 会在每一帧改一次视图状态，
 * 而"改过"这件事在那边是要落盘的（`isDraftDirty` 会亮「未保存」）。
 */
function tableOf(ctx) {
  const st = ctx && ctx.state ? ctx.state : null;
  const v = st ? st.draft || st.view : null;
  const t = v && typeof v === "object" ? v.imports : null;
  return t && typeof t === "object" && !Array.isArray(t) ? t : {};
}

/** **写**之前先把形状摆正，再把表拿出来。同 storyboxes 的 `ensure`。 */
function ensureTable(ctx) {
  const st = ctx && ctx.state ? ctx.state : null;
  const v = st ? st.draft || st.view : null;
  if (!v || typeof v !== "object") return null;
  if (!v.imports || typeof v.imports !== "object" || Array.isArray(v.imports)) v.imports = {};
  // `crystalPos` 是位置表，这里要用它给新引进来的卡落座。**缺了就补**——
  // 它是老版本就有的字段，正常不会缺；缺了只可能是被人手改坏的存档。
  if (!v.crystalPos || typeof v.crystalPos !== "object" || Array.isArray(v.crystalPos)) {
    v.crystalPos = {};
  }
  return v;
}

/**
 * 某一层引进来哪些卡（路径数组）。
 *
 * `path` 显式传进来而不是读 `ctx.state.crystalPath`：收纳方框那边是按
 * **要画的那一层**问的（`boxesOf(ctx, path)`），两边读的地方不一样。
 */
export function importsUnder(ctx, path) {
  const list = tableOf(ctx)[(path || []).join(" ")];
  if (!Array.isArray(list)) return [];
  return list.filter((p) => typeof p === "string" && p);
}

/** 这一层引进来哪些卡。`ctx.state.crystalPath` 那一层的快捷写法。 */
export function importsOf(ctx) {
  return importsUnder(ctx, ctx.state.crystalPath || []);
}

/**
 * 把引进来的路径**解析成卡片对象**，并滤掉不该画的那些。
 *
 * 三道过滤：
 *   1. **已经在这一屏里了**（有人把那张卡移进了这个文件夹）→ 丢掉。留着的话
 *      同一张卡会被画两次，而 DOM 里两个 `data-path` 一样的节点会让
 *      「点它 / 拖它」随机落到其中一个上。
 *   2. **卡没了**（被删、被改名）→ 丢掉，但**不清表**。清表要写视图状态，
 *      而这是一个每帧都会跑的读函数（同 `tableOf` 那条）。表里留着一条
 *      指不到人的路径是**无害的**：卡一旦回来（改回原名、同步回来）它自己就冒出来。
 *   3. 只在 `byPath` 里有真身才画——影卡（`buildRelated` 造的那种 content 为空的）
 *      不在 `byPath` 里，引一张没有正文的卡进来看没有任何意义。
 *
 * @param {Array} base 这一屏**本来就有的**卡（`cardsUnder` 的结果）
 * @param {string[]} [path] 哪一层。不给就按 `ctx.state.crystalPath`——
 *   只有那一处（`renderStorylineStage`）会画**不是当前这一层**的图。
 */
export function importedCards(ctx, base, path) {
  const list = path ? importsUnder(ctx, path) : importsOf(ctx);
  if (!list.length) return [];
  const byPath = ctx.model && ctx.model.byPath ? ctx.model.byPath : null;
  if (!byPath) return [];
  const have = new Set((base || []).map((c) => c.path));
  const out = [];
  const seen = new Set();
  for (const p of list) {
    if (have.has(p) || seen.has(p)) continue;
    const card = byPath.get(p);
    if (!card) continue;
    seen.add(p);
    out.push(card);
  }
  return out;
}

/**
 * 「就放在你正看着的地方」——引进来那张卡落在哪儿。
 *
 * 量的是**舞台正中**那一刻对应的世界坐标，再把卡片中心对准它（`crystalPos`
 * 存的是左上角，所以要退半个身位）。
 *
 * 为什么不摆在主体下面那条带里（幽灵节点就是那么摆的）：那要先把整屏的包围盒
 * 算出来，而**引进来那一瞬间用户的眼睛在视口上、不在图上**——摆在他看得见的地方，
 * 他才知道"进来了"，然后才谈得上拖它。摆到图下面，多半是在屏幕外面，
 * 表现就是「点了导入，什么都没发生」。
 */
function centerSpot(ctx) {
  const pz = ctx._panzoom;
  const st = ctx.stage;
  if (pz && st && typeof pz.clientToWorld === "function") {
    try {
      const r = st.getBoundingClientRect();
      const w = pz.clientToWorld(r.left + r.width / 2, r.top + r.height / 2);
      if (Number.isFinite(w.x) && Number.isFinite(w.y)) {
        return { x: w.x - NODE_W / 2, y: w.y - NODE_H / 2 };
      }
    } catch (e) {
      /* 量不到就退到下面那份 */
    }
  }
  return { x: 60, y: 60 };
}

/**
 * 引一张卡进来。**卡本身一个字都不动**——只是从此在这一层也画一份。
 *
 * 已经引过、或者这张卡本来就在这一屏里（`base` 里）→ 回 false，
 * 让调用方去说一句话。**不能闷声返回**：「点了没反应」是这个库里
 * 反复栽过的那一类，而这里恰好有一句现成的话可以说。
 *
 * @param {Array} base 这一屏本来就有的卡（用来判"是不是已经在里面了"）
 */
export function importCard(ctx, cardPath, base) {
  const p = String(cardPath || "");
  if (!p) return false;
  const byPath = ctx.model && ctx.model.byPath ? ctx.model.byPath : null;
  if (!byPath || !byPath.get(p)) return false;
  if ((base || []).some((c) => c.path === p)) return false;
  if (importsOf(ctx).indexOf(p) >= 0) return false;

  // 连视图状态都拿不到（ctx 不完整 / 还没挂载完）→ 什么都不做。
  const v = ensureTable(ctx);
  if (!v) return false;
  const k = keyOf(ctx);
  if (!Array.isArray(v.imports[k])) v.imports[k] = [];
  const list = v.imports[k];
  list.push(p);

  // 落座。连着引几张就**错开一点**，否则第二张正好压在第一章上，
  // 而屏幕上看起来仍然只有一张——用户会以为导入没生效。
  const spot = centerSpot(ctx);
  const n = list.length - 1;
  v.crystalPos[p] = {
    x: Math.round(spot.x + (n % 6) * 30),
    y: Math.round(spot.y + (n % 6) * 30),
  };
  return true;
}

/**
 * 把一张卡从这一层拿走。**只摘这一层的关系**——卡、它所在的文件夹、
 * 别人指向它的双链，一个字都不动。再引一次它就原样回来（位置也还在）。
 *
 * ⚠️ **不顺手从收纳方框里删它**。框的成员表里留着一条路径是无害的
 * （`boxesOf` 按"此刻在这一屏上"过滤，见那边），而顺手删掉是不可逆的：
 * 用户只是想让它先别显示，再引回来时他摆好的分组就没了。
 */
export function unimportCard(ctx, cardPath) {
  const p = String(cardPath || "");
  if (!p) return false;
  const v = ensureTable(ctx);
  if (!v) return false;
  const k = keyOf(ctx);
  const list = v.imports[k];
  if (!Array.isArray(list)) return false;
  const i = list.indexOf(p);
  if (i < 0) return false;
  list.splice(i, 1);
  // 空了就把这一格删掉，别在存档里留一串空数组（同 `writeManualLinks` 那条）。
  if (!list.length) delete v.imports[k];
  return true;
}

/**
 * 写完之后统一收尾：落盘 + 重画。
 *
 * **和 `storyboxes.js` 的 `afterWrite` 是同一个套路**，也是同一个理由：
 * 建框、改名、收起都走它，三处各写一遍的话，迟早有一处忘了刷新，
 * 而表现是「点了有反应、但屏幕上不变」——最难查的一类。
 */
export function afterImport(ctx) {
  if (ctx.flushViewState) ctx.flushViewState();
  if (ctx.refreshStoryline) ctx.refreshStoryline();
}
