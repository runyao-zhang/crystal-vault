// 桥协议 —— 悬浮伴侣（独立 Electron 窗口）和 Obsidian 之间那一条线的**纯逻辑**部分。
//
// 这一层不碰 http、不碰 DOM、不碰 Electron，所以两个 transport（真的走网络的、
// 测试用的进程内的）和全部的兜底表都从这儿取同一份口径。
//
// ⚠️ **为什么不用 WebSocket**：适配层契约里全是请求/响应，唯一的服务端推送
// （watchCards）是单向事件流。`node:http` 是白送的，SSE 在它上面加十几行就够；
// 而 WS 要么手搓 RFC 6455 分帧，要么把 `ws` 打进一个 `platform:"browser"` 的
// CJS 包（那个包的体积是有闸门的，见 scripts/build.mjs）。为一条单向事件流
// 引一整套双向协议，不划算。

import { ADAPTER_METHODS } from "../adapter.js";

/**
 * 协议版本。两边对不上就早失败、报清楚，而不是带着半懂的语义跑下去。
 * 改**信封形状**才动它；加一个方法不算（方法名本身就在契约里，缺了自然报缺）。
 */
export const BRIDGE_VERSION = 1;

// ── 22 个方法按「走哪条路」分成五堆 ────────────────────────────────
//
// 这五堆**必须正好把 ADAPTER_METHODS 分完**（不重不漏），由下面
// assertBridgeCoversContract() 在启动时强制。加一个契约方法却忘了归类，
// 会在**第一次启动**就报出来，而不是等到用户点了某个按钮才发现没反应。

/** 走 HTTP RPC（POST /rpc/<method>）。 */
export const RPC_METHODS = [
  "loadCards",
  "resolveLink",
  "openNote",
  "writeCard",
  "listDocs",
  "createCard",
  "createFolder",
  "listFolders",
  "trashFile",
  "renameFile",
  "readTextFile",
  "writeTextFile",
];

/** 走 SSE 推送（GET /events）。 */
export const STREAM_METHODS = ["watchCards"];

/** 走 HTTP /blob（支持 Range）。 */
export const BLOB_METHODS = ["readBinary"];

/** 走 /store/get · /store/set。键由**客户端**拼（含命名空间后缀），见 remote.js。 */
export const STORE_METHODS = ["loadViewState", "saveViewState", "loadPrefs", "savePrefs"];

/**
 * 留在伴侣本地、**不过桥**的方法。
 *
 * 前三个是「本地能做得更好或干脆做不到远程」：
 *   · assetUrl      —— Obsidian 返回的 `app://` 是它自己 session 的协议，跨进程解析不了
 *   · renderMarkdown—— 远程渲染要 Obsidian 进程里活的 HTMLElement，跨不过来
 *   · mountEditor   —— 同理，而且契约本身就允许返回 null（核心退回自己的 textarea）
 *   · openExternal  —— 伴侣自己就有 shell.openExternal，绕一圈没意义
 */
export const LOCAL_METHODS = ["assetUrl", "renderMarkdown", "mountEditor", "openExternal"];

/** RPC 的超时。默认 15 秒；这两个要读整个库 / 扫目录，给宽一点。 */
const SLOW = 60000;
export const RPC_TIMEOUTS = {
  loadCards: SLOW,
  listDocs: SLOW,
  listFolders: SLOW,
};

export function timeoutOf(method) {
  return RPC_TIMEOUTS[method] || 15000;
}

// ── 兜底表 ────────────────────────────────────────────────────────
//
// 桥信封里的 `{ok:false}` 只表示「这次调用没成功」。把它翻译成**每个方法自己
// 契约形状**的那句话，是远程适配层的活——因为契约是逐方法的、不统一的：
// writeCard 是三态、loadViewState 绝不抛、readTextFile 偏偏要抛（它明说
// 「文件不在」的 null 和「读取出错」必须分开，混了会让另一台机器上摆好的
// 收纳方框被整份覆盖）。
//
// ⚠️ **必须写成显式对象字面量，不能写成 `for (const m of ADAPTER_METHODS)` 循环。**
// test/seam.spec.js 判「适配层完整」用的是 `\b<方法名>\s*[(:]` 正则；循环生成的话
// 每个方法名在这里只以字符串形式出现，正则**一条都命中不了**——那条守门测试会
// 静默失明，看起来还在跑，其实什么都没守住。

/** writeCard / createCard / createFolder / trashFile / renameFile 这一类共用的失败形状 */
function errResult(message) {
  return { ok: false, reason: "error", message };
}

const OFF_BRIDGE = "与 Obsidian 的连接断了";

export const FALLBACKS = {
  // 唯一一个**故意抛**的：mount 就是为呈现它失败设计的（entry-plugin.js 那边
  // 会把它渲染成一句人能读的话）。塌成空数组的话，用户看到的是一座空库，
  // 而不是「连不上」。
  loadCards: () => {
    throw new Error(OFF_BRIDGE + "：读不到卡片清单");
  },

  // 解析不到就回 null，是契约明写的。
  resolveLink: () => null,

  assetUrl: () => "",

  // 渲染不出来就把原文当文本塞进去——**宁可难看，不可空白**。
  // 一块什么都不显示的空白比一段没排版的文字糟得多（这条口径在契约里
  // mountEditor 那一段写着：「用户看到的是『退回输入框』，而不是一块空白」）。
  renderMarkdown: (md, el) => {
    const doc = el && el.ownerDocument;
    if (!doc || !el) return;
    const p = doc.createElement("p");
    p.textContent = String(md == null ? "" : md);
    el.appendChild(p);
  },

  // 点了没反应比抛出去强：真宿主那边这一条本来就是 fire-and-forget。
  openNote: () => {},

  loadViewState: () => null,
  saveViewState: () => {},
  loadPrefs: () => null,
  savePrefs: () => {},

  writeCard: () => errResult(OFF_BRIDGE + "：这张卡没写进去"),
  listDocs: () => [],
  readBinary: () => null,
  createCard: () => errResult(OFF_BRIDGE + "：这张卡没建出来"),
  createFolder: () => errResult(OFF_BRIDGE + "：这颗晶体没建出来"),

  // 契约要求：没有这个能力的宿主返回**一个空的退订函数**，绝不抛。
  // 断线时我们退化成「什么都不推」，而重连后的对账由 remote.js 自己做。
  watchCards: () => () => {},

  // 契约明文许可：宿主没有这个能力就回 null，核心据此退回自己的 textarea。
  mountEditor: () => null,

  listFolders: () => [],
  trashFile: () => errResult(OFF_BRIDGE + "：没能丢进回收站"),
  openExternal: () => false,
  renameFile: () => errResult(OFF_BRIDGE + "：没能改名"),

  // ⚠️ 这个**抛**，理由见上面那段：null 的语义是「文件不在」，
  // 调用方会拿本地那份覆盖写。把「读取出错」也塌成 null 的话，
  // 一次瞬时失败就足以把另一台机器上摆好的框整份盖掉。
  readTextFile: () => {
    throw new Error(OFF_BRIDGE + "：读不到这个文件（不能当成「文件不在」）");
  },

  writeTextFile: () => errResult(OFF_BRIDGE + "：没写进去"),
};

/**
 * 五堆**必须正好分完** ADAPTER_METHODS —— 不重、不漏、不夹带不存在的名字。
 *
 * 在启动时跑（bridge/server.js 和 remote.js 都调），所以「契约加了方法、
 * 桥忘了归类」会在**第一次启动**就炸，而不是等到用户点到那颗按钮。
 */
export function assertBridgeCoversContract() {
  const buckets = {
    RPC_METHODS,
    STREAM_METHODS,
    BLOB_METHODS,
    STORE_METHODS,
    LOCAL_METHODS,
  };
  const seen = new Map();
  const dup = [];
  for (const [bucket, list] of Object.entries(buckets)) {
    for (const m of list) {
      if (seen.has(m)) dup.push(`${m}（同时在 ${seen.get(m)} 和 ${bucket}）`);
      seen.set(m, bucket);
    }
  }
  const missing = ADAPTER_METHODS.filter((m) => !seen.has(m));
  // 兜底表也得齐——上面那张表是**手写**的，正是最容易漏的地方。
  const noFallback = ADAPTER_METHODS.filter((m) => typeof FALLBACKS[m] !== "function");
  const extraFallback = Object.keys(FALLBACKS).filter((m) => !ADAPTER_METHODS.includes(m));

  const problems = [];
  if (dup.length) problems.push("归类重复：" + dup.join("、"));
  if (missing.length) problems.push("忘了归类：" + missing.join("、"));
  if (noFallback.length) problems.push("忘了写兜底：" + noFallback.join("、"));
  if (extraFallback.length) problems.push("兜底表里有契约里没有的方法：" + extraFallback.join("、"));
  if (problems.length) throw new Error("[bridge] 协议与适配层契约对不上 —— " + problems.join("；"));
  return true;
}
