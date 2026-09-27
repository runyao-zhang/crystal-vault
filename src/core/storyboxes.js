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

const BOX_PAD = 22;
/** 标题栏高度。收起时那个框就只剩这一条。 */
const BAR_H = 26;
/** 收起态的宽度：够写下一个名字。 */
const COLLAPSED_W = 220;

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
  const v = ctx && ctx.state ? ctx.state.view : null;
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

function manualOf(ctx) {
  const v = view(ctx);
  return v && Array.isArray(v.boxes) ? v.boxes : [];
}

/**
 * 这一层该画哪些框。**顺序即层叠顺序**：先晶体框（在后面），后手动框（压在上面）。
 *
 * @returns {Array<{id:string, name:string, paths:string[], collapsed:boolean, crystal:boolean}>}
 */
export function boxesOf(ctx, path) {
  const names = namesOf(ctx);
  const collapsed = new Set(collapsedOf(ctx));
  const out = [];

  // 1) 晶体框：每个直接子晶体一个。**只在它有卡的时候才画**——
  //    一个空框在屏幕上是个没有解释的方印。
  for (const k of childKeys(ctx, path)) {
    const key = (path || []).concat([k]).join("/");
    const kids = cardsUnderPath(ctx, (path || []).concat([k]));
    if (!kids.length) continue;
    const id = crystalBoxId(key);
    out.push({
      id,
      name: names[id] || String(k),
      paths: kids.map((c) => c.path),
      collapsed: collapsed.has(id),
      crystal: true,
    });
  }

  // 2) 手动框。成员被删光的丢掉——同上面「空框不画」那条。
  //    ⚠️ 成员表里可能留着已经不在这一层的路径（卡被挪走了），**渲染时按当前
  //    这一层的卡表过滤**，别在这里判——那要问 model，而这个函数会被每帧调。
  const live = new Set();
  for (const c of cardsUnderPath(ctx, path)) live.add(c.path);
  for (const b of manualOf(ctx)) {
    const paths = (Array.isArray(b.paths) ? b.paths : []).filter((p) => live.has(p));
    if (!paths.length) continue;
    out.push({
      id: String(b.id),
      name: names[b.id] || String(b.name || "方框"),
      paths,
      collapsed: collapsed.has(String(b.id)),
      crystal: false,
    });
  }
  return out;
}

/** `卡片路径 -> 框 id`。一张卡只归一个框（后出现的赢，也就是手动框压过晶体框）。 */
export function memberIndexOf(boxes) {
  const m = new Map();
  for (const b of boxes) for (const p of b.paths) m.set(p, b.id);
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
export function edgeHidden(memberOf, collapsed, aPath, bPath) {
  if (!collapsed.size) return false;
  const a = memberOf.get(aPath);
  const b = memberOf.get(bPath);
  return (a && collapsed.has(a)) || (b && collapsed.has(b));
}

// ---- 渲染 ----

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
  for (const b of boxes) {
    const at = b.paths.map((p) => pos.get(p)).filter(Boolean);
    if (!at.length) continue;
    const minX = Math.min(...at.map((p) => p.x));
    const minY = Math.min(...at.map((p) => p.y));
    const maxX = Math.max(...at.map((p) => p.x)) + NODE_W;
    const maxY = Math.max(...at.map((p) => p.y)) + NODE_H;

    const node = el("div", "kb-v13-sbox" + (b.crystal ? " kb-v13-sbox-crystal" : "") + (b.collapsed ? " kb-v13-sbox-collapsed" : ""));
    node.dataset.box = b.id;
    if (b.collapsed) {
      // 收起：只剩一条标题栏，摆在成员的重心附近——**不摆在包围盒左上角**，
      // 因为包围盒的尺寸是按展开时的卡算的，收起后那个位置会离得很远。
      const cx = at.reduce((s, p) => s + p.x, 0) / at.length;
      const cy = at.reduce((s, p) => s + p.y, 0) / at.length;
      node.style.left = Math.round(cx) + "px";
      node.style.top = Math.round(cy) + "px";
      node.style.width = COLLAPSED_W + "px";
      node.style.height = BAR_H + "px";
    } else {
      node.style.left = minX - BOX_PAD + "px";
      node.style.top = minY - BOX_PAD - BAR_H + "px";
      node.style.width = maxX - minX + BOX_PAD * 2 + "px";
      node.style.height = maxY - minY + BOX_PAD * 2 + BAR_H + "px";
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
    node.appendChild(bar);
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

/** `ctx.state.view` 上那三张表先确保形状，再动其中一格。**不整体重建**。 */
function ensure(ctx) {
  const v = view(ctx);
  if (!v) return null;
  if (!Array.isArray(v.boxes)) v.boxes = [];
  if (!v.boxNames || typeof v.boxNames !== "object" || Array.isArray(v.boxNames)) v.boxNames = {};
  if (!Array.isArray(v.collapsedBoxes)) v.collapsedBoxes = [];
  return v;
}

function afterWrite(ctx) {
  if (ctx.flushViewState) ctx.flushViewState();
  if (ctx.refreshStoryline) ctx.refreshStoryline();
}

/** 建一个手动框，收下这几张卡。id 用「现有 m: 里最大的号 +1」——确定性、不用随机数。 */
export function createBox(ctx, paths) {
  const v = ensure(ctx);
  if (!v) return null;
  let max = 0;
  for (const b of v.boxes) {
    const m = /^m:(\d+)$/.exec(String(b && b.id));
    if (m) max = Math.max(max, Number(m[1]));
  }
  const id = "m:" + (max + 1);
  v.boxes.push({ id, name: "方框 " + (max + 1), paths: (paths || []).slice() });
  afterWrite(ctx);
  return id;
}

export function renameBox(ctx, id, name) {
  const v = ensure(ctx);
  if (!v || !id) return;
  const n = String(name || "").trim().slice(0, 80);
  if (!n) return;
  v.boxNames[String(id)] = n;
  afterWrite(ctx);
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
