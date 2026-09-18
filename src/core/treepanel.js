// 面板里那棵「文件夹 → 卡片」树的画法与筛选（#20 孤岛 / #21 文件夹 / 3.0 刀 9 阅读器共用）。
//
// 调用方给的数据有**两种形状**，这一层两种都收：
//
//   嵌套   `{key, label?, name, cards, children}[]` —— `model.folderTree()`。
//          父子关系由 `children` 表达，缩进由「住在父节点的 `.kb-v13-op-cards` 里」
//          天然长出来（那一条本来就 `padding-left:20px`），不需要按深度算内边距。
//   扁平   `{key, name, cards}[]` —— `model.orphanGroups()`。它是个诊断面板，
//          一屏把有问题的都列出来比一层层点开有用，所以保持扁平；
//          没有 `children` 就是叶子，`label` 缺省时用 `groupLabel` 拼出全路径
//          （多层下光写「进阶」会有一堆重名的）。
//
// 组头拆成两个按钮（三角一个、名字一个）而不是一个大按钮：文件夹面板要
// 「点名字 = 钻进、点三角 = 只展开」，塞在一个按钮里做不出两种语义，
// 而且按钮里套可点元素本来就不合规。

import { esc } from "./dom.js";

/**
 * 把分组画成一棵可展开的树。
 *
 * @param {object[]} nodes 见文件头两种形状
 * @param {Set<string>} open 展开着的组（key）
 * @param {string} head 头部文案（已转义过，调用方负责）
 * @param {(card: object) => string} [cardSub] 卡片那一行右侧的次要文字；缺省用概念
 * @param {(card: object) => string} [cardExtra] 卡片那一行**后面**再补一段 HTML。
 *   阅读器的卡片盒靠它给每张卡挂一颗「留链」按钮；其余调用方不传。
 *   ⚠️ 传进来的 HTML **由调用方自己转义**——这里原样拼。
 */
export function treeHtml(nodes, open, head, cardSub, cardExtra) {
  const parts = ['<div class="kb-v13-op-head">' + head + "</div>"];

  const cardRow = (c) => {
    const sub = cardSub ? cardSub(c) : c.concept;
    return (
      '<button type="button" class="kb-v13-op-card" data-op-card="' + esc(c.path) + '">' +
      '<span class="kb-v13-op-t">' + esc(c.title) + "</span>" +
      (sub ? '<span class="kb-v13-op-c">' + esc(sub) + "</span>" : "") +
      "</button>" +
      (cardExtra ? cardExtra(c) : "")
    );
  };

  const walk = (list) => {
    for (const g of list) {
      const kids = Array.isArray(g.children) ? g.children : [];
      const isOpen = open.has(g.key);
      parts.push(
        '<div class="kb-v13-op-group' + (isOpen ? " open" : "") + '" data-op-group="' +
          esc(g.key) + '">' +
          '<div class="kb-v13-op-crystal">' +
          '<button type="button" class="kb-v13-op-toggle" data-op-toggle="' + esc(g.key) + '"' +
          ' aria-expanded="' + (isOpen ? "true" : "false") + '"' +
          ' aria-label="展开或收起这一组"><span class="kb-v13-op-caret" aria-hidden="true"></span></button>' +
          '<button type="button" class="kb-v13-op-pick" data-op-pick="' + esc(g.key) + '">' +
          esc(g.label != null ? g.label : groupLabel(g)) +
          "</button>" +
          '<span class="kb-v13-op-n">' + countCards(g) + "</span>" +
          "</div>" +
          '<div class="kb-v13-op-cards">'
      );

      // 从前这里有一句「这里没有直属卡片，都在子文件夹里」——那是**扁平**时代的补丁：
      // 纯容器文件夹展开之后是一片空白，得解释一句。改成真嵌套之后这一句成了错的，
      // 展开 Python 看见的就是它的子文件夹，空白这件事压根不会发生。
      // （也不可能再有「一张卡都没有也没有子文件夹」的层：树的每一层都是
      // `ensureNode` 顺着某张卡的 folder 长出来的。）
      for (const c of g.cards) parts.push(cardRow(c));

      // ⚠️ **子文件夹住在父节点的 `.kb-v13-op-cards` 里面**，和直属卡同一列。
      // 这是 3.0 刀 9 那一票的本体：从前它们是同级的一块块 `.kb-v13-op-group`，
      // 靠名字里的「父 / 子」表示从属关系；现在由 DOM 的嵌套表示——缩进是对面
      // 那条 `padding-left:20px` 给的，收起父节点时子树跟着一起藏起来。
      walk(kids);

      parts.push("</div></div>");
    }
  };

  walk(Array.isArray(nodes) ? nodes : []);
  return parts.join("");
}

/** 这一组（连同子树）一共多少张直属卡 */
export function countCards(node) {
  let n = node && Array.isArray(node.cards) ? node.cards.length : 0;
  for (const ch of (node && node.children) || []) n += countCards(ch);
  return n;
}

/** 这棵树（含子节点）一共几个文件夹 */
export function countNodes(nodes) {
  let n = 0;
  for (const g of Array.isArray(nodes) ? nodes : []) {
    n += 1 + countNodes(g.children);
  }
  return n;
}

/** `Python/数据分析/进阶` → `Python / 数据分析 / 进阶`；扁平库里就是原来那个名字 */
export function groupLabel(g) {
  const parent = String(g.key).split("/").slice(0, -1).join(" / ");
  return parent ? parent + " / " + g.name : g.name;
}

/**
 * 按关键词筛那棵树。**递归**，两种形状都收。
 *
 * - 文件夹**名字或路径**命中 → 整棵子树留下，卡全带着（找文件夹就是想看它里面）
 * - 卡片**标题或概念**命中 → 那几张留下，它们所在的文件夹留着当壳
 * - 一样都没命中的枝整个剪掉（连壳都不留，否则满屏都是空文件夹）
 *
 * @param {object[]} nodes
 * @param {string} q **已经小写、已经 trim 过**的关键词；空串表示不筛
 * @returns {{groups: object[], size: number, nodes: number}}
 *   `size` = 命中的卡片总数，`nodes` = 留下来的文件夹个数（都给头部文案用）
 */
export function filterTree(nodes, q) {
  const list = Array.isArray(nodes) ? nodes : [];
  if (!q) return { groups: list, size: countCards({ cards: [], children: list }), nodes: countNodes(list) };

  const hit = (s) => String(s == null ? "" : s).toLowerCase().includes(q);
  let size = 0;

  const prune = (g) => {
    const kids = Array.isArray(g.children) ? g.children : [];
    // 名字命中：整棵子树原样带走（包括它自己那几张卡）
    if (hit(g.label != null ? g.label : groupLabel(g)) || hit(g.key)) {
      size += countCards(g);
      return g;
    }
    const cards = g.cards.filter((c) => hit(c.title) || hit(c.concept));
    const children = [];
    for (const k of kids) {
      const r = prune(k);
      if (r) children.push(r);
    }
    if (!cards.length && !children.length) return null;
    size += cards.length;
    // 展开原节点而不是挑字段重建：`folder` 这类字段调用方要接着用（阅读器拿它当
    // 建卡目标），逐个列出来的话，将来加一个字段就得记得在这里补一次。
    return { ...g, cards, children };
  };

  const groups = [];
  for (const g of list) {
    const r = prune(g);
    if (r) groups.push(r);
  }
  return { groups, size, nodes: countNodes(groups) };
}

/** 面板上「点开某一组 / 点某张卡 / 点某张卡上的额外按钮」的公共分流 */
export function readPick(e) {
  const t = e.target;
  if (!t || !t.closest) return null;
  // 额外按钮排在前面：它自己就住在卡片那一行里，慢一步就会被 data-op-card 吃掉
  const link = t.closest("[data-op-link]");
  if (link) return { kind: "link", path: link.dataset.opLink };
  const toggle = t.closest("[data-op-toggle]");
  if (toggle) return { kind: "toggle", key: toggle.dataset.opToggle };
  const pick = t.closest("[data-op-pick]");
  if (pick) return { kind: "pick", key: pick.dataset.opPick };
  const card = t.closest("[data-op-card]");
  if (card) return { kind: "card", path: card.dataset.opCard };
  return null;
}
