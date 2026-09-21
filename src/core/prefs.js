// #22 偏好：跨会话记住的那点设置。
//
// 与视图状态（viewstate.js）分开，因为两者的**寿命不一样**：
//   - 视图状态是「上次看到哪儿」，点一下「忘掉上次看到哪儿」就该清掉；
//   - 偏好是「我把搜索框的字调成这个颜色了」，清视角不该连带把它也清了。
// 所以存储键也分开（adapter.js 的 prefsKey）。
//
// 这里只做纯函数：认不认得出、坏值退化成什么。适配层只管当 JSON 存取，
// **不校验字段**——加一个新偏好不该动适配层。
//
// 唯一的硬要求与 viewstate 那条一样：**sanitizePrefs 绝不抛**。
// 一份截断的 JSON、一个不是颜色的字符串，最差都只能退化成默认值。

import { toStr } from "./dom.js";
import { DESK_MIN_W, DESK_MIN_H, DESK_PER_PAGE } from "./desk.js";
import { sanitizeCamera } from "./viewstate.js";

/**
 * 桌面上最多记住几扇窗。
 * **不是性能上限，是存档上限**：这一份要塞进 localStorage，而写爆存储配额的坏法
 * （整个偏好一起写不进去）没人会去查。真摆了二十多扇的人该分两次读。
 */
export const MAX_DESK_WINDOWS = 24;

/**
 * 桌面能记住的窗种类。`card` 是 9-B 的卡片窗；`storyline` 是 9-D 的**结构窗**
 * ——它和前面几种有个根本差别：**它没有文件**，画的是一颗晶体。
 * 所以下面 `sanitizeDesk` 里那条「路径必填」对它不适用（见那里的注释）。
 */
// 3.0 刀 19 加了 `web`：收纳栏那个 `+` 开出来的**外部标签页**。
//
// 它的 `path` 就是那条网址（不是 vault 路径）——所以它**不需要**在
// `sanitizeDesk` 的「按 kind 决定 path 必填」那一段里特判：网址当然非空，
// 走的是和文献窗同一条「有 path 就收」的支。要小心的是**下游**：
// `releaseSource(w.path)` 之类拿它当 vault 路径查表的地方，查不到就该是空操作
// （那些地方本来就判了 `st.sources.get(path)` 有没有命中）。
const DESK_KINDS = ["pdf", "image", "markdown", "card", "storyline", "web"];
const PER_PAGE_MIN = 5;
const PER_PAGE_MAX = 500;

/** 有限数才认，其余退回兜底 */
function finite(v, fallback) {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

function intAtLeast(v, min, fallback) {
  const n = Math.round(Number(v));
  return isFinite(n) ? Math.max(min, n) : fallback;
}

/**
 * 阅读器桌面存档的消毒。
 *
 * ⚠️ 这一份**不可信**：用户可以手改 localStorage、存档可能被截断、也可能是从
 * **另一份已经删掉/改名的文献**那儿留下来的。所以逐条过滤：认不出的整条丢掉，
 * 坏字段退化成兜底值，**绝不抛**——与 `sanitizeViewState` 同一条纪律。
 *
 * 两种坏的代价差很远：丢掉一条 = 少一扇窗，用户自己再摆一次就是了；
 * 放进一条坐标是 NaN 的 = 那扇窗摆到屏幕外，**从此再也点不着**。
 */
export function sanitizeDesk(raw) {
  const def = { windows: [], perPage: DESK_PER_PAGE };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return def;
  const perPage = Math.min(PER_PAGE_MAX, Math.max(PER_PAGE_MIN, intAtLeast(raw.perPage, PER_PAGE_MIN, DESK_PER_PAGE)));

  const wins = Array.isArray(raw.windows) ? raw.windows : [];
  const out = [];
  for (const w of wins) {
    if (out.length >= MAX_DESK_WINDOWS) break;
    if (!w || typeof w !== "object" || Array.isArray(w)) continue;
    const kind = oneOf(w.kind, DESK_KINDS, null);
    if (!kind) continue;
    // 路径**按 kind 决定必填**（3.0 刀 9-D）。
    //
    // 原先是一刀切「没路径就整条丢掉」，理由是「没有它这扇窗不知道该画什么」。
    // 那条对文献类窗成立，对**结构窗**不成立：它画的是故事线，认的是 `crystal`
    // 那个晶体 key，本来就没有文件路径。不放宽的话结构窗每次重开都会安安静静
    // 地消失——而"安静地少一样东西"是这份存档最难查的一种坏法。
    const path = toStr(w.path).trim();
    const crystal = toStr(w.crystal).trim();
    if (kind === "storyline") {
      if (!crystal) continue;
    } else if (!path) continue;
    const from = intAtLeast(w.from, 1, 1);
    const page = intAtLeast(w.page, 1, 1);
    out.push({
      kind,
      path,
      // 结构窗看的哪颗晶体 + 它自己那台相机。别的 kind 落盘时是空串 / 默认值，
      // 读回来也没人用——但键**必须存在**，好过让下游到处判 undefined。
      crystal,
      cam: sanitizeCamera(w.cam),
      page,
      from,
      // markdown 是闭区间，`to` 不能小于 `from`——不然那一页是空的，
      // 而用户只会看到一扇什么都不显示的窗。
      to: Math.max(from, intAtLeast(w.to, 1, from)),
      x: finite(w.x, 40),
      y: finite(w.y, 40),
      w: Math.max(DESK_MIN_W, finite(w.w, DESK_MIN_W)),
      h: Math.max(DESK_MIN_H, finite(w.h, DESK_MIN_H)),
      // 3.0 刀 18 收纳栏：这扇窗在收纳栏里有没有条目。
      //
      // **只认布尔真**（不是 `!!w.docked`）：手改出来的 `"false"` 是个真值字符串，
      // 一收就变成「明明没收过，重开却在栏里」。同 `sanitizeHiddenLinks` 那条
      // 「`typeof` 严判，别让强制转换造出一条永远悬着的记录」。
      docked: w.docked === true,
    });
  }
  return { windows: out, perPage };
}

/** 默认偏好。字段少，但每加一个都要在这里定死默认值——默认值是契约的一部分。 */
export function defaultPrefs() {
  return {
    // 「文件夹」面板搜索框里**打的字**的颜色。默认紫。
    // 注意这不是占位符的颜色，占位符另有规则（styles.js）。
    searchColor: "#c9a0ff",
    // 3.0：显示模式。两档各管一个作用域，**互斥**——
    // 环/画布是「在根层看什么」，卡阵/故事线是「在某颗晶体里看什么」。
    // 做成两个独立开关会凭空造出「环+故事线」这种无意义的格子，
    // 每个格子都是一条要写测试、要写过渡、要写退出路径的状态。
    rootStage: "ring", // ring | canvas
    levelStage: "grid", // grid | storyline
    // 3.0 刀 9-A：文献阅读器的**浮窗桌面**——摆了哪几扇窗、摆在哪、多大。
    // 它是**偏好**不是视图状态：读一本电子书是跨天的事，这是「我的工作台长什么样」，
    // 不是「我上次看到哪儿」，清视角不该把桌面一起清了。
    // （而且 viewstate 的顶层形状是冻结的：加字段会让它那三处字面量断言当场变红。）
    readerDesk: { windows: [], perPage: DESK_PER_PAGE },
    // 3.0 刀 9 第二版：边看边记里「将建在」那一个——卡建到哪个文件夹。
    // **空串 = 跟着文献走**（老行为，也是默认）。用户挑过一次之后就一直用它，
    // 因为「我把卡放这儿」是个跨文献的稳定选择，不是每篇都要重挑的。
    // 存的是**宿主路径**（`3.资产舱/知识卡片/Python`），不是晶体 key。
    readerFolder: "",
    // 3.0 刀 9-D：**结构窗固定看的那颗晶体**（晶体 key，空串 = 还没挑过）。
    //
    // 用户 09-19 的原话是「结构窗看哪颗晶体应该改为自己选择」。头一版走的是
    // `state.openCrystal`——「你开阅读器之前待在库里哪颗」，那是**跟着浏览跑**的：
    // 在库里逛一圈再回来，窗里的东西就换了，而他什么都没点。
    // 「我自己选的」和「跟着你在哪儿」是两回事，所以另立一个字段。
    readerStoryCrystal: "",
  };
}

/** 两档显示模式的合法值。「认不出就退回第一个」——默认态永远是最安全的那个。 */
const ROOT_STAGES = ["ring", "canvas"];
const LEVEL_STAGES = ["grid", "storyline"];

function oneOf(v, allowed, fallback) {
  const s = toStr(v);
  if (!s) return fallback; // 空串也在「认不出」里——`allowed.indexOf("")` 会是 -1，但兜底值可能是 null
  return allowed.indexOf(s) >= 0 ? s : fallback;
}

/** 颜色只认 `#rrggbb`（三位简写、`rgb()`、具名色一律不收）——一条规则好解释也好兜底 */
const HEX_RE = /^#[0-9a-f]{6}$/i;

/**
 * 把「从宿主读回来的任意东西」变回一份可用的偏好。
 * 逐字段退化：某个字段坏了只回退那个字段，其余照常——不该因为一个颜色写坏了
 * 就把用户别处调好的设置一起丢掉。
 */
export function sanitizePrefs(raw) {
  const def = defaultPrefs();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return def;
  const color = toStr(raw.searchColor);
  return {
    searchColor: HEX_RE.test(color) ? color : def.searchColor,
    rootStage: oneOf(raw.rootStage, ROOT_STAGES, def.rootStage),
    levelStage: oneOf(raw.levelStage, LEVEL_STAGES, def.levelStage),
    // ⚠️ 这是个**白名单**——新字段忘了加在这儿，下一次写盘就被静默丢掉。
    // 加 `readerDesk` 时就是这样：只改 `defaultPrefs` 的话，用户摆完桌面一调
    // 搜索框颜色（那次写盘会走 collectPrefs → sanitizePrefs）桌面就没了。
    readerDesk: sanitizeDesk(raw.readerDesk),
    // 路径只做 «是字符串、去掉首尾空白»；**不去查它今天还在不在**——
    // 那个判断要问 model，而这里是个纯函数（同 desk 那一条：坏值的代价是
    // 「建卡时报一句找不到目录」，不是崩）。空串照收，它是有意义的那个默认值。
    readerFolder: toStr(raw.readerFolder).trim(),
    // 同 readerFolder 那条：只做「是字符串、去首尾空白」，**不去查它今天还在不在**
    // ——那是 model 的事，这里是个纯函数。晶体被删掉/改名时由调用方退回「没挑过」，
    // 表现是重开时把树摊开让他再挑一次，而不是开一扇空白窗。
    readerStoryCrystal: toStr(raw.readerStoryCrystal).trim(),
  };
}

/** 把当前偏好序列化成要落盘的那一份 */
export function collectPrefs(state) {
  const p = state && state.prefs ? state.prefs : defaultPrefs();
  return sanitizePrefs(p);
}
