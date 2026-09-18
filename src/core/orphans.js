// #20 孤岛汇总：孤岛从「挂在晶体和卡面上的红点」改成顶栏一个入口。
//
// 为什么挪。原来那两处标记是**常驻**的：每颗含有孤岛的晶体挂一个红点、
// 每张孤岛卡的卡面描一圈红虚线。多层的「子树聚合」一上，一颗顶层晶体底下
// 只要深层有一张孤岛卡，整整一条祖先链都会亮起来——大片红点标的是同一个
// 事实，而你大部分时间并不关心它。汇总只在你想看的时候展开。
//
// 数据口径与 model.subtreeOrphans 是同一个（当前这一层 + 它子树），
// 所以「看着哪儿就算哪儿」和面包屑对得上。
//
// 顺带说清一件事：`data-orphan` 和 `.kb-v13-card-orphan` **没有删**，
// 它们还在卡片 DOM 上（contract.spec.js 钉着）。删掉的只是让它们显示出来的
// 那几条 CSS——那是**数据**，不是装饰，留着不碍眼。

import { treeHtml, readPick } from "./treepanel.js";
import { restoreExpanded } from "./crystals.js";
import { showHologram } from "./hologram.js";

/** 当前这一层（含子树）的孤岛，按晶体分组；没有孤岛的组不出现 */
export function orphanGroupsOf(ctx) {
  return ctx.model.orphanGroups(ctx.state.crystalPath || []);
}

export function orphanTotalOf(ctx) {
  return orphanGroupsOf(ctx).reduce((n, g) => n + g.cards.length, 0);
}

/**
 * 刷新顶栏那颗按钮。没有孤岛时整颗按钮收起来——留一个「孤岛 0」在那儿
 * 只会让人以为它坏了。
 *
 * 面板开着的话内容一起重画：编辑正文改掉双链之后，这份清单必须跟着变，
 * 否则它会停在一个已经不对的答案上。
 */
export function refreshOrphanSummary(ctx) {
  const btn = ctx.orphanBtn;
  const panel = ctx.orphanPanel;
  if (!btn || !panel) return;

  const n = orphanTotalOf(ctx);
  btn.textContent = "孤岛 " + n;
  btn.style.display = n ? "" : "none";
  btn.setAttribute("aria-expanded", panel.classList.contains("open") ? "true" : "false");

  if (!n) closeOrphanPanel(ctx);
  else if (panel.classList.contains("open")) renderOrphanPanel(ctx);
}

export function closeOrphanPanel(ctx) {
  const panel = ctx.orphanPanel;
  if (!panel) return;
  panel.classList.remove("open");
  if (ctx.orphanBtn) ctx.orphanBtn.setAttribute("aria-expanded", "false");
  if (ctx._orphanOpen) ctx._orphanOpen.clear();
}

export function toggleOrphanPanel(ctx) {
  const panel = ctx.orphanPanel;
  if (!panel) return;
  if (panel.classList.contains("open") || !orphanTotalOf(ctx)) {
    closeOrphanPanel(ctx);
    return;
  }
  renderOrphanPanel(ctx);
  panel.classList.add("open");
  if (ctx.orphanBtn) ctx.orphanBtn.setAttribute("aria-expanded", "true");
}

function renderOrphanPanel(ctx) {
  const gs = orphanGroupsOf(ctx);
  const total = gs.reduce((n, g) => n + g.cards.length, 0);
  // 画法与文件夹面板共用（treepanel.js）；这里的组名带整条路径
  // （`Python / 数据分析 / 进阶`），只写末段的话多层下会有一堆同名的「进阶」。
  ctx.orphanPanel.innerHTML = treeHtml(gs, ctx._orphanOpen, "孤岛 " + total + " 张");
}

/** 某颗晶体那一组的展开 / 收起 */
function toggleOrphanGroup(ctx, key) {
  const open = ctx._orphanOpen;
  if (open.has(key)) open.delete(key);
  else open.add(key);
  renderOrphanPanel(ctx);
}

/**
 * 点一张孤岛卡 → 落到它所在的那一层，就地翻开那张卡的面板。
 *
 * 「看到孤岛」和「去补上双链」之间不该隔着一次分屏往返，所以这里直接把人
 * 送过去。用 restoreExpanded（同步、不放动画）而不是 expandCrystal：
 * 后者有 520ms 飞入，而用户点的是清单里的一条，不是在环上点晶体。
 */
function openOrphanCard(ctx, path) {
  const card = ctx.model.byPath.get(path);
  if (!card) return;
  const key = card.crystal;
  closeOrphanPanel(ctx);

  const cur = (ctx.state.crystalPath || []).slice(-1)[0] || null;
  if (cur !== key && ctx.model.hasNode(key)) restoreExpanded(ctx, key, 0);
  showHologram(ctx, card, ctx.model.colorOf(key).hue, {});
}

/** 面板上的点击都走这一处（面板内容每次重画，不适合逐个元素绑） */
export function onOrphanPanelClick(ctx, e) {
  const hit = readPick(e);
  if (!hit) return;
  // 孤岛面板里「点三角」和「点名字」是同一件事：展开 / 收起那一组。
  // （文件夹面板里点名字是钻进那颗晶体——两处语义不同，所以分开两个模块。）
  if (hit.kind === "toggle" || hit.kind === "pick") {
    toggleOrphanGroup(ctx, hit.key);
    return;
  }
  if (hit.kind === "card") openOrphanCard(ctx, hit.path);
}
