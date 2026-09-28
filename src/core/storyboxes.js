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
export function renderBoxes(host, boxes, pos, el, NODE_W, NODE_H, sel) {
  const made = new Map();
  if (!boxes.length) return made;
  for (const b of boxes) {
    // 两种框的几何**来路完全不同**（用户 09-27 拍板的 B）：
    //   · **手动框** = 你自己画的一个框。位置和大小全由你定（存在框自己身上），
    //     卡片只是"归属"——**框不会为了迁就它们而变形**。空框和有卡一个样。
    //   · **晶体框** = 算出来的外壳，跟着里面卡片的包围盒走。它是文件夹长出来的，
    //     不是谁画的，所以没有"你自己定的大小"这回事。
    let geo;
    if (b.crystal) {
      const at = b.paths.map((p) => pos.get(p)).filter(Boolean);
      if (!at.length) continue; // 没卡的子晶体 = 没那颗，不画是对的
      const minX = Math.min(...at.map((p) => p.x));
      const minY = Math.min(...at.map((p) => p.y));
      const maxX = Math.max(...at.map((p) => p.x)) + NODE_W;
      const maxY = Math.max(...at.map((p) => p.y)) + NODE_H;
      geo = {
        x: minX - BOX_PAD,
        y: minY - BOX_PAD - BAR_H,
        w: maxX - minX + BOX_PAD * 2,
        h: maxY - minY + BOX_PAD * 2 + BAR_H,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
      };
    } else {
      const w = Math.max(MIN_BOX_W, Number(b.w) || MIN_BOX_W);
      const h = Math.max(MIN_BOX_H, Number(b.h) || MIN_BOX_H);
      // ⚠️ 兜底用的是 `NEW_BOX_X/Y`（建框时那个落座点）。这里原来写的是
      // `MIN_X` / `MIN_Y` ——**那两个常量在这个仓里根本不存在**。今天走不到
      // （`boxesOf` 给手动框的 x/y 一定填了有限数），但它是颗哑弹：
      // 哪天有人从别处构造一个没有坐标的框，等着的是一次 ReferenceError，
      // 而渲染里抛错是一整屏白掉，不是"少画一个框"。
      const x = Number.isFinite(Number(b.x)) ? Number(b.x) : NEW_BOX_X;
      const y = Number.isFinite(Number(b.y)) ? Number(b.y) : NEW_BOX_Y;
      geo = { x, y, w, h, cx: x + w / 2, cy: y + BAR_H / 2 + 8 };
    }

    const node = el("div", "kb-v13-sbox" + (b.crystal ? " kb-v13-sbox-crystal" : "") + (b.collapsed ? " kb-v13-sbox-collapsed" : ""));
    node.dataset.box = b.id;
    // 3.0 刀 32：这个框被选中了（点标题栏选的，方向键挪的就是它）。
    // **只有手动框会被选中**——晶体框没有自己存的位置（用户 09-28 拍的），
    // 挪它等于挪成员，而"挪哪些成员"要先把成员挑出来，是另一件事。
    if (sel && sel.has(b.id)) node.classList.add("kb-v13-sbox-sel");
    if (b.collapsed) {
      // 收起：只剩一条标题栏，摆在自己的重心附近——**不摆在矩形左上角**，
      // 因为矩形可能是按展开时的大小定的，收起后那个位置会离得很远。
      node.style.left = Math.round(geo.cx) + "px";
      node.style.top = Math.round(geo.cy) + "px";
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
  if (ctx.refreshStoryline) ctx.refreshStoryline();
}

/**
 * 建一个手动框，收下这几张卡。id 用「现有 m: 里最大的号 +1」——确定性、不用随机数。
 *
 * ⚠️ **号是跨层扫出来的**，所以 id 全局唯一。这不是洁癖：`boxNames` 和
 * `collapsedBoxes` 是**按 id 索引**的两张独立表，id 一旦在某两层里撞上，
 * 改一个框的名字会连着把另一层的同名框一起改了。
 */
export function createBox(ctx, paths) {
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
  // 把卡拖进去的前提。按本层已有的框数错开摆，免得连建两个叠在同一个位置上。
  const n = list.length;
  list.push({
    id,
    name: "方框 " + (max + 1),
    paths: (paths || []).slice(),
    x: NEW_BOX_X + (n % 6) * 44,
    y: NEW_BOX_Y + (n % 6) * 44,
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
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (b.collapsed) continue;
    // 几何**必须和 renderBoxes 用同一套**：那边怎么摆的，这边就怎么判。
    // 手动框用自己记的矩形（用户 09-27 拍板的 B），晶体框用成员包围盒。
    let x1, y1, x2, y2;
    if (b.crystal) {
      const at = b.paths.map((p) => pos.get(p)).filter(Boolean);
      if (!at.length) continue;
      x1 = Math.min(...at.map((p) => p.x)) - BOX_PAD;
      y1 = Math.min(...at.map((p) => p.y)) - BOX_PAD - BAR_H;
      x2 = Math.max(...at.map((p) => p.x)) + NODE_W + BOX_PAD;
      y2 = Math.max(...at.map((p) => p.y)) + NODE_H + BOX_PAD;
    } else {
      const w = Math.max(MIN_BOX_W, Number(b.w) || DEFAULT_BOX_W);
      const h = Math.max(MIN_BOX_H, Number(b.h) || DEFAULT_BOX_H);
      x1 = b.x;
      y1 = b.y;
      x2 = b.x + w;
      y2 = b.y + h;
    }
    if (pt.x >= x1 && pt.x <= x2 && pt.y >= y1 && pt.y <= y2) return b;
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
