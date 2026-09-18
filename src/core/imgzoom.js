// #16 图片窗内的缩放与平移。
//
// ---- 谁定尺寸：窗按图的形状拉，图在窗里**铺满** ----
//
// 这是这一版的骨架，也是唯一一处不能含糊的分工：
//
//   窗的**形状**跟着图走     floatwin.js 按原图宽高比锁死内容盒（lockRatio）
//   图的**尺寸**跟着窗走     图是 width:100%;height:100%（styles.js），窗多大就铺多满
//   手动缩放只乘一个倍数     transform 只干这一件事；不拧滚轮时它是 none
//
// 所以**没拧滚轮时走的是浏览器原生布局**，和"还没有缩放功能"那一版是同一条路：
// 打开一张 960×540 的图，窗按 960×540 开，图正好铺满它，一个图素对一屏幕像素。
//
// 反过来的写法试过，不对：把图按原图像素摆好、再用 JS 算出的比例 transform 到窗上，
// 那样"100%"是我算出来的一个近似值，不是浏览器摆出来的事实。窗一改尺寸、或者量到的
// 是取整后的 clientWidth，对不上的那几个像素就得靠算补——算出来的东西迟早跟眼睛
// 差一丝。现在这条路上没有一处是我算的比例尺：**尺寸由 CSS 给，transform 只乘倍数**。
//
// **缩放是相对的：100% = 本档基准的大小**。不改成绝对读数（显示像素 ÷ 原图像素）是因为
// 适应档里拖一下窗就会出来小数（100% 变 83%），而"拖窗不该改变任何读数"是专门修过的
// 行为。想知道现在是不是在看真实像素，看哪一档亮着就够了。
//
// 与拖角改窗的分工：窗是基准、倍数是乘在基准上的，所以窗一变图就跟着变（适应档），
// 读数一动不动。两个数各说各的：左边「960×540」说这张图是什么，右边「100%」说现在多大。
//
// ---- 两档基准（标题栏那两个按钮）----
//
// 档位换的是**图的尺寸还跟不跟着窗走**：
//
//   适应窗口    跟窗走。图铺满窗（width:100%，原生布局），窗缩到装进视口——
//               整张图永远都在窗里，拖角改窗时图跟着窗一起缩放。
//               这一档就是没有缩放功能那一版的行为，也是开窗与双击回的那一档。
//   1:1 原尺寸  不跟。图按**原图像素**摆，窗怎么变都不动它。图比窗大就推动着
//               看四角——这一档要的就是"看见真实像素"。
//
// 换句话说，「图铺满窗」只在适应档成立，1:1 那一档不成立。那是它的全部意义：
// 两档里总得有一档是在看真实像素的，否则放大就只剩"看得更大"，
// 再也回答不了"这个细节到底几个像素"。
//
// 双击 = 回到**开窗时那个状态**：切回「适应窗口」、倍数归 1、画面对中。
// 它是迷路之后唯一的出路，所以回的是"初始"，不是"在当前档上归零"——
// 在任何一档放大乱了，双击两下都一样回到整张图看得全的样子。

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
// 显示尺寸上限。倍数是相对窗算的，所以"能不能再放大"要先把它折回像素看：
// 3000px 的图放大 8 倍 = 24000px 的图层，那吃的是浏览器的显存，不是我们的界面。
// 按最长边最多显示到 8000px 封。
const MAX_DISPLAY_PX = 8000;
// 图还没载完时的兜底尺寸，与 imagefloat.js 保持一致
const FALLBACK = { w: 640, h: 360 };
// 滚轮灵敏度。鼠标一格 deltaY 约 100（≈ 每格 16%），触摸板是小增量连发，
// 指数映射让两者都顺：增量小就微调，增量大连着放大。
const WHEEL_K = 0.0015;
// 两档基准。id 写在按钮的 data-imgmode 上：按钮由 imagefloat.js 摆，
// 行为在这儿接（同一个文件里既要能调 setMode、又要能读到当前档）。
export const MODE_FIT = "fit";
export const MODE_ACTUAL = "actual";
// 开窗时的档，也是双击回得去的那一档。顺序即标题栏从左到右的顺序。
export const DEFAULT_MODE = MODE_FIT;
export const IMG_MODES = [
  {
    id: MODE_ACTUAL,
    label: "1:1",
    title: "100% 原尺寸：一个图素对一个屏幕像素，拖动窗口也不缩放这张图，比窗口大就推着看",
  },
  {
    id: MODE_FIT,
    label: "适应",
    title: "适应窗口：整张图都在窗里，拖动窗口时图跟着窗一起缩放",
  },
];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 图还没载入完时 naturalWidth 是 0，这里统一成"知道 / 不知道"两种答案。 */
export function naturalOf(img) {
  const w = img.naturalWidth | 0;
  const h = img.naturalHeight | 0;
  return w > 0 && h > 0 ? { w, h } : null;
}

/**
 * 把缩放/平移接到一扇已经开好的图片窗上。
 *
 * @param {object} ctx
 * @param {object} entry       floatwin.js 的 openFloat 返回值
 * @param {HTMLImageElement} img 被搬进窗里的那张图
 * @param {object} [opts]
 * @param {{w:number,h:number}} [opts.fallback] 图未载入时的兜底尺寸
 * @param {(zoom:number, base:{w:number,h:number}) => void} [opts.onChange] 每次重画后回调（画百分比读数用）
 * @returns {{onBox: () => void, onClose: () => void, zoom: () => number,
 *            base: () => {w:number,h:number},
 *            setMode: (m: string) => void, mode: () => string}}
 *          onBox 供引擎在窗改尺寸时调；setMode 换档，给测试与截图脚本留的一条不走点击的路
 */
export function bindImageZoom(ctx, entry, img, opts = {}) {
  const body = entry.body;
  const fallback = opts.fallback || FALLBACK;
  const notify = opts.onChange || (() => {});
  // fx / fy：窗中心正对着图上的哪一点（0 = 最左/最上，1 = 最右/最下）。
  //
  // 平移量存**比例**而不是像素，是这套相对缩放里唯一一处容易写错的地方：
  // 存像素的话，窗一改尺寸（图跟着窗缩放），同一个像素值所指的位置就变了，
  // 画面会莫名其妙地滑向一边。存比例，窗和图就真的一起缩放了。
  //
  // base 是**本档 100% 时图有多大**（见文件头两档）：适应档里就是窗的内容盒，
  // 另外两档恒为原图像素。它是"倍数乘上去的那个底"，也是居中与夹取要用的尺寸。
  const st = { mode: DEFAULT_MODE, zoom: 1, base: { w: 0, h: 0 }, fx: 0.5, fy: 0.5 };

  // <img> 天生是**可拖拽元素**：按住一拖，浏览器会开始一次原生拖放（拖着半透明的
  // 图走），而原生拖放一启动就会把 pointer 事件掐掉（pointercancel）。
  // 表现是"只推得动一格，然后就卡住"——平移推到一半就没了。
  // 关掉它的原生拖拽，平移才归我们管（CSS 那份 -webkit-user-drag 只管 Chrome，
  // 这个属性是标准写法，Electron 与 Firefox 都认）。
  img.draggable = false;

  // 我们接下来要往这个节点上写内联宽高与 transform（每帧都写）。
  // 先把它**自己原来有的**那三行记下来，收回时按原样还回去——见下面 onClose。
  const before = {
    width: img.style.width,
    height: img.style.height,
    transform: img.style.transform,
  };

  const natural = () => naturalOf(img) || fallback;

  // ---- 档位按钮 ----
  // 按钮由 imagefloat.js 摆进标题栏（那边管"长什么样"，这里管"按下去做什么"）。
  // 标题栏上的 button 不会被当成拖动起点（见 floatwin.js 的 bindDrag），
  // 所以按档位不会顺手把窗拖走。声明必须赶在第一次 paintMode 之前——
  // 它是 const，晚一步就是 TDZ 报错。
  const modeBtns = [...entry.bar.querySelectorAll("[data-imgmode]")];
  modeBtns.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.imgmode)));

  /**
   * 倍数上限。基准（100%）在图上是多少像素，得先看 st.base——
   * 同一张 3000px 的图，在手机上和在大屏上，"放大 8 倍"是两件事。
   */
  function maxZoom() {
    const base = Math.max(st.base.w, st.base.h);
    if (!(base > 0)) return MAX_ZOOM; // 还没量出窗的尺寸，先给个名义上限
    return Math.max(1, Math.min(MAX_ZOOM, MAX_DISPLAY_PX / base));
  }

  /**
   * 本档 100% 时图有多大——**图的布局尺寸**。
   *
   * 适应档 = 窗的内容盒：尺寸**不在这里写死**，交给 CSS 的 width:100%/height:100%
   * 去铺（styles.js），这里只把数报出来供居中、夹取、算上限用。窗一改尺寸，图自己
   * 就跟着铺满了，中间不经过我们算的任何比例。
   *
   * 1:1 档 = 原图像素：这一档拿真实像素说话，尺寸要是跟着窗走，它就跟适应档没区别了。
   */
  function baseSize(bw, bh, n) {
    return st.mode === MODE_ACTUAL ? { w: n.w, h: n.h } : { w: bw, h: bh };
  }

  function render() {
    const n = natural();
    const bw = body.clientWidth;
    const bh = body.clientHeight;
    // 还没上树 / 还没量出尺寸的这一小段什么都不做。
    // 硬算的话基准会是 0 或负数，缩放比当场变成 NaN。
    if (bw <= 0 || bh <= 0) return;
    st.base = baseSize(bw, bh, n);
    const dw = st.base.w * st.zoom;
    const dh = st.base.h * st.zoom;
    // 装得下就居中（本来也没有可推的余地）；装不下才允许推，且推不出图外。
    // 居中而不是停在原处，是为了"缩回去"这件事看起来是缩回去，而不是缩到某个角上。
    const halfX = dw > 0 ? bw / 2 / dw : 0.5;
    const halfY = dh > 0 ? bh / 2 / dh : 0.5;
    st.fx = dw <= bw ? 0.5 : clamp(st.fx, halfX, 1 - halfX);
    st.fy = dh <= bh ? 0.5 : clamp(st.fy, halfY, 1 - halfY);
    // 尺寸：适应档**一个内联宽高都不写**，交回 CSS 的 width:100%（见文件头那条分工）。
    // 只有 1:1 档才写死原图像素。
    if (st.mode === MODE_ACTUAL) {
      img.style.width = n.w + "px";
      img.style.height = n.h + "px";
    } else {
      img.style.width = "";
      img.style.height = "";
    }
    // transform 只承担**手动缩放**。基准态（倍数 1、正中对齐）下它是 none——
    // 图就是浏览器按上面那条 CSS 摆出来的，中间没有一层缩放。这就是"和没有缩放
    // 功能那一版完全一致"在代码里的落点，也是这条量具（测试）盯着的那个点。
    //
    // 缩放态才动 transform 而不是改 width/height：改 width 会触发布局，
    // 改 transform 不会，滚轮连发时才跟得住。
    const tx = bw / 2 - st.fx * dw;
    const ty = bh / 2 - st.fy * dh;
    img.style.transform =
      st.zoom === 1 && Math.abs(tx) < 0.01 && Math.abs(ty) < 0.01
        ? "none"
        : "translate(" + tx + "px," + ty + "px) scale(" + st.zoom + ")";
    body.classList.toggle("kb-v13-ifloat-pannable", dw > bw + 0.5 || dh > bh + 0.5);
    notify(st.zoom, st.base);
  }

  /**
   * 以窗内某一点为中心缩放。cx/cy 是**相对窗**的坐标。
   *
   * 算法只有一句话：光标底下那个像素，缩完还在光标底下。
   * 少了这一步，放大就总是从图片中心长出去，想看的那个角落会越放越跑。
   *
   * 算的是"那一点在整张图里的相对位置"（u/v），不是像素差：换了基准之后
   * 像素差会跟着变，相对位置不会。
   */
  function zoomTo(cx, cy, target) {
    const z2 = clamp(target, MIN_ZOOM, maxZoom());
    if (!(z2 > 0) || Math.abs(z2 - st.zoom) < 1e-6) return;
    const bw = body.clientWidth;
    const bh = body.clientHeight;
    if (bw <= 0 || bh <= 0 || !(st.base.w > 0)) return;
    const dw = st.base.w * st.zoom;
    const dh = st.base.h * st.zoom;
    const u = st.fx + (cx - bw / 2) / dw;
    const v = st.fy + (cy - bh / 2) / dh;
    st.zoom = z2;
    st.fx = u - (cx - bw / 2) / (st.base.w * st.zoom);
    st.fy = v - (cy - bh / 2) / (st.base.h * st.zoom);
  }

  /**
   * 双击回到**开窗时那个状态**：初始档 + 倍数归 1 + 画面对中。
   *
   * 这是放大到一半迷路之后唯一的出路，所以它回的是"初始"而不是"在当前档上归零"：
   * 在 1:1 档里推乱了，双击照样回到整张图看得全的样子，不必先想清楚自己现在在哪一档。
   * 平移量一并归中——"双击之后不保留之前的偏移"，偏移指的就是倍数和位移两样。
   *
   * 只重置视图，**不动窗**：窗的大小是用户拿右下角抓角摆出来的，
   * 双击一下就替他把窗缩回去，那是替他做决定。
   */
  function resetView() {
    st.mode = DEFAULT_MODE;
    st.zoom = 1;
    st.fx = 0.5;
    st.fy = 0.5;
    paintMode();
    render();
  }

  /**
   * 换档。换的是**基准本身**，倍数归 1、画面对中。
   *
   * 不把倍数带过去是有意的：从放大到 200% 的适应档切到 1:1 档，要是把那个 2 一起带过去，
   * 得到的是个"放大两倍的原尺寸"，读数还写着 200%——用户按的是"看真实像素"，
   * 却得到一个放大两倍的原尺寸，谁也算不清自己在哪儿。
   */
  function setMode(m) {
    if (m === st.mode) return;
    if (!IMG_MODES.some((x) => x.id === m)) return;
    st.mode = m;
    st.zoom = 1;
    st.fx = 0.5;
    st.fy = 0.5;
    paintMode();
    render();
  }

  /** 把"现在在哪一档"写到按钮上。找不到按钮不算错——档位是行为，按钮只是它的脸。 */
  function paintMode() {
    modeBtns.forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.imgmode === st.mode))
    );
  }

  // ---- 滚轮 ----
  body.addEventListener(
    "wheel",
    (e) => {
      // 别让页面/卡片跟着滚。非 passive 是被动监听器里唯一能 preventDefault 的写法，
      // 少了它浏览器会把这次滚轮当页面滚动处理，图和页面一起动。
      e.preventDefault();
      e.stopPropagation();
      // deltaMode：0=像素 1=行 2=页。只按像素算的话，行模式的鼠标一格只有 3，
      // 指数映射下约等于没反应。先按当前窗高换算成像素再算。
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? body.clientHeight : 1;
      const r = body.getBoundingClientRect();
      zoomTo(
        e.clientX - r.left,
        e.clientY - r.top,
        st.zoom * Math.exp(-e.deltaY * unit * WHEEL_K)
      );
      render();
    },
    { passive: false }
  );

  // ---- 双击 ----
  // 双击 = 重置所有手动缩放（倍数与平移都归零，并切回开窗时那一档），
  // 不是"在 100% 和 200% 之间切"——放大迷路之后要的是回家，不是再放大一倍。
  body.addEventListener("dblclick", (e) => {
    e.preventDefault();
    resetView();
  });

  // ---- 拖动平移 + 双指捏合 ----
  // 用 Pointer Events：鼠标、笔、手指走同一条路，setPointerCapture 之后
  // 指针移出窗也照样收得到 move。
  const pointers = new Map();
  let pan = null; // 单指：{ x, y, fx, fy }
  let pinch = null; // 双指：{ dist, mx, my }

  function syncGesture() {
    const pts = [...pointers.values()];
    if (pts.length >= 2) {
      pinch = { dist: between(pts[0], pts[1]), mx: (pts[0].x + pts[1].x) / 2, my: (pts[0].y + pts[1].y) / 2 };
      pan = null;
    } else if (pts.length === 1) {
      pan = { x: pts[0].x, y: pts[0].y, fx: st.fx, fy: st.fy };
      pinch = null;
    } else {
      pan = null;
      pinch = null;
    }
  }

  body.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return; // 只认左键
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      body.setPointerCapture(e.pointerId);
    } catch (err) {
      /* 合成事件拿不到捕获，退化成普通监听也能用 */
    }
    syncGesture();
  });

  body.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.values()];
    const r = body.getBoundingClientRect();
    // 位移换算成"图上挪了几个百分点"：向右拖 dx，窗中心对着的那一点就往左走。
    // 图此刻铺多大 = st.base × 倍数（适应档里 base 就是窗的内容盒）。
    const dw = st.base.w * st.zoom;
    const dh = st.base.h * st.zoom;

    if (pinch && pts.length >= 2 && dw > 0 && dh > 0) {
      const dist = between(pts[0], pts[1]);
      const mx = (pts[0].x + pts[1].x) / 2;
      const my = (pts[0].y + pts[1].y) / 2;
      if (pinch.dist > 0) zoomTo(mx - r.left, my - r.top, st.zoom * (dist / pinch.dist));
      // 两指整体挪动 = 平移：捏合只管缩放，同时进行的位移另算，两个手势能叠加。
      // 注意这里要在 zoomTo 之后重新取 dw/dh——缩放改过基准了。
      st.fx -= (mx - pinch.mx) / (st.base.w * st.zoom);
      st.fy -= (my - pinch.my) / (st.base.h * st.zoom);
      pinch = { dist, mx, my };
      render();
      return;
    }

    if (!pan || !(dw > 0) || !(dh > 0)) return;
    st.fx = pan.fx - (e.clientX - pan.x) / dw;
    st.fy = pan.fy - (e.clientY - pan.y) / dh;
    render();
  });

  const release = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    try {
      body.releasePointerCapture(e.pointerId);
    } catch (err) {
      /* 同上 */
    }
    syncGesture();
  };
  body.addEventListener("pointerup", release);
  body.addEventListener("pointercancel", release);

  // ---- 出生 ----
  // 恒从初始档的 100% 起。窗那边按"装得下就 1:1、装不下缩进视口"开好了
  // （见 floatwin.js 的 defaultBox），适应档的基准态就是图正好**铺满**它——
  // 一打开整张图看得全，也正好是双击回得来的那一档。
  st.mode = DEFAULT_MODE;
  st.zoom = 1;
  paintMode();
  render();

  return {
    /**
     * 窗改尺寸了（拖右下角 / 视口变小重夹 / 图晚一步载完）。
     * **只重算基准、不碰倍数**：读数一动不动，平移量存的是比例，画面也不会滑向一边。
     *
     * 图跟不跟着窗变，是档位说了算——适应档里尺寸压根不在 JS 手上（CSS width:100%），
     * 窗一变图自己就铺满了；1:1 那一档钉在原图像素上，窗怎么变图都不动。
     * 图晚一步载完也走这条路，不需要额外补一次起始档。
     */
    onBox() {
      render();
    },
    /**
     * 收回前把节点还原。浮窗期间我们往图上写过内联宽高与 transform
     * （1:1 档的像素宽高、缩放态的位移），不清掉的话它回到正文里还带着浮窗里的
     * 尺寸和位移——正文那么窄，图会被压扁、还错位到一边（实测：1710×706 变成
     * 333×587、左边跑到 554px）。适应档没拧滚轮时这两样本来就是空的，还原是无操作。
     *
     * 还原的是**它自己原来有的**那份内联样式，不是一律清空：真宿主会给嵌入图写
     * width（`![[图|300]]` 那种带尺寸的嵌入），清空等于把宿主设的宽度也抹掉。
     */
    onClose() {
      img.style.width = before.width;
      img.style.height = before.height;
      img.style.transform = before.transform;
    },
    zoom: () => st.zoom,
    /** 本档 100% 时图多大（适应档 = 窗的内容盒，1:1 档 = 原图像素） */
    base: () => st.base,
    /** 换档（标题栏那两个按钮）。给测试与截图脚本用，也留一条不走点击的路。 */
    setMode,
    mode: () => st.mode,
  };
}

function between(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
