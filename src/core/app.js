// 挂载编排：建 DOM、绑事件、暴露句柄。
//
// 唯一要求宿主提供的就是 adapter（见 ../adapter.js 的五方法契约）。
// 这个文件以及 core/ 下其它文件都不引用 Obsidian / Dataview。

import { assertAdapter } from "../adapter.js";
import { sanitizeViewState, collectViewState, defaultViewState, forgetScreen } from "./viewstate.js";
import { sanitizePrefs, collectPrefs } from "./prefs.js";
import { EL } from "./dom.js";
import { beginInlineRename } from "./inlinerename.js";
import { CSS } from "./styles.js";
import { createMetrics } from "./layout.js";
import { createModel, applyCardFields } from "./model.js";
import { showTooltip, hideTooltip } from "./tooltip.js";
import {
  renderCrystals,
  expandCrystal,
  restoreExpanded,
  collapseCrystal,
  applyExpanded,
  clearSelection,
  selectCrystal,
  crystalClicked,
  // #19 多层：退一层 / 跳到某一层
  drillUp,
  drillToDepth,
  // #21 两栏主次：晶体为主 ⇄ 卡片为主
  setFacetFocus,
  canFacetFocus,
  // #16 第二轮：正文改了之后，孤岛汇总归它管
  refreshCrystalLayer,
} from "./crystals.js";
import {
  renderRingCards,
  revealConcept,
  concealConcept,
  unbindScrollListeners,
  smoothScroll,
} from "./cardgrid.js";
import { showHologram, closeHologram, refreshSatellites } from "./hologram.js";
// 3.0 刀 2 显示模式 + 画布。canvas.js 单向 import crystals.js（要用它的
// makeCrystalEl），调度那一下由 app.js 接成 ctx.renderCanvasStage——
// 两个模块互相 import 会绕成环，仓里对这种情况的既有套路就是走 ctx。
import { applyStage, toggleStage, stageOf, isCameraStage, stageLabel } from "./stage.js";
import {
  renderCanvasStage,
  applyCamera,
  worldBounds,
  // 3.0 刀 3：布局草稿 + 拖晶体
  beginDraft,
  commitDraft,
  resetLayout,
  isDraftDirty,
  bindCrystalDrag,
  layoutOf,
} from "./canvas.js";
// 3.0 刀 4：方框模块。单向 import canvas.js（要 layoutOf / worldPosOf）——
// canvas.js 不 import 本文件，调度那一下由 app.js 接成 ctx.renderModules。
import {
  renderModules,
  bindModuleInteractions,
  addModule,
  removeModule,
  dropCrystal,
  moduleById,
  modulesOf,
  membershipOf,
  moduleAtPoint,
} from "./modules.js";
// 3.0 刀 5 故事线。单向 import canvas.js；调度那一下接成 ctx.renderStorylineStage。
import {
  renderStorylineStage,
  storylineBounds,
  bindStorylineDrag,
  bindStorylineClicks,
  bindLinkMode,
  bindLinkGuard,
  bindLineEdit,
  bindBendEditing,
  refreshLineHint,
  setLineEdit,
  setMarqueeArm,
  isMarqueeArmed,
  deletePickedFor,
  marqueeSel,
  leaveStoryline,
  setLinking,
  invalidateStoryline,
  hiddenCardSet,
  showAllHidden,
} from "./storyline.js";
// 3.0 刀 6 文献阅读器。它是一个**顶层浮层**（不是 state.stage 的第五个值）——
// 它读的东西（PDF / 图片 / markdown）与晶体层级毫无关系，塞进 stage 那四档
// 会凭空造出「故事线 + 阅读器」这种没有意义的格子。
// pdfRenderer 走 mount 参数、不进适配层契约：契约的语义是「宿主能力」，
// 而「怎么把 PDF 画出来」是核心的实现选择，宿主只负责把字节递过来。
import { createReader } from "./reader.js";
// #20 孤岛汇总。它 import crystals.js（要用 restoreExpanded），crystals.js 那边
// 通过 ctx.refreshOrphans 反向回调——直接互相 import 会成环。
import {
  refreshOrphanSummary,
  toggleOrphanPanel,
  closeOrphanPanel,
  onOrphanPanelClick,
} from "./orphans.js";
// #21「文件夹」面板：全库的晶体 → 卡片树。与孤岛那份共用画法与样式。
import {
  refreshFolderSummary,
  toggleFolderPanel,
  closeFolderPanel,
  onFolderPanelClick,
} from "./folders.js";
// #11 代码窗 / #15 图片窗都收在这一份注册表里，Esc 分流只需要这一个入口
import { closeTopFloat } from "./floatwin.js";
import { setAllMasks } from "./mask.js";
import { MODE_RECALL, MODE_REVIEW, normalizeMode, isReview } from "./mode.js";
import { bindPanelDrag, resetPanelOffset } from "./holodrag.js"; // #10 主卡片可拖
import { isEditing, closeEditor, saveEditor } from "./editform.js"; // #16 卡片内编辑

const STYLE_ID = "kb-v13-style";

// 视图状态落盘的防抖窗口。拖动、缩放、翻页都是高频动作，跟着每帧写一次
// localStorage 既拖慢交互，也让存储里全是没人要的中间态。
// 250ms 是「手停下来」的量级——手停之后不需要等就写完了。
const PERSIST_DEBOUNCE_MS = 250;

// 「刚保存过」这笔账的有效期。写盘会让 Dataview 重跑整个块，重挂发生在写盘 resolve
// 之后的几百毫秒内；超过这个窗口还挂着，只能是网页端这种**不会**重挂的场景里漏下来的
// ——那时再说「刚保存」就是错的（下次打开会显示"已保存"而不是"上次看到的是这张"）。
// 真库里若是大 vault、同步慢，重跑晚于这个窗口，表现只是提示语退回成"上次看到的是这张"，
// 不影响别处；嫌不准就把它调大。
const JUST_SAVED_TTL_MS = 5000;

// 「恢复默认」按了第一下之后，第二下有效的窗口。
// 短到不会一直悬着、长到来得及点第二下——这是**防误触**，不是防犹豫：
// 犹豫的人会重新看一眼按钮上的「确认恢复？」，那正是我们要他做的事。
const RESET_ARM_MS = 4000;

/**
 * 读回视图状态。契约要求适配层的 loadViewState 不许抛，但接缝对面的实现
 * 不受我们控制（宿主存储被禁用、第三方适配层写漏了 try）——最坏也只准退回
 * 默认视角。一份读不出来的状态把晶体库锁死，是这张票最不能接受的结果。
 */
function readViewState(ctx) {
  try {
    return sanitizeViewState(ctx.adapter.loadViewState());
  } catch (e) {
    return defaultViewState();
  }
}

function clearPersistTimer(ctx) {
  const win = ctx.win;
  if (win.__kbV13PersistTimer) {
    clearTimeout(win.__kbV13PersistTimer);
    win.__kbV13PersistTimer = 0;
  }
}

/**
 * 立即写盘。防抖到期走这里，「清 timer」因此只有一处实现。
 * 写失败只损失「下次打开还记得视角」，不该把这次的交互也一起毁掉。
 *
 * #14：写下去的是**此刻屏幕上是什么**。晶体库一共三层，各自对应一组字段：
 *   晶体环 → openCrystal 为 null；
 *   某颗晶体的某一页 → openCrystal + scrollOffset；
 *   某张翻开着的卡 → 再加 selectedCard（面板一合上就清，见 hologram.js 的 closeHologram）。
 * 缺字段就是 null，不需要另立一个「我到哪一层了」的标记——那反而会和这几份字段对不上。
 */
function writeViewState(ctx) {
  clearPersistTimer(ctx);
  try {
    ctx.adapter.saveViewState(collectViewState(ctx.state));
  } catch (e) {
    // 存储写满 / 被禁用：这次视口丢就丢了
  }
}

/**
 * 写下「某一刻屏幕上是什么」。关闭时专用（见 closeFullscreen）。
 *
 * 与 writeViewState 的区别只有一个：写的是传进来那份快照，不是此刻的运行时。
 * 关闭这个动作本身会把运行时清零（collapseCrystal 要清 openCrystal / scrollOffset，
 * 面板、滚轮、resize 都靠它们判「在不在晶体里」），所以那一刻必须在收缩**之前**
 * 取下来。收缩自己还会预约一次防抖落盘（250ms 后写「晶体环」），这里把 timer
 * 一并掐掉——否则用户前脚从晶体里出来，后脚那次落盘就把屏幕改写成晶体环了。
 */
function writeScreen(ctx, screen) {
  clearPersistTimer(ctx);
  try {
    ctx.adapter.saveViewState(screen);
  } catch (e) {
    // 同上：写不进去也只是丢一次视口，不该把这次交互也一起毁掉
  }
}

/**
 * 攒一下再写。timer 存在 win 上而不是闭包里，是为了让代码块重跑时
 * 新实例能认出并清掉旧实例还没落地的那一笔（见 mount 开头）。
 */
function schedulePersist(ctx) {
  clearPersistTimer(ctx);
  ctx.win.__kbV13PersistTimer = setTimeout(() => writeViewState(ctx), PERSIST_DEBOUNCE_MS);
}

function clearCardHover(ctx, el) {
  el.style.transform = "";
  el.style.zIndex = "";
  // #6 移开重新遮上。但复习模式下概念本来就该一直摊着（#9）——移开鼠标又盖上，
  // 等于复习到一半被自己弄没了，所以那条路只在回忆模式下走。
  if (el._concept && !isReview(ctx)) concealConcept(el._concept);
  hideTooltip(ctx);
}

/**
 * #9 切模式：回忆 ↔ 复习。
 *
 * 两个方向都是「整片扫一遍」，而不是记着谁被谁揭开了。原因是遮挡散在三处
 * （卡面概念区、卡头关键词条、全息分段），只有中间那类长得像 .kb-v13-mask；
 * 逐个记账漏一处的表现是「切了模式那一块没反应」，最难查的那类。
 *
 * 两棵子树都得扫：全息面板挂在 overlay 上，overlay 是 fs 的兄弟不是后代。
 *
 * 切回复忆模式时**已经揭开的也重新遮上**——这正是「回忆模式保持现状」的意思。
 * 内容本身留在原地不重渲染（mask.js 的 _rendered 护栏），再点开还是那份 DOM。
 */
export function applyMode(ctx, mode) {
  const next = normalizeMode(mode);
  ctx.state.mode = next;
  const review = next === MODE_REVIEW;

  ctx.fs.classList.toggle("kb-v13-mode-review", review);
  (ctx.modeBtns || []).forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.dataset.mode === next ? "true" : "false");
  });

  // 卡面「回忆一下」不是 .kb-v13-mask（它走 .revealed 那条路），扫遮罩扫不到
  ctx.fs.querySelectorAll(".kb-v13-card-concept").forEach((el) => {
    if (review) revealConcept(ctx, el);
    else concealConcept(el);
  });
  setAllMasks(ctx.fs, review);
  setAllMasks(ctx.overlay, review);
}

/**
 * 「这张卡变了没有」。逐项比而不是拼成一个字符串再比：拼串得挑一个分隔符，
 * 而任何分隔符都可能本来就出现在某个值里，撞出一个假相等。
 *
 * 不用哈希：模型里本来就躺着全文，=== 就是最准的哈希——不用算、不用存、
 * 也不会因为哪天换了算法而对不上。
 */
function sameCard(a, b) {
  if (a.content !== b.content) return false;
  if (a.concept !== b.concept) return false;
  if (a.source !== b.source) return false;
  const x = a.tags || [];
  const y = b.tags || [];
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/**
 * 外部改动：这张卡在**晶体库之外**被改了（#18）。
 *
 * 三个来源：多设备同步（FNS 把别的设备上的改动拖下来）、用户在分屏里手改、
 * 别的插件改盘。入口是适配层的 watchCards——核心自己听不见这些，而关掉
 * Dataview 的自动刷新之后尤其听不见，所以这条路必须补上。
 *
 * 与「库自己保存」那条路（editform.js 的 refreshAfterWrite）共用同一组 ctx.refresh*，
 * 但有三处**必须**不一样：
 *
 *   1. **没有编辑器的 patch**。字段值由适配层从 metadataCache 现读、随 Card 一起
 *      送进来，核心不解析 YAML（那条规矩由 frontmatter.js 一家把着）。
 *   2. **面板只在这张卡就是此刻开着的那张时才重画**。ctx.refreshCard 走的是
 *      showHologram，它会把面板**切到**传进去那张卡上——外部改动别的卡时
 *      把用户的视线拽走是不对的。
 *   3. **这张卡正在被编辑时直接不理会**。用户手上那份表单以「打开那一刻的全文」
 *      为基线，保存时适配层的 writeCard 会按基线比对回一个 conflict，那条路
 *      已经能干净地处理「别处被改过」。这里插一手只会把用户刚打的字连表单一起收掉。
 */
function applyExternalChange(ctx, incoming) {
  if (!incoming || !incoming.path) return;
  // 这个实例已经被宿主摘掉了（重挂）：继续写是写进一棵摘下来的树，屏幕上什么都
  // 不会发生。与 editform.js 里「await 之后回头看 ctx 还在不在树上」同一条理由。
  if (!ctx.fs || !ctx.fs.isConnected) return;
  const card = ctx.model.byPath.get(incoming.path);
  if (!card) return; // 不是我们的卡（别处新增的、改了名的、别的目录的）

  // ★ 快速路径。挡的主要是**我们自己写盘的回声**：保存会触发宿主那边的 modify，
  // 通知转一圈又回到这里。内容一个字节没变时，这里就该原地返回。
  if (sameCard(card, incoming)) return;

  // 正在编辑这张卡：见上面第 3 条。排在快速路径**之后**——内容没变时
  // 本来就不该因为「在编辑」而少走一步，那只是把同一件事换个顺序说。
  if (isEditing(ctx) && ctx._editor && ctx._editor.card.path === incoming.path) return;

  // 原地改（applyCardFields 的约定）：这张卡的对象被 model.groups、卡面 DOM 上的
  // el._card、以及此刻开着的面板同时握着，换成一个新对象只会更新其中一处，
  // 屏幕上就是一半新一半旧。
  applyCardFields(
    card,
    { 概念: incoming.concept, 来源: incoming.source, tags: incoming.tags },
    incoming.content
  );

  // 顺序与 refreshAfterWrite 一致，理由也一样：正文里的双链是关系图、卫星、孤岛标的
  // 唯一来源，模型没改对之前算出来的图是旧的。
  if (ctx.refreshRelations) ctx.refreshRelations();
  if (ctx.state.selectedCard === card.title && ctx.refreshCard) ctx.refreshCard(card);
  if (ctx.refreshCards) ctx.refreshCards();
  if (ctx.refreshCrystalLayer) ctx.refreshCrystalLayer();
  // 立刻落盘：视图状态里存着「上次看到的是这张卡」，而它的 title 可能正因为
  // 这次改动而变（改名不在这轮，但概念/来源会进卡片 DOM）。与保存那条路同一条理由。
  if (ctx.flushViewState) ctx.flushViewState();
}

/**
 * #21 刷新两栏主次那两颗按钮：显不显示、哪一颗是当前档。
 *
 * 只在「这一层有子文件夹」时出现（`canFacetFocus`）——叶子晶体没有第二栏，
 * 摆两个按不动的按钮在那儿比不摆还糟。当前那一档按下去不再有效果，所以
 * 用 `.active` 标出来，让人知道「已经在左边了」而不是「按了没反应」。
 */
function refreshFacetButtons(ctx) {
  // 画布模式下这两颗必须藏起来：那儿没有左右两栏可谈，留着就是
  // 「按了没反应」——那比不显示更让人怀疑界面坏了。
  const on = canFacetFocus(ctx) && ctx.state.stage !== "canvas";
  const focus = ctx.state.facetFocus;
  const pairs = [
    [ctx.facetLeft, "crystals"],
    [ctx.facetRight, "cards"],
  ];
  for (const [el, which] of pairs) {
    if (!el) continue;
    el.style.display = on ? "" : "none";
    el.classList.toggle("active", on && focus === which);
  }
}

/**
 * 顶栏上跟「显示模式」有关的那几颗：模式开关、恢复默认、两栏箭头。
 *
 * 三颗按钮的显隐规则各不相同，但都由**同一档位**决定，所以放在一处算——
 * 分散开的话，加一档就要满文件找哪几颗按钮该跟着变。
 */
/**
 * 「恢复默认」的完整动作。顶栏那颗按钮与测试句柄共用这一份。
 *
 * 三件事缺一不可：丢掉草稿并回默认 → 相机按新的重铺 → **重画**。
 * 少了最后一步的话，状态回去了而屏幕没动——用户看到的是「按了没反应」。
 */
function doResetLayout(ctx) {
  resetLayout(ctx);
  applyCamera(ctx, isCameraStage(ctx.state.stage));
  renderCrystals(ctx);
  refreshStageUi(ctx);
}

function refreshStageUi(ctx) {
  refreshFacetButtons(ctx);
  const stage = stageOf(ctx);
  const camera = isCameraStage(stage);

  // 模式开关：字写「按下去会去哪」，高亮表示「不在默认那一档」。
  // 两件事分开表达，按钮就不必为「我现在到底在哪一档」再想一套措辞。
  //
  // label 为 null = 这一档**没有可换的去处**（比如故事线还没做出来），
  // 那就整颗收起来。摆一颗按了没反应的按钮比不摆更糟：它让人以为坏了。
  if (ctx.stageBtn) {
    const label = stageLabel(ctx);
    ctx.stageBtn.style.display = label ? "" : "none";
    if (label) ctx.stageBtn.textContent = label;
    ctx.stageBtn.classList.toggle("kb-v13-stage-on", camera);
    // 「未保存」。这不是装饰——它回答的是「我刚摆的东西算不算数」，
    // 而那正是「记住当前」那颗按钮本来要回答的问题。用一个标记回答比
    // 摆一颗点了没事干的按钮诚实。
    ctx.stageBtn.classList.toggle("kb-v13-stage-dirty", isDraftDirty(ctx));
  }

  // 「恢复默认」只在画布模式下出现：别处没有布局可恢复。
  // 两步式：第一下把按钮变成「确认恢复？」，第二下才真做。
  if (ctx.resetBtn) {
    // 画布和故事线都有布局可恢复（一个是晶体位置，一个是卡片位置）。
    // 语义本来就跟你说的一致：**退出时没点 = 记下当前**，草稿在离开相机档时
    // 自动提交（见 stageHooks.onLeave），不必再有一颗"保存"按钮。
    ctx.resetBtn.style.display = stage === "canvas" || stage === "storyline" ? "" : "none";
    ctx.resetBtn.textContent = ctx._resetArmed ? "确认恢复？" : "恢复默认";
    ctx.resetBtn.classList.toggle("kb-v13-armed", !!ctx._resetArmed);
  }

  // 「+ 方框」同理：方框是画布上的东西。
  if (ctx.addModBtn) ctx.addModBtn.style.display = stage === "canvas" ? "" : "none";

  // 编辑模式那行说明：跟着模式开关走（模式在别处被关掉时也要收起来）。
  refreshLineHint(ctx);

  // 「选框 / 删除实线」：**右键进过图模式之后才出现**（连接模式或连线编辑模式）。
  // 平时不摆——故事线上没在摆弄线的时候，顶上多两颗按钮是噪音。
  const inGraphMode = ctx.state.linking || ctx.state.lineEdit;
  if (ctx.marqueeBtn) {
    ctx.marqueeBtn.style.display = stage === "storyline" && inGraphMode ? "" : "none";
    // 字说的是**按下去会怎样**（顶栏其它开关都是这个口径）
    ctx.marqueeBtn.textContent = isMarqueeArmed(ctx) ? "退出选框" : "选框";
    ctx.marqueeBtn.classList.toggle("kb-v13-marquee-on", isMarqueeArmed(ctx));
  }
  if (ctx.delLinesBtn) {
    const n = marqueeSel(ctx).length;
    // **只在真的有得删的时候出现**。摆一颗点了没反应的按钮比不摆更糟。
    ctx.delLinesBtn.style.display = stage === "storyline" && n > 0 ? "" : "none";
    ctx.delLinesBtn.textContent = "删除实线（" + n + "）";
  }

  // 「隐藏连线」只在故事线出现——别处根本没有线可藏。
  if (ctx.hideLinksBtn) {
    ctx.hideLinksBtn.style.display = stage === "storyline" ? "" : "none";
    ctx.hideLinksBtn.textContent = ctx.state.hideLinks ? "显示连线" : "隐藏连线";
    ctx.hideLinksBtn.classList.toggle("kb-v13-hidelinks-on", !!ctx.state.hideLinks);
  }

  // 「显示全部」（3.0 刀 13）比上面那颗多一个条件：**还得真藏着东西**。
  // 上面那颗是"有得藏就摆着"（线可能随时被写出来）；这一颗藏没藏是确定的，
  // 所以没藏的时候摆出来就是一颗点了没反应的按钮。
  if (ctx.showAllBtn) {
    const hiddenN = hiddenCardSet(ctx).size;
    ctx.showAllBtn.style.display = stage === "storyline" && hiddenN > 0 ? "" : "none";
  }

  // 3.0 刀 9-C「文献」那颗。挂起中（人刚从它切去看故事线）换个说法再说一遍——
  // 只说「文献」的话，用户没法知道点下去是「新开一份」还是「回到刚才那份」，
  // 而这两件事差别很大：开着的文献、桌面摆法、页码和缩放在不在。
  // 这颗按钮**任何 stage 都常驻**（不在上面那张显隐表里），所以从故事线点回来
  // 这条路一直都在，不必为它另加一颗。
  if (ctx.readerBtn) {
    const back = !!(ctx.reader && ctx.reader.isSuspended && ctx.reader.isSuspended());
    ctx.readerBtn.textContent = back ? "回到文献" : "文献";
    ctx.readerBtn.classList.toggle("kb-v13-reader-btn-back", back);
    ctx.readerBtn.title = back
      ? "回到刚才那份文献：开着的文献、桌面摆法、页码和缩放都还留着。"
      : "打开文献阅读器：一屏摊开好几页 PDF / 图片 / markdown，右边随手建卡片。";
  }
}

/**
 * #22 把偏好铺到 DOM 上。
 *
 * 走 CSS 变量而不是直接改元素的 style：偏好是「这一整套 UI 的设定」，
 * 铺在根节点上、由样式表去 var() 取——以后多一个偏好、多一个落点，
 * 都只动这里一行和样式表一行，不必到处找元素。
 */
function applyPrefs(ctx) {
  if (!ctx.fs || !ctx.state.prefs) return;
  ctx.fs.style.setProperty("--kb-search-color", ctx.state.prefs.searchColor);
}

export async function mount({
  adapter,
  container,
  win = window,
  doc = document,
  storyLayout = null,
  // 3.0 刀 6：PDF 渲染器（见 pdfdoc.js）。宿主没有这份能力时是 null——
  // 阅读器照样能用，只在 PDF 那一项上说一句「这个宿主没有 PDF 渲染能力」，
  // 而不是整块崩掉。**不进适配层契约**，理由见上面那段。
  pdfRenderer = null,
  // 3.0 刀 10：样式由谁来放。
  //   true（默认，dataviewjs 形态）—— 运行时往 `<head>` 注入一份，因为代码块
  //     没法往仓库里放文件；
  //   false（插件形态）—— 仓库根目录有 `styles.css`，Obsidian 自己会加载。
  // 两条路**只能走一条**：注入的那份挂在 `<head>` 末尾、后到的赢，两份并存的后果
  // 是覆盖顺序随形态而变，某个选择器看着「时灵时不灵」。
  injectStyles = true,
  // 3.0 刀 12 第二半：「草稿纸」那台原生编辑器落在哪儿。
  //
  // `{ folder, name }`，由**宿主给**——它是 vault 里的一条路径，是宿主知识，
  // 核心不该知道 `草稿纸` 这三个字（同 cardsFolder 那条纪律）。
  // 不给就是 `null`，阅读器**不显示那颗按钮**（摆一颗按了没反应的比不摆更糟）。
  scratch = null,
}) {
  assertAdapter(adapter);

  // 先把这个收拾掉，而且必须排在下面那次读盘**之前**。
  //
  // openFullscreen 会设 doc.body{overflow:hidden}（挡住背后那篇笔记的滚动），
  // 而清它的只有 closeFullscreen。宿主重挂不走 closeFullscreen——它是把整个容器
  // 连同这个实例一起拆掉的，那个实例永远等不到自己收尾。于是那条 hidden 就
  // 永久留在 body 上：笔记从此滚不动，而且换一篇笔记也还滚不动。
  //
  // 放在读盘之前是因为读盘是这里最长的一步，等它做完再清，用户得多滚不动一会儿。
  doc.body.style.overflow = "";

  const cards = await adapter.loadCards();
  // 空文件夹也要成为晶体（3.0 刀 9 第三版）。老宿主没这个方法时回空数组，
  // 于是退化成从前的行为——只有有卡的才上环。
  const folders = adapter.listFolders ? await adapter.listFolders() : [];
  const model = createModel(cards, adapter, folders);
  const metrics = createMetrics(win);

  // ---- 样式（清理旧实例，代码块重跑时不叠加）----
  const oldStyle = doc.getElementById(STYLE_ID);
  if (oldStyle) oldStyle.remove();

  // ---- 旧实例的待写 timer（代码块重跑时）----
  // 旧实例的 DOM 已经拆了，但它的闭包还活着：待写的 timer 到点会把一份
  // 过期的状态盖到刚排好的新视口上。所以先掐掉，再由新实例接管写盘。
  if (win.__kbV13PersistTimer) {
    clearTimeout(win.__kbV13PersistTimer);
    win.__kbV13PersistTimer = 0;
  }

  if (injectStyles) {
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.appendChild(style);
  }

  // ---- UI 根 ----
  const root = EL("div", "kb-v13-root");
  container.innerHTML = "";
  container.appendChild(root);
  root.innerHTML =
    '<button class="kb-v13-trigger">' +
    '<span class="kb-v13-trigger-icon">' +
    '<svg width="22" height="22" viewBox="0 0 24 24"><polygon points="12,1 23,6 23,17 12,22 1,17 1,6" fill="none" stroke="#3b82f6" stroke-width="1.5"/></svg>' +
    "</span>" +
    '<span class="kb-v13-trigger-text">' +
    '<span class="kb-v13-trigger-title">ARI 晶体知识库</span>' +
    '<span class="kb-v13-trigger-sub">' + model.crystalKeys.length + " 组晶簇 · " + model.totalCards + " 卡片</span>" +
    "</span>" +
    "</button>";

  // ---- 全屏暗场 ----
  const oldFs = doc.getElementById("kb-fullscreen");
  if (oldFs) oldFs.remove();
  const fs = EL("div", "kb-v13-fullscreen");
  fs.id = "kb-fullscreen";
  fs.innerHTML =
    '<div class="kb-v13-particles" id="kb-particles"></div>' +
    '<div class="kb-v13-grid"></div>' +
    '<div class="kb-v13-topbar">' +
    '<span class="kb-v13-logo">ARI VAULT</span>' +
    // #19 面包屑。根层时是空的、也不显示——没钻进任何一层的时候，
    // 顶上多一条「知识卡片」纯属噪音，而晶体环本身已经说明了一切。
    '<nav class="kb-v13-crumbs" id="kb-crumbs" aria-label="所在层级"></nav>' +
    // 3.0 刀 2 显示模式开关。**换的是当前作用域那一档**：在根层换环/画布，
    // 在某颗晶体里换卡阵/故事线。一个按钮管一处——用户不必先想
    // 「我现在在哪一档的作用域里」，那是实现的事，不是他要记的事。
    // 按钮上的字写的是**按下去会去到哪儿**，不是当前在哪（顶栏右侧那些开关
    // 都是这个口径，混着来会让人按错一次才发现）。
    '<button type="button" class="kb-v13-stage-btn" id="kb-fs-stage"' +
    ' title="换一种看法。根层上是晶体环 ⇄ 画布；进了晶体是卡阵 ⇄ 故事线。">画布</button>' +
    // 3.0 刀 3「恢复默认」。只在画布模式下出现——别处没有布局可恢复。
    //
    // **没有「记住当前」那颗按钮**，是刻意的：拖动是自动落盘的，摆一颗
    // 「记住当前」在那儿，点下去会什么都不发生——那正是「故事线」那颗按钮
    // 犯过的错（按钮翻字了、屏幕不动）。默认就是记住的，不想要就点这颗。
    '<button type="button" class="kb-v13-reset-btn" id="kb-fs-reset" style="display:none"' +
    ' title="把画布摆回出厂的样子：相机回原点、所有晶体回到默认排布。">恢复默认</button>' +
    // 3.0 刀 4「+ 方框」。只在画布模式下出现——方框是画布上的东西。
    '<button type="button" class="kb-v13-addmod-btn" id="kb-fs-addmod" style="display:none"' +
    ' title="新建一个方框。可以取名、把晶体拖进去、也可以拖进另一个方框。">+ 方框</button>' +
    // 故事线专用：藏掉**库自己算出来的**那些线。
    //
    // 覆盖范围是「文件名链 + 双链虚线」两样。第一版只藏了虚线，用户按下去
    // 发现蓝线还在，读起来就是「这个按钮坏了」——**藏着半截的开关比没有更糟**。
    // 手工连的金线永远留着：那是用户自己画的，不属于"可以藏起来的信息"。
    '<button type="button" class="kb-v13-hidelinks-btn" id="kb-fs-hidelinks" style="display:none"' +
    ' title="藏掉库自己连的线（文件名链和双链），只看你自己连的金线。再点一下显示回来。">隐藏连线</button>' +
    // 3.0 刀 13：右键藏起来的卡片，出口在这儿。
    //
    // **库这一屏也必须有这一颗**：藏是结构窗里做的，可 hiddenLinks 落在视图状态里，
    // 回到库的故事线照样是藏着的。只给结构窗一颗按钮，用户在这里就是
    // "东西不见了、找不到出口"——那正是这个仓一直在防的状态。
    // 与上面那颗同一条规矩：只在真有东西可显的时候才出场。
    '<button type="button" class="kb-v13-hidelinks-btn" id="kb-fs-showall" style="display:none"' +
    ' title="把右键藏起来的那些卡片的入链出链全部显示回来。">显示全部</button>' +
    // 连线编辑模式那两颗。**「选框」是这套交互唯一的正经入口**——
    // 上一版把它做成"按住 S 再拖"，在真机上是死的：库嵌在笔记里，点它不会
    // 把焦点从编辑器拿走，按 S 的 keydown 落点是编辑器的 contenteditable，
    // 被守卫当成打字丢掉了。按钮看得见、点得到、跟焦点没关系。
    '<button type="button" class="kb-v13-marquee-btn" id="kb-fs-marquee" style="display:none"' +
    ' title="打开选框：鼠标变成一个方框，这时拖鼠标就是框选金线。再点一下关掉。">选框</button>' +
    '<button type="button" class="kb-v13-dellines-btn" id="kb-fs-dellines" style="display:none"' +
    ' title="删掉框选中的那几根金色线。">删除实线</button>' +
    // #21 左右两栏的主次开关。只有「这一层有子文件夹」时才出现——叶子晶体
    // 没有第二栏可谈，摆两个按钮在那儿只会让人以为按了没反应。
    '<button type="button" class="kb-v13-facet-btn" id="kb-fs-facet-left" style="display:none"' +
    ' title="晶体那一栏放大、卡片缩小">◀</button>' +
    '<button type="button" class="kb-v13-facet-btn" id="kb-fs-facet-right" style="display:none"' +
    ' title="卡片放大回原尺寸">▶</button>' +
    // 3.0 刀 6「文献」：进文献阅读器（多页同屏 + 边看边记）。
    // 它**不是** stage 那一档的开关——阅读器是另一块屏幕，盖在晶体库上，
    // 关掉就回到原样。所以它排在这排面板类按钮里，和「文件夹」「孤岛」同一族。
    '<button type="button" class="kb-v13-reader-btn" id="kb-fs-reader"' +
    ' title="打开文献阅读器：一屏摊开好几页 PDF / 图片 / markdown，右边随手建卡片。">文献</button>' +
    // #21「文件夹」：全库的晶体 → 卡片两级树，与孤岛那份同一个长相
    '<button type="button" class="kb-v13-folder-btn" id="kb-fs-folders" aria-expanded="false"' +
    ' aria-controls="kb-folders" title="全库的文件夹与卡片；点一颗晶体直接过去">文件夹</button>' +
    // #20 孤岛汇总。默认藏着（display:none），没有孤岛时整颗按钮不出现——
    // 留一个「孤岛 0」在那儿只会让人以为它坏了。有孤岛才亮出来。
    '<button type="button" class="kb-v13-orphan-btn" id="kb-fs-orphans" aria-expanded="false"' +
    ' aria-controls="kb-orphans" style="display:none"' +
    ' title="看这一层（含子文件夹）里哪些卡还没接上双链——孤岛卡既没链出去，也没人链它">孤岛 0</button>' +
    '<span class="kb-v13-topbar-info">' + model.crystalKeys.length + " crystals · " + model.totalCards + " cards</span>" +
    // #9 学习模式。紧挨着右上角那两枚按钮，是这个页面里最靠右的"模式"类开关。
    // 两个都写成真按钮 + aria-pressed（不是一个开关的两种文案）：
    // 它们说的是"现在在哪一档"，成对出现才读得懂，读屏也才有"已按下"可报。
    '<div class="kb-v13-mode" id="kb-fs-mode" role="group" aria-label="学习模式">' +
    '<button type="button" class="kb-v13-mode-btn" data-mode="recall" aria-pressed="true"' +
    ' title="卡片内容默认遮住，点一下才显示——先自己想，再对答案。">回忆模式</button>' +
    '<button type="button" class="kb-v13-mode-btn" data-mode="review" aria-pressed="false"' +
    ' title="卡片内容全部摊开，不用点——适合通读复习。">复习模式</button>' +
    "</div>" +
    // #14 清掉记住的状态。文案说用户看得懂的事：清掉的是什么、下次打开会怎样。
    // 「视角 / 视图状态」是系统内部的词，用户脑子里的那件事叫「上次看到哪儿」。
    '<button class="kb-v13-topbar-forget" id="kb-fs-forget"' +
    ' title="清掉记住的那颗晶体、那一页和最后翻开的那张卡。下次打开晶体库，回到所有晶体围成一圈的样子。">' +
    "忘掉上次看到哪儿</button>" +
    '<button class="kb-v13-topbar-close" id="kb-fs-close">✕</button>' +
    "</div>" +
    // 孤岛汇总浮层。挂在 topbar 外面（不是里面）——topbar 是 flex 行，
    // 浮层挂在里面会被当成一个 flex item 挤开按钮。定位由 styles.js 给它。
    '<div class="kb-v13-orphan-panel" id="kb-orphans" role="dialog" aria-label="孤岛汇总"></div>' +
    '<div class="kb-v13-orphan-panel" id="kb-folders" role="dialog" aria-label="文件夹"></div>' +
    '<div class="kb-v13-stage" id="kb-stage">' +
    // 「世界」容器（3.0 刀 1）。晶体、卡阵、跨晶体连线全搬进这一层，
    // 舞台留下的只有视口本身。往后整片画面的平移缩放只写这一层的 transform。
    //
    // 它**从挂载起就存在**，不做「进画布模式才插一层」——那样每一次渲染路径
    // 都要判两遍，而收益只是一棵不在用的空 div 不占位。
    //
    // ⚠️ 它自己绝不能有 overflow:hidden：它的裁剪发生在**局部坐标系**里
    // （transform 之前），一旦平移出去，世界坐标里 (0,0)-(W,H) 之外的东西
    // 会被永久裁掉——平移到头来还是只看得到最初那一屏。
    // 视口裁剪由 stage 那一层的 overflow:hidden 负责，那个是对的（它有没被变换）。
    '<div class="kb-v13-canvas" id="kb-canvas">' +
    '<div class="kb-v13-cards-area" id="kb-cards-area">' +
    '<div class="kb-v13-grid-stage" id="kb-grid-stage"></div>' +
    "</div>" +
    "</div>" +
    // 翻页箭头与下面的选中提示留在 canvas **外面**：它们是 UI，不是世界。
    // 跟着一起缩放的话，缩到 0.2 倍时箭头只有 8px——用户会直接失去翻页能力。
    '<div class="kb-v13-pages" id="kb-pages" style="position:absolute;bottom:28px;left:50%;transform:translateX(-50%);z-index:10;display:none;align-items:center;gap:16px;">' +
    '<button class="kb-v13-nav-arrow" id="kb-nav-up" style="width:40px;height:40px;border-radius:50%;border:1px solid rgba(0,200,255,0.15);background:rgba(10,20,40,0.7);color:rgba(0,200,255,0.5);font-size:18px;cursor:pointer">▲</button>' +
    '<button class="kb-v13-nav-arrow" id="kb-nav-down" style="width:40px;height:40px;border-radius:50%;border:1px solid rgba(0,200,255,0.15);background:rgba(10,20,40,0.7);color:rgba(0,200,255,0.5);font-size:18px;cursor:pointer">▼</button>' +
    "</div>" +
    "</div>";
  doc.body.appendChild(fs);

  // ---- 悬停浮层 ----
  const oldTip = doc.querySelector(".kb-v13-tooltip");
  if (oldTip) oldTip.remove();
  const tooltip = EL("div", "kb-v13-tooltip");
  tooltip.style.position = "fixed";
  doc.body.appendChild(tooltip);
  tooltip.innerHTML =
    '<div class="kb-v13-tt-arrow"></div>' +
    '<div class="kb-v13-tooltip-title" id="kb-tt-title"></div>' +
    '<div class="kb-v13-tooltip-concept" id="kb-tt-concept"></div>' +
    // #13：窄条卡的关键词条只有浮层这一个落点
    '<div class="kb-v13-tooltip-keywords" id="kb-tt-keywords"></div>' +
    '<div class="kb-v13-tooltip-source" id="kb-tt-source"></div>' +
    '<div class="kb-v13-tooltip-reason" id="kb-tt-reason"></div>';

  // ---- 全息详情 ----
  const oldOv = doc.getElementById("kb-overlay");
  if (oldOv) oldOv.remove();
  const overlay = EL("div", "kb-v13-overlay");
  overlay.id = "kb-overlay";
  overlay.innerHTML =
    '<div class="kb-v13-hologram" id="kb-holo">' +
    '<button class="kb-v13-holo-close" id="kb-holo-close">✕</button>' +
    // ✎ = 面板内原地改 frontmatter；↗ = 在右侧分屏打开原笔记（改正文结构、用宿主
    // 的补全与搜索时走这条）。两枚都在，因为它们是两种活，不是新旧两版。
    '<button class="kb-v13-holo-edit" id="kb-holo-edit" title="改概念 / 来源 / 标签">✎</button>' +
    '<button class="kb-v13-holo-open" id="kb-holo-open" title="在笔记里打开（右侧分屏）">↗</button>' +
    '<div class="kb-v13-holo-title" id="kb-holo-title"></div>' +
    // #14：恢复时点明「就是这张」。平时是空的，空着不占位（见 styles 里的 :empty）
    '<div class="kb-v13-holo-resume" id="kb-holo-resume"></div>' +
    '<div class="kb-v13-holo-concept" id="kb-holo-concept"></div>' +
    '<div class="kb-v13-holo-meta" id="kb-holo-meta"></div>' +
    '<div class="kb-v13-holo-body" id="kb-holo-body"></div>' +
    '<div class="kb-v13-beam"></div>' +
    "</div>";
  doc.body.appendChild(overlay);

  // ---- 卫星 ----
  const oldSat = doc.getElementById("kb-satellites");
  if (oldSat) oldSat.remove();
  const oldLines = doc.getElementById("kb-sat-lines");
  if (oldLines) oldLines.remove();

  // 卫星与连线挂在**遮罩里**，不挂 body。遮罩是 position:fixed，必然自成一个层叠
  // 上下文，挂在它外面的节点永远在它之上——面板作为它的子元素，无论给多大的 z-index
  // 都不可能盖过卫星。要让「背景 < 连线 < 卫星 < 面板 < 浮窗」成立，这四者必须同处
  // 一个上下文里。浮窗早就想通了这件事（见 floatwin.js 的 openFloat）。
  //
  // 卫星是 position:fixed，遮罩 inset:0 且没有 padding/border/transform，作为包含块
  // 与视口重合，坐标不用换算——**但别给 .kb-v13-overlay 加这三样**，加一个卫星就整体偏。
  const satContainer = EL("div");
  satContainer.id = "kb-satellites";
  overlay.appendChild(satContainer);

  const satLines = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  satLines.setAttribute("class", "kb-v13-sat-lines");
  satLines.setAttribute("viewBox", "0 0 " + win.innerWidth + " " + win.innerHeight);
  satLines.id = "kb-sat-lines";
  overlay.appendChild(satLines);
  satLines.style.display = "none";

  // ---- 3.0 刀 6 文献阅读器 ----
  // 和遮罩、浮窗一样挂 body：它是 fixed;inset:0 的一整块屏，**绝不能放进
  // canvas**（canvas 有 transform，会成为 fixed 后代的包含块，那块屏会跟着
  // 画布平移缩放一起跑）。z-index 定在遮罩之上、悬浮窗之下——见 styles.js。
  const oldReader = doc.getElementById("kb-reader");
  if (oldReader) oldReader.remove();
  const readerEl = EL("div", "kb-v13-reader");
  readerEl.id = "kb-reader";
  doc.body.appendChild(readerEl);

  const stage = fs.querySelector("#kb-stage");
  const canvas = fs.querySelector("#kb-canvas");
  const cardsArea = fs.querySelector("#kb-cards-area");
  const gridStage = fs.querySelector("#kb-grid-stage");
  const pages = fs.querySelector("#kb-pages");
  const navUp = fs.querySelector("#kb-nav-up");
  const navDown = fs.querySelector("#kb-nav-down");

  // #7 选中提示
  const selectHint = EL("div", "kb-v13-select-hint");
  stage.appendChild(selectHint);

  // #19 面包屑。点「‹ 返回」退一层，点中间任意一段直接跳回那一层
  //（不用一层层退）。根那一段用 data-depth="-1" 表示「回到晶体环」。
  // #20 孤岛汇总：顶栏一颗按钮 + 一个浮层。面板内容每次重画，所以点击
  // 走事件委托（onOrphanPanelClick），不给每条绑监听。
  const orphanBtn = fs.querySelector("#kb-fs-orphans");
  const orphanPanel = fs.querySelector("#kb-orphans");
  orphanBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeFolderPanel(ctx); // 两个浮层同一位置，别叠在一起
    toggleOrphanPanel(ctx);
  });
  orphanPanel.addEventListener("click", (e) => {
    e.stopPropagation();
    onOrphanPanelClick(ctx, e);
  });

  // #21 两栏主次 + 文件夹面板
  const facetLeft = fs.querySelector("#kb-fs-facet-left");
  const facetRight = fs.querySelector("#kb-fs-facet-right");
  const folderBtn = fs.querySelector("#kb-fs-folders");
  const folderPanel = fs.querySelector("#kb-folders");
  facetLeft.addEventListener("click", (e) => {
    e.stopPropagation();
    setFacetFocus(ctx, "crystals");
  });
  facetRight.addEventListener("click", (e) => {
    e.stopPropagation();
    setFacetFocus(ctx, "cards");
  });
  // 3.0 刀 2：显示模式开关。换的是**当前作用域**那一档（见 stage.js）。
  fs.querySelector("#kb-fs-stage").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleStage(ctx);
  });
  // 3.0 刀 3「恢复默认」。**两步式**，因为这一下会把你摆了半天的东西全抹掉
  // ——它是本库第一颗「按下去有破坏性」的按钮，别的按钮最坏也就是换个视角。
  //
  // 用就地确认而不是 `win.confirm`：这个仓的既有风格就是就地（见 closeEditor
  // 那条「并就地弹确认」）。原生弹窗在 Obsidian 里是阻塞的、长得也突兀，
  // 而且在测试里会被自动拒掉——那等于这个功能根本测不了。
  // 3.0 刀 4：新建方框。落在**当前视口中心**（见 modules.js 的 addModule），
  // 建完立刻进改名态——刚建的框叫「未命名模块」，停在那个名字上等用户改，
  // 比让他再点一下名字少一步。
  fs.querySelector("#kb-fs-hidelinks").addEventListener("click", (e) => {
    e.stopPropagation();
    ctx.toggleHideLinks();
  });
  // 3.0 刀 13。不用再手动重画——showAllHidden 内部走 ctx.refreshStoryline
  // （= renderCrystals）整屏重画，卡片上那个「线已藏」角标才会跟着掉。
  fs.querySelector("#kb-fs-showall").addEventListener("click", (e) => {
    e.stopPropagation();
    showAllHidden(ctx);
  });
  fs.querySelector("#kb-fs-marquee").addEventListener("click", (e) => {
    e.stopPropagation();
    setMarqueeArm(ctx, !isMarqueeArmed(ctx));
  });
  fs.querySelector("#kb-fs-dellines").addEventListener("click", (e) => {
    e.stopPropagation();
    deletePickedFor(ctx);
  });
  fs.querySelector("#kb-fs-addmod").addEventListener("click", (e) => {
    e.stopPropagation();
    const m = addModule(ctx);
    const nameEl = ctx.canvas.querySelector(
      '.kb-v13-module[data-id="' + m.id + '"] .kb-v13-module-name'
    );
    if (nameEl) {
      beginInlineRename(nameEl, m.name, (name) => {
        const cur = moduleById(ctx, m.id);
        if (!cur) return;
        cur.name = name;
        renderModules(ctx);
      });
    }
  });
  fs.querySelector("#kb-fs-reset").addEventListener("click", (e) => {
    e.stopPropagation();
    if (!ctx._resetArmed) {
      ctx._resetArmed = true;
      refreshStageUi(ctx);
      // 晾一会儿自己收回，免得「按过一次」这件事一直悬着、
      // 下次误点直接就把东西抹了。
      setTimeout(() => {
        if (!ctx._resetArmed) return;
        ctx._resetArmed = false;
        refreshStageUi(ctx);
      }, RESET_ARM_MS);
      return;
    }
    ctx._resetArmed = false;
    doResetLayout(ctx);
    // 相机那一份在 applyCamera 里重铺（它读的是刚回默认的那份），
    // 所以这里必须走一次完整的重画，不能只改状态。
    applyCamera(ctx, true);
    renderCrystals(ctx);
    refreshStageUi(ctx);
  });
  folderBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeOrphanPanel(ctx); // 两个浮层同一位置，别叠在一起
    toggleFolderPanel(ctx);
  });
  folderPanel.addEventListener("click", (e) => {
    e.stopPropagation();
    onFolderPanelClick(ctx, e);
  });
  // 3.0 刀 6「文献」。阅读器是另一块屏，盖在晶体库上——不关晶体库，
  // 关掉阅读器就回到原来的样子（连刚才在哪颗晶体、翻到第几页都不用重来）。
  fs.querySelector("#kb-fs-reader").addEventListener("click", (e) => {
    e.stopPropagation();
    closeOrphanPanel(ctx);
    closeFolderPanel(ctx);
    ctx.reader.open();
  });

  const crumbs = fs.querySelector("#kb-crumbs");
  crumbs.addEventListener("click", (e) => {
    e.stopPropagation();
    if (e.target.closest(".kb-v13-crumb-back")) {
      drillUp(ctx);
      return;
    }
    const btn = e.target.closest(".kb-v13-crumb[data-depth]");
    if (btn) drillToDepth(ctx, Number(btn.dataset.depth));
  });

  // #22 读偏好。适配层已经兜了「读不到 / JSON 坏掉」（契约要求绝不抛），
  // sanitizePrefs 再兜一次**形状**——比如存档里是一个不是颜色的字符串。
  const initialPrefs = sanitizePrefs(adapter.loadPrefs());

  const ctx = {
    adapter,
    model,
    metrics,
    win,
    doc,
    s: metrics.s,
    ring: metrics.ring,
    root,
    fs,
    stage,
    canvas,
    cardsArea,
    gridStage,
    pages,
    navUp,
    navDown,
    tooltip,
    ttTitle: doc.querySelector("#kb-tt-title"),
    ttConcept: doc.querySelector("#kb-tt-concept"),
    ttKeywords: doc.querySelector("#kb-tt-keywords"),
    ttSource: doc.querySelector("#kb-tt-source"),
    ttReason: doc.querySelector("#kb-tt-reason"),
    overlay,
    hBody: overlay.querySelector("#kb-holo-body"),
    hTitle: overlay.querySelector("#kb-holo-title"),
    hResume: overlay.querySelector("#kb-holo-resume"),
    hConcept: overlay.querySelector("#kb-holo-concept"),
    hMeta: overlay.querySelector("#kb-holo-meta"),
    hClose: overlay.querySelector("#kb-holo-close"),
    hEdit: overlay.querySelector("#kb-holo-edit"),
    hOpen: overlay.querySelector("#kb-holo-open"),
    // #10 被拖的那块面板，也是 #16 编辑表单的挂载点。它随 overlay 一起建、
    // 整个生命周期不换，所以拖动监听只要在 mount 时挂一次（见 bindPanelDrag），
    // 编辑表单则每次进编辑态现建现挂（取值靠 .value，不能靠 HTML 字符串）。
    holo: overlay.querySelector(".kb-v13-hologram"),
    // #9 顶栏那两枚模式按钮
    modeBtns: fs.querySelectorAll(".kb-v13-mode-btn"),
    satContainer,
    satLines,
    selectHint,
    crumbs,
    orphanBtn,
    orphanPanel,
    folderBtn,
    folderPanel,
    facetLeft,
    facetRight,
    stageBtn: fs.querySelector("#kb-fs-stage"),
    resetBtn: fs.querySelector("#kb-fs-reset"),
    addModBtn: fs.querySelector("#kb-fs-addmod"),
    hideLinksBtn: fs.querySelector("#kb-fs-hidelinks"),
    showAllBtn: fs.querySelector("#kb-fs-showall"),
    marqueeBtn: fs.querySelector("#kb-fs-marquee"),
    delLinesBtn: fs.querySelector("#kb-fs-dellines"),
    // 3.0 刀 9-C：顶栏那颗「文献」。它平时不参与 stage 显隐（任何档都点得到），
    // 取到引用只是为了在「读者被挂起」时把文案换成「回到文献」。
    readerBtn: fs.querySelector("#kb-fs-reader"),
    hideLinks: () => !!ctx.state.hideLinks,
    _folderOpen: new Set(),
    // 汇总浮层里展开着的那几组（晶体 key）。收起浮层时清空——下次打开
    // 从「全收起」开始，一屏能看清有哪几颗晶体，而不是接着上次的展开态。
    _orphanOpen: new Set(),
    linkLayer: null,
    linkLabels: null,
    _hoverCard: null,
    _escHandler: null,
    state: {
      // 读回来的那份视图状态。运行时字段（下面几个）才是「此刻屏幕上是什么」，
      // 写盘时由 collectViewState 从运行时汇总；这份只负责「上次存的是什么」。
      view: defaultViewState(),
      openCrystal: null,
      // #19 钻进的层栈（`[]` = 在晶体环这一层）。**运行时的**，不落盘也
      // 不另存字段——它就是 openCrystal 那条路径，由 model.resolveChain 推出来。
      // 所以 viewstate.js 的形状一个字都没动。
      crystalPath: [],
      // #21 两栏主次（`"cards"` = 卡片为主）。与 mode 一样**不落盘**：
      // 它是「临时想看清哪一边」的动作，不是场景的一部分。
      facetFocus: "cards",
      // #22 偏好（跨会话记住）。与 view 一样是「从宿主读回来的那份」，
      // 但**分开存**——清视角不该连带把用户调好的颜色也清了。
      // 已经过 sanitizePrefs：坏值在这里就已经退化成默认了。
      prefs: initialPrefs,

      // 这一层两栏的几何（renderLevel 算、applyExpanded 用）。叶子晶体是 null。
      facetRegions: null,
      selectedCrystal: null,
      // 此刻全息面板开着的那张卡（存 title）。由 hologram.js 记、合上时清，
      // 随视图状态落盘——下次打开时连它一起回来。
      selectedCard: null,
      scrollOffset: 0,
      currentCards: [],
      currentHue: 210,
      // #9 回忆 / 复习。不落盘（ViewState 里没有这个字段），每次打开都从回忆模式起
      // ——见 mode.js 顶上那段理由。切模式走 applyMode，别处别直接写这个字段。
      mode: MODE_RECALL,
      // 3.0 刀 5 连接模式。**运行时不落盘**——它是一次操作中途的状态，
      // 不是「上次看到哪儿」的一部分；重开时本来就该是关着的。
      linking: false,
      // 藏掉双链虚线吗。**运行时不落盘**——同 linking，是"现在想看清骨架"的
      // 临时动作，不是场景的一部分（跟左右两栏主次不落盘是同一条理由）。
      hideLinks: false,
      // 3.0 刀 5 连线编辑模式（右键金线进，S 框选、D 删）。**不落盘**：
      // 它是一次操作中途的状态，和连接模式一样，不是场景的一部分。
      lineEdit: false,
      marqueeSel: [],
      marqueeRect: null,
      marqueeArm: false,
      // 3.0 刀 16：这一次框选删的是**哪一种**线。库里**永远**是 "manual"——
      // 蓝线那一档（"blue"）只在结构窗的写模式下由右键打开，而库这一屏没有写模式。
      // 放这里是为了让「读不到就退成 manual」这条兜底有个明确的落点。
      marqueeKind: "manual",
      // 3.0 刀 2 显示模式（"ring" / "canvas" / "grid" / "storyline"）。
      // ⚠️ 与 `ctx.stage`（舞台那个 DOM 节点）同名但完全无关，读的时候看上下文。
      // 它是**推导出来的缓存**：真正的源头是 openCrystal + prefs 里那两档，
      // 由 stage.js 的 stageOf 算出来。renderCrystals 每次都会先 syncStage 一次，
      // 所以它永远和 crystalPath 对得上，不存在「钻进晶体了却在画布上」。
      stage: "ring",
    },
    hideTooltip: () => hideTooltip(ctx),
    // #10 面板偏移的复位。hologram.js 收面板时要调，但它自己要用 holodrag 的
    // shiftSatellites，互相 import 会绕成环——所以走 ctx 这根线（本文件里
    // hideTooltip / unbindScrollListeners 都是这个套路）。
    resetPanelOffset: () => resetPanelOffset(ctx),
    unbindScrollListeners: () => unbindScrollListeners(ctx),
    persistViewState: () => schedulePersist(ctx),
    flushViewState: () => writeViewState(ctx),
    closeFullscreen: () => closeFullscreen(),
    // 编辑保存后刷新用。editform.js 不 import hologram（会绕成环：
    // hologram 要 import editform 拿编辑入口），所以走 ctx 这根线——
    // 和上面 hideTooltip / resetPanelOffset 是同一个套路。
    // preserve：这是**重画屏幕上这张卡**（保存 / 撤销之后），不是换卡。让 renderHoloBody
    // 把已经揭开的段和滚动位置还回去——不然用户读到一半点个保存，回来那一段又盖上了、
    // 滚动条也跳回顶部，看着就是"我的位置丢了"。真正的换卡不走这根线，照旧从全遮开始。
    refreshCard: (card) => showHologram(ctx, card, ctx.state.currentHue, { preserve: true }),
    // 卡面也得重画：概念、标签、卡头关键词都烘在建卡那一刻的 DOM 里，
    // 不重画的话面板里是新的、背后那片卡还是旧的。
    refreshCards: () => renderRingCards(ctx, ctx.state.currentCards, ctx.state.currentHue),
    // #16 第二轮：正文里的双链就是关系图的唯一来源，改完正文要重算整张图。
    // 走 ctx 而不是让 editform 直接 import model——editform 手上本来就只有 ctx，
    // 而 model 是 mount 里的局部量（app.js 的 restoreInto / resize 也握着它，
    // 所以更不能整个换对象，只能原地重建）。
    refreshRelations: () => model.refreshRelations(),
    // 孤岛汇总（#20）。它要用 crystals.js 的 restoreExpanded，而 crystals.js
    // 反过来要在进层/退层时刷新它——互相 import 会成环，所以走 ctx 这根线，
    // 和 hideTooltip / resetPanelOffset 是同一个套路。
    refreshOrphans: () => refreshOrphanSummary(ctx),
    // #21 文件夹面板与两栏开关。都走 ctx：crystals.js 要在进层/退层时刷新它们，
    // 而它们又要用 crystals.js 的 restoreExpanded，直接互相 import 会成环。
    refreshFolders: () => refreshFolderSummary(ctx),
    refreshFacets: () => refreshFacetButtons(ctx),
    // 3.0 刀 2：显示模式。**由 renderCrystals 每次先调一次**——这样
    // state.stage 与 crystalPath 不会不同步，不必在每个改 openCrystal 的地方
    // 都记得手动同步一遍（那种「记得写」的约定迟早会漏一处）。
    syncStage: () => applyStage(ctx),
    // 重搭舞台。stage.js 切档之后要它——**这道线曾经漏接过**，而那边当时
    // 恰好写着 `if (ctx.renderCrystals)`，于是「切画布不重画」被静默吞掉，
    // 整整一刀的功能是假的、测试还全绿。见 stage.js 里那段注释。
    renderCrystals: () => renderCrystals(ctx),
    // 换档之后「落地」：卡阵那张屏的卡片不在 renderCrystals 里，得补一次。
    landAfterStageChange: () => {
      if (ctx.state.stage !== "grid" || !ctx.state.openCrystal) return;
      applyExpanded(ctx, ctx.state.openCrystal, model.colorOf(ctx.state.openCrystal).hue, false);
    },
    // 3.0 刀 4 方框层。走 ctx 这根线：modules.js 要用 canvas.js 的 layoutOf，
    // 反过来 canvas.js 若 import modules.js 就绕成环了——仓里对这种情况的
    // 既有套路就是走 ctx（refreshOrphans / hideTooltip 那几个）。
    renderModules: () => renderModules(ctx),
    // 换位置的实现（将来接 LLM）。**走 mount 的参数，不进适配层契约**——
    // 契约的语义是「宿主能力」，一个纯核心的布局算法不是宿主能力；
    // 往那儿加一个方法要动两个实现 + 契约 + seam.spec 的标题，方向是反的。
    storyLayout,
    renderStorylineStage: (c, p) => renderStorylineStage(c, p),
    // 布局算完（异步那个实现）之后重画一次。走 renderCrystals 而不是只重画故事线：
    // 舞台的重建只有那一条路，绕开它迟早会出现「卡片换了但面包屑没换」这类不同步。
    refreshStoryline: () => renderCrystals(ctx),
    invalidateStoryline: () => invalidateStoryline(ctx),
    openCardPanel: (card) => showHologram(ctx, card, ctx.state.currentHue),
    // 幽灵节点点一下要真能过去，否则它只是个装饰
    gotoCrystal: (key) => expandCrystal(ctx, key),
    // 3.0 刀 12：删掉一颗晶体之后的收场。
    //
    // 要处理的是**「你正站在被删掉的那颗里」**：不退的话 `state.openCrystal`
    // 指着一条已经不存在的路径，`resolveChain` 拿不到 → 舞台上是一片空，
    // 而面包屑还写着那颗已经没了的晶体。**不报错，只是整块屏幕空着。**
    afterCrystalRemoved: () => {
      const cur = ctx.state.openCrystal;
      if (cur && !ctx.model.hasNode(cur)) collapseCrystal(ctx);
      renderCrystals(ctx);
    },
    // 晶体拖完那一下，落点判定由 modules.js 做
    onCrystalDropped: (key) => dropCrystal(ctx, key),
    savePrefs: () => adapter.savePrefs(collectPrefs(ctx.state)),
    // 画布晶体层由 canvas.js 画，但调度点在 crystals.js——两个模块互相 import
    // 会绕成环，所以在这里接一根线。
    renderCanvasStage: (c) => renderCanvasStage(c),
    stageHooks: {
      // 相机进/出。**这是画布模式唯一动 transform 的地方**：
      // 非画布档必须清成空串，否则 stage 的几何代码就不「逐像素等于改动前」了。
      onEnter: (next) => {
        // 进相机档 = 开工。开一份布局草稿：拖动只改它，「恢复默认」才有东西可丢。
        if (isCameraStage(next)) beginDraft(ctx);
        applyCamera(ctx, isCameraStage(next));
        refreshStageUi(ctx);
      },
      onLeave: (prev) => {
        // 离开故事线那一屏：右键菜单、选中的线、连接模式都不跟到别处去。
        if (prev === "storyline") leaveStoryline(ctx);
        // 离开相机档 = 收工。**自动提交**——草稿是为了让「恢复默认」成立，
        // 不是为了让人记得按保存。忘了按就丢东西的界面，比自动记住糟得多。
        commitDraft(ctx);
        applyCamera(ctx, false);
        refreshStageUi(ctx);
      },
    },
    // 包围盒跟着档走：根层是晶体的、层内是卡片节点的。相机 fit() 只认这一个口子。
    // 藏/显示双链。切一下要重画（线是画上去的，不是 CSS 能藏的）
    toggleHideLinks: () => {
      ctx.state.hideLinks = !ctx.state.hideLinks;
      renderCrystals(ctx);
      refreshStageUi(ctx);
      return ctx.state.hideLinks;
    },
    worldBounds: () =>
      ctx.state.stage === "storyline"
        ? storylineBounds(ctx, ctx.state.crystalPath)
        : worldBounds(ctx),
    // 拖完 / 推完之后刷一下顶栏那两颗（「未保存」标记 + 恢复默认的可用性）
    refreshStageUi: () => refreshStageUi(ctx),
    // #22 搜索框打字颜色。拖动取色器时会连续触发，所以**预览与落盘分开**：
    // 每一下都铺到屏幕上，但只在用户松手（change）时写一次盘。
    //
    // ⚠️ **先展开再消毒**，不能写成 `sanitizePrefs({ searchColor: c })`（3.0 刀 9 修的）。
    // `sanitizePrefs` 是**白名单**：只喂给它一个字段，它看不见的那些就一律回默认值——
    // 于是「挑一次搜索框颜色」会把 rootStage / levelStage 一起抹掉，表现是显示模式
    // 莫名其妙退回环视图。它还能更糟：刀 9 起 prefs 里多了阅读器的浮窗桌面，
    // 那个 bug 会让用户调一次颜色就把辛苦摆好的桌面清空。
    // 照 stage.js 的 setPref 走同一条路。
    setSearchColor: (c, save) => {
      ctx.state.prefs = sanitizePrefs({ ...(ctx.state.prefs || {}), searchColor: c });
      applyPrefs(ctx);
      if (save) adapter.savePrefs(collectPrefs(ctx.state));
    },
    // 晶体层这一票的落点：孤岛汇总 + 选中态连线
    refreshCrystalLayer: () => refreshCrystalLayer(ctx),
    // 编辑态面板会加宽（styles.js 的 .kb-v13-editing），进/出各要重排一次卫星，
    // 否则那圈连线的内侧会横穿表单画在你脸上（.kb-v13-sat-lines 的 z-index 比
    // 面板还高）。editform 不能 import hologram，所以还是走 ctx 这根线。
    refreshSatellites: () => refreshSatellites(ctx),
    removeEscHandler: () => {
      if (ctx._escHandler) {
        doc.removeEventListener("keydown", ctx._escHandler);
        ctx._escHandler = null;
      }
    },
  };

  // 3.0 刀 6 文献阅读器。**在 ctx 之后建**——它要 adapter / model / doc / win
  // 和那几个 refresh 钩子。它自己的键盘监听挂在 doc 上，所以实例必须能在
  // 重挂时被收掉（见下面 win.__kbV13Reader 那一段）。
  // 先收上一次那个实例：它的闭包还活着、键盘监听还挂在 doc 上。不退的话每重挂
  // 一次就多一个监听，而且每个都指向一棵已经摘下来的树——与 __kbV13Watch /
  // __kbV13Keydown 是同一个套路。
  if (win.__kbV13Reader) win.__kbV13Reader.destroy();
  ctx.reader = createReader(ctx, { el: readerEl, pdfRenderer, injectStyles, scratch });
  win.__kbV13Reader = ctx.reader;

  // ---- 粒子 ----
  // 偏好铺上去（CSS 变量挂在 fs 上，样式表里 var() 取）
  applyPrefs(ctx);

  const particles = fs.querySelector("#kb-particles");
  for (let i = 0; i < 60; i++) {
    const dot = EL("div", "kb-v13-dot");
    dot.style.left = Math.random() * 100 + "%";
    dot.style.top = Math.random() * 100 + "%";
    dot.style.animationDuration = 4 + Math.random() * 6 + "s";
    dot.style.animationDelay = -Math.random() * 6 + "s";
    particles.appendChild(dot);
  }

  // ---- 卡片交互（事件委托，避免重建时重复绑定）----
  gridStage.addEventListener("click", (e) => {
    const el = e.target && e.target.closest ? e.target.closest(".kb-v13-card") : null;
    if (!el || !el._card) return;
    e.stopPropagation();
    showHologram(ctx, el._card, ctx.state.currentHue);
  });

  gridStage.addEventListener("mouseover", (e) => {
    const el = e.target && e.target.closest ? e.target.closest(".kb-v13-card") : null;
    if (!el || !el._card) return;
    if (el === ctx._hoverCard) return;
    if (ctx._hoverCard && ctx._hoverCard !== el) clearCardHover(ctx, ctx._hoverCard);
    ctx._hoverCard = el;
    el.style.transform = el._big ? "translateY(-12px)" : "translateY(-6px)";
    el.style.zIndex = "200";
    if (el._concept) revealConcept(ctx, el._concept); // #6 悬停揭开「概念」
    showTooltip(ctx, el, el._card, ctx.state.currentHue);
  });

  gridStage.addEventListener("mouseout", (e) => {
    const el = e.target && e.target.closest ? e.target.closest(".kb-v13-card") : null;
    if (!el) return;
    const to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest(".kb-v13-card") : null;
    if (to === el) return;
    clearCardHover(ctx, el);
    if (ctx._hoverCard === el) ctx._hoverCard = null;
  });

  // 点舞台空白：进过晶体就退一层（#19），没进过就取消选中（#7）
  //
  // 画布模式下这里**不用另写一份**：世界层是 pointer-events:none 的（见 styles.js
  // 里那条注释），空白处的点击一路穿透到舞台，落到的就是这一条。
  // 曾经写过一份画布专用的，加上之后才发现两份都在等同一个事件——
  // 而且画布那份永远收不到（它被设成 none 了），是死代码。
  stage.addEventListener("click", (e) => {
    // 点舞台任何地方都收起那两个浮层（点卡片也一样）——它们是「看一眼就走」
    // 的东西，不该在你去干别的事之后还赖在屏幕上。
    closeOrphanPanel(ctx);
    closeFolderPanel(ctx);
    if (e.target !== stage) return;
    // ⚠️ **故事线模式下点空白不导航。** 它是一块画布——点空白的意思是
    // 「取消选中 / 退出连接模式」，不是「我要离开这颗晶体」。
    // 原来走的是下面那条「退一层」，于是一点空白就弹回环上：连接模式退不出来
    // （人都走了），画布手感也被打断。回上一层有面包屑和 Esc，不缺入口。
    if (ctx.state.stage === "storyline") {
      clearSelection(ctx);
      return;
    }
    if (ctx.state.openCrystal) {
      // 钻了三层就退到第二层，不是一下弹回环上——一次点一个台阶，
      // 与 Esc 同一条路（两条入口行为不一致的话，用户得记两套）。
      if (drillUp(ctx)) return;
      collapseCrystal(ctx);
    } else {
      clearSelection(ctx);
    }
  });

  // 面板的两个出口都先问一句编辑态：closeEditor 在有未保存改动时会返回 false
  // （并就地弹确认），这时**不要**关面板——否则用户刚打的字静默没了。
  // closeHologram 自己那一份是强行的，给 closeFullscreen / forgetViewState 用。
  overlay.querySelector("#kb-holo-close").addEventListener("click", () => {
    if (closeEditor(ctx)) closeHologram(ctx);
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay && closeEditor(ctx)) closeHologram(ctx);
  });

  // ---- 全屏控制 ----
  let ready = false;
  let prevW = 0;
  let prevH = 0;

  /**
   * 打开时落回上次那个屏幕（#14）。三层各归各的：
   *
   *   - 关的时候在晶体环上 → 打开就是晶体环。不会因为「以前进过某颗晶体」
   *     就被塞回那颗晶体里——用户最后看的是环，就该回到环。
   *   - 关的时候在某颗晶体里 → 那颗晶体 + 那一页。
   *   - 关的时候翻开着一张卡 → 连那张卡的面板一起回来。那才是他离开时看着的东西，
   *     只在旁边描一下边是不够的。
   *
   * 存的晶体不在了（被删 / 改名）就安静退回晶体环——那是过期，不是错误；
   * 卡不在了，或已经不在这一颗晶体里，就退回「那颗晶体 + 那一页」，照样不报错。
   */
  /**
   * @param {boolean} justSaved 这次重挂是「刚保存完」引起的。由 openFullscreen 一次性
   *   读掉那笔账再传进来——**不在这里读**：下面第一行就会提前 return，「读一次就清掉」
   *   放在这里的话，那批重挂（没有 openCrystal）永远清不掉，标志会一路漏到下次打开。
   */
  function restoreInto(justSaved) {
    const view = ctx.state.view;
    const key = view.openCrystal;
    // 这一层今天还在吗？文件夹改过名 / 删过就安静退回晶体环——那是过期，不是错误。
    //
    // 判据从 `groups[key].length` 换成了 resolveChain，一次管两件事：
    //   - 「只有子文件夹、自己没有直属卡」的层（多层里的常态）老判据会当成
    //     不存在，于是**恢复不回去**；
    //   - 路径**中间**某一层没了时，停在最后一个还站得住的层——
    //     「Python/数据分析/进阶」在 数据分析 被删之后回到 Python，
    //     而不是整份丢掉退回环上。
    //
    // 别在这里先判 hasNode：那会把「中间层还在、只有末层没了」也一起挡在门外，
    // 正是上面第二条要救的情况。
    if (!key) return;
    const chain = model.resolveChain(key);
    const land = chain.length ? chain[chain.length - 1] : null;
    if (!land) return;
    restoreExpanded(ctx, land, view.scrollOffset);

    // 面板最后开：它是盖在那一页上面的，得等页面先摆好
    const card = view.selectedCard
      ? model.cardsAt([land]).find((c) => c.title === view.selectedCard)
      : null;
    // resumed: 面板里点一句「上次看到的是这张」——恢复和「用户自己点开」在屏幕上
    // 长得一模一样，不说的话这张卡是从哪儿冒出来的没人知道。
    //
    // 例外就是 justSaved：这次重挂是刚保存完引起的（写盘触发 metadataCache 变化，
    // Dataview 重跑整个块），说「上次看到的是这张」是句错话——用户三秒前刚点的保存。
    if (card) showHologram(ctx, card, model.colorOf(key).hue, { resumed: true, justSaved });
  }

  function openFullscreen() {
    // 每次打开都重读一次：上次留下的视角是这次会话的起点，
    // 之后的改动都基于它，不是基于核心刚起来时的空白默认。
    ctx.state.view = readViewState(ctx);
    // #9 模式不落盘，所以每次打开都回到回忆模式。别让一次误切把自测变成看答案——
    // 代价只是多点一下，比"哪天打开发现答案全摊着"轻得多。
    applyMode(ctx, MODE_RECALL);
    // #21 两栏主次也每次打开回到「卡片为主」，理由与 mode 完全相同：
    // 它是个「临时想看清哪一边」的动作，不是场景的一部分，没必要记着。
    ctx.state.facetFocus = "cards";
    // 「刚保存过」在这里**一次性读掉**。写盘会让 Dataview 重跑整个块，宿主把旧容器
    // 连同这份 DOM 一起销毁后重建，重挂之后走的就是这条路；网页端不会重挂，所以那笔账
    // 得靠 TTL 过期。
    // 两件后果：别放 0.5s 的开场淡入（用户看到的"闪退"有一半是它），面板里也说「已保存」
    // 而不是「上次看到的是这张」。
    const savedAt = win.__kbV13JustSaved;
    win.__kbV13JustSaved = 0;
    const justSaved = !!savedAt && Date.now() - savedAt < JUST_SAVED_TTL_MS;
    fs.classList.toggle("kb-v13-restored", justSaved);
    fs.classList.add("open");
    doc.body.style.overflow = "hidden";
    // 同步渲染。原来靠两层 rAF 等布局就绪，但 rAF 会被浏览器节流，
    // 页面没在前台时晶体就永远不出来。classList.add 之后读一次
    // getBoundingClientRect 已强制样式重算，stage 此刻就有真实尺寸。
    renderCrystals(ctx);
    ready = true;
    restoreInto(justSaved);
    // 晶体环这一层**不经过 applyExpanded**（那是「进某一层」才走的），
    // 所以汇总得在这里单独刷一次——否则刚打开时按钮停在 HTML 里那个初始的
    // 「孤岛 0」上，明明有孤岛也永远不亮。restoreInto 提前返回时同样靠这一句。
    if (ctx.refreshOrphans) ctx.refreshOrphans();
  }

  function closeFullscreen() {
    // 关掉那一刻屏幕上是什么，就记什么：晶体环、某颗晶体的第几页、某张翻开着的卡。
    // 必须在收缩之前取下来——收缩会把运行时清零，那之后取到的只剩「晶体环」，
    // 于是一个从晶体里出来的用户，再打开会莫名其妙回到环上。
    // ⚠️ **先提交布局草稿，再拍屏幕快照。**
    //
    // 草稿的提交挂在 collapseCrystal → syncStage → applyStage.onLeave 上，
    // 而收缩就在下面几行。顺序反了的话：快照拍下的是**没有草稿**的那份 state.view，
    // 收缩时草稿才并进去、并 flush 出去，紧接着 writeScreen(screen) 又拿那份
    // 旧快照把它盖了回来——**用户摆的东西在关库那一刻无声地丢了**。
    // 症状是「拖过之后关掉再打开，回到默认位置」，差多少都不报错。
    commitDraft(ctx);
    const screen = collectViewState(ctx.state);
    // 「刚保存过」那笔账在这里也要清：留着它只会让下一次打开读到一笔陈旧的，
    // 那时已经跟"刚"没关系了（真正的消费者是 openFullscreen）。
    win.__kbV13JustSaved = 0;
    // 面板也算「屏幕」的一部分，所以关库时它得跟着收——这里统一收，别处别再收一遍。
    // 两件后果：
    //   1. 全息面板是 fixed;inset:0 的，不收的话关掉水晶库之后它还盖在你的笔记上；
    //   2. 收面板会清 selectedCard（合上就不该再翻回来），所以它必须发生在上面的
    //      collectViewState **之后**。之前「编辑」那一路是先 closeHologram 再
    //      closeFullscreen，快照取到的永远是「没有卡」——第三层因此谁也到不了。
    closeHologram(ctx);
    collapseCrystal(ctx);
    // 顶栏那两个浮层也要跟着收。不收的话它们只是**看不见**了（fs 不再 open），
    // 内部的 .open 还留着——下次再打开晶体库、点那颗按钮，toggle 会先把它关掉，
    // 看上去就是「点了没反应」。浮层不该活过晶体库本身。
    closeOrphanPanel(ctx);
    closeFolderPanel(ctx);
    // 3.0 刀 6：阅读器也活不过晶体库本身。它是 fixed;inset:0 的——漏一次就是
    // 一整块屏留在笔记上，而且那颗「文献」按钮已经跟着库一起藏了，用户找不到出口。
    // 放在 collectViewState **之后**：阅读器不吃视图状态，两边互不干扰。
    if (ctx.reader) ctx.reader.close();
    unbindScrollListeners(ctx);
    pages.style.display = "none";
    fs.classList.remove("open");
    doc.body.style.overflow = "";
    // 立刻落地，不等防抖窗口：用户很可能接着关标签页，那 250ms 是等不到的。
    // 这一笔也顺带掐掉了收缩预约的那次落盘（否则它 250ms 后把屏幕改写成晶体环）。
    writeScreen(ctx, screen);
  }

  /**
   * 「忘掉上次看到哪儿」：存储里那份和屏幕上的位置一起回到默认。
   *
   * 先把内存里那份清成默认再收缩：收缩自己会预约一次落盘（防抖 250ms）。
   * 这里不依赖那次到底写什么——跟着 flush 一次，写下去的就是刚清好的默认，
   * 用户关掉标签页也留不下半点记忆。
   */
  function forgetViewState() {
    // 3.0 刀 3：**只清屏幕那四样，保留布局**。原来这里是 defaultViewState()，
    // 等价于把用户摆好的画布、相机位置一起写没了——而这颗按钮的文案从第一天起
    // 就只承诺了「那颗晶体、那一页、最后翻开的那张卡」，一个字都没提画布。
    // 所以这是把实现修到和承诺一致，不是改需求。
    // 从此「恢复默认」（画布）和「忘掉」（屏幕）是两件事、两个按钮。
    ctx.state.view = forgetScreen(ctx.state.view);
    ctx.state.selectedCard = null;
    // 「默认」就是晶体环，面板和晶体都不该留在屏幕上。面板一并收掉的理由和
    // closeFullscreen 里那条一样：它是 fixed;inset:0 的，漏一次就是一块黑板
    // 盖在笔记上。（顶栏在面板开着时本来也点不到，这里是防着以后改版式。）
    closeHologram(ctx);
    collapseCrystal(ctx); // 展开着才真的要收；没展开时它也只是把一切复位
    ctx.flushViewState();
  }

  root.querySelector(".kb-v13-trigger").addEventListener("click", openFullscreen);
  fs.querySelector("#kb-fs-close").addEventListener("click", closeFullscreen);
  fs.querySelector("#kb-fs-forget").addEventListener("click", forgetViewState);

  // #9 顶栏模式开关。点已经选中的那一枚不做事（幂等），省得来回扫两趟 DOM。
  ctx.modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.mode === ctx.state.mode) return;
      applyMode(ctx, btn.dataset.mode);
    });
  });

  // #10 主卡片可拖。面板整个生命周期不换，挂一次就够。
  bindPanelDrag(ctx);

  // 3.0 刀 3 画布里的晶体可拖。走事件委托挂在世界层上——晶体是每次渲染重建的，
  // 一颗颗绑迟早会漏一处，而漏了不报错，只是「有的能拖有的不能」。
  bindCrystalDrag(ctx);
  // 3.0 刀 4 方框：拖框 / 改尺寸 / 改名 / 删框。同样走委托。
  bindModuleInteractions(ctx);
  // 3.0 刀 5 故事线里拖卡片节点。与晶体拖动共用 itemdrag.js。
  bindStorylineDrag(ctx);
  bindStorylineClicks(ctx);
  // 连接模式：空白右键进、左键点空白退、从四边中点拖线连卡片。
  // bindLinkGuard 走**捕获阶段**，负责在连接模式下把「点卡片开面板」拦下来。
  bindLinkMode(ctx);
  bindLinkGuard(ctx);
  // 金线自己的那几件事。右键那条在 bindLinkMode 里（它要先判命中再决定是
  // 进编辑模式还是连接模式，两件事必须在一处按顺序做）。
  //   bindLineEdit   —— 编辑模式的进出、按住 S 框选、按 D 删
  //   bindBendEditing—— 模式里双击加/去拐点、拖拐点
  bindLineEdit(ctx);
  bindBendEditing(ctx);

  // ---- 外部改动（#18）----
  // loadCards 已经不用 dv.pages 了（见 entry-obsidian.js），本块在 Dataview 眼里
  // 从此没有依赖、写盘不再触发重跑；代价是「卡片被别处改了」也再没人通知我们。
  // 这一条把它补回来，而且是**增量**的：只重画受影响的那些卡，不重跑整个块。
  //
  // 没有 watchCards 的宿主不受影响：契约要求那种宿主返回一个空的退订函数，
  // 这里也就只是没得可订。
  //
  // 先退掉**上一次那个实例**的订阅。win 上那一批（__kbV13Keydown / __kbV13Resize /
  // __kbV13PersistTimer）都是这个套路：旧实例的闭包还活着，监听却指向一棵已经摘下来
  // 的树。真宿主那边它注册的是 `app.vault.on`，不退就是每重挂一次多一个监听、
  // 每个都白跑一趟读盘。applyExternalChange 开头那道 isConnected 只是兜底，
  // 挡不住「监听本身在堆积」这件事。
  if (typeof win.__kbV13Watch === "function") win.__kbV13Watch();
  const stopWatch =
    typeof adapter.watchCards === "function"
      ? adapter.watchCards((card) => applyExternalChange(ctx, card))
      : null;
  win.__kbV13Watch = stopWatch;

  // 全局 Escape（用 window 注册表去重，避免代码块重跑时累积监听）
  if (win.__kbV13Keydown) doc.removeEventListener("keydown", win.__kbV13Keydown);
  const kbKeydown = (e) => {
    // 编辑态排在最前：它是最内层、也是用户注意力所在的那一层。
    //   Esc           = 取消编辑（**不是**关面板）
    //   Ctrl/Cmd+Enter = 保存
    // 两条都要 stopImmediatePropagation：hologram 那个 handler 也挂在 doc 上、
    // 收到 Esc 就关面板；不挡住的话一次 Esc 会连人带面板一起没收。
    // 移动端没有这两个键，所以按钮是硬需求（见 editform.js 的吸顶操作栏）。
    if (isEditing(ctx)) {
      // ⚠️ 输入法合成中一律不接手。中文/日文输入法合成时按 Esc 是「取消这次候选」，
      // 按回车是「选中候选」——在这里把它们当成「取消编辑 / 保存」的话，用户只是想
      // 换个词，整个编辑态（连带刚打的一屏字）就被收掉了。移动端最容易踩、
      // 桌面复现不了的一条。
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") {
        closeEditor(ctx);
        e.stopImmediatePropagation();
        return;
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        closeEditor(ctx, { save: true });
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }
    }
    if (e.key === "Escape" && fs.classList.contains("open")) {
      // #11：有代码悬浮窗开着时，Esc 只收回最上面那一个，不再往下走——
      // 否则一次 Esc 又收窗又关卡片，两层动作叠在一起。
      // 必须 stopImmediatePropagation：全息面板自己的 Esc 处理也挂在 doc 上，
      // stopPropagation 拦不住同节点的其它监听。kbKeydown 是 mount 时注册的，
      // 比它早，所以这里抢得到。
      if (closeTopFloat(ctx)) {
        e.stopImmediatePropagation();
        return;
      }
      // #20 孤岛汇总是个浮层，比「退一层」更靠上——开着就先收它，
      // 一次 Esc 只做一件事（与悬浮窗那条分流同一个道理）。
      if (orphanPanel.classList.contains("open") || folderPanel.classList.contains("open")) {
        closeOrphanPanel(ctx);
        closeFolderPanel(ctx);
        e.stopImmediatePropagation();
        return;
      }
      // 3.0 刀 6：文献阅读器是整个库上面的一整块屏，比连线编辑模式还靠上。
      // 排在浮层**之后**：阅读器开着自己的文档选择器时，Esc 该先收那个浮层
      // （它是盖在阅读器上的更小一层），再一下才轮到退出阅读器。
      if (ctx.reader && ctx.reader.isOpen()) {
        ctx.reader.close();
        e.stopImmediatePropagation();
        return;
      }
      // 3.0 刀 5：连线编辑模式（右键金线进的）。和连接模式是同一层的东西，
      // 排在它前面、排在浮层后面——面板和悬浮窗比它更"当前"。
      if (ctx.state.lineEdit) {
        setLineEdit(ctx, false);
        e.stopImmediatePropagation();
        return;
      }
      // 3.0 刀 5：连接模式开着时，Esc 先退它。排在所有分支**之前**——
      // 它是此刻屏幕上最"当前"的那件事，退层/关库都该往后站。
      if (ctx.state.linking) {
        setLinking(ctx, false);
        e.stopImmediatePropagation();
        return;
      }
      if (!overlay.classList.contains("open")) {
        // #19：钻进去过就先退一层，退到根之后这一下才轮到关掉整个晶体库。
        // 退层排在关库前面——反过来的话，在第三层按一下 Esc 就整个关掉，白钻了。
        if (drillUp(ctx)) {
          e.stopImmediatePropagation();
          return;
        }
        if (ctx.state.openCrystal) collapseCrystal(ctx);
        else closeFullscreen();
      }
    }
  };
  doc.addEventListener("keydown", kbKeydown);
  win.__kbV13Keydown = kbKeydown;

  // 防止 overflow 变动触发 resize → 重复渲染
  if (win.__kbV13Resize) win.removeEventListener("resize", win.__kbV13Resize);
  const kbResize = () => {
    if (!ready || !fs.classList.contains("open")) return;
    const r = stage.getBoundingClientRect();
    if (Math.abs(r.width - prevW) < 10 && Math.abs(r.height - prevH) < 10) return;
    prevW = r.width;
    prevH = r.height;
    renderCrystals(ctx);
    if (ctx.state.openCrystal) {
      applyExpanded(ctx, ctx.state.openCrystal, model.colorOf(ctx.state.openCrystal), false);
    }
    // 画布模式：拉窗口只是换了个取景框，晶体在世界里的位置不该动。
    // 但相机是「屏幕点 ↔ 世界点」的换算基准，视口变了得把它重铺一遍，
    // 否则画面会跟着视口整体偏掉。
    if (isCameraStage(ctx.state.stage)) applyCamera(ctx, true);
    // 3.0 刀 6：阅读器一屏摆几页是**按视口算出来的**，窗口一变就得重排——
    // 不重排的话拉大窗口不会多出一页，右下角白白空着一块。
    if (ctx.reader) ctx.reader.onResize();
  };
  win.addEventListener("resize", kbResize);
  win.__kbV13Resize = kbResize;

  return {
    ctx,
    model,
    state: ctx.state,
    // 已读回的视图状态。测试要断言「坏状态退回默认」只能走这里——
    // 去翻 ctx.state.view 就把测试绑在内部结构上了。
    viewState: () => ctx.state.view,
    open: openFullscreen,
    close: closeFullscreen,
    expand: (key) => expandCrystal(ctx, key),
    // #19 多层：当前所在的层栈（`[]` = 晶体环）。测试与截图脚本用它断言
    // 「钻到了第几层」，不必去数 DOM 里有几个六边形。
    crumbs: () => (Array.isArray(ctx.state.crystalPath) ? ctx.state.crystalPath.slice() : []),
    up: () => drillUp(ctx),
    toDepth: (d) => drillToDepth(ctx, d),
    // #21 两栏主次（"cards" | "crystals"）
    facet: () => ctx.state.facetFocus,
    setFacet: (f) => setFacetFocus(ctx, f),
    // 3.0 刀 2 显示模式（"ring" | "canvas" | "grid" | "storyline"）。
    // 读的是**推导后的那一档**，不是偏好里存的原始值——测试要断言的是
    // 「屏幕上现在是什么样」，不是「存档里写了什么」。
    stage: () => ctx.state.stage,
    toggleStage: () => toggleStage(ctx),
    // 3.0 刀 3：布局草稿。「未保存」标记与「恢复默认」都读它。
    draftDirty: () => isDraftDirty(ctx),
    // 和顶栏那颗按钮**走同一条路**（doResetLayout），否则测试验的就不是
    // 用户真按下去会发生的事——那正是「测试绿了但功能是坏的」的老路子。
    resetLayout: () => doResetLayout(ctx),
    // 3.0 刀 6 文献阅读器。**只给「怎么看」，不给「怎么操作」**：翻页、缩放、
    // 建卡一律走页面上那几颗真按钮——给个 next() 的句柄等于把被测的入口整个
    // 绕过去，而刀 5 的教训正是「测试绿了、真机上那条路是死的」。
    reader: {
      open: () => ctx.reader.open(),
      close: () => ctx.reader.close(),
      isOpen: () => ctx.reader.isOpen(),
      // 3.0 刀 9-C：挂在故事线背后、还留着的那一份。只读——切过去的动作
      // 走页面上那两颗真按钮（阅读器顶栏的「故事线」、库顶栏的「文献」）。
      isSuspended: () => ctx.reader.isSuspended(),
      doc: () => ctx.reader.doc(),
      docs: () => ctx.reader.docs(),
      pageCount: () => ctx.reader.pageCount(),
      layout: () => ctx.reader.layout(),
      zoom: () => ctx.reader.zoom(),
      err: () => ctx.reader.err(),
      message: () => ctx.reader.message(),
      // 打开某一份：测试要能不点开选择器就直达某份文献（选择器本身另有用例）。
      // 它走的是与点击同一条函数，不是旁路。
      openDoc: (path) => ctx.reader.openDoc(path),
      // 3.0 刀 9-A 桌面：**只读**。开关和加页一律走顶栏那两颗真按钮
      // （「桌面」/「＋ 页」），句柄上不给操作入口——理由同上一行。
      deskOn: () => ctx.reader.deskOn(),
      deskWins: () => ctx.reader.deskWins(),
    },
    // 3.0 刀 4 方框。读的是**草稿优先**的那种（和 crystalPos 同一条口径）——
    // 测试要断言的是「屏幕上现在是什么样」，不是「存档里写了什么」。
    modules: () => modulesOf(ctx).map((m) => ({ ...m })),
    // 手工连的线。和 modules / membership / crystalPos 同一条口径：
    // **草稿优先**——测试要断言的是"屏幕上现在是什么样"，不是"存档里写了什么"。
    // （第一版直接读 viewState()，于是拖动写在草稿上的改动一条都读不到。）
    cardLinks: () => {
      const all = layoutOf(ctx).cardLinks || {};
      return Object.values(all).flat().map((l) => ({ ...l }));
    },
    // 3.0 刀 13：被右键藏掉入链出链的卡。**只读**——藏和显回都走真实右键
    // （与 lineEdit 同一条道理：那个入口本身就是被测的那一步）。
    // 与 cardLinks 同一条口径：**草稿优先**，断言的是"屏幕上现在是什么样"。
    hiddenCards: () => [...hiddenCardSet(ctx)],
    // 蓝线的接法提示。同样草稿优先。
    linkSides: () => {
      const all = layoutOf(ctx).linkSides || {};
      return Object.values(all).flat().map((l) => ({ ...l }));
    },
    membership: () => ({ ...membershipOf(ctx) }),
    addModule: () => ({ ...addModule(ctx) }),
    removeModule: (id) => removeModule(ctx, id),
    moduleAt: (wx, wy) => {
      const m = moduleAtPoint(ctx, wx, wy);
      return m ? { ...m } : null;
    },
    // 某颗晶体此刻该在哪（世界坐标，**草稿优先**）。没有记录返回 null——
    // 测试要能区分「摆在默认位置上」和「被拖到了正好等于默认位置的那个点上」。
    crystalPos: (key) => {
      const p = (layoutOf(ctx).crystalPos || {})[key];
      return p ? { ...p } : null;
    },
    // **已经落盘**的那一份。和上面分开给，是为了能断言「拖动只改草稿」
    // ——那是「恢复默认」能成立的全部前提。
    savedCrystalPos: (key) => {
      const p = (ctx.state.view.crystalPos || {})[key];
      return p ? { ...p } : null;
    },
    // 相机。没进画布模式时是 null（那时没有平移缩放器，也就没有相机可言）。
    camera: () => (ctx._panzoom ? ctx._panzoom.camera() : null),
    // 连线编辑模式（右键金线进的）。**只读**这一个：测试要断言"现在在不在模式里"。
    // 进出的动作一律走**真实的右键 + S 框选 + D**——那才是用户要走的那条路，
    // 给个 setLineEdit(true) 的句柄等于把被测的那个入口整个绕过去了。
    lineEdit: () => !!ctx.state.lineEdit,
    marqueeArm: () => isMarqueeArmed(ctx),
    marqueeSel: () => marqueeSel(ctx).map((s) => ({ ...s })),
    // 包围盒跟着档走：根层是晶体的、层内是卡片节点的。相机 fit() 只认这一个口子。
    // 藏/显示双链。切一下要重画（线是画上去的，不是 CSS 能藏的）
    toggleHideLinks: () => {
      ctx.state.hideLinks = !ctx.state.hideLinks;
      renderCrystals(ctx);
      refreshStageUi(ctx);
      return ctx.state.hideLinks;
    },
    worldBounds: () =>
      ctx.state.stage === "storyline"
        ? storylineBounds(ctx, ctx.state.crystalPath)
        : worldBounds(ctx),
    select: (key) => selectCrystal(ctx, key),
    clickCrystal: (key) => crystalClicked(ctx, key),
    clearSelection: () => clearSelection(ctx),
    scroll: (dir) => smoothScroll(ctx, dir),
    // #9 给测试与截图脚本用。页面上真正的入口是顶栏那两枚按钮，这里只是让
    // 断言不必去点一个带文案的控件（换文案不该让测试红）。
    mode: () => ctx.state.mode,
    setMode: (mode) => applyMode(ctx, mode),
    // #10 面板此刻的位移。断言"拖完真的动了"只看 transform 会被格式化细节绑住，
    // 这里给一个干净的数。
    panelOffset: () => ({ ...(ctx._holoOffset || { x: 0, y: 0 }) }),
    showCard: (card) => showHologram(ctx, card, ctx.state.currentHue),
    renderCards: (list, hue) => renderRingCards(ctx, list, hue ?? ctx.state.currentHue),
    // #16 编辑态。saveEdit 返回的是**等写盘落地**的 promise——closeEditor({save:true})
    // 本身是即返回的（它不能阻塞界面），测试拿它就能等到真正写完再断言。
    editing: () => isEditing(ctx),
    saveEdit: () => saveEditor(ctx),
    // #18 退订外部改动。宿主拆掉这个实例时该被调用——虽然真宿主那边它拆的就是
    // 整个容器、我们的监听也跟着没了，但假适配层与将来的第三方宿主需要一条明路，
    // 测试也靠它验「退订之后不再响」。
    unwatch: () => {
      if (stopWatch) stopWatch();
      // 只清掉属于自己的那一份：这个句柄可能比实例活得久，别把后来者
      // （重挂出来的新实例）登记的退订函数一起抹了。
      if (win.__kbV13Watch === stopWatch) win.__kbV13Watch = null;
    },
  };
}
