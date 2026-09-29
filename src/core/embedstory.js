// 3.0 刀 9-D：结构窗——把故事线嵌进「文献-桌面」的一扇窗里。
//
// 用户 09-19 的原话是「不用切到其他界面里」。所以这里要的是**并存**：阅读器
// 还开着、桌面那几扇文献窗还摆在原位，旁边多一扇看结构的窗。这和上一刀的
// 「切走」（suspend 阅读器、整屏钻进故事线）不是新旧关系，是两种看法。
//
// == 怎么做到「并存」：门面对象 ==
//
// storyline.js 那 1400 行是照着「ctx 上只有一个舞台」写的：画进 `ctx.canvas`、
// 手势绑 `ctx.stage`、相机在 `ctx._panzoom`、两个 SVG 层缓存在 `ctx._sLink` /
// `ctx._sHandle`、命中几何在 `ctx._manualHit`、模式标志在
// `ctx.state.linking` / `lineEdit` / `marqueeSel` —— 全是**单槽位**。
//
// 把这些改成「按视图传参」要动 1400 行，还要把所有调用点一起改，而它们每一处
// 都踩过坑。所以这里换个做法：造一个**影子对象**，原型指向真 ctx，
// 只把那几个单槽位覆盖掉。
//
//   const fake = Object.create(ctx);        // 其余字段全部穿透到真 ctx
//   fake.canvas = view.world;               // 画进结构窗自己的世界层
//   fake.stage  = view.stage;               // 手势落在它自己的舞台上
//   fake._panzoom = view.pz;                // 它自己的相机
//   fake.state = Object.create(ctx.state);  // 原型链穿透，只覆盖那几个模式位
//
// 于是 `renderStorylineStage(fake, path)` / `bindLinkMode(fake)` **一个字不用改**，
// 摸到的却全是结构窗自己的东西。真 ctx 那一份纹丝不动——库里那屏看不见、点不到
// （阅读器整块盖着），但它的监听还挂着，所以那边加了 `keysAreOurs` 的门（见
// storyline.js：阅读器开着时那几个快捷键让位）。
//
// == 已知的取舍 ==
//
// `crystalPos` / `cardLinks` 这两张表**是共用的**（它们挂在 `state.view`/`draft` 上，
// 走原型链穿透）。这是有意的：节点位置、手工金线在库里和结构窗里就该是同一份，
// 在哪儿拖都一样。所以结构窗里的改动会同步出现在晶体库那一屏。

import { EL } from "./dom.js";
import { createBox } from "./storyboxes.js";
import { bindPanZoom } from "./panzoom.js";
import { createStoryWrite } from "./storywrite.js";
import {
  renderStorylineStage,
  redrawStoryLines,
  storylineBounds,
  bindStorylineDrag,
  bindStorylineClicks,
  bindLinkMode,
  bindBendEditing,
  bindLineEdit,
  leaveStoryline,
  refreshLineHint,
  setMarqueeArm,
  marqueeSel,
  blueSel,
  // 3.0 刀 41：卡档也要能删（用户 09-29）。
  cardSel,
  clearPicked,
  marqueeKind,
  isCardMarquee,
  setCardMarquee,
  setLineEdit,
  deletePickedFor,
  hiddenCardSet,
  showAllHidden,
  storylineCards,
  // 3.0 刀 34：新建的卡片摆到这一扇窗的正中央。
  placeNewCard,
} from "./storyline.js";
import { viewportCenter } from "./storyspot.js";
import { importCard } from "./storyimports.js";
// 3.0 刀 34：关窗之前催一下还没写下去的卡片坐标（它们是防抖写的）。
import { flushCardPos } from "./cardpos.js";
import { flushBoxFiles } from "./boxfile.js";

/** 结构窗那一小块自绘界面的样式。
 *
 *  **导出的**：插件形态下它要并进 `styles.css` 一起发布（见 `src/entry-styles.js`），
 *  dataviewjs 形态下由 `ensureCss` 在运行时注入。两条路二选一，靠 `injectStyles` 分。 */
export const EMBED_CSS =
  ".kb-v13-embedstory{position:relative;width:100%;height:100%;overflow:hidden;" +
  "  background:rgba(6,12,22,.55);}" +
  ".kb-v13-embedstage{position:absolute;inset:0;overflow:hidden;}" +
  // `transform-origin:0 0` 是相机那套约定的前提（screen = world * k + t），
  // 少了它 `<0,0>` 会跑到元素中心，缩放时整片画面往左上偏。
  ".kb-v13-embedcanvas{position:absolute;inset:0;pointer-events:none;" +
  "  transform-origin:0 0;}" +
  ".kb-v13-embedbar{position:absolute;left:8px;top:8px;z-index:5;display:flex;" +
  "  align-items:center;gap:6px;padding:4px 6px;border-radius:7px;" +
  "  background:rgba(8,16,30,.82);border:1px solid rgba(0,180,255,.22);}" +
  ".kb-v13-embedmode{cursor:pointer;font:inherit;font-size:11px;padding:3px 8px;" +
  "  border-radius:5px;border:1px solid rgba(0,200,255,.3);" +
  "  background:none;color:rgba(190,220,245,.88);}" +
  ".kb-v13-embedmode.on{background:rgba(255,190,90,.22);" +
  "  border-color:rgba(255,200,110,.7);color:rgba(255,225,175,.98);}" +
  ".kb-v13-embedhint{font-size:11px;color:rgba(160,195,225,.75);max-width:230px;" +
  "  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
  ".kb-v13-embedundo,.kb-v13-embedact,.kb-v13-embedcrystal{cursor:pointer;" +
  "  font:inherit;font-size:11px;" +
  "  padding:2px 7px;border-radius:5px;border:1px solid rgba(0,200,255,.28);" +
  "  background:none;color:rgba(190,220,245,.85);}" +
  // 3.0 刀 16：这两颗「选框 / 删除」**开着的时候以前看不出来**——只有字变了。
  // `syncBar` 一直在加 `.on`，而这里从来只定义过 `.kb-v13-embedmode.on`。
  // 背后挂上"删掉笔记里的 [[链接]]"这种动作之后，「选框正开着」必须在屏幕上
  // 看得见。用与库里 `.kb-v13-marquee-btn` 同一支红：红 = 破坏性动作。
  ".kb-v13-embedact.on{background:rgba(165,70,60,.62);" +
  "  border-color:rgba(255,150,140,.6);color:rgba(255,225,215,.98);}" +
  // 3.0 刀 41：「删除卡片」。**它一出现就是红的**，而不是像 `.on` 那样按下去才红——
  // `.on` 说的是"这个开关现在开着"，可以有开有关；这一颗从露面那一刻起就挂着一个
  // **删文件**的动作，没有"没打开"的状态。同一支红，与 `.kb-v13-embedact.on`、
  // 库里那几颗删除按钮同一条约定：**红 = 破坏性**。
  ".kb-v13-embeddanger{border-color:rgba(255,150,140,.45);" +
  "  color:rgba(255,205,195,.92);}" +
  ".kb-v13-embeddanger:hover{background:rgba(165,70,60,.45);" +
  "  border-color:rgba(255,150,140,.78);color:rgba(255,238,232,1);}";
  // 3.0 刀 16：`.kb-v13-embedgo` / `.kb-v13-embedreason` 两条样式跟着那个
  // 「为什么连过去？」输入框一起删了（用户 09-21）。

let cssDone = false;
/**
 * 把这份样式注入页面。
 *
 * ⚠️ **插件形态下不能走这里**（`injectStyles: false`）：插件把样式发成仓库根目录的
 * `styles.css`，Obsidian 自己会加载它。再注入一份的后果不是「重复但无害」——
 * 第二份挂在 `<head>` 末尾，**后到的赢**，于是插件版和 dataviewjs 版的覆盖顺序
 * 会不一样，某个选择器看上去「时灵时不灵」。
 */
function ensureCss(doc) {
  if (cssDone && doc.getElementById("kb-embedstory-css")) return;
  const old = doc.getElementById("kb-embedstory-css");
  if (old) old.remove();
  const s = doc.createElement("style");
  s.id = "kb-embedstory-css";
  // ⚠️ 名字是 `EMBED_CSS`，**不是 `CSS`**。写成 `CSS` 不会报错——浏览器里
  // `CSS` 是个**全局对象**（CSSOM 那个接口），于是这一句安静地把
  // `"[object CSS]"` 注进了页面：样式表整个是空的，结构窗的布局当场塌掉，
  // 而控制台一句红字都没有。改这个常量名时先把这里一起改了。
  s.textContent = EMBED_CSS;
  doc.head.appendChild(s);
  cssDone = true;
}

/**
 * 造影子对象。**只覆盖舞台那一套单槽位，其余一律穿透到真 ctx。**
 *
 * ⚠️ `reader` 要覆盖成「没开」：`keysAreOurs` 拿它挡「阅读器开着时故事线的
 * 快捷键让位」，而结构窗**本来就是开在阅读器里面的**——不覆盖的话 D 键
 * 当场被自己挡掉，删除成了死的，而且不报错。
 * （同一个门还管着别的键，所以那边另加了一支认 `__embedView` 的，见 storyline.js。）
 */
function makeFacade(ctx, view) {
  const fake = Object.create(ctx);
  fake.canvas = view.world;
  fake.stage = view.stage;
  fake._panzoom = view.pz;
  fake.model = ctx.model;
  // 结构窗自己那一份模式状态。原型指向真 state，所以 crystalPath / draft /
  // view 照旧读得到；只有下面这几个被覆盖成**这个视图私有**的。
  const st = Object.create(ctx.state);
  st.stage = "storyline";
  // ⚠️ **`crystalPath` 必须覆盖成本窗自己那条**，不能透到真 state。
  //
  // 它是「手工金线记在哪颗名下」的那把钥匙（`manualLinks` / `writeManualLinks`
  // 都拿 `ctx.state.crystalPath.join(" ")` 当键），也是 `layoutFor` / `posMapOf`
  // 算节点位置的那一层。透过去的话，结构窗看的是 A、而金线全记到**晶体库当前
  // 待着的那颗** B 名下：在窗里画一根线，切到库那屏的 B 才看得见它，而看 A 时
  // 又冒出一堆不是在这儿画的线。**两处都不报错。**
  // （render() 每次都把它跟 view.path 对齐，这里先给个初值。）
  st.crystalPath = view.path;
  st.linking = false;
  st.lineEdit = false;
  st.linkWrite = false;
  st.marqueeSel = [];
  st.marqueeRect = null;
  // 3.0 刀 16：蓝线那一份选中，以及「这一次框选要删哪一种线」。与上面几个同一条
  // 理由——**这个视图私有**，不覆盖的话会透到真 state（库里那份），而结构窗一旦
  // 把它写成 "blue"，反噬的是库那一屏。
  st.blueSel = [];
  st.marqueeKind = "manual";
  // 3.0 刀 30：框选卡片那一档，以及它选中了哪几张。**同一条理由，而且这条最险**——
  // 透到真 state 的话，在结构窗里框选几张卡，切回库那一屏会看到那几张卡也亮着边
  // （路径是同一个库里的路径，真的对得上），而库里根本没有卡档这个概念。
  st.marqueeCard = false;
  st.cardSel = [];
  st.hideLinks = false;
  fake.state = st;
  fake.fs = view.root; // 模式类名（kb-v13-linking 等）挂在这一扇窗自己的根上
  fake.reader = { isOpen: () => false, isSuspended: () => false };
  // ⚠️ **这几个槽位必须一开始就归零**，不能靠原型链去读。
  //
  // 它们是「一层缓存」的住址：`ensureLinkLayer(ctx)` 第一句就是
  // `if (ctx._sLink && ctx._sLink.parentNode) return ctx._sLink;`。不归零的话，
  // 只要晶体库那一屏**曾经进过故事线**（`ctx._sLink` 上正躺着一张活的 SVG），
  // 影子对象一读就透过去拿到**库那张**，于是结构窗把自己画进了被阅读器盖住的
  // 那一屏：窗里空空如也，而库那屏悄悄多了一层节点。**不报错。**
  fake._sLink = null;
  fake._sHandle = null;
  fake._manualHit = null;
  // 3.0 刀 16：蓝线的命中几何，上面那条警告对它一字不差地成立——不归零的话，
  // 框选读的是**库那一屏**的蓝线，删掉的却是这个窗里正指着的笔记。
  fake._blueHit = null;
  // 3.0 刀 30：卡片的命中几何。**又是同一条**——不归零的话，在结构窗里框选卡片
  // 会把**库那一屏**的卡片几何当成本窗的用，而两屏看的多半不是同一颗晶体，
  // 于是"框住五张、选中三张"，或者拖走一批屏幕上没碰过的卡。
  fake._cardHit = null;
  // 3.0 刀 32：框 id → 元素那张表。**同上一条**——这一扇窗要是从没画过故事线
  // （比如还没挑晶体，`render` 半路就返回了），`_boxEls` 就会顺着原型链读到
  // **库那一屏**那张表，于是悬停黄点那个联动会去闪库里的框（而不是这扇窗的）。
  fake._boxEls = null;
  fake._rubber = null;
  fake._rubberSide = null;
  fake.lineHint = null;
  // 结构窗就是「阅读器之上那一层」，不是被它盖住的那一层——见上面那条警告。
  fake.__embedView = view;
  // 3.0 刀 41：**这一屏有「删除卡片」**（用户 09-29）。
  //
  // `refreshLineHint` 是库和结构窗**共用**的一份，它的卡档文案里要不要提这颗按钮
  // 只能在这儿问一句能力——库里卡档仍然只有移动，照搬过去那句说明就会指着一颗
  // 不存在的按钮（同 adapter.js 那条：一个能力问句 + 一个兜底）。
  fake.cardDelete = true;
  return fake;
}

/**
 * 造一扇结构窗。
 *
 * @param {object} ctx  真 ctx（只读它，绝不改它）
 * @param {object} opts
 *   @param {string} [opts.crystal] 初始看哪颗晶体（晶体 key）
 *   @param {{x,y,k}} [opts.camera] 初始相机；不给就「全部装进视野」
 *   @param {(msg, ok) => void} [opts.onSay] 说一句话（窗口标题栏 / 阅读器消息条）
 *   @param {(key) => void} [opts.onCrystal] 想换一颗晶体看（幽灵节点点了走这条）
 */
export function createEmbedStory(ctx, opts = {}) {
  const doc = ctx.doc || document;
  // 默认注入（dataviewjs 形态）；插件形态由 mount 传下来 false，样式走 styles.css。
  if (opts.injectStyles !== false) ensureCss(doc);

  const root = EL("div", "kb-v13-embedstory");
  // 舞台吃到类名 `.kb-v13-stage` 是有意的：线框、光标、连接点显隐那一票规则
  // 全写着 `.kb-v13-linking .kb-v13-stage`、`.kb-v13-lineedit .kb-v13-stage`，
  // 换个类名就得把它们抄一遍，而抄漏的那几条**不报错**，只是没那么亮/没那么准。
  const stage = EL("div", "kb-v13-stage kb-v13-embedstage");
  const world = EL("div", "kb-v13-canvas kb-v13-embedcanvas");
  const bar = EL("div", "kb-v13-embedbar");
  const modeBtn = EL("button", "kb-v13-embedmode");
  modeBtn.type = "button";
  modeBtn.textContent = "画线：看";
  modeBtn.title =
    "切换「拖一根线」的后果：\n" +
    "看 = 只画一根金线，存在库里，不碰笔记；\n" +
    "写 = 往起点那张卡的正文里真写一条 [[目标卡]]，笔记跟着变。";
  // 「选框 / 删除实线」两颗：进连线编辑模式（右键落在金线上）之后才出现。
  //
  // ⚠️ **不能只靠 D 键**。库里那两颗按钮的来历就是这条教训（README 里写着）：
  // 上一版把「按住 S 再拖」当入口，真机上是死的——库嵌在笔记里，按键落点是
  // 编辑器的 contenteditable，被当成打字丢掉了。所以那边改成了顶栏按钮。
  // 结构窗里同理：**没有按钮，框选就无从开启**（D 要有选中才删得掉）。
  const marqueeBtn = EL("button", "kb-v13-embedact");
  marqueeBtn.type = "button";
  marqueeBtn.title = "打开选框：这时拖鼠标就是框选金线。再点一下关掉。";
  marqueeBtn.style.display = "none";
  // 3.0 刀 30（用户 09-27）：「框选卡片、整批拖走」。
  //
  // 顶栏那颗「选框」拆成两颗，**各管一件事**：
  //   · 这一颗（「选框：线」⇄「框：卡」）说的是**框住的东西是什么**；
  //   · 旁边那颗（「选框」⇄「退出选框」）说的是**现在能不能框**。
  //
  // 为什么不合成一颗按钮轮着切：那需要在一颗按钮上塞两个动作（切档 / 开关），
  // 而"点了之后是哪一个"没法从屏幕上读出来——正是 09-20 那次「右键只有金色线」
  // 栽过的同一类坑。两颗按钮各写各的状态，看一眼就知道现在在哪一档。
  const kindBtn = EL("button", "kb-v13-embedact");
  kindBtn.type = "button";
  kindBtn.textContent = "选框：线";
  kindBtn.style.display = "none";
  kindBtn.addEventListener("click", () => setCardMarquee(fake, !isCardMarquee(fake)));
  const delBtn = EL("button", "kb-v13-embedact");
  delBtn.type = "button";
  delBtn.title = "删掉框选中的那几根金线。";
  delBtn.style.display = "none";
  marqueeBtn.addEventListener("click", () => setMarqueeArm(fake, !fake.state.marqueeArm));
  delBtn.addEventListener("click", () => deletePickedFor(fake));

  // 3.0 刀 41（用户 09-29）：「删除卡片」——框住几张卡，一键连文件一起丢回收站。
  //
  // ⚠️ **和 `delBtn` 是两颗按钮，不合成一颗。**
  //   它们删的东西根本不是一类：一颗删的是**线**（金线/蓝线，蓝线还会动笔记正文里
  //   那条 `[[链接]]`），另一颗删的是**卡片文件本身**。而且两颗永不同时出现
  //   （`delBtn` 在卡档下 `n` 恒为 0，这颗只在卡档有事可做时才出来），所以并排
  //   也不占地方。合成一颗轮着切的话，"按下去会删掉什么"没法从屏幕上读出来——
  //   09-20 那次「右键只有金色线」栽的就是这一类。
  //
  // ⚠️ **不加确认弹窗**，守这扇窗既有的规矩（用户 09-20 明确不要）：
  //   「说明条就是仅有的告知」。所以代价写在三处，一处都不能省——
  //   按钮上的张数、悬停那句话、以及底下的说明条（见 syncBar / refreshLineHint）。
  const delCardBtn = EL("button", "kb-v13-embedact kb-v13-embeddanger");
  delCardBtn.type = "button";
  delCardBtn.style.display = "none";
  delCardBtn.addEventListener("click", () => deletePickedCards());

  // 「晶体：X」——换一颗看。**这是用户 09-19 要的「自己选」**：窗里固定看哪颗
  // 是他挑的，不是跟着他在库里逛到哪儿算哪儿（头一版走 `state.openCrystal`，
  // 逛一圈回来窗里的东西就换了，而他什么都没点）。
  // 点它走阅读器那棵树——和另外两颗选择器同一份画法、同一份数据。
  const crystalBtn = EL("button", "kb-v13-embedcrystal");
  crystalBtn.type = "button";
  crystalBtn.title = "换一颗晶体看。结构窗固定看这颗，下次打开还是它。";
  crystalBtn.addEventListener("click", () => {
    if (opts.onPickCrystal) opts.onPickCrystal();
  });

  // 3.0 刀 13：右键藏起来的卡，出口在这儿。
  // **只在真有东西可显的时候出现**（与「删除实线」同一条规矩）——摆一颗点了
  // 没反应的按钮比不摆更糟。不带计数：库那颗「删除实线（n）」的数说的是
  // **破坏性动作的规模**，这一颗不是。
  const showAllBtn = EL("button", "kb-v13-embedact kb-v13-embedshow");
  showAllBtn.type = "button";
  showAllBtn.textContent = "显示全部";
  showAllBtn.title = "把右键藏起来的那些卡片的入链出链全部显示回来。";
  showAllBtn.style.display = "none";
  // 不用再手动重画：showAllHidden 内部走 ctx.refreshStoryline，
  // 而这扇窗把它覆盖成了整屏 render（见 makeFacade 那段警告）。
  showAllBtn.addEventListener("click", () => showAllHidden(fake));

  const hint = EL("span", "kb-v13-embedhint");
  // 3.0 刀 24（用户 09-27）：「＋ 框」——建一个**手动收纳方框**。
  //
  // ⚠️ **它不能"有框的时候才出现"**。用户的原话就是「如果这个结构窗没有收纳方框
  // 怎么办，+框到底在哪」——入口在需要它的那一刻恰好不可见，是 09-20 那次
  // 「右键只有金色线」的同一个错。所以只要在故事线里，它就一直摆着。
  const addBoxBtn = EL("button", "kb-v13-embedact");
  addBoxBtn.type = "button";
  addBoxBtn.textContent = "＋ 框";
  addBoxBtn.title =
    "建一个收纳方框：把几张卡归到一起，可以改名、可以收起。\n" +
    "建完之后**把卡片拖进去**就归它了；拖到框外就移出来。\n" +
    "框只是分组——删框、移出，都**不会动你的卡片**。";
  addBoxBtn.addEventListener("click", () => {
    // `createBox` 在"还没挑晶体"时会回 null（那会儿没有"这一层"可归，
    // 建出来是个谁也看不见、也删不掉的框）。**必须说一句**——
    // 不说的话这颗按钮就成了"点了没反应"，而那正是这一族按钮最忌讳的。
    // 3.0 刀 34：**建在你正看着的地方**，不是世界的某个固定角落
    // （用户 09-29：「视口远离那个固定位置，还要回去找」）。
    if (!createBox(fake, [], viewportCenter(fake))) {
      say("先挑一颗晶体（顶栏那颗「晶体：…」），框才有地方放。", false);
    }
  });

  // 3.0 刀 31（用户 09-27）：「从别的晶体引一张卡进来」。
  //
  // 与「＋ 框」同一条规矩：**只要在故事线里就一直摆着**，不做成"有东西可引才出现"
  // ——入口在需要它的那一刻恰好不可见，是 09-20 那次「右键只有金色线」的同一个错。
  //
  // 它只负责**开那颗选择器**（树长在「边看边记」那一栏里，reader 才有）；
  // 挑完之后 reader 调回 `view.importCard(path)`，见这个对象末尾那一段。
  const importBtn = EL("button", "kb-v13-embedact");
  importBtn.type = "button";
  importBtn.textContent = "导入卡片";
  importBtn.title =
    "从别的晶体引一张卡到这一屏上来，把两张不同晶体的卡片连起来。\n" +
    "引进来那张卡会落在这扇窗的正中间，等你拖它进某个收纳方框。\n" +
    "它本身一个字都不动——还在原来那个文件夹里。拿走就点它右上角那颗 ✕。";
  importBtn.addEventListener("click", () => {
    if (opts.onPickCard) opts.onPickCard();
  });

  // `delCardBtn` 紧挨着 `delBtn`：两颗永不同时出现（一个管线、一个管卡），
  // 占的是同一个视觉位置——"框住之后能删什么"就在这一处。
  bar.append(
    crystalBtn,
    modeBtn,
    kindBtn,
    marqueeBtn,
    delBtn,
    delCardBtn,
    showAllBtn,
    addBoxBtn,
    importBtn,
    hint
  );
  stage.appendChild(world);
  root.append(stage, bar);

  const view = {
    root,
    stage,
    world,
    bar,
    hint,
    path: [],
    pz: null,
    cam: { x: 0, y: 0, k: 1 },
  };

  // 相机：**自己一台**，绝不碰 `ctx._panzoom`。绑的是舞台（世界层是
  // pointer-events:none，空白处的按下要穿透到舞台才收得到），被变换的是世界层
  // ——这一条与 canvas.js 里那段「为什么不绑 canvas」是同一个理由。
  view.pz = bindPanZoom(
    { gesture: stage, view: world, frame: stage },
    {
      initial: opts.camera || { x: 0, y: 0, k: 1 },
      onChange(cam) {
        view.cam = cam;
        if (opts.onCamera) opts.onCamera(cam);
      },
    }
  );

  const fake = makeFacade(ctx, view);

  // 交互全部一次性绑到这个视图自己的舞台上。这些都是**已有的**那几套，
  // 一行没改——影子对象让它们以为自己还在晶体库那一屏。
  bindStorylineDrag(fake);
  bindStorylineClicks(fake);
  bindLinkMode(fake);
  bindBendEditing(fake);
  bindLineEdit(fake);

  // 3.0 刀 30：**结构窗里的 Esc 归这扇窗自己收。**
  //
  // ⚠️ 这一条不能交给 app.js 那条总调度。那条读的是**真** ctx 的 `state.lineEdit`，
  // 而这一扇窗的模式长在影子 state 上（见 makeFacade 顶上那段）——于是窗里按 Esc
  // 什么也不会发生（库那侧没进编辑模式，整条链上没有分支认领它，最后落到
  // 「overlay 还开着 → 什么也不做」）。说明条上从 3.0 刀 5 起就写着「Esc 退出」，
  // 不认它就是那句话在骗人。
  //
  // 卡档里尤其要紧：框选完想取消选中，除了 Esc 就只剩「点空白」——
  // 而点空白连整个编辑模式一起退了，用户想接着框下一片就得重新点开两条按钮。
  //
  // ⚠️ 用**捕获**：要抢在 reader.js 的 onKeydown（它管着阅读器自己的翻页键）和
  // app.js 那条之前。`stopImmediatePropagation` 也是必须的——同元素的后续监听
  // 之间 stopPropagation 拦不住，少了这句这一下会接着去关掉整块阅读器。
  const onEsc = (e) => {
    if (e.key !== "Escape") return;
    // **只认领"这一刻屏幕上真有这一扇窗"的那一下。** 窗口收进收纳栏 / 被挂起时
    // 尺寸是 0×0（同 `fit()` 和 `onResize` 用的判据），那会儿按 Esc 的人
    // 要找的是别的东西——吞掉它等于让 Esc 在别处静默失效。
    const rect = root.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    if (!fake.state.lineEdit) return;
    // 正在我们自己的编辑表单里打字时不认领——那一下的意思是「从输入框里出来」，
    // 归 reader.js 的 typingNow 那条管，这里抢了就把人锁在框里了。
    const a = doc.activeElement;
    if (a && a.closest && a.closest(".kb-v13-editform")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    setLineEdit(fake, false);
  };
  doc.addEventListener("keydown", onEsc, true);

  // 点节点 = 把那张卡摆到桌面上（用户 09-19 选的）。**不打开全息面板**：
  // 面板会盖住半张桌子，把用户刚摆好的版面搅了——而那正是他选桌面模式的理由。
  // 这条覆盖掉的是 `bindStorylineClicks` 里那一句 `ctx.openCardPanel(card)`。
  fake.openCardPanel = (card) => {
    if (opts.onPlaceCard) opts.onPlaceCard(card);
  };
  // 幽灵节点（链到本晶体之外的那一头）：**在窗里换一颗晶体**，不把人踢回库。
  // 库那一屏此刻正盖在阅读器下面，跳过去等于点了没反应。
  fake.gotoCrystal = (key) => {
    if (opts.onCrystal && key) opts.onCrystal(key);
  };

  function say(text, ok = true) {
    hint.textContent = text || "";
    hint.style.color = ok ? "rgba(160,195,225,.75)" : "rgba(255,150,140,.9)";
    if (opts.onSay) opts.onSay(text, ok);
  }

  function setWriteMode(on) {
    fake.state.linkWrite = !!on;
    modeBtn.classList.toggle("on", !!on);
    modeBtn.textContent = on ? "画线：写" : "画线：看";
    // 3.0 刀 16：切档就把连线编辑模式退掉、把这一轮的选中一并作废。
    // 档位说的正是「拖一根线的后果」；把上一档的删除选中留过界，按钮上那三个字
    // 和按下去真正删掉的东西就对不上了。
    setLineEdit(fake, false);
    // 3.0 刀 15：切档不再念那句提示了。用户 09-20：「去掉提示：拖一根线...」。
    //
    // 那颗按钮的文案（「画线：看」⇄「画线：写」）本身已经把这一档说清楚了，
    // 每次切都重念一遍只是白占着底下那条位置——而那条位置是留给**真出了事**
    // 的时候用的（写不进去、卡片在别处被改过、撤销）。话说得越少，
    // 那几句越有人看。
    say("");
  }

  modeBtn.addEventListener("click", () => setWriteMode(!fake.state.linkWrite));

  /**
   * 「删除卡片」（3.0 刀 41，用户 09-29）：把框选中的那几张卡**连文件一起**丢回收站。
   *
   * ---- 为什么卡档现在有「删除」了 ----
   *
   * 卡档原来写死"没有删除这回事"（`syncBar` 里那个 `card ? 0 : …` 就是为它设的），
   * 理由是卡片只有移动。用户 09-29 要的是**在这儿也能删**：框住一批、一键清掉，
   * 而不是切回库里一张张走「删除卡片」。
   *
   * ---- 四条纪律 ----
   *
   *   1. **走 `trashFile`（回收站），不做 unlink。** 与库里的「删除卡片」同一个口子，
   *      用户在宿主/系统回收站里捡得回来。这是**文件**，不是正文里的一行字——
   *      删错了没有"再打一遍"这条路，所以回收站这一步不能省。
   *   2. **一张失败不影响其余**（同 `cardpos.js` 的 flushBatch）。删到一半撞上一个
   *      被别的程序占住的文件，剩下的还得删完——半途而废留下的是"我也不知道删了
   *      几张"的状态。
   *   3. **先清选中再开删。** 清早了这一批就定了（中途用户再框也混不进来）；不清的话
   *      删完按钮上还写着「删除卡片（3）」而其中几张已经不在了，下一次点下去删的是
   *      别的东西。
   *   4. **`removeCard`（摘一张）不是 `removeFolder`（摘一棵子树）。** 这两个在这份
   *      代码里长得像，用错就是把整颗晶体连带删掉（reader.js 的 doTrashCard 专门
   *      为这一条写过警告）。
   */
  async function deletePickedCards() {
    const paths = cardSel(fake).slice();
    if (!paths.length) return;
    const api = ctx.adapter;
    if (!api || typeof api.trashFile !== "function") {
      say("这个宿主不给删文件的口子，删不了。", false);
      return;
    }
    clearPicked(fake); // 纪律 3
    let ok = 0;
    const failed = [];
    for (const p of paths) {
      let res = null;
      try {
        res = await api.trashFile(p);
      } catch (e) {
        res = { ok: false, reason: "error", message: (e && e.message) || String(e) };
      }
      if (res && res.ok) {
        if (ctx.model && ctx.model.removeCard) ctx.model.removeCard(p);
        ok++;
      } else {
        failed.push(p);
      }
    }
    // 顺序与库那一侧一致（reader.js 的 doTrashCard）：模型先改对，再重画。
    // `removeCard` 内部已经 rebuildGroups + rebuildRelations，所以这里不用再调
    // refreshRelations。
    if (ctx.renderCrystals) ctx.renderCrystals();
    if (ctx.refreshCrystalLayer) ctx.refreshCrystalLayer();
    if (ctx.refreshOrphans) ctx.refreshOrphans();
    if (ctx.refreshFolders) ctx.refreshFolders();
    if (ctx.flushViewState) ctx.flushViewState();
    // 这一扇窗自己重画（换晶体、卡片被改，都走它）。
    render(view.path, { keepCamera: true });
    // ⚠️ 重画**不会**顺手刷这一条工具栏（它俩是两条路），所以按钮的显隐和底下那句
    //    说明条要自己收尾——不收的话，删完之后「删除卡片（3）」还亮在那儿。
    syncBar();
    say(
      failed.length
        ? "删掉 " + ok + " 张，有 " + failed.length + " 张没删成（多半是被占住了），它们还在。"
        : "删掉 " + ok + " 张卡——进了回收站，能捡回来。",
      failed.length === 0
    );
  }

  /**
   * 这一条工具栏跟着模式走。
   *
   * ⚠️ **`refreshStageUi` 必须覆盖掉**：`setLineEdit` / `setMarqueeArm` /
   * `deletePicked` 改完状态都会调它刷新界面，默认穿透到真 ctx 那一份
   * （app.js 里刷的是**晶体库**顶栏那几颗），于是这颗「选框」永远不出现、
   * 框选也就无从开启——而库里那几颗按钮此刻正被阅读器盖着，刷了也白刷。
   */
  function syncBar() {
    const kind = marqueeKind(fake);
    const card = kind === "card";
    const blue = kind === "blue";
    const editing = !!fake.state.lineEdit;
    const armed = !!fake.state.marqueeArm;
    // 卡档下**必须是 0**，于是「删除实线 / 删除蓝线」那颗自己收起来——它删的是
    // **线**，卡档里没有线可删。写成 0 而不是"另外判一次 card"，是因为下面那句
    // `n > 0` 同时管着显隐和文案——一个数管一处，不会对不上。
    //
    // ⚠️ 3.0 刀 41：卡档**现在有它自己的删除**了，但那是**另一颗按钮**
    // （`delCardBtn` / `nCard`）。所以这一行的 `card ? 0` **不要动**——
    // 它管的是"线那颗按钮"，不是"卡这张不能删"。
    const n = card ? 0 : (blue ? blueSel(fake) : marqueeSel(fake)).length;
    // 卡档选中的张数。单独一个数、单独一颗按钮，理由见 delCardBtn 那段。
    const nCard = card ? cardSel(fake).length : 0;
    // 换档那颗：编辑模式里一直摆着（**不能"有卡才出现"**——没有可见入口的
    // 手势就是 09-20 那颗"右键只有金色线"的同一种死法）。
    kindBtn.style.display = editing ? "" : "none";
    kindBtn.textContent = card ? "框：卡" : "选框：线";
    kindBtn.classList.toggle("on", card);
    kindBtn.title = card
      ? "现在是「框选卡片」：拖出方框把几张卡一起框住，然后按住其中任意一张\n" +
        "整批一起拖走——拖进收纳方框就归它，拖到框外就移出来。点一下换回框线。\n" +
        "（框住之后也可以点「删除卡片」把它们删掉——那张卡连文件一起进回收站。）"
      : "现在是「框选线」：拖出方框把几根线一起框住，再点「删除实线 / 删除蓝线」删掉。\n" +
        "点一下换成框选卡片——那档用来**整批挪卡片**，也用来**整批删卡片**。";
    marqueeBtn.style.display = editing ? "" : "none";
    marqueeBtn.textContent = armed ? "退出选框" : "选框";
    marqueeBtn.classList.toggle("on", armed);
    marqueeBtn.title = card
      ? "打开选框：这时拖鼠标就是框选卡片（框完按住其中一张整批拖走）。再点一下关掉。"
      : blue
        ? "打开选框：这时拖鼠标就是框选蓝线。删掉 = 从卡片正文里删掉那条 [[链接]]。"
        : "打开选框：这时拖鼠标就是框选金线。再点一下关掉。";
    // **只在真的有得删的时候出现**：摆一颗点了没反应的按钮比不摆更糟
    // （与库顶栏那颗同一条规矩）。卡档下 `n` 恒为 0，它自己就收起来了。
    delBtn.style.display = editing && n > 0 ? "" : "none";
    delBtn.textContent = (blue ? "删除蓝线（" : "删除实线（") + n + "）";
    delBtn.title = blue
      ? "把框中的蓝线删掉——笔记正文里对应的 [[链接]] 会一起删掉（可撤销一次）。"
      : "删掉框选中的那几根金线。";
    // 「删除卡片」（3.0 刀 41）：**只在真有卡被框住的时候出现**——与上面那颗同一条
    // 规矩（摆一颗点了没反应的按钮比不摆更糟）。
    //
    // ⚠️ 三处都要说清代价，一处都不能省：这张数（按钮上）、悬停那句话、底下说明条
    //    （refreshLineHint 的卡档文案）。这扇窗**没有确认弹窗**，这三处就是全部的告知。
    delCardBtn.style.display = editing && nCard > 0 ? "" : "none";
    delCardBtn.textContent = "删除卡片（" + nCard + "）";
    delCardBtn.title =
      "把框中的这 " + nCard + " 张卡删掉。\n" +
      "**连笔记文件一起删**（不是解绑、不是隐藏）——进宿主回收站，能捡回来。\n" +
      "卡片所在的晶体不动。";
    // 3.0 刀 13：同上——有东西可显才出场
    showAllBtn.style.display = hiddenCardSet(fake).size ? "" : "none";
    // 3.0 刀 16：**这一句原来漏了**（库里 app.js 的 refreshStageUi 结尾有）。
    // 漏了的表现是：框选明明框住了两根、按钮也亮着「删除蓝线（2）」，底下那行
    // 说明条却还停在"拖动鼠标，框住要删的…"。背后挂着一个删笔记的动作时，
    // 过期文案不是装饰问题。
    refreshLineHint(fake);
  }

  // ============================================================
  // 写入型连线：拖一根线 = 往起点那张卡的正文里写一条 [[目标卡]]
  // ============================================================
  //
  // 用户 09-19：「可以通过连线来写入谁链接谁」。走的是卡片盒「留链」**同一条路**，
  // 一步不少：读原文 → `patchBody` 只换正文那一截（YAML 一个字节不动）→
  // `writeCard` 带 `base` 基线比对（多设备同步下这张卡可能刚被手机改过，
  // 不一致就**不写**）→ 用**回读的真实全文**更新模型 → 重算关系图 → 重画。
  //
  // ⚠️ 正文是用户手写的，**这是整扇窗里唯一不可逆的部分**，所以：
  //   · 已经写过同一个目标就不重复写（用户自己手写的也算）；
  //   · 写失败一律说清是哪一种失败，不静默；
  //   · 留一次撤销，而且只有一层（与 editform 同一条规矩）。

  /**
   * 一层撤销。形状**只有一种**：`{ entries: [{ path, prev, base }] }`。
   *
   * 写成数组是因为 3.0 刀 16 的「删一根蓝线」可能一次动**两张卡**（两个方向
   * 各一条字面量）。写模式 ADD 那条只放一条进去，行为与从前完全一样。
   * `prev` 是**任何写之前**那一份，`base` 是写完之后**回读**的那一份——
   * 撤销时拿它当基线，传旧的必假冲突、不传就是静默盖掉别处的改动。
   */
  // 3.0 刀 16：**「为什么连过去？」那个输入框删掉了**（用户 09-21）。
  //
  // 它原来是写完一条链就弹出来、自动聚焦、等你敲一句理由（或按 Esc 跳过）。
  // 用户不要了：连着拖几根线的时候，每拖完一根都被一个输入框截住，还得先处理它
  // 才轮得到下一根。「连的时候写下理由」这条规矩本身没变——**手写在 `]]` 后面
  // 照样会显示在线上**，只是这扇窗不再代劳、也不再拦那一下。
  const undoBtn = EL("button", "kb-v13-embedundo", "撤销");
  undoBtn.type = "button";
  undoBtn.style.display = "none";
  bar.append(undoBtn);

  // 3.0 刀 17：写那一整套（拖线写链接 / 删蓝线 / 撤销）搬进了 `core/storywrite.js`，
  // **和晶体库的故事线共用同一份**。这扇窗只提供它独有的三样：往哪儿说话、
  // 写完之后重画什么、撤销按钮是哪一颗。
  //
  // 边界的划法：`storywrite` 不认识"窗"这个概念，`embedstory` 不认识"写盘"这个概念
  // ——和 storyline.js 那条「这一层不认识适配层」是同一条纪律。
  const storyWrite = createStoryWrite(fake, {
    say: (text, ok) => say(text, ok),
    afterWrite: () => render(view.path, { keepCamera: true }),
    setUndoVisible: (on) => {
      undoBtn.style.display = on ? "" : "none";
    },
  });
  undoBtn.addEventListener("click", () => storyWrite.undoWrite());

  // 舞台把「拖一根线落在哪张卡上」交到这里（见 storyline.js 的 bindLinkMode）。
  // 这两条就是「写模式」在 ctx 这一层的**全部接口** —— storyline.js 只认它们，
  // 别的什么都不问。库里那份 ctx 挂的是同一个模块的同一个函数。
  fake.writeStoryLink = storyWrite.writeStoryLink;
  fake.removeStoryLinks = storyWrite.removeStoryLinks;


  // ⚠️ **`refreshStoryline` 必须也覆盖掉。**
  //
  // 它默认穿透到真 ctx 那一份（app.js 里的箭头函数 `() => renderCrystals(ctx)`，
  // 捕获的是**真** ctx），而 `bindLinkMode` / `setLineEdit` / `setMarqueeArm`
  // 拖完、切模式之后都会调它重画。不覆盖的后果：结构窗里拖出来的金线**记下了
  // 却没画出来**——`cardLinks` 里明明有那一条，屏幕上一根线都没有，
  // 一直要等到下一次整窗重画才冒出来。不报错，看着像"拖了个寂寞"。
  fake.refreshStoryline = () => render(view.path, { keepCamera: true });
  // 同一个坑的第二处：模式开关改完状态都调它，默认那份刷的是晶体库的顶栏。
  fake.refreshStageUi = syncBar;
  // 3.0 刀 31：storyline.js 里那些"这一下为什么什么都没发生"的话走这个口子
  // ——它不认识这一扇窗，也不该认识（同 `writeStoryLink` 那条边界）。
  // 库那一侧挂的是 `sayStatus`（会自己消失），这儿的 `say` 是窗里那条常驻说明。
  fake.say = (text, ok = true) => say(text, ok);

  /** 全部装进视野。窗口尺寸是 0 时直接跳过——那会儿算出来的是垃圾。 */
  function fit() {
    const r = stage.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const b = storylineBounds(fake, view.path);
    if (!b) return;
    const pad = 28;
    const k = Math.min(1.2, Math.max(0.15, Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h)));
    view.pz.setCamera(
      {
        k,
        x: r.width / 2 - (b.x + b.w / 2) * k,
        y: r.height / 2 - (b.y + b.h / 2) * k,
      },
      { silent: true }
    );
    view.cam = view.pz.camera();
  }

  /** 画（或重画）这颗晶体的故事线。换晶体、卡片被改、窗口改尺寸都走它。 */
  function render(path, { keepCamera = false } = {}) {
    view.path = Array.isArray(path) ? path.slice() : [];
    // 那把「金线记在哪颗名下」的钥匙跟着这一屏走（见 makeFacade 里的警告）。
    fake.state.crystalPath = view.path;
    crystalBtn.textContent = "晶体：" + (view.path[view.path.length - 1] || "?");
    if (!view.path.length) {
      world.textContent = "";
      say("还没选看哪颗晶体。");
      return;
    }
    // ⚠️ 先清场再画。清场的责任**不在** renderStorylineStage 里（它只 append），
    // 在 crystals.js 的 clearStoryLayers——那是给晶体库那一屏用的，它清的是
    // `ctx.stage`。这里必须自己清，否则每换一次晶体，节点就在上一次的基础上
    // 再叠一层，屏幕上看着像「卡片翻倍」。
    // ⚠️ **每加一种画在舞台上的东西，这里就要多一条**（3.0 刀 23 的收纳方框
    // 就是漏在这儿，画面上是「方框越画越多」）。
    for (const sel of [".kb-v13-snode", ".kb-v13-slinks", ".kb-v13-shandles", ".kb-v13-sbox"]) {
      stage.querySelectorAll(sel).forEach((el) => el.remove());
    }
    fake._sLink = null;
    fake._sHandle = null;
    fake._manualHit = null;
    fake._blueHit = null;
    // 3.0 刀 30：同上。这里清一次是防「换晶体」那一趟——`renderStorylineStage`
    // 开头也会重建，但那是**渲染之后**的事：万一哪次渲染提前返回了（没卡、
    // 路径为空），留着的那份几何对应的是上一颗晶体的卡片。
    fake._cardHit = null;
    renderStorylineStage(fake, view.path);
    if (!keepCamera) fit();
    refreshLineHint(fake);
  }

  return {
    root,
    el: root,
    /** 换一颗晶体看（晶体 key）。 */
    show(key, o) {
      render(ctx.model.resolveChain ? ctx.model.resolveChain(key) : [key], o);
    },
    path: () => view.path.slice(),
    render,
    /** 窗口尺寸变了重新框一下。**挂起/隐藏时量到的是 0×0，会被 fit 自己跳过。** */
    onResize: () => {
      const r = stage.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      // 只是重画线（位置没变），不重新 fit——用户自己推过的相机不该被窗口
      // 尺寸变化悄悄重置。
      redrawStoryLines(fake);
    },
    camera: () => ({ ...view.cam }),
    setCamera: (cam) => {
      view.pz.setCamera(cam, { silent: true });
      view.cam = view.pz.camera();
    },
    writeMode: () => !!fake.state.linkWrite,
    setWriteMode,
    /**
     * 3.0 刀 34：**新建的卡片摆到这一扇窗的正中央**（用户 09-29 报的
     * 「视口远离那个固定位置，还要回去找」）。由 reader 建完卡之后调回来。
     *
     * 只有"这张卡正好属于这一扇窗在看的那一层"时才摆（判断在 `placeNewCard` 里）
     * ——摆到别处是没有意义的坐标。摆了才重画，不摆就什么都不做。
     */
    placeNewCard: (path) => {
      if (!placeNewCard(fake, path)) return false;
      render(view.path, { keepCamera: true });
      return true;
    },
    /**
     * 3.0 刀 31：把一张**别的晶体**的卡引到这一屏上来。选择器挑完由 reader 调回来。
     *
     * ⚠️ 三种"引不进来"都要**说话**，一个都不许静默——这条路上三个都很容易撞上：
     *   · 卡本来就在这一屏里（用户挑了当前晶体自己的卡）；
     *   · 已经引过了；
     *   · 路径指不到卡（挑完之后卡被删了 / 改了名）。
     * 「点了没反应」是这个库里反复栽过的一类，而这里恰好有现成的话可以说。
     */
    importCard: (path) => {
      const p = String(path || "");
      const card = p && ctx.model.byPath ? ctx.model.byPath.get(p) : null;
      if (!card) {
        say("那张卡找不到了（可能刚被删掉或者改了名）。", false);
        return false;
      }
      // 「本来就在这一屏里」要问 `storylineCards`（文件夹递归那一份）。
      // 不先判的话会一路走到 core，而 core 那边只会**安静地回 false**——
      // 它不知道该怎么跟用户解释这件事。
      if (storylineCards(fake, view.path).some((c) => c.path === p)) {
        say("「" + card.title + "」本来就在这颗晶体里，不用引。", false);
        return false;
      }
      if (!importCard(fake, p, storylineCards(fake, view.path))) {
        say("「" + card.title + "」已经引进来过了——它就在这一屏上。", false);
        return false;
      }
      // 落座的位置是 core 算的（视口正中），所以这里**不能 keepCamera:false**：
      // 一 fit 相机就动了，卡片反而不在用户刚才看的地方。
      render(view.path, { keepCamera: true });
      say("引进来了：「" + card.title + "」。拖它进某个收纳方框就归它；不想要就点它右上角那颗 ✕。", true);
      return true;
    },
    /** 卡片被改过之后重画（关系图变了）。**不重新 fit**，保住用户推到的位置。 */
    refresh: () => render(view.path, { keepCamera: true }),
    say,
    /** 收掉只属于这一屏的运行时状态（模式、选中）。离开这一档时要叫一次。 */
    leave: () => leaveStoryline(fake),
    destroy: () => {
      // 3.0 刀 34：窗关掉之前把还没写下去的坐标催一遍（它们是防抖写的）。
      // **放在最前面**：下面那几行会把这一扇窗的运行时拆掉，而那之后再取
      // 位置取到的就不是这一屏了。
      flushCardPos(ctx);
      // 3.0 刀 35：框的边车同一条理由（也是防抖写的）。
      // 不用传 ctx：每一笔待写自己记着**是谁排的队**（见 boxfile.js 的 `dirty`），
      // 所以这里只是个兜底。门面的 `state` 本来就穿透到真 state，视图是同一份。
      flushBoxFiles();
      // ⚠️ Esc 那条是挂在 **doc** 上的，不摘的话这扇窗关掉之后它还活着：
      // 每开一次结构窗就攒一个监听，而它们全都读着已经没人要的 fake——
      // 表现是"关掉窗之后再按 Esc，别的窗口莫名退出编辑模式"。
      doc.removeEventListener("keydown", onEsc, true);
      leaveStoryline(fake);
      if (view.pz) view.pz.destroy();
      root.remove();
    },
  };
}
