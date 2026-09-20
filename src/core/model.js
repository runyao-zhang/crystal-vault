// 数据模型：分组、配色、关系图、孤岛判定，以及三处「从正文里抠东西」的纯函数
// （#12 分段 / #13 高亮关键词 / #14 正文首行行号）。
//
// 关系（出链 / 反链）由核心从卡片正文里解析双链，再交给适配层的 resolveLink
// 解析目标。这样核心不依赖宿主的 metadataCache，适配层只多一个 writeCard。

import { toStr, stripCardPrefix } from "./dom.js";
import { splitFrontmatter } from "../adapter.js";

// 匹配 [[目标]] / [[目标|别名]]；前面带 ! 的是嵌入，不算关系
// （对齐 Obsidian：meta.links 不含 embeds）
const WIKILINK_RE = /(!?)\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;

const FENCE_RE = /(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2[^\n]*(?=\n|$)/g;
const INLINE_CODE_RE = /`[^`\n]*`/g;

// #12 的分段符 / #13 的高亮对。两个都只在「围栏外」才算数，判定统一走 maskCode。
const DIV_RE = /---div---/g;
const HIGHLIGHT_RE = /==([^=\n]+)==/g;

/**
 * 把代码（围栏块 + 行内）涂成等长空白，其余原样。
 * 等长是关键：抹掉之后偏移不变，`end` 仍然能直接用于在原串上截「关联理由」。
 *
 * 为什么必须涂：卡片正文里有 `tb['日期'].values[[0,4,9,14,19,23]]` 这种代码，
 * 裸正则会把 `[[0,4,9,14,19,23]]` 当成双链。Obsidian 的 metadataCache 不解析代码里的链接。
 *
 * 涂成全空白（一个字符都不留）之后，「代码里出现过什么」这件事对所有调用方都不存在了——
 * 所以 #12 的分隔符、#13 的高亮对也复用这一份，不再各写一条围栏正则：
 * 三处判定只要有一处漂了，表现就是「某张教学卡莫名其妙被切开」这种最难查的形状。
 *
 * 网页端渲染器（adapters/web-render.js）也复用这一份，理由是同一条：它要在 marked
 * 之前抽公式与双链，而那一步同样必须跳过代码——```latex 围栏里写 $$…$$ 是常态。
 */
export function maskCode(raw) {
  const chars = raw.split("");
  const blank = (from, to) => {
    for (let i = from; i < to; i++) if (chars[i] !== "\n") chars[i] = " ";
  };

  FENCE_RE.lastIndex = 0;
  let m;
  while ((m = FENCE_RE.exec(raw))) blank(m.index, m.index + m[0].length);

  const masked = chars.join("");
  INLINE_CODE_RE.lastIndex = 0;
  while ((m = INLINE_CODE_RE.exec(masked))) blank(m.index, m.index + m[0].length);

  return chars.join("");
}

/**
 * 从正文里解析出站双链。代码块 / 行内代码里的 `[[...]]` 不算。
 *
 * @returns {{target: string, start: number, end: number}[]}
 *   `start` = 那个 `[` 的偏移，`end` = `]]` 之后的偏移（取「关联理由」用）。
 *
 *   ⚠️ `start` 必须是**整个匹配**的起点，不是 target 的起点——这样
 *   `raw.slice(start, end)` 就是整段字面量（**含 `|别名`、含 `#小标题`**）。
 *   3.0 刀 16 的「删蓝线」正是靠这两个偏移把那段字从正文里挖掉；
 *   只给 target 算起点的话，带别名的链接会只挖半截，留下 `|别名]]` 这种残骸。
 */
export function parseLinks(raw) {
  const out = [];
  if (!raw) return out;
  const masked = maskCode(raw);
  WIKILINK_RE.lastIndex = 0;
  let m;
  while ((m = WIKILINK_RE.exec(masked))) {
    if (m[1] === "!") continue;
    // 掩码只涂代码，链接文本本身没被动过，偏移在掩码串与原串上一致
    out.push({ target: m[2].trim(), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * #12：把正文按 `---div---` 切成若干段（纯函数，不碰 DOM）。
 *
 * 在**渲染之前**切，而不是先把整篇渲染出来再切 DOM——后者会把跨段的元素
 * （一个列表、一段引用）从中间劈开，渲染器产出的 HTML 结构就废了。
 *
 * 围栏 / 行内代码里的 `---div---` 不算分隔符（走 maskCode 那份判定）。
 * 真实数据实测：5 张卡的正文里有 13 处 `---div---`，其中 11 处在围栏或行内代码里，
 * 真正当分隔符用的只有 2 处。带它的那几张正是讲 Weave 卡片写法的教学卡，模板示例
 * 里就带着 `---div---`——不认围栏，「挖空题写法」会被切成 4 段碎片，整张卡就没法读了。
 *
 * 两条对外承诺：
 *   1. 没有围栏外分隔符时返回长度为 1 的数组，且内容与 splitFrontmatter 的结果
 *      逐字节相同——「没有 ---div--- 的卡行为完全不变」全靠这条；
 *   2. 一个字都没有的正文返回空数组（调用方据此什么都不渲染）。
 * 连写两个分隔符会产生空串段，这里照切不误（字面语义优先），
 * 由渲染层丢掉空段——遮一个空盒子没有意义。
 *
 * @param {string} raw 卡片原文（含 frontmatter）
 * @returns {string[]} 各段（已 trim）
 */
export function splitSegments(raw) {
  const body = splitFrontmatter(raw);
  if (!body) return [];

  // 在掩码串上找分隔符：围栏里的那些已被涂成空白，正则自然匹配不到。
  // 掩码等长，所以命中的偏移可以直接拿去切原串。
  const masked = maskCode(body);
  const out = [];
  let last = 0;
  let m;
  DIV_RE.lastIndex = 0;
  while ((m = DIV_RE.exec(masked))) {
    out.push(body.slice(last, m.index).trim());
    last = m.index + m[0].length;
  }
  out.push(body.slice(last).trim());
  return out;
}

/**
 * #14：正文首行的 0 基行号 —— 点「编辑」分屏打开笔记时，光标该落在哪一行。
 *
 * 干什么用：卡片笔记就是原笔记，文件顶层是 frontmatter 的 YAML。落第 0 行等于
 * 停在 YAML 里，用户还得自己往下翻一屏才看得到正文，这条「分屏打开」就白做了。
 *
 * 三处口径写死在这里：
 *   1. 没有 frontmatter → 0。真库 29 张里有 1 张（「123」，正文就三个数字）是这个形状；
 *   2. 有 frontmatter → 闭合 `---` 的下一行，**并且跳过正文前的空行**。落在一行空白上
 *      和落在 YAML 里给人的观感一模一样（视口里一片空白，"没定位到"），
 *      真库 28 张有 frontmatter 的卡里，第 1 张「01-环境前提」闭合行之后就是个空行，
 *      正文在再下一行——不跳空行这张卡就是这条功能的病标本；
 *   3. 夹在文件最后一行之内。只有 frontmatter、正文全空的笔记取不到正文，
 *      越界行号宿主要么抛（Obsidian 的 eState.line 越界直接报错）要么没反应，
 *      宁可退回闭合行的下一行，也不能点了没用。
 *
 * frontmatter 的判定与 splitFrontmatter 同一口径：开头一条 `---`，后面还得有一条
 * 闭合的 `---`。只有一条 `---` 的不算（它可能是条分隔线），按「没有 frontmatter」处理。
 *
 * @param {string} raw 卡片原文（含 frontmatter）
 * @returns {number} 0 基行号
 */
export function bodyStartLine(raw) {
  // 按 \r?\n 切：CRLF 的库里正文不长 \r，行号与 LF 时一致（\r 会混进行内容里，
  // 让闭合的 `---` 认成 `---\r`，frontmatter 就整块认不出来了）
  const lines = String(raw || "").split(/\r?\n/);
  const last = lines.length - 1;
  if (lines[0].trim() !== "---") return 0;

  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      close = i;
      break;
    }
  }
  if (close < 0) return 0;

  let i = close + 1;
  while (i < lines.length && !lines[i].trim()) i++;
  // 闭合行之后全是空行（或文件就到此为止）：退回闭合行的下一行，交给下面夹一下
  if (i > last) i = close + 1;
  return Math.min(i, last);
}

/**
 * #13：抽出 `==高亮==`，去重、保序（纯函数）。
 *
 * 两个来源：frontmatter 的「概念」在前，正文在后。概念排在前面，是因为它在卡面上
 * 本来就长在最上面（正文得再点一层才看得到），词条顺着这个顺序读下来才像这张卡的脉络。
 *
 * 两处都要跳过代码围栏：真实数据里正文 5 处高亮有 4 处在围栏里，全是「==要背的词==」
 * 这种模板占位——认了围栏，卡头上挂的就是模板词，这条功能就废了。行内代码同理，
 * 概念字段也照涂一遍。
 *
 * 真库 29 张卡按这个口径只有 2 个词条：「总纲-改写法即改题型」正文里的 ==词==，
 * 与「挖空题写法」概念里的 ==关键词==。后者正是「概念算不算来源」的分水岭——
 * 不算的话 #13 的卡头词条条在真库里一次都不会出现（「总纲」恰好落在窄条行，
 * 只有悬停浮层那条路会亮）。
 *
 * @param {string} raw 卡片原文（含 frontmatter）
 * @param {string} [concept] frontmatter 的「概念」字段
 * @returns {string[]} 去重后的关键词
 */
export function extractHighlights(raw, concept = "") {
  const seen = new Set();
  const out = [];
  collectHighlights(toStr(concept), seen, out);
  collectHighlights(splitFrontmatter(raw), seen, out);
  return out;
}

/** 从一段文本里把高亮词收进 out，已经见过的跳过。掩码与取值口径见 extractHighlights */
function collectHighlights(text, seen, out) {
  if (!text) return;
  const masked = maskCode(text);
  HIGHLIGHT_RE.lastIndex = 0;
  let m;
  while ((m = HIGHLIGHT_RE.exec(masked))) {
    // 词本身从原串上取：`==` 里万一夹着行内代码，掩码串上那个位置是空白，
    // 拿它当关键词就成了一串空格。偏移在两串上一致（掩码等长），取得到。
    const word = text.slice(m.index + 2, m.index + m[0].length - 2).trim();
    if (!word || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
  }
}

// 取 `]]` 之后到行尾 / 下一个 [[ 之间的内容，作为「关联理由」
function extractReason(raw, end) {
  if (!raw || !end) return "";
  const nl = raw.indexOf("\n", end);
  const nextLink = raw.indexOf("[[", end);
  let stop = nl > end ? nl : raw.length;
  if (nextLink > end && nextLink < stop) stop = nextLink;
  return stop > end ? raw.slice(end, stop).trim() : "";
}

// 契约：卡片在晶体内的顺序由文件名决定（不是写入顺序、不是洗牌）
export function byFileName(a, b) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/** 路径的最后一段；空串或没有斜杠时原样返回 */
function lastSegment(v) {
  const parts = toStr(v).split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : toStr(v);
}

/**
 * 环上显示的名字，从晶体 key 里取。
 *
 * 先取路径最后一段（key 现在是 `Python/数据分析` 这样的相对路径），
 * 再按 `_` 切一次取末段——`物理_力学` 显示成 `力学` 是改动前就有的老行为，
 * 名字里带路径分隔符之后更要先切斜杠，否则整条路径会原样显示在六边形上。
 */
function crystalName(key) {
  const parts = lastSegment(key).split("_");
  return parts[parts.length - 1] || toStr(key);
}

/**
 * 所有 folder 的**最长公共前缀**（按段比，不是按字符比）。
 *
 * 这是「卡片根目录」——`知识卡片/` 本身，而不是从别处传进来的常量。
 * 推出来而不是传进来，是为了让旧的调用方（测试、脚本）不改签名就还能跑：
 * 一个扁平的库推出来的前缀就是那层公共目录，相对路径 = 今天那个末段，
 * 于是晶体 key 与改动前逐字相同。
 */
function commonFolderPrefix(folders) {
  const lists = folders.map((f) => toStr(f).split("/").filter(Boolean)).filter((l) => l.length);
  if (!lists.length) return [];
  let prefix = lists[0];
  for (const l of lists) {
    let i = 0;
    while (i < prefix.length && i < l.length && prefix[i] === l[i]) i++;
    prefix = prefix.slice(0, i);
    if (!prefix.length) break;
  }
  return prefix;
}

/**
 * @param {object} raw
 * @param {(folder: string) => string} [keyOfFolder]
 *   算晶体身份用。缺省 = 取 folder 末段（改动前的老口径），
 *   老调用方不传就还是老行为。
 */
export function normalizeCard(raw, keyOfFolder) {
  const folder = toStr(raw.folder);
  const keyOf = typeof keyOfFolder === "function" ? keyOfFolder : lastSegment;
  return {
    path: toStr(raw.path),
    folder,
    crystal: keyOf(folder),
    name: toStr(raw.name),
    title: stripCardPrefix(raw.name),
    concept: toStr(raw.concept),
    tags: (raw.tags || []).map(toStr).filter(Boolean),
    source: toStr(raw.source),
    content: toStr(raw.content),
    // #13 卡头关键词。在归一化时算一次，卡面与浮层两处直接读——
    // 卡片重建（翻页）频率不低，没必要每建一个 DOM 就把正文重扫一遍。
    keywords: extractHighlights(raw.content, raw.concept),
  };
}

/**
 * 编辑保存后，把新的字段值原地写回一张已经建好的卡。
 *
 * **原地改**（不是造一张新卡）是要紧的：这张卡的对象被好几处握着——
 * `model.groups[key]` 里的那一份、卡面 DOM 上的 `el._card`、此刻开着的全息面板。
 * 换成新对象的话，只有拿新对象的那一处会更新，其余还指着旧的，于是屏幕上
 * 一半是新的、一半是旧的。对象身份在这里是接口的一部分。
 *
 * keywords 必须跟着重算：normalizeCard 里算过一次，但那是建模型时的事，
 * 概念改了高亮词就变了，不重算的话卡头关键词条还挂着旧词。
 *
 * `content` 传的是**写盘后回读的真实全文**——不传就别动它（只改 frontmatter 时，
 * 正文本来就没碰过，没必要用我们自己拼的那份去覆盖宿主真正存着的那份）。
 *
 * @param {object} card    normalizeCard 产出的那张卡，原地改
 * @param {object} [fields] 形如 { 概念, 来源, tags }，没给的键不动
 * @param {string} [content] 新的全文
 */
export function applyCardFields(card, fields, content) {
  if (!card) return card;
  const f = fields || {};
  if (f.概念 !== undefined) card.concept = toStr(f.概念);
  if (f.来源 !== undefined) card.source = toStr(f.来源);
  if (f.tags !== undefined) card.tags = (f.tags || []).map(toStr).filter(Boolean);
  if (content !== undefined) card.content = toStr(content);
  card.keywords = extractHighlights(card.content, card.concept);
  return card;
}

/**
 * @param {Array} rawCards 卡片（见 adapter.js 的 Card）
 * @param {object} adapter 见 adapter.js
 * @param {string[]} [rawFolders] **够格当晶体的文件夹**（`adapter.listFolders()`）。
 *   3.0 刀 9 第三版加的：在这之前这棵树是**从卡片长出来**的，一个还没有卡的文件夹
 *   根本不是节点，于是「刚建出来、等着放卡」的那颗晶体在库里看不见。
 *   缺省空数组 = 老行为。
 */
export function createModel(rawCards, adapter, rawFolders = []) {
  // ---- 卡片根目录与晶体身份 ----
  //
  // 晶体是文件夹树上的一个节点，身份 = **相对卡片根目录的路径**（`Python/数据分析`），
  // 不再是 folder 的末段。改成路径是为了两层以上：末段口径下
  // `a/b/x.md` 与 `c/b/y.md` 会撞成同一颗「b」，中间那层 a / c 直接消失。
  //
  // 扁平库下相对路径恰好等于原来的末段，于是 key、顺序、配色一字不变——
  // 多层是「文件夹真的套起来才点亮」的能力，不是换一套标识。
  const prefix = commonFolderPrefix(rawCards.map((c) => toStr(c.folder)));
  const rootFolder = prefix.join("/");
  const keyOfFolder = (folder) => {
    const rel = toStr(folder).split("/").filter(Boolean).slice(prefix.length);
    // 正好是根目录自己（卡片裸放在卡片根下）时相对路径是空的，退回末段——
    // 也就是改动前那颗以文件夹命名的晶体。
    return rel.length ? rel.join("/") : lastSegment(folder);
  };

  const allCards = rawCards.map((c) => normalizeCard(c, keyOfFolder)).filter((c) => c.title);

  // ---- 文件夹树：从卡片路径推导 ----
  //
  // 每张卡沿自己的 folder 自顶向下补齐所有祖先。**空文件夹不显示**——
  // 树是从卡片推出来的，底下连一张卡都没有的文件夹无从得知它存在
  //（要显示它得往契约加一个「列出目录」的方法，本版刻意不加）。
  //
  // 顺序契约：children 用**首次出现顺序**，不是字典序。这与改动前
  // `Object.keys(groups)` 的顺序同源，所以环上方位与配色一字不变。
  const nodes = new Map(); // folder -> node
  const root = {
    folder: rootFolder,
    key: "",
    depth: 0,
    parent: null,
    children: [],
    cards: [],
    hue: 0,
    name: "",
  };
  nodes.set(rootFolder, root);

  const makeNode = (folder, parent) => ({
    folder,
    key: "",
    depth: parent.depth + 1,
    parent,
    children: [],
    cards: [],
    hue: 0,
    name: "",
  });

  /**
   * 顺着 folder 把祖先逐层补齐，返回最里面那一层。
   *
   * 建树和**建完之后新增卡片**（addCard）共用这一条。两处各写一遍的话，
   * 后来加进去的卡会落进一棵和最初那棵不一样的树里——而且不报错，
   * 表现只是「这颗晶体里少了一张卡」。
   */
  function ensureNode(folder) {
    const parts = toStr(folder).split("/").filter(Boolean);
    let cur = root;
    for (let i = prefix.length; i < parts.length; i++) {
      const f = parts.slice(0, i + 1).join("/");
      let next = nodes.get(f);
      if (!next) {
        next = makeNode(f, cur);
        nodes.set(f, next);
        cur.children.push(next);
      }
      cur = next;
    }
    return cur;
  }

  for (const c of allCards) {
    const node = ensureNode(c.folder);
    node.cards.push(c);
    // 卡片记住自己在哪一层：正文改了要重算关系时用得上
    c.node = node;
  }
  // ---- 空文件夹：也长成节点（3.0 刀 9 第三版）----
  //
  // 放在卡片之后：`ensureNode` 是「已经在就用、没有才建」，所以有卡的层一个字不变，
  // 顺序与配色也保持原样；新冒出来的空晶体落在它们后面——那是**稳定**的，
  // 不是随便排的（环上的方位跟着 allNodes 的顺序走）。
  for (const f of rawFolders || []) {
    const folder = toStr(f);
    if (!folder) continue;
    // ⚠️ **这里刻意不再加一道「必须在 rootFolder 里面」的守卫。**
    //
    // 加过一次，结果把功能整个挡死了：`rootFolder` 是**推断**出来的——它是所有
    // 卡片 folder 的最长公共前缀，**卡片全挤在一个文件夹里时它就是那个文件夹**
    // （真库不是这样，但测试夹具和「刚开始只有一个晶体」的库都是）。
    // 于是新建的文件夹 100% 落在它外面，全被丢掉，表现是「建完了环上还是没有」。
    //
    // 范围本来就该由**宿主**界定：`listFolders()` 只报卡片目录底下的文件夹，
    // 核心这里再判一次纯属多余，而且判错了没有任何东西会报出来。
    // （路径不在前缀之下时，`keyOfFolder` 有 lastSegment 兜底，不会产出怪 key。）
    ensureNode(folder);
  }

  // 裸放在卡片根目录下的卡片：改动前它们自成一颗以根文件夹命名的晶体。
  // 根目录本身不会渲染成六边形（你永远「在里面」），所以给它们挂一个平级的
  // 兄弟节点，别让它们在多层版里凭空消失。它永远是叶子——根的任何子文件夹
  // 都是根的兄弟，不是它的孩子。
  let looseNode = root.cards.length ? makeNode(rootFolder, root) : null;
  if (looseNode) {
    looseNode.key = lastSegment(rootFolder) || "散卡";
    looseNode.cards = root.cards;
    root.cards = [];
    root.children.unshift(looseNode);
    for (const c of looseNode.cards) c.node = looseNode;
  }

  // ---- 身份索引：key -> node。key 全局唯一，所以只存末一段就够定位一层 ----
  const byKey = new Map();
  const allNodes = [];
  const adopt = (n) => {
    n.name = crystalName(n.key);
    byKey.set(n.key, n);
    allNodes.push(n);
  };

  (function walk(node) {
    for (const ch of node.children) {
      if (ch === looseNode) continue; // 散卡节点最后认领，让真文件夹先占 key
      ch.key = keyOfFolder(ch.folder);
      adopt(ch);
      walk(ch);
    }
  })(root);

  /**
   * 认领「裸放在卡片根目录下的卡片」那一颗晶体。
   *
   * 原来只在建模型时跑一次；addCard 也要用它——一个原本一张散卡都没有的库，
   * 第一次在根目录下建卡时得先长出这一层来。不这样的话新卡会落进 root.cards，
   * 而 root **永远不渲染**：表现是「建完了，库里没有」，哪一步都不报错。
   */
  function adoptLoose() {
    if (!looseNode) return null;
    if (byKey.get(looseNode.key) === looseNode) return looseNode; // 认领过了
    // 极端情况：既有裸放卡片，又恰好有个子文件夹叫根目录的名字。
    // 两个节点不能共用 key——crystalPath 会解析不出是哪一层。
    if (byKey.has(looseNode.key)) looseNode.key += "（散卡）";
    adopt(looseNode);
    return looseNode;
  }

  adoptLoose();

  /** 一个节点子树里的全部卡片（含它自己那一层） */
  function cardsUnder(node) {
    const out = [];
    (function walk(n) {
      for (const c of n.cards) out.push(c);
      for (const ch of n.children) walk(ch);
    })(node);
    return out;
  }

  // ---- 兼容层：旧消费方按 key 取「这颗晶体名下的卡片」 ----
  // groups[key] = 该节点**子树**的全部卡片。扁平库下子树 == 该文件夹的直属卡，
  // 与改动前逐张相同。
  const groups = {};
  const crystalKeys = [];
  /** 重算 groups / crystalKeys / 总数。新增卡片之后要叫一次（见 addCard）。 */
  function rebuildGroups() {
    for (const n of allNodes) groups[n.key] = cardsUnder(n).sort(byFileName);
    // **原地改，不换对象**：groups / crystalKeys 是按引用挂在返回值上的，
    // 换一个新的会让外部持有者（crystals.js、modules.js 那几处）拿着一个死对象。
    // 与 rebuildRelations 里 orphanPaths 那条规矩同源。
    crystalKeys.length = 0;
    for (const n of root.children) crystalKeys.push(n.key);
  }
  rebuildGroups();

  // ---- 配色 ----
  //
  // 顶层按数量均分色轮（与改动前同一个公式、同一个顺序），子层绕着父层的色相
  // 小范围展开——「同族同色」，钻进 Python 之后它的子晶体都偏蓝，方位感不丢。
  const wrap360 = (v) => ((Math.round(v) % 360) + 360) % 360;
  const CHILD_SPREAD = 72; // 子层总跨度 ±36°
  // 写成函数声明（不是一个自执行表达式），是为了 addCard 长出**新的一层**时
  // 还能再叫一次——新晶体进环，配色得按同一套公式重排，不能另开一套。
  function assignHue(node) {
    const kids = node.children;
    kids.forEach((ch, i) => {
      if (node === root) {
        ch.hue = wrap360((i / kids.length) * 360);
        return;
      }
      // 除以 max(n, 2)：独子也要偏开一点。对称展开碰上 n=1 会算出 0，
      // 那颗子晶体就会和它背后的父晶体一个颜色，看着像重影。
      const step = CHILD_SPREAD / Math.max(kids.length, 2);
      ch.hue = wrap360(node.hue + (i + 0.5) * step - CHILD_SPREAD / 2);
    });
    for (const ch of kids) assignHue(ch);
  }
  assignHue(root);

  const colorOf = (key) => {
    const n = byKey.get(key);
    return n ? { hue: n.hue, name: n.name } : { hue: 0, name: key };
  };

  // ---- 身份索引 ----
  const byPath = new Map();
  const byTitle = new Map();
  for (const c of allCards) {
    byPath.set(c.path, c);
    byTitle.set(c.title, c);
  }

  const linkGraph = new Map(); // title -> Map(linkedTitle -> reason)
  const backLinkGraph = new Map(); // title -> Map(sourceTitle -> reason)
  const orphanPaths = new Set(); // 既无出链也无入链的卡片 path

  // 解析一张卡片的出链。指向库外的目标也会被登记进 byTitle（原行为）
  function buildRelated(card) {
    const raw = card.content || "";
    const related = [];
    for (const link of parseLinks(raw)) {
      const resolved = adapter.resolveLink(link.target, card.path);
      if (!resolved || !resolved.path) continue;

      let target = byPath.get(resolved.path);
      if (!target) {
        const title = stripCardPrefix(resolved.name);
        target = normalizeCard(
          {
            path: resolved.path,
            folder: "",
            name: resolved.name,
            concept: resolved.concept,
            tags: resolved.tags,
            source: resolved.source,
            content: "",
          },
          keyOfFolder
        );
        target.title = title || target.title;
        if (!byTitle.has(target.title)) byTitle.set(target.title, target);
      }
      if (!target.title || target.title === card.title) continue;
      related.push({ title: target.title, reason: extractReason(raw, link.end) });
    }
    return related;
  }

  const relatedOf = (card) =>
    [...(linkGraph.get(card.title) || new Map())].map(([title, reason]) => ({ title, reason }));
  const backlinksOf = (card) =>
    [...(backLinkGraph.get(card.title) || new Map())].map(([title, reason]) => ({ title, reason }));

  const isOrphan = (card) => orphanPaths.has(card.path);
  const cardByTitle = (title) => byTitle.get(title) || null;

  // 跨晶体关系（#7）：哪张卡把两颗晶体连起来。
  // crystalKey -> [{ other, card, target, reason, dir }]，dir: "out" = 本晶体指向对方
  const crystalEdges = new Map();
  const pushEdge = (fromKey, edge) => {
    if (!crystalEdges.has(fromKey)) crystalEdges.set(fromKey, []);
    crystalEdges.get(fromKey).push(edge);
  };

  /**
   * 从所有卡片**当前的正文**重建整张关系图。原地改，不换对象。
   *
   * 编辑正文会改掉双链，所以它是可重跑的——这是 #16 第二轮唯一需要「重算」的东西。
   * 全量重建而不是增量补一张卡：图是全部卡内容的纯函数，全量算 30 张卡是亚毫秒级，
   * 增量还要处理「这张卡不再指向谁了」的撤销，得不偿失。
   *
   * ⚠️ 三处必须这样写：
   *   1. **byTitle 先清回「只有真卡」**。buildRelated 会给指向库外的目标登记一张
   *      content 为空的影子卡，而它那句 `if (!byTitle.has(...))` 挡住了覆盖——
   *      影子卡一旦进去就**永远盖住后来才建的真卡**（表现：明明库里有的卡，
   *      卫星显示「暂无描述」，点进去是张空卡）。不清就永远修不回来。
   *   2. **一律 clear() 不换对象**。orphanPaths 是按引用挂在返回对象上的，
   *      换新 Set 会让外部持有者拿着一个死对象。linkGraph 那几个虽然在闭包里，
   *      但保持同一条规矩，省得以后有人把它们也挂出去时踩坑。
   *   3. **byPath 不动**：它只由 allCards 灌入，buildRelated 从不写它；
   *      而且 buildRelated 正要靠它把目标从「影子」升级成真卡。
   *
   * 调用点必须在 createModel **末尾**：relatedOf / pushEdge 都是 const 箭头函数，
   * 放在它们初始化之前调用会 TDZ 报错。
   */
  function rebuildRelations() {
    byTitle.clear();
    for (const c of allCards) byTitle.set(c.title, c);
    linkGraph.clear();
    backLinkGraph.clear();
    orphanPaths.clear();
    crystalEdges.clear();

    for (const c of allCards) {
      linkGraph.set(c.title, new Map(buildRelated(c).map((r) => [r.title, r.reason])));
    }
    for (const c of allCards) backLinkGraph.set(c.title, new Map());
    for (const [title, m] of linkGraph) {
      for (const [linked, reason] of m) {
        if (backLinkGraph.has(linked)) backLinkGraph.get(linked).set(title, reason);
      }
    }
    for (const c of allCards) {
      const out = linkGraph.get(c.title);
      const inc = backLinkGraph.get(c.title);
      if ((!out || out.size === 0) && (!inc || inc.size === 0)) orphanPaths.add(c.path);
    }

    for (const c of allCards) {
      for (const { title, reason } of relatedOf(c)) {
        const target = byTitle.get(title);
        if (!target || !target.crystal || target.crystal === c.crystal) continue;
        pushEdge(c.crystal, {
          other: target.crystal,
          card: c.title,
          target: title,
          reason,
          dir: "out",
        });
      }
      for (const { title, reason } of backlinksOf(c)) {
        const src = byTitle.get(title);
        if (!src || !src.crystal || src.crystal === c.crystal) continue;
        pushEdge(c.crystal, {
          other: src.crystal,
          card: src.title,
          target: c.title,
          reason,
          dir: "in",
        });
      }
    }
  }

  rebuildRelations();

  /**
   * 把一张**新写出来的**卡片登记进模型（3.0 刀 6，「边看边记」那条链的最后一环）。
   *
   * 为什么需要它：`applyExternalChange` 对不认识的路径是**直接返回**的
   * （见 app.js 里那句「不是我们的卡」）。那条规矩对一个「别处新增了一张卡」
   * 的通知是对的——我们没法凭空知道它该进哪棵树。但阅读器建的卡不一样：
   * 我们自己写的，路径、字段、正文全在手上，所以由调用方显式送进来。
   *
   * ⚠️ **它只登记，不渲染。** 树长出来了、关系图重算了，但屏幕上还是旧的——
   * 调用方负责接着走一次重画。不画的话表现是「卡建好了，但库里看不见」，
   * 而这一步没有任何东西会替你兜底。
   *
   * ⚠️ 幂等：同一个 path 送两次返回第一次那个对象。宿主那边一个新文件会连着
   * 报好几件事（create + modify + metadataCache.changed），调用方不必替它去重。
   *
   * @param {object} raw 与 loadCards 产出的 Card 同形（path/folder/name/概念…）
   * @returns {object|null} 登记好的那张卡；没有标题（归一化后叫不出名字）时返回 null
   */
  function addCard(raw) {
    const card = normalizeCard(raw, keyOfFolder);
    if (!card.title || !card.path) return null;
    const existing = byPath.get(card.path);
    if (existing) return existing;

    allCards.push(card);
    byPath.set(card.path, card);

    const folder = toStr(card.folder);
    let node;
    let grew = false; // 这次有没有**长出新的层**
    if (folder === rootFolder) {
      // 裸放在卡片根目录下：归散卡那一颗。库里原本一张散卡都没有时，
      // 这一层这次才第一次存在——不建它的话卡会落进 root.cards，而 root
      // 永远不渲染。
      if (!looseNode) {
        looseNode = makeNode(rootFolder, root);
        looseNode.key = lastSegment(rootFolder) || "散卡";
        root.children.unshift(looseNode);
        grew = true;
      }
      node = looseNode;
      adoptLoose();
    } else {
      node = ensureNode(folder);
      // 新长出来的层要逐层认领身份（key / byKey / allNodes）。**从上往下**——
      // allNodes 的顺序决定了「文件夹」面板里的排列，倒着认领会排出一个
      // 和重新加载一遍不一样的顺序。
      const fresh = [];
      for (let cur = node; cur && cur !== root && byKey.get(cur.key) !== cur; cur = cur.parent) {
        fresh.unshift(cur);
      }
      for (const n of fresh) {
        n.key = keyOfFolder(n.folder);
        adopt(n);
        grew = true;
      }
    }

    node.cards.push(card);
    card.node = node;

    // 新晶体进环 ⇒ 顶层色相按同一个公式重排。只是往已有的层里加卡时不动色相：
    // 那会让所有晶体的颜色都跟着挪一下，而用户只是记了一条笔记。
    if (grew) assignHue(root);
    rebuildGroups();
    rebuildRelations();
    return card;
  }

  /**
   * 把一个新文件夹登记进树（3.0 刀 9 第三版）。阅读器里「新建晶体」建完当场调，
   * 这样那颗空晶体**立刻**出现在环上，不必等笔记重挂一遍。
   *
   * 形状照着 `addCard` 里「长出新的一层」那一段写：`ensureNode` 补齐祖先，
   * 然后把新长出来的层**从上往下**认领身份（key / byKey / allNodes）——
   * 倒着认领会排出一个和重新加载一遍不一样的顺序。
   *
   * 已经有了就什么都不做（`ensureNode` 本身就是「有就用、没有才建」）。
   * @returns {boolean} 这次真的长出了新的一层吗
   */
  function addFolder(rawFolder) {
    const folder = toStr(rawFolder);
    if (!folder) return false;
    // 范围由宿主界定（见上面那段注释：rootFolder 是推断出来的，拿它当护栏会把
    // 新建的文件夹全挡掉）。
    if (byKey.has(keyOfFolder(folder)) && nodes.has(folder)) return false; // 早就在树上了
    const node = ensureNode(folder);
    const fresh = [];
    for (let cur = node; cur && cur !== root && byKey.get(cur.key) !== cur; cur = cur.parent) {
      fresh.unshift(cur);
    }
    if (!fresh.length) return false;
    for (const n of fresh) {
      n.key = keyOfFolder(n.folder);
      adopt(n);
    }
    assignHue(root); // 环上多一颗 ⇒ 顶层色相按同一个公式重排（同 addCard 的 grew 那一支）
    rebuildGroups();
    rebuildRelations();
    return true;
  }

  /**
   * 摘掉一颗晶体（连同它的子树）——3.0 刀 12「删除晶体」。
   *
   * 形状照着 `addFolder` 的**反面**写。两个方向之所以要对称着写，是因为这个模型
   * 有五处索引同时记着同一件事，漏掉任何一处都是**不报错、只是屏幕上不对**：
   *
   *   · `nodes` / `byKey` / `allNodes` —— 树与身份，三处都要摘
   *   · 父节点的 `children` —— 不摘的话它会留在环上（一个 Map 里没有的孤儿）
   *   · `allCards` + `byPath` —— 卡片本身
   *   · **`groups` 里那些 key** —— 见下面那条 ⚠️，这是最容易漏的一处
   *   · `byTitle` / `linkGraph` / `backLinkGraph` / `orphanPaths` / `crystalEdges`
   *     —— 这五个由 `rebuildRelations()` **整体重建**，不用手摘
   *
   * ⚠️ **`groups` 必须显式 delete。** `rebuildGroups()` 只做
   * `for (const n of allNodes) groups[n.key] = …` —— 它**只写不删**。
   * 摘完节点不删这个 key 的话，`groups` 上会留一条指向已经不存在的晶体的旧数组；
   * 于是 `renderCrystals` 拿 `crystalKeys` 渲染时看着正常，而任何按 key 取
   * 卡片的地方（卫星、孤岛、跨晶体关系）都可能捞到一堆已经删掉的卡。
   *
   * ⚠️ **收的是「宿主路径」，不是晶体 key**（与 `addFolder` 一致——`nodes` 那张表
   * 就是 `folder -> node`）。这两个在这份代码里到处并存、长得又像：
   * `Python/数据分析` 是 **key**，`3.资产舱/知识卡片/Python/数据分析` 才是**路径**。
   * 传错的表现是**静默不删**（`nodes.get()` 拿不到，直接返回 false），
   * 而调用方多半没接返回值——那就是「点了删除，什么都没发生」。
   * 核心那边要 key→路径时用 `model.byKey.get(key).folder`。
   *
   * `root` 摘不掉（它是 `nodes` 里那条基准）——传空、传根、传不存在的都返回 false。
   *
   * @returns {boolean} 真的摘掉了吗
   */
  function removeFolder(folder) {
    const f = toStr(folder).replace(/\/+$/, "");
    if (!f) return false;
    const node = nodes.get(f);
    if (!node || node === root) return false;

    // 这一棵子树上的全部卡片（含它自己那一层）
    const doomed = [];
    (function walk(n) {
      doomed.push(n);
      for (const ch of n.children) walk(ch);
    })(node);
    const goneNodes = new Set(doomed);
    const gonePaths = new Set();
    for (const n of doomed) for (const c of n.cards) gonePaths.add(c.path);

    // 卡片：`allCards` 与 `byPath` 都要摘。`byTitle` 交给 rebuildRelations。
    for (let i = allCards.length - 1; i >= 0; i--) {
      if (gonePaths.has(allCards[i].path)) allCards.splice(i, 1);
    }
    for (const p of gonePaths) byPath.delete(p);

    // 节点：三处索引 + 父节点的 children + `groups` 里那几个 key（见上面那条 ⚠️）
    for (const n of doomed) {
      nodes.delete(n.folder);
      byKey.delete(n.key);
      delete groups[n.key];
    }
    for (let i = allNodes.length - 1; i >= 0; i--) {
      if (goneNodes.has(allNodes[i])) allNodes.splice(i, 1);
    }
    if (node.parent) node.parent.children = node.parent.children.filter((c) => c !== node);

    // 重算三样。**原地改、不换对象**——同 `rebuildGroups` 那条规矩：
    // 这些是按引用挂在返回值上的，换一个新的会让外部持有者拿着一个死对象。
    assignHue(root); // 环上少一颗 ⇒ 顶层色相按同一个公式重排
    rebuildGroups();
    rebuildRelations();
    return true;
  }

  /**
   * 摘掉**一张卡**（3.0 刀 12 第二半：阅读器的「返回」要撤掉刚建出来的那张）。
   *
   * 与 `removeFolder` 是两件事，别混：那个摘一棵子树（连同里面的卡），
   * 这个只摘一张卡、**晶体本身留着**。
   *
   * ⚠️ **摘完可能留下一颗空晶体**——节点不跟着消失。这是**有意的**：
   * 那个文件夹在盘上确实存在（卡建出来的），盘上有、屏幕上没有才是骗人。
   * 不想要它，用「删除晶体」删掉（那个连带把文件夹丢回收站）。
   *
   * @returns {boolean} 真的摘掉了吗
   */
  function removeCard(path) {
    const p = toStr(path);
    if (!p) return false;
    const card = byPath.get(p);
    if (!card) return false;
    const i = allCards.indexOf(card);
    if (i >= 0) allCards.splice(i, 1);
    byPath.delete(p);
    // 卡片自己也挂在节点的 `cards` 上——不摘的话 `cardsUnder` 还会数到它
    if (card.node && card.node.cards) {
      card.node.cards = card.node.cards.filter((c) => c !== card);
    }
    // `byTitle` / 关系图 / 孤岛 / 跨晶体边由 rebuildRelations 整体重建；
    // groups 与 crystalKeys 由 rebuildGroups；色相按数量重排。
    rebuildGroups();
    rebuildRelations();
    assignHue(root);
    return true;
  }

  /** 与某颗晶体相连的其它晶体（按出现顺序去重），带上是哪张卡连的 */
  function neighborsOf(key) {
    const edges = crystalEdges.get(key) || [];
    const order = [];
    const byOther = new Map();
    for (const e of edges) {
      if (!byOther.has(e.other)) {
        byOther.set(e.other, []);
        order.push(e.other);
      }
      byOther.get(e.other).push(e);
    }
    return order.map((other) => ({ key: other, hue: colorOf(other).hue, edges: byOther.get(other) }));
  }

  // ---- 按层查询（#19 多层晶体）----
  //
  // crystalPath 是一串 key，`[]` = 在卡片根目录这一层。key 全局唯一，
  // 所以只认末一段就能定位节点，不必从根一路走下来校验祖先。

  /**
   * 按 crystalPath 定位节点；那一层今天不在就返回 null（不抛）。
   *
   * **只认路径的最后一段**。key 全局唯一、而且它自己就是那条路径
   *（`Python/数据分析` 既是名字也是位置），所以从根一路走下来是白走。
   * 好处是调用方不必把整条链带全：`cardsAt(["Python/数据分析"])` 与
   * `cardsAt(["Python", "Python/数据分析"])` 同一个意思——少一个能写错的形状。
   *
   * 过期路径（改名/删除）请先过 `resolveChain` 再喂进来；直接喂会得到 null，
   * 而 null 会一路变成空数组，不会变成异常。
   */
  function nodeAt(path) {
    const p = Array.isArray(path) ? path : [];
    if (!p.length) return root;
    return byKey.get(toStr(p[p.length - 1])) || null;
  }

  const childrenOf = (path) => {
    const n = nodeAt(path);
    return n ? n.children.slice() : [];
  };
  const keysAt = (path) => childrenOf(path).map((n) => n.key);
  const cardsAt = (path) => {
    const n = nodeAt(path);
    return n ? n.cards.slice().sort(byFileName) : [];
  };
  const subtreeCount = (path) => {
    const n = nodeAt(path);
    return n ? cardsUnder(n).length : 0;
  };
  // 孤岛数按**子树**算：一个纯容器文件夹自己没有直属卡，只看直属的话它永远不亮，
  // 而它子树里可能全是孤岛。orphanPaths 是 rebuildRelations 原地刷新的，
  // 所以这里必须现算、不能建模型时缓存。
  const subtreeOrphans = (path) => {
    const n = nodeAt(path);
    return n ? cardsUnder(n).filter((c) => orphanPaths.has(c.path)).length : 0;
  };
  /**
   * 按晶体分组的孤岛卡，供顶栏那份「孤岛汇总」用。
   *
   * 口径与 subtreeOrphans 完全一致（当前这一层 + 它子树），只是把「几张」
   * 摊开成「哪几张、在哪颗晶体里」。只返回真有孤岛的组——没有的整组不出现，
   * 汇总里不该有一堆「0 张」占位置。
   *
   * @returns {{key: string, name: string, cards: object[]}[]}
   */
  function orphanGroups(path) {
    const n = nodeAt(path);
    if (!n) return [];
    const out = [];
    (function walk(node) {
      const cards = node.cards.filter((c) => orphanPaths.has(c.path)).sort(byFileName);
      if (cards.length) out.push({ key: node.key, name: node.name, cards });
      for (const ch of node.children) walk(ch);
    })(n);
    return out;
  }

  /**
   * 全库的文件夹树，供「文件夹」面板用（#21；3.0 刀 9 改成**真嵌套**）。
   *
   * 形状 `{key, name, label, cards, children}[]`，与 `orphanGroups` 同族，
   * 但**多一层 `children`**：孤岛面板是扁平的两级列表（那是个诊断面板，
   * 路径写在名字里更好认——「进阶」在多层下会重名），文件夹面板是导航器，
   * 得跟资源管理器一样一层套一层。
   *
   * 从前这一份是 `allNodes` 摊平出来的，画的时候靠 `groupLabel` 把路径拼成
   * 「Python / 数据分析」。那在一个文件夹**既有直属卡又有子文件夹**时是错位的：
   * 子文件夹和它的父文件夹排在同一列，只差一个斜杠，看不出谁在谁里面——
   * 这正是用户 09-17 报的那个「文件夹嵌套功能有问题」。
   * 现在父子关系由结构本身表达，`label` 就是名字。
   *
   * `key` 仍是全局唯一的那条路径：展开状态、跳层、落盘全认它，一个字没变。
   *
   * 另一点没变：**包含一张直属卡都没有的纯容器文件夹**——文件夹面板是拿来
   * 导航的，一个空文件夹也该看得见、点得进去（孤岛面板只用报有问题的）。
   */
  function folderTree() {
    const shape = (n) => ({
      key: n.key,
      name: n.name,
      label: n.name,
      // 这一层的**宿主路径**（`3.资产舱/知识卡片/Python/数据分析`）。阅读器的
      // 「将建在」要拿它当 `createCard` 的目标——核心不许 import config.js
      // （见 adapter.js：「目录常量留在宿主那一侧」），而这条路径本来就在节点上。
      folder: n.folder,
      cards: n.cards.slice().sort(byFileName),
      children: n.children.map(shape),
    });
    return root.children.map(shape);
  }

  /** 这颗 key 今天还在不在树上（恢复视图状态、换重新渲染之前都要问一句） */
  const hasNode = (key) => byKey.has(toStr(key));

  /**
   * 把一个 key 解析成**还能落地的**层级链。
   *
   * key 本身就是路径（`Python/数据分析`），所以正常情况这就是 split("/")。
   * 多出来的是容错：存档里的层可能今天已经不存在了（文件夹改名、删了、
   * 整棵子树被挪走）。逐段往下走，走到走不动为止——**停在最后一个有效层**，
   * 而不是整份丢掉退回根：改一次名不该让人丢失「我刚才在哪」。
   *
   * 顺带挡住一种崩法：拿一个不存在的 key 去 `[...model.groups[key]]` 会抛
   * TypeError，表现为整个晶体库打不开。恢复路径上先过这一道就不会。
   */
  function resolveChain(key) {
    const k = toStr(key);

    // 快路：这一层今天还在。顺着 parent 走回根，拿到准确的链。
    // 不能拿 key 去 split("/") 逐段找子节点——**子节点的 key 是完整相对路径，
    // 不是一段**（`Python` 的孩子叫 `Python/数据分析`，不叫 `数据分析`）。
    const hit = byKey.get(k);
    if (hit) {
      const out = [];
      for (let cur = hit; cur && cur !== root; cur = cur.parent) out.unshift(cur.key);
      return out;
    }

    // 慢路：层已经没了（改名 / 删了 / 整棵子树挪走）。逐段往下走，
    // 停在最后一个还站得住的层。
    const segs = k.split("/").filter(Boolean);
    const out = [];
    let cur = root;
    for (let i = 0; i < segs.length; i++) {
      const want = segs.slice(0, i + 1).join("/");
      const next = cur.children.find((ch) => ch.key === want);
      if (!next) break;
      out.push(next.key);
      cur = next;
    }
    return out;
  }

  return {
    allCards,
    crystalKeys,
    groups,
    // 取值的、不是存的：addCard 加完卡之后这个数就变了，而 crystalKeys / groups
    // 是**原地**改的，所以这里现算才对得上。顶栏那句「N cards」读的就是它，
    // 存成一个数的话，用户在阅读器里建完卡会发现顶栏少算一张。
    get totalCards() {
      return crystalKeys.reduce((sum, k) => sum + groups[k].length, 0);
    },
    colorOf,
    byPath,
    relatedOf,
    backlinksOf,
    isOrphan,
    cardByTitle,
    orphanPaths,
    neighborsOf,
    // #19 多层：按层查询
    keysAt,
    childrenOf,
    cardsAt,
    subtreeCount,
    subtreeOrphans,
    orphanGroups,
    folderTree,
    addFolder,
    removeFolder,
    removeCard,
    hasNode,
    resolveChain,
    // 以卡片根目录为起点、逐层走一遍（恢复视图状态时用）
    rootKey: lastSegment(rootFolder),
    // #16 第二轮：正文改了之后重算整张图（见 rebuildRelations 头顶那段）。
    // 改完正文的调用方在重渲染之前必须调它，否则卫星/孤岛标还是旧的。
    refreshRelations: rebuildRelations,
    // 3.0 刀 6：把新写的卡片登记进模型。**只登记、不渲染**，理由见它头顶那段。
    addCard,
  };
}
