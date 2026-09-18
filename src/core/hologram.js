// 全息详情面板 + 卫星卡片。
//
// #5：正文不再手搓渲染，整段交给适配层的 renderMarkdown
// （Obsidian 侧 = dv.api.renderValue → 原生 MarkdownRenderer，公式/列表/引用/图片全原生）。
// 由此带来两处已记录的行为变化：
//   1. [[双链]] 会变成可点击的真链接（原来被摊平成纯文字），渲染接口没有开关可关；
//   2. 嵌套的 ```dataview / ```mermaid 块会被渲染成代码文本，不执行。
//
// #17：上面第 2 条有一个例外——```latex / ```math / ```tex 三种围栏会被抽出来
// 按公式重新渲染（见 mathfence.js）。其余语言的围栏照旧是代码文本。
//
// #12：正文按 `---div---` 分段，每段一个"遮住/揭开"封条，默认全遮。
// 切分走 model.js 的 splitSegments（纯函数），开关走 mask.js（与 #13 共用一套）。

import { EL, hsl, truncate, svgEl } from "./dom.js";
import { showTooltip, hideTooltip } from "./tooltip.js";
import { attachCodeFloats } from "./codefloat.js";
import { attachMathFloats } from "./mathfloat.js";
import { attachImageFloats } from "./imagefloat.js";
import { expandMathFences } from "./mathfence.js";
// 收窗走引擎那一份注册表：代码窗和图片窗在一个表里，见 floatwin.js 的文件头。
import { closeAllFloats } from "./floatwin.js";
import { createMask, revealMask, revealed } from "./mask.js";
import { isReview } from "./mode.js";
import { splitSegments, bodyStartLine } from "./model.js";
// 面板内原地编辑。editform 不反向 import 这个文件（刷新走 ctx.refreshCard 那根线），
// 所以这里不构成环。后三个是 #16 的撤销条：状态在 win 上，条子由这里按当前卡决定
// 建不建（见 editform.js 撤销那一节）。
import {
  openEditor,
  closeEditor,
  dropUndoNode,
  offerUndo,
  clearUndo,
} from "./editform.js";

const BACK_HUE = 38;

/**
 * 把一段 markdown 交给宿主渲染，落地后给它挂上 #11 的代码块 / #15 的图片悬浮入口。
 * 返回 Promise：宿主渲染是异步的（Obsidian 侧交给 dataview 的那条就是），
 * 悬浮入口必须等它落地才挂得上——早一步 el 里还没有 <pre> / <img>。
 */
function renderInto(ctx, el, md, path) {
  return Promise.resolve(ctx.adapter.renderMarkdown(md, el, path))
    // #17：公式围栏要先换掉再挂入口。反过来的话那个 <pre> 已经挂上了代码悬浮窗的
    // 整套监听，再把它换走就等于留下一堆指向死节点的回调。
    .then(() => expandMathFences(ctx, el, path))
    .then(() => {
      // 晚到的渲染（用户点得快，上一张卡的 promise 这时才回来）不会挂错：
      // 这里只认 el 里此刻真实存在的节点，且对同一个节点只挂一次。
      attachCodeFloats(ctx, el);
      // 公式围栏的容器是上一步 expandMathFences 才换出来的，所以挂入口排在它后面。
      // 代码块那条路已经看不到它了（<pre> 已被换走），两条互不重叠。
      attachMathFloats(ctx, el);
      attachImageFloats(ctx, el);
    })
    // 这条链谁都不 await（showHologram 要面板立刻出来），所以这里不兜住的话，宿主
    // 渲染或后处理里任何一个 reject 都会变成 unhandled rejection：屏幕上只是
    // "这张卡的代码块/公式没出来"，控制台里才有线索。真库 29 张卡里 19 张带代码块，
    // 这条路上出问题是最难从现象反推的那类。
    .catch((e) => console.error("[kb] 正文渲染或后处理失败", e));
}

/**
 * 渲染全息面板正文（#5 整段交给宿主 → #12 按 `---div---` 分段遮挡）。
 *
 * 分段是**渲染之前**在 markdown 层面切的：先整篇渲染再切 DOM 会把跨段的元素
 * （一个列表、一段引用）从中间劈开。切完每段各自过一次宿主渲染器、各自一个封条，
 * 默认全遮，点哪段揭哪段，且揭开的段不会被别处点击又遮上（每个开关只管自己）。
 *
 * 没有 `---div---` 的卡（真库 29 张里有 24 张）走的是原来那条路：整段直接渲染，
 * 一个遮罩容器都不出现。
 */
export function renderHoloBody(ctx, card, opts = {}) {
  const box = ctx.hBody;

  // 保存 / 撤销会把正文整块重画。用户此刻很可能正读到某一段，重画之后那一段又被
  // 盖上、滚动条跳回顶部——观感上就是"我刚读到哪儿被打断了"。同一张卡重画时把
  // 这两样还回去（preserve 由 app.js 的 refreshCard 传进来）。
  //
  // 守卫是路径比对而不是 opts 里的布尔：只有"重画的正是屏幕上这张卡"才谈得上保留，
  // 换卡必须从全遮开始——那是另一份内容，没有"上次读到哪"可言。
  const keep = !!opts.preserve && ctx._holoPath === card.path;
  ctx._holoPath = card.path;
  const st = keep
    ? {
        // 滚的是 box 自己（.kb-v13-holo-body 有 max-height:42vh;overflow-y:auto），
        // 不是外面那层面板——面板的 82vh 装得下它，通常根本不滚。
        scroll: box.scrollTop,
        // 记的是**下标**不是节点：下面整块重画，节点全换新的。
        revealed: [...box.querySelectorAll(".kb-v13-holo-seg")].reduce(
          (acc, seg, i) => (revealed(seg) ? acc.concat(i) : acc),
          []
        ),
      }
    : null;

  // 第一件事是收回还浮在外面的 <pre>：下面那行会清空 box，而那些 pre 的"老家"就在
  // box 里，不收回来它们就成了悬空节点，之后无处可还。
  //
  // 必须**先收再清**，顺序反过来就没救了：清空之后占位条一起没了，closeFloat 只能
  // 走兜底那条路。进编辑态时这里不收（编辑不重渲染正文，见 editform.js 的 openEditor），
  // 但真保存走到这儿时一定要收——正文正从源重建，浮窗带的是上一版的节点。
  closeAllFloats(ctx);
  box.innerHTML = "";
  // 正文换代。浮窗用它判断自己带出来的节点是不是上一版的（见 floatwin.js 的 closeFloat）。
  ctx._bodyGen = (ctx._bodyGen || 0) + 1;

  const segments = splitSegments(card.content);
  if (!segments.length) return Promise.resolve();
  if (segments.length === 1) {
    const p = renderInto(ctx, box, segments[0], card.path);
    // 等渲染落地再还滚动位置：渲染会改高度，早还一步会被夹到当时的高度之内。
    return st ? p.then(() => restoreScroll(ctx, box, st.scroll)) : p;
  }

  // 空段（连写两个分隔符造出来的）不遮：遮一个空盒子只会让人以为这里丢了东西。
  const live = segments.filter((md) => md);
  const renders = [];
  live.forEach((md, i) => {
    const mask = createMask({
      cls: "kb-v13-holo-seg",
      // 只写"第几段"。总共几段看封条数量就有，两个状态各写一遍是噪音；
      // 而"这是第几段"是这一段的身份，揭开之后也得留着（它是段与段之间的界标）。
      label: "第 " + (i + 1) + " 段",
      onReveal: (root) => {
        const p = renderInto(ctx, root._body, md, card.path);
        renders.push(p);
        return p;
      },
    });
    box.appendChild(mask);
    // #9 复习模式：分段不是"没有遮罩"，是"遮罩出生就是揭开的"；加上"上一版揭开的段
    // 照旧揭开"。两者都走同一条 revealMask。
    //
    // ⚠️ 揭开必须**放在 appendChild 之后**，不能用 createMask 的 revealed 选项：
    // 那个选项在构造里就调 onReveal，此刻节点还没进树，宿主渲染器拿到的是一个离屏
    // 节点——Obsidian 的 MathJax 排版要求节点已在文档里，会静默什么都不做
    // （与 mathfence.js 那个 bug 同源）。
    if (isReview(ctx) || (st && st.revealed.includes(i))) revealMask(mask);
  });
  // 分段卡开局没有一个字是渲染过的，所以不进 preserve 时这里立刻就是"完成"。
  // 每段的渲染与挂悬浮入口都在 onReveal 里各自发生——真实数据里带 ---div--- 的
  // 教学卡每张都带代码块，这一段漏了它们就全没有悬浮窗。
  if (!st) return Promise.resolve();
  // 等开局这几次渲染落地再还滚动位置，理由同上面单段那条。
  return Promise.all(renders).then(() => restoreScroll(ctx, box, st.scroll));
}

/** 还滚动位置。面板换过卡（box 已不是当初那个）就别还了。 */
function restoreScroll(ctx, box, top) {
  if (ctx.hBody === box) box.scrollTop = top;
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.resumed] 这张面板是「重新打开时恢复回来的」，不是用户自己点开的
 */
export function showHologram(ctx, card, hue, opts = {}) {
  const { hTitle, hConcept, hMeta, overlay, hEdit, hOpen, hResume } = ctx;
  // 换到另一张卡了，编辑态必须收。**强行收**，不走脏态确认：点卫星换卡是一次
  // 明确的导航动作，把它拦下来会让人以为点坏了。代价是那一刻没保存的输入没了，
  // 所以表单里改到一半就去点卫星不是个好主意——这条写进了使用说明。
  // 更要紧的是不收会变成什么：表单里是上一张卡的字段值，面板标题却是新卡，
  // 这时按保存，写回去的是上一张卡。那才是真的糟。
  closeEditor(ctx, { force: true });
  // 上一次留下的撤销条先摘掉（幂等）：下面末尾会按**这一张卡**重新决定建不建。
  // 不摘的话连着翻几张卡会攒出一排「保存好了」。
  dropUndoNode(ctx);
  const tags = card.tags.slice(0, 6);
  // #14：记下「此刻翻开着的就是这张卡」，随视图状态落盘。下次打开时连它一起回来
  // （合上面板时要在 closeHologram 里清掉——那之后屏幕上就没有这张卡了）。
  ctx.state.selectedCard = card.title;

  hTitle.textContent = card.title;
  hTitle.style.color = hsl(hue, 70, 70);

  // 恢复回来的那一张要说自己是谁。恢复与「自己点开」在屏幕上长得一模一样，
  // 不点明的话这张卡凭空冒出来，用户只会以为点错了。空串时样式里不占位。
  //
  // justSaved：这次重挂是刚保存完引起的（见 app.js 的 restoreInto）。
  // 那时说「上次看到的是这张」是句错话——用户三秒前刚点的保存。
  if (hResume) {
    hResume.textContent = opts.justSaved
      ? "已保存"
      : opts.resumed
        ? "上次看到的是这张"
        : "";
    if (opts.resumed) hResume.style.color = hsl(hue, 45, 62, 0.75);
  }

  // 「概念」和卡面揭开走同一条渲染路径，免得同一句话在两处排版不一样
  hConcept.style.color = hsl(hue, 20, 65);
  hConcept.innerHTML = "";
  if (card.concept) ctx.adapter.renderMarkdown(card.concept, hConcept, card.path);
  else hConcept.textContent = "暂无概念描述";

  hMeta.innerHTML = tags
    .map((t) => {
      const th = (t.charCodeAt(0) || 0) % 360;
      return (
        '<span class="kb-v13-holo-tag" style="color:' + hsl(th, 50, 55, 0.5) +
        ";border-color:" + hsl(th, 50, 55, 0.1) +
        ";background:" + hsl(th, 50, 55, 0.03) + '">' + t + "</span>"
      );
    })
    .join("");

  overlay.querySelector(".kb-v13-hologram").style.setProperty("--holo-clr", hsl(hue, 70, 50, 0.4));
  overlay.classList.add("open");

  // 打开笔记：在右侧分屏放这篇笔记本身（晶体卡就是原笔记），晶体库那个叶子不动。
  //
  // 两步缺一不可：
  //   1. 先收屏幕。全屏层是 fixed;inset:0，不收起来的话分屏确实开了，
  //      但整块被幕布盖着——看上去就是「点了编辑什么也没发生」；
  //   2. openNote 必须带 split:true。不带就是老行为：宿主整页跳转到笔记，
  //      晶体库所在的叶子被顶掉，回来还得重新摆一遍视角。
  // 行号取正文首行（#14）：笔记顶层是 frontmatter 的 YAML，落第 0 行等于没定位。
  //
  // 这里**不要**自己 closeHologram：closeFullscreen 会在收屏幕之前先把快照拍下来，
  // 拍完才收面板。在这之前收面板，快照里就永远没有「正翻开的那张卡」——
  // 「点编辑 → 改完 → 回来还在那张卡上」这条主路径就是这么被自己掐断的。
  function openInNote() {
    ctx.closeFullscreen();
    ctx.adapter.openNote(card.path, { split: true, line: bodyStartLine(card.content) });
  }

  // ✎ 现在指「面板内原地改」，分屏打开挪到旁边那枚按钮。
  // 两条路都留着：改个概念、改个标签，原地最省事；要动正文结构、要用宿主的补全
  // 和搜索，分屏那条仍然更好使。
  //
  // 宿主没实现 writeCard 时退回分屏，并把原地那枚藏起来——**别做成死按钮**，
  // 对齐本仓「宁可老行为，也不能点了没反应」那条。
  const canEditInPlace = typeof ctx.adapter.writeCard === "function";
  hEdit.style.display = canEditInPlace ? "" : "none";
  hEdit.onclick = () => {
    if (canEditInPlace) openEditor(ctx, card);
    else openInNote();
  };
  if (hOpen) {
    // 没有 writeCard 时，分屏是唯一入口，一直显示；有时它就是「另一条路」
    hOpen.onclick = openInNote;
  }

  // 不 await：面板要立刻出来。renderHoloBody 的返回值只用来在渲染落地后挂 #11 的
  // 代码块入口，它自己会处理；这里 await 反而会让面板等宿主渲染。
  renderHoloBody(ctx, card, opts);
  renderSatellites(ctx, card, hue);
  // #16 撤销条：win 里还留着「刚在这张卡上保存过」就把它建出来，对不上就清掉。
  // 放最后是因为它要插在 hBody 前面，而 hBody 的内容刚被 renderHoloBody 换过。
  offerUndo(ctx, card);

  ctx.removeEscHandler();
  const escHandler = (e) => {
    if (e.key === "Escape") closeHologram(ctx);
  };
  ctx.doc.addEventListener("keydown", escHandler);
  ctx._escHandler = escHandler;
}

export function closeHologram(ctx) {
  // 编辑态先强行收掉（force：不弹脏态确认）。这里必须**无条件成功**——closeHologram
  // 也被 closeFullscreen / forgetViewState 调，那时用户要的是把库关掉，
  // 不是一个「要不要保存」的问题。想拦的那两个出口（✕ 与点暗场）走的是
  // closeEditor 的返回值，拦在那边。
  closeEditor(ctx, { force: true });
  // #16 撤销条跟着面板一起收场。撤销的语义是「我刚才在这张卡上手滑了」，
  // 面板都合上了就不成立——下次打开是一张新翻开的卡，不该弹出一句上次的后悔药。
  clearUndo(ctx);
  // #14：面板合上了，「此刻翻开着的卡」就没有了。不清的话下次打开会把一张
  // 早就合上的卡又翻回来——用户离开时看的是晶体环，回来却撞上一张卡。
  ctx.state.selectedCard = null;
  // 「上次看到的是这张」同理：它说的是**这次**面板为什么开着。关了就不成立，
  // 留着只会等下一次恢复时被读到一句过期的自述。
  if (ctx.hResume) ctx.hResume.textContent = "";
  // #11：不收回来的话，<pre> 还停在悬浮窗里而卡片已经关了——那些窗就成了孤儿，
  // 既没有宿主可还，也没人再点得到。
  closeAllFloats(ctx);
  // #10 面板被拖到过别处的话，收起来时复位：下次翻开还是居中的那张卡。
  // 走 ctx 上的接线（而不是 import holodrag），是因为 holodrag 反过来要用
  // 这个文件的 shiftSatellites —— 直接互相 import 会绕成环。
  if (ctx.resetPanelOffset) ctx.resetPanelOffset();
  ctx.overlay.classList.remove("open");
  ctx._satBase = null;
  ctx._satCard = null;
  ctx.satContainer.innerHTML = "";
  while (ctx.satLines.firstChild) ctx.satLines.removeChild(ctx.satLines.firstChild);
  ctx.satLines.style.display = "none";
  ctx.removeEscHandler();
}

export function renderSatellites(ctx, card, hue) {
  const { satContainer, satLines, win, overlay, model } = ctx;
  satContainer.innerHTML = "";
  while (satLines.firstChild) satLines.removeChild(satLines.firstChild);
  // #10 面板可以被拖走，卫星得跟着。这里把这一趟算出来的原始坐标记下来，
  // 拖动时 shiftSatellites 拿它加一个位移就行——不用重算椭圆、不重建 DOM，
  // 所以每帧跟得上。重排（refreshSatellites）用的也是这两个字段。
  ctx._satCard = card;
  ctx._satHue = hue;
  ctx._satBase = { sats: [], lines: [] };

  // 每次开全息都按当前窗口尺寸刷新 viewBox，避免窗口 resize 后连线坐标错位
  satLines.setAttribute("viewBox", "0 0 " + win.innerWidth + " " + win.innerHeight);

  const outRel = model.relatedOf(card);
  const backRel = model.backlinksOf(card);
  const outTitles = new Set(outRel.map((r) => r.title));
  const backRelFiltered = backRel.filter((r) => !outTitles.has(r.title)); // 去重：互相引用的只在内圈展示

  if (!outRel.length && !backRelFiltered.length) {
    satLines.style.display = "none";
    return;
  }
  satLines.style.display = "";

  const holo = overlay.querySelector(".kb-v13-hologram");
  const hRect = holo.getBoundingClientRect();
  const cx = hRect.left + hRect.width / 2;
  const cy = hRect.top + hRect.height / 2;
  const hw = hRect.width / 2;
  const hh = hRect.height / 2;

  // 连线绘制（核心线 solid + 流光虚线）
  function drawLink(sx, sy, cw, ch, colHue, opScale = 1) {
    const satCx = sx + cw / 2;
    const satCy = sy + ch / 2;
    let dx = satCx - cx;
    let dy = satCy - cy;
    if (dx === 0 && dy === 0) {
      dx = 0;
      dy = 1;
    }
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const t1 = absDx > 0.001 && absDy > 0.001 ? Math.min(hw / absDx, hh / absDy) : absDx > 0.001 ? hw / absDx : hh / absDy;
    const ex1 = cx + dx * t1;
    const ey1 = cy + dy * t1;
    const t2 = absDx > 0.001 && absDy > 0.001 ? Math.min(cw / 2 / absDx, ch / 2 / absDy) : absDx > 0.001 ? cw / 2 / absDx : ch / 2 / absDy;
    let ex2 = satCx - dx * t2;
    let ey2 = satCy - dy * t2;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (t1 >= dist - t2) {
      ex2 = satCx + dx * t2;
      ey2 = satCy + dy * t2;
    }
    const g = svgEl("g");
    const mk = (w, col, op, dash) => {
      const l = svgEl("line");
      l.setAttribute("x1", ex1);
      l.setAttribute("y1", ey1);
      l.setAttribute("x2", ex2);
      l.setAttribute("y2", ey2);
      l.setAttribute("stroke", hsl(col, 80, 60, op * opScale));
      l.setAttribute("stroke-width", w);
      l.setAttribute("stroke-linecap", "round");
      if (dash) {
        l.setAttribute("stroke-dasharray", "4,6");
        l.classList.add("kb-v13-sat-line");
      }
      g.appendChild(l);
      // 记下这条线的原始几何：拖动时四个端点一起加位移就够了（见 shiftSatellites）
      ctx._satBase.lines.push({ line: l, x1: ex1, y1: ey1, x2: ex2, y2: ey2 });
    };
    mk(6, colHue, 0.15, false);
    mk(1.5, colHue, 0.45, false);
    mk(1, colHue + 20, 0.7, true);
    satLines.appendChild(g);
  }

  // ---- 出链（内圈，蓝实线，保留 >10 缩放）----
  const nOut = outRel.length;
  const denseOut = nOut > 10;
  const outW = ctx.s(denseOut ? 180 : 360);
  const outH = ctx.s(denseOut ? 55 : 140);
  const marginOut = ctx.s(denseOut ? 120 : 100);
  const rxOut = hw + outW / 2 + marginOut;
  const ryOut = hh + outH / 2 + marginOut;
  const outOuterRx = rxOut + outW / 2;
  const outOuterRy = ryOut + outH / 2;

  outRel.forEach((item, i) => {
    const target = model.cardByTitle(item.title);
    if (!target) return;
    const angle = (i / nOut) * Math.PI * 2; // 出链(内圈)从正右 0° 开始，链的"下一张"在右边
    let sx = cx + Math.cos(angle) * rxOut - outW / 2;
    let sy = cy + Math.sin(angle) * ryOut - outH / 2;
    const pad = ctx.s(10);
    sx = Math.min(Math.max(sx, pad), win.innerWidth - outW - pad);
    sy = Math.min(Math.max(sy, pad), win.innerHeight - outH - pad);
    const el = EL("div", "kb-v13-satellite");
    el.style.left = sx + "px";
    el.style.top = sy + "px";
    el.style.width = outW + "px";
    el.style.height = outH + "px";
    ctx._satBase.sats.push({ el, left: sx, top: sy });
    el.dataset.reason = item.reason || "";
    el.dataset.dir = "out";
    // 这颗卫星指的是哪张卡。卡片有 data-title、这里原来没有，测试要按目标找卫星
    // 就只能去解析渲染出来的文字。跟 data-reason 一样是「这颗卫星是什么」的一部分。
    el.dataset.title = item.title;
    if (denseOut) {
      el.innerHTML =
        '<div class="kb-v13-sat-body" style="position:absolute;inset:0"><div class="kb-v13-sat-strip" style="height:24px;background:hsla(' +
        hue + ',70%,50%,0.3)"></div><div style="padding:6px 10px"><span class="kb-v13-sat-title">' +
        truncate(target.title, 18) + "</span></div></div>";
    } else {
      el.innerHTML =
        '<div class="kb-v13-sat-body" style="position:absolute;inset:0"><div class="kb-v13-sat-strip" style="background:hsla(' +
        hue + ',70%,50%,0.45)"></div><div style="padding:20px 20px 20px 22px"><span class="kb-v13-sat-title">' +
        truncate(target.title, 22) +
        '</span><div style="font-size:12px;line-height:1.4;color:rgba(200,225,250,.65);margin-top:3px">' +
        truncate(target.concept || "暂无描述", 80) + "</div></div></div>";
    }
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      showHologram(ctx, target, hue);
    });
    el.addEventListener("mouseenter", () => showTooltip(ctx, el, target, hue));
    el.addEventListener("mouseleave", () => hideTooltip(ctx));
    satContainer.appendChild(el);
    drawLink(sx, sy, outW, outH, hue);
  });

  // ---- 反向链接（外圈，琥珀虚线，小卡仅标题，hover 显示详情）----
  const nBack = backRelFiltered.length;
  if (nBack > 0) {
    const backW = ctx.s(180);
    const backH = ctx.s(55);
    const rxBack = outOuterRx + backW / 2 + ctx.s(30);
    const ryBack = outOuterRy + backH / 2 + ctx.s(30);
    backRelFiltered.forEach((item, i) => {
      const target = model.cardByTitle(item.title);
      if (!target) return;
      const angle = (i / nBack) * Math.PI * 2 + Math.PI; // 反链(外圈)从正左 180° 开始，链的"上一张"在左边
      let sx = cx + Math.cos(angle) * rxBack - backW / 2;
      let sy = cy + Math.sin(angle) * ryBack - backH / 2;
      const pad = ctx.s(10);
      sx = Math.min(Math.max(sx, pad), win.innerWidth - backW - pad);
      sy = Math.min(Math.max(sy, pad), win.innerHeight - backH - pad);
      const el = EL("div", "kb-v13-satellite kb-v13-sat-back");
      el.style.left = sx + "px";
      el.style.top = sy + "px";
      el.style.width = backW + "px";
      el.style.height = backH + "px";
      ctx._satBase.sats.push({ el, left: sx, top: sy });
      el.dataset.reason = item.reason || "";
      el.dataset.dir = "in";
      el.dataset.title = item.title;
      el.innerHTML =
        '<div class="kb-v13-sat-body" style="position:absolute;inset:0;border-color:rgba(245,158,11,0.45)"><div class="kb-v13-sat-strip" style="height:24px;background:rgba(245,158,11,0.5)"></div><div style="padding:6px 10px"><span class="kb-v13-sat-title" style="color:rgba(245,200,120,.9)">' +
        truncate(target.title, 18) + "</span></div></div>";
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        showHologram(ctx, target, BACK_HUE);
      });
      el.addEventListener("mouseenter", () => showTooltip(ctx, el, target, BACK_HUE));
      el.addEventListener("mouseleave", () => hideTooltip(ctx));
      satContainer.appendChild(el);
      drawLink(sx, sy, backW, backH, BACK_HUE, 0.5);
    });
  }
}

// ============================================================
// #10 面板被拖走时，卫星与连线跟着走
// ============================================================

/**
 * 把这一圈卫星和连线整体平移 (dx, dy)。dx/dy 是相对**面板原始位置**的位移，
 * 不是增量——所以调用方只要算出「离起点多远」，不必自己攒增量、也不会漂。
 *
 * 不重算椭圆、不重建 DOM：拖动是每帧都来的，重建会把卫星的入场动画和 hover
 * 状态一次次打断（而且卫星自带 transition:all .35s，重建后每帧都在追自己）。
 * 平移是直接改 left/top 与线段端点，一帧内完成。
 */
export function shiftSatellites(ctx, dx, dy) {
  const base = ctx._satBase;
  if (!base) return;
  // 拖动期间把卫星那 350ms 的过渡压掉：不压的话卫星会慢半拍地跟在面板后面，
  // 面板已经到位了卫星还在飘。松手后由 refreshSatellites 摘掉这个类。
  if (ctx.satContainer) ctx.satContainer.classList.add("kb-v13-sat-dragging");
  for (const s of base.sats) {
    s.el.style.left = s.left + dx + "px";
    s.el.style.top = s.top + dy + "px";
  }
  for (const l of base.lines) {
    l.line.setAttribute("x1", l.x1 + dx);
    l.line.setAttribute("y1", l.y1 + dy);
    l.line.setAttribute("x2", l.x2 + dx);
    l.line.setAttribute("y2", l.y2 + dy);
  }
}

/**
 * 拖动结束时重排一次：摘掉「拖动中」，按面板的新位置重算整圈卫星。
 *
 * 平移本身已经让位置正确了，重排多出来的是**夹取**——卫星原本按旧中心算，
 * 被夹在视口内；面板挪到边上以后，平移过来的卫星可能有一半在屏外，
 * 重排会按新中心把它们拉回来。没有卫星（或面板没动过）时它什么也不做。
 */
export function refreshSatellites(ctx) {
  if (ctx.satContainer) ctx.satContainer.classList.remove("kb-v13-sat-dragging");
  if (!ctx._satCard) return;
  renderSatellites(ctx, ctx._satCard, ctx._satHue);
}
