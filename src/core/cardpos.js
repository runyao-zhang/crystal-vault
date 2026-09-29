// 3.0 刀 34：把卡片的坐标**写进卡片自己的 frontmatter**（用户 09-29）。
//
// 用户的原话：「每个卡片，收纳方框，金色方框的左下角坐标，是存在文件里面的，
// 这样在别人电脑，用了我这个插件，所有卡片的相对摆放位置也能像我电脑一样」。
//
// ---- 为什么只写卡片 ----
//
//   **卡片**      写进它自己的 YAML（这一份就是干这个的）。
//   **金色方框**  **不用写**：它的位置和大小是成员卡片的包围盒（用户 09-28 拍板
//                 "保持算出来的"）。卡片的坐标一旦跟着文件走，它自然跟着走。
//   **收纳方框**  它不是一个文件。它的位置留在视图状态里（跨机器不同步），
//                 这一轮**不动**——真要同步得先决定它存在哪份文件里，那是另一件事。
//
// ---- 存的是"格"不是"像素" ----
//
// 存的是**最小单位的整数倍**（见 storygrid.js：最小单位 = 卡片宽 ÷ 10），
// 而不是像素。理由：用户要的是「坐标属性」，而以他的说法为准，坐标是**左下角**。
// 存格的话，哪天卡片尺寸改一改，整张图的相对关系还在；存像素就会整体错位。
// 数值取到小数点后 3 位——**从没被摆过的卡**不在格点上（见 storygrid 顶上那段
// "存量位置一律不动"），那一份坐标是小数的，如实记着，动它一下就归整。
//
// ⚠️ 这个模块**会改用户的笔记文件**。它和 `storywrite.js` 是同一条纪律：
//    走 `patchFrontmatter`（只动 frontmatter 那一块，正文一个字节不碰）、
//    `writeCard` 带 `{ base }`（手机同步改过就不写）、写完用**回读的全**更新模型。

import { patchFrontmatter, asNumber } from "./frontmatter.js";
import { applyCardFields } from "./model.js";
import { UNIT } from "./storygrid.js";
import { NODE_H } from "./storylayout.js";

/**
 * frontmatter 里的字段名。
 *
 * ⚠️ **加了命名空间，不叫裸的「坐标」。** 这是个**写**字段，而这个插件是发布在
 * 社区目录上的：任何人的库里只要恰好有一个自用的 `坐标:` 字段（地理笔记之类
 * 太常见了），`patchFrontmatter` 的 `findKey` 会**静默把它换掉**，而对方
 * 完全不知道发生了什么。带上前缀就撞不上了，读起来也一眼知道是谁写的。
 * 中文是跟这套卡片既有字段（`概念` / `来源`）保持一致的。
 */
export const POS_FIELD = "晶体坐标";

/** 写盘防抖：拖完停这么一小会儿。**用户 09-29 选的档**——他有多端同步，
 *  拖几下就是几次磁盘写入 + 几次同步事件，攒一下再写。 */
const FLUSH_MS = 900;
/** 一次搬多少张老卡。**一次开库只搬这么多**，免得一个从没同步过大位置的库
 *  一开就把几百个文件全改一遍。剩下的下次开再搬。 */
const MIGRATE_MAX = 120;

/** 左下角的像素坐标 → 格坐标。 */
export function pixelToGrid(x, y) {
  const gx = Math.round((Number(x) || 0) / UNIT * 1000) / 1000;
  // ⚠️ 纵坐标算的是**下边缘**（用户第 3 条：以左下角为准），所以要 + NODE_H。
  // 忘了这一步的话，存下来的是左上角，别人的电脑上所有卡片会整齐地差一个卡片高。
  const gy = Math.round(((Number(y) || 0) + NODE_H) / UNIT * 1000) / 1000;
  return [gx, gy];
}

/** 格坐标 → 左上角的像素坐标（`crystalPos` / CSS 用的都是左上角）。 */
export function gridToPixel(pair) {
  const a = Array.isArray(pair) ? pair : null;
  if (!a || a.length < 2) return null;
  const gx = Number(a[0]);
  const gy = Number(a[1]);
  if (!Number.isFinite(gx) || !Number.isFinite(gy)) return null;
  return { x: gx * UNIT, y: gy * UNIT - NODE_H };
}

// ---------------------------------------------------------------- 写

/** 待写表：卡片路径 → **左下角的像素坐标**。
 *  **模块级**，不进 ctx：坐标是全局的（一张卡在任何一屏都只有一个位置），
 *  而结构窗和晶体库两份 ctx 共用同一个适配层。 */
const pending = new Map();
let timer = 0;
let writing = false;

/**
 * 记一笔待写。防抖到期（或有人调 `flushCardPos`）才真写盘。
 *
 * @param {object} ctx
 * @param {string} path 卡片路径
 * @param {{x:number,y:number}} at **左上角**的像素坐标（`crystalPos` 存的那个）
 */
export function queueCardPos(ctx, path, at) {
  if (!path || !at) return;
  pending.set(String(path), { x: Number(at.x) || 0, y: Number(at.y) || 0 });
  schedule(ctx);
}

function schedule(ctx) {
  const win = (ctx && ctx.win) || {};
  if (win.__kbV13CardPosTimer) clearTimeout(win.__kbV13CardPosTimer);
  win.__kbV13CardPosTimer = setTimeout(() => {
    win.__kbV13CardPosTimer = 0;
    flushCardPos(ctx);
  }, FLUSH_MS);
}

/**
 * 把攒着的坐标写进各自卡片的 frontmatter。
 *
 * 三条纪律，与 `storywrite.js` 一字不差：
 *   1. `patchFrontmatter` **只动 frontmatter 那一块**，正文一个字节不碰；
 *   2. `{ base }` **一次都不能省**——省了等于关掉冲突检测，会盲写覆盖手机上刚改的那份；
 *   3. 写完拿**回读的真实全文**更新模型，不是我们自己拼的那份（宿主可能规范化了行尾）。
 *
 * 一张卡失败**不影响其余卡**：一整批里有一张在手机上被改过，不该把别的也卡住。
 */
export async function flushCardPos(ctx) {
  if (writing || !pending.size) return;
  const api = ctx && ctx.adapter;
  if (!api || typeof api.writeCard !== "function") return;
  // ⚠️ `writing` 必须在 `finally` 里放掉。它是**模块级**的一个闸——中途任何一次
  // 抛出（`patchFrontmatter` 里、`applyCardFields` 里）都会把它永久卡在 true 上，
  // 于是这一整个会话里"把坐标写进文件"这件事**静默失效**，而屏幕上什么都不说。
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
  for (const [path, at] of batch) {
    const card = ctx.model && ctx.model.byPath ? ctx.model.byPath.get(path) : null;
    if (!card) continue; // 卡没了（删了/改名了）→ 这一笔作废，不报错
    // ⚠️ **正在被编辑的那张卡先别动。**
    //
    // `editform` 打开时把 `ed.base = card.content` 记下来，保存时拿它当基线。
    // 我们这时候写一次坐标，文件就变了，用户按保存时基线对不上——他会看到
    // 「这张卡在别处被改过（多半是手机同步）」，**而那是我们自己造成的**。
    // `applyExternalChange` 对同一件事有同样的保护（那边是 `isEditing`）。
    // 这张卡留在待写表里，等编辑器关掉之后那一次拖/防抖会把它带上。
    const ed = ctx._editor;
    if (ed && ed.card && ed.card.path === path) {
      failed.push(path);
      continue;
    }
    const base = card.content == null ? "" : card.content;
    // `asNumber`：坐标天生是数字，不标一下会被编码器当成字符串写成 `["5", "9"]`
    // （那条引号规矩是给 `概念` 这种字段立的，见 frontmatter.js 里 `asNumber` 那段）。
    const g = pixelToGrid(at.x, at.y);
    const next = patchFrontmatter(base, { [POS_FIELD]: [asNumber(g[0]), asNumber(g[1])] });
    // 空操作护栏：算出来跟原文一模一样就什么都别做。既是省一次写盘，
    // 也是防"某天算出一个把 frontmatter 改坏的 bug"的那道安全带。
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
    applyCardFields(card, {}, res.content);
    // 顺手把内存里那份也更新掉，别再等下一次读盘
    card.pos = pixelToGrid(at.x, at.y);
    wrote++;
  }
  // 没写成的**放回待写表**：下一次拖别的东西时会跟着再试一遍。
  // 不重试的话，一次手机同步撞车就永久丢掉那一笔，而用户完全不知道。
  // ⚠️ 先在 batch 里建立 path → 坐标的表再回填：`batch.find(...)` 每失败一张
  // 就线性扫一遍不算事，但 `find` 万一落空就是一次**在渲染链路上的崩溃**，
  // 不值得为省两行冒这个险。
  const at = new Map(batch);
  for (const p of failed) if (!pending.has(p) && at.has(p)) pending.set(p, at.get(p));
  // ⚠️ **这一扇视图已经拆掉了就到此为止**（结构窗关掉之后那个防抖回调还可能在飞）。
  // 继续往下走的话，`ctx.refreshStoryline()` 会去重画一个已经从 DOM 上摘走的
  // 舞台、而它背后的 `view.pz` 也已经 destroy 了——不为一个用户看不见的窗口
  // 做任何事，是这个仓里反复写过的一条纪律（同 app.js 重挂时掐定时器那段）。
  // 写盘本身不受影响（它用的是适配层，跟视图活不活着无关）。
  const gone = ctx.fs && ctx.fs.isConnected === false;
  if (gone) return;
  if (failed.length && ctx.say) {
    ctx.say("有 " + failed.length + " 张卡的坐标没写进去（多半是同步没跟上），下次再动一下它们就会补上。", false);
  }
  if (wrote && ctx.refreshStoryline) ctx.refreshStoryline();
}

/**
 * 把**老存档里那些只存在这台机器上的位置**搬进卡片的 frontmatter。
 *
 * 用户 09-28 之前摆过的卡片，位置只在视图状态的 `crystalPos` 里——那份是
 * 每台机器各存各的，别人电脑上看不到。搬一次，之后就跟着文件走了。
 *
 * ⚠️ 三条边界：
 *   · **只搬"用户真的摆过"的**（`crystalPos` 里有记录的）。从没被拖过的卡
 *     位置是排布算法算出来的，那种"位置"本来就不该固化进文件；
 *   · 一次最多 `MIGRATE_MAX` 张，剩下的下次开库接着搬——一个从没同步过
 *     大位置的库一开就把几百个文件全改一遍，那是一次同步风暴；
 *   · **关掉那些已经有 `坐标` 的**（别的机器写的），别拿本地那份去盖它。
 *
 * @param {object} ctx
 * @param {{x:number,y:number}} map 卡片路径 → 左上角像素坐标（通常就是 crystalPos）
 */
export function migrateCardPos(ctx, map) {
  if (!map || typeof map !== "object") return 0;
  // ⚠️ **进过「导入」表的卡一律不搬。** 这一段是这一刀最容易出事的地方：
  //
  // 1.3.58 之前，把一张别的晶体的卡引进某一层再拖它，位置是写在**扁平的
  // `crystalPos`** 里的（刀 34 才拆出 `importPos`）。也就是说那份坐标是
  // "它在我这一层被摆在哪儿"，**不是**它在自己晶体里的位置。照着它写进
  // 那张卡的 frontmatter，就是把人家老家的坐标改掉——而且在每台机器上
  // 被固化下来。这正是刀 34 加 `isForeign` 要防的那件事，而迁移是唯一
  // 一条没走 `isForeign` 的写入路径。
  //
  // 代价：一张既被导入过、又是某层原生卡的卡，它在老家那份**旧**位置不会
  // 被搬进文件（用户下次在老家拖它一下就补上了）。这个代价比写错小得多。
  const foreign = importedPaths(ctx);
  let n = 0;
  for (const path of Object.keys(map)) {
    if (n >= MIGRATE_MAX) break;
    if (foreign.has(path)) continue;
    const card = ctx.model && ctx.model.byPath ? ctx.model.byPath.get(path) : null;
    if (!card) continue;
    if (Array.isArray(card.pos)) continue; // 文件里已经有了（别的机器写的）
    const at = map[path];
    if (!at || !Number.isFinite(Number(at.x)) || !Number.isFinite(Number(at.y))) continue;
    pending.set(path, { x: Number(at.x), y: Number(at.y) });
    n++;
  }
  if (n) schedule(ctx);
  return n;
}

/** 所有层里「被导入过」的卡片路径（哪一层都算——我们要的是"这张卡当过外来户"）。 */
function importedPaths(ctx) {
  const out = new Set();
  const st = ctx && ctx.state ? ctx.state : null;
  const v = st ? st.draft || st.view : null;
  const t = v && v.imports;
  if (!t || typeof t !== "object") return out;
  for (const list of Object.values(t)) {
    if (Array.isArray(list)) for (const p of list) if (typeof p === "string" && p) out.add(p);
  }
  return out;
}
