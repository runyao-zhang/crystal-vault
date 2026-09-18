// Phase 1：晶体环 + 展开/收缩 + #7 选中高亮相连晶体。
//
// ⚠️ 3.0 刀 1：晶体与连线挂的是 `ctx.canvas`（世界层），**不是 `ctx.stage`**。
// stage 剩下的是视口本身与那几件不跟着画面缩放的 UI（翻页箭头、选中提示）。
//
// 这个文件的查询一律还用 `stage.querySelectorAll(...)` 找晶体——那是**后代**查询，
// canvas 是 stage 的子节点，照样命中，所以那些一处都不用改。
// 但**挂载**必须挂 canvas：晶体搬了、连线 SVG 没搬的话，两端坐标会落在两个
// 不同的坐标系里——`drawCrystalLinks` 用的是 `offsetLeft/offsetTop`，那是**布局值、
// 不受祖先 transform 影响**，于是 identity 变换下一切正常，一平移缩放就错位，
// **而且不报错**。这类坏法是本文件里最贵的一种，改挂载点时把五处一起改。

import { EL, esc, hsl, truncate, svgEl } from "./dom.js";
import {
  CRYSTAL_SIZE,
  SUB_CRYSTAL_SIZE,
  CRYSTAL_FOCUS_ZOOM,
  levelRegions,
  facetGrid,
  cardScale,
} from "./layout.js";
import { byFileName } from "./model.js";
import { bindScrollListeners, renderRingCards, maxScrollOffset } from "./cardgrid.js";
// stage.js 不 import 本文件，这条边是单向的，不会绕成环。
import { resetLevelStage } from "./stage.js";

const SELECT_HINT_ENTER = "再点一次进入";

/**
 * 建一颗晶体元素。圆环、侧栏、背景三处共用同一份——一处改了另外两处跟着变，
 * 孤儿徽章、色相、呼吸相位、点击语义都只有一份实现。
 *
 * @param {number} size 六边形边长。侧栏那颗小一圈（SUB_CRYSTAL_SIZE）。
 * @param {number} index 只用来错开呼吸动画的相位，避免整屏一起闪
 */
export function makeCrystalEl(ctx, key, size, index) {
  const { model } = ctx;
  const fCol = model.colorOf(key);
  const hexW = size;
  const hexH = size;

  const el = EL("div", "kb-v13-crystal");
  el.dataset.key = key;
  el.style.width = hexW + "px";
  el.style.height = hexH + "px";
  el.style.clipPath = "none";
  el.style.background = "transparent";
  el.style.border = "none";
  el.style.boxShadow = "none";
  el.style.filter = "none";

  const h = hexW / 2;
  const q = hexW / 4;
  const tq = (hexW * 3) / 4;
  const dur = (2.4 + Math.random() * 1.6).toFixed(2);
  const i = index;
  const svgBody =
    '<svg viewBox="0 0 ' + hexW + " " + hexW + '" style="position:absolute;inset:0;pointer-events:none;overflow:visible">' +
    '<polygon points="' + h + ',-10 ' + (hexW + 10) + "," + q + " " + (hexW + 10) + "," + tq + " " + h + "," + (hexW + 10) + " -10," + tq + " -10," + q +
    '" fill="none" stroke="hsla(' + fCol.hue + ',80%,55%,0.08)" stroke-width="6">' +
    '<animate attributeName="opacity" values="0.03;0.12;0.03" dur="' + dur + 's" repeatCount="indefinite" begin="' + i * 0.25 + 's"/>' +
    "</polygon>" +
    '<polygon points="' + h + ',-4 ' + (hexW + 4) + "," + q + " " + (hexW + 4) + "," + tq + " " + h + "," + (hexW + 4) + " -4," + tq + " -4," + q +
    '" fill="none" stroke="hsla(' + fCol.hue + ',80%,55%,0.15)" stroke-width="3">' +
    '<animate attributeName="opacity" values="0.05;0.20;0.05" dur="' + dur + 's" repeatCount="indefinite" begin="' + i * 0.25 + 's"/>' +
    "</polygon>" +
    '<polygon points="' + h + ",0 " + hexW + "," + q + " " + hexW + "," + tq + " " + h + "," + hexW + " 0," + tq + " 0," + q +
    '" fill="none" stroke="hsla(' + fCol.hue + ',80%,60%,0.4)" stroke-width="1.5"/>' +
    '<polygon points="' + h + ",0 " + hexW + "," + q + " " + hexW + "," + tq + " " + h + "," + hexW + " 0," + tq + " 0," + q +
    '" fill="rgba(8,20,45,0.85)" stroke="hsla(' + fCol.hue + ',80%,60%,0.22)" stroke-width="1"/>' +
    '<polygon points="' + h + "," + (q - 5) + " " + (q + 15) + "," + (q + 5) + " " + (q + 15) + "," + (tq - 5) + " " + h + "," + (tq + 5) + " " + (q - 15) + "," + (tq - 5) + " " + (q - 15) + "," + (q + 5) +
    '" fill="hsla(' + fCol.hue + ',80%,60%,0.04)" stroke="none">' +
    '<animate attributeName="opacity" values="0.01;0.06;0.01" dur="' + dur + 's" repeatCount="indefinite" begin="' + i * 0.25 + 's"/>' +
    "</polygon>" +
    "</svg>";

  // 「N cards」报的是**子树**总数，不是直属卡数：钻进 Python 这一层时，
  // 它自己没有直属卡，但底下有 5 张——那颗六边形上写 0 会是句错话。
  // 扁平库下子树 == 直属，与改动前逐字相同。
  const count = model.subtreeCount([key]);

  el.innerHTML =
    svgBody +
    '<div class="kb-v13-ripple"></div>' +
    '<div class="kb-v13-orbit"></div>' +
    '<div class="kb-v13-burst"></div>' +
    '<div class="kb-v13-hex-inner" style="width:' + hexW + "px;height:" + hexH + 'px;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)">' +
    '<div class="kb-v13-crystal-icon" style="color:hsla(' + fCol.hue + ',70%,50%,.4)">◆</div>' +
    '<div class="kb-v13-crystal-name">' + esc(fCol.name) + "</div>" +
    '<div class="kb-v13-crystal-count">' + count + " cards</div>" +
    "</div>";

  el.addEventListener("click", (e) => {
    e.stopPropagation();
    crystalClicked(ctx, key);
  });
  // 侧栏里那几颗是层内的入口，钻进状态也要有悬停反馈——否则唯一能继续
  // 往里走的东西看起来像块背景板。环上没被进入的那几颗照旧不做（它们在背景里）。
  const isSub = () => el.classList.contains("kb-v13-crystal-sub");
  el.addEventListener("mouseenter", () => {
    if (!ctx.state.openCrystal || isSub()) {
      el.style.transform = "translateY(-8px) scale(1.06)";
      el.style.zIndex = "100";
      el.style.filter = "drop-shadow(0 0 12px hsla(" + fCol.hue + ",80%,60%,0.4))";
    }
  });
  el.addEventListener("mouseleave", () => {
    if (isSub() || !ctx.state.openCrystal || ctx.state.openCrystal !== key) {
      el.style.transform = "";
      el.style.zIndex = "";
      el.style.filter = "";
    }
  });

  // #20：晶体上**不再挂**孤岛徽章。它常驻在环上，而多层之后子树聚合会让
  // 整条祖先链一起亮红点——大片红点说的是同一件事，大部分时间没人关心。
  // 孤岛现在只在顶栏那份汇总里（orphans.js），按需展开。

  return el;
}

/** 把一颗晶体摆到舞台的某个位置（同时记下「家」在哪，收缩时靠它归位） */
export function placeCrystal(el, x, y) {
  el.dataset.homeX = x;
  el.dataset.homeY = y;
  el.style.left = x + "px";
  el.style.top = y + "px";
}

/**
 * 画晶体层。**这是整个舞台唯一的分发点**（3.0 刀 2 起）。
 *
 * 画什么由两件事共同决定，而且它们的层级不一样：
 *   - `crystalPath` 空不空 —— **权威**：在根层还是在某颗晶体里。
 *   - `state.stage` —— 只在各自的作用域里挑具体那一档：根层 ring/canvas，
 *     层内 grid/storyline。
 *
 * 为什么不用 `state.stage` 一个值决定全部：它是**推导出来的**（见 stage.js），
 * 万一它与 crystalPath 不同步（比如进层那一刻还没重算），拿它决定「画根层还是
 * 画层内」就会出现「钻进晶体了却在画布上」。让 crystalPath 管那件事，
 * state.stage 只管作用域内部，就不会有这种错。
 */
/**
 * 清掉故事线画在舞台上的东西（卡片节点 + 连线层）。
 *
 * 抽出来是因为它有**两个**调用点，而第二个是踩出来的：renderCrystals 整屏重建时
 * 当然要清（原来那两行就在那儿），但 collapseCrystal 里还有一条**不重画**的快速
 * 路径（从环上进一颗顶层叶子，为了保住老的飞回动画）。那条路原来只清
 * `gridStage.innerHTML` 和 cardsArea 的 open——对卡阵够用，因为卡片住在 cardsArea 里；
 * 而故事线节点直接挂在世界层上，**没人清**。
 *
 * 表现（用户报的）：故事线里点面包屑「‹ 返回」，回到环上，相机被撤走（transform 清空），
 * 那批节点就按**世界坐标原样**摊在屏幕上——而它们的 y 是 0 附近，于是
 * 「所有卡片都堆在顶部」，还挡着底下的晶体。
 * 这种错不报任何异常，只能靠「退层时把世界层清干净」这条纪律堵住。
 */
export function clearStoryLayers(ctx) {
  const { stage } = ctx;
  stage.querySelectorAll(".kb-v13-snode").forEach((el) => el.remove());
  stage.querySelectorAll(".kb-v13-slinks").forEach((el) => el.remove());
  stage.querySelectorAll(".kb-v13-shandles").forEach((el) => el.remove());
  // 连线层的引用也一起作废：元素没了，引用还留着的话下一帧会往一棵摘下来的树上挂
  ctx._sLink = null;
  ctx._sHandle = null;
}

export function renderCrystals(ctx) {
  // 先把显示模式同步一次再读它。这一句是**唯一的同步点**：所有改 openCrystal
  // 的地方（钻进 / 退层 / 恢复 / 关库）最后都会走到这里重画，于是状态永远对得上。
  // 靠「改了记得手动同步」的约定迟早会漏一处，而漏了的表现是
  // 「退到环上了但画布还在」——只在特定操作顺序下复现。
  if (ctx.syncStage) ctx.syncStage();

  const { stage, state } = ctx;
  const path = Array.isArray(state.crystalPath) ? state.crystalPath : [];
  const stageRect = stage.getBoundingClientRect();

  // 清场。**每加一种画在舞台上的东西，这里就要多一条**——
  // 漏了的表现是「换了档之后上一层的东西还留在屏幕上」，
  // 而且它们多半还带着自己的点击监听，看着像「点了跳到别的层去了」。
  stage.querySelectorAll(".kb-v13-crystal").forEach((el) => el.remove());
  stage.querySelectorAll(".kb-v13-card").forEach((el) => el.remove());
  clearStoryLayers(ctx);

  // 两个 ctx 回调都**不写 `if (ctx.xxx)`**：它们总是被接上的，那种防御性写法
  // 唯一的实际效果是把「线没接」降级成「什么都不发生」。这一刀第一版就是这么
  // 把画布模式整个吞掉的（见 stage.js 里那段注释）。
  if (path.length) {
    if (state.stage === "storyline") ctx.renderStorylineStage(ctx, path);
    else renderLevel(ctx, stageRect, path);
  } else if (state.stage === "canvas") {
    ctx.renderCanvasStage(ctx);
  } else {
    renderRing(ctx, stageRect);
  }

  // 方框层（3.0 刀 4）。它自己判断该不该画——非画布档里清空。
  // 放在晶体**后面**调：方框要衬在晶体底下，DOM 顺序与显式 z-index 两条一起保证。
  ctx.renderModules();

  // 重渲染后把选中态与连线补回来（resize / 展开回退都会走到这）
  if (ctx.state.selectedCrystal) selectCrystal(ctx, ctx.state.selectedCrystal);
}

/** 根层的圆环。改动前就是这一段，只是换了名字。 */
function renderRing(ctx, stageRect) {
  const { canvas, model } = ctx;
  const keys = model.crystalKeys;
  const count = keys.length;
  const W = stageRect.width;
  const H = stageRect.height;

  const centerX = W / 2;
  const centerY = H / 2;
  const radius = Math.min(W, H) * 0.28;

  keys.forEach((key, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const rx = centerX + Math.cos(angle) * radius - CRYSTAL_SIZE / 2;
    const ry = centerY + Math.sin(angle) * radius - CRYSTAL_SIZE / 2;
    const el = makeCrystalEl(ctx, key, CRYSTAL_SIZE, i);
    placeCrystal(el, rx, ry);
    canvas.appendChild(el);
  });
}

/**
 * 钻进之后的层：当前节点沉到中间当背景，子层铺开。
 *
 * 子层铺法分两种（#21）：
 *   - 这一层**有子文件夹** → 左右两栏：晶体铺左边那一栏、卡片在右边那一栏，
 *     按左右键在两档宽度之间切（`state.facetFocus`）。
 *   - 这一层**没有子文件夹**（叶子晶体，扁平库里全是这种）→ 不切两栏，
 *     卡阵照旧占满整个舞台。老路径一字未动。
 */
function renderLevel(ctx, stageRect, path) {
  const { canvas, model, state } = ctx;
  const W = stageRect.width;
  const H = stageRect.height;
  const key = path[path.length - 1];

  // 背景那颗。尺寸/位置交给 applyExpanded 撑开——它已经会按 data-key 找到这一颗，
  // 所以这里只要把它摆在场中央、量个原始尺寸即可，撑开逻辑不必写第二份。
  if (model.hasNode(key)) {
    const bg = makeCrystalEl(ctx, key, CRYSTAL_SIZE, 0);
    bg.classList.add("kb-v13-crystal-bg");
    bg.style.left = W / 2 - CRYSTAL_SIZE / 2 + "px";
    bg.style.top = H / 2 - CRYSTAL_SIZE / 2 + "px";
    canvas.appendChild(bg);
  }

  const kids = model.keysAt(path);
  // 两栏的几何存在 state 上：applyExpanded 要用它摆卡阵，而它拿不到 stageRect 之外的东西
  state.facetRegions = kids.length ? levelRegions(W, H, state.facetFocus) : null;

  if (!kids.length) return;

  if (kids.length > MAX_SIDE_CRYSTALS) {
    // 不静默截断：摆不下的那几层用户是看不见的，得说出来。
    console.warn(
      "[ari-crystal] 这一层有 " + kids.length + " 个子文件夹，只摆得下 " +
        MAX_SIDE_CRYSTALS + " 颗，其余暂时看不到"
    );
  }
  const shown = kids.slice(0, MAX_SIDE_CRYSTALS);
  // 「晶体为主」那一档把晶体本身放大（按左键的意图就是看清子文件夹），
  // 不只是把卡片缩小——只缩卡片那叫「卡片变小了」，不叫「晶体变大了」。
  const size = Math.round(
    SUB_CRYSTAL_SIZE * (state.facetFocus === "crystals" ? CRYSTAL_FOCUS_ZOOM : 1)
  );
  // 一律铺进左边那一栏，**不按数量换另一套布局**：晶体栏的宽度和晶体尺寸
  // 都会跟着左右键变，换布局就意味着「晶体少的时候按左键没反应」——
  // 同一颗晶体在两种主次下位置一样，用户会以为按钮坏了。
  const spots = facetGrid(shown.length, state.facetRegions.crystal, size);

  shown.forEach((k, i) => {
    const el = makeCrystalEl(ctx, k, size, i);
    el.classList.add("kb-v13-crystal-sub");
    placeCrystal(el, spots[i].x, spots[i].y);
    canvas.appendChild(el);
  });
}

/**
 * 按当前的两栏比例摆卡阵。
 *
 * 卡阵的**排版尺寸不变**（一行的 4 张大卡照旧需要 ~1150px 的布局宽度），
 * 靠 `transform` 等比缩放把它塞进右边那一栏。这样做而不是改行宽/列数：
 * 分页公式、翻页动画、卡片 DOM 全都不用动，只多一层视觉变换。
 *
 * ⚠️ 变换加在 **cardsArea** 上，不是 gridStage 上。gridStage 有 `overflow:hidden`，
 * 变换之前先在自己的坐标系里裁一刀——内容还没缩就被裁掉一半。
 * cardsArea 没有 overflow，缩放在它那一层做才完整。
 */
function applyCardRegion(ctx) {
  const { cardsArea, state, stage } = ctx;
  const r = state.facetRegions;
  if (!r) {
    cardsArea.style.transform = "";
    return;
  }
  const rect = stage.getBoundingClientRect();
  const k = cardScale(r.cards.w);
  // 宿主的 transform 原点放在整个舞台中心，所以先缩再平移到右栏中心
  const dx = r.cards.x + r.cards.w / 2 - rect.width / 2;
  cardsArea.style.transformOrigin = "50% 50%";
  cardsArea.style.transform = "translate(" + dx + "px, 0) scale(" + k + ")";
}

/** 侧栏一次最多摆几颗（两侧各两列 × 每列 5 颗）。摆不下的报出来，不静默吞掉。 */
const MAX_SIDE_CRYSTALS = 20;

/**
 * #21 切两栏的主次：`"cards"` = 卡片为主（默认），`"crystals"` = 晶体为主。
 *
 * 走的是和 resize 同一条路（renderCrystals + applyExpanded）：晶体的位置和
 * 卡阵的缩放比例都跟着栏宽走，两条都得重算。卡片张数没变，所以滚动监听
 * 不用重绑——resize 也是这么处理的。
 *
 * @returns {boolean} 真的换了吗（同一档再按一次是 no-op）
 */
export function setFacetFocus(ctx, focus) {
  const next = focus === "crystals" ? "crystals" : "cards";
  if (ctx.state.facetFocus === next) return false;
  ctx.state.facetFocus = next;
  const key = ctx.state.openCrystal;
  if (key) {
    renderCrystals(ctx);
    applyExpanded(ctx, key, ctx.model.colorOf(key).hue, false);
  }
  return true;
}

/** 这一层能不能切两栏（有子文件夹才谈得上主次） */
export function canFacetFocus(ctx) {
  const path = Array.isArray(ctx.state.crystalPath) ? ctx.state.crystalPath : [];
  return path.length > 0 && ctx.model.keysAt(path).length > 0;
}

/**
 * 晶体层这一票的两个落点：孤岛汇总，以及（选中态还在时）重画跨晶体连线。
 *
 * 汇总走 ctx 这根线而不是直接 import orphans.js：orphans.js 反过来要用本文件的
 * restoreExpanded，互相 import 会绕成环——和 hideTooltip / resetPanelOffset
 * 那几个走 ctx 是同一个套路。
 *
 * 连线那一句今天实际是守卫：面板要展开晶体点开卡片才出得来，而 expandCrystal
 * 第一件事就是 clearSelection —— 所以面板开着时 selectedCrystal 恒为 null。
 * 留着是防以后有人让面板与选中态共存。
 */
export function refreshCrystalLayer(ctx) {
  if (ctx.refreshOrphans) ctx.refreshOrphans();
  if (ctx.state.selectedCrystal) selectCrystal(ctx, ctx.state.selectedCrystal);
}

// ============================================================
// #7 选中晶体 → 高亮相连晶体
// ============================================================

function ensureLinkLayer(ctx) {
  if (ctx.linkLayer) return;
  const svg = svgEl("svg");
  svg.setAttribute("class", "kb-v13-crystal-links");
  svg.style.zIndex = "0";
  // 挂 canvas 不是 stage —— 见本文件开头那段：连线与晶体必须在同一个坐标系里，
  // 否则 identity 变换下看不出问题，一平移就错位且不报错。
  ctx.canvas.appendChild(svg);
  ctx.linkLayer = svg;

  const labels = EL("div");
  labels.className = "kb-v13-crystal-links";
  labels.style.cssText = "position:absolute;inset:0;z-index:116;pointer-events:none;overflow:visible;";
  ctx.canvas.appendChild(labels);
  ctx.linkLabels = labels;
}

export function clearCrystalLinks(ctx) {
  if (ctx.linkLayer) ctx.linkLayer.innerHTML = "";
  if (ctx.linkLabels) ctx.linkLabels.innerHTML = "";
}

export function clearSelection(ctx) {
  // 取消选中也要落盘：下次打开时看到的那颗高亮，就是上次看到的那颗
  ctx.state.selectedCrystal = null;
  ctx.persistViewState();
  ctx.stage.querySelectorAll(".kb-v13-crystal").forEach((el) => {
    el.classList.remove("selected", "linked", "unlinked");
    el.style.removeProperty("--sel-hue");
  });
  clearCrystalLinks(ctx);
  if (ctx.selectHint) ctx.selectHint.classList.remove("show");
}

export function selectCrystal(ctx, key) {
  const { stage, model } = ctx;
  // 只认**当前这一层舞台上真有的**邻居。多层之后一颗晶体可能连到别的层去，
  // 那种边这一屏画不出来；照单全收的话会得到「3 颗相连」却只亮起 1 颗——
  // 提示语和屏幕对不上，比不提示还糟。drawCrystalLinks 本来就找不到 DOM 就跳过，
  // 这里只是让计数跟上同一套口径。
  const onStage = new Set(
    [...stage.querySelectorAll(".kb-v13-crystal")].map((el) => el.dataset.key)
  );
  const allNeighbors = model.neighborsOf(key);
  const neighbors = allNeighbors.filter((n) => onStage.has(n.key));
  const linked = new Set(neighbors.map((n) => n.key));
  const hue = model.colorOf(key).hue;
  ctx.state.selectedCrystal = key;
  // 写盘时机只管「状态改完了」，攒批由 ctx.persistViewState 内部防抖，
  // 所以这里连着改两次（选中 + 展开）也不会写两遍
  ctx.persistViewState();

  stage.querySelectorAll(".kb-v13-crystal").forEach((el) => {
    const k = el.dataset.key;
    el.classList.remove("selected", "linked", "unlinked");
    el.style.setProperty("--sel-hue", String(hue));
    if (k === key) el.classList.add("selected");
    else if (linked.has(k)) el.classList.add("linked");
    // 一颗都没连上时不要把整张版图压暗——那是死路，不是信息
    else if (neighbors.length) el.classList.add("unlinked");
  });

  drawCrystalLinks(ctx, key, neighbors, hue);

  if (ctx.selectHint) {
    const name = model.colorOf(key).name;
    if (neighbors.length) {
      ctx.selectHint.textContent =
        neighbors.length + " 颗相连 · " + SELECT_HINT_ENTER + "「" + name + "」· 点空白取消";
    } else if (allNeighbors.length) {
      // 有邻居，但都在别的层里。别在这时说「还没跟别的晶体连上」——那是句假话，
      // 用户明明在别处写过双链，只是这一屏看不到那条边。
      ctx.selectHint.textContent =
        "跟它相连的 " + allNeighbors.length + " 颗都在别的层里，钻进对应文件夹才看得到";
    } else {
      ctx.selectHint.textContent =
        "这颗晶体还没跟别的晶体连上——在某张卡的正文里写一条 [[别的晶体的卡]] 就连起来了";
    }
    ctx.selectHint.classList.add("show");
  }
}

function drawCrystalLinks(ctx, key, neighbors, hue) {
  ensureLinkLayer(ctx);
  clearCrystalLinks(ctx);
  if (!neighbors.length) return;

  const selEl = ctx.stage.querySelector('.kb-v13-crystal[data-key="' + cssEscape(key) + '"]');
  if (!selEl) return;
  const ax = selEl.offsetLeft + selEl.offsetWidth / 2;
  const ay = selEl.offsetTop + selEl.offsetHeight / 2;
  const ra = Math.min(selEl.offsetWidth, selEl.offsetHeight) / 2;

  for (const n of neighbors) {
    const el = ctx.stage.querySelector('.kb-v13-crystal[data-key="' + cssEscape(n.key) + '"]');
    if (!el) continue;
    const bx = el.offsetLeft + el.offsetWidth / 2;
    const by = el.offsetTop + el.offsetHeight / 2;
    const rb = Math.min(el.offsetWidth, el.offsetHeight) / 2;

    let dx = bx - ax;
    let dy = by - ay;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= dist;
    dy /= dist;
    const x1 = ax + dx * ra;
    const y1 = ay + dy * ra;
    const x2 = bx - dx * rb;
    const y2 = by - dy * rb;

    const g = svgEl("g");
    const mk = (w, col, op, dash) => {
      const l = svgEl("line");
      l.setAttribute("x1", x1);
      l.setAttribute("y1", y1);
      l.setAttribute("x2", x2);
      l.setAttribute("y2", y2);
      l.setAttribute("stroke", hsl(col, 80, 62, op));
      l.setAttribute("stroke-width", w);
      l.setAttribute("stroke-linecap", "round");
      if (dash) {
        l.setAttribute("stroke-dasharray", "4,6");
        l.classList.add("kb-v13-cl-line");
      }
      g.appendChild(l);
    };
    mk(6, n.hue, 0.12, false);
    mk(1.5, n.hue, 0.45, false);
    mk(1, hue, 0.75, true);
    ctx.linkLayer.appendChild(g);

    // 标签：说清是哪张卡连的
    const label = EL("div", "kb-v13-cl-label");
    const first = n.edges[0];
    const more = n.edges.length > 1 ? " +" + (n.edges.length - 1) : "";
    label.innerHTML = "<b>" + esc(truncate(first.card, 16)) + "</b>" + more;
    label.title = n.edges.map((e) => e.card + " → " + e.target).join("\n");
    label.style.left = (x1 + x2) / 2 + "px";
    label.style.top = (y1 + y2) / 2 + "px";
    ctx.linkLabels.appendChild(label);
  }
}

function cssEscape(v) {
  return String(v).replace(/["\\]/g, "\\$&");
}

/** 点晶体的统一入口：第一次点选中看关系，再点同一颗进入 */
export function crystalClicked(ctx, key) {
  // #19：已经在某一层里的时候，侧栏上那些子晶体是**继续往里走**的入口——
  // 直接进。原来那句 `if (openCrystal) return` 是单层时代的守卫（层里没有
  // 别的可点晶体），多层之后它会把唯一的下钻入口封死。
  //
  // 层内不做「先选中看关系」那两下：那是环上用来挑晶体的手势，在一条已经
  // 选定的路径上再要求确认一次是白费一步。环上的两下点击原样保留。
  if (ctx.state.openCrystal) {
    if (ctx.state.openCrystal !== key) expandCrystal(ctx, key);
    return;
  }
  if (ctx.state.selectedCrystal === key) {
    expandCrystal(ctx, key);
    return;
  }
  selectCrystal(ctx, key);
}

// ============================================================
// 展开 / 收缩
// ============================================================

export function expandCrystal(ctx, key) {
  const { state, model, stage, pages } = ctx;
  if (state.openCrystal === key) return;
  state.openCrystal = key;
  // 层栈由 key 推出来（key 本身就是路径），不另存一份
  state.crystalPath = model.resolveChain(key);
  state.scrollOffset = 0;
  // 显示模式跟着换一档（根层那档 → 层内那档）。
  //
  // ⚠️ 不能只靠 renderCrystals 里那一次同步：**从环上进一颗顶层叶子**这条路
  // 刻意不调 renderCrystals（见下面 drilled 那段，它要保住老体验），于是
  // state.stage 会停在「画布」上——表现是钻进晶体了、画面还按画布摆。
  // 而且相机也得在这里就撤掉：那 520ms 的飞入动画是在舞台坐标系里算的，
  // 世界层的 transform 还挂着的话，晶体是往错的地方飞。
  if (ctx.syncStage) ctx.syncStage();
  ctx.persistViewState();
  clearSelection(ctx);

  // 只进这一层自己的卡，不含子文件夹里的——子层要再钻一次才看得到。
  // 扁平库下「这一层」就是整颗晶体，与改动前的 groups[key] 逐张相同。
  const cards = model.cardsAt([key]);
  const col = model.colorOf(key);
  // ≤8 张：前补空位，让卡片全部进入中间两行大卡位
  state.currentCards = cards.length <= 8 ? [null, null, null, null].concat(cards) : cards;
  state.currentHue = col.hue;

  const stageRect = stage.getBoundingClientRect();
  const half = CRYSTAL_SIZE / 2;
  const centerX = stageRect.width / 2 - half;
  const centerY = stageRect.height / 2 - half;

  stage.querySelectorAll(".kb-v13-crystal").forEach((el) => {
    if (el.dataset.key === key) {
      el.classList.remove("dimmed");
      el.style.transform = "scale(1.12)";
      el.style.zIndex = "80";
      requestAnimationFrame(() => {
        el.classList.add("fly");
        el.style.left = centerX + "px";
        el.style.top = centerY + "px";
      });
    } else {
      el.classList.add("dimmed");
    }
  });

  // 这一下是「展开」还是「钻进」——决定舞台要不要重建。
  //
  // 只有**从环上进一颗顶层叶子**才不重建，这是保住老体验的关键：扁平库里
  // 每一颗晶体都满足这个条件，走的就是改动前那条原路（飞入、背景、卡片，
  // 一个字没变，连退出的飞回动画都还在）。
  //
  // 别把条件简化成「这颗有没有子文件夹」：从第二层再往下进一颗**叶子**时，
  // 这颗自己没有子文件夹，但上一层摆在侧栏里的那几颗必须清掉——不清的话
  // 它们会留在屏幕上继续可点，看着像还能往别处跳。
  const drilled = model.keysAt([key]).length > 0 || state.crystalPath.length > 1;

  setTimeout(() => {
    state.scrollOffset = 0;
    // 换层放在动画之后：飞的是环上那一颗，它得先在 DOM 里飞完。
    // 重建之后 applyExpanded 按 data-key 找到的是新的背景那颗，
    // 位置尺寸与飞到的落点一致，接得上。
    if (drilled) renderCrystals(ctx);
    applyExpanded(ctx, key, col, true);
    bindScrollListeners(ctx, cards);
    pages.style.display = "flex";
  }, 520);
}

/**
 * 直接落到展开态（#14 恢复）。
 *
 * 与 expandCrystal 只差一件事：**不放动画**。恢复不是「展开」——用户上次就停在
 * 这儿，重放一遍 520ms 的飞入等于说他刚点了一下；而且那 520ms 是 setTimeout 撑的，
 * 等它的人（包括测试）只能白等。所以这里直接走 applyExpanded 那条
 * 「首次展开 / resize 重渲染」共用的落地路径，不飞、不 burst、不等。
 */
export function restoreExpanded(ctx, key, scrollOffset) {
  const { state, model, pages, stage } = ctx;
  const cards = model.cardsAt([key]);
  const col = model.colorOf(key);

  state.openCrystal = key;
  state.crystalPath = model.resolveChain(key);
  // 同 expandCrystal：显示模式跟着换档，相机该撤就撤（这条路上不走 renderCrystals）
  if (ctx.syncStage) ctx.syncStage();
  // 和 expandCrystal 一样：≤8 张前补空位，卡片才落在中间两行大卡位
  state.currentCards = cards.length <= 8 ? [null, null, null, null].concat(cards) : cards;
  state.currentHue = col.hue;
  // 页码夹到这一颗晶体**今天**真正有的范围内：卡片增删过，上次的第 3 页今天不一定在。
  // 夹的是补位后的 currentCards，用的又是 renderRingCards 里同一个公式——
  // 恢复的页码才活得过 applyExpanded 那一趟（那里还会再夹一次）。
  state.scrollOffset = Math.min(
    Math.max(0, Math.floor(Number(scrollOffset)) || 0),
    maxScrollOffset(state.currentCards)
  );

  clearSelection(ctx); // 进晶体就不留选中高亮，与 expandCrystal 一致
  // 恢复到的这一层若不是「顶层叶子」，舞台得先搭成「背景 + 侧栏」的样子。
  // 判据与 expandCrystal 同一套（见那边 drilled 那段），别在两处各写一遍规则。
  //
  // ⚠️ **故事线要单独判一句**：它的内容（节点和连线）**只由 renderCrystals 画**，
  // 而 applyExpanded 只管卡阵。少了这一条，重开之后直接落在故事线上时——
  // 相机对、面包屑对、模式对，**就是舞台上一个节点都没有**，最难查的那种。
  // （测试差点漏掉：第一次写的那条用例里模式还是卡阵，所以「碰巧」通过了。）
  const needsRebuild =
    model.keysAt([key]).length > 0 ||
    state.crystalPath.length > 1 ||
    state.stage === "storyline";
  if (needsRebuild) {
    renderCrystals(ctx);
  }
  applyExpanded(ctx, key, col, false);
  bindScrollListeners(ctx, cards);
  if (pages) pages.style.display = "flex";
  // 页码被夹过的话，存储里那份也该跟着修正——否则每次打开都在夹同一个过期值
  ctx.persistViewState();
}

/**
 * 退一层。返回「真的退了没有」——已经在根就返回 false，
 * 调用方（Esc / 点空白）据此决定要不要接着做原来那件事。
 */
export function drillUp(ctx) {
  const { state } = ctx;
  const path = Array.isArray(state.crystalPath) ? state.crystalPath : [];
  if (!path.length) return false;
  const up = path.slice(0, -1);
  ctx.unbindScrollListeners();
  // 往上走 = 离开这个「看某一颗晶体的方式」。层内那一档跟着这次浏览一起结束，
  // 再进来是卡阵（用户点名要的；理由见 stage.js 的 resetLevelStage）。
  // 直接 import，**不写 `if (ctx.resetLevelStage)`**：这条线总是接得上的，
  // 那种防御性写法只会把「线没接」降级成静默的哑行为（stage.js 里记着这个教训）。
  resetLevelStage(ctx);
  if (!up.length) {
    collapseCrystal(ctx); // 回到根 = 回到环
    return true;
  }
  // 退到上一层：不放动画。退层不是「进入」，重放一次飞入是在说假话。
  restoreExpanded(ctx, up[up.length - 1], 0);
  return true;
}

/**
 * 直接跳到第 depth 层（面包屑上点中间那一段）。`depth < 0` = 回到晶体环。
 *
 * 不用一层层退：从第三层点第一层，就该一步到第一层——面包屑存在的全部
 * 意义就是省掉中间那几步。已经在那一层（或更深）则什么都不做。
 */
export function drillToDepth(ctx, depth) {
  const path = Array.isArray(ctx.state.crystalPath) ? ctx.state.crystalPath : [];
  const d = Math.floor(Number(depth));
  if (!Number.isFinite(d) || d >= path.length - 1) return false;
  ctx.unbindScrollListeners();
  // 同 drillUp：往浅处走就是离开这个故事线视图，层内那一档一起收掉。
  resetLevelStage(ctx);
  if (d < 0) {
    collapseCrystal(ctx);
    return true;
  }
  // restoreExpanded 会自己把 crystalPath 重算成这一层的链（resolveChain(key)），
  // 所以这里不必手动截断栈——只有一处写栈，不会两处打架。
  restoreExpanded(ctx, path[d], 0);
  return true;
}

/**
 * 画顶栏面包屑。根层时整条收起来——没钻进去的时候顶上多一行「知识卡片」
 * 只是噪音，晶体环本身已经说清你在哪儿了。
 */
export function renderBreadcrumb(ctx) {
  const el = ctx.crumbs;
  if (!el) return;
  const { model, state } = ctx;
  const path = Array.isArray(state.crystalPath) ? state.crystalPath : [];

  if (!path.length) {
    el.innerHTML = "";
    el.classList.remove("show");
    return;
  }

  const parts = [
    '<button type="button" class="kb-v13-crumb kb-v13-crumb-back" title="返回上一层">‹ 返回</button>',
    '<button type="button" class="kb-v13-crumb kb-v13-crumb-root" data-depth="-1" title="回到晶体环">' +
      esc(model.rootKey || "全部") +
      "</button>",
  ];
  path.forEach((key, i) => {
    const last = i === path.length - 1;
    parts.push('<span class="kb-v13-crumb-sep" aria-hidden="true">›</span>');
    parts.push(
      '<button type="button" class="kb-v13-crumb' +
        (last ? " kb-v13-crumb-cur" : "") +
        '" data-depth="' +
        i +
        '"' +
        (last ? ' aria-current="page"' : "") +
        ">" +
        esc(model.colorOf(key).name) +
        "</button>"
    );
  });
  el.innerHTML = parts.join("");
  el.classList.add("show");
}

/** 把目标晶体设为居中背景并展开卡片（首次展开 / resize 重渲染共用） */
export function applyExpanded(ctx, key, col, doBurst) {
  const { stage, cardsArea, state, ring } = ctx;
  const crystalEl = stage.querySelector('.kb-v13-crystal[data-key="' + cssEscape(key) + '"]');
  const stageRect = stage.getBoundingClientRect();
  const bgSize = Math.min(stageRect.width, stageRect.height) * 0.45;
  const m = ring(stageRect.height);

  if (crystalEl) {
    crystalEl.classList.add("at-center");
    crystalEl.style.transition = "all 0.8s cubic-bezier(.22,.61,.36,1)";
    crystalEl.style.left = stageRect.width / 2 - bgSize / 2 + "px";
    crystalEl.style.top = m.crystalCenterY - bgSize / 2 + "px";
    crystalEl.style.width = bgSize + "px";
    crystalEl.style.height = bgSize + "px";
    crystalEl.style.setProperty("z-index", "0", "important");
    crystalEl.style.pointerEvents = "none";
    const inner = crystalEl.querySelector(".kb-v13-hex-inner");
    if (inner) inner.style.opacity = "0.35";
    const orbit = crystalEl.querySelector(".kb-v13-orbit");
    if (orbit) orbit.style.opacity = "0.08";
    if (doBurst) triggerBurst(crystalEl, col.hue);
  }

  stage.querySelectorAll(".kb-v13-crystal").forEach((el) => {
    // 侧栏里的子晶体是这一层的**内容**，不是背景——压暗它们等于把唯一
    // 能继续往里走的入口关掉。它们是并排的，不跟背景抢视觉重心。
    if (el.dataset.key !== key && !el.classList.contains("kb-v13-crystal-sub")) {
      el.classList.add("dimmed");
      el.style.pointerEvents = "none";
    }
  });

  cardsArea.classList.add("open");
  // 摆卡阵之前先把两栏的比例套上——卡片是画在右栏里的，位置得先定下来
  applyCardRegion(ctx);
  renderRingCards(ctx, state.currentCards, state.currentHue);
  // 面包屑挂在这里：进层（expand）、恢复（restore）、退层（drillUp→restore）、
  // resize 重排——四条路都经过 applyExpanded，一处就够，不用四个地方各喊一次。
  renderBreadcrumb(ctx);
  // 「这一层已经摆好了」的标记。外部（测试、截图脚本）靠它判断进入动作走完了：
  // 光看 DOM 里有没有卡片不够——**只有子文件夹、没有直属卡的层一张卡都没有**，
  // 而进层那 520ms 是 setTimeout 撑的，紧跟着就断言只会读到上一层。
  ctx.stage.dataset.openKey = key;
  // 换了一层，孤岛汇总的口径跟着变（当前这层 + 子树），得重算一遍
  if (ctx.refreshOrphans) ctx.refreshOrphans();
  // 两栏开关只在「这一层有子文件夹」时有意义，进/出层都要重新决定显不显示
  if (ctx.refreshFacets) ctx.refreshFacets();
}

export function triggerBurst(crystalEl, hue) {
  const burst = crystalEl.querySelector(".kb-v13-burst");
  if (!burst) return;
  burst.innerHTML = "";
  for (let i = 0; i < 18; i++) {
    const p = EL("div", "kb-v13-bp");
    const angle = (Math.PI * 2 * i) / 18;
    const dist = 40 + Math.random() * 80;
    p.style.setProperty("--bx", Math.cos(angle) * dist + "px");
    p.style.setProperty("--by", Math.sin(angle) * dist + "px");
    p.style.setProperty("--bp-clr", hsl(hue, 80, 60, 0.8));
    p.style.left = "50%";
    p.style.top = "50%";
    p.style.animationDelay = Math.random() * 0.15 + "s";
    burst.appendChild(p);
  }
}

export function collapseCrystal(ctx) {
  const { stage, cardsArea, gridStage, pages, state } = ctx;
  ctx.hideTooltip();
  cardsArea.classList.remove("open");
  pages.style.display = "none";
  gridStage.innerHTML = "";
  state.currentCards = [];
  state.currentHue = 210;
  state.facetRegions = null;
  // ⚠️「回到环上」这几个字段必须在下面两个 refresh **之前**清干净。
  // 它们是照着 crystalPath / openCrystal 算的（孤岛汇总按当前层定范围、
  // 两栏开关看这一层有没有子文件夹），先刷新就是按**旧状态**算一遍：
  // 表现是退回环上了，顶栏那两颗左右按钮还留着、孤岛数还停在子层那个数。
  state.crystalPath = [];
  state.openCrystal = null;
  state.scrollOffset = 0;
  // 回到根层 = 回到根层那一档（画布或环），相机在这一句里跟着进/出
  if (ctx.syncStage) ctx.syncStage();
  ctx.cardsArea.style.transform = ""; // 两栏的缩放/平移要撤掉，否则环上那层还是缩的
  delete ctx.stage.dataset.openKey;
  if (ctx.refreshOrphans) ctx.refreshOrphans();
  if (ctx.refreshFacets) ctx.refreshFacets();

  // 钻进过（舞台上有背景晶体）→ 环元素已经被换层时删掉了，得重建一圈。
  // 只展开过一颗**叶子**晶体的话环自始至终没动过，走下面那条原路把样式
  // 复位就行——那条路连带飞回动画一起保留，扁平库因此与改动前完全一致。
  if (stage.querySelector(".kb-v13-crystal-bg")) {
    ctx.unbindScrollListeners();
    clearSelection(ctx);
    renderCrystals(ctx);
    renderBreadcrumb(ctx); // 回到根 = 收掉面包屑
    ctx.persistViewState();
    return;
  }

  // ⚠️ 这条快速路径**不重画**舞台（那正是它保住老动画的办法），所以世界层上
  // 多出来的东西得在这里手工清。卡阵的卡片住在 cardsArea 里，上面
  // `gridStage.innerHTML = ""` 已经收拾了；**故事线的节点直接挂在世界层上**，
  // 少了这一句它们就会留在环上、摊在屏幕顶部（见 clearStoryLayers 的注释）。
  clearStoryLayers(ctx);

  stage.querySelectorAll(".kb-v13-crystal").forEach((el) => {
    el.classList.remove("at-center", "dimmed", "fly");
    el.style.transform = "";
    el.style.opacity = "";
    el.style.transition = "";
    el.style.zIndex = "";
    el.style.pointerEvents = "";
    el.style.width = CRYSTAL_SIZE + "px";
    el.style.height = CRYSTAL_SIZE + "px";
    el.style.left = (parseFloat(el.dataset.homeX) || 0) + "px";
    el.style.top = (parseFloat(el.dataset.homeY) || 0) + "px";
    el.style.zIndex = "";
    const inner = el.querySelector(".kb-v13-hex-inner");
    if (inner) inner.style.opacity = "";
    const orbit = el.querySelector(".kb-v13-orbit");
    if (orbit) orbit.style.opacity = "";
  });

  ctx.unbindScrollListeners();
  clearSelection(ctx);
  renderBreadcrumb(ctx); // 回到环 = 收掉面包屑
  // 放在最后：写的是收缩之后的状态，不是中途那个「已经收起但 scrollOffset 还没归零」的
  ctx.persistViewState();
}
