// 3.0 刀 5：故事线的渲染层——把排布算法的结果画到画布上。
//
// 和画布模式的关系：**同一个世界层、同一台相机、同一套拖动**，换的只是
// 「画什么」。根层画的是晶体，层内画的是卡片节点 + 连线。
//
// 与 canvas.js 的关系：**单向**（本文件 import 它的 layoutOf / worldPosOf）。
// 相机与拖动的公共部分在 canvas.js / itemdrag.js 里，这里只负责「画什么」。

import { EL, esc, svgEl, swallowNextClick } from "./dom.js";
import { layoutOf, worldPosOf } from "./canvas.js";
import { bindItemDrag } from "./itemdrag.js";
import { runLayout, layeredLayout, NODE_W, NODE_H } from "./storylayout.js";

/** 节点之间的连线留出的空档（从节点边缘切进去多少） */
const EDGE_PAD = 10;

// ============================================================
// 算：一次算好，缓存住
// ============================================================

/**
 * 每个晶体一份排布结果。键是卡片路径拼的串——晶体的 key 本身就是路径，
 * 但层内看的是**子树**，所以把这一层的路径拼起来当键才唯一。
 *
 * 缓存的意义不只是省算力：换位置的实现可能是**异步的**（将来那个 LLM），
 * 而 renderCrystals 是同步的。没有缓存的话每一帧渲染都要等一次网络，
 * 屏幕会先空一下再跳出来。有缓存就是「先拿旧的画着，新的算完再换上去」。
 */
const cache = new Map();

/** 这一层要展示的卡片：**整棵子树**，不是只有直属的 */
function cardsUnder(ctx, path) {
  const out = [];
  const walk = (p) => {
    for (const c of ctx.model.cardsAt(p)) out.push(c);
    for (const k of ctx.model.keysAt(p)) walk(p.concat([k]));
  };
  walk(path);
  return out;
}

/**
 * 取这一层的边。**只保留两端都在这组卡片里的边。**
 *
 * ⚠️ 关系图的键是 **title 不是 path**，同名卡（两个文件夹里都有「01-总览」）
 * 会让边指错人。所以这里不直接用 relatedOf 的 title，而是顺着
 * `cardByTitle` 拿回卡片、再拿它的 path 核对归属——对不上就丢掉。
 */
function edgesUnder(ctx, cards) {
  const byTitle = new Map();
  for (const c of cards) if (!byTitle.has(c.title)) byTitle.set(c.title, c);
  const have = new Set(cards.map((c) => c.path));
  // ---- 1. 底：**文件名相邻对**（01→02→03→…）----
  //
  // 用户的原话是「按文件名连接」。它是**底**不是装饰：保证这一屏永远是一条
  // 连贯的链，而不是「双链稀疏时只剩一两根线」——那正是「整个故事线只有一条线」。
  //
  // 排布那边**一行都不用改**：最长路径分层喂进去，出来的正好是文件名顺序
  // （链上第 i 张的深度 = i）。所以「按文件名从左到右」和原来那套算法不冲突，
  // 之前只是没把这条链喂进去。
  const chain = [];
  for (let i = 0; i + 1 < cards.length; i++) {
    chain.push({ from: cards[i].path, to: cards[i + 1].path, reason: "" });
  }

  // ---- 2. 面：用户真正写的双链 ----
  // 和底分开带出去，因为**画法不一样**（见 renderStorylineStage）。
  // 混成一样的话「哪条是我写的」就看不出来了，而那正是这一屏最该说清的事。
  const seen = new Set();
  const links = [];
  const ghosts = new Map();

  for (const c of cards) {
    for (const r of ctx.model.relatedOf(c)) {
      const target = byTitle.get(r.title);
      const toPath = target && have.has(target.path) ? target.path : null;
      if (!toPath) {
        // 链到这一组之外去了。**不能静默丢掉**——丢一条就少一层依赖，
        // 排出来的深度是错的、画面会骗人。记成幽灵节点（画成虚框、点了跳过去）。
        if (r.title && r.title !== c.title) ghosts.set(r.title, r.reason || "");
        continue;
      }
      const key = c.path + "\u0000" + toPath;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ from: c.path, to: toPath, reason: r.reason || "" });
    }
  }
  return { chain, links, ghosts };
}

function layoutFor(ctx, path) {
  const key = path.join("\u0000");
  if (cache.has(key)) return cache.get(key);
  const cards = cardsUnder(ctx, path);
  const { chain, links } = edgesUnder(ctx, cards);
  const nodes = cards.map((c) => ({ id: c.path, name: c.title }));
  // 定位用的边 = 文件名链 + 双链。链保证排列顺序，双链只可能让某张往后挪
  // （最长路径取 max），挪不动链已经定好的次序。
  const edges = chain.concat(links);
  const result = layeredLayout(nodes, edges);
  cache.set(key, result);

  // 换位置的实现（将来接 LLM）。**异步跑、跑完再换上去**，不挡当前这一帧。
  if (ctx.storyLayout) {
    runLayout(ctx.storyLayout, nodes, edges, {}).then((better) => {
      if (!better || !better.meta || !better.meta.custom) return;
      cache.set(key, better);
      if (ctx.refreshStoryline) ctx.refreshStoryline();
    });
  }
  return result;
}

/** 丢掉某个晶体的排布缓存（卡片增删、关系变了之后要重算） */
export function invalidateStoryline(ctx, path) {
  if (path) cache.delete(path.join("\u0000"));
  else cache.clear();
  if (ctx.refreshStoryline) ctx.refreshStoryline();
}

// ============================================================
// 画
// ============================================================

/** 一张卡此刻该在哪：拖过就用拖过的，没拖过就用排布算出来的 */
export function nodePosOf(ctx, card, layout) {
  const saved = layoutOf(ctx).crystalPos;
  const p = saved && saved[card.path];
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y };
  return layout.positions.get(card.path) || { x: 0, y: 0 };
}

/** 幽灵节点摆在哪：主体**上面**一条带（它们不是这一层的卡，不占主图的位置） */
function ghostTop() {
  return -(NODE_H + 40);
}

/**
 * 这一屏所有节点的世界包围盒——`fit()` 拿它框一下。
 *
 * **必须把幽灵节点算进去**：它们摆在 y 为负的一条带上，不算的话
 * `fit()` 框出来的是主体那块，幽灵整条露在视口外面——而它们恰恰是
 * 「这条线还有下文」的提示，看不到就等于没有。
 */
export function storylineBounds(ctx, path) {
  const cards = cardsUnder(ctx, path);
  const { ghosts } = edgesUnder(ctx, cards);
  if (!cards.length && !ghosts.size) return null;
  const layout = layoutFor(ctx, path);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (x, y) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + NODE_W);
    y1 = Math.max(y1, y + NODE_H);
  };
  for (const c of cards) {
    const p = nodePosOf(ctx, c, layout);
    grow(p.x, p.y);
  }
  [...ghosts.keys()].forEach((_, i) => grow(i * (NODE_W + 24), ghostTop()));
  if (x0 === Infinity) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function ensureLinkLayer(ctx) {
  if (ctx._sLink && ctx._sLink.parentNode) return ctx._sLink;
  const svg = svgEl("svg");
  svg.setAttribute("class", "kb-v13-slinks");
  ctx.canvas.appendChild(svg);
  ctx._sLink = svg;
  return svg;
}

/**
 * 拐点抓手单独一层，**画在卡片之上**。
 *
 * 头一层 SVG 的 z-index 是 0、卡片节点是 1——线活在卡片底下（对的，线横穿卡面
 * 会很难看）。但抓手不能也跟着埋在底下：金线经常整段压在别的卡上，
 * 那样抓手就永远点不着，"拖拐点"这件事直接作废。所以抓手自己一层、z-index 2。
 */
function ensureHandleLayer(ctx) {
  if (ctx._sHandle && ctx._sHandle.parentNode) return ctx._sHandle;
  const svg = svgEl("svg");
  svg.setAttribute("class", "kb-v13-shandles");
  ctx.canvas.appendChild(svg);
  ctx._sHandle = svg;
  return svg;
}

/**
 * 画这一层的故事线。
 *
 * 节点用的是**小形态**（标题 + 概念），不是卡阵里那种完整卡 DOM——
 * 一屏要摊开几十上百张，完整卡那套（概念区、关键词条、标签）会把浏览器按死。
 * 这是故事线最容易翻车的地方，所以形态从一开始就是小的。
 */
export function renderStorylineStage(ctx, path) {
  const cards = cardsUnder(ctx, path);
  const { chain, links, ghosts } = edgesUnder(ctx, cards);
  const layout = cards.length ? layoutFor(ctx, path) : { positions: new Map() };
  const pos = new Map();
  for (const c of cards) pos.set(c.path, nodePosOf(ctx, c, layout));

  // 3.0 刀 13：被右键藏掉入链出链的那几张卡。**这里也要算一份**——
  // 线上那个跳过发生在 paintStoryLines 里，而节点上那个「线已藏」角标是在
  // 下面这个循环里加的，两处各要一次。（漏掉这一个的后果是整屏渲染直接
  // ReferenceError，连库都进不去——测试逮住了，别把它挪进 paintStoryLines。）
  const hidden = hiddenCardSet(ctx);

  const svg = ensureLinkLayer(ctx);
  paintStoryLines(ctx, svg, cards, path, layout);

  for (const c of cards) {
    const p = pos.get(c.path);
    const el = EL("div", "kb-v13-snode");
    el.dataset.path = c.path;
    el.dataset.title = c.title;
    // 3.0 刀 13：这张卡的入链出链被右键藏起来了。
    // **这不是装饰**——不标出来的话，用户看到的是一张一根线都没有、可他明明
    // 写了双链的卡，那读起来是「我的双链丢了」，不是「我把它藏了」。
    // 顺带也告诉他"再右键一次能显回来"这件事有地方可试。
    if (hidden.has(c.path)) el.classList.add("kb-v13-snode-hidden");
    el.style.left = p.x + "px";
    el.style.top = p.y + "px";
    el.style.width = NODE_W + "px";
    el.style.height = NODE_H + "px";
    el.innerHTML =
      '<div class="kb-v13-snode-title">' + esc(c.title) + "</div>" +
      '<div class="kb-v13-snode-concept">' + esc(c.concept || "") + "</div>" +
      // 四边中点的连接点。平时藏着（CSS 里 .kb-v13-linking 才让它们显形）——
      // 一屏几十张卡、每张挂四个小圆点，那画面没法看。
      LINK_SIDES.map((sd) => '<div class="kb-v13-port" data-side="' + sd + '"></div>').join("");
    ctx.canvas.appendChild(el);
  }

  // 幽灵节点：链到这一组之外去了的那一头。**不静默丢掉**——
  // 丢一条边就少一层依赖，排出来的深度是错的、画面会骗人。
  let gx = 0;
  for (const [title, reason] of ghosts) {
    const el = EL("div", "kb-v13-snode kb-v13-snode-ghost");
    el.dataset.ghost = title;
    el.style.left = gx + "px";
    el.style.top = ghostTop() + "px";
    el.style.width = NODE_W + "px";
    el.style.height = NODE_H + "px";
    el.title = reason ? "链到本晶体之外：" + reason : "链到本晶体之外";
    el.innerHTML = '<div class="kb-v13-snode-title">↗ ' + esc(title) + "</div>";
    ctx.canvas.appendChild(el);
    gx += NODE_W + 24;
  }
}

// ============================================================
// 拖
// ============================================================

/**
 * 把这一层的**所有线**重画一遍。
 *
 * 抽成独立一个函数，是因为它有两个调用时机，而第二个是必须的：
 *   1. 整屏渲染时（renderStorylineStage）
 *   2. **拖动一张卡的过程中**（每一帧）
 *
 * 少了第 2 个，线就**钉在原地不动**——卡片跑了、线还连着原来那个位置。
 * 线的坐标是按「卡片此刻在哪」算出来的，卡片动了而不重算，它当然不动。
 * （第一版就是这么错的：只更新了被拖那张卡的 left/top。）
 *
 * 只碰 SVG，不碰节点——**绝不能在这里重建节点**：被拖的那个元素一被换掉，
 * 指针捕获就没了，拖动当场断在半路。
 */
function paintStoryLines(ctx, svg, cards, path, layoutMaybe) {
  const layout = layoutMaybe || (cards.length ? layoutFor(ctx, path) : { positions: new Map() });
  const pos = new Map();
  for (const c of cards) pos.set(c.path, nodePosOf(ctx, c, layout));

  svg.innerHTML = "";
  ensureHandleLayer(ctx).innerHTML = "";
  // 箭头定义得排在清空**之后**——`innerHTML = ""` 会连上一轮的 defs 一起抹掉。
  ensureArrowDefs(svg);
  // 显式给宽高：SVG 默认是 300×150，不给的话连线会被裁在一块小方框里。
  // 尺寸取 layout 算出来的世界尺寸，取整免得多出一像素的滚动条。
  const w = Math.max(1, Math.ceil(layout.meta ? layout.meta.width : 1200));
  const h = Math.max(1, Math.ceil(layout.meta ? layout.meta.height : 800));
  svg.setAttribute("viewBox", "0 0 " + w + " " + h);
  svg.setAttribute("width", w);
  svg.setAttribute("height", h);

  // 3.0 刀 13：蓝线接在卡片的哪一边。**每帧建一次**，见 sideHintMap 顶上那段。
  const hints = sideHintMap(ctx);

  // 3.0 刀 13：被右键藏掉入链出链的那几张卡。**每帧建一次**（几十项，够便宜）。
  const hidden = hiddenCardSet(ctx);

  // 连线画在节点**下面**：先建线，后建节点（DOM 顺序 + z-index 两条一起）。
  const drawLine = (e, cls) => {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) return;
    // 这一头或那一头被藏了 → 这一根不画。**藏 = 不画，绝不动数据**：
    // hiddenCardSet 一清，线原样回来。
    if (hidden.has(e.from) || hidden.has(e.to)) return;
    // 这一对被亲手连过就按记下的边接，没连过就走老规矩（看谁在左谁在右）
    const hint = hints.get(e.from + " " + e.to) || null;
    const { aSide, bSide } = linkSidesFor(a, b, hint);

    // 3.0 刀 14（用户 09-20）：「结构窗里面的连接蓝色线，从贝塞尔曲线改成和金色线
    // 一样直线加圆弧拐角」。
    //
    // 原先这里画的是**贝塞尔弧**（两条控制臂横着往外推）。在库里读不清：弧线从
    // 卡片中段穿过去，两根一交就看不出谁接谁。金色线那套**横平竖直 + 圆角**本来
    // 就是为这件事写的（见 routePoints 顶上那段），所以蓝线直接改走同一条路。
    //
    // 形状既然一样了，区分就只剩**颜色和虚实**：蓝线是青色虚线、金线是暖色实线
    // （见 styles.js 的 .kb-v13-slink-direct / .kb-v13-slink-manual，两边都别动）。
    //
    // ⚠️ 于是 `bezier()` 连同它那个「两头各带一个方向」的签名一起删了。
    // 要把弧线加回来，得连同这条主接法和 storyline.spec 里那条形状断言一起改。
    const pts = routePoints(portPos(a, aSide), aSide, portPos(b, bSide), bSide, []);
    const path = svgEl("path");
    path.setAttribute("d", roundedPath(pts));
    path.setAttribute("fill", "none");
    path.setAttribute("class", cls);
    // 端点另存一份 data-*：`<path>` 没有 x1/y1 可读，而端点是命中判定要用的东西。
    // 与 drawManualLines 同一口径（都过 base() 取一位小数）。
    path.setAttribute("data-x1", base(pts[0].x));
    path.setAttribute("data-y1", base(pts[0].y));
    path.setAttribute("data-x2", base(pts[pts.length - 1].x));
    path.setAttribute("data-y2", base(pts[pts.length - 1].y));
    // 箭头落在**卡片边上**，不落在正中央。连线画在节点下面（z-index 0 对 1），
    // 落在中央的箭头会被卡片整个盖住——等于没画，而"谁链谁"就全靠它说。
    if (e.fwd) path.setAttribute("marker-end", "url(#" + ARROW_ID + ")");
    if (e.back) path.setAttribute("marker-start", "url(#" + ARROW_ID + ")");
    svg.appendChild(path);
  };
  // 「隐藏双链」藏的是库自己算出来的那些线。**手工连的金线永远留着**：
  // 那是用户自己画的，不属于"可以藏起来的信息"。
  //
  // 3.0 刀 9-D（用户 09-19 判的）：**文件名链不再画线**。
  // 它是按文件名排出来的先后，不是你写的「关系」——把它画成一根线、和真双链
  // 并排摆在一张图上，等于把「我的排版意图」和「笔记里白纸黑字的事实」说成
  // 一回事，而认错这两样正是这个库一直在防的事。排布那边照旧拿它当 x 轴基准
  // （edgesUnder 里那条 `chain` 一个字没动），少掉的只是这一根线。
  const { links } = edgesUnder(ctx, cards);
  if (!ctx.state.hideLinks) {
    for (const e of mergePairs(links)) drawLine(e, "kb-v13-slink kb-v13-slink-direct");
  }
  // 用户手工连的：**从连接点出发、接到连接点**，不居中——那是他自己画的，
  // 接在哪儿就该显示在哪儿。
  drawManualLines(ctx, svg, pos, hidden);
}

/** 故事线那一层 SVG 里箭头 marker 的 id。**每张 SVG 都要自己带一份 defs**：
 *  `url(#id)` 是按**文档**找的，可两张 SVG 不一定同时在文档里（结构窗那张会
 *  随窗一起从 DOM 上摘下来），靠"反正另一张有"迟早会有一边画不出箭头。 */
const ARROW_ID = "kb-sarrow";

/** 给一张 SVG 挂上箭头定义。重复调用只会覆盖同名 defs，不会越积越多。 */
function ensureArrowDefs(svg) {
  let defs = svg.querySelector("defs");
  if (!defs) {
    defs = svgEl("defs");
    svg.insertBefore(defs, svg.firstChild);
  }
  const m = svgEl("marker");
  m.setAttribute("id", ARROW_ID);
  m.setAttribute("viewBox", "0 0 10 10");
  m.setAttribute("refX", "9");
  m.setAttribute("refY", "5");
  m.setAttribute("markerWidth", "6");
  m.setAttribute("markerHeight", "6");
  m.setAttribute("orient", "auto-start-reverse");
  // `auto-start-reverse` 是关键：一根线上两个头共用同一个 marker，
  // marker-start 会自动掉头。没有它，反着来的那条边箭头会指向自己。
  m.setAttribute("markerUnits", "userSpaceOnUse");
  const tri = svgEl("path");
  tri.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  tri.setAttribute("class", "kb-v13-sarrow");
  m.appendChild(tri);
  defs.appendChild(m);
}

/**
 * 这一对卡片的两头**各接在哪一边**。
 *
 * `hint`（3.0 刀 13）是这一对**被亲手连过**时记下的接法。有它就按它走；
 * 没有就走老规矩：看谁在左谁在右，各接在中线那一侧的边上。
 *
 * ⚠️ 没有提示时**不要顺手改成"按上下左右自动挑最近的一边"**。用户 09-20 要的
 * 是「通过节点的连接来控制」，控制的入口是**他自己拖的那个连接点**；自动那一档
 * 只要"说得过去"就够了，而把它一起换掉等于替所有老用户免费换一张图——
 * 这一屏的形状是从他们的笔记关系里读出来的，不是我们的画布。觉得接歪了，
 * 从该走的那边拖一次就改过来了，而且是记住的。
 */
function linkSidesFor(a, b, hint) {
  if (hint) return { aSide: hint.fromSide, bSide: hint.toSide };
  const ac = { x: a.x + NODE_W / 2, y: a.y + NODE_H / 2 };
  const bc = { x: b.x + NODE_W / 2, y: b.y + NODE_H / 2 };
  return bc.x >= ac.x
    ? { aSide: "right", bSide: "left" }
    : { aSide: "left", bSide: "right" };
}

/**
 * A→B 和 B→A **合画一条**，并记下方向（用户 09-19 要的）。
 *
 * 为什么不是两条：两张卡互相引用时，屏幕上并排摆着两根几乎重合的弧线，
 * 谁也分不清那是「互相」还是「其中一条画歪了」。合成一条 + 两头箭头之后，
 * 三种情形一眼可辨：只有 A 指 B / 只有 B 指 A / 两边都指。
 *
 * 排的是路径字典序而不是谁先写——**方向不能靠顺序推**，字典序只是给配对
 * 一个稳定的键，谁指谁由 fwd / back 两个布尔单独记。
 */
function mergePairs(links) {
  const out = new Map();
  for (const l of links) {
    const flip = l.from > l.to;
    const a = flip ? l.to : l.from;
    const b = flip ? l.from : l.to;
    const key = a + "\u0000" + b;
    let cur = out.get(key);
    if (!cur) {
      cur = { from: a, to: b, fwd: false, back: false, reason: "" };
      out.set(key, cur);
    }
    if (flip) cur.back = true;
    else cur.fwd = true;
    if (!cur.reason && l.reason) cur.reason = l.reason;
  }
  return [...out.values()];
}

/** 拖动过程中重画线（只碰 SVG，不碰节点） */
export function redrawStoryLines(ctx) {
  const svg = ctx._sLink;
  if (!svg || !svg.parentNode) return;
  const path = ctx.state.crystalPath || [];
  const cards = cardsUnder(ctx, path);
  if (!cards.length) return;
  paintStoryLines(ctx, svg, cards, path);
}

/** 只把位置写回去，不重建——拖动过程中用（重建会丢指针捕获） */
export function applyStorylinePositions(ctx, path) {
  const cards = cardsUnder(ctx, path);
  const layout = layoutFor(ctx, path);
  for (const el of ctx.canvas.querySelectorAll(".kb-v13-snode")) {
    const p = el.dataset.path;
    if (!p) continue;
    const card = cards.find((c) => c.path === p);
    if (!card) continue;
    const at = nodePosOf(ctx, card, layout);
    el.style.left = at.x + "px";
    el.style.top = at.y + "px";
  }
}

/**
 * 拖卡片节点。机制全在 itemdrag.js 里（连那条「事件绑舞台」的教训一起），
 * 这里只说清「节点是什么、它在哪、位置记到哪儿」。
 *
 * 位置记进 `crystalPos`——**它是「位置表」，不是「晶体专有的表」**：
 * 键在这一层用的是卡片路径，和晶体 key 不会撞（路径里有斜杠）。
 * 视图状态的顶层形状是冻结的，加不了第二个表，把语义讲清楚比加字段划算。
 */
export function bindStorylineDrag(ctx) {
  bindItemDrag(ctx, {
    selector: ".kb-v13-snode",
    keyOf: (el) => el.dataset.path,
    stage: "storyline",
    // 连接点是控件，不是「这张卡的一部分」——按它是要拉线，不是要挪卡
    ignore: ".kb-v13-port",
    posOf: (c, path) => {
      const card = c.model.byPath.get(path);
      if (!card) return { x: 0, y: 0 };
      return nodePosOf(c, card, layoutFor(c, c.state.crystalPath));
    },
    writePos: (c, path, p) => {
      const l = layoutOf(c);
      if (l.crystalPos) l.crystalPos[path] = p;
    },
    // 拖动过程中：位置**当场写进草稿**，并把线重画一遍。
    // 不写的话，线是按「卡片此刻在哪」算的，而它读的还是旧位置——照样不动。
    onMove: (c, path, p) => {
      const l = layoutOf(c);
      if (l.crystalPos) l.crystalPos[path] = p;
      redrawStoryLines(c);
    },
  });
}

/**
 * 点节点：正常节点打开那张卡的面板；**幽灵节点跳到它所在的那颗晶体**。
 *
 * 幽灵是「链到本晶体之外」的那一头，它存在的意义就是「这条边不是没了，
 * 只是那一头在别处」——所以点它必须真的带人过去，否则它只是个装饰。
 */
export function bindStorylineClicks(ctx) {
  ctx.canvas.addEventListener("click", (e) => {
    if (ctx.state.stage !== "storyline") return;
    const el = e.target && e.target.closest && e.target.closest(".kb-v13-snode");
    if (!el) return;
    e.stopPropagation();
    if (el.dataset.ghost) {
      const card = ctx.model.cardByTitle(el.dataset.ghost);
      if (card && card.crystal && ctx.gotoCrystal) ctx.gotoCrystal(card.crystal);
      return;
    }
    const card = ctx.model.byPath.get(el.dataset.path);
    if (card) ctx.openCardPanel(card);
  });
}

// ============================================================
// 手工连线（连接模式）
// ============================================================
//
// 交互是用户定的：**空白处右键**进连接模式（四边中点的小圆点全亮出来，
// 这时点卡片不进卡），连好之后**左键点空白**退出来，单击又能进卡了。
//
// 比「双击进卡」好在两点：**不改任何既有习惯**（单击进卡原样保留），
// 而且屏幕上始终有一个明确的「现在处于什么状态」——那正是这类模式该给的。

/** 四个方向。顺序与 CSS 里的定位对应，改一处要连着改另一处。 */
export const LINK_SIDES = ["top", "right", "bottom", "left"];

/** 四个方向「朝外」是哪一边。橡皮筋从连接点出去时要顺着它。 */
const SIDE_DIR = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** 某个方向的连接点在**世界坐标**里的位置 */
export function portPos(node, side) {
  const c = { x: node.x + NODE_W / 2, y: node.y + NODE_H / 2 };
  if (side === "top") return { x: c.x, y: node.y };
  if (side === "bottom") return { x: c.x, y: node.y + NODE_H };
  if (side === "left") return { x: node.x, y: c.y };
  return { x: node.x + NODE_W, y: c.y };
}

/** 这个晶体上手工连的线 */
export function manualLinks(ctx) {
  const v = layoutOf(ctx);
  const all = v.cardLinks && typeof v.cardLinks === "object" ? v.cardLinks : {};
  const key = (ctx.state.crystalPath || []).join(" ");
  return Array.isArray(all[key]) ? all[key] : [];
}

function writeManualLinks(ctx, list) {
  const v = layoutOf(ctx);
  if (!v.cardLinks || typeof v.cardLinks !== "object") v.cardLinks = {};
  const key = (ctx.state.crystalPath || []).join(" ");
  if (list.length) v.cardLinks[key] = list;
  else delete v.cardLinks[key];
  if (ctx.persistViewState) ctx.persistViewState();
}

/** 字典序规范序：小的在前。判据必须与 mergePairs 的 `l.from > l.to` 是同一句。 */
function canonical(x, y) {
  return x <= y ? [x, y, false] : [y, x, true];
}

/**
 * 记下「这一对卡片接在哪儿」（3.0 刀 13）。**只记，不画。**
 *
 * 画是 paintStoryLines 的事，写盘是 ctx.persistViewState 那根线的事——这一层
 * 两样都不认识。形状与 writeManualLinks 逐句对应（同一套 layoutOf + 按键去空 +
 * persist），这样"记东西"在这两个地方长得一样，读的人不用记两套。
 *
 * 存的是**规范序**（与 mergePairs 同一套），查找时两个方向都试（见 sideHintMap）。
 */
function writeLinkSide(ctx, from, to, fromSide, toSide) {
  if (!from || !to || from === to) return;
  const [a, b, flip] = canonical(from, to);
  const v = layoutOf(ctx);
  if (!v.linkSides || typeof v.linkSides !== "object") v.linkSides = {};
  const key = (ctx.state.crystalPath || []).join(" ");
  const list = (Array.isArray(v.linkSides[key]) ? v.linkSides[key] : [])
    // 同一对只留最新的一次：用户重新拖一遍说的是"改成这样"，不是"再加一条"
    .filter((l) => !(l && l.from === a && l.to === b));
  list.push(
    flip
      ? { from: a, to: b, fromSide: toSide, toSide: fromSide }
      : { from: a, to: b, fromSide, toSide }
  );
  v.linkSides[key] = list;
  if (ctx.persistViewState) ctx.persistViewState();
}

/**
 * 此刻藏起来的那几张卡（3.0 刀 13）。**每一帧建一次 Set**（几十项，够便宜）。
 *
 * 与 sideHintMap 同一条纪律：**不做成 ctx 上的缓存**——结构窗的影子对象有一张
 * "必须归零的单槽位"名单，多一个槽位就多一处漏归零。
 */
export function hiddenCardSet(ctx) {
  const v = layoutOf(ctx);
  const list = Array.isArray(v.hiddenLinks) ? v.hiddenLinks : [];
  return new Set(list.filter((p) => typeof p === "string" && p));
}

/** 这一张卡的入链出链是不是被藏了 */
export function isCardHidden(ctx, path) {
  return !!path && hiddenCardSet(ctx).has(path);
}

function writeHiddenSet(ctx, set) {
  const v = layoutOf(ctx);
  v.hiddenLinks = [...set];
  if (ctx.persistViewState) ctx.persistViewState();
}

/**
 * 藏 / 显回一张卡（3.0 刀 13。用户 09-20 定的：**同一张卡再右键一次就是显回来**）。
 *
 * 存的是**卡片路径**不是标题：关系图那张表是按 title 建的，跨文件夹同名会让边
 * 指错人（见 edgesUnder 顶上那段）。藏东西这件事不能认错人。
 *
 * 重画走 `ctx.refreshStoryline`（整屏）而**不是** `redrawStoryLines`——卡片上那个
 * 「线已藏」标记也要跟着变，而后者按设计只碰 SVG、**绝不重建节点**
 * （见 renderStorylineStage 顶上那段：被拖的那个元素一换掉，指针捕获就没了）。
 */
export function toggleHiddenCard(ctx, path) {
  if (!path) return false;
  const set = hiddenCardSet(ctx);
  if (set.has(path)) set.delete(path);
  else set.add(path);
  writeHiddenSet(ctx, set);
  if (ctx.refreshStoryline) ctx.refreshStoryline();
  if (ctx.refreshStageUi) ctx.refreshStageUi();
  return set.has(path);
}

/**
 * 顶栏那颗「显示全部」：**一次全显回来**（3.0 刀 13）。
 *
 * 没有藏着的东西时什么都不做——不落盘、不重画、也不弹一句话。那颗按钮本来
 * 就只在真有东西可显的时候才出场。
 *
 * @returns {number} 显回来了几张
 */
export function showAllHidden(ctx) {
  const n = hiddenCardSet(ctx).size;
  if (!n) return 0;
  writeHiddenSet(ctx, new Set());
  if (ctx.refreshStoryline) ctx.refreshStoryline();
  if (ctx.refreshStageUi) ctx.refreshStageUi();
  return n;
}

/**
 * 这一屏所有的蓝线接法提示，做成一张 Map（3.0 刀 13）。**每一帧建一次。**
 *
 * 两个方向**各插一份**：存进去的是规范序（与 mergePairs 同一套），而渲染时拿到的
 * from/to 是**另一处实现**的约定——两处靠"我们记得同步改"来对齐，正是这个仓最爱
 * 出事的地方。各插一份的代价是一次比较，换来的是"文件被手改过顺序也不会静默丢掉
 * 一条提示"。
 *
 * ⚠️ **不做成 ctx 上的缓存**：结构窗的影子对象有一张"必须归零的单槽位"名单
 * （见 embedstory.js 的 makeFacade），多一个槽位就多一处漏归零——症状是结构窗
 * 用着**库那一屏**的提示。几十项的 Map 每帧建一次，不值得为它冒那个险。
 */
function sideHintMap(ctx) {
  const out = new Map();
  const v = layoutOf(ctx);
  const all = v.linkSides && typeof v.linkSides === "object" ? v.linkSides : {};
  const key = (ctx.state.crystalPath || []).join(" ");
  const list = all[key];
  if (!Array.isArray(list)) return out;
  for (const l of list) {
    if (!l || !l.from || !l.to) continue;
    out.set(l.from + " " + l.to, { fromSide: l.fromSide, toSide: l.toSide });
    out.set(l.to + " " + l.from, { fromSide: l.toSide, toSide: l.fromSide });
  }
  return out;
}

/** 位置表：这一层每张卡此刻在哪（世界坐标） */
function posMapOf(ctx, path, layout) {
  const m = new Map();
  for (const c of cardsUnder(ctx, path)) m.set(c.path, nodePosOf(ctx, c, layout));
  return m;
}

function drawManualLines(ctx, svg, pos, hidden) {
  // 每画一根就把它**走过的折线**留一份。命中判定（点线选中、双击加拐点）
  // 全靠这个：SVG 里的线是 pointer-events:none 的，事件永远轮不到它们，
  // 只能拿指针位置去和这份几何算距离。
  const geom = [];
  ctx._manualHit = geom;
  const editing = isLineEdit(ctx);
  const all = manualLinks(ctx);
  for (let index = 0; index < all.length; index++) {
    const l = all[index];
    const a = pos.get(l.from);
    const b = pos.get(l.to);
    // 连到一张已经不在这屏上的卡：**安静地少画这一根**，不报错、也不清数据。
    // 卡片可能只是暂时不在这儿（被挪去了别的文件夹），清掉就找不回来了。
    if (!a || !b) continue;
    // 3.0 刀 13：这张卡被右键藏了 → 它的金线一起藏。
    //
    // ⚠️ **必须在这里就退出**，不能只是"不 appendChild"。`_manualHit` 是右键 /
    // 框选 / 双击加拐点的**唯一**命中来源；一根看不见的线留在里面，症状是
    // 「右键空白处却进了连线编辑模式」「框选删掉了一根我看不见的线」——
    // 两样都不报错，而且都是"删了/改了用户没打算动的东西"那一类。
    if (hidden && (hidden.has(l.from) || hidden.has(l.to))) continue;
    const pts = routePoints(portPos(a, l.fromSide), l.fromSide, portPos(b, l.toSide), l.toSide, l.bends);
    const on = isPicked(ctx, l);
    const path = svgEl("path");
    path.setAttribute("d", roundedPath(pts));
    path.setAttribute("fill", "none");
    path.setAttribute(
      "class",
      "kb-v13-slink kb-v13-slink-manual" + (on ? " kb-v13-slink-picked" : "")
    );
    path.setAttribute("data-x1", base(pts[0].x));
    path.setAttribute("data-y1", base(pts[0].y));
    svg.appendChild(path);
    // 留一份几何给命中判定用（见 hitManual 上面那段）。**下标也要留**：
    // 加拐点时要写回 manualLinks 里对的那一条。
    geom.push({ index, link: l, pts });
    // 抓手在**编辑模式里全部摆出来**。不再要求"先选中某一根"——左键选中那套
    // 被换掉了（见上面的说明），抓手就得有个不依赖它的出场方式。
    if (editing) drawBendHandles(ctx, l);
  }
  // 框选的矩形。画在最后 = 压在所有的线和抓手之上，扫过去看得清。
  const marquee = ctx.state.marqueeRect;
  if (marquee) {
    const r = svgEl("rect");
    r.setAttribute("x", base(marquee.x));
    r.setAttribute("y", base(marquee.y));
    r.setAttribute("width", base(Math.max(0, marquee.w)));
    r.setAttribute("height", base(Math.max(0, marquee.h)));
    r.setAttribute("class", "kb-v13-marquee");
    ensureHandleLayer(ctx).appendChild(r);
  }
}

/**
 * 选中的那根线上，每个拐点摆一个小圆点——双击加出来的拐点要看得见、抓得住。
 *
 * `pointer-events:auto` **必须显式写**（在 styles.js 里）：SVG 自己是 `none`，
 * 圆点不写这一句就继承不到事件，拖它、双击它全部落空而且不报错。
 * 这条规律这一轮踩到第四次了。
 *
 * 位置取 **`link.bends`（用户自己加的那几个）**，不是画出来的折线上的每个顶点
 * ——正交化会自动补出一堆"直角点"（出线那一小段的尽头就是一个），
 * 它们不是用户加的东西，摆上抓手会让人以为那些也能拖。
 *
 * ⚠️ 这里的 dataset 是拖动时的**身份凭据**（从 from/to + 坐标找回是哪一个拐点），
 * 所以坐标要原样写进去，别做四舍五入——`base()` 只用于显示用的 cx/cy。
 */
function drawBendHandles(ctx, link) {
  const svg = ensureHandleLayer(ctx);
  for (const b of Array.isArray(link.bends) ? link.bends : []) {
    if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
    const c = svgEl("circle");
    c.setAttribute("cx", base(b.x));
    c.setAttribute("cy", base(b.y));
    c.setAttribute("r", 5);
    c.setAttribute("class", "kb-v13-sbend");
    c.dataset.from = link.from;
    c.dataset.to = link.to;
    c.dataset.bx = String(b.x);
    c.dataset.by = String(b.y);
    svg.appendChild(c);
  }
}

// ============================================================
// 金色的手工线：怎么走（3.0 刀 5 第二轮）
// ============================================================
//
// 用户要的是**流程图那种折线**：只走横平竖直，拐弯处带弧度。原来的贝塞尔弧
// 好看，但它表达的是"这两头有关系"，而流程图折线表达的是"从这儿到那儿怎么走"
// ——手工线是他一条条自己连的，本来就更像后者。
//
// 拐点由**双击线身**加出来（再双击那个圆点去掉），拖动圆点可以摆位置。

/** 小于这个就当零。浮点坐标别拿 `=== 0` 判 */
const EPS = 0.5;
/** 出线先直走一小段再拐——流程图里那截"引线"，没有它线会贴着卡片边走 */
const STUB = 22;
/** 要绕行时多让出去多少 */
const CLEAR = 30;
/** 拐角的圆角半径 */
const CORNER = 10;

const round1 = (v) => Math.round(v * 10) / 10;
const base = round1;

/** 两点之间那一小段的单位向量（从 b 指向 a） */
function unitTo(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.001) return { x: 0, y: 0, d: 0 };
  return { x: dx / d, y: dy / d, d };
}

function axisOf(side) {
  return side === "top" || side === "bottom" ? "v" : "h";
}

function step(p, dir, n) {
  return { x: p.x + dir.x * n, y: p.y + dir.y * n };
}

/**
 * 把一串点连成**只走横平竖直**的折线：相邻两点若 x、y 都不同，中间补一个直角拐点。
 *
 * 补哪个方向的拐点由 `axis`（此刻的走向）决定——先沿当前方向走，再拐。
 * 于是"出线沿着端口方向"这条能一路传下去，第一次拐弯不会莫名其妙地竖着出。
 */
function orthogonalize(raw, startAxis) {
  const out = [raw[0]];
  let axis = startAxis;
  for (let i = 1; i < raw.length; i++) {
    const p = raw[i];
    let q = out[out.length - 1];
    if (Math.abs(p.x - q.x) > EPS && Math.abs(p.y - q.y) > EPS) {
      const e = axis === "h" ? { x: p.x, y: q.y } : { x: q.x, y: p.y };
      out.push(e);
      q = e;
    }
    if (Math.abs(p.x - q.x) > EPS) axis = "h";
    else if (Math.abs(p.y - q.y) > EPS) axis = "v";
    out.push(p);
  }
  return out;
}

/** 去掉重合的相邻点（正交化之后很容易冒出零长段，圆角那一步会被它除零） */
function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01) continue;
    out.push(p);
  }
  return out;
}

/**
 * 一条手工线走的折线（世界坐标）。
 *
 * 没有拐点时用**认端口的默认走法**：从出线那一侧先走一小段，再拐。
 * 两侧都是横的（最常见的"右边出、左边进"）走"横—竖—横"，线从中间那道竖井穿过去，
 * 一眼能看出是从哪张卡到哪张卡；一横一竖就走一个直角。**这一步不做就只是根
 * 斜线换个画法**，流程图那个味道全在"认端口"上。
 */
export function routePoints(a, aSide, b, bSide, bends) {
  const dirA = SIDE_DIR[aSide] || { x: 1, y: 0 };
  const dirB = SIDE_DIR[bSide] || { x: -1, y: 0 };
  const s0 = step(a, dirA, STUB);
  const s1 = step(b, dirB, STUB);
  const user = (Array.isArray(bends) ? bends : []).filter(
    (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
  );

  const mid = [];
  if (user.length) {
    mid.push(...user);
  } else if (axisOf(aSide) === "h" && axisOf(bSide) === "h") {
    if (Math.sign(s1.x - s0.x) === Math.sign(dirA.x)) {
      const mx = (s0.x + s1.x) / 2;
      mid.push({ x: mx, y: s0.y }, { x: mx, y: s1.y });
    } else {
      // 反向（比如右边出、左边进，但那张卡其实在左边）：**贴着两边绕出去**，
      // 直连会横穿两张卡自己。多两个拐，但读得懂。
      const my = (s0.y + s1.y) / 2;
      const ox = s0.x + dirA.x * CLEAR;
      const ix = s1.x + dirB.x * CLEAR;
      mid.push({ x: ox, y: s0.y }, { x: ox, y: my }, { x: ix, y: my }, { x: ix, y: s1.y });
    }
  } else if (axisOf(aSide) === "v" && axisOf(bSide) === "v") {
    if (Math.sign(s1.y - s0.y) === Math.sign(dirA.y)) {
      const my = (s0.y + s1.y) / 2;
      mid.push({ x: s0.x, y: my }, { x: s1.x, y: my });
    } else {
      const mx = (s0.x + s1.x) / 2;
      const oy = s0.y + dirA.y * CLEAR;
      const iy = s1.y + dirB.y * CLEAR;
      mid.push({ x: s0.x, y: oy }, { x: mx, y: oy }, { x: mx, y: iy }, { x: s1.x, y: iy });
    }
  } else if (axisOf(aSide) === "h") {
    mid.push({ x: s1.x, y: s0.y });
  } else {
    mid.push({ x: s0.x, y: s1.y });
  }

  const out = dedupe(orthogonalize([a, s0, ...mid, s1, b], axisOf(aSide)));

  // 最后一截必须**顺着目标端口的方向扎进去**（就是那段 STUB 的延长线）。
  // 加了拐点之后正交化可能让它横着撞到卡边上——补一个点掰回来。
  const i = out.findIndex((p) => p === s1);
  if (i >= 1) {
    const prev = out[i - 1];
    const lastAxis = Math.abs(prev.x - s1.x) > EPS ? "h" : "v";
    if (lastAxis !== axisOf(bSide)) {
      out.splice(
        i,
        0,
        axisOf(bSide) === "h" ? { x: prev.x, y: s1.y } : { x: s1.x, y: prev.y }
      );
    }
  }
  return dropCollinear(dedupe(out));
}

/**
 * 去掉「三点共线」的中间点。
 *
 * **不是洁癖，是必须的**：圆角那一步只认"拐角"，而共线的中间点在它眼里
 * 是一个 180° 的回头弯——于是会在那儿抹出一个**半圆形的鼓包**，
 * 线上凭空多出一个钩子。正交化那一步很爱造这种点（比如"先横后竖"的中间点
 * 正好落在两端连线上时），所以必须在这儿清掉。
 *
 * 判据是**偏离直线的像素距离**，不是角度：角度判据在长段上极小的偏差也算拐角，
 * 而那点偏差圆角一放大就是个鼓包。用户双击加出来的拐点常常离原地线零点几像素
 * （他点的就是线上），角度判据会说"这是个拐角"，屏幕上于是多出一个看不出来的
 * 小疙瘩——累积几处就很脏。按"偏了不到一个像素"来判，这种点直接当直的。
 */
function dropCollinear(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const span = Math.hypot(c.x - a.x, c.y - a.y);
    if (span < 0.01) continue;
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(cross) / span < 0.9) continue;
    out.push(b);
  }
  if (pts.length > 1) out.push(pts[pts.length - 1]);
  return out;
}

/** 折线 → 带圆角的 SVG `d`。拐角用二次贝塞尔抹一下，半径取相邻两段的一半以内，圆角不会打架 */
function roundedPath(pts) {
  if (!pts.length) return "";
  let d = "M " + base(pts[0].x) + " " + base(pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const v1 = unitTo(a, b);
    const v2 = unitTo(c, b);
    const r = Math.min(CORNER, v1.d / 2, v2.d / 2);
    if (!(r > 0.6)) {
      d += " L " + base(b.x) + " " + base(b.y);
      continue;
    }
    d +=
      " L " + base(b.x + v1.x * r) + " " + base(b.y + v1.y * r) +
      " Q " + base(b.x) + " " + base(b.y) + " " +
      base(b.x + v2.x * r) + " " + base(b.y + v2.y * r);
  }
  const last = pts[pts.length - 1];
  d += " L " + base(last.x) + " " + base(last.y);
  return d;
}

/** 连接模式开着吗（运行时状态，**不落盘**——它是一次操作中途的状态，不是场景） */
export function isLinking(ctx) {
  return !!ctx.state.linking;
}

/**
 * 离开故事线这一屏：把**只属于它**的几样东西收干净。
 *
 * 右键菜单挂在 body 上（不随舞台重建而消失），连接模式和选中态是运行时状态。
 * 不收的话表现是：切回卡阵了，屏幕角落还挂着一个「删除实线」，点了删的是
 * 一个已经看不见的东西。
 */
export function leaveStoryline(ctx) {
  ctx.state.marqueeSel = [];
  ctx.state.marqueeRect = null;
  setLineEdit(ctx, false);
  setLinking(ctx, false);
}

export function setLinking(ctx, on) {
  const next = !!on;
  if (ctx.state.linking === next) return false;
  ctx.state.linking = next;
  if (ctx.fs) ctx.fs.classList.toggle("kb-v13-linking", next);
  if (ctx.refreshStageUi) ctx.refreshStageUi();
  return true;
}

/**
 * 连接模式的进出与「拖一根线到另一张卡」。
 *
 * ⚠️ 拖动那一套纪律和 itemdrag 一样：**pointermove/pointerup 绑舞台**。
 * 世界层是 pointer-events:none 的，指针一离开卡片的矩形，事件就冒泡不到它上面。
 * 连接点只有 12px，比什么都容易出界——这一轮已经在同一个坑里摔过三次了。
 */
export function bindLinkMode(ctx) {
  const g = ctx.stage;
  let drag = null;

  // 右键：**落在金线上是弹菜单，落在空白才是进连接模式**。
  //
  // 顺序不能反。反过来的话，想删线的人一右键就被弹进连接模式——那是一个他
  // 找不到出口的模式（屏幕上只多出一些小圆点），而他要的菜单根本没出现。
  // 一条线上「右键」只有一种合理解释，所以这里不需要额外的修饰键。
  //
  // **必须 preventDefault**：不拦的话宿主会弹出自己的菜单，把这一下盖掉——
  // 用户看到的是「按了没反应，还弹了个菜单」。
  g.addEventListener("contextmenu", (e) => {
    if (ctx.state.stage !== "storyline") return;
    e.preventDefault();
    e.stopPropagation();
    // 3.0 刀 13（用户 09-20）：「鼠标对着卡片右键，隐藏这张卡片所有的入链和出链」。
    //
    // **必须排在 hitManual 前面**：卡片节点 z-index 1、线在 0，事件本来就落在卡上；
    // 而 hitManual 是按**世界坐标算距离**的，压在这张卡底下的一段金线照样会被
    // "命中"——排在后头的话，右键一张卡有时进连线编辑模式、有时藏，全看线正好
    // 从哪儿过。
    //
    // 入口由**写模式**开：平时右键卡片仍然是"进连接模式"（那条是用户 09-19 定的，
    // 一个字不动）。「已经藏了」也算一条进路——不这么写的话，切回「看」那一档
    // 之后右键卡片会被弹进连接模式，藏起来的东西就只剩顶栏那颗按钮能救了。
    const node = e.target && e.target.closest && e.target.closest(".kb-v13-snode");
    const cardPath = node && node.dataset.path;
    if (cardPath && (ctx.state.linkWrite || isCardHidden(ctx, cardPath))) {
      toggleHiddenCard(ctx, cardPath);
      return;
    }
    const w = ctx._panzoom ? ctx._panzoom.clientToWorld(e.clientX, e.clientY) : null;
    const hit = w ? hitManual(ctx, w) : null;
    if (hit) {
      // 落在金线上 = 进**连线编辑模式**（按住 S 框选、按 D 删）。
      // 同时退出连接模式：两个模式各说各的，同时开着的话屏幕上既有连接点
      // 又能框选，谁也说不清这一下点下去算什么。
      setLinking(ctx, false);
      setLineEdit(ctx, true);
      return;
    }
    setLineEdit(ctx, false);
    setLinking(ctx, true);
  });

  g.addEventListener("pointerdown", (e) => {
    if (ctx.state.stage !== "storyline" || !isLinking(ctx) || e.button !== 0) return;
    const port = e.target && e.target.closest && e.target.closest(".kb-v13-port");
    if (!port) return;
    const node = port.closest(".kb-v13-snode");
    if (!node || !node.dataset.path) return;
    e.stopPropagation();
    e.preventDefault();
    const layout = layoutFor(ctx, ctx.state.crystalPath);
    const pos = posMapOf(ctx, ctx.state.crystalPath, layout);
    const from = pos.get(node.dataset.path) || { x: 0, y: 0 };
    drag = {
      id: e.pointerId,
      fromPath: node.dataset.path,
      side: port.dataset.side,
      start: portPos(from, port.dataset.side),
    };
    const svg = ensureLinkLayer(ctx);
    const line = svgEl("line");
    // 颜色说的是"这一下松开会怎样"（3.0 刀 13）：写模式落蓝双链、看模式落金线。
    line.setAttribute(
      "class",
      "kb-v13-slink kb-v13-slink-rubber" +
        (ctx.state.linkWrite ? "" : " kb-v13-slink-rubber-manual")
    );
    svg.appendChild(line);
    ctx._rubber = line;
    ctx._rubberSide = port.dataset.side;
  });

  g.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const pz = ctx._panzoom;
    if (!pz || !ctx._rubber) return;
    const w = pz.clientToWorld(e.clientX, e.clientY);
    const fromSide = ctx._rubberSide || "right";
    // 3.0 刀 13：这一档决定**松手会得到什么**，而预览必须说同一件事。
    const write = !!ctx.state.linkWrite;

    // **橡皮筋画出松手后的那个形状**，不是一条临时曲线。
    //
    // 指针底下正好压着一张别的卡时，连"扎进它哪一边"都能算出来（nearestSide），
    // 于是预览和落地**逐点同形**——松手那一刻线不会跳。
    // 落在空白处就按"横着出去、再拐到鼠标"画，那正是这根线真连上时的走法。
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const node = under && under.closest && under.closest(".kb-v13-snode");
    const toPath = node && node.dataset.path;
    const pos = posMapOf(ctx, ctx.state.crystalPath, layoutFor(ctx, ctx.state.crystalPath));
    const target = toPath && toPath !== drag.fromPath ? pos.get(toPath) : null;
    const toSide = target ? nearestSide(target, w) : null;
    const svg = ensureLinkLayer(ctx);
    // 颜色说的是"这一下松开会怎样"：写模式落的是蓝双链，看模式落的是金线。
    // 两档共用同一个基类（青 = 蓝双链的颜色），只有看模式多加一个后缀类换成金色。
    const cls =
      "kb-v13-slink kb-v13-slink-rubber" + (write ? "" : " kb-v13-slink-rubber-manual");

    // 3.0 刀 14：蓝线也改成折线了（见 paintStoryLines 里 drawLine 那段），
    // 所以**两档共用这一支**——预览的形状和落地的形状从这一刀起是同一个。
    // 剩下的差别只有颜色：写模式青（蓝双链）、看模式金（手工线）。
    let pts;
    if (target) {
      pts = routePoints(drag.start, fromSide, portPos(target, toSide), toSide, []);
    } else {
      // 空白处：**一根引线加一个直角，直接停在指针上**。
      // 这里绝不能调 routePoints——那条路遇到"目标在身后"会绕一个大 U，
      // 而拖拽过程中指针绕着走一圈是常事，屏幕上会甩出一条巨大的回形针。
      // 落在空白**什么都不会发生**，所以形状本身不是承诺。
      const dir = SIDE_DIR[fromSide] || { x: 1, y: 0 };
      const s0 = step(drag.start, dir, STUB);
      const elbow = axisOf(fromSide) === "h" ? { x: w.x, y: s0.y } : { x: s0.x, y: w.y };
      pts = dedupe(orthogonalize([drag.start, s0, elbow, w], axisOf(fromSide)));
    }
    const next = svgEl("path");
    next.setAttribute("d", roundedPath(pts));
    next.setAttribute("fill", "none");
    next.setAttribute("class", cls);
    svg.replaceChild(next, ctx._rubber);
    ctx._rubber = next;
  });

  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    const svg = ensureLinkLayer(ctx);
    if (ctx._rubber && ctx._rubber.parentNode === svg) svg.removeChild(ctx._rubber);
    ctx._rubber = null;

    // 落在哪张卡上，看的是**指针底下那个元素**。橡皮筋是 svg 里的线、
    // pointer-events:none，不会挡在中间（否则 elementFromPoint 永远命中它）。
    const target = e.target && e.target.closest && e.target.closest(".kb-v13-snode");
    const toPath = target && target.dataset.path;
    if (!toPath || toPath === d.fromPath) return; // 落在空白或自己身上 = 不连
    // 落点在卡片的哪一边。**两条路都要**（写模式记接法提示、看模式记金线），
    // 所以提到写模式那个分支**前面**算一次——原来它长在下面那条路上，
    // 于是写模式永远算不到边（3.0 刀 13）。
    const layout = layoutFor(ctx, ctx.state.crystalPath);
    const pos = posMapOf(ctx, ctx.state.crystalPath, layout);
    const b = pos.get(toPath);
    if (!b) return;
    // 落在卡片的哪一边就记哪一边——线接在该接的地方，不是一刀切连到中心
    const w = ctx._panzoom ? ctx._panzoom.clientToWorld(e.clientX, e.clientY) : { x: b.x, y: b.y };
    const toSide = nearestSide(b, w);

    // 3.0 刀 9-D：**写入型**连线（用户 09-19 要的「通过连线来写入谁链接谁」）。
    //
    // 同一根拖拽动作，两种落法，由结构窗那颗模式按钮切：
    //   · 关（默认）——落一根**视觉金线**，只存在库里，不碰笔记（原样）；
    //   · 开           ——往**源卡正文**里写一条 `[[目标卡]]`，笔记跟着变。
    //
    // 落法是问 `ctx.writeStoryLink`，不在这里直接写盘：这一层不认识适配层，
    // 而且写正文要走 `patchBody` + 基线比对 + 一次撤销那一整套（见 reader.js
    // 的 writeBacklink），那些都不该长在画线的地方。
    if (ctx.state.linkWrite) {
      // 3.0 刀 13（用户 09-20）：「连蓝色双链……通过节点的连接来控制」。
      //
      // 记在 writeStoryLink **之前**：它是异步的，等它回来再记的话用户中途关窗
      // 就丢了；而且它成功之后自己重画一遍，提示得先在场上才画得对。
      //
      // 写失败（冲突 / 文件不在了）**也照记**——记的是"他拖的这一下"，
      // 不是"这次写盘成没成"。一条没有对应双链的提示什么都不影响：没人查它。
      writeLinkSide(ctx, d.fromPath, toPath, d.side, toSide);
      if (ctx.writeStoryLink) ctx.writeStoryLink(d.fromPath, toPath);
      return;
    }
    const list = manualLinks(ctx).filter((l) => !(l.from === d.fromPath && l.to === toPath));
    list.push({ from: d.fromPath, to: toPath, fromSide: d.side, toSide });
    writeManualLinks(ctx, list);
    if (ctx.refreshStoryline) ctx.refreshStoryline();
  };
  g.addEventListener("pointerup", end);
  g.addEventListener("pointercancel", end);

  // 左键点空白退出。**排在右键那条之后**：右键不会带出 click，
  // 所以不会刚进去就被这一下顶出来。
  g.addEventListener("click", (e) => {
    if (ctx.state.stage !== "storyline" || !isLinking(ctx)) return;
    if (e.target && e.target.closest && e.target.closest(".kb-v13-snode")) return;
    setLinking(ctx, false);
  });
}

/**
 * 「正在摆弄这张关系图」的时候**点卡片不进卡**。
 *
 * 两档都归它管，理由一样——那一下的意图是操作图，不是读卡：
 *   - **连接模式**：用户明确要的，"这个时候无法单击进入卡片"。
 *   - **连线编辑模式**：不挡的话后果更隐蔽——卡片面板是全屏的，
 *     双击线身加拐点的**第一下**就把面板弹出来了，第二下打在面板上，
 *     `dblclick` 压根到不了线。而金线大半都压在别的卡上，
 *     于是"双击加拐点"在最常用的位置上**永远失灵**，看着像没做。
 *     （这条是 trace 出来的：down→clk→开面板→down(holo-body)→dbl(holo-body)。）
 *
 * 走**捕获阶段**：要抢在「点节点开面板」那条（冒泡阶段）之前把它拦下来。
 * 同一个元素上的两个监听器之间 stopPropagation 是没用的，
 * 而这个在 canvas 上、那个在 canvas 上——所以必须靠捕获先到。
 */
export function bindLinkGuard(ctx) {
  ctx.canvas.addEventListener(
    "click",
    (e) => {
      if (ctx.state.stage !== "storyline") return;
      if (!isLinking(ctx) && !isLineEdit(ctx)) return;
      const el = e.target && e.target.closest && e.target.closest(".kb-v13-snode");
      if (!el) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
    },
    true
  );
}

// ============================================================
// 选中一根金线 / 在它上面加拐点 / 把它删掉（3.0 刀 5 第二轮）
// ============================================================
//
// 交互都是用户定的：
//   - **双击线身** → 在那儿加一个拐点（拖那个圆点可以摆位置，再双击去掉）
//   - **左键单击线身** → 选中（选中才有拐点抓手）
//   - **右键线身** → 弹出「删除实线」
//   - 右键**空白处**仍是进连接模式——所以右键那条要先做命中判定，
//     顺序反了的话，想删线的人会被弹进连接模式，而他找不到退出的理由
//
// 线的命中判定只能自己算：SVG 里的线是 `pointer-events:none`（世界层也是），
// 事件永远轮不到它们。所以画的时候把每根线**走过的折线**留在 `ctx._manualHit`
// 里，拿指针的世界坐标去比距离。

/** 命中容差（屏幕像素）。除以相机缩放，于是放大缩小时手感一样 */
const HIT_TOL = 9;

/** 点到线段的最短距离，外加落点在这条线段上的**参数**（用来判断插在第几个拐点前） */
function projectOn(pts, p) {
  let best = { d: Infinity, at: 0 };
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const L = Math.hypot(vx, vy);
    let t = L > 0.001 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / (L * L) : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
    if (d < best.d) best = { d, at: acc + t * L };
    acc += L;
  }
  return best;
}

/** 指针底下那根金线（世界坐标）。没有就返回 null。 */
export function hitManual(ctx, world) {
  const k = (ctx._panzoom && ctx._panzoom.camera().k) || 1;
  const tol = HIT_TOL / k;
  let best = null;
  let bestD = tol;
  for (const g of ctx._manualHit || []) {
    const d = projectOn(g.pts, world).d;
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  return best;
}

// ============================================================
// 「连线编辑」模式：右键进，按住 S 框选，按 D 删掉（3.0 刀 5 第三轮）
// ============================================================
//
// 交互是用户定的，**换掉了原来那套"左键点选中 + 右键弹删除实线"**：
//
//   右键点金线      → 进编辑模式
//   点顶栏「选框」   → 鼠标变方框，这时拖鼠标就是框选
//   点「删除实线」/ 按 D → 把选中的全删掉
//   Esc / 点空白     → 退出
//
// 为什么换掉原来那套：一条条点着删，线一多就是几十下。框选 + 一次删
// 是把"整理连线"当一件事做，而不是当成 N 次单独的操作。
//
// 为什么要有「选框」这个开关、而不是直接拖就是框选：编辑模式里普通的拖动
// 仍然是**平移画面**。没有一个明确的开关的话，手一抖就把画布拖成了框选。
//
// 编辑模式下还会把**所有**拐点抓手摆出来（不再要求先选中哪一根）——
// 左键选中既然去掉了，抓手就得有个不依赖它的出场方式，
// 而"进了编辑模式 = 这些线都能动"本来就是这件事最自然的说法。

/** 编辑模式开着吗（运行时状态，**不落盘**——它是一次操作中途的状态，不是场景） */
export function isLineEdit(ctx) {
  return !!ctx.state.lineEdit;
}

export function setLineEdit(ctx, on) {
  const next = !!on;
  if (ctx.state.lineEdit === next) return false;
  ctx.state.lineEdit = next;
  if (!next) {
    ctx.state.marqueeSel = [];
    ctx.state.marqueeRect = null;
    // 选框开关跟着模式一起关：它只在编辑模式里有意义，
    // 留着的话下次右键进模式时鼠标会**一进来就是框**，而用户没点过那颗按钮。
    ctx.state.marqueeArm = false;
    if (ctx.fs) ctx.fs.classList.remove("kb-v13-marquee-arm");
  }
  if (ctx.fs) ctx.fs.classList.toggle("kb-v13-lineedit", next);
  if (ctx.refreshStageUi) ctx.refreshStageUi();
  refreshLineHint(ctx);
  redrawStoryLines(ctx);
  return true;
}

/** 那行说明条：现在选了几根、下一步按什么。没选中时告诉人怎么选。 */
export function refreshLineHint(ctx) {
  const el = ctx.lineHint;
  if (!el) return;
  if (!isLineEdit(ctx) || ctx.state.stage !== "storyline") {
    el.style.display = "none";
    return;
  }
  const n = marqueeSel(ctx).length;
  // 文案按"此刻该做什么"分三档。顶栏那颗「选框」是这套交互唯一的入口，
  // 说明条的第一句就得把它指出来——否则用户只会盯着线发呆。
  el.textContent = n
    ? "已选中 " + n + " 根金色线 · 点「删除实线」或按 D · Esc 退出"
    : isMarqueeArmed(ctx)
      ? "拖动鼠标，框住要删的金色线 · Esc 退出"
      : "点顶栏「选框」，然后拖出方框 · Esc 退出";
  el.classList.toggle("kb-v13-linehint-hit", n > 0);
  el.style.display = "block";
}

/** 框选中的那些线（存 from/to 这一对，和 cardLinks 里的条目一一对应） */
export function marqueeSel(ctx) {
  return Array.isArray(ctx.state.marqueeSel) ? ctx.state.marqueeSel : [];
}

/**
 * 「选框」开着吗——开着的时候鼠标一拖就是框选，不再是平移画面。
 *
 * ⚠️ **原来设计成"按住 S 再拖"，那个在真机上是坏的**，原因很隐蔽：
 * 库是嵌在笔记里的一个块，点它**不会把焦点从编辑器手里拿走**（库里的元素
 * 都不可聚焦），于是按 S 时 keydown 的 target 是编辑器的 contenteditable，
 * 被我的守卫判成"正在打字"直接忽略；真让它过去更糟——那个 s 会打进笔记正文。
 *
 * 改成顶栏一颗按钮：**看得见、点得到、跟焦点没关系**，拖的时候也不必
 * 一边按着键盘一边拖鼠标。
 */
export function isMarqueeArmed(ctx) {
  return !!ctx.state.marqueeArm;
}

export function setMarqueeArm(ctx, on) {
  const next = !!on;
  if (ctx.state.marqueeArm === next) return false;
  // 框选只活在编辑模式里：从连接模式点「选框」时顺手把模式切过去。
  // 两个模式本来就互斥（右键点线也是这么切的）。
  if (next) {
    // **也要退出连接模式**。不退的话屏幕上同时挂着连接点、又能框选，
    // 而且更糟：选框开着时按下就先被框选抢走了（捕获 + stopImmediate），
    // 从连接点拖线的那个手势**永远起不来**——那些小圆点成了摆设。
    setLinking(ctx, false);
    if (!isLineEdit(ctx)) setLineEdit(ctx, true);
  }
  ctx.state.marqueeArm = next;
  if (!next) {
    ctx.state.marqueeSel = [];
    ctx.state.marqueeRect = null;
  }
  if (ctx.fs) ctx.fs.classList.toggle("kb-v13-marquee-arm", next);
  if (ctx.refreshStageUi) ctx.refreshStageUi();
  refreshLineHint(ctx);
  redrawStoryLines(ctx);
  return true;
}

/** 把选中的那些线删掉。顶栏那颗「删除实线」和 D 键都走这里 */
export function deletePickedFor(ctx) {
  const n = deletePicked(ctx);
  if (ctx.refreshStageUi) ctx.refreshStageUi();
  return n;
}

function isPicked(ctx, l) {
  return marqueeSel(ctx).some((s) => s.from === l.from && s.to === l.to);
}

/**
 * 这个按键该不该归库管。
 *
 * 判据是**"屏幕现在是谁的"**，不是"焦点在哪个元素上"——后者在这里必然判错：
 * 库是嵌在笔记里的一个块，点它不会把焦点从编辑器拿走，按什么键 target 都是
 * 编辑器的 contenteditable。按"是不是可编辑元素"来判，等于**库开着的时候
 * 所有快捷键全部失效**（S 键就是这么死的）。
 *
 * 两条：库全屏开着；人不在我们自己的编辑表单里（那儿打字必须放行）。
 */
function keysAreOurs(ctx) {
  // 结构窗（3.0 刀 9-D）：它没有「全屏开着」这个说法——**它是一扇窗，
  // 窗在，这一屏就在**（窗一关，整个视图对象连监听一起销毁，见 embedstory.js）。
  // 所以它自带标记，不靠 `fs` 上那个 `open` 类。
  //
  // ⚠️ 漏掉这一支的后果：D（删除）在结构窗里是**死的**，而且不报错——
  // 框选得好好的、按下去屏幕上什么也不发生。
  // （这条是写完功能自查时才发现的，测试「框选和删除在窗里能用」钉的就是它。）
  if (ctx.__embedView) {
    const a = ctx.doc && ctx.doc.activeElement;
    return !(a && a.closest && a.closest(".kb-v13-editform"));
  }
  if (!ctx.fs || !ctx.fs.classList.contains("open")) return false;
  // 阅读器是盖在整个库上面的一整块屏。它开着的时候，背后那份故事线**看不见也
  // 点不到**，可键盘不分可见与否——不挡这一下，人在「结构窗」里按个 D，
  // 删掉的是背后那份谁也看不见的线（删的还是他自己画的）。
  // 挡在这里而不是挡在每个键上：这一条是所有快捷键共用的门。
  if (ctx.reader && ctx.reader.isOpen && ctx.reader.isOpen()) return false;
  const el = ctx.doc && ctx.doc.activeElement;
  if (el && el.closest && el.closest(".kb-v13-editform")) return false;
  return true;
}

/**
 * 矩形扫过哪些线。
 *
 * 判据是**线段与矩形的重叠**，不是"线段的两个端点都在矩形里"——后者对
 * 一条横穿整个框的长线完全失效（两个端点都在框外），而那恰恰是框选最常见的用法。
 *
 * 我们所有的线段都是**横平竖直**的（routePoints 保证），所以这里用 AABB 重叠
 * 就够了，而且精确：轴对齐的线段和矩形的重叠等价于两个 AABB 有交集。
 * 换一条斜线段就得写真正的线段求交，这里不需要。
 */
function segHitsRect(a, b, r) {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return x1 >= r.x && x0 <= r.x + r.w && y1 >= r.y && y0 <= r.y + r.h;
}

/** 这个矩形扫到的所有金线（返回 from/to 的列表） */
function pickInRect(ctx, rect) {
  const out = [];
  for (const g of ctx._manualHit || []) {
    const pts = g.pts || [];
    for (let i = 1; i < pts.length; i++) {
      if (segHitsRect(pts[i - 1], pts[i], rect)) {
        out.push({ from: g.link.from, to: g.link.to });
        break;
      }
    }
  }
  return out;
}

/** 把选中的那些线删掉 */
function deletePicked(ctx) {
  const sel = marqueeSel(ctx);
  if (!sel.length) return 0;
  const gone = new Set(sel.map((s) => s.from + "|" + s.to));
  ctx.state.marqueeSel = [];
  editManual(ctx, (list) => list.filter((l) => !gone.has(l.from + "|" + l.to)));
  return sel.length;
}

/** 读—改—写。**一律拷一份改**：manualLinks 给的是草稿里那个数组本身 */
function editManual(ctx, fn) {
  // **深一层拷贝 bends**：它是数组，浅拷的话改的是草稿里那个数组本身，
  // 而"恢复默认"要能把这个改动整个丢掉。
  const list = manualLinks(ctx).map((l) => {
    const one = { ...l };
    if (one.bends) one.bends = one.bends.slice();
    return one;
  });
  const out = fn(list);
  if (out === false) return false;
  writeManualLinks(ctx, out || list);
  redrawStoryLines(ctx);
  return true;
}

/** 双击线身：在那儿加一个拐点 */
function addBend(ctx, geom, world) {
  const proj = projectOn(geom.pts, world);
  editManual(ctx, (list) => {
    const l = list[geom.index];
    if (!l) return false;
    const bends = l.bends || [];
    if (bends.length >= 8) return false; // 再多就不像流程图了，而且没法看
    // 插在**沿线顺序**该在的位置，不是追加到末尾——否则先点近端、后点远端，
    // 两个拐点会互换角色，整根线翻个面。
    const at = bends.map((b) => projectOn(geom.pts, b).at).filter((v) => v < proj.at).length;
    bends.splice(at, 0, { x: world.x, y: world.y });
    l.bends = bends;
    return list;
  });
}

/** 双击拐点的抓手：去掉它 */
function removeBend(ctx, from, to, x, y) {
  editManual(ctx, (list) => {
    const l = list.find((k) => k.from === from && k.to === to);
    if (!l || !l.bends) return false;
    const i = l.bends.findIndex((b) => Math.abs(b.x - x) < 0.6 && Math.abs(b.y - y) < 0.6);
    if (i < 0) return false;
    l.bends.splice(i, 1);
    if (!l.bends.length) delete l.bends;
    return list;
  });
}

/**
 * 双击与拖拐点。**和别处一样绑在舞台上**——抓手住在 SVG 里、SVG 在世界层里，
 * 指针一离开那个 5px 的小圆点，事件就冒泡不到它祖先上了（这条教训见 itemdrag.js）。
 */
export function bindBendEditing(ctx) {
  const g = ctx.stage;
  let drag = null;

  g.addEventListener("dblclick", (e) => {
    if (ctx.state.stage !== "storyline" || !ctx._panzoom) return;
    if (!e.target || !e.target.closest) return;
    const w = ctx._panzoom.clientToWorld(e.clientX, e.clientY);

    // 拐点只在**编辑模式**里能动。抓手也只在编辑模式里摆出来——外面双击
    // 凭空加一个看不到抓手的拐点，等于给用户塞了一个他既看不见也拖不着的东西。
    if (!isLineEdit(ctx)) return;
    const handle = e.target.closest(".kb-v13-sbend");
    if (handle) {
      e.preventDefault();
      e.stopPropagation();
      removeBend(ctx, handle.dataset.from, handle.dataset.to, Number(handle.dataset.bx), Number(handle.dataset.by));
      return;
    }
    if (e.target.closest(".kb-v13-port")) return;
    // 先判线、再判卡片：线常常压在卡上，反过来的话"双击加拐点"在你最想加的
    // 那个位置（卡片上方那一段）永远加不上。
    const hit = hitManual(ctx, w);
    if (!hit) return;
    if (e.target.closest(".kb-v13-snode")) {
      // 压在卡上的那一段：只有**真的贴着线**才算数，容差再收紧一点，
      // 免得想双击卡片的人被塞一个拐点。
      if (projectOn(hit.pts, w).d > 4) return;
    }
    e.preventDefault();
    e.stopPropagation();
    addBend(ctx, hit, w);
  });

  g.addEventListener("pointerdown", (e) => {
    if (ctx.state.stage !== "storyline" || e.button !== 0 || !ctx._panzoom) return;
    if (!e.target || !e.target.closest) return;
    const handle = e.target.closest(".kb-v13-sbend");
    if (!handle) return;
    e.stopPropagation();
    const svg = ctx._sHandle;
    if (svg) svg.classList.add("kb-v13-benddrag");
    drag = {
      id: e.pointerId,
      from: handle.dataset.from,
      to: handle.dataset.to,
      x: Number(handle.dataset.bx),
      y: Number(handle.dataset.by),
      moved: false,
    };
  });

  g.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.moved = true;
    const w = ctx._panzoom.clientToWorld(e.clientX, e.clientY);
    // 拖动过程中**每一帧都写回草稿并重画**：线是照着拐点算出来的，
    // 拐点变了而不重算，线就还钉在原来的形状上（和"拖卡片线不动"同一个错）。
    editManual(ctx, (list) => {
      const l = list.find((k) => k.from === drag.from && k.to === drag.to);
      if (!l || !l.bends) return false;
      const i = l.bends.findIndex((b) => Math.abs(b.x - drag.x) < 0.6 && Math.abs(b.y - drag.y) < 0.6);
      if (i < 0) return false;
      l.bends[i] = { x: w.x, y: w.y };
      drag.x = w.x;
      drag.y = w.y;
      return list;
    });
  });

  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    if (ctx._sHandle) ctx._sHandle.classList.remove("kb-v13-benddrag");
    // 拖完那一下会接着冒出一个 click —— 不掐掉的话，它会把刚选中的线取消选中，
    // 抓手当场消失（这和「拖完晶体顺手打开一张卡」是同一类毛病）。
    if (moved) swallowNextClick(g);
  };
  g.addEventListener("pointerup", end);
  g.addEventListener("pointercancel", end);
}

/**
 * 连线编辑模式：右键进、「选框」开关打开后拖鼠标框选、删除、Esc 退。
 *
 * ⚠️ **框选那一下必须走捕获阶段 + `stopImmediatePropagation`**。
 * 舞台上有三条监听在抢同一次按下：panzoom 的平移、itemdrag 的拖卡片，
 * 和这里。捕获阶段在冒泡之前，所以这一条总能先拿到；`stopImmediatePropagation`
 * 再把它后面的（**同元素的**后续监听，`stopPropagation` 管不了这个）一起掐掉。
 * 少了它，一拖画面就跟着平移——框选框到一半画布跑了。
 *
 * 顺序上也依赖"绑定早于 panzoom"：panzoom 是在**进相机档那一刻**才建的
 * （ensurePanZoom），而这里是 mount 时绑的。落点正好是舞台本身时，
 * 两者都算"目标节点上的监听"，那时按注册顺序跑——我们的更早。
 */
export function bindLineEdit(ctx) {
  const g = ctx.stage;
  const doc = ctx.doc || document;
  let marquee = null; // {id, wx, wy, rect}
  let ateClick = false; // 刚框完，那一下 click 要吃掉（见 end 里的说明）

  // 屏幕上的说明条。**必须有**：这套交互的入口是顶栏那颗「选框」，
  // 而按钮上的两个字说不清"点完之后要干嘛"，说明条把下一步补上。
  const hint = EL("div", "kb-v13-linehint");
  hint.style.display = "none";
  g.appendChild(hint);
  ctx.lineHint = hint;

  // D 键 = 删除。**只是条捷径**，真正靠得住的是顶栏那颗「删除实线」。
  //
  // ⚠️ 判定"这个键归不归我们"**不能**用「target 是不是可编辑元素」：
  // 库嵌在笔记里，点它不会把焦点从编辑器拿走，于是按任何键 target 都是
  // 编辑器的 contenteditable，被判成打字、整条捷径永远不生效（S 键就是这么
  // 死掉的）。改成问「库全屏开着吗、人在我们自己的表单里吗」——
  // 库盖着整个屏幕的时候，键盘本来就该归库。
  doc.addEventListener("keydown", (e) => {
    if (ctx.state.stage !== "storyline" || !isLineEdit(ctx)) return;
    if (!keysAreOurs(ctx)) return;
    if (e.key === "d" || e.key === "D") {
      // preventDefault 是**必须的**：不拦的话这个 d 会打进背后那篇笔记的正文里。
      e.preventDefault();
      e.stopImmediatePropagation();
      deletePickedFor(ctx);
    }
    // ⚠️ **Esc 不在这里收**。收在这儿就得自己判断"面板/悬浮窗是不是开着"，
    // 而那正是 app.js 那条 Esc 分流在管的事——两处各判一份，迟早对不上，
    // 表现是"编辑模式下开着的卡片面板 Esc 关不掉"。统一交给那条分流
    // （它在连接模式之前加了一条编辑模式的分支）。
  });

  g.addEventListener(
    "pointerdown",
    (e) => {
      if (ctx.state.stage !== "storyline" || !isLineEdit(ctx) || !ctx._panzoom) return;
      // 抓手上的按下是"挪拐点"，不归框选管
      if (e.target && e.target.closest && e.target.closest(".kb-v13-sbend")) return;
      if (e.button !== 0) return;
      // **「选框」开着**才框选。关着的时候拖动仍然是平移画面——
      // 编辑模式里最常做的事还是挪卡片、推画面，不能把拖动整个占掉。
      if (!isMarqueeArmed(ctx)) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      const w = ctx._panzoom.clientToWorld(e.clientX, e.clientY);
      ateClick = false; // 旗子不许漏到下一次操作上
      marquee = { id: e.pointerId, x: e.clientX, y: e.clientY, wx: w.x, wy: w.y, rect: null };
      ctx.state.marqueeSel = [];
      ctx.state.marqueeRect = null;
      redrawStoryLines(ctx);
    },
    true
  );

  g.addEventListener("pointermove", (e) => {
    if (!marquee || e.pointerId !== marquee.id || !ctx._panzoom) return;
    const w = ctx._panzoom.clientToWorld(e.clientX, e.clientY);
    // 矩形用**世界坐标**存：相机可能在这一趟里变（缩放），存屏幕坐标的话
    // 框会跟着漂。换算一次，后面全用它。
    const rect = {
      x: Math.min(marquee.wx, w.x),
      y: Math.min(marquee.wy, w.y),
      w: Math.abs(w.x - marquee.wx),
      h: Math.abs(w.y - marquee.wy),
    };
    marquee.rect = rect;
    ctx.state.marqueeRect = rect; // 画图那一步读它
    ctx.state.marqueeSel = pickInRect(ctx, rect);
    redrawStoryLines(ctx);
  });

  const end = (e) => {
    if (!marquee || e.pointerId !== marquee.id) return;
    const dragged = !!marquee.rect;
    marquee = null;
    ctx.state.marqueeRect = null;
    // ⚠️ 松手之后紧接着会冒出一个 click，而它的落点就是舞台（框选多半在空白处收尾），
    // 会正好撞上下面那句"点空白退出编辑模式"——**刚框好的选择当场被清空**，
    // 于是按 D 什么也不删。表现是"框选高亮闪一下就没了"，极难查。
    //
    // 不能靠 swallowNextClick：它是**捕获阶段**挂在舞台上的，而这里 click 的
    // 目标就是舞台本身，同元素上按注册顺序跑，我们这条（mount 时绑的）永远在它前面。
    // 所以自己立个旗子，用完就放，下一次 pointerdown 也放（防它漏到下一次点击）。
    if (dragged) ateClick = true;
    // 框选结束**把矩形擦掉**，但选中留着——下一步就是按 D。
    // 矩形一直挂着的话，用户会以为还得再框一次。
    redrawStoryLines(ctx);
    if (ctx.refreshStageUi) ctx.refreshStageUi();
  };
  g.addEventListener("pointerup", end);
  g.addEventListener("pointercancel", end);

  // 点空白退出编辑模式。点卡片不算——那一下是"打开这张卡"，不该顺手把模式收了。
  g.addEventListener("click", (e) => {
    if (ctx.state.stage !== "storyline" || !isLineEdit(ctx)) return;
    if (ateClick) {
      ateClick = false;
      return;
    }
    if (!e.target || !e.target.closest) return;
    if (e.target.closest(".kb-v13-snode") || e.target.closest(".kb-v13-sbend")) return;
    // 点在**线上**也不算空白。这一条是必须的：双击线身加拐点的头一下就是一个
    // click——按"点空白就退出"处理的话，模式在 dblclick 到达之前就没了，
    // **双击加拐点永远加不上**（而且看起来像"双击没反应"）。
    if (hitManual(ctx, ctx._panzoom.clientToWorld(e.clientX, e.clientY))) return;
    setLineEdit(ctx, false);
  });

}

/** 离这条边最近的那一侧（决定线接在卡片的哪儿） */
function nearestSide(node, w) {
  let best = "left";
  let bestD = Infinity;
  for (const s of LINK_SIDES) {
    const p = portPos(node, s);
    const d = (p.x - w.x) * (p.x - w.x) + (p.y - w.y) * (p.y - w.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

export { cardsUnder as storylineCards };
