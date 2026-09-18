// #21「文件夹」面板：顶栏一个入口，点开是全库的文件夹树 + 搜索。
//
// 与孤岛面板（orphans.js）设计完全一致——同一族 `.kb-v13-op-*` 样式、同一套
// 展开/收起、同样点一张卡就落到它所在那一层。两处的差别只有三条：
//   1. 这里是**整个库**，与所在层级无关；孤岛那份跟着当前层走。
//   2. 包含一张直属卡都没有的纯容器文件夹（导航用，空文件夹也该看得见）。
//   3. 点晶体名 = **钻进那颗晶体**（孤岛那份是展开/收起那一组）——
//      它是个导航器，点名字就该去那儿。要展开仍点左边那个小三角。
//
// 3.0 刀 9 起，这一份是**真嵌套**的（`model.folderTree()` 带 `children`）：
// 子文件夹住在父节点的卡片列里，缩进一级。孤岛那一份仍是扁平的，理由在
// treepanel.js 的文件头写着。
//
// 搜索就长在这个面板里，和资源管理器找文件是同一个用法：上面一个框，
// 打字就筛，筛完点结果。没有另立一个搜索面板——**要找的东西就是这棵树上的
// 节点**，分两处反而要人先想「我该去哪个框里找」。

import { esc } from "./dom.js";
import { treeHtml, readPick, filterTree, countCards, countNodes } from "./treepanel.js";
import { restoreExpanded } from "./crystals.js";
import { showHologram } from "./hologram.js";

export function refreshFolderSummary(ctx) {
  const btn = ctx.folderBtn;
  const panel = ctx.folderPanel;
  if (!btn || !panel) return;
  // 这个入口永远在（库里总有晶体），不像孤岛那样没内容就藏起来
  btn.setAttribute("aria-expanded", panel.classList.contains("open") ? "true" : "false");
  if (panel.classList.contains("open")) renderFolderPanel(ctx);
}

export function closeFolderPanel(ctx) {
  const panel = ctx.folderPanel;
  if (!panel) return;
  panel.classList.remove("open");
  if (ctx.folderBtn) ctx.folderBtn.setAttribute("aria-expanded", "false");
  if (ctx._folderOpen) ctx._folderOpen.clear();
  // 搜索词**不跟着关掉就清**：关面板往往是为了跳去看某个结果，回来还想接着筛。
  // 真的想清就点框右边那个 ✕（search 类型自带）或按 Esc。
}

export function toggleFolderPanel(ctx) {
  const panel = ctx.folderPanel;
  if (!panel) return;
  if (panel.classList.contains("open")) {
    closeFolderPanel(ctx);
    return;
  }
  renderFolderPanel(ctx);
  panel.classList.add("open");
  if (ctx.folderBtn) ctx.folderBtn.setAttribute("aria-expanded", "true");
}

/**
 * 搜索框只建一次，之后每次只换下面那截列表。
 *
 * 为什么不能整块重画：输入框**自己也在面板里**，重画会把它连同焦点、光标位置
 * 一起丢掉——打一个字断一次，这个框就没法用。
 */
function ensureFolderChrome(ctx) {
  const panel = ctx.folderPanel;
  if (panel.querySelector(".kb-v13-op-search")) return;
  panel.innerHTML =
    '<div class="kb-v13-op-search-row">' +
    '<input type="search" class="kb-v13-op-search" autocomplete="off"' +
    ' placeholder="搜晶体或卡片…" aria-label="搜索晶体或卡片">' +
    // #22 取色器：选「搜索框里打的字」用什么颜色。原生 color input，
    // 值存在偏好里（跨会话记住），铺到 CSS 变量上由样式表取。
    '<input type="color" class="kb-v13-op-color" aria-label="搜索框里打字的颜色"' +
    ' title="选搜索框里打字的颜色">' +
    "</div>" +
    '<div class="kb-v13-op-body"></div>';
  const input = panel.querySelector(".kb-v13-op-search");
  input.value = ctx._folderQuery || "";

  const color = panel.querySelector(".kb-v13-op-color");
  color.value = ctx.state.prefs.searchColor;
  // input 在拖动取色器时连续触发 → 只做预览；change 在松手/关掉取色器时触发
  // → 那一笔才落盘。否则拖一次会写几十遍 localStorage。
  color.addEventListener("input", () => ctx.setSearchColor(color.value, false));
  color.addEventListener("change", () => ctx.setSearchColor(color.value, true));
  input.addEventListener("input", () => {
    ctx._folderQuery = input.value;
    renderFolderPanel(ctx);
  });
  // search 类型自带那个 ✕ 会触发 search 事件（清空时），跟着重画一次
  input.addEventListener("search", () => {
    ctx._folderQuery = input.value;
    renderFolderPanel(ctx);
  });
}

/** 把一棵树里所有文件夹的 key 收成一个集合（搜索时用来全摊开） */
function allKeys(nodes, out = new Set()) {
  for (const g of nodes || []) {
    out.add(g.key);
    allKeys(g.children, out);
  }
  return out;
}

function renderFolderPanel(ctx) {
  ensureFolderChrome(ctx);
  const panel = ctx.folderPanel;
  const body = panel.querySelector(".kb-v13-op-body");
  const raw = ctx.model.folderTree();

  const q = String(ctx._folderQuery || "").trim().toLowerCase();
  const { groups, size, nodes } = filterTree(raw, q);
  panel.classList.toggle("searching", !!q);

  let open;
  let head;
  if (q) {
    // 搜索时命中的组一律摊开——筛完还要一个个点开三角，那就不叫搜了。
    // （这一档里三角是藏起来的，见 styles.js 的 .searching 那几条。）
    open = allKeys(groups);
    head = nodes ? "找到 " + nodes + " 颗晶体 · " + size + " 张卡" : "没找到「" + q + "」";
  } else {
    open = ctx._folderOpen;
    head = countNodes(raw) + " 颗晶体 · " + countCards({ cards: [], children: raw }) + " 张卡";
  }

  body.innerHTML = groups.length
    ? treeHtml(groups, open, esc(head))
    : '<div class="kb-v13-op-head">' + esc(head) + "</div>";
}

export function onFolderPanelClick(ctx, e) {
  const hit = readPick(e);
  if (!hit) return;
  if (hit.kind === "toggle") {
    const open = ctx._folderOpen;
    if (open.has(hit.key)) open.delete(hit.key);
    else open.add(hit.key);
    renderFolderPanel(ctx);
    return;
  }
  // 点名字 = 钻进那颗晶体。展开那组不跳，让「看」和「去」分得开。
  if (hit.kind === "pick") {
    closeFolderPanel(ctx);
    if (ctx.model.hasNode(hit.key)) restoreExpanded(ctx, hit.key, 0);
    return;
  }
  if (hit.kind === "card") {
    const card = ctx.model.byPath.get(hit.path);
    if (!card) return;
    const key = card.crystal;
    closeFolderPanel(ctx);
    const cur = (ctx.state.crystalPath || []).slice(-1)[0] || null;
    // 卡片在别的层里才需要先落过去；已经在这一层就直接翻
    if (cur !== key && ctx.model.hasNode(key)) restoreExpanded(ctx, key, 0);
    showHologram(ctx, card, ctx.model.colorOf(key).hue, {});
  }
}
