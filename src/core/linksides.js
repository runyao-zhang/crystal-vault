// 3.0 刀 46：把卡片亲手设过的**连线接法**写进它自己的 frontmatter（用户 10-01）。
//
// ---- 为什么非得进文件 ----
//
// 用户把这颗晶体压缩发给别人（他拿这个在卖），对方打开之后线全变成左右。
// 接法原来只活在**本机视图状态**里（`view.linkSides`），而且两层都不成立：
//   · 键是**用户当时站在哪一层**（晶体路径）——把文件夹复制到库里别处，键就对不上；
//   · 那份状态**每台机器各存各的**——朋友电脑上一开始就是空的。
// 存进卡片自己身上之后：改名、搬到别的文件夹、压缩发走，都带着走。
//
// ---- 和 cardpos.js 是同一个形状的问题 ----
//
// 那边管「卡片摆在哪儿」，这边管「线从哪条边出去」。两份都是"一份本该跟着卡片
// 走的本地状态"，所以写法逐条对齐：防抖、`patchFrontmatter`、`{ base }`、
// 回读更新模型、失败重试、进过编辑器的卡先别动。
//
// ⚠️ **改这一份的时候顺手看一眼 `cardpos.js`**——两边的纪律是同一套，
//    只改一边的话，行为会在"写盘冲突怎么处理"这类地方悄悄分叉。
//
// ⚠️ 这个模块**会改用户的笔记文件**。三条纪律与 `storywrite.js` 一字不差：
//    走 `patchFrontmatter`（只动 frontmatter 那一块，正文一个字节不碰）、
//    `writeCard` 带 `{ base }`（手机同步改过就不写）、写完拿**回读的真实全文**
//    更新模型（宿主管线可能规范过行尾）。

import { patchFrontmatter, formatSideEntry, sideLetter, SIDES_FIELD } from "./frontmatter.js";
import { applyCardFields } from "./model.js";

/** 写盘防抖：和坐标同一个档（900ms）——用户有多端同步，攒一下再写。 */
const FLUSH_MS = 900;
/** 一次搬多少张老卡（同 cardpos 的 MIGRATE_MAX，理由一样：别一开库就改几百个文件）。 */
const MIGRATE_MAX = 120;

/**
 * 待写表：卡片路径 → **这张卡完整的接法表**。
 *
 * ⚠️ **存整表，不存增量。** frontmatter 里那个字段装的就是整表，存增量的话
 * 写盘时要先读一遍旧值再合并——而"读旧值"在防抖窗口里可能已经过期了。
 * 整表进、整表出，没有中间态。
 *
 * **模块级**，不进 ctx：和坐标同理，结构窗和晶体库两份 ctx 共用同一个适配层。
 */
const pending = new Map();
let timer = 0;
let writing = false;

function byPath(ctx, path) {
  const m = ctx && ctx.model && ctx.model.byPath;
  return m && typeof m.get === "function" ? m.get(path) : null;
}

/** 记一笔待写（这张卡的整张接法表）。 */
export function queueCardSides(ctx, path, list) {
  if (!path) return;
  pending.set(String(path), (Array.isArray(list) ? list : []).slice());
  schedule(ctx);
}

function schedule(ctx) {
  const win = (ctx && ctx.win) || {};
  if (win.__kbV13SideTimer) clearTimeout(win.__kbV13SideTimer);
  win.__kbV13SideTimer = setTimeout(() => {
    win.__kbV13SideTimer = 0;
    flushCardSides(ctx);
  }, FLUSH_MS);
}

/**
 * 用户从某个连接点拖出一根线 → 把这一条接法记在**源卡**自己身上，并排队写盘。
 *
 * @param {string} path        源卡路径（他**从哪张卡**拖出去的）
 * @param {string} targetTitle 目标卡的标题（存进去会写成 `[[标题]]` 的形状）
 * @param {string} mine        从源卡这边哪个方向出去（`t`/`r`/`b`/`l`）
 * @param {string} its         进目标卡那边哪个方向（同上）
 * @returns {boolean} 记下了没有（卡不在模型里就记不了）
 *
 * ⚠️ **同一对只留最新的一次**（与视图状态那份 `writeLinkSide` 同一句规矩）：
 *    用户重新拖一遍说的是"改成这样"，不是"再加一条"。
 *
 * ⚠️ **外来卡（导入进来的）也照写。** 这一点和 `cardpos.js` **故意不一样**：
 *    坐标那条路不写外来卡，是因为那个值说的是"它在我这一层被摆在哪儿"，
 *    写进去会把人家老家的位置改坏。而接法**不属于哪一层**——它说的是
 *    "这两张卡之间这根线怎么走"，无论那两张卡各自住在哪颗晶体里，都是同一件事。
 */
export function setCardSide(ctx, path, targetTitle, mine, its) {
  const title = String(targetTitle || "").trim();
  if (!path || !title) return false;
  const card = byPath(ctx, path);
  if (!card) return false;
  const list = (Array.isArray(card.sides) ? card.sides : []).filter(
    (e) => e && e.title !== title
  );
  list.push({ title, mine, its });
  // 先改内存：这一帧的渲染就要用它（写盘是 900ms 之后的事）。
  card.sides = list;
  queueCardSides(ctx, path, list);
  return true;
}

/**
 * 把攒着的接法写进各自卡片的 frontmatter。
 *
 * 一张卡失败**不影响其余卡**（同 cardpos）：一整批里有一张在手机上被改过，
 * 不该把别的也卡住。
 */
export async function flushCardSides(ctx) {
  if (writing || !pending.size) return;
  const api = ctx && ctx.adapter;
  if (!api || typeof api.writeCard !== "function") return;
  // ⚠️ `writing` 必须在 `finally` 里放掉。它是模块级的一个闸——中途任何一次抛出
  // 都会把它永久卡在 true 上，于是这一整个会话里"把接法写进文件"**静默失效**，
  // 而屏幕上什么都不说。（这一段和 cardpos.js 里那段是同一个坑，别只改一边。）
  writing = true;
  try {
    await flushBatch(ctx, api);
  } finally {
    writing = false;
  }
}

/** 真正干活的那一段（拆出来是为了让上面的 `finally` 管得住它）。 */
async function flushBatch(ctx, api) {
  const batch = [...pending];
  pending.clear();
  const failed = [];
  let wrote = 0;
  for (const [path, list] of batch) {
    const card = byPath(ctx, path);
    if (!card) continue; // 卡没了（删了/改名了）→ 这一笔作废，不报错
    // ⚠️ **正在被编辑的那张卡先别动**：`editform` 打开时把 `ed.base` 记成
    // `card.content`，我们这时候写一次，用户按保存时基线就对不上——他会看到
    // 「这张卡在别处被改过（多半是手机同步）」，**而那是我们自己造成的**。
    const ed = ctx._editor;
    if (ed && ed.card && ed.card.path === path) {
      failed.push(path);
      continue;
    }
    const vals = list.map(formatSideEntry).filter(Boolean);
    const base = card.content == null ? "" : card.content;
    // ⚠️ 3.0 刀 44（用户 10-08）：**空表 = 把这个字段删掉，不是"跳过不写"。**
    //
    // 从前这里是 `if (!vals.length) continue;`，理由是"`patchFrontmatter` 删不了
    // 字段，写一张空表进去只是凭空多一行空字段"。可那一跳的代价是：
    // **删掉最后一个值时，那条 `晶体接法` 就永远留在文件里**——用户报的正是这个
    // （"线条确实能连了能删了，但晶体接法没有一起摘掉"）。
    //
    // 现在 `patchFrontmatter` 认 `null` = 删字段，空表就交给它删。
    const next = patchFrontmatter(base, { [SIDES_FIELD]: vals.length ? vals : null });
    // 空操作护栏：算出来跟原文一模一样就什么都别做（同 cardpos 那条）。
    if (next === base) continue;
    let res;
    try {
      res = await api.writeCard(path, next, { base });
    } catch (e) {
      failed.push(path);
      continue;
    }
    if (!res || !res.ok) {
      failed.push(path);
      continue;
    }
    // 用**回读的真实全文**更新模型（宿主管线可能规范化了行尾），别再等下一次读盘。
    applyCardFields(card, {}, res.content);
    card.sides = list;
    wrote++;
  }
  // 没写成的**放回待写表**：下一次拖别的东西时会跟着再试一遍。不重试的话，
  // 一次同步撞车就永久丢掉那一笔，而用户完全不知道。
  const at = new Map(batch);
  for (const p of failed) if (!pending.has(p) && at.has(p)) pending.set(p, at.get(p));
  // 这一扇视图已经拆掉了就到此为止（结构窗关掉之后那个防抖回调还可能在飞）。
  const gone = ctx.fs && ctx.fs.isConnected === false;
  if (gone) return;
  if (failed.length && ctx.say) {
    ctx.say(
      "有 " + failed.length + " 张卡的接法没写进去（多半是同步没跟上），下次再拖一下就会补上。",
      false
    );
  }
  if (wrote && ctx.refreshStoryline) ctx.refreshStoryline();
}

/**
 * 把**老存档里那些只存在这台机器上的接法**搬进卡片的 frontmatter。
 *
 * 用户 10-01 之前拖的接法都在视图状态的 `linkSides` 里，那份每台机器各存各的、
 * 键还是"当时站在哪一层"。搬一次，之后就跟着文件走了。
 *
 * ⚠️ 三条边界（与 `migrateCardPos` 逐条对应）：
 *   · **只搬指向库里真卡的**。目标卡找不到（被删/改名了）就跳过——搬过去
 *     也只是一条永远解析不出来的死记录；
 *   · 一次最多 `MIGRATE_MAX` 张，剩下的下次开库接着搬；
 *   · **已经写过的目标不覆盖**（别的机器写过的那一份更新），只补缺的那些。
 *
 * @param {object} all 视图状态里的 `linkSides`：`{ 层键: [{from,to,fromSide,toSide}] }`
 * @returns {number} 排进队里的卡片数
 */
export function migrateCardSides(ctx, all) {
  if (!all || typeof all !== "object") return 0;
  // ⚠️ **没有"这一层搬过了"的标记表，是故意的。**
  //
  // 幂等性就靠下面那句「卡上已经有没有这一对」——搬成功之后卡上就有了，
  // 下次开库自然跳过。这样能省掉一个**新的视图状态字段**，而视图状态那边
  // 是**白名单式重建**的（`sanitizeView` 逐个字段列），加字段忘了改就是
  // 每次开库都被静默丢掉、于是每次都重扫一遍。少一个字段少一处那种坑。
  //
  // 顺带还白拿一条：**写盘失败的那几条下次会自己重试**（卡上没写进去 →
  // 下一轮扫描还认得它），而"搬过了"的标记会把它一次性地漏掉。
  const merged = new Map(); // 卡片路径 → 要补的那几条
  for (const list of Object.values(all)) {
    if (!Array.isArray(list)) continue;
    for (const l of list) {
      if (!l || !l.from || !l.to) continue;
      const from = byPath(ctx, l.from);
      const to = byPath(ctx, l.to);
      if (!from || !to || !to.title) continue; // 目标不在库里 → 搬过去也没用
      // 卡上已经有了这一对（别的机器写的 / 这次已经补过）→ 不覆盖。
      const list2 = merged.get(l.from) || (Array.isArray(from.sides) ? from.sides.slice() : []);
      if (list2.some((e) => e && e.title === to.title)) continue;
      // ⚠️ 存的是**字母**，而视图状态那份存的是**方位名**——必须转一道。
      // 漏了这一转，`formatSideEntry` 认不出就退回默认的 `r l`，于是**写进
      // 用户卡片的是错的方向**：不报错、看起来也"有接法"，只是接错了边。
      // （这正是本次探针逮住的那条。）
      list2.push({ title: to.title, mine: sideLetter(l.fromSide), its: sideLetter(l.toSide) });
      merged.set(l.from, list2);
    }
  }
  let n = 0;
  for (const [path, list] of merged) {
    if (n >= MIGRATE_MAX) break;
    const card = byPath(ctx, path);
    if (!card) continue;
    card.sides = list; // 先落内存：这一帧就要按新接法画
    queueCardSides(ctx, path, list);
    n++;
  }
  return n;
}
