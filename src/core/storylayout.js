// 3.0 刀 5：故事线的排布算法。**纯函数，不碰 DOM，不认识 ctx。**
//
// 输入是一组卡片和它们之间的直接双链，输出是每个人该站在哪。
// 横轴 = 依赖深度（拓扑分层），纵轴 = 按重心法排、用来减少连线交叉。
//
// ## 为什么单独成模块
//
// 用户以后要接 LLM 来决定位置。那时候换掉的是**这一个函数**，别处一行不动。
// 所以它必须：只吃数组、只吐 Map、没有副作用、能容忍 async（见 runLayout）。
//
// ## 三条定死的纪律
//
// 1. **确定性**。同一份数据必须排出同一个结果。所有「同分」一律用文件名兜底
//    —— 靠 Map/Set 的迭代顺序排出来的东西，换一次插入顺序就换个形状，
//    而这种不稳定在测试里表现为「隔几条红一次」，最难查。
// 2. **破环**。双链可以成环（甲→乙→甲）。不破的话最长路径递推会死循环。
// 3. **孤岛单独放**。出链入链都空的卡不算「深度 0」——深度 0 的语义是
//    「没有人依赖它」，把孤岛混进去是句错话。

export const NODE_W = 210;
export const NODE_H = 96;
/** 列间距 = 节点宽 + 留给连线的空档 */
export const COL_PITCH = NODE_W + 96;
export const ROW_PITCH = NODE_H + 26;
/** 孤岛那一条横带，与上面主体之间留的空 */
const ORPHAN_GAP = 96;

/**
 * 破环：迭代式 DFS，把指向「还在栈上的节点」的边标成回边并丢掉。
 *
 * 选它而不是 Tarjan SCC 那一套：确定性强、好测，而且和 viewstate.js 里
 * resolveParent 的「顺着链走、走回自己就断」是同一个套路，仓里有先例。
 */
function breakCycles(ids, outEdges) {
  const state = new Map(); // id -> 1 在栈上 / 2 已走完
  const kept = new Map();
  for (const id of ids) kept.set(id, []);
  const dropped = [];

  for (const root of ids) {
    if (state.get(root)) continue;
    // 显式栈，避免深链把调用栈撑爆
    const stack = [{ id: root, i: 0 }];
    state.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const outs = outEdges.get(top.id) || [];
      if (top.i >= outs.length) {
        state.set(top.id, 2);
        stack.pop();
        continue;
      }
      const to = outs[top.i++];
      if (!kept.has(to)) continue;
      if (state.get(to) === 1) {
        dropped.push({ from: top.id, to }); // 回边：指向还在栈上的节点
        continue;
      }
      kept.get(top.id).push(to); // 树边 / 前向边：留着
      if (!state.get(to)) {
        state.set(to, 1);
        stack.push({ id: to, i: 0 });
      }
    }
  }
  return { kept, dropped };
}

/**
 * 最长路径分层（Kahn 拓扑序递推）。
 *
 * **用最长路径而不是最短**：同一层的卡应当「前面的层都排完了」。
 * 最短路径会让一条 A→C 的直达边横跨好几层，连线穿过中间每一层——难看，
 * 而且读者会以为中间那几层是它的前置。
 */
function layerize(ids, kept) {
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const [, outs] of kept) for (const to of outs) indeg.set(to, (indeg.get(to) || 0) + 1);

  const depth = new Map(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => (indeg.get(id) || 0) === 0);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const to of kept.get(id) || []) {
      depth.set(to, Math.max(depth.get(to) || 0, (depth.get(id) || 0) + 1));
      indeg.set(to, indeg.get(to) - 1);
      if (indeg.get(to) === 0) queue.push(to);
    }
  }
  return { depth, order };
}

/**
 * 重心法减交叉：自上而下、自下而上各扫一遍，反复几轮，
 * 每层按「相邻层邻居位置的中位数」重排。
 *
 * 中位数而不是平均值：一张连了很多条的卡不该因为邻居多就把整层拽偏。
 * **同分一律用文件名兜底**（见文件头第 1 条）。
 */
function reorder(layers, kept, inEdges, nameOf, rounds) {
  const index = new Map();
  const reindex = () => {
    index.clear();
    for (const row of layers) row.forEach((id, i) => index.set(id, i));
  };
  reindex();

  const bary = (id, edges) => {
    const ns = (edges.get(id) || []).filter((n) => index.has(n));
    if (!ns.length) return null;
    const vs = ns.map((n) => index.get(n)).sort((a, b) => a - b);
    const m = vs.length >> 1;
    return vs.length % 2 ? vs[m] : (vs[m - 1] + vs[m]) / 2;
  };

  const sweep = (row, edges) => {
    const keyed = row.map((id) => ({ id, b: bary(id, edges) }));
    keyed.sort((a, b) => {
      if (a.b === null && b.b === null) return cmpName(a.id, b.id, nameOf);
      if (a.b === null) return 1; // 没有邻居的沉到底，别去搅和别人的相对次序
      if (b.b === null) return -1;
      if (a.b !== b.b) return a.b - b.b;
      return cmpName(a.id, b.id, nameOf);
    });
    keyed.forEach((k, i) => (row[i] = k.id));
    reindex();
  };

  for (let r = 0; r < rounds; r++) {
    for (let i = 1; i < layers.length; i++) sweep(layers[i], inEdges);
    for (let i = layers.length - 2; i >= 0; i--) sweep(layers[i], kept);
  }
}

function cmpName(a, b, nameOf) {
  const na = nameOf(a);
  const nb = nameOf(b);
  if (na < nb) return -1;
  if (na > nb) return 1;
  // 同名卡（跨文件夹撞名）也要有确定的先后，否则排序不稳定
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 主入口。
 *
 * @param {Array} cards  `{id, name}` —— id 用**卡片路径**，不是标题。
 *   标题会撞（两个文件夹里都有「01-总览」），路径不会。
 * @param {Array} edges  `{from, to}` —— 同上，都是 id。
 * @param {object} [opts] `{rounds}` 重心法扫几轮（默认 4）
 * @returns {{positions: Map<string,{x,y}>, meta: object}}
 */
export function layeredLayout(cards, edges, opts = {}) {
  const rounds = opts.rounds == null ? 4 : opts.rounds;
  const ids = cards.map((c) => c.id);
  const nameOf = (id) => {
    const c = cards.find((x) => x.id === id);
    return c ? c.name || id : id;
  };
  const idSet = new Set(ids);

  const outEdges = new Map(ids.map((id) => [id, []]));
  const inEdges = new Map(ids.map((id) => [id, []]));
  const orphans = new Set(ids);
  for (const e of edges) {
    if (!idSet.has(e.from) || !idSet.has(e.to) || e.from === e.to) continue;
    outEdges.get(e.from).push(e.to);
    inEdges.get(e.to).push(e.from);
    orphans.delete(e.from);
    orphans.delete(e.to);
  }

  // 拓扑只看**破了环之后**那张图
  const linked = ids.filter((id) => !orphans.has(id));
  const { kept } = breakCycles(linked, outEdges);
  const keptIn = new Map(ids.map((id) => [id, []]));
  for (const [from, outs] of kept) for (const to of outs) keptIn.get(to).push(from);

  const { depth, order } = layerize(linked, kept);

  // 分层。孤岛**不进来**——它们单独一条横带。
  const byDepth = new Map();
  for (const id of order) {
    const d = depth.get(id) || 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d).push(id);
  }
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  const layers = depths.map((d) => {
    const row = byDepth.get(d);
    row.sort((a, b) => cmpName(a, b, nameOf)); // 初始次序按文件名，重心法在它上面微调
    return row;
  });

  reorder(layers, kept, keptIn, nameOf, rounds);

  const positions = new Map();
  const maxRows = Math.max(1, ...layers.map((r) => r.length));
  const bodyH = maxRows * ROW_PITCH;
  layers.forEach((row, ci) => {
    // 每层在自己的高度里居中，避免所有层都顶到上边
    const offset = (bodyH - row.length * ROW_PITCH) / 2;
    row.forEach((id, ri) => {
      positions.set(id, {
        x: ci * COL_PITCH,
        y: offset + ri * ROW_PITCH,
      });
    });
  });

  // 孤岛：最下面一条横带，按文件名排
  const orphanIds = ids.filter((id) => orphans.has(id)).sort((a, b) => cmpName(a, b, nameOf));
  const orphanTop = bodyH + ORPHAN_GAP;
  orphanIds.forEach((id, i) => {
    positions.set(id, { x: i * COL_PITCH, y: orphanTop });
  });

  return {
    positions,
    meta: {
      cols: layers.length,
      rows: maxRows,
      orphans: orphanIds,
      linked: [...order],
      width: Math.max(layers.length, orphanIds.length || 0) * COL_PITCH,
      height: orphanTop + (orphanIds.length ? ROW_PITCH : 0),
    },
  };
}

/**
 * 跑一个（可能被换掉的）排布实现。
 *
 * **必须容忍三件事**，因为用户以后交上来的会是一个 LLM：
 *   1. **async** —— 它一定要异步；
 *   2. **抛异常** —— 回落到默认实现；
 *   3. **乱返回** —— 丢掉非有限数、丢掉不认识的 id、缺位置的由默认实现补。
 *
 * LLM 的输出是**不可信输入**，沿用 sanitizeViewState 那条
 * 「绝不抛、最差退化成默认」的纪律。
 */
export async function runLayout(impl, cards, edges, opts) {
  const fallback = () => layeredLayout(cards, edges, opts);
  if (typeof impl !== "function") return fallback();

  let out = null;
  try {
    out = await Promise.resolve(impl(cards, edges, opts));
  } catch (e) {
    return fallback();
  }
  if (!out || !out.positions) return fallback();

  const base = fallback();
  const ids = new Set(cards.map((c) => c.id));
  const positions = new Map(base.positions);
  let used = 0;
  for (const [id, p] of out.positions) {
    if (!ids.has(id) || !p) continue;
    // ⚠️ `Number(null)` 是 **0**，不是 NaN——直接 Number() 会把 `{x:null,y:null}`
    // 当成合法坐标收下来，于是一坨垃圾把卡片全叠在世界原点上。
    // 先拿 `== null` 把 null / undefined 择出去（这条宽松相等是故意的，两种都盖）。
    const x = p.x == null ? NaN : Number(p.x);
    const y = p.y == null ? NaN : Number(p.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    positions.set(id, { x, y });
    used += 1;
  }
  // 一个能用的都没给？那就是坏结果，整份丢掉，别让屏幕上出现一堆重叠的卡
  if (!used) return base;
  return { positions, meta: { ...base.meta, custom: true } };
}
