// 悬浮窗引擎（#11 代码块 / #15 图片共用）。
//
// 它管的事只有一件：**把正文里的一个节点暂时搬走**——搬进一扇浮在卡片上的窗，
// 原位留一条占位条，看完收回时原样还回去。
//
// 为什么代码块和图片要共用这一层：
//   - 两件事的骨架是同一套（建窗、占位、拖动、夹取、尺寸记忆、收窗还原）；
//   - **注册表必须只有一份**。app.js 的 Esc 分流靠 closeTopFloat 收「最上面那一扇」，
//     hologram.js 收面板时靠 closeAllFloats 一扇都不能漏。两份注册表就要在两处各接
//     一遍线，漏接的后果是「卡片关了浮窗还在，按钮全是死的」——孤儿窗，见 #11 的教训。
//
// 两个前端各自只管三件事：找到节点、标题栏写什么、默认开多大 / 拖角锁不锁比例。
import { EL } from "./dom.js";

const EDGE = 8; // 窗离视口边缘的最小间距，拖动与缩放都按它夹
const BORDER = 1; // 与窗的 border 宽度一致，算内容盒时要用
const BAR_H = 32; // 与 .kb-v13-*-bar 的高度一致
// 多个窗同时开时逐层错开。纵向这一档必须大于标题栏高度——试过只错 26px，
// 后开的窗整个盖住先开那扇的标题栏，包括它的关闭按钮，用户连关都关不掉。
const STAGGER_X = 48;
const STAGGER_Y = BAR_H + 14;
// 没给 maxFrac 时的默认上限：默认开窗最多占视口这么大，超了就缩
const DEFAULT_MAX_FRAC = { w: 0.8, h: 0.8 };

// 会话内的位置与尺寸记忆。键是**被搬走的那个节点**：全息面板重渲染会重建节点，
// 记忆也就跟着丢——这正是要的，它是临时工具不是布局。
// 用 WeakMap 是为了节点回收时记录自动消失，不用手工清理。
function sizeMemory(ctx) {
  return (ctx._floatSizes = ctx._floatSizes || new WeakMap());
}

/** 当前开着的所有窗，按开窗顺序。两个前端共用这一份，见文件头。 */
function registry(ctx) {
  return (ctx._floatWindows = ctx._floatWindows || []);
}

/** 窗减去内容盒之后多出来的那圈：两条边框 + body 内边距，纵向再加一条标题栏。 */
function chromeOf(pad) {
  return { x: pad.x * 2 + BORDER * 2, y: BAR_H + pad.y * 2 + BORDER * 2 };
}

/** 这个节点此刻是不是正浮在窗里。前端用它判断该开还是该收。 */
export function findFloat(ctx, unit) {
  return registry(ctx).find((w) => w.unit === unit) || null;
}

/**
 * 把一个节点搬进新窗。返回 entry，调用方不用留也行（注册表里有）。
 *
 * @param {object} spec
 * @param {string} spec.cls         窗的类前缀，如 "kb-v13-cfloat"；子元素是 cls + "-bar" 等
 * @param {Node}   spec.unit        被搬走的节点
 * @param {Node[]} spec.barItems    标题栏从左侧起的节点（关闭按钮由引擎补在最右）
 * @param {string} spec.closeTitle  关闭按钮的 title / aria-label，如「收回代码」
 * @param {string} spec.ariaLabel   窗自己的 aria-label
 * @param {string} spec.slotText    原位占位条上那句话
 * @param {{x:number,y:number}} spec.pad  body 内边距（算内容盒要用，必须与 CSS 一致）
 * @param {() => {w:number,h:number}} spec.measure 内容盒的自然尺寸
 * @param {number} [spec.minW]      窗宽下限（自由缩放模式用）
 * @param {number} [spec.minH]      窗高下限（自由缩放模式用）
 * @param {number} [spec.minContent] 内容盒下限（锁比例模式用）
 * @param {number|null} [spec.ratio] 内容盒宽高比；给了就锁比例，不给就自由缩放
 * @param {{w:number,h:number}} [spec.maxFrac] 默认开窗时最多占视口的比例。
 *   锁比例（图）那一支按它把装不下的大图缩进来；自由那一支按它夹两轴。
 * @param {Element} [spec.host] 窗挂在谁底下。默认 `ctx.overlay`（全息遮罩）。
 *
 *   ⚠️ 给这个参数是为了**从文献阅读器里开的窗**（3.0 刀 9 的卡片盒）。遮罩是
 *   `position:fixed; z-index:9999`——那本身就是一个层叠上下文，窗在里面的 10050
 *   只在里面有效，而 `#kb-reader` 是 body 下 **10020 的兄弟**。两者都是 fixed 兄弟时
 *   后画的整个压住先画的，于是从阅读器里开的窗会被阅读器**整块盖住**，症状是
 *   「点了没反应」。把窗挂进阅读器自己的层里就没有这回事。
 *
 *   ⚠️ **host 必须是铺满视口的那一层**（`inset:0` 的 fixed）。窗的拖拽夹取用的是
 *   `ctx.win.innerWidth/innerHeight`（视口），而定位基准是 host——宿主比视口小的话，
 *   窗会顺着夹取跑到宿主外面去。阅读器正好是 `inset:0`，两者重合，不用换算。
 */
export function openFloat(ctx, spec) {
  const { cls, unit } = spec;
  const host = spec.host || ctx.overlay;

  const win = EL("div", cls);
  win.setAttribute("role", "dialog");
  win.setAttribute("aria-label", spec.ariaLabel);

  const bar = EL("div", cls + "-bar");
  const close = EL("button", cls + "-close", "✕");
  close.type = "button";
  close.title = spec.closeTitle;
  close.setAttribute("aria-label", spec.closeTitle);
  bar.append(...spec.barItems, close);

  const body = EL("div", cls + "-body");
  const grip = EL("div", cls + "-grip");

  const slot = EL("div", cls + "-slot");
  const slotText = EL("span", cls + "-slot-text");
  slotText.textContent = spec.slotText;
  const slotBtn = EL("button", cls + "-slot-btn", "收回");
  slotBtn.type = "button";
  slot.append(slotText, slotBtn);

  win.append(bar, body, grip);
  // 挂在全息遮罩里，不挂 body：遮罩会在下次 mount 时被整体 remove（app.js 建新实例前
  // 先清旧的），窗跟着一起走。截图时踩过——挂在 body 上的窗不属于任何容器，代码块
  // 重跑（Obsidian 里 dataviewjs 重渲染）后旧窗会永远浮在屏幕上，按钮全是死的。
  // 遮罩是 inset:0 的 fixed 层，作为 fixed 子元素的包含块和视口重合，坐标不用换算。
  host.appendChild(win);
  // 层级由 styles.js 里的不变量统一管：背景 < 连线 < 卫星 < 面板 < 浮窗。
  // 窗靠自己的 z-index:10050 压住面板，不需要（也不能）抬整个遮罩——
  // 遮罩一抬，卫星就落回窗底下，点击还会落到遮罩上变成关面板。
  //
  // 卫星与连线这一趟收起来（styles.js 里那条明规则）。浮窗是「拿在手上看」的焦点态，
  // 旁边那圈虚线和卡片此时只是干扰。**从前这个观感是 z-index 补丁的副作用**
  // （抬遮罩顺手把卫星盖住了），现在写成明规则，关掉最后一扇窗时原样回来。
  host.classList.add("kb-v13-floats-open");

  // 占位条顶在节点原来的位置上，收回时按它还原兄弟顺序
  const home = unit.parentNode;
  home.insertBefore(slot, unit);
  body.appendChild(unit);

  const entry = {
    win,
    bar,
    body,
    grip,
    unit,
    slot,
    home,
    host, // 收窗时要照着它摘类名，见 closeFloat
    spec,
    // 开窗时正文属于第几版。收窗时要拿它对一下：对不上说明正文在窗开着期间
    // 被重渲染过，槽位连同那一版一起没了（见 closeFloat）。
    gen: ctx._bodyGen || 0,
    chrome: chromeOf(spec.pad),
    ratio: spec.ratio || null,
    minContent: spec.minContent || 0,
    // 用户动过它没有。没动过的话，图晚一步 load 完可以自己把默认尺寸修正过来；
    // 动过就一个字都不能改——用户摆好的位置被"自动纠正"走，比尺寸不准讨厌得多。
    touched: false,
  };
  registry(ctx).push(entry);

  // 会话内开过的窗回到原位原尺寸；第一次开才现算。
  // 测量必须夹在这里：此刻窗还没有宽度（fit-content），内容量到的才是它**自己**想要的尺寸。
  // 顺序反过来先设宽度的话，<pre> 的 min-width:100% 会把测量撑成"窗有多宽"，永远量不到真实需要。
  const saved = sizeMemory(ctx).get(unit);
  if (saved) {
    applyBox(ctx, entry, saved.x, saved.y, saved.w, saved.h);
  } else {
    const n = registry(ctx).length - 1;
    const box = defaultBox(ctx, entry, spec.measure());
    // 装得下就居中起步，多个窗按开窗顺序往右下错开（见 STAGGER_Y 的注释）。
    // 这里不需要"装不下就钉左上角"那一支：锁比例那条路在 defaultBox 里已经把窗
    // 缩进了视口，自由那条路本来就夹在两轴内——起步位置永远落在屏幕里。
    applyBox(
      ctx,
      entry,
      (ctx.win.innerWidth - box.w) / 2 + n * STAGGER_X,
      (ctx.win.innerHeight - box.h) / 2 + n * STAGGER_Y,
      box.w,
      box.h
    );
  }

  bindDrag(ctx, entry);
  slotBtn.addEventListener("click", () => closeFloat(ctx, entry));
  close.addEventListener("click", () => closeFloat(ctx, entry));
  bindViewportClamp(ctx);

  unit.setAttribute("aria-expanded", "true");
  // 搬节点会丢焦点（appendChild 等于先摘下再挂上），补回来。
  // 这样键盘用户的 Enter 能接着把窗合上，而不是焦点莫名跳到 body。
  unit.focus();
  return entry;
}

/**
 * 内容晚一步才拿到真实尺寸时的补救（图片 load 完就是这一下）：把默认盒子重算一遍。
 *
 * 比例先补上，再判「用户动过没有」——两件事的性质不一样：
 * 比例是**这张图是什么**（内容自带的，晚到而已），位置和尺寸是**用户摆出来的**。
 * 用户拖过之后就不许再动他的窗，但不能因此让他手里一直是一把没有比例尺的窗。
 */
export function refitFloat(ctx, entry, natural) {
  if (!entry) return;
  // 图没载进来（404 / 附件不在）时 natural 是 null：这一趟什么也补不了，
  // 也不能拿兜底尺寸当比例锁上——那等于把一个编出来的数当成"这张图的形状"。
  if (!natural || !(natural.w > 0) || !(natural.h > 0)) return;
  if (entry.spec.lockRatio) entry.ratio = natural.w / natural.h;
  if (entry.touched) return;
  const r = entry.win.getBoundingClientRect();
  const box = defaultBox(ctx, entry, natural);
  applyBox(ctx, entry, r.left, r.top, box.w, box.h);
}

export function closeFloat(ctx, entry, focusBack = true) {
  const { unit, slot, win, home } = entry;
  // 内容自己往节点上加过的东西要在这里还原。图片窗会写内联宽高与 transform
  // （见 imgzoom.js），不还原的话收回后正文里那张图**还带着浮窗里的尺寸和位移**——
  // 在正文的宽度里被压扁、还错位到一边，比例全毁。放在搬回去之前，节点落地时就是原样。
  if (entry.spec.onClose) entry.spec.onClose();
  // 占位条占着节点原来的位置，所以「原位」就是它的正前方
  if (slot.parentNode) slot.parentNode.insertBefore(unit, slot);
  else if (entry.gen === (ctx._bodyGen || 0) && home && home.isConnected) {
    home.appendChild(unit); // 兜底：槽位不知去向，但正文还是同一版，节点不能丢
  }
  // 世代对不上：正文在窗开着期间被重渲染过（保存 / 换卡）。节点是从上一版正文里
  // **搬**出来的，槽位跟那一版一起没了，此时往新正文里塞只多出一份陈旧副本。
  // 直接丢掉——正文本就是从源重建的，那份内容已经在新渲染里了。
  unit.setAttribute("aria-expanded", "false");
  slot.remove();
  win.remove();
  ctx._floatWindows = registry(ctx).filter((w) => w !== entry);
  if (!ctx._floatWindows.length) {
    unbindViewportClamp(ctx);
    // 最后一扇窗收掉了，卫星与连线回来（见 openFloat 里那条）。
    // 摘的是**这一扇自己的宿主**，不是 ctx.overlay——阅读器里开的窗挂在自己那层上，
    // 跑到遮罩上去摘会把别人的标记摘掉。
    entry.host.classList.remove("kb-v13-floats-open");
  }
  if (focusBack && unit.isConnected) unit.focus();
}

/** 收回所有悬浮窗。closeHologram 与 renderHoloBody 开头都要调。 */
export function closeAllFloats(ctx) {
  const list = ctx._floatWindows;
  if (!list || !list.length) return;
  // 复制一份再遍历：closeFloat 会改 ctx._floatWindows
  list.slice().forEach((entry) => closeFloat(ctx, entry, false));
}

/** 收回最上面（最后开的）那一个。给 app.js 的 Esc 分流用；没有窗时返回 false。 */
export function closeTopFloat(ctx) {
  const list = ctx._floatWindows;
  if (!list || !list.length) return false;
  closeFloat(ctx, list[list.length - 1]);
  return true;
}

/**
 * 默认开窗的盒子（窗的外框尺寸）。
 *
 * 锁比例（图）：**装得下就按原图 1:1 开，装不下才等比缩进来**，缩到视口的 maxFrac 以内。
 *   - 小图：窗 = 原图尺寸，图 1:1 正好填满它，四边不留白也不裁切——它本来就没占
 *     多少地方，没有理由缩它。
 *   - 大图：窗收进视口，图跟着缩到正好填满这个窗，也就是图上「适应窗口」那一档。
 *     **整张图一眼看得全**，标题栏、✕、右下角抓角也都在屏幕里。
 *     不这么做的话，1710×706 的图在 1440×900 的屏上开出一扇比屏幕还大的窗，
 *     ✕ 直接跑到屏幕外，用户得先把窗拖回来才关得掉。
 *   - 缩过头（比 minContent 还窄，标题栏摆不下）就抬回来——那是下限，不是排版选择。
 *   - **只缩不放**：把 100×60 的图抬到 160% 去填一扇大窗，那是"默认不是 100%"，
 *     而且把小图拉大只会糊。
 *
 * 自由（代码）：两轴各自夹在视口内，代码块不怕变窄，窄了横向滚就是。
 */
function defaultBox(ctx, entry, natural) {
  const ch = entry.chrome;
  const frac = entry.spec.maxFrac || DEFAULT_MAX_FRAC;
  const maxW = ctx.win.innerWidth * frac.w - ch.x;
  const maxH = ctx.win.innerHeight * frac.h - ch.y;

  let cw = Math.max(1, natural.w);
  let hh = Math.max(1, natural.h);
  if (entry.ratio) {
    // 宽高一起缩同一个 k，比例自然保住（不直接取 natural.h，免得和 entry.ratio 差一丝）
    const k = Math.min(1, maxW / cw, maxH / hh);
    cw *= k;
    hh *= k;
    // 缩到了下限以下就整体抬回来：下限只有一条（内容盒宽度），高跟着比例走
    const kMin = Math.max(1, entry.minContent / cw);
    cw *= kMin;
    hh *= kMin;
  } else {
    cw = Math.min(cw, maxW);
    hh = Math.min(hh, maxH);
  }
  return { w: cw + ch.x, h: hh + ch.y };
}

// 尺寸先夹到下限与视口内，位置再夹——顺序反了会出现「缩到一半被位置挤回去」
function applyBox(ctx, entry, x, y, w, h) {
  const vw = ctx.win.innerWidth;
  const vh = ctx.win.innerHeight;
  const ch = entry.chrome;

  if (entry.ratio) {
    // 锁比例：宽高只剩一个自由度，全部从宽推出来。
    // 这样「默认开窗 / 拖角 / 视口变小重夹」三条路各算各的，也不会算出三种比例；
    // 分散到三处各写一遍，迟早有一条漏掉，表现就是"某次拖完图歪了"。
    //
    // 范围是 [内容下限, 视口]：窗**永远装得进屏幕**，所以标题栏、✕、右下角抓角
    // 任何时候都在看得见的地方。大图那件事由 defaultBox 缩图解决，不是把窗伸到屏幕外。
    const maxCw = vw - EDGE * 2 - ch.x;
    const maxCh = vh - EDGE * 2 - ch.y;
    let cw = Math.min(maxCw, Math.max(entry.minContent, w - ch.x));
    let hh = cw / entry.ratio;
    if (hh > maxCh) {
      // 又扁又宽的图：宽度夹住了，高度仍可能超——那一头也要收，收完宽度跟着比例缩回来
      hh = maxCh;
      cw = hh * entry.ratio;
    }
    w = cw + ch.x;
    h = hh + ch.y;
  } else {
    // 没给下限就是不设下限。少了这个 `|| 0`，只锁比例的那类窗（图片）在
    // "尺寸未知、比例也还没拿到"的这一小段里会算出 Math.max(undefined, …) = NaN，
    // 宽高写成 "NaNpx" 被浏览器丢掉，窗退回成内容撑多大就多大——一扇 139px 宽的窗。
    w = Math.max(entry.spec.minW || 0, Math.min(w, vw - EDGE * 2));
    h = Math.max(entry.spec.minH || 0, Math.min(h, vh - EDGE * 2));
  }
  // 位置夹取。上下界不用再自己排序：上面两条路都已经把窗夹进了视口（w ≤ vw − 2×EDGE），
  // 所以 `vw - w - EDGE ≥ EDGE` 恒成立，直接夹就是对的。
  x = Math.max(EDGE, Math.min(x, vw - w - EDGE));
  y = Math.max(EDGE, Math.min(y, vh - h - EDGE));
  entry.win.style.left = x + "px";
  entry.win.style.top = y + "px";
  entry.win.style.width = w + "px";
  entry.win.style.height = h + "px";
  sizeMemory(ctx).set(entry.unit, { x, y, w, h });
  // 内容盒尺寸变了要报一声（图片窗靠它把"窗内缩放比"等比跟走，见 imgzoom.js）。
  // 传的是内容盒，不是外框：调用方关心的是"图有多大地方可放"，
  // 窗自己那圈标题栏和边框是引擎的事。
  if (entry.spec.onBox) entry.spec.onBox({ w: w - ch.x, h: h - ch.y });
  return { x, y, w, h };
}

// 拖动与缩放都用 Pointer Events：手机（触摸/笔）也要能用，
// 而且 setPointerCapture 之后指针移出窗口也照样收得到 move。
function bindDrag(ctx, entry) {
  const { win, bar, grip } = entry;

  const start = (handle, onMove) => (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return; // 只认左键；触摸没有 button 语义
    if (e.target.closest && e.target.closest("button")) return; // 标题栏上的按钮不当作拖动起点
    e.preventDefault(); // 别顺手选中文字
    const r = win.getBoundingClientRect();
    const from = { x: r.left, y: r.top, w: r.width, h: r.height };
    const sx = e.clientX;
    const sy = e.clientY;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch (err) {
      /* 指针已经不活跃（合成事件）时拿不到捕获，退化成普通监听也能用 */
    }
    const move = (ev) => {
      entry.touched = true;
      onMove(ev.clientX - sx, ev.clientY - sy, from);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch (err) {
        /* 同上 */
      }
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  bar.addEventListener(
    "pointerdown",
    start(bar, (dx, dy, from) => applyBox(ctx, entry, from.x + dx, from.y + dy, from.w, from.h))
  );
  grip.addEventListener(
    "pointerdown",
    start(grip, (dx, dy, from) => {
      if (!entry.ratio) {
        applyBox(ctx, entry, from.x, from.y, from.w + dx, from.h + dy);
        return;
      }
      // 锁比例：纵向位移先按比例换算成等效宽度，再取"跟着走得更远"的那一个轴。
      // 只认 dx 的话，用户竖直往下拽会觉得毫无反应；只认 dy 同理。
      const d = Math.abs(dx) >= Math.abs(dy * entry.ratio) ? dx : dy * entry.ratio;
      applyBox(ctx, entry, from.x, from.y, from.w + d, from.h);
    })
  );
}

// 视口变小（手机转屏、拉窗口）时把还开着的窗重新夹一遍，否则会挂到可视区外。
// 监听挂在 window 上而不是 app.js：这里只在有窗时挂，最后一个窗关掉就摘，
// 免得空转。（app.js 的 kbResize 只认全屏渲染，插进去会互相打架。）
function onViewportResize(ctx) {
  (ctx._floatWindows || []).forEach((entry) => {
    const r = entry.win.getBoundingClientRect();
    applyBox(ctx, entry, r.left, r.top, r.width, r.height);
  });
}

function bindViewportClamp(ctx) {
  if (ctx._floatUnbindResize) return;
  const handler = () => onViewportResize(ctx);
  ctx.win.addEventListener("resize", handler);
  ctx._floatUnbindResize = () => ctx.win.removeEventListener("resize", handler);
}

function unbindViewportClamp(ctx) {
  if (!ctx._floatUnbindResize) return;
  ctx._floatUnbindResize();
  ctx._floatUnbindResize = null;
}
