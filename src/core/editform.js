// 卡片内编辑：在全息面板里原地切成表单，改 frontmatter 与正文，写回原笔记。
//
// 为什么不是浮窗：浮窗层（floatwin.js）自带一套收窗注册表和 Esc 分流，编辑态套进去
// 会和面板拖动（holodrag.js）、#14 的快照恢复三方打架；而且浮窗压在卡片上，
// 编辑时反倒看不全。面板原地切换最贴合现有架构——「不跳转、不开新标签页、
// 不离开晶体库」本来就是这个形态。
//
// 写盘这件事**不在这里做决定**：新全文由 core/frontmatter.js 算好，适配层的
// writeCard 只管「比基线 → 写盘 → 回读」。这里只负责收集表单、拿结果、
// 用**回读的真实全文**更新模型、刷新界面。
//
// 正文是第二轮加的。它比 frontmatter 难在一个地方：正文里的双链是卫星、孤岛、
// 晶体连线的唯一来源，改一个字都可能让关系图变，所以保存之后要重算整张图并
// 刷新到晶体层（见 refreshAfterWrite）。另外正文是一大块文本，改错了就是内容
// 损坏，所以每次写盘都留一次「撤销」（见文件末尾那一节）。

import { EL } from "./dom.js";
import {
  patchFrontmatter,
  patchBody,
  splitCard,
  stripBodyPrefix,
  normalizeEol,
} from "./frontmatter.js";
import { applyCardFields } from "./model.js";

// 可编辑的 frontmatter 字段。顺序就是表单里的顺序，跟库里卡片的键序一致
// ——改完一个字段，文件里那一行还在原地，git diff 就只有一行。
//
// ⚠️ 正文**不在这里**，它是单独建的（见 buildEditor）。两个理由任一都够：
//   1. valueOf 只认这三个键，别的 key 会回落到「来源」的值——正文框会被填上来源；
//   2. 更致命的是 readForm 会把它平铺进返回值，而那个返回值是直接喂给
//      patchFrontmatter 的：找不到「正文」这个键，它就会往 YAML 里写一行
//      「正文: …」。签名的形状本身就是护栏，别拆。
const FIELDS = [
  {
    key: "概念",
    multiline: true,
    hint: "卡片翻开时顶部那句话，也是卡面「回忆一下」揭开的内容。",
  },
  {
    key: "来源",
    hint: "悬停浮层里的「来源: …」——这张卡是从哪儿学来的。",
  },
  {
    key: "tags",
    tags: true,
    hint: "逗号分隔。卡片上最多显示前 6 个。",
  },
];

export function isEditing(ctx) {
  return !!ctx._editor;
}

/**
 * 进入编辑态。
 *
 * **不**收浮窗（改自「进来之前先收」）：浮窗是放在遮罩层的，编辑态藏的是
 * `.kb-v13-holo-body`，遮不到它。用户「开着浮窗对照着改」是常态，一进编辑就把
 * 窗收掉等于每次都逼他重新点开一次。
 *
 * 代价说清楚：此时点浮窗上的「收回」，节点会还进那个被藏起来的正文槽位，
 * 看起来像"图/代码没了"——直到退出编辑态正文重新出现。真保存时正文本来就
 * 整块重渲染，浮窗由 renderHoloBody 统一收掉（见那边的注释）。
 */
export function openEditor(ctx, card) {
  if (ctx._editor || !card || !ctx.holo) return null;

  // ⚠️ 全流程唯一一条不可逆的损坏路径，挡在这里。
  // 读文件失败时 entry-obsidian 的 loadCards 给的是空串（它 catch 住当没读到）。
  // 那种卡一进编辑态就是一个空表单，看着无害，用户一保存就把整篇笔记覆盖成空的。
  // 宁可点了没反应，也不能让一次点按把一篇笔记清空。
  if (!card.content) {
    if (ctx.hResume) ctx.hResume.textContent = "这篇这次没读出来，先别改它";
    return null;
  }

  // 再进编辑态就把上一次的撤销收掉：新的保存会再发一张，两张并排只会让人分不清
  // 「撤销」倒回到哪一版。
  clearUndo(ctx);

  const ed = buildEditor(ctx, card);
  ctx._editor = ed;
  ctx.holo.classList.add("kb-v13-editing");
  ctx.holo.appendChild(ed.el);
  // 面板刚变宽（styles.js 的 .kb-v13-editing），卫星必须按新几何重排一次。
  // 卫星连线（.kb-v13-sat-lines）的 z-index 比面板还高，不重排的话那几十条线
  // 内侧会横穿表单画在你脸上。
  if (ctx.refreshSatellites) ctx.refreshSatellites();
  return ed;
}

/**
 * 退出编辑态。
 *
 * @param {object} ctx
 * @param {object} [opts]
 * @param {boolean} [opts.save]  保存后再退（异步）
 * @param {boolean} [opts.force] 有未保存改动也直接退，不弹确认
 * @returns {boolean} 是否真的退出了。false = 被脏态确认拦下了
 */
export function closeEditor(ctx, opts = {}) {
  const ed = ctx._editor;
  if (!ed) return true;
  if (ed.busy) return false; // 正在写盘，等它落地，别把表单从脚下抽走

  if (opts.save) {
    saveEditor(ctx);
    return false; // 真正的退出由 saveEditor 收尾
  }
  // 脏态拦截：改了东西又按取消/关面板，先问一句。静默丢掉用户刚打的字是最糟的失败。
  if (!opts.force && isDirty(ed)) {
    showDiscardConfirm(ctx, ed);
    return false;
  }
  teardown(ctx);
  return true;
}

/** 强行退出（写盘成功、或用户确认放弃之后）。不弹任何东西。 */
function teardown(ctx) {
  const ed = ctx._editor;
  if (!ed) return;
  ctx._editor = null;
  if (ed.el && ed.el.parentNode) ed.el.remove();
  if (ctx.holo) {
    ctx.holo.classList.remove("kb-v13-editing");
    // 面板收回原宽度，卫星得跟着回来。这一句不能省：**取消（Esc）那条路不经过
    // showHologram**，漏了它就会留下一圈按宽面板算出来的连线，一直挂到下次换卡。
    if (ctx.refreshSatellites) ctx.refreshSatellites();
  }
}

/**
 * 保存。异步，走适配层的 writeCard。
 *
 * 三个要点：
 *   1. 基线用 `ed.base`（**打开编辑那一刻**的原文），不是此刻的 card.content——
 *      card.content 可能在编辑期间被别处改过，拿它当基线等于用自己的改动给自己作证。
 *   2. 结果三态：成功 / 冲突 / 失败，冲突要给「覆盖」和「放弃」两条路，不能闷头覆盖。
 *   3. await 之后必须回头看 ctx 还在不在树上：写盘会触发 metadataCache 变化，
 *      Dataview 可能此时把整个晶体库重跑一遍，我们的 ctx 就过期了；
 *      继续写 DOM 是写进一棵已经摘下来的树，屏幕上什么都不会发生。
 */
export async function saveEditor(ctx) {
  const ed = ctx._editor;
  if (!ed || ed.busy) return;
  if (!isDirty(ed)) {
    // 没动过就当取消：没必要为一次空操作写盘、惊动同步
    teardown(ctx);
    return;
  }

  const patch = pendingPatch(ed);
  const res = await write(ctx, ed, compose(ed, patch), ed.base);
  if (!res) return; // ctx 已过期，别再碰 DOM
  if (res.ok) {
    finishSave(ctx, ed, patch.fm, res.content);
    return;
  }
  if (res.reason === "conflict") {
    showConflict(ctx, ed, res, patch);
    return;
  }
  showMessage(ctx, ed, res.reason === "missing"
    ? "这篇笔记找不到了——可能被删掉或改了名。"
    : "写不进去：" + (res.message || "未知错误"));
  setBusy(ctx, ed, false);
}

/**
 * 由脏字段与脏正文拼出新全文。
 *
 * 顺序不敏感：patchFrontmatter 对正文逐字节保留，patchBody 对 frontmatter 块逐字节
 * 保留，两个方向都是无损的。真正的护栏在 pendingPatch 里（**只交脏的**）。
 */
function compose(ed, patch) {
  return patchBody(patchFrontmatter(ed.base, patch.fm), patch.body);
}

/** 走一次适配层，并把「ctx 还在不在」这层判断一起做掉。返回 null 表示 ctx 已过期。 */
async function write(ctx, ed, content, base) {
  setBusy(ctx, ed, true);
  let res;
  try {
    res = await ctx.adapter.writeCard(ed.card.path, content, { base });
  } catch (e) {
    // 契约要求适配层绝不抛，但接缝对面的实现不受我们控制——最坏也只准显示成一次失败
    res = { ok: false, reason: "error", message: String((e && e.message) || e) };
  }
  if (!ctx.fs || !ctx.fs.isConnected) return null;
  return res || { ok: false, reason: "error", message: "没有返回结果" };
}

/**
 * 写盘成功之后：留撤销 → 更新模型 → 重算关系图 → 按顺序重渲染。
 *
 * 顺序不能反，两处都是硬约束：
 *   - `applyCardFields` 必须在 `refreshRelations` 之前：重算读的就是 card.content。
 *   - `teardown` 必须在 `refreshCard` 之前：卫星是按**面板此刻的几何**算椭圆的，
 *     编辑态面板更宽（880 vs 500），先重渲染的话卫星会按表单那个盒子摆一圈，
 *     存完看着就是「连线歪了」。
 */
function finishSave(ctx, ed, fmFields, content) {
  const card = ed.card;
  // 撤销先登记再刷新：refreshCard 会走 showHologram，而那一趟末尾就会把撤销条建出来
  // ——它要求 win 里那份已经在了。
  publishUndo(ctx, {
    path: card.path,
    title: card.title,
    prev: ed.base, // 打开编辑那一刻的全文，逐字节
    prevFields: ed.baseFields, // 那一刻模型里的 FM 值（撤销要连 FM 一起回退）
    base: content, // 撤销写盘的基线 = 刚写下去那份的**回读**
    at: Date.now(),
  });
  // 记一笔「刚保存过」：写盘会让 Dataview 重跑整个块（若会的话），重挂之后
  // #14 的恢复路径会翻开同一张卡并说「上次看到的是这张」——刚点完保存听到这句
  // 是句错话。下次 mount 用它换成「已保存」（见 app.js 的 restoreInto）。
  if (ctx.win) ctx.win.__kbV13JustSaved = Date.now();

  refreshAfterWrite(ctx, card, fmFields, content);
}

/** 保存与撤销共用的刷新链。fields 只给改了的那几个键。 */
function refreshAfterWrite(ctx, card, fields, content) {
  // 用**回读的真实全文**更新模型，不是我们自己拼的那份（宿主可能规范化了行尾等）
  applyCardFields(card, fields, content);
  if (ctx.refreshRelations) ctx.refreshRelations();
  teardown(ctx);
  if (ctx.refreshCard) ctx.refreshCard(card);
  // 卡面也得跟上：概念、标签、卡头关键词、孤岛虚线都烘在建卡那一刻的 DOM 里。
  // 粒度只有「整片重建」这一档（cardgrid.js 的 renderRingCards），好在面板盖着，
  // 看不见中间过程，而且它按 state.scrollOffset 渲染，翻到第几页还是第几页。
  if (ctx.refreshCards) ctx.refreshCards();
  // 晶体环上那颗「孤」徽章归晶体层管，refreshCards 碰不到它
  if (ctx.refreshCrystalLayer) ctx.refreshCrystalLayer();
  // **立刻**把这会儿屏幕上是什么落盘（不等防抖）。写盘很可能让 Dataview 把整个块
  // 重跑一遍，重挂之后 #14 的恢复路径就是靠这份状态把面板翻回同一张卡的——
  // 不落盘的话，用户存完一睁眼发现自己被扔回了晶体环。上面 showHologram 刚更新过
  // state.selectedCard，所以这一步必须排在它后面。
  if (ctx.flushViewState) ctx.flushViewState();
}

// ============================================================
// 表单构建
// ============================================================

function buildEditor(ctx, card) {
  const el = EL("div", "kb-v13-editform");
  const inputs = {};

  // 操作栏排在最前，而且是吸顶的（styles.js）。两个理由缺一不可：
  //   - iOS 键盘弹起来会盖住下半屏，操作栏跟着滚走就等于没有，而移动端
  //     没有 Esc 也没有 Ctrl+Enter——可见的保存/取消是硬需求，不是锦上添花；
  //   - 吸顶元素在滚动容器里的「自然位置」就是它在 DOM 里的位置，
  //     放到最后的话一进编辑态它就在屏幕外，等于没做。
  const bar = EL("div", "kb-v13-edit-bar");
  const save = EL("button", "kb-v13-edit-btn kb-v13-edit-save", "保存");
  const cancel = EL("button", "kb-v13-edit-btn kb-v13-edit-cancel", "取消");
  // 表单里 button 默认 type=submit，回车会触发一条我们没接的隐式提交路径
  save.type = "button";
  cancel.type = "button";
  save.title = "写回这篇笔记（Ctrl/Cmd + Enter）";
  cancel.title = "不改了（Esc）";
  bar.append(save, cancel);
  el.appendChild(bar);

  for (const f of FIELDS) {
    const row = EL("div", "kb-v13-edit-row");
    const cap = EL("div", "kb-v13-edit-cap");
    cap.textContent = f.key;

    const box = f.multiline
      ? EL("textarea", "kb-v13-edit-input")
      : EL("input", "kb-v13-edit-input");
    if (f.multiline) box.rows = 3;
    else box.type = "text";
    box.value = valueOf(card, f);
    box.dataset.field = f.key;
    // 输入框 font-size 在 styles.js 里定死 ≥16px：小于 16 时 iOS Safari 一聚焦
    // 就自动放大整页，放大之后表单会横向溢出面板，很难看也很难退回去。
    inputs[f.key] = box;

    const hint = EL("div", "kb-v13-edit-hint");
    hint.textContent = f.hint;

    row.append(cap, box, hint);
    el.appendChild(row);
  }

  // 正文放最后：进编辑态第一眼还是那三个熟悉的字段；正文是要花时间改的那块，
  // 往下续着读正好。反过来放的话，一个撑到半屏的 textarea 会把标签字段推到屏幕外，
  // 每次改标签都得先滚一段。
  const bodyRowEl = bodyRow(card);
  el.appendChild(bodyRowEl.row);

  const status = EL("div", "kb-v13-edit-status");
  status.hidden = true;
  el.appendChild(status);

  const bodyBox = bodyRowEl.box;

  const ed = {
    card,
    el,
    inputs,
    body: bodyBox,
    bar,
    status,
    // 基线：打开编辑那一刻的原文。patchFrontmatter / patchBody 和 writeCard 的 base
    // 用的都是它，三处必须是同一份，否则冲突检测比的就不是「我基于什么改的」。
    base: card.content == null ? "" : card.content,
    // 正文显示的是「剥掉开头空行、行尾归一」之后的版本。存这一份用来比对脏没脏——
    // 不归一的话，一张 CRLF 的卡一进编辑态就会显示「有未保存改动」（textarea 只认 LF）。
    originalBody: normalizeEol(stripBodyPrefix(splitCard(card.content).body)),
    // 撤销要连 frontmatter 一起回退，所以这里存的是**模型里的值**，不是 readForm 那份：
    // readForm 的 tags 是 join(", ") 再 parseTags 回来的，含逗号的标签会被拆成两个。
    baseFields: {
      概念: card.concept || "",
      来源: card.source || "",
      tags: (card.tags || []).slice(),
    },
    original: null,
    busy: false,
  };
  ed.original = readForm(ed);

  save.addEventListener("click", () => closeEditor(ctx, { save: true }));
  cancel.addEventListener("click", () => closeEditor(ctx));
  return ed;
}

/** 正文那一行。单独建的，理由见 FIELDS 头顶那段。 */
function bodyRow(card) {
  const row = EL("div", "kb-v13-edit-row kb-v13-edit-row-body");
  const cap = EL("div", "kb-v13-edit-cap", "正文");
  const box = EL("textarea", "kb-v13-edit-input kb-v13-edit-body");
  box.rows = 12;
  box.spellcheck = false; // 中文正文 + 代码，拼写红线纯噪音
  // iOS 上别自动改词、别自动大写——正文里全是 plt.scatter 这种会被「纠正」的东西
  box.setAttribute("autocorrect", "off");
  box.setAttribute("autocapitalize", "off");
  box.setAttribute("wrap", "soft");
  box.setAttribute("enterkeyhint", "enter");
  box.value = normalizeEol(stripBodyPrefix(splitCard(card.content).body));
  box.dataset.field = "正文";
  const hint = EL("div", "kb-v13-edit-hint");
  hint.textContent =
    "卡片正文原文（markdown）。开头的空行是 frontmatter 与正文之间的间隔，不显示也不改动。" +
    "里面的双链就是卡片之间的连线——改完保存，卫星和孤岛标会跟着重算。";
  row.append(cap, box, hint);
  return { row, box };
}

function valueOf(card, f) {
  if (f.tags) return (card.tags || []).join(", ");
  if (f.key === "概念") return card.concept || "";
  if (f.key === "来源") return card.source || "";
  // 加了新字段就得来这里补一行。别让兜底有返回值——那会静默给新字段填上别人的值。
  return "";
}

/** 表单里的 frontmatter 三个字段。**只含 FM 键**，正文不在里面（见 FIELDS 头顶）。 */
function readForm(ed) {
  const out = {};
  for (const f of FIELDS) {
    const raw = ed.inputs[f.key].value;
    out[f.key] = f.tags ? parseTags(raw) : raw;
  }
  return out;
}

// 逗号分隔，半角全角都认；顺手去掉空项，免得「a,,b」写出一个空标签
function parseTags(raw) {
  return String(raw || "")
    .split(/[,，、]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function readBody(ed) {
  return ed.body ? ed.body.value : "";
}

function fieldChanged(ed, f) {
  const raw = ed.inputs[f.key].value;
  const now = f.tags ? parseTags(raw) : raw;
  const was = ed.original[f.key];
  return f.tags ? now.join(" ") !== was.join(" ") : now !== was;
}

function bodyChanged(ed) {
  return readBody(ed) !== ed.originalBody;
}

function isDirty(ed) {
  return bodyChanged(ed) || FIELDS.some((f) => fieldChanged(ed, f));
}

/**
 * 这次要写什么。**只交脏的**——这不是优化，是必要条件。
 *
 * patchFrontmatter 对「传进来的每个键」都会动笔：找不到就插一行。若无条件把三个
 * 字段全交出去，那么「只改了正文」也会顺手给一张**故意没有 YAML 的笔记**塞进一个
 * 概念/来源/tags 全空的 frontmatter 块。库里真有这种笔记（正文第一行就是围栏的
 * 一张 dvjs，还有一张正文只有三个数字的）。
 *
 * body 用 undefined 表示「没碰」——patchBody 会原样放行。别用 ""，那是「清空正文」。
 */
function pendingPatch(ed) {
  const fm = {};
  for (const f of FIELDS) {
    if (!fieldChanged(ed, f)) continue;
    fm[f.key] = f.tags ? parseTags(ed.inputs[f.key].value) : ed.inputs[f.key].value;
  }
  return { fm, body: bodyChanged(ed) ? readBody(ed) : undefined };
}

// ============================================================
// 状态提示
// ============================================================

function setBusy(ctx, ed, on) {
  ed.busy = on;
  const btns = ed.bar.querySelectorAll("button");
  btns.forEach((b) => {
    b.disabled = on;
  });
  if (on) showMessage(ctx, ed, "正在写回…");
  else if (!ed.status.dataset.keep) clearStatus(ed);
}

function clearStatus(ed) {
  ed.status.innerHTML = "";
  ed.status.hidden = true;
  delete ed.status.dataset.keep;
}

function showMessage(ctx, ed, text) {
  ed.status.hidden = false;
  ed.status.className = "kb-v13-edit-status";
  ed.status.textContent = text;
}

/** 脏态确认：两条路都摆出来，别让「取消」变成一次静默的放弃。 */
function showDiscardConfirm(ctx, ed) {
  ed.status.hidden = false;
  ed.status.className = "kb-v13-edit-status kb-v13-edit-warn";
  ed.status.innerHTML = "";
  const text = EL("span", "kb-v13-edit-warn-text", "有没保存的改动。");
  const drop = EL("button", "kb-v13-edit-btn kb-v13-edit-drop", "放弃改动");
  const back = EL("button", "kb-v13-edit-btn", "继续编辑");
  drop.type = "button";
  back.type = "button";
  drop.addEventListener("click", () => teardown(ctx));
  back.addEventListener("click", () => clearStatus(ed));
  ed.status.append(text, drop, back);
}

/**
 * 冲突：这张卡在别处被改过（多半是 FNS 同步把手机上的改动落下来了）。
 *
 * 这里**不自动合并**。frontmatter 三个字段是可以三方合并的，但正文不行，
 * 而两张卡片合并到一半的中间态比直接问一句危险得多。摆出两条路，让用户选。
 */
function showConflict(ctx, ed, res, patch) {
  setBusy(ctx, ed, false);
  ed.status.dataset.keep = "1"; // 别被 setBusy 的收尾清掉
  ed.status.hidden = false;
  ed.status.className = "kb-v13-edit-status kb-v13-edit-conflict";
  ed.status.innerHTML = "";

  const bodyDirty = patch && patch.body !== undefined;
  const text = EL("span", "kb-v13-edit-warn-text",
    bodyDirty
      ? "这张卡（正文）在别处被改过，没有覆盖它。"
      : "这张卡在别处被改过（不是你这边的改动），没有覆盖它。");
  const over = EL("button", "kb-v13-edit-btn kb-v13-edit-drop", "用我的覆盖");
  const drop = EL("button", "kb-v13-edit-btn", "放弃我的改动");
  over.type = "button";
  drop.type = "button";
  over.title = "把别处那次改动丢掉，用这个表单里的内容写回去";
  drop.title = "保留别处那次改动，这次不写";

  // 摆出「别人那份长什么样」。只说「被改过」而不给看，用户没法判断该覆盖还是该放弃
  // ——尤其是手机同步过来的改动，他自己多半不记得写了什么。
  const other = EL("pre", "kb-v13-edit-diff");
  other.textContent = peekOther(res && res.content, bodyDirty);

  over.addEventListener("click", async () => {
    // 先把表单取值定下来再去 await：写盘期间用户还能改输入框，
    // 取两次会写出一个「保存的」和「显示的」不是同一份的鬼状态。
    const p = pendingPatch(ed);
    // 覆盖 = 明确不要基线检查。base 传 undefined，适配层就不比对了。
    const r = await write(ctx, ed, compose(ed, p), undefined);
    if (!r) return;
    if (r.ok) finishSave(ctx, ed, p.fm, r.content);
    else showMessage(ctx, ed, "还是写不进去：" + (r.message || r.reason));
  });
  drop.addEventListener("click", () => teardown(ctx));

  ed.status.append(text, other, over, drop);
}

/**
 * 冲突时给对方那份的开头几行看一眼。取不到就什么都不显示。
 *
 * 改了正文就看正文、只改 frontmatter 才看 frontmatter：正文冲突时给人家看
 * frontmatter，等于什么都没说（改的就不是那几行）。
 */
function peekOther(content, bodyDirty) {
  if (!content) return "";
  const src = String(content);
  if (bodyDirty) {
    return normalizeEol(stripBodyPrefix(splitCard(src).body)).split("\n").slice(0, 10).join("\n");
  }
  const fm = src.split(/\r?\n---/)[0];
  return fm.split(/\r?\n/).filter(Boolean).slice(0, 8).join("\n");
}

// ============================================================
// 撤销：写盘之后的后悔药
// ============================================================
//
// 正文是一大块文本，改错了就是内容损坏，而 textarea 没有 undo 栈能跨保存。
// 所以每次写盘都在面板上留一条「保存好了。[撤销]」，点一下就把之前那份写回去。
//
// ⚠️ **唯一真相挂在 win 上，DOM 由它派生**。理由和 __kbV13JustSaved /
// __kbV13PersistTimer / __kbV13Keydown 那几个一模一样：写盘会触发 metadataCache
// 变化，Dataview 可能把整个块重跑一遍，那一刻面板连同撤销条一起被销毁——条子要是
// 只活在 DOM 里，用户永远点不到它。挂在 win 上，重挂之后同一张卡再打开时
// offerUndo 会发现它还在，把条子重新建出来。
//
// 只给一次撤销、不给重做：每次写盘都是一次真磁盘写 + 一次 FNS 同步，撤销/重做对
// 会把这个流量翻倍、并在 git 里留下成对的假 diff；而且重做时「基线该传什么」是
// 无解的（传撤销那次写盘的回读，于是重做变成第三次快照比对，链条越拉越细）。
// 要更早的版本有两条更好的路：重新按 ✎ 把正文粘回去，或者走 ↗ 分屏。

const UNDO_KEY = "__kbV13Undo";
const UNDO_TTL_MS = 5 * 60 * 1000;

function publishUndo(ctx, entry) {
  if (ctx.win) ctx.win[UNDO_KEY] = entry;
}

/** 撤掉这场撤销（关面板、换卡、再进编辑态都要调）。 */
export function clearUndo(ctx) {
  if (ctx.win) delete ctx.win[UNDO_KEY];
  dropUndoNode(ctx);
}

/** 只摘掉条子，不动 win 里那份。showHologram 每次开头调它，保证不会堆积。 */
export function dropUndoNode(ctx) {
  if (!ctx.holo) return;
  const old = ctx.holo.querySelector(".kb-v13-undo");
  if (old) old.remove();
}

/**
 * 按 win 里那份决定这条面板上要不要有撤销条。showHologram 末尾调。
 *
 * 对不上（换了卡 / 过期 / 根本没有）就顺手清掉——撤销的语义是「我刚才在这张卡上
 * 手滑了」，换一张卡就不成立了。
 */
export function offerUndo(ctx, card) {
  dropUndoNode(ctx);
  const e = ctx.win && ctx.win[UNDO_KEY];
  if (!e || !card || e.path !== card.path || Date.now() - e.at > UNDO_TTL_MS) {
    if (e) clearUndo(ctx);
    return;
  }
  if (!ctx.holo) return;
  const node = buildUndoNode(ctx, e);
  // 夹在标签区与正文之间：面板是可滚的、重渲染又不重置 scrollTop，挂到尾部可能
  // 落在屏幕外——**一个看不见的撤销等于没有**。
  if (ctx.hBody && ctx.hBody.parentNode === ctx.holo) ctx.holo.insertBefore(node, ctx.hBody);
  else ctx.holo.appendChild(node);
}

function buildUndoNode(ctx, entry) {
  const el = EL("div", "kb-v13-undo");
  const text = EL("span", "kb-v13-undo-text", "保存好了。");
  const btn = EL("button", "kb-v13-edit-btn kb-v13-undo-btn", "撤销");
  btn.type = "button";
  btn.title = "把这张卡恢复成你打开编辑之前的样子";
  btn.addEventListener("click", () => runUndo(ctx, entry, btn));
  el.append(text, btn);
  return el;
}

/**
 * 真的撤回去：把保存前那份全文写回。
 *
 * `base` 传的是「刚写下去那份的回读」——不能传打开编辑时的原文（早过期了，必然
 * 假冲突），也不能不传（等于静默覆盖别处的改动）。
 *
 * 撤销失败**不摆第二条路**：为了一个便利功能再放一个破坏性按钮不划算。说明一句、
 * 收掉按钮，等下一次导航自然带走。
 */
async function runUndo(ctx, entry, btn) {
  if (entry.busy) return;
  entry.busy = true;
  if (btn) btn.disabled = true;
  let res;
  try {
    res = await ctx.adapter.writeCard(entry.path, entry.prev, { base: entry.base });
  } catch (e) {
    res = { ok: false, reason: "error", message: String((e && e.message) || e) };
  }
  if (!ctx.fs || !ctx.fs.isConnected) return;
  if (!res || !res.ok) {
    const box = ctx.holo && ctx.holo.querySelector(".kb-v13-undo");
    if (box) {
      box.classList.add("kb-v13-undo-failed");
      box.innerHTML = "";
      box.textContent = res && res.reason === "conflict"
        ? "这张卡在这之后又被改过，没有撤销。"
        : "撤销没写成：" + ((res && res.message) || "未知错误");
    }
    return;
  }
  const card = ctx.model && ctx.model.cardByTitle ? ctx.model.cardByTitle(entry.title) : null;
  clearUndo(ctx);
  if (ctx.win) ctx.win.__kbV13JustSaved = Date.now();
  // 撤销也是一次写盘，也一样会改双链（回到旧正文），刷新链与保存完全一样
  if (card) refreshAfterWrite(ctx, card, entry.prevFields, res.content);
}
