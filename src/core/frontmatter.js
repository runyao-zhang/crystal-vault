// 卡片 frontmatter 与正文的读与改。纯函数，不碰宿主、不碰 DOM。
//
// 为什么自己写而不是用 app.fileManager.processFrontMatter：那个 API 会把整个 YAML 块
// 重新序列化——行内列表可能变成块列表、键序可能被重排、注释直接丢。库里的 29 张卡
// frontmatter 长得一模一样（只有 概念 / 来源 / tags 三个键、全是行内式、无引号），
// 走它等于把「改了一个字段」变成「整块 YAML 重写」：git 里是一大片假 diff，
// 回滚时看不出到底改了什么。
//
// 所以这里走外科手术：只动改了的那个键所在的行，其余字节原样保留。
// 代价是值怎么加引号得自己负责（见 encodeScalar）——这是有意的取舍，
// 用「规则简单 + 单测兜底」换「diff 干净」。
//
// ⚠️ 本文件的注释里不能出现 fenced code block（三连反引号打头的行），
// 否则 build 出来的 bundle 会截断 vault 里那圈 dataviewjs 围栏，land 直接中止。

import { toStr } from "./dom.js";

// 开围栏必须自己占一行；中间那段允许为空（空的 frontmatter 块是合法的）。
// 闭合行后跟换行或文件尾都算。
const FM_RE = /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

// 块列表项（YAML 的「- 值」换行写法）。库里现在没有，但改到一张有的卡时
// 不能只换掉键那一行、把列表项留在原地——那会变成语法错乱的孤儿行。
const BLOCK_ITEM_RE = /^[ \t]+-[ \t]/;

/**
 * 把一篇笔记拆成 frontmatter 块与正文。**fmBlock + body === raw**，一字节不丢。
 *
 * 与 adapter.js 的 splitFrontmatter 的分工：那个是给渲染用的（只要正文、还 trim），
 * 这个是给改写用的（两边都要留全，改写完要能拼回原样）。
 *
 * @returns {{fmBlock: string, body: string}} 没有 frontmatter 时 fmBlock 是空串
 */
export function splitCard(raw) {
  const s = String(raw == null ? "" : raw);
  const m = FM_RE.exec(s);
  if (!m) return { fmBlock: "", body: s };
  return { fmBlock: m[0], body: s.slice(m[0].length) };
}

// 开头连续的「空行」：只含空白字符、后跟换行。整段原样抓下来，写回时原样接回去。
const BLANK_LINE_RE = /^(?:[ \t]*\r?\n)+/;

/** 正文开头那几行空白。真库 29 张有 frontmatter 的卡，这一段恰好都是单个换行。 */
export function bodyPrefix(body) {
  const m = BLANK_LINE_RE.exec(toStr(body));
  return m ? m[0] : "";
}

/**
 * 正文去掉开头的空白行——**给 textarea 显示用**。
 *
 * 真库的正文都以 `\n` 开头（frontmatter 闭合行之后那个空行），直接塞进 textarea
 * 会让第一行是空的。剥掉它显示，保存时再由 patchBody 把原样的前缀接回去，
 * 所以没动过正文时文件逐字节不变。前缀行因此在界面上不可见、也删不掉——
 * 想在正文最前面多留一个空行做不到，这是有意的取舍。
 */
export function stripBodyPrefix(body) {
  const b = toStr(body);
  return b.slice(bodyPrefix(b).length);
}

/**
 * 用新正文替换全文里的正文。frontmatter 块与正文前缀都按**原字节**保留。
 *
 * `newBody === undefined` 时原样返回——「没碰正文」与「把正文清空」必须分开，
 * 混起来的代价是一次误传就把一张三个字的卡清空（库里真有这种卡）。
 * 要对齐 patchFrontmatter 的同一条约定。
 *
 * @param {string} raw      原全文（也可以是 patchFrontmatter 的结果）
 * @param {string} newBody  新正文，**不含开头空行前缀**；可以不 trim
 */
export function patchBody(raw, newBody) {
  const src = String(raw == null ? "" : raw);
  if (newBody === undefined) return src;
  const { fmBlock, body } = splitCard(src);
  const pre = bodyPrefix(body);
  return fmBlock + pre + restoreEol(toStr(newBody), body);
}

/**
 * 把正文里的几段 `[[…]]` 挖掉（3.0 刀 16）。
 *
 * 这是整个库里**唯一会吃掉用户手写文字**的函数，所以它单独一个纯函数、配 node 级
 * 单测，不靠端到端兜。
 *
 * ⚠️ **调用方把结果拼成 `fmBlock + text`，不要走 patchBody。** patchBody 会把
 * **原样**的正文前缀接回去，而链接被挖掉之后，写模式 ADD 加的那两行分隔换行就
 * 落进了"前缀"区间——接回去等于凭空多留一行，文件跟写之前对不上。
 * `splitCard` 保证 `fmBlock + body === raw`，所以"换掉正文那一段"精确地就是
 * `fmBlock + 新正文`，行尾也自然原样保留。
 *
 * ⚠️ `spans` 的偏移必须是在**同一个串**上算出来的（`parseLinks(body)` 的输出）。
 * 在一个串上算、在另一个串上切，症状是"删掉了旁边的几个字"——不报错，而且
 * 直接写进笔记。
 *
 * @param {string} body  正文，**含开头空行前缀**（就是 splitCard 给的那个 body）
 * @param {{start:number,end:number}[]} spans
 * @returns {{text: string, removed: number, ateLines: boolean}}
 *   `ateLines` = 有切口是**连整行带走的**，调用方据此决定要不要说明
 *   "链后面跟着的那半句也一起没了"。
 */
export function cutLinkSpans(body, spans) {
  const src = toStr(body);
  const list = (Array.isArray(spans) ? spans : [])
    .filter(
      (s) =>
        s &&
        Number.isFinite(s.start) &&
        Number.isFinite(s.end) &&
        s.start >= 0 &&
        s.end > s.start &&
        s.end <= src.length
    )
    .map((s) => ({ start: s.start, end: s.end }))
    .sort((a, b) => a.start - b.start);
  if (!list.length) return { text: src, removed: 0, ateLines: false };

  const cuts = [];
  let ateLines = false;

  for (const s of list) {
    // 这一行：行首 = 本段之前最后一个 \n 之后；行尾 = 本段之后第一个 \n（不含）
    const ls = src.lastIndexOf("\n", s.start - 1) + 1;
    let le = src.indexOf("\n", s.end);
    if (le < 0) le = src.length;
    const before = src.slice(ls, s.start);
    const after = src.slice(s.end, le);

    // R1 —— **整行**：这一行除了链接什么都没有（前面允许留空白或列表符号，
    // 不然 `- [[B]]` 会留下一个光秃秃的 `-`）。
    if (/^[ \t]*(?:[-*+>]|\d+\.)?[ \t]*$/.test(before) && after.trim() === "") {
      ateLines = true;
      cuts.push({ start: twoNewlinesBefore(src, s.start, ls), end: le < src.length ? le + 1 : le });
      continue;
    }

    // R2 —— **夹在句子里**：只挖链接本身，顺手吃掉紧邻的一个空格。
    // **绝不动 `\n`**：那一行的换行是用户排的版，不是我们加的。
    let a = s.start;
    let b = s.end;
    if (src[a - 1] === " " || src[a - 1] === "\t") a--;
    else if (src[b] === " " || src[b] === "\t") b++;
    cuts.push({ start: a, end: b });
  }

  // R0 —— 先合并相交/相邻的区间，再**从后往前**切。顺序反过来的话，切掉前面
  // 那一段之后，后面那些偏移就全错位了。
  cuts.sort((x, y) => x.start - y.start);
  const merged = [];
  for (const c of cuts) {
    const last = merged[merged.length - 1];
    if (last && c.start <= last.end) last.end = Math.max(last.end, c.end);
    else merged.push({ start: c.start, end: c.end });
  }
  let text = src;
  for (let i = merged.length - 1; i >= 0; i--) {
    text = text.slice(0, merged[i].start) + text.slice(merged[i].end);
  }
  return { text, removed: list.length, ateLines };
}

/**
 * 链接前面正压着的两个换行 —— 写模式 ADD 的分隔（`"\n\n" + link + "\n"`）。
 *
 * 返回那两个换行的起点；不是正好两个就退回 `ls`（这一行的行首），只切这一行。
 *
 * **为什么必须数得这么死**：ADD 的 `"\n\n"` 里有一个换行可能是**替正文补的**
 * ——正文本来没有结尾换行时（`"正文"`），加完是 `"正文\n\n[[B]]\n"`，要还原成
 * `"正文"` 就得从第一个换行起切。而正文本来就有结尾换行时（`"正文\n"`），
 * 加完是 `"正文\n\n\n[[B]]\n"`，得从第三个换行起切——那里正好也是"链接前两个换行"。
 * 两条路都落在这一个判据上，多吞一个少吞一个都会在文件里留下一行差。
 *
 * CRLF 的卡上，`restoreEol` 会把 ADD 那两个 LF 变成 `\r\n`，所以按"换行单元"
 * （`\n` 或 `\r\n`）数，不按字符数。
 */
function twoNewlinesBefore(src, at, fallback) {
  let i = at;
  for (let n = 0; n < 2; n++) {
    if (i > 0 && src[i - 1] === "\n") i--;
    else return fallback;
    if (i > 0 && src[i - 1] === "\r") i--;
  }
  return i;
}

/** 行尾归一成 LF。textarea 的取值/赋值都只认 LF，比较与显示前都得先过这一步。 */
export function normalizeEol(text) {
  return toStr(text).replace(/\r\n|\r/g, "\n");
}

/**
 * 把 textarea 给的 LF 文本按源正文的行尾风格还回去。
 *
 * 必须做这一步：`textarea.value` 赋值与读取都会把 CR 归一成 LF（规范如此），
 * 不还回去的话，编辑一张 CRLF 的卡哪怕只改一个字，整篇的行尾都会翻成 LF——
 * git 里就是「全文重写」。真库 31 张现在全是 LF，这条是防将来。
 */
export function restoreEol(text, srcBody) {
  if (!/\r\n/.test(toStr(srcBody))) return text;
  return text.replace(/\r\n|\r/g, "\n").replace(/\n/g, "\r\n");
}

/**
 * 按补丁改写 frontmatter，返回新的全文。**没改的字节一字节不动**。
 *
 * patch 里值为 undefined 的键会被跳过（「没碰这个字段」与「把它清空」是两件事：
 * 清空要显式传空串，那时字段会被写成空值而不是被删掉——删字段不在本轮范围）。
 *
 * @param {string} raw   原全文
 * @param {object} patch 形如 { 概念: "...", 来源: "...", tags: ["a","b"] }
 * @returns {string} 新全文；patch 为空时原样返回
 */
export function patchFrontmatter(raw, patch) {
  const src = String(raw == null ? "" : raw);
  const p = patch || {};
  const keys = Object.keys(p).filter((k) => p[k] !== undefined);
  if (!keys.length) return src;

  const { fmBlock, body } = splitCard(src);
  // 行尾风格跟着原文件走：库里 30 张全是 LF，但别把一张 CRLF 的卡改成混合行尾
  const nl = /\r\n/.test(fmBlock || src) ? "\r\n" : "\n";

  if (!fmBlock) {
    // 没有 frontmatter 的卡（库里的「123.md」就是）：新建一个块，正文原样接在后面
    const made = keys.map((k) => k + ": " + encodeValue(p[k]));
    return "---" + nl + made.join(nl) + nl + "---" + nl + body;
  }

  const lines = innerLines(fmBlock);
  for (const key of keys) {
    const at = findKey(lines, key);
    const text = key + ": " + encodeValue(p[key]);
    if (at < 0) lines.push(text);
    else lines.splice(at, blockEnd(lines, at) - at, text);
  }
  return "---" + nl + lines.join(nl) + nl + "---" + nl + body;
}

/**
 * 拼一张**新卡**的全文（3.0 刀 6「边看边记」）。
 *
 * 复用 patchFrontmatter 那条「空文件 + 补丁」的路，而不是自己拼几行 YAML：
 * 这里是本仓**唯一**决定「一个值怎么写进 YAML」的地方（encodeValue / encodeScalar
 * 那一套引号规则）。新建另写一遍的话，同一份规则就有了两个实现，而它们漂移起来
 * 是静默的——只在某个值恰好需要引号（概念里带个冒号、来源是个纯数字）时才看得出来。
 *
 * 排版跟库里现有那 30 张卡对齐：frontmatter 与正文之间恰好一个空行，末尾恰好一个换行。
 *
 * @param {{概念?: string, 来源?: string, tags?: string[], body?: string}} spec
 * @returns {string} 全文
 */
export function composeCard(spec = {}) {
  const fields = {};
  if (spec.概念 !== undefined) fields.概念 = spec.概念;
  if (spec.来源 !== undefined) fields.来源 = spec.来源;
  if (spec.tags !== undefined) fields.tags = spec.tags;

  const text = toStr(spec.body).replace(/^\s*\n/, "").replace(/\s+$/, "");
  // 一个字段都没给：patchFrontmatter 原样返回空串（它把「补丁是空的」当成
  // 「这次不打算改 frontmatter」）。那就写成一张没有 frontmatter 的卡——
  // 库里本来就有这种卡，硬补一个空的 `---/---` 只会多出一段什么都不说的话。
  const fm = patchFrontmatter("", fields);
  if (!fm) return text ? text + "\n" : "";
  return text ? fm + "\n" + text + "\n" : fm;
}

/** 剥掉开闭围栏，拿到中间那几行。空块返回空数组。 */
function innerLines(fmBlock) {
  const inner = fmBlock
    .replace(/^---[ \t]*\r?\n/, "")
    .replace(/\r?\n---[ \t]*(?:\r?\n)?$/, "");
  return inner === "" ? [] : inner.split(/\r?\n/);
}

/** 找某个顶层键的行号。键名按字面量转义，免得将来有人加个带 . 的键名就串了。 */
function findKey(lines, key) {
  const re = new RegExp("^" + escapeRe(key) + "[ \t]*:");
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i;
  }
  return -1;
}

/** 从键那一行往下，把属于它的块列表项一起吃掉；返回下一个键的位置。 */
function blockEnd(lines, at) {
  let i = at + 1;
  while (i < lines.length && BLOCK_ITEM_RE.test(lines[i])) i++;
  return i;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 3.0 刀 34：**明确要写成数字**的值。
 *
 * 下面 `mustQuote` 那条「数字形状一律加引号」是给**字符串字段**立的规矩
 * （`概念: 2026` 不加引号，Dataview 读回来就成 number 了）。但有些字段天生
 * 就是数字——比如卡片坐标。不给出路的话它会被写成 `["5", "9"]`：
 * 读得回来，但那是**一串字符串**，语义上就不对，而且难看。
 *
 * 用法：`{ 晶体坐标: [asNumber(3), asNumber(5)] }`。
 * ⚠️ 只对**我们自己确定是数字**的值用。默认那条"偏保守往引号靠"的规矩别动——
 * 它的注释写着「多引号永远只是难看，少引号是**读错**」，那是对的。
 */
const NUM_TAG = Symbol("yamlNumber");
export const asNumber = (n) => ({ [NUM_TAG]: Number(n) });

/** 按值的形状选编码：数组走行内流式列表，其余走标量。 */
export function encodeValue(v) {
  if (Array.isArray(v)) {
    return "[" + v.map((x) => encodeScalar(x)).join(", ") + "]";
  }
  return encodeScalar(v);
}

// 这些形状不加引号会被 YAML 读成别的东西。注意：多引号永远只是难看，少引号是**读错**，
// 所以判不准的一律偏保守往引号那边靠。
const NUMBER_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const BOOLISH_RE = /^(true|false|null|~|yes|no|on|off)$/i;
// 日期必须**整串**都是日期才加引号。YAML 的时间戳类型是全串匹配的，
// 「2026-09-03 一天半打通跨设备同步」这种开头像日期、后面还有正文的值，
// 本来就稳稳地是字符串——按「开头像」就加引号的话，成就线那 5 张卡每次保存
// 都会平白多出一对引号，而这正是本模块要避免的那种噪音。
// `T` 与「空格+时刻」两种时间戳写法仍然要挡（它们真的会被读成日期对象）。
const DATEISH_RE = /^\d{4}-\d{2}-\d{2}([Tt]| \d{2}:\d{2}|$)/;
// 行首的 YAML 指示符。`-` 只有后跟空格才是列表项，但这里一律当敏感——
// 引号不改变读回来的字符串，少引号会。
const LEADING_RE = /^[-?:,[\]{}#&*!|>%@'"`]/;

/**
 * 把一个值编码成 YAML 标量，必要时加双引号。
 *
 * 库里现有 30 个值全部命中「不需要引号」那一支，所以正常改一个字段，
 * 写回去的那一行跟原来长得一模一样。
 */
export function encodeScalar(v) {
  // 3.0 刀 34：被 `asNumber` 标过的值**裸写**（见那个函数的注释）。
  // 排在 `toStr` 前面——它的值是个对象，转成字符串就成了 "[object Object]"。
  if (v && typeof v === "object" && NUM_TAG in v) {
    const n = Number(v[NUM_TAG]);
    return Number.isFinite(n) ? String(n) : "0";
  }
  const s = toStr(v);
  if (!mustQuote(s)) return s;
  return (
    '"' +
    s
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n") +
    '"'
  );
}

function mustQuote(s) {
  if (s === "") return true; // 空值裸写会变成 null，读回来是 undefined 不是空串
  if (/^\s|\s$/.test(s)) return true; // 首尾空白会被 YAML 吃掉
  if (/[\n\r]/.test(s)) return true; // 单行写法放不下换行
  if (s.indexOf(": ") >= 0 || /:$/.test(s)) return true; // 会被当成嵌套映射
  if (/\s#/.test(s)) return true; // 会被当成注释开头
  if (LEADING_RE.test(s)) return true;
  if (NUMBER_RE.test(s)) return true; // 概念写成 "2026" 就成了数字，Dataview 读回来是 number
  if (BOOLISH_RE.test(s)) return true;
  if (DATEISH_RE.test(s)) return true; // "2026-08-26" 会被解析成日期对象
  return false;
}

// ============================================================
// 连线接法（3.0 刀 46，用户 10-01）
// ============================================================
//
// **卡片亲手设过的「这根线从哪条边出去」，写进它自己的 frontmatter。**
//
// ---- 为什么非得进文件 ----
//
// 用户要把一颗晶体压缩发给别人（他拿这个在卖），对方打开之后线全变成左右。
// 原来那份接法存在**本机视图状态**里（`view.linkSides`），而且有两层都不成立：
//   · 键是**用户当时站在哪一层**（晶体路径）——换个文件夹，键就对不上；
//   · 那份状态**每台机器各存各的**——朋友电脑上一开始就是空的。
// 存进卡片自己身上之后：改名、搬到别的文件夹、压缩发走，都带着走。
//
// ---- 一条长什么样 ----
//
//     "[[02-中继]] b t"     从我这边的「下」出去，进它那边的「上」
//
// 方向字母 t/r/b/l（上下右左）。**用字母不用汉字**：中文一个字 3 字节，
// 字母 1 字节，一条省 4 字节，而这是要塞进每张卡 frontmatter 的东西。
//
// ⚠️ **目标故意写成 `[[双链]]` 的形状，不是裸标题。** Obsidian 改名时会把
//    `[[…]]` 一起改掉（正文里的本来就会改，frontmatter 里的它同样认）；
//    写成裸标题的话，对方（或你自己）给那张卡改名之后，这一条就永远失联。
//
// ⚠️ 解析器**只此一份**，模型 / 真适配层 / 假适配层三处都调它。
//    这和 `晶体坐标` 那条路不一样——那边 `posOf` / `posPair` 抄了两遍（各端
//    "同一条口径"），多一处抄写就多一处漂移的机会。这里不重复那个取舍。
export const SIDES_FIELD = "晶体接法";

/**
 * 方向：**方位名与字母，两张表按下标一一对应。**
 *
 * ⚠️ **这里现在是唯一的真源。** `storyline.js` 的 `LINK_SIDES` 改成了
 * `= SIDE_NAMES`（照样 export，免得动到老调用方），`viewstate.js` 那份校验
 * 白名单同理。
 *
 * 为什么非要收成一份：这两张表**错开一格**的坏法是"线从别的边出去"——不报错、
 * 也不是没生效，只是接错了地方。而它已经有前科：写这一刀的时候，迁移那条路把
 * 「bottom」这个**方位名**当**字母**传了进去，`formatSideEntry` 认不出就退回
 * 默认的 `r l`，于是**写进用户卡片的是错的方向**（探针逮住的）。
 * 三份拷贝各自写着"顺序一致"是靠不住的，靠的该是同一个数组。
 */
export const SIDE_NAMES = ["top", "right", "bottom", "left"];
export const SIDE_KEYS = ["t", "r", "b", "l"];

/** 方位名 → 字母；认不出回空串（调用方自己决定兜底成什么）。 */
export const sideLetter = (name) => SIDE_KEYS[SIDE_NAMES.indexOf(toStr(name))] || "";

/** 字母 → 方位名；认不出回空串。 */
export const sideName = (letter) => SIDE_NAMES[SIDE_KEYS.indexOf(toStr(letter))] || "";

/** `{title, mine, its}` → 那一条字符串。给不出合法方向时按「右出左进」兜底。 */
export function formatSideEntry(e) {
  if (!e || !e.title) return "";
  const m = SIDE_KEYS.indexOf(e.mine) >= 0 ? e.mine : "r";
  const i = SIDE_KEYS.indexOf(e.its) >= 0 ? e.its : "l";
  return "[[" + String(e.title) + "]] " + m + " " + i;
}

/**
 * frontmatter 里那个字段 → `[{title, mine, its}]`。
 *
 * 吃两种形状：真适配层给的是 YAML 解出来的**数组**，假适配层给的是那一行的
 * **原始文本**（`["[[a]] b t"]`）——由 `decodeFlowList` 拆开。
 * **形状不对的条目逐条丢掉**（不整条作废）：一条写坏了不该把整张卡的接法清空。
 */
export function parseSidesField(raw) {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? decodeFlowList(raw)
      : null;
  if (!list) return [];
  const out = [];
  for (const item of list) {
    // ⚠️ **已经是对象的那一条直接收**——这个函数会被调**两道**：适配层先解一次
    //    （`entry-obsidian` / `fake` 都解），`normalizeCard` 再解一次。
    //    不认这一支的话，第二道里 `toStr({title,mine,its})` 是 "[object Object]"，
    //    正则一条都不匹配，于是**整张表的接法被静默清空**：文件里白纸黑字写着，
    //    模型里永远是空的，不报错、屏幕上只是"接法又变回自动的了"。
    //    （写这一刀时正是它让可移植性探针红着——字段写对了，读回来是空。）
    //    做成幂等还有一个好处：调用方不必先问"我手上这份解过了没有"。
    if (item && typeof item === "object") {
      const title = toStr(item.title).trim();
      const mine = toStr(item.mine);
      const its = toStr(item.its);
      if (!title || SIDE_KEYS.indexOf(mine) < 0 || SIDE_KEYS.indexOf(its) < 0) continue;
      out.push({ title, mine, its });
      continue;
    }
    const m = /^\[\[(.+?)\]\]\s*([trbl])\s*([trbl])$/.exec(toStr(item).trim());
    if (!m) continue;
    const title = m[1].trim();
    if (!title) continue;
    out.push({ title, mine: m[2], its: m[3] });
  }
  return out;
}

/**
 * 拆一个 YAML **行内流式列表**：`["a", "b"]` → `["a", "b"]`。
 *
 * 为什么不能直接 `split(",")`：标题里可以带逗号（「01-总览，绪论」），而条目
 * 一律是带引号的——所以按**引号状态**扫一遍，引号里的逗号不算分隔符。
 * 转义（`\"` 与 `\`）也要认，那是 `encodeScalar` 写出去的形式。
 */
export function decodeFlowList(s) {
  const t = toStr(s).trim();
  if (!/^\[.*\]$/.test(t)) return [];
  const body = t.slice(1, -1);
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (q) {
      if (ch === "\\") {
        cur += body[++i] || "";
        continue;
      }
      if (ch === '"') {
        q = false;
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === '"') {
      q = true;
      continue;
    }
    if (ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
