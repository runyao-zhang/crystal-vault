// 3.0 刀 9-A：文献阅读器的**浮窗桌面**——一页一扇窗，摆哪儿、多大、缩放多少都由自己定。
//
// ---- 它和 floatwin.js 是两个东西，别合并 ----
//
//   `floatwin.js`  把正文里的一个节点临时**搬走**（原位留一条占位条），看完收回、原样还回去。
//                  它是「拿在手上看」的焦点态：一扇一扇地开，Esc 一扇一扇地收，
//                  尺寸记忆挂在**节点身份**上，节点一重建就忘光。
//   `desk.js`      是**工作台**：同时摆着好几扇、各自钉在屏幕的某个位置，
//                  关掉阅读器再打开还在。它没有「原位」，也不该被 Esc 一扇扇收掉。
//
// 所以这不是「又写了一个浮窗引擎」，是两类东西本来就不同。真正能共享的只有那段
// 约六十行的手势管道，而 `panzoom.js` 开头已经把这个判断定死了：
// 「复制一次的代价远小于维护一个双模型抽象——**但纪律要抄对**」。
//
// ---- 要抄对的三条纪律 ----
//
//   1. **阈值之内不要 pointer capture。** 按下就捕获会把 click 吃掉——标题栏上
//      那颗关闭按钮就再也点不着了（`holodrag.js` 里记过这条）。
//   2. **`applyDeskBox()` 是唯一写 left/top/width/height 的地方。** 分散到三处
//      各写一遍，迟早有一条漏掉，表现是「某次拖完窗歪了」（`floatwin.js` 的教训）。
//   3. **拖动过程中每一帧都要回调。** 窗里挂着按窗宽算出来的东西（画布、文字层），
//      攒到松手才更新的话，整个拖动过程里内容都是错位的。
//
// 这一层**不认识 PDF、也不认识卡片**：它只认盒子和指针。所以它是纯的、能单测的。

/** 距桌面边的最小间隙。与 `floatwin.js` 的 `EDGE` 同值，理由也一样：贴边就没法抓手了。 */
export const DESK_EDGE = 8;
/** 窗的下限。再小就只剩一条标题栏，内容一个字都看不着。 */
export const DESK_MIN_W = 220;
export const DESK_MIN_H = 180;
/** 超过这个位移才算「拖」，之内当点击——与 holodrag / itemdrag / panzoom 同一个数。 */
export const DRAG_THRESHOLD = 4;

// ---- markdown 的行号分页（3.0 刀 9-A2）----
//
// markdown 没有「页」这个概念，PDF 有。所以 PDF 那边直接按它自己的分页挑页，
// markdown 这边得**由用户划行号**来造页。
//
// ⚠️ 行号是**文件行号**（1-based，**含 frontmatter**），跟你在 Obsidian 编辑器左边
// 数到的一致。不这么做的话，用户得自己在脑子里减去 YAML 那几行——那种「差一点点」
// 的换算没人愿意每天做。
//
// ⚠️ 已知代价：切在代码围栏中间，那一页会渲染成半截代码块（`splitSegments` 当初
// 就是为这件事才做了 `maskCode`）。行号是用户自己划的，所以**不替他兜底**——
// 但选到会切断的位置时，界面会给一句提示。

/** markdown 没指定时每页多少行。够一屏读、又不至于滚太久。 */
export const DESK_PER_PAGE = 40;

/** 取一个有限数，坏值退回兜底。桌面的坐标是从存档里读回来的，**不可信**。 */
function num(v, fallback) {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

/**
 * 把一扇窗夹进桌面。**纯函数**：进来盒子和桌面尺寸，出去夹好的盒子，不读 DOM。
 *
 * 夹的是两件事：尺寸不许超过桌面（减去两边留的缝），位置不许把窗推出桌面。
 * 尺寸那一支先夹上限再夹下限——桌面特别小时宁可比下限小一点，也不能让窗整个
 * 溢出屏幕：溢出之后右下角的抓手就跑到屏幕外了，而那扇窗就再也改不了尺寸。
 *
 * @param {{x:number,y:number,w:number,h:number}} box
 * @param {number} vw 桌面宽
 * @param {number} vh 桌面高
 */
export function clampBox(box, vw, vh) {
  const availW = Math.max(1, num(vw, 0) - DESK_EDGE * 2);
  const availH = Math.max(1, num(vh, 0) - DESK_EDGE * 2);
  // 顺序不能反：**先按「想要多大」和下限取一个值，再夹进可用空间**，
  // 也就是「装得下」这一条赢过「不低于下限」。
  // 反过来写（可用空间先抬到下限）在桌面比下限还小时会算出一个比桌面大的窗，
  // 它右下角那个抓手就跑到屏幕外去了——那扇窗从此再也改不了尺寸。
  const w = Math.min(Math.max(DESK_MIN_W, num(box && box.w, DESK_MIN_W)), availW);
  const h = Math.min(Math.max(DESK_MIN_H, num(box && box.h, DESK_MIN_H)), availH);
  const x = Math.max(DESK_EDGE, Math.min(num(box && box.x, DESK_EDGE), num(vw, 0) - w - DESK_EDGE));
  const y = Math.max(DESK_EDGE, Math.min(num(box && box.y, DESK_EDGE), num(vh, 0) - h - DESK_EDGE));
  return { x, y, w, h };
}

/**
 * 新开一扇窗时它该多大、在哪儿。按「想要多大」给一个起点，夹进桌面，再按开窗
 * 顺序往右下错开——错开是为了后开的窗别整个盖住先开那扇的标题栏
 * （`floatwin.js` 的 `STAGGER_Y` 就是为这件事，它比标题栏高、错开得够）。
 *
 * @param {number} n 这是第几扇（从 0 起）
 * @param {{w:number,h:number}} want 想要的内容尺寸
 */
export function defaultDeskBox(n, want, vw, vh) {
  const box = clampBox(
    { x: 0, y: 0, w: num(want && want.w, 420), h: num(want && want.h, 560) },
    vw,
    vh
  );
  const step = 34;
  const x = (num(vw, 0) - box.w) / 2 + (n % 6) * step;
  const y = Math.max(DESK_EDGE, (num(vh, 0) - box.h) / 2 + (n % 6) * step);
  return clampBox({ x, y, w: box.w, h: box.h }, vw, vh);
}

/**
 * 把一扇**锁了比例**的窗夹进桌面（3.0 刀 9 第二版：PDF 页窗用）。
 *
 * 为什么 PDF 页窗要锁比例：窗的形状跟着页走，页就正好铺满窗，四边不留白
 * ——这是用户要的「视窗适应内容」。不锁的话拉一下角就回到旧的
 * 「内容缩进一个随便多大的框里」，跟这一版要修的那个毛病是同一件事。
 * 算法抄 `floatwin.js` 的 `applyBox` 锁比例那一支（照抄纪律，见文件头）。
 *
 * @param {number} ratio 内容盒的 **高 ÷ 宽**（和 `source.ratio` 同一个口径）
 * @param {{x:number,y:number}} [chrome] 外框比内容盒多出来的那一圈：
 *   x = 左右边框之和，y = 上下边框 + 标题栏。**必须给对**——`ratio` 说的是内容盒，
 *   而 `box.w/h` 说的是外框；不减掉这一圈的话，算出来的内容盒永远比该有的胖一圈
 *   （实测：460 宽的窗配 612×792 的页，内容盒高宽比成了 1.23 而不是 1.294，
 *   差的正是那 32px 的框）。
 */
export function clampRatioBox(box, vw, vh, ratio, chrome) {
  const r = num(ratio, 0);
  const ch = { x: num(chrome && chrome.x, 0), y: num(chrome && chrome.y, 0) };
  if (!(r > 0)) return clampBox(box, vw, vh);
  const availW = Math.max(1, num(vw, 0) - DESK_EDGE * 2);
  const availH = Math.max(1, num(vh, 0) - DESK_EDGE * 2);
  // 顺序同 `clampBox`：**「装得下」赢过「不低于下限」**。反过来的话，桌面比
  // 下限还小时会算出一扇比桌面大的窗，右下角抓手跑到屏幕外，那扇窗再也改不了尺寸。
  const minCw = Math.max(1, DESK_MIN_W - ch.x);
  let cw = Math.min(Math.max(minCw, num(box && box.w, DESK_MIN_W + ch.x) - ch.x), Math.max(1, availW - ch.x));
  let hh = cw * r;
  if (hh > availH - ch.y) {
    // 竖长页：宽度夹住了高度仍可能超，那一头也要收，收完宽度跟着比例缩回来
    hh = Math.max(1, availH - ch.y);
    cw = Math.min(cw, hh / r);
  }
  const w = cw + ch.x;
  const h = hh + ch.y;
  const x = Math.max(DESK_EDGE, Math.min(num(box && box.x, DESK_EDGE), num(vw, 0) - w - DESK_EDGE));
  const y = Math.max(DESK_EDGE, Math.min(num(box && box.y, DESK_EDGE), num(vh, 0) - h - DESK_EDGE));
  return { x, y, w, h };
}

/** 把盒子写到元素上。**唯一**写这四个属性地方，见文件头纪律 2。 */
export function applyDeskBox(el, box) {
  if (!el) return;
  el.style.left = box.x + "px";
  el.style.top = box.y + "px";
  el.style.width = box.w + "px";
  el.style.height = box.h + "px";
}

/**
 * 给一扇窗绑上「拖标题栏移动」与「拉右下角改尺寸」。
 *
 * @param {object} ctx 挂载上下文（要 `ctx.win` 量视口）
 * @param {object} spec
 * @param {HTMLElement} spec.el    窗元素（fixed 定位）
 * @param {HTMLElement} spec.bar   标题栏——按住它移动
 * @param {HTMLElement} spec.grip  右下角抓手——拉它改尺寸
 * @param {() => object} spec.box  现在这个盒子
 * @param {() => {w:number,h:number}} spec.bounds 桌面的可用尺寸
 *   ⚠️ **不是视口**。桌面只是页区那一块（右边还站着「边看边记」那一栏、
 *   上面还有一条顶栏），按视口夹的话窗会被推进侧栏底下去。
 * @param {() => number} [spec.ratio] 内容盒的「高 ÷ 宽」；给了就**锁比例**
 *   （PDF 页窗：窗的形状跟着页走，页正好铺满窗）。缺省不锁，两轴自由拉。
 * @param {() => {x:number,y:number}} [spec.chrome] 外框比内容盒多出来的那一圈
 *   （边框 + 标题栏）。锁比例时必须给，否则算出来的是外框的比例，
 *   内容盒永远胖一圈——见 `clampRatioBox` 的注释。
 * @param {(box, mode: "move"|"resize") => void} spec.onChange 拖动中每一帧（只摆位置，别写盘）
 * @param {(box) => void} spec.onCommit 松手（写盘）
 * @param {(pt: {x:number,y:number}) => void} [spec.onDragMove] 拖动中的**指针**坐标
 *   （3.0 刀 18 收纳栏）。盒子是夹在桌面里的，指针不是——窗顶到左墙之后指针
 *   还能继续往左走，收纳栏就靠这个「走了多远」判断你松手时想不想放进去。
 * @param {(pt: {x:number,y:number}, info: {moved:boolean, cancelled:boolean}) => boolean|void} [spec.onDrop]
 *   松手时问一句「这一放有人接手吗」。**返回 `true` = 已接手**，那就不走 `onCommit`
 *   （收纳栏就是靠它：接手之后那扇窗已经被摘出文档，再按它的盒子写盘、重画没有意义）。
 *   `pointercancel` 也会走到这里，`info.cancelled` 为真——那是用来清高亮的，
 *   收手方**必须返回假值**，否则一次取消会变成一次落点。
 * @returns {() => void} 摘监听
 */
export function bindDeskDrag(ctx, spec) {
  let drag = null;

  function start(e, mode) {
    if (drag) return;
    // 鼠标只认左键。触摸没有 button 语义，一律放行。
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // 标题栏上的按钮不是拖动起点——关窗、改页码都在那一排上。
    if (mode === "move" && e.target && e.target.closest && e.target.closest("button")) return;
    const b = spec.box();
    drag = {
      id: e.pointerId,
      mode,
      node: e.currentTarget,
      sx: e.clientX,
      sy: e.clientY,
      box: { x: b.x, y: b.y, w: b.w, h: b.h },
      moved: false,
    };
  }

  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      // ⚠️ 过了阈值才捕获，见文件头纪律 1。
      try {
        drag.node.setPointerCapture(drag.id);
      } catch (err) {
        /* 合成事件拿不到捕获，退化成普通监听也能用 */
      }
    }
    const bounds = spec.bounds();
    let next;
    if (drag.mode === "move") {
      next = clampBox({ x: drag.box.x + dx, y: drag.box.y + dy, w: drag.box.w, h: drag.box.h }, bounds.w, bounds.h);
    } else {
      // 锁比例的窗（PDF 页窗）纵向位移先按比例换算成等效宽度，再取「跟着走得更远」
      // 的那一个轴——只认 dx 的话用户竖直往下拽会觉得毫无反应
      // （`floatwin.js` 的 bindDrag 里同一条）。
      const r = spec.ratio ? num(spec.ratio(), 0) : 0;
      const ch = spec.chrome ? spec.chrome() : null;
      const d = r > 0 ? (Math.abs(dx) >= Math.abs(dy * r) ? dx : dy * r) : 0;
      next =
        r > 0
          ? clampRatioBox({ x: drag.box.x, y: drag.box.y, w: drag.box.w + d, h: drag.box.h }, bounds.w, bounds.h, r, ch)
          : clampBox({ x: drag.box.x, y: drag.box.y, w: drag.box.w + dx, h: drag.box.h + dy }, bounds.w, bounds.h);
    }
    // 把 `mode` 一起交出去：调用方要分清「用户挪了位置」和「用户改了尺寸」——
    // 桌面那边靠它决定这扇窗还要不要跟着内容自动摆形状（挪位置不该锁死形状）。
    spec.onChange(next, drag.mode);
    // 指针坐标单独交一份：**盒子被夹在桌面里，指针没有**。收纳栏判定的是
    // 「你松手时指针在不在那条栏上」，而窗永远够不到栏（`clampBox` 的边界
    // 就是桌面），只看盒子的话这个手势永远不成立。
    if (spec.onDragMove) spec.onDragMove({ x: e.clientX, y: e.clientY });
    e.preventDefault();
  }

  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    try {
      d.node.releasePointerCapture(d.id);
    } catch (err) {
      /* 上面就没捕获成功过 */
    }
    // 先问一句「这一放有人接手吗」。收纳栏会接手，接手之后那扇窗已经被摘出
    // 文档了——这时候再按它的盒子写盘、再重画一次，是对一个不在屏幕上的东西做事。
    // `pointercancel`（来电、系统抢走指针）也会走到这里，但它不是一次落点：
    // 收手方按 `cancelled` 只清高亮、返回假值，下面照旧提交。
    const cancelled = e.type === "pointercancel";
    if (spec.onDrop && spec.onDrop({ x: e.clientX, y: e.clientY }, { moved: d.moved, cancelled }) === true) return;
    // 没真动过就不写盘：一次「点一下标题栏」不该产生一次磁盘写。
    if (d.moved) spec.onCommit(spec.box());
  }

  const onBarDown = (e) => start(e, "move");
  const onGripDown = (e) => start(e, "resize");
  spec.bar.addEventListener("pointerdown", onBarDown);
  spec.grip.addEventListener("pointerdown", onGripDown);

  // ⚠️ move/up 绑在 **doc** 上，**不能绑在窗自己身上**。
  //
  // 这条是踩出来的，而且只在「拉角」时暴露：抓手就长在窗的右下角，往右下拽的
  // 头几个像素**立刻就越过窗的边界**，而这时还没到阈值、还没 setPointerCapture，
  // 于是 pointermove 的 target 变成了窗后面的东西——绑在窗上的监听一个都收不到。
  // 表现是「拖标题栏能动、拉角纹丝不动」，而两者走的是同一套代码。
  //
  // 同一个坑 `itemdrag.js` 开头写过一次（「事件必须绑在舞台上，不能绑在被拖的那一层」），
  // 这里是它的第二个形态：那次是层，这次是**距离太短的抓手**。
  const track = ctx.doc || (ctx.win && ctx.win.document) || document;
  track.addEventListener("pointermove", move);
  track.addEventListener("pointerup", end);
  track.addEventListener("pointercancel", end);

  return function unbind() {
    spec.bar.removeEventListener("pointerdown", onBarDown);
    spec.grip.removeEventListener("pointerdown", onGripDown);
    track.removeEventListener("pointermove", move);
    track.removeEventListener("pointerup", end);
    track.removeEventListener("pointercancel", end);
  };
}

/** 切一行到几行。**纯函数**，与 `paginateLines` 同一套行号口径（1 基、闭区间）。 */
export function sliceLines(text, from, to) {
  const lines = String(text == null ? "" : text).split(/\r?\n/);
  const a = clampLine(from, 1, lines.length);
  const b = clampLine(to, a, lines.length);
  return lines.slice(a - 1, b).join("\n");
}

/**
 * 把改过的**一段行区间**拼回全文（3.0 刀 9 第三版）。
 *
 * 桌面上的 markdown 窗是「一扇窗 = 文件的一段行」：窗里那块原生编辑器拿到的
 * 就是**这一段**，不是整篇。存盘时把这一段拼回原位，其余字节一个不动——
 * 与 `frontmatter.js` 的 `patchBody` 是同一条分工（只动该动的那一截）。
 *
 * ⚠️ **凭什么敢按行号拼回去**：因为写盘那一路带**整篇的基线**（`writeCard` 的
 * `opts.base` 就是这份文件的原文）。文件在别处被改过 → 基线对不上 → 那一次
 * **根本不写**、回 conflict，用户点头才覆盖。所以「行号漂了就会改错地方」这件事
 * 被基线挡在前面；没有基线的话这个函数是不安全的，别单独拿去用。
 *
 * 顺带一个好处：编辑期间文件长了几行也接得住——拼的是**写盘那一刻**读回来的那份。
 *
 * @param {string} text 全文（**基线那一份**，不是现在磁盘上的）
 * @param {number} from 起始行（1 基、闭区间）
 * @param {number} to   结束行（1 基、闭区间）
 * @param {string} next 这一段的新内容（可以比原来多几行、少几行）
 */
export function patchLines(text, from, to, next) {
  const lines = String(text == null ? "" : text).split(/\r?\n/);
  const a = clampLine(from, 1, lines.length);
  const b = clampLine(to, a, lines.length);
  // 行尾风格跟着原文走：CRLF 的文件里插一段 LF 进去，git 里就是半篇假 diff
  const eol = /\r\n/.test(String(text)) ? "\r\n" : "\n";
  let mid = String(next == null ? "" : next).replace(/\r\n|\r/g, "\n");
  // ⚠️ **收尾那个换行是「上一行到此为止」，不是多一个空行。** 编辑器的取值几乎
  // 总是带一个尾换行，照着 split 会把每一段都撑出一行空行——而且**不报错**，
  // 用户只会发现「我什么都没动，存完文件就长了一行」。故意的空行是 "\n\n"，
  // 剥掉一个还剩一个，不受影响。
  if (mid.endsWith("\n")) mid = mid.slice(0, -1);
  // 空内容 = 把这一段删掉，而不是留下一行空行
  const insert = mid === "" ? [] : mid.split("\n");
  return lines.slice(0, a - 1).concat(insert, lines.slice(b)).join(eol);
}

/**
 * 把一段行区间切成「块」——**给行号栏用**（3.0 刀 9 第二版）。
 *
 * 一块 = 一行号码 + 它下面那段内容。切法只有两条：
 *   - **空行是切点**（markdown 里空行就是段落界）；
 *   - **围栏里的空行不是切点**——``` 包起来的代码块中间空一行太常见了，
 *     在那儿断开的话，一整个代码块会被拆成好几截各自渲染，全都不成样子。
 *
 * 为什么要有这一层：桌面窗里那份 markdown 是**交给宿主渲染器**画的，画出来是
 * `<p>` / `<h2>` / `<pre>` 这些块级元素，**块与源文本行不是一一对应的**
 * （一个三行的段落渲染成一个 `<p>`）。所以行号栏只能挂在「块」上：每个块左边
 * 报出它**起始那一行的文件行号**——这正是用户要的那件事（对上标题栏里那个
 * 行号区间），而不是假装能逐行对齐。
 *
 * @param {string} text 全文
 * @param {number} from 起始行（1 基、闭区间）
 * @param {number} to   结束行（1 基、闭区间）
 * @returns {{from:number, to:number, text:string}[]}
 */
export function splitBlocks(text, from, to) {
  const lines = String(text == null ? "" : text).split(/\r?\n/);
  const a = clampLine(from, 1, lines.length);
  const b = clampLine(to, a, lines.length);
  const out = [];
  let cur = null;
  let fenced = false;
  for (let i = a; i <= b; i++) {
    const line = lines[i - 1];
    // 围栏开合：``` 或 ~~~ 起头（缩进三格以内都算，与 CommonMark 同口径）
    if (/^\s{0,3}(```|~~~)/.test(line)) fenced = !fenced;
    if (!fenced && !line.trim()) {
      cur = null; // 空行收口，下一行起一个新块
      continue;
    }
    if (!cur) {
      cur = { from: i, to: i, text: line };
      out.push(cur);
    } else {
      cur.to = i;
      cur.text += "\n" + line;
    }
  }
  return out;
}

/** 行号夹进 [lo, hi]。坏值退回 lo——**绝不产出 NaN**，那会让 `slice` 静默返回空。 */
function clampLine(v, lo, hi) {
  const n = Math.round(Number(v));
  if (!isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * 把一份 markdown 按行切成「页」。
 *
 * 两步，就是用户选的那两步：
 *   1. **先自动铺开**——每页 `perPage` 行，从头切到尾；
 *   2. **再单页微调**——`overrides` 里给了哪一页，就用它自己的起止行。
 *      只改那一页，别的页不动（所以相邻页重叠或漏掉一段都是可能的，
 *      那是用户自己划的，不替他纠正）。
 *
 * @param {string} text 文件的**全文**（含 frontmatter，行号才对得上编辑器）
 * @param {{perPage?: number, overrides?: Object}} [opts]
 *   `overrides` 形如 `{ 2: {from: 81, to: 120} }`，键是**页序**（从 0 起）。
 * @returns {{pages: Array<{from:number,to:number}>, total: number}}
 *   `total` 是全文行数（给界面显示「/ 共 N 行」）。
 */
export function paginateLines(text, opts = {}) {
  const lines = String(text == null ? "" : text).split(/\r?\n/);
  const total = lines.length;
  const per = Math.max(1, Math.round(Number(opts && opts.perPage)) || DESK_PER_PAGE);

  const pages = [];
  for (let from = 1; from <= total; from += per) {
    pages.push({ from, to: Math.min(total, from + per - 1) });
  }

  const ov = (opts && opts.overrides) || {};
  for (const key of Object.keys(ov)) {
    const i = Number(key);
    // 越界的键**安静丢掉**：存档里的页序可能来自一份已经被改短的文件。
    // 不丢的话 `pages[99] = …` 会在数组尾巴上造出一串空洞。
    if (!Number.isInteger(i) || i < 0 || i >= pages.length) continue;
    const r = ov[key];
    if (!r) continue;
    const a = clampLine(r.from, 1, total);
    const b = clampLine(r.to, a, total);
    pages[i] = { from: a, to: b };
  }

  return { pages, total };
}
