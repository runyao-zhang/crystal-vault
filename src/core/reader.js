// 3.0 刀 6：文献阅读器 —— 多页同屏 + 边看边记。
//
// 它是一个**顶层浮层**，不是 `state.stage` 的第五个值。理由很硬：stage 那四档
// 说的是「晶体库内部现在是什么看法」，而阅读器与晶体层级毫无关系——它在读写
// 一个和晶体树平行的东西（文献文件）。塞进去会凭空造出「故事线 + 阅读器」
// 这种没有意义的格子，每个格子都是一条要写测试、要写退出路径的状态。
//
// 三件事在这里定死：
//
//   1. **一屏 N 页，不上下翻。** N 由 `computeGrid` 算——纯函数，进的是视口尺寸
//      和页宽，出的是行列数与每页像素尺寸。不给 CSS 的 auto-fill 去算，是因为
//      「现在第几屏、还有没有下一页」必须是个确定的数，而 `auto-fill` 的结果
//      要等布局完才量得到，那是一个「先渲染再问浏览器」的循环。
//   2. **三种输入走同一套骨架。** PDF / 图片 / markdown 各自把自己包成一个
//      `source`（见 openDoc），阅读器只认 `source.pages / ratio / mount`。
//      加第四种输入时不用碰翻页、缩放、网格这一整套。
//   3. **渲染 PDF 的能力由外面递进来**（mount 参数的 pdfRenderer），
//      不 import pdf.js。测不了的那一层必须尽小——理由见 pdfdoc.js 开头。
//
// pptx 收不进来，也不打算收：Obsidian 和 pdf.js 都渲染不了它。用户得自己
// 导出成 PDF 或每页一张图（3.0 路线图里写明了，别在这里偷偷试）。

import { EL, esc, toStr } from "./dom.js";
import { composeCard, patchBody, splitCard, stripBodyPrefix } from "./frontmatter.js";
import { splitSegments, applyCardFields } from "./model.js";
// 卡片盒与「将建在」那个选择器都复用首页「文件夹」面板那棵树——同一份画法、
// 同一套点击分流、同一个筛选。用户点名要的就是这个「复用」。
import { treeHtml, readPick, filterTree, countCards, countNodes } from "./treepanel.js";
// 「故事线」那颗按钮要落进某颗晶体，走的就是首页「文件夹」面板点一颗晶体那条路
// （folders.js 的 onFolderPanelClick 调的也是它），两个入口进去的样子才一致。
// 不成环：crystals.js 不 import reader.js，只有 app.js 引它。
import { restoreExpanded } from "./crystals.js";
import { findFloat, openFloat, closeFloat } from "./floatwin.js";
import { layoutTextLayer } from "./textlayer.js";
import { sanitizeDesk } from "./prefs.js";
import { applyPageZoom, bindPageZoom } from "./pagezoom.js";
import {
  applyDeskBox,
  bindDeskDrag,
  clampBox,
  clampRatioBox,
  defaultDeskBox,
  paginateLines,
  sliceLines,
  splitBlocks,
  patchLines,
  DESK_PER_PAGE,
} from "./desk.js";
import { createEmbedStory } from "./embedstory.js";

// 页面尺寸那几档。改这些数会连带改掉「一屏摆几页」，所以集中放这儿，
// 别散在 computeGrid 和样式表两处各写一个。
export const READER_GAP = 14; // 页与页之间的缝
export const READER_PAD = 18; // 页区四周的内边距
export const READER_HEAD = 22; // 每页上面那行「第 N 页」占的高度
export const READER_BASE_W = 360; // 100% 时一页有多宽
export const READER_MIN_W = 150;
export const READER_MAX_W = 900;
// 一屏最多摆这么多页。**这不是性能上限，是可读性上限**：1440 宽的屏按 150px
// 一页能排出 8 列 × 3 行 = 24 张邮票，那不叫「多页同屏」，叫「什么都看不清」。
export const READER_MAX_PER = 12;
/** 桌面窗标题栏的高度，与 `.kb-v13-desk-bar` 的 CSS 一致。
 *  算「内容盒该多高才能让这一页正好铺满」时要减掉它——算错这一条的表现是
 *  **每一页都差 30px**，看着像页被压扁了一点点。 */
export const DESK_BAR_H = 30;
/**
 * 桌面窗「外框 − 内容盒」的那一圈：两条 1px 边框，纵向再加一条标题栏。
 * 全库 `box-sizing:border-box`，所以 `applyDeskBox` 写进去的宽高**含边框**，
 * 而 `ratio` 说的是内容盒——两者之间就差这一圈。
 */
export const DESK_CHROME = { x: 2, y: 2 + DESK_BAR_H };
// 图片和 markdown 没有「页」的概念，给个 A4 竖版的默认比例兜底。
// PDF 用第一页的真实比例（见 openDoc）。
export const DEFAULT_RATIO = 1.414;
const RATIO_MIN = 0.25;
const RATIO_MAX = 4;

/**
 * 一屏摆得下几页。
 *
 * 纯函数、只吃数字——所以「窗口 1440×900、页宽 360、A4 比例」会摆成几行几列
 * 这件事是可以直接断言的，不必先渲染再看。
 *
 * @param {{vw:number, vh:number, pageW:number, ratio:number,
 *          gap?:number, pad?:number, maxPer?:number}} spec
 *   ratio 是**高/宽**（A4 竖版 ≈ 1.414），不是宽/高。
 * @returns {{cols:number, rows:number, per:number, sheetW:number, sheetH:number}}
 */
export function computeGrid(spec = {}) {
  const gap = spec.gap == null ? READER_GAP : spec.gap;
  const pad = spec.pad == null ? READER_PAD : spec.pad;
  const maxPer = spec.maxPer == null ? READER_MAX_PER : spec.maxPer;

  const availW = Math.max(1, (Number(spec.vw) || 0) - pad * 2);
  const availH = Math.max(1, (Number(spec.vh) || 0) - pad * 2);
  const sheetW = Math.max(40, Math.round(Number(spec.pageW) || READER_BASE_W));
  const ratio = clampRatio(spec.ratio);
  const sheetH = Math.max(40, Math.round(sheetW * ratio)) + READER_HEAD;

  let cols = Math.max(1, Math.floor((availW + gap) / (sheetW + gap)));
  let rows = Math.max(1, Math.floor((availH + gap) / (sheetH + gap)));
  // 超了上限先砍行：横向是「一眼看到几页」的主观感，先留住。
  while (rows > 1 && cols * rows > maxPer) rows--;
  // 砍到只剩一行还是超（页特别小、屏特别宽时），再砍列。
  // 上限是**硬上限**——只砍行的话 13 列 × 1 行照样能过 12 这道线。
  if (cols > maxPer) cols = Math.max(1, maxPer);
  return { cols, rows, per: cols * rows, sheetW, sheetH };
}

function clampRatio(r) {
  const v = Number(r);
  if (!isFinite(v) || v <= 0) return DEFAULT_RATIO;
  return Math.min(RATIO_MAX, Math.max(RATIO_MIN, v));
}

/** 一共几屏。一页都没有也算一屏（空屏上放的是「这份文献读不了」那句话）。 */
export function screenCount(total, per) {
  if (!(total > 0) || !(per > 0)) return 1;
  return Math.ceil(total / per);
}

/**
 * 当前这一屏显示第几页到第几页（**1 基、闭区间**）。给人看的，也给翻页按钮判可用性用。
 */
export function pageRange(offset, per, total) {
  if (!(total > 0) || !(per > 0)) return { from: 0, to: 0 };
  const from = Math.min(total, Math.max(1, Math.floor(offset) + 1));
  const to = Math.min(total, Math.max(from, from + per - 1));
  return { from, to };
}

/** 把任意页码偏移吸附到屏边界，并夹进合法范围。翻页只有「整屏」这一档。 */
export function clampOffset(offset, per, total) {
  if (!(per > 0)) return 0;
  const last = (screenCount(total, per) - 1) * per;
  const snapped = Math.max(0, Math.floor(Math.max(0, offset) / per) * per);
  return Math.min(snapped, Math.max(0, last));
}

/**
 * 把用户输入的卡片名洗成一个能当文件名的串。
 *
 * 两道都要，理由不同：
 *   - **宿主禁用字符**：Windows 上 `\ / : * ? " < > |` 建文件直接失败，
 *     而失败信息是一句系统错误，用户看不懂自己做错了什么。提前洗掉，
 *     他顶多发现名字里少了那个符号。
 *   - **链接里会打架的字符**：`#` 是 Obsidian 双链的锚点分隔符、`^` 是块引用、
 *     `[` `]` 会截断链接文本。留着它们，这张卡建出来在别处写 `[[名字]]` 就解析不到——
 *     而那是最难查的一类问题（卡在，链不认）。
 *
 * **空名字返回空串**，由调用方去报「先给这张卡起个名字」——这里不替它编一个。
 */
export function safeFileName(name) {
  return toStr(name)
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/, "") // Windows 上结尾是点或空格的名字建不出来
    .slice(0, 80)
    .trim();
}

/** 路径最后一段 */
function baseName(path) {
  const parts = toStr(path).split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

/** 路径去掉最后一段 */
function parentOf(path) {
  const parts = toStr(path).split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

/** 显示用：`3.资产舱/知识卡片/文献` → `文献`；根目录 → 空串（由调用方兜底成「卡片根目录」） */
function shortFolder(folder) {
  const parts = toStr(folder).split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

/**
 * 在画布上盖一层**透明文字层**（3.0 刀 7）。
 *
 * 盖上去之后，浏览器原生的拖选与 Ctrl+C 就自己生效了——这一层里是**真文字**，
 * 只是 `color:transparent`。这是所有 PDF 阅读器的标准解：canvas 里没有字，只有像素，
 * 所以「选不中」是它的天性，只能另盖一层。
 *
 * @param {HTMLElement} box      页盒 `.kb-v13-reader-page`
 * @param {HTMLCanvasElement} canvas
 * @param {{items: Array, view: object}|null} text `handle.textItems()` 的返回
 * @param {number} pageIndex 1 基，打在 `data-page` 上，测试靠它认这一层是哪一页的
 */
function mountTextLayer(box, canvas, text, pageIndex) {
  if (!text || !text.items || !text.items.length) return;
  const { spans } = layoutTextLayer(text.items, text.view);
  if (!spans.length) return;

  // ⚠️ **canvas 的 rect 不是页盒的 rect。** 画布是被 flex 居中、而且被
  // `max-height:100%` 夹过的——页盒比它高的时候它上下都留着白。所以位置必须**量**，
  // 不能拿页盒当基准。再减 clientLeft/clientTop：页盒有 1px 边框，而绝对定位的
  // 原点是 padding box，不减的话整层会偏 1px（看不出来，但也没必要错）。
  const cr = canvas.getBoundingClientRect();
  const br = box.getBoundingClientRect();

  const layer = EL("div", "kb-v13-reader-textlayer");
  layer.dataset.page = String(pageIndex);
  layer.style.left = cr.left - br.left - box.clientLeft + "px";
  layer.style.top = cr.top - br.top - box.clientTop + "px";
  layer.style.width = cr.width + "px";
  layer.style.height = cr.height + "px";

  const made = [];
  for (const s of spans) {
    const el = EL("span", "kb-v13-reader-tl");
    el.textContent = s.text; // 不是 innerHTML：PDF 里什么字符都可能有
    el.style.left = s.left + "px";
    el.style.top = s.top + "px";
    el.style.fontSize = s.fontHeight + "px";
    layer.appendChild(el);
    made.push([el, s.wantWidth]);
    // 换行全指望它。少了它，拖过一整段粘出来是一长条。
    if (s.eol) layer.appendChild(EL("br"));
  }
  box.appendChild(layer);

  // 把每个 span 压成 PDF 里那个宽度（scaleX）。
  //
  // 不压的话：vault 里既没有 standard_fonts/ 也没有 cmaps/，pdf.js 画到 canvas 上的
  // 是**替换字体**，和这里 span 用的字体宽度对不上，于是拖选时高亮边界落在字与字之间
  // ——字是选对了，但看起来像选错。压完占位就和 PDF 自己的字宽一致。
  //
  // **先全部量完、再全部写**：量一次写一次会让浏览器每一轮都重新布局，
  // 一屏 12 页、每页十几项，就是上百次强制重排。
  const naturals = made.map(([el]) => el.getBoundingClientRect().width);
  made.forEach(([el, want], k) => {
    const natural = naturals[k];
    if (!want || !(natural > 0)) return;
    el.style.transform = "scaleX(" + want / natural + ")";
  });
}

/**
 * 建一个阅读器。
 *
 * @param {object} ctx  app.js 的挂载上下文（要 adapter / model / doc / win 和几个 refresh 钩子）
 * @param {object} opts
 * @param {HTMLElement} opts.el          浮层根节点（由 app.js 建好并挂在 body 上）
 * @param {object|null} opts.pdfRenderer 见 pdfdoc.js；宿主没有 PDF 能力时是 null
 */
export function createReader(ctx, opts = {}) {
  const doc = ctx.doc || document;
  const win = ctx.win || window;
  const adapter = ctx.adapter;
  const pdfRenderer = opts.pdfRenderer || null;
  // 样式由谁来放（见 app.js 的 mount）：插件形态下是仓库里的 styles.css，
  // 那结构窗那份也不能再自己注一份——同一个道理。
  const injectStyles = opts.injectStyles !== false;
  // 草稿纸落在哪儿（见 app.js 那段）。null = 宿主没给，那颗按钮整颗不出现。
  const scratchSpec = opts.scratch && opts.scratch.folder ? opts.scratch : null;
  const scratchPath = scratchSpec
    ? String(scratchSpec.folder).replace(/\/+$/, "") + "/" + (scratchSpec.name || "_") + ".md"
    : "";
  const el = opts.el;

  const st = {
    open: false,
    // 「开着的，但眼下收起来了」——从「故事线」那颗按钮切走时置上。
    // `open` 说的是「这份阅读器还在不在」，`hidden` 说的是「它露没露在屏幕上」。
    // 分开两个位的理由见 suspend()：切去故事线**不能**走 close()，那一趟会把
    // 开着的文献、桌面那几扇窗全放掉，回来就得重新开一遍——而用户要的正是
    // 「不用退出文献模式」。对外的 isOpen() 认的是「露没露」（`open && !hidden`），
    // 所以挂起时不拦截 Esc、也不影响关晶体库那一路。
    hidden: false,
    docs: [],
    filter: "",
    doc: null, // 当前打开的 Doc
    source: null, // 当前这份文献怎么翻、怎么画
    sourcePath: null, // 上面那份 source 属于哪个路径（关它的时候要按路径去问）
    // **网格与桌面共用的一张表**：文献路径 -> Promise<source>。
    // 分成两张的话，同一份 PDF 被网格和桌面各建一次 = 两个 pdf.js 文档、两个 worker。
    // 能混摆多份文献靠的就是它——一份文献一个 source，谁都不用了才关。
    sources: new Map(),
    offset: 0,
    zoom: 1,
    err: "",
    busy: false,
    gen: 0, // 每次重排 +1，用来丢掉过期的那次异步渲染
    grid: computeGrid({ vw: 0, vh: 0, pageW: READER_BASE_W, ratio: DEFAULT_RATIO }),
  };

  // ---- DOM ----
  el.innerHTML =
    '<div class="kb-v13-reader-bar">' +
    '<button type="button" class="kb-v13-reader-back" id="kb-reader-back" title="回到晶体库">‹ 返回</button>' +
    '<span class="kb-v13-reader-title" id="kb-reader-title">文献</span>' +
    '<span class="kb-v13-reader-count" id="kb-reader-count"></span>' +
    '<span class="kb-v13-reader-spacer"></span>' +
    '<button type="button" class="kb-v13-reader-pick" id="kb-reader-pick" title="换一份文献">换一份</button>' +
    // 3.0 刀 9-A：桌面。网格是「一屏摊开 N 页、位置由 computeGrid 算」，
    // 桌面是「一页一扇窗、位置由你说了算」。两套并存，这颗按钮切。
    '<button type="button" class="kb-v13-reader-nav" id="kb-reader-deskbtn" aria-pressed="false"' +
    ' title="桌面模式：一页一扇可拖、可缩的窗，摆法自己定">桌面</button>' +
    '<button type="button" class="kb-v13-reader-nav" id="kb-reader-addpage"' +
    ' title="把当前这份文献的下一页摆到桌面上">＋ 页</button>' +
    // 3.0 刀 9-B：卡片盒。旧卡片和正在读的这一页在哪儿碰头。
    '<button type="button" class="kb-v13-reader-nav" id="kb-reader-cardbox" aria-pressed="false"' +
    ' title="卡片盒：搜库里的卡片，点一张就摆到桌面上，并在那张卡里留一行指回这一页的链接">卡片盒</button>' +
    // 3.0 刀 9-C：故事线。读到一半想看看这件事在库里长什么样——不用退出文献、
    // 也不用重摆桌面。阅读器**收起来但不销毁**（suspend），切回来时开着的文献、
    // 桌面那几扇窗、页码缩放原样都在。反向那颗按钮不用新加：顶栏本来就常驻一颗
    // 「文献」（app.js 的 #kb-fs-reader），任何 stage 下都点得到，点它就 resume。
    // 3.0 刀 12 第二半「草稿纸」（用户 09-19）：读文献时手边那块用 Obsidian
    // 原生编辑器写的便签。**不是卡片**——它落在宿主指定的草稿纸文件夹里，
    // 不参与晶体库的关系图。宿主没给位置时这颗整颗不出现。
    (scratchSpec
      ? '<button type="button" class="kb-v13-reader-nav" id="kb-reader-scratch"' +
        ' title="草稿纸：一块用 Obsidian 原生编辑器写的便签，不建成卡片。">草稿纸</button>'
      : '') +
    '<button type="button" class="kb-v13-reader-nav" id="kb-reader-storyline"' +
    ' title="去看故事线：晶体库收在这块屏下面，阅读器原样留着，点顶栏「文献」就回来。">故事线</button>' +
    // 3.0 刀 9-D「结构窗」。和左边那颗「故事线」成对，但**结果是两件事**：
    // 那颗把你的桌面整个换掉，这颗只是在桌面上添一扇窗。用户 09-19 判的命名：
    // 两颗都用名词会分不清（而他点的这一下差别最大），所以这颗换个不相干的词。
    '<button type="button" class="kb-v13-reader-nav" id="kb-reader-storywin"' +
    ' title="在桌面上开一扇结构窗：读文献的同时看知识结构，不用切走。">结构窗</button>' +
    '<button type="button" class="kb-v13-reader-nav" id="kb-reader-prev" title="上一屏（← / ↑ / PageUp）">‹ 上一屏</button>' +
    '<button type="button" class="kb-v13-reader-nav" id="kb-reader-next" title="下一屏（→ / ↓ / PageDown）">下一屏 ›</button>' +
    '<button type="button" class="kb-v13-reader-zoom" id="kb-reader-zoomout" title="每页小一点，一屏摆更多">－</button>' +
    '<span class="kb-v13-reader-zoomval" id="kb-reader-zoomval">100%</span>' +
    '<button type="button" class="kb-v13-reader-zoom" id="kb-reader-zoomin" title="每页大一点">＋</button>' +
    "</div>" +
    '<div class="kb-v13-reader-main">' +
    '<div class="kb-v13-reader-sheets" id="kb-reader-sheets">' +
    '<div class="kb-v13-reader-grid" id="kb-reader-grid"></div>' +
    '<div class="kb-v13-reader-note" id="kb-reader-note"></div>' +
    "</div>" +
    // 桌面层（3.0 刀 9-A）：一页一扇窗，挂在这儿。
    //
    // ⚠️ **必须排在「边看边记」那一栏前面**——用户 09-17 反馈「边看边记应该在
    // 右边，不是在左边」。这一行是 flex：网格开着时是 [页区 flex:1][右栏 320]，
    // 桌面开着时页区 `display:none`——桌面要是排在右栏**后面**，剩下的就是
    // [右栏 320][桌面 flex:1]，那一栏当场跑到屏幕左边去。
    //
    // 排在选择器之前那条老约束仍然成立：选择器是铺在整个页区上的一层（换文献
    // 用的），它得盖住桌面，反过来的话换文献时那些窗会浮在选择器上面挡着。
    //
    // 它也在 `#kb-reader` 里面，而 `#kb-reader` 是 `position:fixed; z-index:10020`，
    // 自成一个层叠上下文——所以桌面上的窗压得住阅读器自己的内容，
    // 却又不会跑到 tooltip 上面去。
    '<div class="kb-v13-reader-desk" id="kb-reader-desk"></div>' +
    '<div class="kb-v13-reader-side" id="kb-reader-side">' +
    '<div class="kb-v13-reader-side-hd">边看边记</div>' +
    '<label class="kb-v13-reader-field"><span>卡片名</span>' +
    '<input type="text" id="kb-reader-name" placeholder="比如：抽样定理" autocomplete="off"></label>' +
    '<label class="kb-v13-reader-field"><span>概念</span>' +
    '<input type="text" id="kb-reader-concept" placeholder="一句话说清它是什么" autocomplete="off"></label>' +
    '<label class="kb-v13-reader-field"><span>来源</span>' +
    '<input type="text" id="kb-reader-source" autocomplete="off"></label>' +
    // ⚠️ 这一格是**故意**留着 `<textarea>` 的，不是漏了接 `mountEditor`
    // （3.0 刀 9 第三版，用户 09-17 拍板）。
    //
    // 宿主那个原生编辑器是**文件视图**——它必须挂在一个**真实存在的文件**上。
    // 而这一格背后是一张**还没建出来的卡**（名字、概念、正文都还只是表单里的值，
    // 点「存进晶体库」才落盘），没有文件可挂。宿主那边也没有「无文件的编辑器」
    // 这种东西：Obsidian 里要写一篇笔记，就是先建出那个文件。
    //
    // 所以两条路摆在用户面前过：①「新建」时就把卡建出来摆到桌面上、在原生编辑器
    // 里写（Obsidian 自己存盘，「存进晶体库」按钮退休）；②保持这个输入框。
    // 用户选了 ②——它是「随手记一笔」，本来就等于新建笔记，先有文件反而多一步。
    '<label class="kb-v13-reader-field kb-v13-reader-field-body"><span>正文</span>' +
    '<textarea id="kb-reader-body" placeholder="读到什么就记什么；双链直接写 [[]]"></textarea></label>' +
    // 「在编辑器里写」（3.0 刀 9 第三版）。用户 09-18 要的：正文那一格也用 Obsidian
    // 原生的 markdown 实时渲染编辑器。上面那段写着「没有文件可挂」——那是真的，
    // 所以这一颗按钮做的事就是**先把文件建出来**：用上面填的卡片名与概念/来源建一张
    // 空正文的卡，然后把正文那一格换成绑这张卡的宿主编辑器。
    //
    // 这一步之后**写盘归宿主**（它随编辑自动存盘），所以底下的「存进晶体库」跟着收起来
    // ——卡已经建出来了，再点一次只会报「已经有一张叫…的卡」。要记下一张，点「写下一张」。
    '<div class="kb-v13-reader-nativebar">' +
    '<button type="button" class="kb-v13-reader-nativeopen" id="kb-reader-nativeopen"' +
    ' title="按上面的卡片名先把这张卡建出来，正文改用 Obsidian 自己的编辑器写（边写边渲染、自动存盘）">✎ 在编辑器里写</button>' +
    '<button type="button" class="kb-v13-reader-nativeback" id="kb-reader-nativeback">写下一张</button>' +
    // 3.0 刀 12 第二半「返回」（用户 09-19）：**撤掉刚建出来的那张卡**，
    // 正文原封不动转进草稿纸。排在「写下一张」右边——两颗都是「离开这台编辑器」，
    // 但一颗是**继续**（卡留着）、一颗是**反悔**（卡删掉）。
    '<button type="button" class="kb-v13-reader-nativeback" id="kb-reader-nativereturn"' +
    ' title="撤掉刚建出来的这张卡（进回收站），正文转进草稿纸——一个字不丢。">返回</button>' +
    '</div>' +
    '<div class="kb-v13-reader-nativehost" id="kb-reader-nativehost"></div>' +
    // 草稿纸那条（3.0 刀 12 第二半）。与上面那条**共用 nativehost**——
    // 两者互斥（开着这个就开不了那个），共用一块地方最简单。
    // 起名那一步（用户 09-20）：草稿纸**不是**固定叫 `_`，是让用户起名的一张卡，
    // 落在「草稿纸」那颗晶体里。所以先摊开一个输入框，回车才开写。
    '<div class="kb-v13-reader-scratchform" id="kb-reader-scratchform">' +
    '<input type="text" id="kb-reader-scratch-name" placeholder="草稿纸名（= 一张卡）" autocomplete="off">' +
    '<button type="button" class="kb-v13-reader-scratchgo" id="kb-reader-scratch-go">写</button>' +
    '<button type="button" class="kb-v13-reader-scratchback" id="kb-reader-scratch-cancel">取消</button>' +
    '</div>' +
    // 「将建在」那一行（3.0 刀 9 第二版）。从前它是一句死文案「将建在：文献/xxx/」，
    // 卡只能长在文献自己那个文件夹里。用户要的是**自己挑一个文件夹**，
    // 而且挑的那个界面要复用首页「文件夹」面板那棵树。
    '<div class="kb-v13-reader-target">' +
    '<span class="kb-v13-reader-target-lab">将建在</span>' +
    '<button type="button" class="kb-v13-reader-target-pick" id="kb-reader-target"' +
    ' aria-expanded="false" title="挑一个文件夹；默认跟着文献所在的文件夹走"></button>' +
    "</div>" +
    '<div class="kb-v13-reader-folderpick" id="kb-reader-folderpick">' +
    // 这句抬头两档共用（见 folderPick.purpose）：挑建卡的文件夹 / 挑看故事线的晶体。
    // 文案由 openFolderPick 每次改写，别在 HTML 里写死。
    '<div class="kb-v13-reader-folderpick-hd" id="kb-reader-folderhd">存进哪个文件夹</div>' +
    '<input type="text" class="kb-v13-op-search" id="kb-reader-foldersearch"' +
    ' placeholder="搜文件夹" autocomplete="off" aria-label="搜文件夹">' +
    '<div class="kb-v13-op-body" id="kb-reader-folderbody"></div>' +
    "</div>" +
    '<button type="button" class="kb-v13-reader-save" id="kb-reader-save">存进晶体库</button>' +
    '<div class="kb-v13-reader-msg" id="kb-reader-msg"></div>' +
    // 新建晶体（3.0 刀 9 第三版）。读着文献当场开一颗新晶体装接下来的卡，
    // 不必先回晶体库、回文件管理器。**建在「将建在」那个文件夹里面**（用户 09-18 选的），
    // 所以它跟着上面那行走——想建哪里，先把「将建在」指到哪儿。
    '<div class="kb-v13-newcrystal" id="kb-reader-newcrystal">' +
    // 3.0 刀 12：新建在左、删除在右（用户 09-19 点名要的位置）。
    '<div class="kb-v13-newcrystal-row">' +
    '<button type="button" class="kb-v13-newcrystal-open" id="kb-reader-newcrystal-open">＋ 新建晶体</button>' +
    '<button type="button" class="kb-v13-newcrystal-del" id="kb-reader-crystaldel"' +
    ' title="删掉一颗晶体（连同里面的卡片）。走回收站——按你在「文件与链接 → 删除的文件」里选的那一档，能捡回来。">删除晶体</button>' +
    // 3.0 刀 12 第三版（用户 09-20）：「删除晶体」旁边加「删除卡片」。
    '<button type="button" class="kb-v13-newcrystal-del" id="kb-reader-carddel"' +
    ' title="删掉一张卡片（不碰它所在的那颗晶体）。同样走回收站。">删除卡片</button>' +
    '</div>' +
    '<div class="kb-v13-newcrystal-form" id="kb-reader-newcrystal-form">' +
    '<input type="text" id="kb-reader-newcrystal-name" placeholder="晶体名（= 一个文件夹）" autocomplete="off">' +
    '<button type="button" class="kb-v13-newcrystal-go" id="kb-reader-newcrystal-go">建</button>' +
    '<button type="button" class="kb-v13-newcrystal-cancel" id="kb-reader-newcrystal-cancel">取消</button>' +
    '</div>' +
    '<div class="kb-v13-newcrystal-msg" id="kb-reader-newcrystal-msg"></div>' +
    '</div>' +
    "</div>" +
    // 浮窗宿主（3.0 刀 9-B 卡片盒）。
    //
    // ⚠️ **必须挂在 `#kb-reader` 里面**，不能像别处那样用默认的 `ctx.overlay`。
    // 遮罩是 `position:fixed; z-index:9999`，它自成一个层叠上下文——窗在里面的 10050
    // 只在那个上下文里有意义，整体仍是 9999；而阅读器是 body 下 **10020 的兄弟**，
    // 后画的整个压住先画的。所以从阅读器里开在遮罩上的窗会被阅读器**整块盖住**，
    // 症状是「点了没反应」。挂进阅读器自己这一层就没有这回事。
    //
    // 它自己 `pointer-events:none`（否则 `inset:0` 会把阅读器的点击全吃掉），
    // 窗自己再打开。
    '<div class="kb-v13-reader-floats" id="kb-reader-floats"></div>' +
    // 藏 `openFloat` 要搬的那个节点。引擎要求 `unit` **已经连在文档上**
    // （它要 `home.insertBefore(slot, unit)`），所以得先有个家在。
    '<div class="kb-v13-reader-hold" id="kb-reader-hold"></div>' +
    // 文档选择器铺在页区上面（不是另开一屏）：它是「换一份」的动作，
    // 换完就消失，没必要为它做第二条导航路径。
    '<div class="kb-v13-reader-picker" id="kb-reader-picker">' +
    '<input type="text" class="kb-v13-reader-search" id="kb-reader-search" placeholder="搜文件名或文件夹" autocomplete="off">' +
    '<div class="kb-v13-reader-doclist" id="kb-reader-doclist"></div>' +
    "</div>" +
    "</div>";

  const $ = (id) => el.querySelector("#" + id);
  const gridEl = $("kb-reader-grid");
  const noteEl = $("kb-reader-note");
  const pickerEl = $("kb-reader-picker");
  const docListEl = $("kb-reader-doclist");
  const searchEl = $("kb-reader-search");
  const titleEl = $("kb-reader-title");
  const countEl = $("kb-reader-count");
  const msgEl = $("kb-reader-msg");
  const sideEl = $("kb-reader-side");
  const targetBtn = $("kb-reader-target");
  const folderSearch = $("kb-reader-foldersearch");
  const newCrystalBox = $("kb-reader-newcrystal");
  const newCrystalForm = $("kb-reader-newcrystal-form");
  const newCrystalName = $("kb-reader-newcrystal-name");
  const newCrystalMsg = $("kb-reader-newcrystal-msg");
  const nativeHost = $("kb-reader-nativehost");
  const nameEl = $("kb-reader-name");
  const conceptEl = $("kb-reader-concept");
  const sourceEl = $("kb-reader-source");
  const bodyEl = $("kb-reader-body");
  const prevBtn = $("kb-reader-prev");
  const nextBtn = $("kb-reader-next");
  const zoomIn = $("kb-reader-zoomin");
  const zoomOut = $("kb-reader-zoomout");
  const zoomVal = $("kb-reader-zoomval");
  const deskEl = $("kb-reader-desk");
  const deskBtn = $("kb-reader-deskbtn");
  const addPageBtn = $("kb-reader-addpage");
  const sheetsEl = $("kb-reader-sheets");
  const floatsEl = $("kb-reader-floats");
  const holdEl = $("kb-reader-hold");
  const cardBoxBtn = $("kb-reader-cardbox");
  const storyBtn = $("kb-reader-storyline");
  const storyWinBtn = $("kb-reader-storywin");
  const folderHd = $("kb-reader-folderhd");
  const scratchForm = $("kb-reader-scratchform");
  const scratchName = $("kb-reader-scratch-name");

  // ---- 尺寸 ----
  function pageWidth() {
    const w = READER_BASE_W * st.zoom;
    return Math.max(READER_MIN_W, Math.min(READER_MAX_W, Math.round(w)));
  }

  function relayout() {
    const r = $("kb-reader-sheets").getBoundingClientRect();
    st.grid = computeGrid({
      vw: r.width,
      vh: r.height,
      pageW: pageWidth(),
      ratio: st.source ? st.source.ratio : DEFAULT_RATIO,
    });
    st.offset = clampOffset(st.offset, st.grid.per, pageCount());
    renderSheets();
  }

  function pageCount() {
    return st.source ? st.source.pages : 0;
  }

  // ---- 画这一屏 ----
  function renderSheets() {
    const gen = ++st.gen;
    // 「这一发还算不算数」以**谓词**的形式交给 source，不再传一个数字。
    // 桌面上的页窗有**自己的**世代——网格重排一次不该把它的渲染判成过期，
    // 而 source 从一个数字里无从知道该跟谁比。见 buildSource 里 mount 的签名。
    const isStale = () => gen !== st.gen;
    const total = pageCount();
    const per = st.grid.per;
    const { from, to } = pageRange(st.offset, per, total);

    gridEl.style.width = st.grid.cols * st.grid.sheetW + (st.grid.cols - 1) * READER_GAP + "px";
    gridEl.style.gridTemplateColumns = "repeat(" + st.grid.cols + ", " + st.grid.sheetW + "px)";
    gridEl.style.gap = READER_GAP + "px";
    gridEl.textContent = "";

    // 情况说明（打不开 / 还没有文献 / 正在读）——它和页网格互斥
    noteEl.textContent = "";
    noteEl.classList.toggle("kb-v13-reader-note-on", !total);
    if (st.err) noteEl.textContent = st.err;
    else if (st.busy) noteEl.textContent = "正在打开…";
    else if (!st.doc) noteEl.textContent = "从上面选一份文献开始。";
    else if (!total) noteEl.textContent = "这份文献里没有可显示的内容。";

    if (!total) {
      refreshBar();
      return;
    }

    const pageH = st.grid.sheetH - READER_HEAD;
    for (let i = from; i <= to; i++) {
      const sheet = EL("div", "kb-v13-reader-sheet");
      sheet.dataset.page = String(i);
      sheet.style.width = st.grid.sheetW + "px";
      sheet.style.height = st.grid.sheetH + "px";
      const cap = EL("div", "kb-v13-reader-cap");
      cap.textContent = st.source.head(i);
      const box = EL("div", "kb-v13-reader-page");
      box.style.width = st.grid.sheetW + "px";
      box.style.height = pageH + "px";
      sheet.append(cap, box);
      gridEl.appendChild(sheet);
      // 每一页单独 try：第 7 页坏了不该把前 6 页一起没收
      Promise.resolve()
        .then(() => st.source.mount(i, box, isStale))
        .catch((e) => {
          if (isStale()) return;
          box.textContent = "这一页没画出来：" + ((e && e.message) || e);
          box.classList.add("kb-v13-reader-page-err");
        });
    }
    refreshBar();
  }

  function refreshBar() {
    const total = pageCount();
    const per = st.grid.per;
    const { from, to } = pageRange(st.offset, per, total);
    const screens = screenCount(total, per);
    const cur = total ? Math.floor(st.offset / per) + 1 : 0;

    titleEl.textContent = st.doc ? st.doc.name : "文献";
    countEl.textContent = total
      ? "第 " + from + "–" + to + " 页 / 共 " + total + " 页 · 第 " + cur + "/" + screens + " 屏"
      : "";
    // 按钮的可用性跟着**结果**走，不跟着「有没有下一页」猜：停用态是用户唯一
    // 能看出「到头了」的地方，而点了没反应是这个库里最不受欢迎的一种反馈。
    prevBtn.disabled = !total || st.offset <= 0;
    nextBtn.disabled = !total || st.offset + per >= total;
    zoomVal.textContent = Math.round(st.zoom * 100) + "%";
    zoomIn.disabled = st.zoom >= 3;
    zoomOut.disabled = st.zoom <= 0.4;
    paintTargetFolder();
    sideEl.classList.toggle("kb-v13-reader-side-off", !st.doc);
  }

  // ---- 翻页 ----
  function go(delta) {
    const per = st.grid.per;
    const next = clampOffset(st.offset + delta * per, per, pageCount());
    if (next === st.offset) return false;
    st.offset = next;
    renderSheets();
    return true;
  }

  function setZoom(z) {
    const v = Math.max(0.4, Math.min(3, Math.round(z * 100) / 100));
    if (v === st.zoom) return;
    st.zoom = v;
    // 缩放会改「一屏几页」，所以**页码偏移要重新吸附**，否则放大之后
    // 当前屏可能停在一个不是屏边界的页码上，翻一下会跳回去。
    const keep = st.offset;
    const perBefore = st.grid.per;
    const anchor = Math.floor(keep / perBefore) * perBefore;
    st.offset = anchor;
    relayout();
  }

  // ---- 文档清单 ----
  function visibleDocs() {
    const q = st.filter.trim().toLowerCase();
    const list = st.docs.slice().sort((a, b) => {
      const fa = toStr(a.folder);
      const fb = toStr(b.folder);
      if (fa !== fb) return fa < fb ? -1 : 1;
      const na = toStr(a.name);
      const nb = toStr(b.name);
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
    if (!q) return list;
    return list.filter(
      (d) => toStr(d.name).toLowerCase().includes(q) || toStr(d.folder).toLowerCase().includes(q)
    );
  }

  const KIND_LABEL = { pdf: "PDF", image: "图", markdown: "MD" };

  function renderPicker() {
    const list = visibleDocs();
    docListEl.textContent = "";
    if (!list.length) {
      const empty = EL("div", "kb-v13-reader-empty");
      empty.textContent = st.docs.length
        ? "没有匹配的文献。"
        : "卡片目录里没有 PDF / 图片 / markdown。把要读的文件放进去再回来。";
      docListEl.appendChild(empty);
      return;
    }
    let lastFolder = null;
    for (const d of list) {
      const folder = toStr(d.folder);
      if (folder !== lastFolder) {
        lastFolder = folder;
        const head = EL("div", "kb-v13-reader-group");
        head.textContent = shortFolder(folder) || "卡片根目录";
        docListEl.appendChild(head);
      }
      const btn = EL("button", "kb-v13-reader-doc");
      btn.type = "button";
      btn.dataset.path = d.path;
      const chip = EL("span", "kb-v13-reader-kind kb-v13-reader-kind-" + d.kind);
      chip.textContent = KIND_LABEL[d.kind] || "?";
      const nm = EL("span", "kb-v13-reader-docname");
      // textContent 不是 innerHTML：文件名可能是任何东西，而这里没有任何
      // 理由去解析它。
      nm.textContent = toStr(d.name);
      btn.append(chip, nm);
      docListEl.appendChild(btn);
    }
  }

  function showPicker() {
    pickerEl.classList.add("open");
    searchEl.focus();
  }

  function hidePicker() {
    pickerEl.classList.remove("open");
  }

  async function loadDocs() {
    let list = [];
    try {
      list = (await adapter.listDocs()) || [];
    } catch (e) {
      list = [];
    }
    // 只留三种认得出来的。宿主多给了别的类型（将来加了别的扩展名、
    // 或者实现回错了），在这里挡掉比在渲染时各判一次干净。
    st.docs = list.filter((d) => d && d.path && (d.kind === "pdf" || d.kind === "image" || d.kind === "markdown"));
    renderPicker();
  }

  // ---- 打开一份文献 ----
  //
  // source 的生命周期是**按路径**管的，不是按「网格那一份 / 桌面那几份」管的。
  // 理由很硬：同一份 PDF 只该有一个 pdf.js 文档和一个 worker。网格开着它、桌上又
  // 摆着它，那是**同一个 source 的两个消费者**，不是两份。
  //
  // 纪律：**先把「占用」撤掉，再调 releaseSource**。反过来的话它看到还有人占着，
  // 就会把该关的留着（网格那份 source 永远关不掉）。

  /** 拿出来源，没有就建一个。两处同时要同一份时只建一次（表里先放 promise）。 */
  async function ensureSource(d) {
    const hit = st.sources.get(d.path);
    if (hit) return hit;
    const p = buildSource(d);
    st.sources.set(d.path, p);
    try {
      return await p;
    } catch (e) {
      st.sources.delete(d.path); // 建失败就别把坏 promise 留在表里
      throw e;
    }
  }

  /** 网格不再看这一份了。 */
  function closeSource() {
    const path = st.sourcePath;
    st.source = null;
    st.sourcePath = null;
    st.gen++; // 掐掉还在路上的渲染
    if (path) releaseSource(path);
  }

  /**
   * 谁都不用了才真的关。
   *
   * ⚠️ 桌面那边（`desk.wins`）**不看** `st.doc`——它列的是**所有**窗，不是「当前那份」。
   * 只查当前 doc 的话，桌上还摆着这份文献的窗、网格切走，source 就被关掉了，
   * 那几扇窗会当场白屏。
   */
  function releaseSource(path) {
    if (!path) return;
    if (desk.wins.some((w) => w.path === path)) return; // 桌上还有窗指着它
    if (st.doc && st.doc.path === path) return; // 网格正开着它
    const p = st.sources.get(path);
    if (!p) return;
    st.sources.delete(path);
    try {
      Promise.resolve(p)
        .then((s) => s && s.close && s.close())
        .catch(() => {});
    } catch (e) {
      /* 收尾失败不影响别的窗 */
    }
  }

  async function buildSource(d) {
    if (d.kind === "image") {
      // 图片不读字节：走契约里的 assetUrl，宿主本来就有这条把路径变成
      // <img src> 的通路（卡片正文里的图就走它）。多绕一次 readBinary
      // 只是把同一份数据搬两遍。
      const url = adapter.assetUrl(d.path);
      return {
        pages: 1,
        ratio: DEFAULT_RATIO,
        head: () => d.name,
        mount(i, box) {
          const img = doc.createElement("img");
          img.className = "kb-v13-reader-img";
          img.alt = d.name;
          img.src = url;
          box.appendChild(img);
        },
      };
    }

    const bytes = await adapter.readBinary(d.path);
    if (!bytes) throw new Error("读不出这份文件的字节（" + d.path + "）");

    if (d.kind === "markdown") {
      // markdown 没有「页」。用现成的 `---div---` 分段当页——那是这个库里
      // 现成的「一屏一块」写法，卡片正文就是这么切的（model.js 的 splitSegments），
      // 不必为阅读器另发明一套分页语法。
      const text = typeof TextDecoder === "function" ? new TextDecoder().decode(bytes) : "";
      const segs = splitSegments(text);
      const pages = segs.length ? segs : [text];
      return {
        pages: pages.length,
        ratio: DEFAULT_RATIO,
        head: (i) => "第 " + i + " 段",
        mount: (i, box) => adapter.renderMarkdown(pages[i - 1] || "", box, d.path),
        // 全文原文。桌面上那一支按**行号区间**切页，切不出 `---div---` 那种分段——
        // 两套分页口径服务两套版式：网格按作者写好的分隔符，桌面按用户划的行。
        raw: text,
      };
    }

    // PDF
    if (!pdfRenderer) {
      throw new Error("这个宿主没有装 PDF 渲染能力（在 Obsidian 里才有）");
    }
    const handle = await pdfRenderer.open(bytes);
    let ratio = DEFAULT_RATIO;
    try {
      const first = await handle.size(1);
      if (first && first.w > 0) ratio = clampRatio(first.h / first.w);
    } catch (e) {
      /* 第一页量不出来就按 A4 排，能画的页照画 */
    }
    const dpr = Number(win.devicePixelRatio) || 1;
    return {
      pages: handle.pages,
      ratio,
      head: (i) => "第 " + i + " 页",
      // 单页尺寸（pt）。桌面上的页窗靠它把**窗**先摆成这一页的形状，
      // 再把页画进去——顺序反了画布就是按旧窗宽算的，画完再改窗会糊
      // （见 mountDeskWin）。网格那边不用它：那边的格子是 computeGrid 算的。
      size: (i) => handle.size(i),
      // `isStale()` 由调用方给：网格那一发比的是 `st.gen`，桌面上的页窗比的是
      // **它自己那一扇的世代**。两种调用方共用同一个 source，所以不能把判据写死。
      // ⚠️ mount **不幂等**：它无条件 append 一个 canvas。换页或改尺寸之前，
      // 调用方得自己把 box 清空（见 desk 那边）。
      async mount(i, box, isStale) {
        const canvas = doc.createElement("canvas");
        canvas.className = "kb-v13-reader-canvas";
        box.appendChild(canvas);
        const size = await handle.size(i);
        if (isStale()) return; // 用户已经翻页/换文档了，这一页白画
        // 画布按「页宽」铺满格子：网格已经算好了每页多宽多高，这里只负责
        // 把那一页缩放到这个宽度上。dpr 交给 pdfdoc 去乘。
        const scale = box.clientWidth > 0 ? box.clientWidth / size.w : 1;

        // 文字层（3.0 刀 7）。**必须在 render 之前取**——render 末尾会
        // `page.cleanup()`，没人保证之后再要文字还拿得到。它要的 scale 与画布
        // 是同一档（画布的 CSS 尺寸就是这一档），错开会整体错位且不报错。
        //
        // 取不到就**只是没有文字层**，这一页照画：文字层是加料，画布才是正事。
        // 与上面「ratio 量不出来就按 A4 排」是同一条兜底风格。
        let text = null;
        try {
          text = await handle.textItems(i, scale);
        } catch (e) {
          text = null;
        }
        if (isStale()) return;

        await handle.render(i, canvas, { scale, dpr });
        if (isStale()) return;
        mountTextLayer(box, canvas, text, i);
      },
      close: () => handle.close(),
    };
  }

  /**
   * 打开一份文献。
   *
   * 失败**不抛**：阅读器的失败要落在屏幕上那句人能读的话里（`st.err`），
   * 而不是变成调用方一个没人接的 rejection——对齐 loadViewState 那条
   * 「失败静默兜底」的既有风格。测试读 `err()` 就知道出了什么事。
   */
  async function openDoc(path) {
    let d = st.docs.find((x) => x.path === path) || null;
    // 清单还没读完就先补读一次（open() 是「先亮屏、再去读目录」的：几毫秒里
    // 清单是空的）。不补的话，这一下会以「找不到这份文献」的样子失败——
    // 而它明明就在那儿，只是还没列出来。
    if (!d && !st.docs.length) {
      await loadDocs();
      d = st.docs.find((x) => x.path === path) || null;
    }
    if (!d) {
      st.err = "找不到这份文献：" + path;
      st.doc = null;
      closeSource();
      renderSheets();
      return false;
    }
    st.busy = true;
    st.err = "";
    // ⚠️ **顺序**：先把「网格现在看的是谁」改掉，再放掉上一份。
    // 反过来的话 `releaseSource` 会看到 `st.doc` 还指着旧那份、于是不肯关它，
    // 那份 source 就永远漏着了。
    st.doc = d;
    closeSource();
    st.offset = 0;
    // 来源默认就是这份文献——「边看边记」记十有八九是从这儿来的，
    // 让用户每张卡手打一遍文件名是白费力气。
    sourceEl.value = d.name;
    renderSheets(); // 先把「正在打开…」摆上，读大文件时不是一片空白
    try {
      st.source = await ensureSource(d);
      st.sourcePath = d.path;
    } catch (e) {
      st.source = null;
      st.sourcePath = null;
      st.err = "这份打不开：" + ((e && e.message) || e);
    }
    st.busy = false;
    hidePicker();
    relayout();
    // 「＋ 页」在没开桌面、或还没选文献时是停用的——那条判据要跟着刷新。
    refreshDeskUi();
    return !st.err;
  }

  // ---- 桌面：一页一扇窗（3.0 刀 9-A）----
  //
  // 窗的模型只有几个数：`{ id, kind, path, page, x, y, w, h }`。**模型是唯一事实**——
  // 拖完、拉完、改了页码，都写回模型，重画时再从模型摆一遍。这样「你看到的」和
  // 「存下来的」才不会各说各的（那是这一整块最容易出、也最难查的一类 bug）。
  //
  // 「能混摆」就落在 `sources` 这张表上：**一份文献一个 source**。网格那边是
  // 「打开新的就把上一份关掉」，桌面这里不行——两扇窗可能正指着两份不同的 PDF。
  const desk = {
    on: false,
    wins: [],
    active: null, // 最后点过的那扇（用来把它抬到最上面）
    // 回链该指哪一页：**最近活跃过的**那扇页窗。
    //
    // ⚠️ 不能用「当前活跃的那扇」：摆上一张卡之后活跃的是那张卡，而它没有页码——
    // 于是点第二张卡就再也写不出回链了。这一条是测试抓出来的（第一次写成功、
    // 第二次屏幕上冒出来的是「先点一下你正在读的那扇页窗」）。
    pageId: null,
    perPage: DESK_PER_PAGE, // markdown 自动分页的默认每页行数（偏好，落盘）
    rt: new Map(), // 窗 id -> { gen }，运行时的东西，不落盘
  };
  let deskSeq = 0;
  let deskZ = 1;

  function rtOf(id) {
    if (!desk.rt.has(id)) desk.rt.set(id, { gen: 0 });
    return desk.rt.get(id);
  }

  const winEl = (id) => deskEl.querySelector('.kb-v13-desk-win[data-id="' + id + '"]');
  const findWin = (id) => desk.wins.find((w) => w.id === id) || null;

  /**
   * 桌面自己的尺寸。**夹取按它算，不是视口**——右边还站着「边看边记」那一栏、
   * 上面还有一条顶栏，按视口夹的话窗会被推进侧栏底下去。
   */
  function deskBounds() {
    return { w: deskEl.clientWidth || 0, h: deskEl.clientHeight || 0 };
  }

  /**
   * 把桌面写进偏好。**每一次「摆定了」都要调**：拖动松手、拉角松手、加一扇、
   * 关一扇、改页码、改行号。桌面是**偏好**不是视图状态（见 prefs.js 那段注释）。
   *
   * ⚠️ 与 `stage.js` 的 `setPref` 同一条纪律：**先展开再赋值**，不要整体重建——
   * `sanitizePrefs` 是白名单，整体重建会把用户别处调好的设置一起抹掉。
   * （`setSearchColor` 就踩过这个，3.0 刀 9-0 修的。）
   */
  function persistDesk() {
    const p = ctx.state && ctx.state.prefs ? ctx.state.prefs : {};
    ctx.state.prefs = {
      ...p,
      readerDesk: {
        // `id` / `total` 是运行时的东西，**不落盘**：id 每次恢复重新发，
        // 存档里带着一串旧 id 只会跟新开的撞上。
        windows: desk.wins.map((w) => ({
          kind: w.kind,
          path: w.path,
          // 结构窗（3.0 刀 9-D）用这两个：看哪颗晶体 + 相机推到哪儿。
          // 别的 kind 落盘时是空串 / 默认值，读回来也没人用——但键留着，
          // 好过让 `sanitizeDesk` 那边到处判 `undefined`。
          crystal: w.crystal || "",
          cam: w.cam || { x: 0, y: 0, k: 1 },
          page: w.page,
          from: w.from,
          to: w.to,
          x: w.x,
          y: w.y,
          w: w.w,
          h: w.h,
        })),
        perPage: desk.perPage,
      },
    };
    if (ctx.savePrefs) ctx.savePrefs();
  }

  /** 从偏好里把桌面摆回来。摆不回来的那些条，已经在 `sanitizeDesk` 里被丢掉了。 */
  function restoreDesk() {
    const saved = ctx.state && ctx.state.prefs ? ctx.state.prefs.readerDesk : null;
    const d = sanitizeDesk(saved);
    desk.perPage = d.perPage;
    desk.wins = d.windows.map((w) => ({ ...w, id: "dw" + ++deskSeq, total: 0 }));
  }

  /** 标题栏里那截「这份文献的哪一部分」。按 kind 分派。 */
  function renderDeskMeta(w, host) {
    host.textContent = "";
    if (w.kind === "markdown") {
      // 「第 a–b 行」。两个框都能改，改完按回车——这是「单页微调」那一半，
      // 自动铺开是「＋ 页」的事。
      const mk = (key, label) => {
        const input = doc.createElement("input");
        input.type = "text";
        input.inputMode = "numeric";
        input.className = "kb-v13-desk-pagein";
        input.value = String(w[key]);
        input.setAttribute("aria-label", label);
        input.title = label + "；改完按回车";
        input.addEventListener("keydown", (e) => {
          e.stopPropagation();
          if (e.key === "Enter") commitRange();
          else if (e.key === "Escape") {
            input.value = String(w[key]);
            input.blur();
            e.stopImmediatePropagation();
          }
        });
        input.addEventListener("blur", commitRange);
        return input;
      };
      const fromIn = mk("from", "起始行");
      const toIn = mk("to", "结束行");
      function commitRange() {
        const total = w.total || 0;
        const a = Math.max(1, total ? Math.min(total, Math.round(Number(fromIn.value)) || 1) : Math.round(Number(fromIn.value)) || 1);
        const b = Math.max(a, total ? Math.min(total, Math.round(Number(toIn.value)) || a) : Math.round(Number(toIn.value)) || a);
        fromIn.value = String(a);
        toIn.value = String(b);
        if (a === w.from && b === w.to) return;
        w.from = a;
        w.to = b;
        mountDeskWin(w);
        persistDesk();
      }
      const dash = EL("span", "kb-v13-desk-lab");
      dash.textContent = "行";
      // 顶栏这一行报的是**文件行号**（与编辑器左边数到的一致），并带上全文行数——
      // 用户挑区间时要拿它当尺子，所以两个数都得在。用户 09-17 点名要的。
      const tail = EL("span", "kb-v13-desk-lab");
      tail.textContent = "· 共 " + (w.total || "?") + " 行";
      host.append(fromIn, dash, toIn, tail);
      return;
    }
    if (w.kind !== "pdf") {
      const only = EL("span", "kb-v13-desk-lab");
      only.textContent = w.kind === "image" ? "整张" : "";
      host.appendChild(only);
      return;
    }
    const pageIn = doc.createElement("input");
    pageIn.type = "text";
    pageIn.inputMode = "numeric";
    // ⚠️ 类名不能叫 `.kb-v13-desk-page`——那是**内容盒**的类。两个同名的话，
    // `node.querySelector(".kb-v13-desk-page")` 会先命中标题栏里这个 input，
    // 于是页面被画进一个 12px 高的输入框里。
    pageIn.className = "kb-v13-desk-pagein";
    pageIn.value = String(w.page);
    pageIn.setAttribute("aria-label", "页码");
    pageIn.title = "读第几页；改完按回车";
    function commitPage() {
      const total = w.total || 0;
      const n = Math.round(Number(pageIn.value)) || 1;
      const clamped = Math.max(1, total ? Math.min(total, n) : n);
      pageIn.value = String(clamped);
      if (clamped === w.page) return;
      w.page = clamped;
      mountDeskWin(w); // 页码是这一页内容的一部分，改了就得重画
      persistDesk();
    }
    // ⚠️ 输入框里的按键**不许漏给阅读器**：不然在页码框里按方向键会去翻屏
    // （`onKeydown` 那边靠 `typingNow()` 判 tagName，但这个框在标题栏里，
    // 而 Esc 那一路会先把阅读器关掉）。
    pageIn.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") commitPage();
      else if (e.key === "Escape") {
        pageIn.value = String(w.page);
        pageIn.blur();
        e.stopImmediatePropagation();
      }
    });
    pageIn.addEventListener("blur", commitPage);
    const tot = EL("span", "kb-v13-desk-lab");
    tot.textContent = " / " + (w.total || "?") + " 页";
    host.append(pageIn, tot);
  }

  /** PDF / 图片这一类：一页一屏、裁切 + 缩放。卡片 / markdown 是能滚的文字流。 */
  const isFixedKind = (kind) => kind === "pdf" || kind === "image";

  /**
   * 内容盒分**三种**，不是样式偏好，是三套排版：
   *   `-fixed`  PDF / 图片：一页就是一屏，裁切 + 缩放（见 pagezoom.js）。
   *   `-flow`   卡片 / markdown：块级流 + 纵向滚动条。
   *   `-embed`  结构窗（3.0 刀 9-D）：里面是一块**自绘的可平移世界**，
   *             要撑满、要 `overflow:hidden`、**不能有内边距**——相机算的是
   *             盒子的真实尺寸，多一圈 padding，世界原点就偏一圈，整片画面
   *             会跟着歪，而且歪得很小、看着像"没对齐"而不是像 bug。
   */
  const deskBoxClass = (kind) =>
    isFixedKind(kind) ? "kb-v13-desk-fixed" : kind === "storyline" ? "kb-v13-desk-embed" : "kb-v13-desk-flow";

  /**
   * 内容盒里那一层被 transform 的 stage。PDF 与图片才有。
   *
   * 为什么不直接 transform 画布：文字层是**另挂的一个绝对定位节点**
   * （`mountTextLayer` 把它 append 在同一个盒子里），只转画布的话，放大之后
   * 字和画会分家。包一层，两层一起转、一起量，划选也就跟着走。
   */
  function stageOf(node) {
    const box = node.querySelector(".kb-v13-desk-page");
    let stage = box.querySelector(".kb-v13-desk-stage");
    if (!stage) {
      stage = EL("div", "kb-v13-desk-stage");
      box.appendChild(stage);
    }
    return stage;
  }

  /**
   * 把窗按这一页的宽高比摆一遍——**只在用户没亲手改过这扇窗的时候**。
   *
   * 用户动过之后就一个字都不能改：他拉出来的那个尺寸是「我要看这么大」，
   * 翻页时被自动纠正走比尺寸不准讨厌得多（`floatwin.js` 的 `touched` 同一条）。
   */
  function fitDeskWinToPage(w, size) {
    w.ratio = size.h / size.w;
    if (w.touched) return;
    const node = winEl(w.id);
    if (!node) return;
    // 窗 = 内容盒 + 一圈边框 + 一条标题栏。要让**内容盒**是页的形状。
    // 宽度保持不变（那是用户/默认摆出来的），高度按页推。
    const want = {
      x: w.x,
      y: w.y,
      w: w.w,
      h: Math.round(Math.max(1, w.w - DESK_CHROME.x) * w.ratio) + DESK_CHROME.y,
    };
    const b = deskBounds();
    Object.assign(w, clampRatioBox(want, b.w || 900, b.h || 700, w.ratio, DESK_CHROME));
    applyDeskBox(node, w);
  }

  /**
   * 把文字层拉伸到画布**现在**显示成多大。
   *
   * 画布是 `width:100%`（跟着窗走，这是「一页正好铺满窗」在代码里的落点），
   * 而文字层的每个 span 是按**画那一次**的比例摆的绝对像素——窗一改尺寸两者就分家，
   * 表现是「字还在，但选中的位置和看到的字对不上」。所以量一次画布、给整层乘一个
   * `scale`，从那以后两者永远同步，中间不需要重画。
   *
   * （拖角松手时还会真重画一遍，那是为了清晰；这一条管的是**每一帧都对得上**。）
   */
  function restretch(w) {
    const node = winEl(w.id);
    if (!node || !isFixedKind(w.kind)) return;
    const stage = node.querySelector(".kb-v13-desk-stage");
    if (!stage) return;
    const canvas = stage.querySelector("canvas");
    const layer = stage.querySelector(".kb-v13-reader-textlayer");
    if (canvas && layer) {
      const laid = parseFloat(layer.style.width) || 0;
      const now = canvas.getBoundingClientRect().width;
      if (laid > 0 && now > 0) {
        const k = now / laid;
        layer.style.transform = Math.abs(k - 1) < 0.001 ? "" : "scale(" + k + ")";
      }
    }
    applyPageZoom(stage, node.querySelector(".kb-v13-desk-page"), zoomStateOf(w));
  }

  /** 一扇窗的视口状态（缩放倍率 + 画面中心对着页上的哪一点）。**不落盘**，见 desk 那段。 */
  function zoomStateOf(w) {
    if (!w.zoomSt) w.zoomSt = { zoom: 1, fx: 0.5, fy: 0.5 };
    return w.zoomSt;
  }

  function buildDeskWin(w) {
    const node = EL("div", "kb-v13-desk-win");
    node.dataset.id = w.id;
    node.dataset.kind = w.kind;

    const bar = EL("div", "kb-v13-desk-bar");
    const title = EL("span", "kb-v13-desk-title");
    // 结构窗没有文件路径，`shortFolder("")` 是空串——不特判的话它顶上会写着
    // 「文献」，和旁边那几扇真的文献窗长得一模一样，谁也分不清点的是哪一扇。
    title.textContent =
      w.kind === "storyline"
        ? "结构：" + (shortFolder(w.crystal) || w.crystal || "?")
        : shortFolder(w.path) || baseName(w.path) || "文献";
    title.title = toStr(w.path);
    const meta = EL("span", "kb-v13-desk-meta");
    renderDeskMeta(w, meta);
    const close = EL("button", "kb-v13-desk-close", "✕");
    close.type = "button";
    close.title = "把这一页收回去";
    close.addEventListener("click", () => removeDeskWin(w.id));
    bar.append(title, meta, close);
    // 卡片窗与 markdown 文献窗各多一颗 ✎：**就地改正文**（3.0 刀 9 第二版）。
    // 用户的原话是「卡片悬浮窗里面的内容需要编辑并且更改」，后来又要了
    // 「markdown 文献也要能改」——两件事的骨架是一样的（一个 textarea、
    // 一条保存/取消、写盘走 writeCard 的三态），差别只在**改的是哪一段文本**：
    // 卡片改的是 frontmatter 之后的正文（`patchBody` 只换正文那一截），
    // 文献改的是**整篇文件**（它是文档，没有「正文」这个更小的可写单元）。
    if (w.kind === "card" || w.kind === "markdown") {
      const edit = EL("button", "kb-v13-desk-edit", "✎");
      edit.type = "button";
      // 名字要说准：markdown 那一支改的**不是整篇**，是这一扇窗看着的那一段
      // （用户 09-18 点名的「在有多少行到多少行的约束下编辑」）。
      edit.title =
        w.kind === "card" ? "改这张卡的正文" : "改这一段（第 " + w.from + "–" + w.to + " 行）";
      edit.addEventListener("click", () => toggleDeskEdit(w));
      bar.insertBefore(edit, close);
    }
    // ⚠️ 内容盒分两种，**不是样式偏好，是两套排版**：
    //   `-flow`  卡片 / markdown：块级流 + 纵向滚动条。从前这里也是
    //            `overflow:hidden; display:flex`，卡片长一点就被裁掉，
    //            而且**没有任何提示**（用户 09-17 报的「缺少垂直滚动条」）。
    //   `-fixed` PDF / 图片：一页就是一屏，裁切 + 缩放（见 pagezoom.js）。
    const box = EL("div", "kb-v13-desk-page " + deskBoxClass(w.kind));
    const grip = EL("div", "kb-v13-desk-grip");
    node.append(bar, box, grip);
    // 卡片窗底下那一条状态/撤销。空着的时候不占位置（`:empty` 里没有高度）。
    const status = EL("div", "kb-v13-desk-status");
    node.appendChild(status);

    applyDeskBox(node, { x: w.x, y: w.y, w: w.w, h: w.h });
    node.style.zIndex = String(++deskZ);

    bindDeskDrag(ctx, {
      el: node,
      bar,
      grip,
      box: () => ({ x: w.x, y: w.y, w: w.w, h: w.h }),
      bounds: deskBounds,
      // PDF 页窗**锁比例**（3.0 刀 9 第二版）：窗的形状跟着页走，页正好铺满窗。
      // 用户原话是「视窗适应里面内容，不是里面内容适应视窗」。
      ratio: () => (w.kind === "pdf" ? w.ratio || 0 : 0),
      chrome: () => DESK_CHROME,
      // 拖动中每一帧都写回模型并摆到位：窗里的画布/文字层是按窗宽算的，
      // 攒到松手才更新的话，整个拖动过程里内容都是错位的。
      onChange: (b, mode) => {
        w.x = b.x;
        w.y = b.y;
        w.w = b.w;
        w.h = b.h;
        // **只有改了尺寸才算「用户亲手定了这扇窗的形状」**。只是挪个位置的话，
        // 翻到一页形状不同的页时仍该按新页重新摆——挪位置和定形状是两件事。
        if (mode === "resize") w.touched = true;
        applyDeskBox(node, b);
        restretch(w);
      },
      // 松手才落盘：拖动过程中每一帧都写盘的话，一次拖拽就是几十次磁盘写 + 多端同步。
      // 顺带重画一次这一页——拖动期间画布是被 CSS 拉伸的（糊的），松手按新宽度
      // 真画一遍才清晰。重画只在松手时发生，不跟手。
      onCommit: () => {
        persistDesk();
        if (w.kind === "pdf") mountDeskWin(w);
      },
    });

    // 点哪扇哪扇浮上来——也顺便记住「现在在用哪一扇」，卡片盒写回链要问它。
    node.addEventListener(
      "pointerdown",
      () => {
        desk.active = w.id;
        // 点过哪扇页窗，「现在在读第几页」就跟到哪扇。卡片窗不参与。
        if (w.kind === "pdf") desk.pageId = w.id;
        node.style.zIndex = String(++deskZ);
      },
      true
    );

    // PDF / 图片：滚轮按光标缩放、双击回 100%、中键（触摸是单指）平移。
    // 鼠标左键**不接手**——它留给划选文字，见 pagezoom.js 的文件头。
    if (isFixedKind(w.kind)) {
      bindPageZoom({
        box,
        // 传**函数**不是节点：重画一页时这一层会被清掉重建，攥着老节点的话
        // 缩放会作用在一个已经脱离文档的元素上（不报错，只是屏幕纹丝不动）。
        stage: () => stageOf(node),
        state: zoomStateOf(w),
        // 缩放**不落盘**：它是「我这一会儿看得大一点」，不是工作台的摆法。
        // 图片窗也是这个口径（imgzoom 的倍数只活在会话里），两边一致。
        onCommit: () => {},
      });
    }

    deskEl.appendChild(node);
    return node;
  }

  // ---- 卡片窗里就地改正文（3.0 刀 9 第二版）----
  //
  // 与 `editform.js` 那一套是同一个骨架，只是**没有搬过去复用**：那个是「全息面板
  // 原地变表单」，从 DOM 到刷新链都跟面板的几何绑死（`teardown` 要重排卫星、
  // `holodrag` 要排除表单）。阅读器这边是一扇桌面窗，两者除了「写盘那三态」
  // 没有一处共用。写盘那一半照抄 `writeBacklink` 已经写好的口径：
  // 带基线、冲突不覆盖、给一次撤销。

  function deskStatus(w, text, ok, action) {
    const node = winEl(w.id);
    if (!node) return;
    const el = node.querySelector(".kb-v13-desk-status");
    if (!el) return;
    el.textContent = "";
    el.classList.toggle("kb-v13-desk-status-bad", !ok);
    const span = EL("span", "kb-v13-desk-statustext");
    span.textContent = text;
    el.appendChild(span);
    if (action) {
      const btn = EL("button", "kb-v13-desk-statusact", action.label);
      btn.type = "button";
      btn.addEventListener("click", action.onClick);
      el.appendChild(btn);
    }
  }

  function toggleDeskEdit(w) {
    const rt = rtOf(w.id);
    if (rt.edit && rt.edit.on) {
      // 再点一次 = 退出。**直接退**（不问「有没保存」）：这一版的编辑器没有
      // 脏态跟踪，弹一个「没保存」的框比丢几个字更烦人——想留下就点保存。
      rt.edit = null;
      mountDeskWin(w);
      return;
    }
    renderDeskEditor(w);
  }

  /**
   * 起一个编辑框。**卡片与 markdown 文献共用这一套**，差别只有两处：
   *
   *   1. **改哪一段文本**：卡片改「frontmatter 之后的正文」——那是它唯一可写的
   *      单元，`patchBody` 只换那一截、YAML 一个字节不动；文献改**整篇文件**，
   *      因为文档没有比「整篇」更小的可写单元（标题栏那个行号区间是**视图**，
   *      不是可以单独写回去的单元——按视图切片再拼回去，行号一漂就悄悄改错地方）。
   *   2. **基线从哪儿来**：卡片来自模型（`card.content`），文献来自它自己的
   *      source（`src.raw`，就是读进来那份文件的原文）。
   *
   * ⚠️ 两边都**拒绝空基线进编辑态**：读失败时适配层给的是空串，一保存就把整篇
   * 覆盖成空的——这是全流程唯一不可逆的损坏路径（`editform.js` 同一条）。
   */
  async function renderDeskEditor(w) {
    const node = winEl(w.id);
    if (!node) return;
    const box = node.querySelector(".kb-v13-desk-page");
    const fail = (msg) => {
      box.textContent = msg;
    };

    let base = "";
    let text = "";
    let label = "";
    if (w.kind === "card") {
      const card = findCardByPath(w.path);
      if (!card) return fail("找不到这张卡：" + w.path);
      base = card.content == null ? "" : toStr(card.content);
      text = stripBodyPrefix(splitCard(base).body);
      label = "卡片正文";
    } else {
      const d = st.docs.find((x) => x.path === w.path);
      if (!d) return fail("找不到这份文献：" + w.path);
      let src;
      try {
        src = await ensureSource(d);
      } catch (e) {
        return fail("读不出这份文献：" + ((e && e.message) || e));
      }
      // 这期间用户可能已经换了页、关了窗、又点了一次 ✎ —— 重新看一眼再往下走
      if (!winEl(w.id)) return;
      // ⚠️ **基数是整篇，交给编辑器的是这一段。**
      // 基数要整篇：写盘那一路靠它比对「文件在别处被改过没有」，只拿一段没法比。
      // 给编辑器的只有 `from–to` 那几行：这个窗就是「文件的一段」，用户在这儿
      // 看到的是第 a–b 行，改的也该只是第 a–b 行（用户 09-18 点名的）。
      base = toStr(src.raw);
      text = sliceLines(base, w.from, w.to);
      label = "第 " + w.from + "–" + w.to + " 行";
    }
    if (!base.trim()) return fail("这份内容读不出来，改它会把原文件覆盖成空的。");

    box.textContent = "";
    box.classList.remove("kb-v13-desk-flow");
    box.classList.add("kb-v13-desk-editing");
    // 上一次保存留下的「已保存 [撤销]」在新一次编辑开始时作废——不然它挂在那儿，
    // 点下去撤的是上一轮那次写盘。
    deskStatus(w, "", true);

    // 编辑区：**先问宿主有没有原生编辑器**（Obsidian 里是实时预览那一档），
    // 拿不到才退回核心自己的 textarea。见 adapter.js 的 mountEditor 那一段。
    //
    // markdown 那一支把**区间起点**一起交给宿主：宿主的编辑器里是**整个文件**
    // （它是文件视图，装不下「一段」），所以「一扇窗 = 从第 a 行看起」这件事由
    // 「打开时定位到第 a 行」+ 底下那个「回到第 __ 行」来实现（用户 09-18 拍板）。
    const field = await mountEditArea(box, {
      // 3.0 刀 12（用户 2026-09-19）：**卡片窗也给原生编辑器**。
      //
      // 原来是只给 markdown 文献窗的，理由是卡片那一路要「只改正文那一截、带基线、
      // 有撤销」，而宿主的编辑器是**文件视图**：整篇、自己存盘——两条正好反着。
      // 用户真机用下来要的是**实时渲染那一档**，所以这条改了。
      //
      // ⚠️ 换来的东西写在这儿，免得以后有人当成 bug：
      //   · 写盘变成**整篇**（编辑器里是什么就写什么），不再是「只动正文那一截」。
      //     YAML 因此也**可编辑**了——那是要的；但「手写的注释/键序不会被重排」
      //     那条保证，从现在起只剩全息面板的 ✎（`editform.js`）守着。
      //   · **不带基线比对**：宿主自己会存盘，拿打开那一刻的原文去比必然假冲突
      //     （见 `saveDeskEdit` 里那段）。所以多设备同步下「别处改过就不覆盖」
      //     在这条路上是关掉的。要那两样保护的走全息面板的 ✎，那条路一点没动。
      native: true,
      path: w.path,
      text,
      label,
      line: w.kind === "markdown" ? w.from : 0,
    });

    const ta = field.el;
    const row = EL("div", "kb-v13-desk-editrow");
    const closeEditor = () => {
      rtOf(w.id).edit = null;
      mountDeskWin(w);
    };

    if (field.selfSaving) {
      // ---- 宿主原生编辑器这一支：**宿主自己会存盘** ----
      //
      // 所以这里不再有「保存/取消」：宿主随编辑自动落盘，「取消」根本撤不回来。
      // 但**「完成」那一下核心仍然要把全文写回去**（不带基线）——万一宿主那套
      // 自动存盘没接上（我们这套挂法没有文档背书），用户改了半天会一个字都不落盘。
      // 宿主要是已经存过，这一下就是幂等的（同样的内容再写一次）。**丢字比假冲突
      // 严重得多**，所以宁可多写一次。
      const done = EL("button", "kb-v13-desk-editsave", "完成");
      done.type = "button";
      done.title = "收起编辑器（改动由 Obsidian 自己存盘，这一步会再确认一次）";
      done.addEventListener("click", () => saveDeskEdit(w, true));
      // 「回到第 __ 行」——绑文件的编辑器里是整个文件，用户得自己去那一行；
      // 这个入口就是他随手跳的办法（顶栏那个区间管「这一扇窗从哪看起」，
      // 这里管「我临时想再看一眼第 200 行」）。
      const jump = EL("span", "kb-v13-desk-jump");
      const lab = EL("span", "kb-v13-desk-jumplab");
      lab.textContent = "回到第";
      const num = doc.createElement("input");
      num.type = "text";
      num.inputMode = "numeric";
      num.className = "kb-v13-desk-pagein";
      num.value = String(w.from);
      num.setAttribute("aria-label", "跳到第几行");
      num.title = "填行号，回车跳过去";
      const tail = EL("span", "kb-v13-desk-jumplab");
      tail.textContent = "行";
      const doJump = () => {
        if (!field.gotoLine) return;
        // 夹过的行号要**写回输入框**：不然用户填了 9999、屏幕跳到末行，
        // 而框里还写着 9999，下次照着它再跳一次还是不知道自己在哪。
        const at = field.gotoLine(Math.round(Number(num.value)) || 0);
        num.value = String(at);
      };
      num.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") doJump();
        else if (e.key === "Escape") {
          num.blur();
          e.stopImmediatePropagation();
        }
      });
      jump.append(lab, num, tail);
      row.append(jump, done);
      box.append(row);
      rtOf(w.id).edit = { on: true, kind: w.kind, base, from: w.from, to: w.to, ta, field };
      field.focus();
      return;
    }

    // ---- 兜底那一支：核心自己的输入框，改的是**这一段** ----
    // 编辑框里的按键不许漏给阅读器（Esc 会去关整块阅读器）。
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") closeEditor();
      // Ctrl/Cmd+Enter 保存，与全息面板那个编辑表单同一个手感
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveDeskEdit(w, false);
    });
    const save = EL("button", "kb-v13-desk-editsave", "保存");
    save.type = "button";
    save.addEventListener("click", () => saveDeskEdit(w, false));
    const cancel = EL("button", "kb-v13-desk-editcancel", "取消");
    cancel.type = "button";
    cancel.addEventListener("click", closeEditor);
    row.append(save, cancel);
    box.append(row);
    // `from`/`to` 也记下来：markdown 存盘时要按这个区间把改过的那一段拼回全文
    // （卡片那一路用不上它，但记着无害）。
    rtOf(w.id).edit = { on: true, kind: w.kind, base, from: w.from, to: w.to, ta, field };
    ta.focus();
    field.focus();
  }

  /**
   * 起一块「能写 markdown 的地方」：**先问宿主要有原生编辑器**，拿不到才自己搭
   * 一个 `<textarea>`（3.0 刀 9 第三版）。
   *
   * 为什么值得单拆一层：宿主那个编辑器是**实时预览**（边写边渲染、双链补全），
   * 核心造不出来；但浏览器原型和全部自动化测试里没有它，只能退回输入框。
   * 于是「要一个能编辑的区」这件事的正确形状是**一个能力问句 + 一个兜底**，
   * 而不是核心自己写死一个 textarea。
   *
   * ⚠️ 返回的 `field.el` 是**事件要挂的那一层**：原生编辑器那一支给的是外面那圈
   * 宿主容器（它内部是 contenteditable，不是 input）。所以调用方**不要**去读
   * `.value`，一律走 `field.value()`——那是两种实现唯一的共同口径。
   *
   * @returns {Promise<{el: HTMLElement, value: () => string, setValue: (v:string)=>void,
   *                    focus: () => void, destroy: () => void}>}
   */
  async function mountEditArea(box, opts) {
    const shell = EL("div", "kb-v13-editarea");
    box.appendChild(shell);
    let handle = null;
    // `native` 为假就**根本不去问宿主**，直接给输入框（原型和全部自动化测试
    // 走的就是这一支：那边没有宿主编辑器）。
    //
    // 09-18 时这里只给 markdown 文献窗开原生编辑器，卡片窗被排除在外；09-19
    // 用户真机用下来要卡片窗也有，于是 `renderDeskEditor` 传的已经是 `true`。
    // **代价（整篇写盘、不带基线）记在那边**，这一层不重复。
    if (!opts.native) {
      return textareaFallback(shell, opts);
    }
    try {
      handle = await adapter.mountEditor(shell, { path: opts.path, text: opts.text, line: opts.line });
    } catch (e) {
      handle = null;
      // ⚠️ 契约说绝不抛。真抛了，**不能安静地退回输入框**——那是「宿主没有这个能力」
      // 与「适配层里有 bug」长得一模一样的那种坏法：用户看到的是「还是输入框」，
      // 界面上没提示、控制台里一片安静，而真正的原因（哪怕只是一句
      // `ReferenceError: xxx is not defined`）被这一行 catch 吃干净了。
      // 09-18 就是这么栽的：适配层里漏了一个函数定义，界面上两轮都没线索。
      const msg = (e && e.message) || String(e);
      try {
        console.warn("[晶体库] mountEditor 抛了异常（契约要求它绝不抛）：", e);
      } catch (err) {
        /* 控制台都没有就算了 */
      }
      const note = EL("div", "kb-v13-editor-note");
      note.textContent = "宿主编辑器这一路抛了异常，已退回输入框：" + msg;
      shell.appendChild(note);
    }
    if (handle) {
      return {
        el: shell,
        value: () => handle.getValue(),
        setValue: (v) => handle.setValue(v),
        focus: () => handle.focus(),
        destroy: () => handle.destroy(),
        // 宿主那块编辑器**自己会存盘**（它是文件视图）。核心据此换一套收尾动作：
        // 不摆「保存/取消」，改摆「完成 + 回到第 N 行」，写盘也不带基线。
        selfSaving: !!handle.selfSaving,
        gotoLine: handle.gotoLine || null,
      };
    }
    return textareaFallback(shell, opts);
  }

  /** 兜底那一支：核心自己的输入框。事件挂在 textarea 自己身上（老行为，测试认得它）。 */
  function textareaFallback(shell, opts) {
    const ta = doc.createElement("textarea");
    ta.className = "kb-v13-desk-editbody";
    ta.value = toStr(opts.text);
    ta.setAttribute("aria-label", opts.label || "正文");
    shell.appendChild(ta);
    return {
      el: ta,
      value: () => ta.value,
      setValue: (v) => {
        ta.value = toStr(v);
      },
      focus: () => ta.focus(),
      destroy: () => ta.remove(),
      selfSaving: false,
      gotoLine: null,
    };
  }

  /**
   * 把编辑框里的文本写回去。
   *
   * @param {boolean} force 「用我的覆盖」——撞过冲突之后用户明确选的，跳过基线比对。
   */
  async function saveDeskEdit(w, force) {
    const rt = rtOf(w.id);
    const ed = rt.edit;
    if (!ed || !ed.on) return;
    // ⚠️ 一律走 `ed.field.value()`，**不许**读 `ta.value`——原生编辑器那一支内部是
    // contenteditable，根本没有 `.value`（读到的是 undefined，写下去就是清空文件）。
    const next = ed.field.value();
    // 三种收尾，别混：
    //   · 宿主原生编辑器（markdown 窗）：**它自己会存盘**，我们只把全文再确认一次，
    //     而且**不带基线**——宿主刚存过，拿旧基线比必然假冲突。
    //     这一下若是多余的，也只是把同样的内容再写一遍（幂等）；
    //     若宿主的自动存盘没接上，这一下就是保命的。**丢字比假冲突严重得多。**
    //   · 卡片：只换正文那一截，YAML 一字节不动。
    //   · 兜底输入框（markdown 窗退回时）：按行号区间把改过的那一段拼回全文。
    const selfSaving = !!ed.field.selfSaving;
    const content = selfSaving
      ? next
      : ed.kind === "card"
        ? patchBody(ed.base, next)
        : patchLines(ed.base, ed.from, ed.to, next);
    let res;
    try {
      // `base` 是**打开编辑框那一刻**的原文。适配层拿它跟磁盘现状比对，不一致就回
      // conflict、**不写**——多设备同步下这张卡可能刚被手机改过。
      res = await adapter.writeCard(w.path, content, force || selfSaving ? {} : { base: ed.base });
    } catch (e) {
      deskStatus(w, "写不进去：" + ((e && e.message) || e), false);
      return;
    }
    if (!res || !res.ok) {
      if (res && res.reason === "conflict") {
        // 与卡片盒、全息面板同一条：**绝不覆盖**，摆出「用我的覆盖」让用户点头。
        deskStatus(w, "这份内容在别处被改过，没有写。", false, {
          label: "用我的覆盖",
          onClick: () => saveDeskEdit(w, true),
        });
        return;
      }
      deskStatus(w, res && res.reason === "missing" ? "这个文件不在了。" : "写盘失败。", false);
      return;
    }
    if (ed.kind === "card") {
      // 顺序与 `editform.js` 的 refreshAfterWrite 一致：模型 → 关系图 → 重画 → 落状态。
      const card = findCardByPath(w.path);
      if (card) applyCardFields(card, {}, res.content);
      if (ctx.refreshRelations) ctx.refreshRelations();
      // 同 writeBacklink：**不调 `ctx.refreshCard`**（那是 showHologram，会 closeAllFloats）。
      if (ctx.refreshCards) ctx.refreshCards();
      if (ctx.refreshCrystalLayer) ctx.refreshCrystalLayer();
      if (ctx.flushViewState) ctx.flushViewState();
    } else {
      // 文献那条路多一件事：**把缓存里那份 source 丢掉**。
      // 它还攥着改之前那份原文（`src.raw`），不丢的话这一窗重画之后
      // 屏幕上还是旧内容——写盘成功了、界面不动，最难查的那一类。
      // 只删表项不 close：桌上可能还有别的窗指着同一份。
      st.sources.delete(w.path);
    }
    ed.on = false;
    ed.prev = ed.base;
    ed.base = res.content; // 撤销要拿**刚写下去那份的回读**当基线
    mountDeskWin(w);
    // 自存盘那一支不给「撤销」：满屏的字是宿主在写、它自己也有一整套撤销栈
    // （Ctrl+Z），我们那一下只是「确认落盘」，撤它等于把用户后面的编辑一起撤了。
    if (selfSaving) deskStatus(w, "改好了，已确认落盘。", true);
    else deskStatus(w, "已保存。", true, { label: "撤销", onClick: () => undoDeskEdit(w) });
  }

  /** 写盘之后的后悔药。**只给一层、不给重做**——与 editform / 卡片盒同一条规矩。 */
  async function undoDeskEdit(w) {
    const ed = rtOf(w.id).edit;
    if (!ed || !ed.prev) return;
    const prev = ed.prev;
    const base = ed.base;
    ed.prev = null;
    let res;
    try {
      res = await adapter.writeCard(w.path, prev, { base });
    } catch (e) {
      deskStatus(w, "撤销失败：" + ((e && e.message) || e), false);
      return;
    }
    if (!res || !res.ok) {
      deskStatus(w, res && res.reason === "conflict" ? "这份在这之后又被改过，没有撤销。" : "撤销失败。", false);
      return;
    }
    const wasCard = ed.kind === "card";
    if (wasCard) {
      const card = findCardByPath(w.path);
      if (card) applyCardFields(card, {}, res.content);
      if (ctx.refreshRelations) ctx.refreshRelations();
      if (ctx.refreshCards) ctx.refreshCards();
      if (ctx.refreshCrystalLayer) ctx.refreshCrystalLayer();
      if (ctx.flushViewState) ctx.flushViewState();
    } else {
      st.sources.delete(w.path); // 同 saveDeskEdit：不丢缓存的话界面上还是改后那份
    }
    rtOf(w.id).edit = null;
    mountDeskWin(w);
    deskStatus(w, wasCard ? "已撤销，这张卡回到原样。" : "已撤销，这份文献回到原样。", true);
  }

  /**
   * 把一段行区间画成**带行号栏**的一列块（3.0 刀 9 第二版）。
   *
   * 行号挂在「块」上，不挂在「行」上——桌面窗里那份 markdown 是交给宿主的
   * 渲染器画的，画出来是 `<p>` / `<h2>` / `<pre>`，**块与源文本行不是一一对应**
   * （一个三行的段落渲染成一个 `<p>`）。所以每个块左边报出它**起始那一行的
   * 文件行号**，正好对上标题栏里那个行号区间。切块的规则在 `desk.js` 的
   * `splitBlocks`（纯函数、有单测）。
   *
   * 代价要知情：**一个块一次 renderMarkdown**，所以一屏 40 行如果有十个段落，
   * 就是十次宿主渲染调用。换来的是行号真的对得上——糊一层假行号不如不做。
   */
  async function mountMarkdownRange(w, box, raw) {
    const blocks = splitBlocks(raw, w.from, w.to);
    box.textContent = "";
    if (!blocks.length) {
      const empty = EL("div", "kb-v13-desk-lab");
      empty.textContent = "这一段是空白的。";
      box.appendChild(empty);
      return;
    }
    for (const b of blocks) {
      const row = EL("div", "kb-v13-mdl");
      row.dataset.line = String(b.from);
      const n = EL("span", "kb-v13-mdl-n");
      n.textContent = String(b.from);
      // 行号不许被选中带走：拖一整段复制出来时，粘到别处的第一列全是数字
      n.setAttribute("aria-hidden", "true");
      const t = EL("div", "kb-v13-mdl-t");
      row.append(n, t);
      box.appendChild(row);
      await adapter.renderMarkdown(b.text, t, w.path);
    }
  }

  /**
   * 把这一页画进它的窗。
   *
   * ⚠️ 两件事和网格那边不一样：
   *   1. **`isStale` 比的是这一扇自己的世代**，不是 `st.gen`——网格重排一次
   *      不该把桌上任何一扇窗的渲染判成过期。
   *   2. **mount 不幂等**（它无条件 append 一个 canvas），所以进来先清空。
   */
  /**
   * 相机这种东西一拖就是几十次变更，每次都写一遍 localStorage 没必要。
   * 防抖到停手之后一笔——和视图状态那条防抖同一个理由（见 app.js 的 flushViewState）。
   */
  let deskSaveTimer = null;
  function persistDeskSoon() {
    if (deskSaveTimer) clearTimeout(deskSaveTimer);
    deskSaveTimer = setTimeout(() => {
      deskSaveTimer = null;
      persistDesk();
    }, 400);
  }

  /**
   * 开一扇结构窗（阅读器顶栏那颗「结构窗」）。
   *
   * 看哪颗晶体：**和「故事线」那颗同一套口径**——你开阅读器之前待在哪颗就哪颗
   * （`state.openCrystal`），停在环上就落到第一颗。不另立一套记事本：两处口径
   * 一旦不一样，同一件事按两颗按钮会看到两颗不同的晶体。
   *
   * **只开一扇**：看的是同一颗晶体的同一张图，并排两扇除了互相挡没别的用处。
   * 已经开着就把那一扇抬上来（和点窗身是同一个动作）。
   */
  function openStoryWindow() {
    // 一份文献都没开的时候，整块屏盖着「选哪份文献」那一层。结构窗开在它底下，
    // 不请走它就等于开了一块点不到的窗——和顶栏那颗「故事线」是同一个坑。
    hidePicker();
    if (!desk.on) setDeskMode(true);
    const exist = desk.wins.find((w) => w.kind === "storyline");
    if (exist) {
      const node = winEl(exist.id);
      if (node) node.style.zIndex = String(++deskZ);
      desk.active = exist.id;
      say("结构窗已经开着了。", true);
      return;
    }
    if (!(ctx.model.crystalKeys || []).length) {
      say("这张库里还没有晶体。", false);
      return;
    }
    // 挑过一次就一直用它（用户 Q3 选的「固定一颗，选定就一直是它」）。
    // 没挑过——**把树摊开让他挑**，挑完 `chooseStoryCrystal` 接着把窗开出来。
    const key = storyCrystalPref();
    if (!key) {
      openFolderPick("crystal");
      say("挑一颗晶体：结构窗就固定看它。", true);
      return;
    }
    addStoryWin(key);
    say("结构窗开在桌面上了。拖线连关系，左上那颗按钮切「看 / 写」。", true);
  }

  /** 结构窗固定看的那颗晶体。**去查它今天还在不在**——不在了当没挑过。 */
  function storyCrystalPref() {
    const k = toStr(ctx.state && ctx.state.prefs ? ctx.state.prefs.readerStoryCrystal : "");
    return k && ctx.model.hasNode(k) ? k : "";
  }

  function setStoryCrystal(key) {
    ctx.state.prefs = { ...(ctx.state.prefs || {}), readerStoryCrystal: toStr(key) };
    if (ctx.savePrefs) ctx.savePrefs();
  }

  /** 把结构窗开出来。尺寸按桌面比例给个起点——多大合适只有摆过一次的人知道。 */
  function addStoryWin(key) {
    const b = deskBounds();
    return addDeskWin({
      kind: "storyline",
      crystal: key,
      want: {
        w: Math.max(300, Math.round((b.w || 900) * 0.42)),
        h: Math.max(240, Math.round((b.h || 700) * 0.6)),
      },
    });
  }

  /**
   * 挑定了「结构窗看哪颗」。已经从树上选出来了（`folderPick` 那一档收的是晶体 key）。
   *
   * 两种收场：窗已经开着就**换过去**（不另开一扇），没开就开一扇。
   * 两条都先把选择写进偏好——「我挑的是这颗」比「这扇窗现在开着」活得久。
   */
  function chooseStoryCrystal(key) {
    const k = toStr(key);
    if (!k || !ctx.model.hasNode(k)) return;
    setStoryCrystal(k);
    hideFolderPick();
    // ⚠️ **收完树还要再请一次那层「选哪份文献」。**
    // `hideFolderPick` 结尾有一条「没收成"选哪份文献"那层就还回来」——那是给
    // **取消**准备的（一份文献没开的人关掉树，屏幕上总得有东西）。但这里不是取消：
    // 用户挑定了晶体，接下来要在**桌面上**干活，那层铺满整屏的东西盖上来就白挑了。
    hidePicker();
    const exist = desk.wins.find((w) => w.kind === "storyline");
    if (!exist) {
      addStoryWin(k);
      say("结构窗开在桌面上了。拖线连关系，左上那颗按钮切「看 / 写」。", true);
      return;
    }
    exist.crystal = k;
    retitleStoryWin(exist.id, k);
    const rt = rtOf(exist.id);
    if (rt && rt.embed) rt.embed.show(k);
    persistDesk();
    say("结构窗换成：" + (shortFolder(k) || k), true);
  }

  /** 结构窗顶上那行字。换晶体、点幽灵节点都走它，两处口径才不会各写各的。 */
  function retitleStoryWin(id, key) {
    const node = winEl(id);
    const t = node && node.querySelector(".kb-v13-desk-title");
    if (t) t.textContent = "结构：" + (shortFolder(key) || key);
  }

  /**
   * 结构窗的内容：一块自绘的可平移世界（3.0 刀 9-D）。
   *
   * 和卡片窗一样**不经过 source**——它没有文件，画的是一颗晶体。每扇窗一份
   * 自己的视图实例，装在 `desk.rt` 里（**运行时，不落盘**）：相机和「画线是看
   * 还是写」都是活的东西，存档里存的是「上次停在哪」，不是这台对象。
   *
   * `w.cam` 只在**开窗那一刻**喂进去。之后相机归视图自己管，它每次变更回写到
   * `w.cam` —— 单向，避免两边互相覆盖。
   */
  function mountEmbedStory(w, box) {
    const rt = rtOf(w.id);
    if (rt.embed) {
      rt.embed.destroy();
      rt.embed = null;
    }
    const boot = w.cam && Number.isFinite(w.cam.k) ? w.cam : null;
    const view = createEmbedStory(ctx, {
      camera: boot,
      injectStyles,
      onCamera: (cam) => {
        w.cam = cam;
        persistDeskSoon();
      },
      // 点节点 = 把那张卡摆到桌面上（和卡片盒点一张卡是**同一条路**）。
      onPlaceCard: (card) => onCardPick(card),
      // 幽灵节点：在窗里换一颗晶体看，不把人踢回被阅读器盖住的晶体库。
      // ⚠️ **偏好也要跟着写**：那一栏是「结构窗固定看哪颗」的记忆，只改 `w.crystal`
      // 的话，关掉这扇窗再点「结构窗」，它又回到上一次选的那颗——而用户刚刚
      // 明明在窗里换过。
      onCrystal: (key) => {
        w.crystal = key;
        setStoryCrystal(key);
        retitleStoryWin(w.id, key);
        view.show(key);
        persistDesk();
      },
      // 窗里那颗「晶体：X」：换一颗看。走的是**同一个选择器**（复用首页那棵树），
      // 好处是它同时把 desk 那一层的入口、抬头、搜索都一起处理了。
      onPickCrystal: () => openFolderPick("crystal"),
    });
    rt.embed = view;
    box.appendChild(view.root);

    const keys = ctx.model.crystalKeys || [];
    const key = ctx.model.hasNode(w.crystal) ? w.crystal : keys.length ? keys[0] : "";
    if (!key) {
      box.textContent = "这张库里还没有晶体。";
      return;
    }
    w.crystal = key;
    // 有存档相机就别再 fit——用户上次推到的位置比「全部装进视野」更准。
    view.show(key, { keepCamera: !!boot });
  }

  async function mountDeskWin(w) {
    const node = winEl(w.id);
    if (!node) return;
    const box = node.querySelector(".kb-v13-desk-page");
    const meta = node.querySelector(".kb-v13-desk-meta");
    // ⚠️ **先问是不是卡片，再问「这份文献在不在」。** 顺序反了的话卡片窗永远显示
    // 「找不到这份文献」——卡片的路径当然不在 `st.docs`（那是**文献**清单）里，
    // 于是每一扇卡片窗都只有一行错话，正文一个字都看不到。
    // 这一条从 3.0 刀 9-B 起就错了，一直到给卡片窗加「能滚 / 能改」时才被
    // 断言逼出来（用户 09-17 报的「卡片悬浮窗缺少垂直滚动条」，根因正是这个：
    // 窗里没有内容，自然也没有滚动条）。
    const isCard = w.kind === "card";
    // 结构窗**也不在 `st.docs` 里**——它画的是一颗晶体，不是一份文献。不把它
    // 一并择出去，它每次都会显示「找不到这份文献：」（而它的 path 本来就是空的，
    // 那句话后面连个文件名都没有）。
    const isStory = w.kind === "storyline";
    const d = isCard || isStory ? null : st.docs.find((x) => x.path === w.path);
    if (!isCard && !isStory && !d) {
      box.textContent = "找不到这份文献：" + w.path;
      return;
    }
    const rt = rtOf(w.id);
    const myGen = ++rt.gen;
    const isStale = () => rt.gen !== myGen;
    box.textContent = "";
    box.classList.remove("kb-v13-reader-page-err");
    // 编辑态是**临时**的：退出、保存、撤销、翻页任何一条路都回到只读那一套。
    // 漏了这两行的话，卡片窗会留在 `-editing`（flex 列）的排版里，
    // 渲染出来的正文被压成一条。
    box.classList.remove("kb-v13-desk-editing");
    // ⚠️ 结构窗**不能**吃 `-flow`：那是「块级流 + 纵向滚动 + 内边距」那套排版，
    // 而结构窗里是一块自绘的可平移世界——多一圈 padding，相机算出来的世界原点
    // 就偏一圈，整片画面跟着歪（`-embed` 那条注释里写了同一件事）。
    // 这里和 `deskBoxClass` 是**两处**决定类名的地方，改一处别忘了这一处。
    if (!isFixedKind(w.kind) && w.kind !== "storyline") box.classList.add("kb-v13-desk-flow");
    // 正在画的是**只读视图**，编辑态到此为止。只把 `on` 放下、不整个丢掉：
    // 保存之后那条「已保存 [撤销]」还要靠 `prev` / `base` 才撤得回去。
    // （改行号区间、翻页也会走到这儿——那时候编辑框本来就该让位。）
    //
    // ⚠️ **编辑区必须显式摘掉**：原生编辑器那一支背后挂着宿主一个视图对象，
    // 光把 DOM 清掉不算收工——每开一次编辑就漏一个（同 app.js 里
    // `win.__kbV13Reader.destroy()` 那条纪律）。兜底的 textarea 那边是无操作。
    if (rt.edit) {
      rt.edit.on = false;
      if (rt.edit.field) {
        try {
          rt.edit.field.destroy();
        } catch (e) {
          /* 收尾失败不该挡住重画 */
        }
        rt.edit.field = null;
      }
    }
    try {
      if (w.kind === "card") {
        // 卡片窗**不经过 source**：它不是一份文献，是库里的一张卡。
        // 正文交给宿主的渲染器（与阅读器里 markdown 那一支同一条路）。
        const card = findCardByPath(w.path);
        if (!card) {
          box.textContent = "找不到这张卡：" + w.path;
          return;
        }
        renderDeskMeta(w, meta);
        await adapter.renderMarkdown(splitCard(card.content || "").body, box, w.path);
        return;
      }
      if (isStory) {
        renderDeskMeta(w, meta);
        mountEmbedStory(w, box);
        return;
      }
      const src = await ensureSource(d);
      if (isStale()) return;
      if (w.kind === "markdown") {
        // markdown 走**行号区间**，不走 source 那套「按分段切页」——两套分页口径
        // 服务两套版式：网格按作者写好的 `---div---`，桌面按用户划的行。
        // `paginateLines` 在这儿只用来数总行数（给标题栏那个「共 N 行」）。
        const { total } = paginateLines(src.raw || "");
        w.total = total;
        // 区间要夹回**这份文件今天的长度**。「＋ 页」那一支给的是「接着上一扇的
        // 结束行再往下 40 行」，存档也可能是按一份更长的文件留下的——文件一短，
        // 顶栏就会写着「行 1–40 · 共 13 行」。而用户正是拿这把尺子去挑区间的，
        // 照着它挑就挑到不存在的地方。
        w.from = Math.max(1, Math.min(total, w.from || 1));
        w.to = Math.max(w.from, Math.min(total, w.to || total));
        renderDeskMeta(w, meta);
        // ✎ 上那句话里带着区间，**区间一变就得跟着改**——它是建窗那一刻写上去的，
        // 改行号只重画内容、碰不到标题栏，不改就是「写着第 1–40 行、其实在看第 3–5 行」。
        const editBtn = node.querySelector(".kb-v13-desk-edit");
        if (editBtn) editBtn.title = "改这一段（第 " + w.from + "–" + w.to + " 行）";
        await mountMarkdownRange(w, box, src.raw || "");
        return;
      }
      w.total = src.pages;
      // ⚠️ **先按页把窗摆好，再把页画进去**。反过来的话画布是按旧的窗宽算的
      // （`mount` 里的 scale 就是 `box.clientWidth / size.w`），画完再改窗
      // 那一页就糊了，而且文字层和画布会错开。
      if (w.kind === "pdf" && src.size) {
        const size = await src.size(w.page);
        if (isStale()) return;
        if (size && size.w > 0) fitDeskWinToPage(w, size);
      }
      renderDeskMeta(w, meta);
      // PDF / 图片那一支包一层 stage：缩放与平移都作用在它身上
      // （画布与文字层一起动，划选照样可用）。
      const host = isFixedKind(w.kind) ? stageOf(node) : box;
      await src.mount(w.page, host, isStale);
      if (isStale()) return;
      restretch(w);
    } catch (e) {
      if (isStale()) return;
      box.textContent = "这一页没画出来：" + ((e && e.message) || e);
      box.classList.add("kb-v13-reader-page-err");
    }
  }

  function addDeskWin(spec) {
    const b = deskBounds();
    // 桌面上还没有尺寸（比如刚切过来还没量到），先给一个能算的兜底
    const box = defaultDeskBox(desk.wins.length, spec.want || { w: 460, h: 620 }, b.w || 900, b.h || 700);
    const w = {
      id: "dw" + ++deskSeq,
      kind: spec.kind,
      path: spec.path,
      // 结构窗用：看哪颗晶体 + 相机（3.0 刀 9-D）。`cam` 由视图自己回写。
      crystal: spec.crystal || "",
      cam: spec.cam || null,
      page: spec.page || 1,
      // markdown 用这两个（文件行号，1 基闭区间）；pdf / image 不用。
      from: spec.from || 1,
      to: spec.to || DESK_PER_PAGE,
      total: 0,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
    };
    desk.wins.push(w);
    desk.active = w.id;
    if (w.kind === "pdf") desk.pageId = w.id; // 新摆上的页窗就是「正在读的那一页」
    buildDeskWin(w);
    mountDeskWin(w);
    refreshDeskUi();
    persistDesk();
    return w;
  }

  function removeDeskWin(id) {
    const i = desk.wins.findIndex((w) => w.id === id);
    if (i < 0) return;
    const [w] = desk.wins.splice(i, 1);
    const node = winEl(id);
    if (node) node.remove();
    // ⚠️ 结构窗得**显式销毁**，不能只把 DOM 摘掉：它内部有几处监听挂在
    // `document` 上（连线编辑的 S / D 那两个键），元素没了监听还在——
    // 表现是「窗关了，按 D 还能删掉一个看不见的东西」。同 floatwin 开头那条。
    const rt = desk.rt.get(id);
    if (rt && rt.embed) rt.embed.destroy();
    desk.rt.delete(id);
    if (desk.active === id) desk.active = desk.wins.length ? desk.wins[desk.wins.length - 1].id : null;
    // 正在读的那扇被关了 → 没有「现在读第几页」了。**不自动挑一扇顶上**：
    // 那会给用户一个他没在看、也没预期的页码，而这一行是要写进他的卡片里的。
    if (desk.pageId === id) desk.pageId = null;
    releaseSource(w.path);
    refreshDeskUi();
    persistDesk(); // 关掉的那扇不该在下次打开时又冒出来
  }

  /** 按模型把桌面整个重建一遍（切进来、恢复存档时用）。 */
  function renderDesk() {
    deskEl.textContent = "";
    for (const w of desk.wins) buildDeskWin(w);
    for (const w of desk.wins) mountDeskWin(w);
    refreshDeskUi();
  }

  function refreshDeskUi() {
    deskBtn.setAttribute("aria-pressed", desk.on ? "true" : "false");
    deskBtn.classList.toggle("kb-v13-reader-nav-on", desk.on);
    deskEl.classList.toggle("on", desk.on);
    sheetsEl.classList.toggle("kb-v13-reader-sheets-off", desk.on);
    addPageBtn.disabled = !desk.on || !st.doc;
  }

  function setDeskMode(on) {
    const next = !!on;
    if (next === desk.on) return;
    desk.on = next;
    if (desk.on) {
      refreshDeskUi(); // 先让桌面显形，不然量到的是 0×0，窗会摆到屏幕外去
      // 关掉再打开要回到你摆的那个样子（用户选的「要记住」）。
      if (!desk.wins.length) restoreDesk();
      if (desk.wins.length) {
        renderDesk();
      } else if (st.doc) {
        // 存档是空的（第一次用、或者上次全关了）：切过去看见一块空地，
        // 用户不知道该干什么——先替他摆一页。
        addDeskWin({ kind: st.doc.kind, path: st.doc.path, page: 1 });
      }
    } else {
      persistDesk(); // 收起来也算「摆定了」
      refreshDeskUi();
      // 桌面开着的时候页区是 `display:none`，`relayout()` 量到的宽度是 0，
      // 算出来的网格是废的。切回来必须重排一次，否则回到网格会看见一屏乱码。
      relayout();
    }
  }

  /** 「＋ 页」：把当前这份文献的下一段摆上桌。 */
  function addDeskPage() {
    if (!st.doc) {
      say("先选一份文献", false);
      return null;
    }
    if (st.doc.kind === "markdown") {
      // markdown 没有页，所以「下一段」= 接着桌上最后一个同文献窗的结束行往下续。
      // 自动铺开那一半在这儿：第一扇窗从第 1 行起、每扇 `DESK_PER_PAGE` 行；
      // 想改哪一扇的起止，去它自己的标题栏里改（那是「单页微调」那一半）。
      const mine = desk.wins.filter((w) => w.path === st.doc.path);
      const lastTo = mine.reduce((m, w) => Math.max(m, w.to || 0), 0);
      const from = lastTo + 1;
      const total = mine.length ? mine[0].total || 0 : 0;
      if (total && from > total) {
        say("这份文献的行都摆上桌了", false);
        return null;
      }
      return addDeskWin({ kind: "markdown", path: st.doc.path, from, to: from + DESK_PER_PAGE - 1 });
    }
    // 接着桌上已有的同文献窗往下排；一扇都没有就从第 1 页起。
    const mine = desk.wins.filter((w) => w.path === st.doc.path);
    const used = mine.map((w) => w.page);
    const total = (mine.length && (st.doc && mine[0].total)) || pageCount() || 0;
    let next = 1;
    while (used.includes(next)) next++;
    if (total && next > total) {
      say("这份文献的页都摆上桌了", false);
      return null;
    }
    return addDeskWin({ kind: st.doc.kind, path: st.doc.path, page: next });
  }

  // ---- 卡片盒（3.0 刀 9-B）----
  //
  // 读文献的时候，手边那堆旧卡是**看不见的**：要先关掉阅读器、回晶体库、翻到那张卡。
  // 这一块把它拉到手边——搜一下、点一下，卡就摆到桌面上，并且**当场在那张卡里留一行
  // 指回这一页的链接**（`[[文献.pdf#page=7]]`）。
  //
  // 那一行是这个功能的**结局**：日后复习这张卡时，点它就能跳回原文那一页。
  // 所以写盘那一路的所有讲究（基线比对、冲突不覆盖、一次撤销）都照 editform 那套来。
  //
  // 形态上它是个**浮窗**（走 floatwin，用户点名要复用的那个组件），挂在这个阅读器
  // 自己的宿主上——不能挂默认的全息遮罩，理由见 `#kb-reader-floats` 那段注释。
  const cardBox = {
    unit: null,
    list: null,
    msg: null,
    hd: null,
    query: "",
    open: new Set(), // 展开着的文件夹 key（会话内，不落盘——它是「我现在翻到哪儿」，不是偏好）
    undo: null, // { path, title, prev, base, at }，与 editform 的条目同形
    conflict: null, // 撞冲突时把「卡片 + 那条链接」暂存，好让「覆盖」重试
  };

  /**
   * 全库的文件夹树。用户选的范围是**整个知识卡片库**，不按文件夹限制。
   *
   * 3.0 刀 9 第二版：这里从前是摊平成一张卡表，现在直接把首页「文件夹」面板
   * 那棵树拿来画（同一份 `treeHtml` / `readPick` / `filterTree`）——
   * 用户的话是「卡片盒里面应该复用首页的文件夹功能」。
   */
  function cardTree() {
    return ctx.model && ctx.model.folderTree ? ctx.model.folderTree() : [];
  }

  /** 树里所有文件夹的 key，搜索时用来全摊开 */
  function allKeys(nodes, out = new Set()) {
    for (const g of nodes || []) {
      out.add(g.key);
      allKeys(g.children, out);
    }
    return out;
  }

  function sayCardBox(text, ok, action) {
    const el = cardBox.msg;
    if (!el) return;
    el.textContent = "";
    el.classList.toggle("kb-v13-cardbox-bad", !ok);
    const span = EL("span", "kb-v13-cardbox-msgtext");
    span.textContent = text;
    el.appendChild(span);
    if (action) {
      const btn = EL("button", "kb-v13-cardbox-act", action.label);
      btn.type = "button";
      btn.addEventListener("click", action.onClick);
      el.appendChild(btn);
    }
  }

  /** 卡片那一行右边那颗「留链」按钮（回链从 3.0 刀 9 第二版起是**手动**的） */
  function linkBtnHtml(card) {
    return (
      '<button type="button" class="kb-v13-cardbox-link" data-op-link="' + esc(card.path) + '"' +
      ' title="在这张卡里留一行指回你正在读的那一页">留链</button>'
    );
  }

  function renderCardTree() {
    const list = cardBox.list;
    if (!list) return;
    const raw = cardTree();
    const q = cardBox.query.trim().toLowerCase();
    const { groups, size, nodes } = filterTree(raw, q);
    const total = countCards({ cards: [], children: raw });

    cardBox.hd.textContent = q
      ? "卡片盒 · 找到 " + size + " 张"
      : "卡片盒 · " + countNodes(raw) + " 颗晶体 · " + total + " 张卡";
    list.classList.toggle("searching", !!q);

    if (!groups.length) {
      list.textContent = "";
      const empty = EL("div", "kb-v13-cardbox-empty");
      // 空的两句话不一样：一个是「库里就没有」，一个是「你搜的词没有」。
      empty.textContent = q ? "没有匹配的卡片。" : "库里还没有卡片。";
      list.appendChild(empty);
      return;
    }
    // 搜索时一律摊开：筛完还要一个个点开三角，那就不叫搜了。
    const open = q ? allKeys(groups) : cardBox.open;
    // ⚠️ 这里**整块换 innerHTML**——卡片树不像上面那个搜索框，它自己不含输入框，
    // 重画不会碰到焦点（folders.js 那条「搜索框只建一次」的教训管的是输入框本身，
    // 而输入框在 `list` 的**外面**）。
    list.innerHTML = treeHtml(groups, open, "", null, linkBtnHtml);
    // 头部文案由 `hd` 那一行负责，树这边不再画一遍
    const head = list.querySelector(".kb-v13-op-head");
    if (head) head.remove();
    void nodes;
  }

  /**
   * 建卡片盒的内容节点，只建一次。
   *
   * ⚠️ **搜索框只建一次，之后只换下面那一截树**。整块重画会把输入框连同焦点、
   * 光标位置一起丢掉——打一个字断一次，那个框就没法用了（`folders.js:50-55` 踩过）。
   *
   * 节点建好后先停在 hold 里：`openFloat` 要求 `unit` **已经连在文档上**
   * （它要 `home.insertBefore(slot, unit)`），所以得先有个家。
   */
  function ensureCardBox() {
    if (cardBox.unit) return cardBox.unit;
    const unit = EL("div", "kb-v13-cardbox-panel");
    const hd = EL("div", "kb-v13-cardbox-hd");
    const search = doc.createElement("input");
    search.type = "text";
    search.className = "kb-v13-cardbox-search";
    search.placeholder = "搜晶体、卡片标题或概念";
    search.setAttribute("autocomplete", "off");
    search.setAttribute("aria-label", "搜卡片");
    search.addEventListener("input", () => {
      cardBox.query = search.value;
      renderCardTree();
    });
    // 输入框里的按键不许漏给阅读器：不然在搜索框里按方向键会去翻屏。
    search.addEventListener("keydown", (e) => e.stopPropagation());
    const list = EL("div", "kb-v13-op-body kb-v13-cardbox-list");
    const msg = EL("div", "kb-v13-cardbox-msg");
    // 走事件委托：每次搜索都重建一棵树，一个个绑迟早会漏。
    // 分流用首页文件夹面板那一份 `readPick`（两种面板的点击语义是同一套）。
    list.addEventListener("click", (e) => {
      const hit = readPick(e);
      if (!hit) return;
      if (hit.kind === "toggle" || hit.kind === "pick") {
        // 在卡片盒里，点文件夹名和点三角是同一件事：展开/收起。
        // （首页那份点名字是「钻进那颗晶体」——这里没有「层」可钻。）
        if (cardBox.open.has(hit.key)) cardBox.open.delete(hit.key);
        else cardBox.open.add(hit.key);
        renderCardTree();
        return;
      }
      const card = ctx.model.byPath.get(hit.path);
      if (!card) return;
      if (hit.kind === "card") onCardPick(card);
      else if (hit.kind === "link") onCardLink(card);
    });
    unit.append(hd, search, list, msg);
    holdEl.appendChild(unit);
    cardBox.unit = unit;
    cardBox.hd = hd;
    cardBox.list = list;
    cardBox.msg = msg;
    return unit;
  }

  /** 最近活跃过的那扇**页**窗（PDF）。回链的页码只能从它那儿来。 */
  function focusedPageWin() {
    const w = desk.wins.find((x) => x.id === desk.pageId);
    return w && w.kind === "pdf" ? w : null;
  }

  /** 回链里那个文件名。 `[[讲义.pdf#page=7]]` 的主语是**文件名**，不是路径。 */
  function linkFor(win) {
    return "[[" + toStr(win.path).split("/").pop() + "#page=" + win.page + "]]";
  }

  function findCardByPath(path) {
    return ctx.model.byPath.get(path) || null;
  }

  /**
   * 往卡片正文末尾追一行回链。
   *
   * @param {boolean} force 「用我的覆盖」——撞过冲突之后用户明确选的，跳过基线比对。
   *
   * 三件事的顺序与 `editform.js` 的 `refreshAfterWrite` 一致：
   * 更新模型（`applyCardFields`）→ 重算关系图 → 重画 → 落状态。
   */
  async function writeBacklink(card, link, force) {
    const base = card.content == null ? "" : card.content;
    // 去重：这张卡里已经有指回同一页的链了，就不重复追一行。
    if (!force && base.indexOf(link) >= 0) {
      sayCardBox("这张卡里已经有指回这一页的链接了，没有重复写。", true);
      return "dup";
    }
    const { body } = splitCard(base);
    const content = patchBody(base, stripBodyPrefix(body) + "\n\n" + link + "\n");
    let res;
    try {
      // `base` 是**加载这张卡那一刻**的原文。适配层拿它跟磁盘现状比对，
      // 不一致就回 conflict、**不写**——多设备同步下这张卡可能刚被手机改过。
      res = await adapter.writeCard(card.path, content, force ? {} : { base });
    } catch (e) {
      sayCardBox("写不进去：" + ((e && e.message) || e), false);
      return "error";
    }
    if (!res || !res.ok) {
      if (res && res.reason === "conflict") {
        cardBox.conflict = { card, link };
        sayCardBox("这张卡在别处被改过，**没有**写。", false, {
          label: "用我的覆盖",
          onClick: () => {
            const c = cardBox.conflict;
            cardBox.conflict = null;
            if (c) writeBacklink(c.card, c.link, true);
          },
        });
        return "conflict";
      }
      sayCardBox(res && res.reason === "missing" ? "这张卡的文件不在了。" : "写盘失败。", false);
      return "error";
    }
    // 用**回读的真实全文**更新模型，不是我们自己拼的那份（宿主可能规范化了行尾）。
    applyCardFields(card, {}, res.content);
    if (ctx.refreshRelations) ctx.refreshRelations();
    // ⚠️ **不要调 `ctx.refreshCard`**。它的名字看着像「重画那张卡」，实际是
    // `showHologram(ctx, card, …, {preserve:true})`——**去把那张卡的全息面板打开**，
    // 而 `showHologram` 开头第一句就是 `closeAllFloats(ctx)`。在阅读器里调的后果：
    //   1. 卡片盒这扇浮窗被收掉，节点被搬回 `display:none` 的 hold，
    //      表现是「点一下卡片、卡片盒就没了」（这一条是测试抓出来的：**写盘成功了，
    //      但第二次点击时元素不可见**）；
    //   2. 顺带在阅读器背后打开一张卡的面板。
    // `editform.js` 那边调它是对的——那里本来就开着那张卡的面板，刷它是应该的。
    // 这里是两处语境不同、同一个钩子含义不同。
    if (ctx.refreshCards) ctx.refreshCards();
    if (ctx.refreshCrystalLayer) ctx.refreshCrystalLayer();
    if (ctx.flushViewState) ctx.flushViewState();
    cardBox.undo = { path: card.path, title: card.title, prev: base, base: res.content, at: Date.now() };
    sayCardBox("已写入回链 " + link, true, { label: "撤销", onClick: () => undoBacklink() });
    return "ok";
  }

  /** 写盘之后的后悔药。**只给一层、不给重做**——与 editform 同一条规矩。 */
  async function undoBacklink() {
    const u = cardBox.undo;
    if (!u) return;
    cardBox.undo = null;
    // 五分钟过期，与 editform 一致：写盘都是真磁盘写 + 一次多端同步，
    // 撤销窗口开太久，撤掉的就更可能是别处的新改动了。
    if (Date.now() - u.at > 5 * 60 * 1000) {
      sayCardBox("撤销已经过期了。", false);
      return;
    }
    const card = findCardByPath(u.path);
    let res;
    try {
      // 基线传「刚写下去那份的**回读**」——传旧的必假冲突，不传就是静默覆盖别处的改动。
      res = await adapter.writeCard(u.path, u.prev, { base: u.base });
    } catch (e) {
      sayCardBox("撤销失败：" + ((e && e.message) || e), false);
      return;
    }
    if (!res || !res.ok) {
      sayCardBox(
        res && res.reason === "conflict" ? "这张卡在这之后又被改过，没有撤销。" : "撤销失败。",
        false
      );
      return;
    }
    if (card) applyCardFields(card, {}, res.content);
    if (ctx.refreshRelations) ctx.refreshRelations();
    // 同上：**不调 `refreshCard`**（那是「打开那张卡的面板」，会 `closeAllFloats`）。
    if (ctx.refreshCards) ctx.refreshCards();
    if (ctx.refreshCrystalLayer) ctx.refreshCrystalLayer();
    if (ctx.flushViewState) ctx.flushViewState();
    sayCardBox("已撤销，那张卡回到原样。", true);
  }

  /** 点一张卡 = 摆到桌面上。**不写盘**（3.0 刀 9 第二版起回链是手动的）。 */
  function onCardPick(card) {
    // 桌面没开就先开——「点了没反应」是最不受欢迎的反馈。
    // （开桌面会顺手摆上一扇页窗，它就成了「正在读的那一页」。）
    if (!desk.on) setDeskMode(true);
    addDeskWin({ kind: "card", path: card.path });
    sayCardBox("已摆到桌面。要留回链就点那张卡右边的「留链」。", true);
  }

  /**
   * 点「留链」= 往这张卡的正文末尾追一行 `[[文献#page=N]]`（3.0 刀 9 第二版）。
   *
   * 从前这一步是**点卡片就自动做**的。改手动是两个理由：
   *   1. 「摆上来看一眼」和「在这张卡里留一笔」是两件事，后者是**永久写盘**，
   *      不该由一个「看一眼」的动作顺手做掉；
   *   2. 写进去以后这张卡就不再算孤岛、故事线里还会多一个指向 PDF 的幽灵节点
   *      （见 writeBacklink 那段）——那是个要人自己点头的后果。
   *
   * 撤销照旧：写入成功后卡片盒上会出现「已写入回链 [撤销]」。
   */
  async function onCardLink(card) {
    // 页码只能来自**当前聚焦的那扇页窗**：桌上可能摆着好几页，没有「正在读哪一页」
    // 就无从知道该链到哪儿——那就不写，并说清为什么。
    const src = focusedPageWin();
    if (!src) {
      sayCardBox("要留回链的话，先点一下你正在读的那扇页窗。", false);
      return;
    }
    await writeBacklink(card, linkFor(src), false);
  }

  function toggleCardBox() {
    const unit = ensureCardBox();
    const open = findFloat(ctx, unit);
    if (open) {
      closeFloat(ctx, open);
      cardBoxBtn.setAttribute("aria-pressed", "false");
      return;
    }
    renderCardTree();
    const bar = EL("span", "kb-v13-cardbox-bartitle");
    bar.textContent = "卡片盒";
    openFloat(ctx, {
      cls: "kb-v13-cardbox",
      host: floatsEl,
      unit,
      barItems: [bar],
      closeTitle: "收起卡片盒",
      ariaLabel: "卡片盒",
      slotText: "卡片盒",
      // 窗减去标题栏之后就是这张面板本身，没有额外的内边距。
      pad: { x: 0, y: 0 },
      // 「想要多宽」在 DOM 里没有出口（节点此刻还藏在 hold 里，量到的是 0），
      // 所以给一个常量——`mathfloat.js` 为同一件事也是这么做的。
      //
      // 3.0 刀 9 第二版：**宽翻一倍**（320 → 640）。用户原话是「宽度太低了，
      // 应该设置为现有的两倍」——里面现在装的是一棵带缩进的文件夹树，
      // 320 那点地方两级就挤没了。上限也跟着放宽（0.5 → 0.9），
      // 不然在宽屏上 640 会先被 maxFrac 砍回 720×0.5=720 以下，等于没加。
      measure: () => ({ w: 640, h: 460 }),
      minW: 360,
      minH: 240,
      maxFrac: { w: 0.9, h: 0.8 },
    });
    cardBoxBtn.setAttribute("aria-pressed", "true");
    sayCardBox("点一张卡摆到桌上；要留回链就点那张卡右边的「留链」。", true);
  }

  // ---- 边看边记：存进哪个文件夹（3.0 刀 9 第二版）----
  //
  // 从前是死的一句话「将建在：文献/xxx/」——卡只能落在文献自己那个文件夹里。
  // 用户要的是自己挑，而且**挑的那个界面要复用首页「文件夹」面板**（同一棵树、
  // 同一套展开收起、同一个搜索习惯）。
  //
  // 选择落盘进 `prefs.readerFolder`（偏好，不是视图状态——它是「我要把卡放哪儿」，
  // 与「我现在看到哪儿」不是一回事）。`""` = 跟着文献走，也就是老行为。
  // 这棵树有两个用途，共用一套画法和一份展开态，靠 `purpose` 分派：
  //   "target"（默认）—— 挑「将建在」哪个文件夹，选中写进 prefs.readerFolder；
  //   "story"        —— 挑看哪颗晶体的故事线，选中直接落进那颗晶体。
  // 之所以不是两套 DOM：用户点名要的就是「复用首页文件夹那棵树」，
  // 而且两边要看的本来就是同一批晶体/文件夹，分开画只会长出两处要同步的代码。
  // 草稿纸那台编辑器（3.0 刀 12 第二半）。null = 没开着。
  let scratch = null;

  const folderPick = { query: "", open: new Set(), el: null, body: null, purpose: "target" };

  /** 现在到底会建到哪儿。空串表示「跟着文献所在的文件夹」。 */
  function targetFolder() {
    const saved = ctx.state && ctx.state.prefs ? toStr(ctx.state.prefs.readerFolder) : "";
    return saved || (st.doc ? toStr(st.doc.folder) : "");
  }

  /** 这一栏现在在「填表单」还是「宿主编辑器」那一档——两档的按钮与字段不一样。 */
  function paintComposeMode() {
    sideEl.classList.toggle("kb-v13-reader-native-on", !!nativeCompose);
  }

  function paintTargetFolder() {
    const f = targetFolder();
    targetBtn.textContent = shortFolder(f) || "卡片根目录";
    targetBtn.title =
      "现在会建到：" + (f || "卡片根目录") + "（点一下换一个）";
  }

  /** 只要文件夹、不要卡片的树——挑目的地时卡片那一行只会碍事 */
  function foldersOnly(nodes) {
    return (nodes || []).map((g) => ({ ...g, cards: [], children: foldersOnly(g.children) }));
  }

  /** 按 key 在树里找那一层（挑目的地时要它的**宿主路径**，见 model.folderTree） */
  function findFolderNode(nodes, key) {
    for (const g of nodes || []) {
      if (g.key === key) return g;
      const hit = findFolderNode(g.children, key);
      if (hit) return hit;
    }
    return null;
  }

  function renderFolderPick() {
    const body = folderPick.body;
    // 「删除哪张卡」那一档要看见卡片——别的档用 foldersOnly 把它们剥掉了
    const raw = pickIsCard(folderPick.purpose) ? cardTree() : foldersOnly(cardTree());
    const q = folderPick.query.trim().toLowerCase();
    const { groups } = filterTree(raw, q);
    body.textContent = "";
    body.classList.toggle("searching", !!q);
    // 「跟着文献走」只对「挑建卡的文件夹」有意义——去看故事线时没有「跟着谁走」
    // 这回事，摆一颗按下去不知道会发生什么的按钮比不摆更糟。
    if (folderPick.purpose === "target") {
      const all = EL("button", "kb-v13-reader-folderpick-all", "跟着文献走（默认）");
      all.type = "button";
      all.addEventListener("click", () => chooseFolder(""));
      body.appendChild(all);
    }
    if (!groups.length) {
      const empty = EL("div", "kb-v13-cardbox-empty", "没有匹配的文件夹。");
      body.appendChild(empty);
      return;
    }
    const box = EL("div", "kb-v13-reader-folderpick-tree");
    box.innerHTML = treeHtml(groups, q ? allKeys(groups) : folderPick.open, "", null, null);
    const head = box.querySelector(".kb-v13-op-head");
    if (head) head.remove();
    body.appendChild(box);
  }

  function chooseFolder(path) {
    ctx.state.prefs = { ...(ctx.state.prefs || {}), readerFolder: toStr(path) };
    if (ctx.savePrefs) ctx.savePrefs();
    hideFolderPick();
    paintTargetFolder();
    say(path ? "以后的卡建在：" + (shortFolder(path) || path) : "以后的卡跟着文献走", true);
  }

  function hideFolderPick() {
    const wasStory = pickIsCrystal(folderPick.purpose);
    folderPick.el.classList.remove("open");
    targetBtn.setAttribute("aria-expanded", "false");
    // 把上面 openFolderPick 临时点亮的那一栏还回去。判据抄的是 refreshBar 那一条
    // （没文献就藏），不另立规则——两处口径一旦不一样，就会出现「关掉树之后
    // 右边多出一栏空的」，而那种坏法看着像布局坏了，查起来要绕远路。
    if (!st.doc) sideEl.classList.add("kb-v13-reader-side-off");
    // 顺手把刚才请走的那一层还回来（只有「什么都没打开」时才需要它）。
    // 阅读器已经挂起/关掉时不做——那会儿屏幕上不该再冒出任何东西，
    // 该由 resume() 按 open() 同一条规矩摆回来。
    if (wasStory && !st.doc && st.open && !st.hidden) showPicker();
  }

  /**
   * 抬头与占位符按用途取。三档挑的东西不一样，同一句话摆在三处，
   * 至少有两处是错的——而「搜文件夹」和「搜晶体」搜的确实是两样。
   */
  const PICK_TEXT = {
    target: { hd: "存进哪个文件夹", find: "搜文件夹" },
    // 切走看整屏那一档
    story: { hd: "看哪颗晶体的故事线", find: "搜晶体" },
    // 结构窗那一档（用户 09-19：看哪颗晶体要自己选）
    crystal: { hd: "结构窗看哪颗晶体", find: "搜晶体" },
    // 3.0 刀 12：删哪颗晶体
    delete: { hd: "删除哪颗晶体", find: "搜晶体" },
    // 3.0 刀 12 第三版：删一张卡（用户 09-20）。**这一档要看得见卡片**，
    // 别的档用 `foldersOnly` 把它们剥掉了。
    deletecard: { hd: "删除哪张卡", find: "搜卡片" },
  };
  /** 这几档挑的是**晶体**（收 key），只有 target 挑文件夹（收宿主路径）。 */
  const pickIsCrystal = (p) => p === "story" || p === "crystal" || p === "delete";
  /** 这一档挑的是**卡片**（收 path），树里要保留卡片那一级。 */
  const pickIsCard = (p) => p === "deletecard";

  /** 打开这棵树。`purpose` 见 folderPick 那只常量上面那段。 */
  function openFolderPick(purpose) {
    folderPick.purpose = PICK_TEXT[purpose] ? purpose : "target";
    const byCrystal = pickIsCrystal(folderPick.purpose);
    // 那棵树长在「边看边记」这一栏里，而这一栏**没有文献时是整块藏着的**
    // （见 refreshBar 最后一行）。挑晶体那两颗按钮却在顶栏、永远点得到——
    // 一份文献都没开就点它的话，树会「打开」在一栏看不见的地方，表现就是
    // 点了没反应。所以这两档临时把那一栏亮出来，收起来时再还回去。
    if (byCrystal) {
      sideEl.classList.remove("kb-v13-reader-side-off");
      // 一份文献都没开的时候，整块屏盖着「选哪份文献」那一层。树就长在它底下，
      // 不请走它就等于点不到——症状和「这颗按钮坏了」一模一样。
      hidePicker();
    }
    const text = PICK_TEXT[folderPick.purpose];
    folderHd.textContent = text.hd;
    folderSearch.placeholder = text.find;
    folderSearch.setAttribute("aria-label", text.find);
    // 每次打开都从干净状态起：搜索词留着的话，下次点开只看得到上一次筛剩的那几个。
    folderPick.query = "";
    folderSearch.value = "";
    renderFolderPick();
    folderPick.el.classList.add("open");
  }

  function toggleFolderPick() {
    // 已经开着、而且开的是同一个用途 —— 那就是「再点一下收起来」。
    // 用途不同（比如挑故事线挑到一半又去点「将建在」）就换成新的那一档，
    // 不先收再开，省掉一次「点了没反应」的错觉。
    if (folderPick.el.classList.contains("open")) {
      if (folderPick.purpose === "target") {
        hideFolderPick();
        return;
      }
      targetBtn.setAttribute("aria-expanded", "false");
    }
    openFolderPick("target");
    targetBtn.setAttribute("aria-expanded", "true");
  }

  /**
   * 从「故事线」那颗按钮落进某颗晶体。
   *
   * ⚠️ **三步的顺序是硬约束，一步都不能挪**：
   *   1. 先写 `levelStage`。`restoreExpanded` 内部会走 `ctx.syncStage()`
   *      → `applyStage`，而档位是**按偏好推导**出来的（stage.js 的 stageOf）。
   *      反过来先钻进去再改偏好，那一下同步就把档位推回「卡阵」，
   *      屏幕上就是「点了故事线，出来的是卡阵」。
   *   2. 再挂起阅读器。它只摘 `.open`，`st.doc` / `desk.wins` / `sources`
   *      一个都不动，所以点回「文献」时还是这一份、还是那个桌面。
   *   3. 最后 `restoreExpanded(ctx, key, 0)`——和首页「文件夹」面板点一颗晶体
   *      走的是同一条路（folders.js 的 onFolderPanelClick），两处进去的样子才一致。
   *
   * ⚠️ 吃的是**晶体 key**（`Python/数据分析`），不是宿主路径
   *   （`3.资产舱/知识卡片/Python/数据分析`）。隔壁 `chooseFolder` 收的偏偏是后者
   *   ——这两个字段在这份文件里长得太像，是最容易搞混的一处，别顺手抄错。
   */
  function gotoStoryline(key) {
    const k = toStr(key);
    if (!k || !ctx.model || !ctx.model.hasNode(k)) return;
    ctx.state.prefs = { ...(ctx.state.prefs || {}), levelStage: "storyline" };
    if (ctx.savePrefs) ctx.savePrefs();
    hideFolderPick();
    suspend(); // 它自己会通知顶栏改口（见 suspend 末尾）
    restoreExpanded(ctx, k, 0);
  }

  /**
   * 点「故事线」时去哪颗晶体。
   *
   * 先看晶体库自己记着的那颗——`state.openCrystal` 是「你在库里最后钻进的那颗」，
   * 阅读器只是盖在上面的一块屏，底下那个位置从头到尾没动过。有就直接去，
   * 这就是「记住上次那颗」；没有（人停在最外圈的晶体环上）才把树摊开让他挑，
   * 那也正是「复用首页文件夹」那一步。
   */
  function storyTarget() {
    const cur = toStr(ctx.state && ctx.state.openCrystal);
    if (cur && ctx.model && ctx.model.hasNode(cur)) {
      gotoStoryline(cur);
      return;
    }
    openFolderPick("story");
  }

  // ---- 边看边记：在宿主编辑器里写（3.0 刀 9 第三版）----
  //
  // 宿主那个编辑器是**文件视图**，必须挂在真实存在的文件上；而这一栏背后是一张
  // **还没建出来的卡**。所以这条路的第一步是**把文件建出来**（这也是 Obsidian 自己
  // 的做法：要写一篇笔记，先建出那篇笔记），建完再把正文那一格换成绑它的编辑器。
  //
  // 一旦切过去，**写盘就归宿主了**（它随编辑自动存盘），所以：
  //   · 「存进晶体库」收起来——卡已经建出来了，再点只会报「已经有一张叫…的卡」；
  //   · 正文不再走核心的 textarea，`nativeCompose.handle.getValue()` 是想读正文时的入口。
  let nativeCompose = null; // { handle, path, title }

  /** 把这一栏切回「填表单 → 存进晶体库」那一档。 */
  /**
   * 「草稿纸」（3.0 刀 12 第二半，用户 09-19）。
   *
   * 读文献时手边那块**用 Obsidian 原生编辑器写的便签**。它**不是卡片**：
   * 落在宿主指定的草稿纸文件夹里、不参与晶体库的关系图。
   *
   * 和「在编辑器里写」的分工：那个是「我要建一张卡」，这个是「我先记下来再说」。
   *
   * ⚠️ **关掉不删文件**。它是常驻的便签——用户按「收起」的意思是「先不看了」，
   * 不是「把刚才写的扔掉」。删的那条路在「返回」那边，而且只删**刚建出来的卡**。
   */
  /** 一张草稿纸的路径。名字由用户给（用户 09-20）。 */
  function scratchPathOf(name) {
    return String(scratchSpec.folder).replace(/\/+$/, "") + "/" + safeFileName(name) + ".md";
  }

  /**
   * 建出（或者确认已经有）一张草稿纸。**已存在不算错**——它就是同一张便签。
   *
   * ⚠️ 两条路都要先叫它：用户点「草稿纸」是新建，而「返回」是**可能已有、也可能没有**
   * （同名的那张之前建过）。而 `writeCard` 对不存在的路径回 `missing`——
   * 少了这一步，用户第一次用「返回」时正文会卡在半路。
   */
  async function ensureScratchNamed(name) {
    if (!scratchSpec) return { ok: false, reason: "unsupported" };
    const clean = safeFileName(toStr(name));
    if (!clean) return { ok: false, reason: "empty" };
    let res = null;
    try {
      res = await adapter.createCard(clean, "", scratchSpec.folder);
    } catch (e) {
      res = { ok: false, reason: "error", message: (e && e.message) || String(e) };
    }
    if (res && res.ok) return { ok: true, path: toStr(res.path) || scratchPathOf(clean) };
    if (res && res.reason === "exists") return { ok: true, path: scratchPathOf(clean) };
    return res || { ok: false, reason: "error" };
  }

  /**
   * 打开一张草稿纸。
   *
   * ⚠️ **它是一张真卡，所以打开它的方式和卡片一模一样：摆到桌面上当一扇窗**
   * （用户 09-20 点名：「应该像卡片一样做成一个悬浮窗」）。
   *
   * 第一版是把它挂进「边看边记」那一栏的宿主编辑器里——那是**错的**：
   * 那一栏的定位是「新建一张卡」的表单，不是看卡的地方。而桌面上的卡片窗
   * 现在本来就用原生编辑器（刀 12 第一半），所以走那条路反而更顺、
   * 也更像「这就是一张卡」。
   */
  function openScratchAt(path, label) {
    let card = ctx.model.byPath.get(path);
    if (!card) {
      // 刚建出来的那张还没登记进模型——**必须先登记**，否则桌面上那扇窗
      // 找不到它（`mountDeskWin` 靠 `findCardByPath`）。这一套与
      // `openNativeCompose` 建完卡之后那段同源。
      card = ctx.model.addCard({
        path,
        folder: parentOf(path),
        name: baseName(path).replace(/\.md$/i, ""),
        concept: "",
        source: "",
        tags: [],
        content: "",
      });
      if (ctx.renderCrystals) ctx.renderCrystals();
      if (ctx.refreshCrystalLayer) ctx.refreshCrystalLayer();
      if (ctx.refreshOrphans) ctx.refreshOrphans();
      if (ctx.refreshFolders) ctx.refreshFolders();
    }
    if (!card) return false;
    // 桌面那种「一页一扇窗」的层。**不调 onCardPick**：它嘴里说的是「留链」那套，
    // 对草稿纸是错话。
    if (!desk.on) setDeskMode(true);
    addDeskWin({ kind: "card", path: card.path });
    say("草稿纸「" + (label || card.title) + "」摆到桌面上了——它是一张**真卡**。", true);
    return true;
  }

  /**
   * 点顶栏「草稿纸」：**先摊开起名那一步**（用户 09-20）。
   *
   * 起的那张卡落在「草稿纸」**那颗晶体**里——所以它是一张真卡，会出现在库里、
   * 参与关系图。命名完回车就打开它。
   */
  function openScratchForm() {
    if (!scratchSpec) return;
    if (nativeCompose) {
      sayNewCrystal("先把上面那张卡写完（或者点「返回」）。", false);
      return;
    }
    if (scratch) {
      closeScratch(); // 已经开着 = 再点一下收起
      return;
    }
    hideScratchForm();
    scratchForm.classList.add("open");
    scratchName.value = "";
    sayNewCrystal("", true);
    scratchName.focus();
  }

  function hideScratchForm() {
    scratchForm.classList.remove("open");
    scratchName.value = "";
  }

  /** 起名那一步回车 / 点「写」。 */
  async function startScratch() {
    const name = safeFileName(scratchName.value);
    if (!name) {
      sayNewCrystal("先给这张草稿纸起个名字。", false);
      scratchName.focus();
      return;
    }
    const made = await ensureScratchNamed(name);
    if (!made.ok) {
      sayNewCrystal("草稿纸没建起来：" + toStr(made.message || made.reason || ""), false);
      return;
    }
    hideScratchForm();
    const ok = await openScratchAt(made.path, name);
    if (ok) sayNewCrystal("「" + name + "」开着——它是**一张真卡**，Obsidian 自己存盘。", true);
  }

  /** 收起草稿纸。**不删文件**（见 openScratch 那段）。 */
  function closeScratch() {
    if (scratch) {
      try {
        scratch.handle.destroy(); // 背后挂着宿主一个视图对象，不摘就是每开一次漏一个
      } catch (e) {
        /* 收尾失败不该挡住界面 */
      }
      scratch = null;
    }
    sideEl.classList.remove("kb-v13-reader-scratch-on");
    nativeHost.textContent = "";
  }

  /**
   * 「返回」：**撤掉刚建出来的那张卡**，正文原封不动转进草稿纸。
   *
   * 用户 09-19 的原话：「删除刚才创建的文件，并且所有正文内容原封不动复制到编辑器中」。
   *
   * 这条要存在，是因为「在编辑器里写」**一进去就已经把文件建出来了**
   * （宿主的编辑器是文件视图，没有文件挂不上）——所以写了两行发现不对、
   * 想退回表单，会剩下一张半成品卡在库里。这个是那个的出口。
   *
   * ⚠️ 顺序：先**读正文**，再删文件，最后才动界面。反过来的话编辑器一拆就读不到了。
   * ⚠️ 删卡走 `model.removeCard`（摘一张卡），**不是** `removeFolder`（那是摘一棵子树）。
   */
  /** 有一件破坏性的事在等用户点头（目前只有「删除晶体」）。Esc 认它。 */
  let pendingDelete = null;

  async function returnFromNativeCompose() {
    const nc = nativeCompose;
    if (!nc) return;
    // 1) 先把正文抓出来——拆了编辑器就读不到了
    // ⚠️ **契约里的编辑器句柄是 `getValue()`，不是 `value()`。**
    // `value()` 是 `mountEditArea` 那层包装的口径（`saveDeskEdit` 用的是它），
    // 而这里拿到的是**适配层直接给的** handle——两个不是同一个对象。
    // 第一版写成 `.value()`，`try/catch` 把 TypeError 吃成空串：
    // 卡删掉了、正文没了，**而且一声不响**。这是全流程最不能接受的一种收场。
    let text = "";
    try {
      text = toStr(nc.handle.getValue());
    } catch (e) {
      text = "";
    }
    const title = nc.title;
    const path = nc.path;

    closeNativeCompose(true);

    // 2) 删掉刚建出来的那张卡（回收站），模型跟着摘
    let res = null;
    try {
      res = await adapter.trashFile(path);
    } catch (e) {
      res = { ok: false, reason: "error", message: (e && e.message) || String(e) };
    }
    if (!res || !res.ok) {
      say("那张卡没删掉，" + (res && res.reason === "missing" ? "文件已经不在了。" : "它在库里还留着。"), false);
      return;
    }
    if (ctx.model.removeCard) ctx.model.removeCard(path);
    if (ctx.renderCrystals) ctx.renderCrystals();
    if (ctx.refreshCrystalLayer) ctx.refreshCrystalLayer();
    if (ctx.refreshOrphans) ctx.refreshOrphans();
    if (ctx.refreshFolders) ctx.refreshFolders();

    // 3) 正文转进草稿纸。**没有草稿纸位置就直接说清正文去哪了**——
    //    静默丢掉用户刚写的东西是最不能接受的一种收场。
    if (!scratchSpec || !text.trim()) {
      say(
        text.trim()
          ? "「" + title + "」撤掉了，但这个宿主没有草稿纸——刚写的正文没了，对不住。"
          : "「" + title + "」撤掉了。",
        !text.trim()
      );
      return;
    }
    // 草稿纸里已经有东西就**接着写**，不覆盖——那是一张便签，不是一次性缓冲。
    //
    // 读旧内容走 `readBinary` + 解码：契约里只有这一个通用的「读文件」入口
    // （`listDocs` 只列清单）。**读不到就当空的**——那样最坏是覆盖一张空便签，
    // 而「因为读不了就干脆不写」会把用户刚写的正文扔掉，那个后果重得多。
    let prev = "";
    try {
      const bytes = await adapter.readBinary(scratchPath);
      if (bytes) prev = new TextDecoder().decode(bytes);
    } catch (e) {
      prev = "";
    }
    const content = prev.trim() ? prev.replace(/\s+$/, "") + "\n\n" + text : text;
    // 草稿纸的名字 = **此时的卡片名 + 「草稿纸」**（用户 09-20）。
    // 同名的那张已经有了就**不新建，直接写进去**——再点一次「返回」时不该长出一堆。
    const scratchTitle = title + "草稿纸";
    const ensured = await ensureScratchNamed(scratchTitle);
    if (!ensured.ok) {
      say("「" + title + "」撤掉了，但草稿纸没建起来，正文没能转过去。", false);
      return;
    }
    const sPath = ensured.path;
    // 那张草稿纸里已经有东西就接着写（读旧内容走 readBinary，见上面那段）
    let prev2 = "";
    try {
      const bytes2 = await adapter.readBinary(sPath);
      if (bytes2) prev2 = new TextDecoder().decode(bytes2);
    } catch (e) {
      prev2 = "";
    }
    const content2 = prev2.trim() ? prev2.replace(/\s+$/, "") + "\n\n" + text : text;
    let w = null;
    try {
      w = await adapter.writeCard(sPath, content2, {});
    } catch (e) {
      w = { ok: false };
    }
    if (!w || !w.ok) {
      say("「" + title + "」撤掉了，但正文没能写进草稿纸。", false);
      return;
    }
    // 无论新建还是写进已有那张，**都直接把它打开**（用户 09-20）
    const opened = await openScratchAt(sPath, scratchTitle);
    say(
      opened
        ? "「" + title + "」撤掉了，正文转到草稿纸「" + scratchTitle + "」里了。"
        : "「" + title + "」撤掉了，正文写进草稿纸了（但它没打开）。",
      true
    );
  }

  function closeNativeCompose(keepSource) {
    if (nativeCompose) {
      try {
        nativeCompose.handle.destroy(); // 背后挂着宿主一个视图对象，不摘就是每开一次漏一个
      } catch (e) {
        /* 收尾失败不该挡住界面 */
      }
      nativeCompose = null;
    }
    sideEl.classList.remove("kb-v13-reader-native-on");
    // ⚠️ 草稿纸开着时**不能清**——两者共用 nativeHost，清了就把它的编辑器摘了
    if (!scratch) nativeHost.textContent = "";
    nameEl.value = "";
    conceptEl.value = "";
    bodyEl.value = "";
    if (!keepSource) sourceEl.value = "";
  }

  /**
   * 建一张**空正文**的卡，然后把正文那一格换成绑它的宿主编辑器。
   *
   * 建卡那一段与 `submitCard` 是同一套（composeCard → createCard 的三态 → addCard
   * → 重画），差别只有正文传空串——正文接下来由宿主写。
   */
  async function openNativeCompose() {
    if (nativeCompose) return;
    // 草稿纸和这台编辑器**共用同一块地方**（nativeHost），不能同时开。
    // 不挡的话后开的那个会把先开的 DOM 顶掉，而先开的那个 handle 还挂着
    // ——「关掉的时候收不干净」那类漏，症状是关阅读器时才炸。
    if (scratch) closeScratch();
    if (!st.doc) {
      say("先选一份文献", false);
      return;
    }
    const name = safeFileName(nameEl.value);
    if (!name) {
      say("先给这张卡起个名字", false);
      nameEl.focus();
      return;
    }
    const concept = conceptEl.value.trim();
    const source = sourceEl.value.trim();
    const content = composeCard({ 概念: concept, 来源: source, tags: [], body: "" });
    let res;
    try {
      res = await adapter.createCard(name, content, targetFolder());
    } catch (e) {
      say("写不进去：" + ((e && e.message) || e), false);
      return;
    }
    if (!res || !res.ok) {
      say(
        res && res.reason === "exists"
          ? "已经有一张叫「" + name + "」的卡了，换个名字"
          : res && res.reason === "error"
            ? "写盘失败：" + toStr(res.message || "")
            : "这张卡没能建起来",
        false
      );
      return;
    }
    const path = toStr(res.path);
    const card = ctx.model.addCard({
      path,
      folder: parentOf(path),
      name: baseName(path).replace(/.md$/i, ""),
      concept,
      source,
      tags: [],
      content: toStr(res.content),
    });
    if (ctx.renderCrystals) ctx.renderCrystals();
    if (ctx.refreshCrystalLayer) ctx.refreshCrystalLayer();
    if (ctx.refreshOrphans) ctx.refreshOrphans();
    if (ctx.refreshFolders) ctx.refreshFolders();

    // 到这儿文件真的存在了，才轮到宿主编辑器。拿不到就明说——卡已经建好了，
    // 用户可以回库里打开它写，功能没丢。
    let handle = null;
    try {
      handle = await adapter.mountEditor(nativeHost, { path, line: 0, text: toStr(res.content) });
    } catch (e) {
      handle = null;
    }
    if (!handle) {
      say("这张卡已经建好了（「" + (card ? card.title : name) + "」），但这个宿主没给出编辑器——回库里打开它写吧。", true);
      nameEl.value = "";
      conceptEl.value = "";
      bodyEl.value = "";
      return;
    }
    nativeCompose = { handle, path, title: card ? card.title : name };
    sideEl.classList.add("kb-v13-reader-native-on");
    say("「" + nativeCompose.title + "」已经建好了，正文由 Obsidian 自己存盘。", true);
    try {
      handle.focus();
    } catch (e) {
      /* 聚焦失败无所谓 */
    }
  }

  // ---- 新建晶体 ----
  //
  // 就是一个文件夹。**建在「将建在」那个文件夹里面**——所以想建一颗顶层晶体，
  // 先把「将建在」指到靠近卡片根目录的地方；不指的话它跟着文献走，「新建晶体」
  // 就会长在文献所在的那个文件夹里（那是用户 09-18 选的，不是默认值失误）。
  //
  // ⚠️ 建完要说清一件事：**它在晶体库里暂时看不见**。那棵树是从**卡片**长出来的，
  // 一个还没有卡的文件夹不会是节点。不说这句，用户体验到的就是「点了没反应」——
  // 本仓最不受欢迎的一种反馈（见 adapter.js 里 createFolder 那一段）。
  /**
   * 这一栏底下那行提示。`action` 给一颗按钮（与卡片盒那条同一个形状）——
   * 「确认删除」就靠它：删除是**唯一会动用户笔记**的动作，不能只问一句「确定吗」。
   */
  /**
   * 点别处就把那行提示收掉（用户 09-20：「一直在那里，点其他地方也不关闭」）。
   *
   * 挂在阅读器根上、**捕获阶段**：点哪儿都先经过它。提示本身那一带要排除——
   * 那上面挂着「撤销」「确认删除」这些按钮，点它们不算「点别处」。
   *
   * ⚠️ 顺带把 `pendingDelete` 也撤了：一行「删掉「X」？」挂在那儿而用户已经去点
   * 别的东西了，那件事就不该还等着他点头——Esc 也不该再认它。
   */
  function dismissTransient() {
    if (pendingDelete) pendingDelete = null;
    if (newCrystalMsg.textContent) sayNewCrystal("", true);
    if (msgEl.textContent) say("", true);
  }

  function sayNewCrystal(text, ok, actions) {
    newCrystalMsg.textContent = "";
    newCrystalMsg.classList.toggle("kb-v13-newcrystal-bad", !ok);
    const span = EL("span", "kb-v13-newcrystal-msgtext");
    span.textContent = text;
    newCrystalMsg.appendChild(span);
    // 收一颗或一排（`{label, onClick, danger}`）。**删除那条要两颗**：
    // 只有「确认」没有「取消」的话，用户唯一的退路是按 Esc——而 Esc 在这个界面里
    // 是「退出阅读器」（用户 09-19 报的）。一颗不可逆的按钮配不上这样的出口。
    for (const act of [].concat(actions || [])) {
      if (!act) continue;
      const btn = EL("button", "kb-v13-cardbox-act" + (act.danger ? " kb-v13-cardbox-danger" : ""), act.label);
      btn.type = "button";
      btn.addEventListener("click", act.onClick);
      newCrystalMsg.appendChild(btn);
    }
  }

  /**
   * 「删除晶体」：先摊开树让他**挑哪一颗**，再确认（3.0 刀 12）。
   *
   * 为什么不复用「将建在」那个当前选中：它的默认是**跟着文献走**，
   * 而删除的默认绝不该是「删掉文献所在的那个文件夹」。**删除必须是一次明确的指认。**
   */
  function deleteCrystalFlow() {
    hidePicker();
    pendingDelete = null; // 上一次那个待确认作废（再点一次 = 重新挑）
    // 一栏都没有的库没什么可删的——摆一颗按了没反应的按钮比不摆更糟
    if (!(ctx.model.crystalKeys || []).length) {
      sayNewCrystal("这张库里还没有晶体。", false);
      return;
    }
    openFolderPick("delete");
    sayNewCrystal("挑一颗要删的晶体。", true);
  }

  /**
   * 「删除卡片」（用户 09-20）：和删除晶体同一套，只是挑的是**一张卡**。
   *
   * 与删除晶体的差别只有两处：挑的那棵树**要看得见卡片**（`pickIsCard`），
   * 以及删的是文件、模型走 `removeCard`（摘一张）而不是 `removeFolder`（摘一棵子树）。
   */
  function deleteCardFlow() {
    hidePicker();
    pendingDelete = null;
    if (!(ctx.model.allCards || []).length) {
      sayNewCrystal("这张库里还没有卡片。", false);
      return;
    }
    openFolderPick("deletecard");
    sayNewCrystal("挑一张要删的卡。", true);
  }

  function confirmDeleteCard(path) {
    const p = toStr(path);
    const card = ctx.model.byPath.get(p);
    hideFolderPick();
    hidePicker();
    if (!card) return;
    sayNewCrystal(
      "删掉卡片「" + card.title + "」？它会进回收站，能捡回来。" +
        "（它所在的那颗晶体不动。）",
      true,
      [
        { label: "取消", onClick: () => cancelDeleteCrystal() },
        { label: "确认删除", danger: true, onClick: () => doTrashCard(p) },
      ]
    );
    pendingDelete = p;
  }

  /** 真删一张卡。**走回收站**，同删除晶体。 */
  async function doTrashCard(path) {
    pendingDelete = null;
    const card = ctx.model.byPath.get(path);
    if (!card) return;
    const title = card.title;
    let res = null;
    try {
      res = await adapter.trashFile(path);
    } catch (e) {
      res = { ok: false, reason: "error", message: (e && e.message) || String(e) };
    }
    if (!res || !res.ok) {
      sayNewCrystal(
        res && res.reason === "missing" ? "这张卡已经不在了。" : "删不掉：" + ((res && res.message) || "未知错误"),
        false
      );
      return;
    }
    // ⚠️ `removeCard`（摘一张）**不是** `removeFolder`（摘一棵子树）——这两个在这份
    // 代码里长得像，用错就是把整颗晶体连带删掉。
    if (ctx.model.removeCard) ctx.model.removeCard(path);
    if (ctx.renderCrystals) ctx.renderCrystals();
    if (ctx.refreshCrystalLayer) ctx.refreshCrystalLayer();
    if (ctx.refreshOrphans) ctx.refreshOrphans();
    if (ctx.refreshFolders) ctx.refreshFolders();
    if (ctx.flushViewState) ctx.flushViewState();
    sayNewCrystal("已删除卡片「" + title + "」——进了回收站，能捡回来。", true);
  }

  /** 这一颗晶体（含子树）里有多少张卡——删除要让人**看见代价**。 */
  function countCardsUnder(key) {
    let n = (ctx.model.cardsAt([key]) || []).length;
    for (const k of ctx.model.keysAt([key]) || []) n += countCardsUnder(k);
    return n;
  }

  /**
   * 确认那一下。
   *
   * **这是这一栏里唯一会动用户笔记的动作**，所以两件事不能省：
   *   · 说清「进回收站」——不写「删除」就完事，那会让人以为不可逆；
   *   · 把代价摆出来——里面有几张卡、会跟着一起走。
   */
  function confirmDeleteCrystal(key) {
    const k = toStr(key);
    // ⚠️ **走公开的那棵树拿节点，不要碰 `ctx.model.byKey`** —— 它是模型内部的
    // 索引，没有导出。第一版就是这么写的，`byKey` 是 undefined，一点进去就
    // `TypeError: Cannot read properties of undefined`，而界面上的表现就是
    // **「点了没反应」**（这一次是选择器那条用例把它抓出来的）。
    const node = findFolderNode(cardTree(), k);
    hideFolderPick();
    hidePicker();
    if (!node) return;
    const n = countCardsUnder(k);
    // 「取消」放**左边**、破坏性的那颗放右边——手顺着读下来先撞到的是安全那个。
    sayNewCrystal(
      "删掉「" + (node.name || k) + "」？" + (n ? "里面有 " + n + " 张卡，会一起进回收站。" : "它是空的。"),
      true,
      [
        { label: "取消", onClick: () => cancelDeleteCrystal() },
        { label: "确认删除", danger: true, onClick: () => doTrashCrystal(k) },
      ]
    );
    // 挂上「有一件事在等你点头」。**Esc 要认它**——见 onKeydown 里那一支：
    // 不认的话，用户唯一的退路是按 Esc，而那一下会退出整块阅读器。
    pendingDelete = k;
  }

  /** 取消待确认的删除。清掉那行提示，什么也不动。 */
  function cancelDeleteCrystal() {
    pendingDelete = null;
    sayNewCrystal("", true);
  }

  /**
   * 真删。**走契约的 `trashFile`（回收站），不是永久删除**——理由见 adapter.js 那一段：
   * 用户在「文件与链接 → 删除的文件」里自己选过丢掉的东西该去哪儿，这里不该替他改主意。
   *
   * 删完三件事，顺序不能换：模型 → 视图状态收场 → 重画。
   */
  async function doTrashCrystal(key) {
    pendingDelete = null; // 点下去就不再「待确认」了，第二下不该再触发一次
    const node = findFolderNode(cardTree(), toStr(key));
    if (!node) return;
    // ⚠️ 模型那层收的是**宿主路径**，不是 key（同 model.removeFolder 的注释）
    const folder = node.folder;
    const label = node.name || key;
    if (typeof adapter.trashFile !== "function") {
      sayNewCrystal("这个宿主没有回收站能力，没有删。", false);
      return;
    }
    let res;
    try {
      res = await adapter.trashFile(folder);
    } catch (e) {
      res = { ok: false, reason: "error", message: (e && e.message) || String(e) };
    }
    if (!res || !res.ok) {
      sayNewCrystal(
        res && res.reason === "missing"
          ? "这个文件夹已经不在了。"
          : res && res.reason === "unsupported"
            ? "这个宿主没有回收站能力，没有删。"
            : "删不掉：" + ((res && res.message) || "未知错误"),
        false
      );
      return;
    }
    // 1) 模型：摘掉那棵子树（卡片、节点、groups 上的残留 —— 见 model.removeFolder）
    if (ctx.model.removeFolder) ctx.model.removeFolder(folder);
    // 2) 视图状态：**正站在被删的那颗里**的话退回环上，不然面包屑指着一条不存在的路
    if (ctx.afterCrystalRemoved) ctx.afterCrystalRemoved();
    if (ctx.refreshCrystalLayer) ctx.refreshCrystalLayer();
    if (ctx.refreshCards) ctx.refreshCards();
    if (ctx.flushViewState) ctx.flushViewState();
    sayNewCrystal("已删除「" + label + "」——进了回收站，能捡回来。", true);
  }

  function openNewCrystal() {
    newCrystalBox.classList.add("open");
    sayNewCrystal("", true);
    newCrystalName.value = "";
    newCrystalName.focus();
  }

  function closeNewCrystal() {
    newCrystalBox.classList.remove("open");
    sayNewCrystal("", true);
  }

  async function createCrystal() {
    const name = toStr(newCrystalName.value).trim();
    if (!name) {
      sayNewCrystal("先给这颗晶体起个名字", false);
      newCrystalName.focus();
      return;
    }
    // 名字里带路径分隔符就等于往别处建，那不是这一颗按钮的意思——
    // 换目录请用「将建在」那个选择器。
    if (name.indexOf("/") >= 0 || name.indexOf("\\") >= 0) {
      sayNewCrystal("名字里不能带斜杠——要换地方请用上面的「将建在」", false);
      return;
    }
    const parent = targetFolder();
    const path = parent ? parent + "/" + name : name;
    let res;
    try {
      res = await adapter.createFolder(path);
    } catch (e) {
      sayNewCrystal("建不出来：" + ((e && e.message) || e), false);
      return;
    }
    if (!res || !res.ok) {
      sayNewCrystal(
        res && res.reason === "exists"
          ? "已经有一个叫「" + name + "」的文件夹了，换个名字"
          : "建不出来：" + toStr((res && res.message) || ""),
        false
      );
      return;
    }
    closeNewCrystal();
    // **当场登记进模型**，这样回到晶体库那颗空晶体已经在环上了（3.0 刀 9 第三版）。
    // 不登记的话，模型是挂载时建的，新建的文件夹要等笔记重挂一遍才出现——
    // 表现就是「建完回去看，没有」，而那正是用户要修掉的那件事。
    let born = false;
    try {
      born = !!(ctx.model && ctx.model.addFolder && ctx.model.addFolder(path));
    } catch (e) {
      born = false;
    }
    if (born) {
      if (ctx.renderCrystals) ctx.renderCrystals();
      if (ctx.refreshCrystalLayer) ctx.refreshCrystalLayer();
      if (ctx.refreshFolders) ctx.refreshFolders();
      if (ctx.flushViewState) ctx.flushViewState();
    }
    say(
      "建好了：「" + name + "」" + (born ? "，环上已经有了。" : "。") + "里面是空的，放进第一张卡就成型。",
      true
    );
  }

  // ---- 边看边记 ----
  function say(text, ok) {
    msgEl.textContent = text;
    msgEl.classList.toggle("kb-v13-reader-msg-bad", !ok);
  }

  /**
   * 把右栏那张表单存成一张真卡片。
   *
   * 三件事的顺序不能换：
   *   1. `composeCard` 拼全文（YAML 的引号规则只有 frontmatter.js 那一份）
   *   2. `adapter.createCard` 落到宿主盘上——**回读的 path 才算数**，宿主可能
   *      规范化了文件名，或者落到了别处
   *   3. `model.addCard` 登记进模型 + 重画
   *
   * 第 3 步漏了的话，症状是「卡建好了，但库里看不见」——而这一步没有任何东西
   * 会替你兜底（`applyExternalChange` 对不认识的路径是直接返回的）。
   */
  async function submitCard() {
    if (!st.doc) {
      say("先选一份文献", false);
      return null;
    }
    const name = safeFileName(nameEl.value);
    if (!name) {
      say("先给这张卡起个名字", false);
      nameEl.focus();
      return null;
    }
    const concept = conceptEl.value.trim();
    const source = sourceEl.value.trim();
    const content = composeCard({ 概念: concept, 来源: source, tags: [], body: bodyEl.value });

    let res;
    try {
      // 目标文件夹是**用户挑的**（`prefs.readerFolder`），没挑过就跟着文献走
      // ——老行为原样保留。见 `targetFolder()`。
      res = await adapter.createCard(name, content, targetFolder());
    } catch (e) {
      say("写不进去：" + ((e && e.message) || e), false);
      return null;
    }
    if (!res || !res.ok) {
      // 三态各给人一句他能照着做的话，不是把枚举值丢出去
      const why =
        res && res.reason === "exists"
          ? "已经有一张叫「" + name + "」的卡了，换个名字"
          : res && res.reason === "error"
            ? "写盘失败：" + toStr(res.message || "")
            : "这张卡没能建起来";
      say(why, false);
      return null;
    }

    const path = toStr(res.path);
    const card = ctx.model.addCard({
      path,
      folder: parentOf(path),
      name: baseName(path).replace(/\.md$/i, ""),
      concept,
      source,
      tags: [],
      content: toStr(res.content),
    });
    if (!card) {
      say("卡写下去了，但名字读不出标题，库里可能看不见它", false);
      return null;
    }

    // 新卡可能**长出一颗新晶体**（建在一个还没有卡的文件夹里时），所以重画
    // 走的是整片舞台那条路，不是「补一张卡」。顺序与 editform 的 refreshAfterWrite
    // 一致：关系图（addCard 里已经重建）→ 舞台 → 晶体层那几个汇总。
    if (ctx.renderCrystals) ctx.renderCrystals();
    if (ctx.refreshCrystalLayer) ctx.refreshCrystalLayer();
    if (ctx.refreshOrphans) ctx.refreshOrphans();
    if (ctx.refreshFolders) ctx.refreshFolders();

    // 清掉卡名和正文、**留着来源**：边看边记是一串同一份文献里的小卡，
    // 每张都重打一遍来源是白费力气；而卡名和正文每张都不一样，留着反而要删。
    nameEl.value = "";
    conceptEl.value = "";
    bodyEl.value = "";
    nameEl.focus();
    say("已建：「" + card.title + "」→ " + (shortFolder(card.folder) || "卡片根目录"), true);
    return { ...card };
  }

  // ---- 键盘 ----
  // 阅读器自己的按键。**这里的「正在打字」守卫和晶体库那边不是一回事**：
  // 库是嵌在笔记里的，点它不会把焦点从编辑器拿走，所以那边只能问「屏幕是谁的」；
  // 阅读器是顶层浮层、右栏是实打实的 input，焦点真的会落在输入框里，所以
  // 按 tagName 判就够了——**而且必须判**，否则在正文框里按方向键会翻页。
  // 这正是刀 5 那个 bug 的镜像：同一个问题（键盘归谁），两种宿主形态两个答案。
  function typingNow() {
    const a = doc.activeElement;
    if (!a) return false;
    const tag = a.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return !!a.isContentEditable;
  }

  function onKeydown(e) {
    // 挂起时这一整套键都不能认领：那会儿人是站在故事线上的，
    // ← → 该去挪画布、PageUp/PageDown 该去翻卡片，而不是翻一份看不见的文献。
    if (!st.open || st.hidden) return;
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") {
      // ⚠️ **有一件事在等你点头时，Esc 是「取消那件事」，不是「退出」**（用户 09-19 报的）。
      // 排在打字那一条**前面**：待确认的那些事（删除晶体）是此刻屏幕上最「当前」
      // 的东西，它该先拿到这一下。不认它的话，用户唯一的退路是关掉整块阅读器——
      // 一颗不可逆的按钮配不上这样的出口。
      if (pendingDelete) {
        cancelDeleteCrystal();
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }
      // **正在输入框里时 Esc 只做一件事：从那个框里出来。**
      // 交给 app.js 的总调度的话，用户写着笔记按一下 Esc（想取消这次输入），
      // 整块阅读器会当场关掉——一屏没保存的字就没了。而那个调度**读不到焦点在
      // 哪儿**（它服务的是晶体库，那一侧根本没有能聚焦的元素，见刀 5 的 keysAreOurs）。
      // 这里不 stopImmediatePropagation 不行：app.js 的 Esc 处理也挂在 doc 上，
      // 同元素的两个监听之间 stopPropagation 是拦不住的。
      if (typingNow()) {
        const a = doc.activeElement;
        if (a && a.blur) a.blur();
        e.stopImmediatePropagation();
        e.preventDefault();
      }
      return; // 没在输入框里 → 交给总调度去关阅读器
    }
    if (typingNow()) return;
    let handled = true;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
      case "PageDown":
        go(1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
      case "PageUp":
        go(-1);
        break;
      case "Home":
        st.offset = 0;
        renderSheets();
        break;
      case "End":
        st.offset = clampOffset(Number.MAX_SAFE_INTEGER, st.grid.per, pageCount());
        renderSheets();
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      // 不让它继续往上传：以后 app.js 那边再加键盘功能时，不必记得
      // 「阅读器开着时要跳过」这一条。
      e.stopPropagation();
    }
  }

  // ---- 绑定 ----
  $("kb-reader-back").addEventListener("click", () => close());
  $("kb-reader-pick").addEventListener("click", () => {
    renderPicker();
    showPicker();
  });
  prevBtn.addEventListener("click", () => go(-1));
  nextBtn.addEventListener("click", () => go(1));
  zoomIn.addEventListener("click", () => setZoom(st.zoom + 0.2));
  zoomOut.addEventListener("click", () => setZoom(st.zoom - 0.2));
  searchEl.addEventListener("input", () => {
    st.filter = searchEl.value;
    renderPicker();
  });
  // 清单用事件委托：每次搜索都重建一排按钮，一个个绑迟早会漏
  docListEl.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest ? e.target.closest(".kb-v13-reader-doc") : null;
    if (!btn) return;
    openDoc(btn.dataset.path);
  });
  $("kb-reader-save").addEventListener("click", () => submitCard());
  // ---- 存进哪个文件夹 ----
  folderPick.el = $("kb-reader-folderpick");
  folderPick.body = $("kb-reader-folderbody");
  targetBtn.addEventListener("click", () => toggleFolderPick());
  $("kb-reader-nativeopen").addEventListener("click", () => openNativeCompose());
  // 草稿纸那两颗（宿主没给位置时那颗按钮压根不在，所以绑之前先问一句）
  if (scratchSpec) $("kb-reader-scratch").addEventListener("click", () => openScratchForm());
  $("kb-reader-scratch-go").addEventListener("click", () => startScratch());
  $("kb-reader-scratch-cancel").addEventListener("click", () => hideScratchForm());
  // 起名那一步回车就开写；输入框里的按键不许漏给阅读器（Esc 会关整块阅读器）
  scratchName.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") startScratch();
    else if (e.key === "Escape") {
      hideScratchForm();
      e.stopImmediatePropagation();
    }
  });
  $("kb-reader-nativereturn").addEventListener("click", () => returnFromNativeCompose());
  $("kb-reader-nativeback").addEventListener("click", () => {
    closeNativeCompose(true); // 留着来源：边看边记是一串同一份文献里的小卡
    say("", true);
  });
  $("kb-reader-newcrystal-open").addEventListener("click", () => openNewCrystal());
  $("kb-reader-crystaldel").addEventListener("click", () => deleteCrystalFlow());
  $("kb-reader-carddel").addEventListener("click", () => deleteCardFlow());
  $("kb-reader-newcrystal-cancel").addEventListener("click", () => closeNewCrystal());
  $("kb-reader-newcrystal-go").addEventListener("click", () => createCrystal());
  // 输入框里的按键不许漏给阅读器（方向键会去翻屏、Esc 会关掉整块阅读器）。
  newCrystalName.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") createCrystal();
    else if (e.key === "Escape") {
      closeNewCrystal();
      e.stopImmediatePropagation();
    }
  });
  folderSearch.addEventListener("input", () => {
    folderPick.query = folderSearch.value;
    renderFolderPick();
  });
  // 搜索框里的按键不许漏给阅读器（同卡片盒那条：方向键会去翻屏）。
  folderSearch.addEventListener("keydown", (e) => e.stopPropagation());
  folderPick.body.addEventListener("click", (e) => {
    const hit = readPick(e);
    if (!hit) return;
    if (hit.kind === "pick") {
      const node = findFolderNode(cardTree(), hit.key);
      if (!node) return;
      // 同一个点击分流，落点按用途分：挑建卡文件夹收的是**宿主路径**，
      // 挑晶体那两档要的是**晶体 key**。两个都在 node 上，别拿错了。
      if (folderPick.purpose === "story") gotoStoryline(node.key);
      else if (folderPick.purpose === "crystal") chooseStoryCrystal(node.key);
      else if (folderPick.purpose === "delete") confirmDeleteCrystal(node.key);
      else chooseFolder(node.folder);
      return;
    }
    // 卡片那一行（只有「删除哪张卡」这一档树里才有它）
    if (hit.kind === "card") {
      if (folderPick.purpose === "deletecard") confirmDeleteCard(hit.path);
      return;
    }
    if (hit.kind !== "toggle") return;
    if (folderPick.open.has(hit.key)) folderPick.open.delete(hit.key);
    else folderPick.open.add(hit.key);
    renderFolderPick();
  });
  deskBtn.addEventListener("click", () => setDeskMode(!desk.on));
  addPageBtn.addEventListener("click", () => addDeskPage());
  cardBoxBtn.addEventListener("click", () => toggleCardBox());
  storyBtn.addEventListener("click", () => {
    // 故事线那棵树已经摊开着 —— 再点一下就是收起来（和「将建在」那颗一个手感）。
    if (folderPick.el.classList.contains("open") && folderPick.purpose === "story") {
      hideFolderPick();
      return;
    }
    storyTarget();
  });
  storyWinBtn.addEventListener("click", () => openStoryWindow());
  // 点别处收提示（捕获阶段，排在所有点击之前）
  el.addEventListener(
    "pointerdown",
    (e) => {
      const t = e.target;
      if (t && t.closest && t.closest(".kb-v13-newcrystal-msg")) return; // 点提示自己不算
      dismissTransient();
    },
    true
  );
  doc.addEventListener("keydown", onKeydown);

  // ---- 对外 ----
  function open() {
    // 挂起中（人从故事线那侧点了顶栏的「文献」）：接着上次那份用，不重头来。
    // 认这一支的关键是**别**往下走 loadDocs()——那一趟会把 `st.doc` 重挑一遍，
    // 桌面那几扇窗也可能跟着重建，正是「原样回来」要避免的事。
    if (st.open && st.hidden) {
      resume();
      return Promise.resolve();
    }
    st.open = true;
    el.classList.add("open");
    st.err = "";
    say("", true);
    refreshBar();
    refreshDeskUi();
    // 每次打开都重扫一遍：用户很可能刚刚才把 PDF 拖进 vault，
    // 缓存一份清单意味着他得关掉笔记再打开才能看见它。
    return loadDocs()
      .then(() => {
        if (!st.doc) showPicker();
        relayout();
      })
      // 这条链是**按钮点出来的**，没人接它的 rejection——抛出去就是一个
      // 「无人接的 Promise rejection」，屏幕上只有一块不动的空屏（跟「保存后闪退」
      // 是同一类症状）。接住它，至少让失败看得见。
      .catch((e) => {
        st.err = "阅读器没打开：" + ((e && e.message) || e);
        renderSheets();
      });
  }

  /**
   * 关掉桌面上的每一扇窗，并把它占用的 source 放掉。
   *
   * ⚠️ **先把 `desk.wins` 清空、再 release**——`releaseSource` 是靠「还有没有窗指着它」
   * 判断该不该关的，顺序反了它就会觉得处处有人占着，一个都关不掉。
   */
  function closeDesk() {
    // ⚠️ **先落盘再清**。反过来的话，关一次阅读器就把桌面存档清空了——
    // 而用户下次打开会看到一块空地，只会以为是「没记住」。
    if (desk.wins.length) persistDesk();
    // 结构窗：连实例一起收。它们各有几处挂在 `document` 上的监听，光清
    // `desk.wins` 收不掉（见 removeDeskWin 里同一条）。
    for (const rt of desk.rt.values()) if (rt && rt.embed) rt.embed.destroy();
    const paths = Array.from(new Set(desk.wins.map((w) => w.path)));
    desk.wins.length = 0;
    desk.rt.clear();
    desk.active = null;
    desk.pageId = null;
    deskEl.textContent = "";
    for (const p of paths) releaseSource(p);
  }

  /**
   * 把阅读器**收起来，但不销毁**。
   *
   * 和 `close()` 的分工，一句话：`close()` 是「不看了」，`suspend()` 是「先放一下」。
   *   - `close()` 放掉 pdf.js 的 source（连同 worker）、摘掉宿主编辑器、落盘并清空
   *     桌面、把 `st.doc` 置空——下次打开是全新的一份，**这是对的**，用户合上了书。
   *   - `suspend()` 只摘 `.open` 这一个类（`#kb-reader` 于是 `display:none`），
   *     `st.doc` / `st.sources` / `desk.wins` / 页码 / 缩放 / 卡片盒**一个都不碰**。
   *     所以从故事线点回「文献」，看到的就是切走前那一刻，桌面那几扇窗还在原位。
   *
   * 代价是挂起期间那几个 pdf.js 文档和 worker 还占着内存。这正是「原样回来」的本钱
   * ——换来的是不必把那份 PDF 重新下载解析一遍。用户点「返回」或关掉晶体库时，
   * 走的是 `close()`，那次会干干净净放掉。
   */
  function suspend() {
    if (!st.open || st.hidden) return;
    st.hidden = true;
    el.classList.remove("open");
    // ⚠️ 这里**不能**顺手 `hidePicker()`。那一层（选哪份文献）是 `#kb-reader`
    // 的子节点，跟着整块屏一起 display:none 就够了；主动 hide 掉的话会把它
    // 「开着」这个状态一并抹掉，切回来时人是空屏——而他什么都没做错。
    // 那棵文件夹树不一样，它必须收：去看故事线这一下本身就是「选完了」。
    hideFolderPick();
    // 顶栏那颗「文献」的文案跟着这个状态走（挂起中 → 「回到文献」），而顶栏归
    // app.js 画。**进出两头都要报**：只报一头的话，回来之后那颗按钮会一直挂着
    // 「回到文献」，人以为点下去还会切走，其实只是把阅读器又摆到眼前一次。
    if (ctx.refreshStageUi) ctx.refreshStageUi();
  }

  /** 挂起之后接着用。跟 `open()` 的分工见上面 suspend() 那段。 */
  function resume() {
    if (!st.open || !st.hidden) return;
    st.hidden = false;
    el.classList.add("open");
    refreshBar();
    refreshDeskUi();
    // 和 open() 最后那一步同一条规矩：什么都没打开过的话，把「选哪份文献」
    // 那一层摆回来。挂起期间它可能被故事线那条路请走过。
    if (!st.doc) showPicker();
    // 挂起期间窗口很可能变过尺寸（去看故事线时人常常会缩放、切全屏）。
    // 那会儿 `#kb-reader` 是 display:none，量什么都是 0×0，排出来全是垃圾——
    // 所以重排**必须**挪到显形之后这一次来补。
    resizeNow();
    // 顶栏那颗「文献」该改回「文献」了（见 suspend 里同一条）。
    if (ctx.refreshStageUi) ctx.refreshStageUi();
  }

  /**
   * 窗口变了（或刚从挂起里醒过来）重新排一次。
   * 出口只留这一个：app.js 的 kbResize 和 resume() 都走它，免得两处各排一套。
   */
  function resizeNow() {
    if (!st.open || st.hidden) return;
    // 桌面开着时页区是隐藏的，重排网格没有意义（量到的是 0）。
    // 改成把桌上的窗重新夹一遍：窗口变小之后，原来贴着右边的窗会跑到屏幕外去。
    if (desk.on) {
      const b = deskBounds();
      for (const w of desk.wins) {
        // 锁了比例的窗（PDF 页窗）走另一条夹取：按两轴自由夹的话，窗口一变小
        // 就会被夹出一个不是这一页形状的框，页又回到「缩在一个随便多大的框里」。
        const box =
          w.kind === "pdf" && w.ratio
            ? clampRatioBox({ x: w.x, y: w.y, w: w.w, h: w.h }, b.w, b.h, w.ratio, DESK_CHROME)
            : clampBox({ x: w.x, y: w.y, w: w.w, h: w.h }, b.w, b.h);
        w.x = box.x;
        w.y = box.y;
        w.w = box.w;
        w.h = box.h;
        const node = winEl(w.id);
        if (node) applyDeskBox(node, box);
        restretch(w);
      }
      return;
    }
    relayout();
  }

  function close() {
    if (!st.open) return;
    st.open = false;
    el.classList.remove("open");
    hidePicker();
    // 卡片盒是浮窗，得跟着阅读器一起收——它是阅读器那一层里的一扇窗，
    // 漏掉的话它会留在屏幕上，而按钮全是死的（孤儿窗，floatwin 开头记过）。
    if (cardBox.unit) {
      const cb = findFloat(ctx, cardBox.unit);
      if (cb) closeFloat(ctx, cb, false);
    }
    cardBoxBtn.setAttribute("aria-pressed", "false");
    closeDesk();
    // 边看边记里那台宿主编辑器也得摘掉——它背后挂着宿主一个视图对象，
    // 不摘就是每关一次阅读器漏一个（同 app.js 里 __kbV13Reader.destroy 那条）。
    closeNativeCompose(false);
    closeScratch();
    // ⚠️ `st.doc = null` **必须排在 `closeSource()` 前面**：releaseSource 看到
    // 网格还占着这份就不肯关，那份 source（连同它的 worker）就漏在那儿了。
    st.doc = null;
    closeSource();
    desk.on = false;
    // 挂起中直接关（人在故事线上点了「关闭晶体库」）也要归零，
    // 不然下次 open() 会以为「还挂起着呢」，一头栽进 resume() 里什么都不做。
    st.hidden = false;
    st.offset = 0;
    st.err = "";
    st.busy = false;
    st.gen++;
  }

  return {
    el,
    open,
    close,
    // 认的是「露没露在屏幕上」——挂起时对 app.js 来说等于没开（Esc 不该去关它、
    // 关晶体库那一路也不必多问一句）。「还在不在」另有一颗 isSuspended。
    isOpen: () => st.open && !st.hidden,
    /** 挂在故事线背后、还留着的那一份。顶栏那颗「文献」靠它决定说什么话。 */
    isSuspended: () => st.open && st.hidden,
    doc: () => (st.doc ? { ...st.doc } : null),
    docs: () => st.docs.map((d) => ({ ...d })),
    pageCount,
    layout: () => ({ ...st.grid }),
    zoom: () => st.zoom,
    err: () => st.err,
    message: () => msgEl.textContent,
    openDoc,
    next: () => go(1),
    prev: () => go(-1),
    setZoom,
    // 桌面：给测试和排障看的**只读**窗口表。开/关/加页一律走页面上那两颗真按钮
    // （顶栏的「桌面」和「＋ 页」），理由与阅读器其余部分一样——句柄上开个后门
    // 就等于绕过了「按钮在不在、点得到点不到」那一层。
    deskOn: () => desk.on,
    deskWins: () => desk.wins.map((w) => ({ ...w })),
    submitCard,
    /** 窗口变了重新排一次（app.js 的 kbResize 调它）。挂起时它自己会跳过。 */
    onResize: resizeNow,
    /** 宿主拆掉这个实例时摘监听。**必须有**——键盘挂在 doc 上，不摘就是
     *  每重挂一次多一个监听，而且每个都指向一棵已经摘下来的树。 */
    destroy: () => {
      doc.removeEventListener("keydown", onKeydown);
      close();
    },
  };
}
