// #15 图片悬浮层 —— 浮窗引擎（floatwin.js）的图片前端。
//
// 和 #11 的代码块共用同一扇窗：点一下，把正文里的图整个搬进去，原位留一条占位条，
// 看完收回。通用部分全在 floatwin.js，这里只写「图」这件事本身要求的三处不同：
//
//   1. **标题栏写的是"这是哪张图、多大"**，不是"什么语言、几行"。
//      尺寸是**原图像素尺寸**，不是窗此刻的显示尺寸——用户想知道的是这张图有多大、
//      值不值得放大看，而不是自己被拖成了多少像素。所以它是静态的，拖角不改它。
//   2. **装得下就 1:1 开，装不下等比缩进来**。代码块可以"按最长一行定宽"（那是为了
//      不折行），图没有"一行"，它的天然尺寸就是它自己——所以小图的窗就是原图尺寸。
//      原图比视口大时按 maxFrac 缩到视口里，整张图一眼看得全，✕ 也留在屏幕里
//      （见 floatwin.js 的 defaultBox）。
//   3. **窗按图的形状拉，图在窗里铺满**。代码窗自由改宽高（折行与否是排版选择），
//      图拉变形就是坏了——所以这里锁原图比例（lockRatio），而且锁的是**内容盒**，
//      图再用 width:100%/object-fit:contain 铺满它（见 styles.js 与 imgzoom.js 开头）。
//      拖角只改窗，缩放比归滚轮/双击管，两者不互相干扰。
//   4. **标题栏有一组两档按钮**（1:1 原尺寸 / 适应窗口），代码窗没有——
//      代码块没有"按像素看"这回事，它的尺寸就是排版。这里只摆按钮，
//      换档做什么全在 imgzoom.js（见那边的「两档基准」）。
//
// 适用范围：只有全息面板的正文。卡面概念区、悬停浮层那两处的图不挂入口——那两块地方
// 本来就只有一两行，浮窗一开就把它整个盖住，帮倒忙。

import { EL } from "./dom.js";
import { openFloat, closeFloat, findFloat, refitFloat } from "./floatwin.js";
// naturalOf 住在 imgzoom.js（窗内缩放也全靠它），这里引过来用，别各写一份——
// "图有没有天然尺寸"这件事两处判断得不一致的话，会出现"读数说有、缩放说没有"。
import { bindImageZoom, naturalOf, IMG_MODES } from "./imgzoom.js";

// 内容盒（图片本身）的下限：再窄就看不清了。放大没有上限，只受视口约束。
const MIN_CONTENT_W = 160;
// 图还没 load 完就被点开时的兜底内容尺寸（16:9）。
// 绝大多数情况用不到——用户点到它的时候图早就显示在那儿了；但没有这条，
// naturalWidth 为 0 会让窗算成 0×0。
const FALLBACK = { w: 640, h: 360 };

/** 标题栏右端那个读数。窗里、aria-label 里都用它，两处必须是同一句话。 */
function sizeTextOf(img) {
  const n = naturalOf(img);
  return n ? n.w + "×" + n.h : "尺寸未知";
}

function nameOf(img) {
  const alt = String(img.getAttribute("alt") || "").trim();
  if (alt) return alt; // 有 alt 就用 alt——作者写的那句话比文件名有信息量
  const src = String(img.getAttribute("src") || "");
  // data: URI 没有"文件名"可言，它的整个 src 就是那张图本身——取末段会把
  // 几百上千字符的 SVG/PNG 原文塞进标题栏。宁可显示"图片"。
  if (!src || /^data:/i.test(src)) return "图片";
  const base = src.split("?")[0].split("#")[0].split("/").pop();
  if (!base) return "图片";
  try {
    return decodeURIComponent(base);
  } catch (e) {
    return base; // 文件名里带 % 之类解不开的，原文照用，不能因为取名失败就不显示
  }
}

/**
 * 搬谁：真宿主把 `![[图.png]]` 渲染成
 * `<span class="internal-embed media-embed image-embed"><img></span>`，
 * 光搬 <img> 会在正文里留下一个空壳包裹元素。所以往上一层看：外层若是个
 * **只为这张图存在**的嵌入壳，就整壳搬走。
 * `![](path)` 那种纯 markdown 图在两端都是裸 <img>，走不到这一步。
 *
 * 本仓没有任何地方记录过真宿主的 DOM 形状（web 端产的是裸 <img>），所以这里是
 * 按 Obsidian 的已知形态写的防御，不是照抄现成结论。
 */
function imageUnitOf(img) {
  const p = img.parentElement;
  if (!p || !p.classList) return img;
  if (!/internal-embed|media-embed|image-embed/.test(String(p.className))) return img;
  // 壳里还有别的图就只搬这一张，别把邻居也端走
  return p.querySelectorAll("img").length === 1 ? p : img;
}

/**
 * 渲染完成后在正文里挂悬浮入口。
 * 与 attachCodeFloats 一样，必须在 renderMarkdown 落地之后调用。
 */
export function attachImageFloats(ctx, box) {
  box.querySelectorAll("img").forEach((img) => {
    if (img._kbImgFloat) return; // 重入保护：同一个节点只挂一次
    img._kbImgFloat = true;
    img.classList.add("kb-v13-ifloat-src");
    // 键盘可达：Tab 到、Enter/Space 开合
    img.tabIndex = 0;
    img.setAttribute("role", "button");
    img.setAttribute("aria-expanded", "false");
    labelUnit(img);

    img.addEventListener("click", (e) => {
      // 图已经浮在窗里时，这一下归窗内的缩放/平移用——单击不该把窗收掉，
      // 否则双击放大（先来两次 click）会变成"关上再打开"，画面上是闪一下什么都没发生。
      if (findFloat(ctx, imageUnitOf(img))) return;
      // 图外面套着链接时（[![alt](图)](网址)）点击的本意可能是跳转，
      // 但既然我们接管了这一下，就别让它顺手把卡片跳掉——图先浮起来。
      const a = img.closest("a");
      if (a && a.hasAttribute("href")) e.preventDefault();
      toggleImageFloat(ctx, img);
    });

    img.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
      e.preventDefault(); // 别让空格顺带把正文滚走
      e.stopPropagation();
      toggleImageFloat(ctx, img);
    });

    // 挂入口这一刻还没载完的，才需要听"载完了"这件事。
    // 它管两种情形，所以只挂这一处、不在 openImageFloat 里再来一份：
    //   - 载完时窗还没开：只把 aria-label 补上；
    //   - 载完时窗已经开着（点得太快）：把默认盒子与读数一起补正。
    if (!naturalOf(img)) {
      const onReady = () => {
        labelUnit(img);
        if (img._kbPaintSize) img._kbPaintSize();
        // 窗重算之后图自己就填满新窗——倍数恒为 100%，没有"起始档"要另外补一次。
        const entry = findFloat(ctx, imageUnitOf(img));
        if (entry) refitFloat(ctx, entry, naturalOf(img));
      };
      img.addEventListener("load", onReady, { once: true });
      img.addEventListener("error", onReady, { once: true });
    }
  });
}

function labelUnit(img) {
  img.setAttribute("aria-label", "图片（" + nameOf(img) + "，" + sizeTextOf(img) + "）");
}

/**
 * 标题栏上那三个档位按钮。这里只摆、不管行为——按下去做什么在 imgzoom.js，
 * 那边照 data-imgmode 找按钮、自己接线（见 bindImageZoom 的「档位按钮」一节）。
 *
 * 分段控件的样子沿用顶栏「回忆 / 复习」那一套：挨在一起才读得出来是同一件事的两个状态。
 * 标签用短词（1:1 / 适应）是标题栏实在太窄——完整说法进 title，
 * 悬停能看到，键盘和读屏也拿得到。
 */
function modeGroup() {
  const g = EL("div", "kb-v13-ifloat-modes");
  g.setAttribute("role", "group");
  g.setAttribute("aria-label", "图片显示档位");
  IMG_MODES.forEach((m) => {
    const b = EL("button", "kb-v13-ifloat-mode-btn", m.label);
    b.type = "button";
    b.dataset.imgmode = m.id;
    b.title = m.title;
    b.setAttribute("aria-pressed", "false"); // 亮哪一档由 imgzoom.js 按当前状态刷
    g.appendChild(b);
  });
  return g;
}

function toggleImageFloat(ctx, img) {
  const entry = findFloat(ctx, imageUnitOf(img));
  if (entry) closeFloat(ctx, entry);
  else openImageFloat(ctx, img);
}

function openImageFloat(ctx, img) {
  const n = naturalOf(img);

  const name = EL("span", "kb-v13-ifloat-name");
  name.textContent = nameOf(img);
  name.title = name.textContent;

  // 尺寸读数是**原图**的，不是窗的：见文件头第 1 条。
  // 读数住在窗里、"载完了"这件事发生在节点上，中间隔着一次 openFloat，
  // 所以把重画这件事挂在节点上，让 attachImageFloats 的 onReady 找得到（同 _kbFloatSrc 的路子）。
  const size = EL("span", "kb-v13-ifloat-size");
  const paintSize = () => {
    size.textContent = sizeTextOf(img);
    size.title = naturalOf(img) ? "原图像素尺寸" : "图还没载入完";
  };
  paintSize();
  img._kbPaintSize = paintSize;

  // 缩放的百分比读数。和左边的原图尺寸是两个数、两件事：
  // 「960×540」说的是这张图是什么（恒不变），「100%」说的是现在显示成窗的几倍。
  // 基准是**填满窗**：拖角把窗拉大，图跟着变大，读数仍是 100%（见 imgzoom.js）。
  const zoom = EL("span", "kb-v13-ifloat-zoom");
  zoom.title = "滚轮缩放，100% = 当前档位下的初始大小；双击重置缩放、位移并回到「适应窗口」";

  // 档位按钮。行为在 imgzoom.js（它按 data-imgmode 找这几个按钮），
  // 这里只负责把它们摆在标题栏里、写清楚每个档叫什么。
  const modes = modeGroup();

  // 窗改尺寸时引擎会回调 onBox，但第一次 applyBox 发生在 openFloat 里面，
  // 那时缩放控制器还没建出来（它要拿到 entry 才能建）。用这个引用把两头接上：
  // 建好之前回调空转，建好之后正常转达。
  let ctrl = null;

  const entry = openFloat(ctx, {
    cls: "kb-v13-ifloat",
    unit: imageUnitOf(img),
    barItems: [name, modes, size, zoom],
    onBox: () => {
      if (ctrl) ctrl.onBox();
    },
    // 收回前把图上的内联宽高与 transform 还原（见 imgzoom.js 的 onClose）
    onClose: () => {
      if (ctrl) ctrl.onClose();
    },
    closeTitle: "收回图片",
    ariaLabel: "图片悬浮窗",
    // 同一个动作在两处叫同一个名字（占位条按钮 =「收回」，窗口关闭 =「收回图片」）
    slotText: "图片已移到悬浮窗",
    // 零内边距：窗减去标题栏之后**就是**图片本身。锁比例缩放算的就是这个盒子，
    // 多一层内边距就得多算一层，比例迟早会差出几个像素的留白。
    pad: { x: 0, y: 0 },
    minContent: MIN_CONTENT_W,
    // 尺寸未知时不锁——锁一个猜出来的比例只会更歪。但"晚一步会知道"这件事要告诉引擎，
    // 它好在图载完时把比例补上（见 floatwin.js 的 refitFloat）。
    lockRatio: true,
    ratio: n ? n.w / n.h : null,
    // 只锁比例的那类窗没有"窗宽下限"这个概念（下限是内容盒定的），
    // 但比例还空着的那一小段走的是自由缩放那条路，得给它一个，否则 NaN。
    minW: MIN_CONTENT_W,
    // 默认最多占视口这么大。留白是给左右两侧的卫星卡的：浮窗是"拿起来看"的工具，
    // 不该开到把整颗晶体都盖没——顺带也就把大图缩进了屏幕。
    maxFrac: { w: 0.8, h: 0.75 },
    measure: () => naturalOf(img) || FALLBACK,
  });

  ctrl = bindImageZoom(ctx, entry, img, {
    fallback: FALLBACK,
    onChange: (z) => {
      zoom.textContent = Math.round(z * 100) + "%";
    },
  });
}
