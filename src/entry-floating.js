// 悬浮伴侣的渲染进程入口 —— 第四个入口，和 entry-web / entry-obsidian / entry-plugin 平级。
//
// 它和另外三个唯一的区别是**适配层背后是谁**：那边是 Obsidian / 假盘，
// 这边是一条到 Obsidian 的桥（bridge/client.js）。核心一行不改。
//
// ── 两扇窗，各自一个 role ──
//
//   `reader` —— 边看边记：阅读器 + 右边那条笔记栏。可以切成「只有笔记栏」。
//   `story`  —— 结构窗：窗口里只有结构窗本身，不要桌面层那套空场。
//
// 两者**同属一个进程、两扇 BrowserWindow**（见 floating/main.js）。
//
// ── 一条 spike 验过、但看代码看不出来的事 ──
//
// **全程不调 `handle.open()`。** 阅读器元素是 `doc.body` 的兄弟节点
// （core/app.js 的 layerRoot），而晶体库那一层在没 `.open` 之前是 `display:none`。
// 所以只 `hydrate()` 不开库，阅读器 + 桌面 + 结构窗照样渲染——实测过
// （spike/float/main.mjs：fullscreenDisplay="none" 而 embedNodes=7）。
//
// 这么做不是省事，是**避害**：`openFullscreen` 里那两个 `migrateCardPos` /
// `migrateCardSides` **会写卡片 frontmatter**。伴侣和应用内那一份是两个进程，
// 让第二个进程也去跑迁移，等于对用户数据做无谓的并发写。迁移交给应用内那一份。

import { mount } from "./core/app.js";
import { createRemoteAdapter } from "./adapters/remote.js";
import { createHttpTransport } from "./bridge/client.js";
import { createPdfRenderer } from "./core/pdfdoc.js";
import { createWebRenderer } from "./adapters/web-render.js";
// 本地打包 pdf.js。**比在 Obsidian 里简单**：那两级 eval / blob 兜底
// （entry-pdf-runtime.js 顶上记着）只是为了把 2MB 塞进 markdown 笔记，
// 伴侣没有那条约束，直接 import 就完了。
import { pdfjs, workerSrc } from "./entry-pdf-runtime.js";

/** 点一颗真按钮。**不新开句柄入口**——app.js 那几行注释写着理由：
 *  给句柄加操作入口，等于把被测的那条路整个绕过去。 */
function clickIfPresent(id) {
  const el = document.getElementById(id);
  if (el && typeof el.click === "function") {
    el.click();
    return true;
  }
  return false;
}

function setChromeText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * 把拖拽条上那几颗按钮接上外壳。
 *
 * **先接按钮、再连桥**：桥连不上的时候，用户至少还能把窗关掉/最小化，
 * 而不是对着一扇既没内容也点不动的窗发呆。
 */
function wireChrome(role) {
  const shell = globalThis.__FLOAT_SHELL__;
  const setRole = () => document.documentElement.setAttribute("data-float-role", role);
  setRole();

  if (!shell) return; // 浏览器里跑（测试）没有外壳，正常

  const pin = document.getElementById("float-pin");
  if (pin) {
    pin.setAttribute("aria-pressed", "true"); // 构造时就是置顶的（见 floating/main.js）
    pin.addEventListener("click", async () => {
      const want = pin.getAttribute("aria-pressed") !== "true";
      let real = want;
      try {
        real = await shell.pin(want);
      } catch {
        /* 外壳没答就当没变 */
      }
      pin.setAttribute("aria-pressed", String(!!real));
    });
  }

  const min = document.getElementById("float-min");
  if (min) min.addEventListener("click", () => shell.minimize());
  const close = document.getElementById("float-close");
  if (close) close.addEventListener("click", () => shell.close());

  // 「只有笔记栏」那颗开关**只对边看边记那扇有意义**（结构窗没有页阵可藏）。
  const side = document.getElementById("float-sideonly");
  if (side) {
    if (role !== "reader") {
      side.style.display = "none";
    } else {
      side.addEventListener("click", () => {
        const on = document.documentElement.classList.toggle("kb-float-sideonly");
        side.setAttribute("aria-pressed", String(on));
        side.textContent = on ? "显示阅读区" : "只看笔记栏";
      });
    }
  }
}

/**
 * 桌面存档的**窗口条数上限**由 core/prefs.js 把关，这里不管。
 *
 * @typedef {object} DeskWinRecord  见 core/prefs.js 的 sanitizeDesk
 */

/**
 * 按 role 造种子。
 *
 * `reader` —— 原样用插件给的那份（用户在 Obsidian 里布置好的样子）。
 *
 * `story`  —— **把桌面存档整个换掉**，只留一扇结构窗、而且铺满窗口。
 *   为什么必须换：`setDeskMode(true)` 在桌面空着时会**替你摆一页 PDF**
 *   （core/reader.js 里那段「存档是空的：切过去看见一块空地…先替他摆一页」）。
 *   结构窗那扇窗里出现一扇 PDF 窗，正是用户 2026-10-06 明确说不要的东西。
 *   播一条非空的存档进去，`restoreDesk` 就会恢复它，那条兜底根本不会走到。
 *   矩形给得比窗口大是**故意的**——桌子是 `overflow:hidden`，超出去的部分被裁掉，
 *   于是「铺满」这件事不必知道桌面此刻的确切尺寸（那个数挂载时才量得到）。
 */
function seedFor(role, seed) {
  const base = seed || {};
  if (role !== "story") return base;

  const w = Math.max(1200, (globalThis.innerWidth || 1000) + 400);
  const h = Math.max(900, (globalThis.innerHeight || 700) + 400);
  // ⚠️ **不能留空。** core/prefs.js 的 `sanitizeDesk` 对 `kind === "storyline"`
  // 要求 crystal 非空（它画的是故事线，认的就是那个 key），空字符串会让**整条记录
  // 被丢掉**，于是桌面空着 → `setDeskMode` 走"替你摆一页 PDF"那条兜底 →
  // 这扇窗里冒出一扇 PDF 窗。这正是用户明确说不要的东西。
  //
  // 取不到真晶体时给一个**认不出的占位**：`sanitizeDesk` 只查非空，
  // 而 `mountEmbedStory` 会拿 `ctx.model.hasNode()` 判它、判不过就退回第一颗晶体。
  // 于是占位值自己不会显示出来，但记录活得下来。
  const PLACEHOLDER = "__float_first_crystal__";
  const crystal = base.crystal || PLACEHOLDER;
  const prefs = { ...(base.prefs || {}) };
  prefs.readerDesk = {
    windows: [
      {
        kind: "storyline",
        path: "",
        crystal,
        cam: null,
        page: 1,
        from: 1,
        to: 1,
        x: 0,
        y: 0,
        w,
        h,
        docked: false,
      },
    ],
  };
  // 那一栏是「结构窗固定看哪颗」的记忆。窗里换晶体时它会跟着改。
  // **占位值不写进偏好**——`storyCrystalPref()` 拿 `model.hasNode()` 判它，
  // 判不过就当"没挑过"，那颗按钮会转去弹文件夹选择器（那不是我们要的）。
  if (crystal !== PLACEHOLDER) prefs.readerStoryCrystal = crystal;

  return { ...base, prefs };
}

/**
 * @param {object} cfg 由 preload 从命令行参数里带进来（见 floating/preload.js）
 * @param {string} cfg.origin     桥的地址，如 http://127.0.0.1:51234
 * @param {string} cfg.token
 * @param {string} cfg.cardsFolder
 * @param {"reader"|"story"} [cfg.role]
 * @param {object} [cfg.seed]     { viewState, prefs, docPath, scratch, crystal }
 * @param {string} [cfg.version]
 */
export async function boot(cfg) {
  const { origin, token, cardsFolder, seed = null } = cfg || {};
  const role = cfg && cfg.role === "story" ? "story" : "reader";

  wireChrome(role);
  setChromeText("float-title", role === "story" ? "晶体库 · 结构窗" : "晶体库 · 边看边记");

  if (!origin || !token) {
    setChromeText("float-status", "没有桥的地址——请从 Obsidian 里打开这个窗口");
    return null;
  }

  setChromeText("float-status", "连接中…");

  const transport = createHttpTransport({ origin, token });

  // 本地渲染器要拿适配层的 assetUrl（图片走 /blob），而适配层又要拿渲染器——
  // 循环引用。用**延迟建**破掉，和 entry-web.js 那一处同一个手法。
  let renderer = null;

  const adapter = createRemoteAdapter({
    transport,
    cardsFolder,
    // ⚠️ **按 role 分家**。两扇窗共用一个键的话，它们会同时防抖写
    // `prefs.readerDesk`——而结构窗那扇的桌面存档是"一扇铺满的窗"、
    // 边看边记那扇是"用户自己摆的样子"，两边会互相覆盖，几何来回跳。
    keySuffix: ":float:" + role,
    seed: seedFor(role, seed),
    render: (md, el, srcPath) => {
      renderer = renderer || createWebRenderer({ assetUrl: (p) => adapter.assetUrl(p) });
      return renderer(md, el, srcPath);
    },
    // 外部标签页的兜底：伴侣自己有 shell，让外壳去开。
    openExternalImpl: (url) => {
      const shell = globalThis.__FLOAT_SHELL__;
      return shell && typeof shell.openExternal === "function" ? shell.openExternal(url) : false;
    },
  });

  // ⚠️ **必须在 mount 之前预读。**
  //
  // 契约里 `loadViewState` / `loadPrefs` 是**同步**的（`() => (object|null)`），
  // 而 mount 会在里面**同步**问一次（`core/app.js:1648` 那句没有 await）。
  // 桥是异步的，所以只能在 mount 之前把这些值先拉进缓存，让那个同步调用答得出来。
  // 不预读的话核心拿到的是"没存过"——播种、用户布置好的布局、上次看到哪儿，
  // 全都静默失效。
  try {
    await adapter.prefetch();
  } catch {
    /* 预读失败就当没存过，不影响窗能开 */
  }

  const pdfRenderer = createPdfRenderer({ pdfjs, workerSrc });

  let handle;
  try {
    handle = await mount({
      adapter,
      container: document.getElementById("kb-float-mount"),
      win: window,
      doc: document,
      pdfRenderer,
      // 样式走 index.html 里的 <link>（styles.css 由构建产出，与插件那份逐字节相同）。
      // 运行时一份都不注——省掉一条 `style-src 'unsafe-inline'`。
      injectStyles: false,
      // 草稿纸落在哪儿，由插件那边随 seed 传过来（它知道卡片目录）。
      scratch: (seed && seed.scratch) || null,
      dockColor: (seed && seed.dockColor) || "",
    });
  } catch (e) {
    setChromeText("float-status", "库没打开：" + ((e && e.message) || e));
    return null;
  }

  // 只读地把状态装进来：**不开库层、不跑那两个会写卡片的迁移**（见文件头）。
  if (typeof handle.hydrate === "function") handle.hydrate();

  // 阅读器这一层是 body 级的 fixed 覆盖层，所以下面这一步就等于"整个窗口都是阅读器"。
  handle.reader.open();
  await new Promise((r) => setTimeout(r, 120));

  if (role === "story") await bootStory(handle, seed);
  else await bootReader(handle, seed);

  // 桥断了要让用户**看见**，而不是留一扇正在编辑僵尸文件的窗（见 README 的风险清单）。
  transport.subscribe({
    onStatus(s) {
      if (s === "closed") setChromeText("float-status", "与 Obsidian 的连接断了");
      else if (s === "open") setChromeText("float-status", "");
    },
  });

  setChromeText("float-status", "");
  globalThis.__FLOAT__ = handle;
  return handle;
}

/** 边看边记：打开上次那份文献。 */
async function bootReader(handle, seed) {
  if (seed && seed.docPath) {
    try {
      await handle.reader.openDoc(seed.docPath);
    } catch {
      // 那份文献可能已经被删了——不是致命错误，让用户自己从列表里挑。
    }
  }
}

/**
 * 结构窗：开桌面层，但**桌上只有一扇铺满的结构窗**。
 *
 * 两步都走**真实按钮**（不新开句柄入口，见 app.js 那几行注释）：
 *   ① 「桌面」——`setDeskMode(true)`。种子里的存档非空，所以它恢复我们那条
 *      单窗记录，**不会**触发"替你摆一页 PDF"那条兜底。
 *   ② 「结构窗」——已经开着就只是抬到前面，不会开出第二扇。
 */
async function bootStory(handle, seed) {
  clickIfPresent("kb-reader-deskbtn");
  await new Promise((r) => setTimeout(r, 260));

  // 偏好兜一道：没设过的话那颗按钮会**转去开文件夹选择器**（那不是我们要的）。
  // 占位值**不写**——它不是真晶体，写进去反而会触发选择器。
  if (seed && seed.crystal && seed.crystal !== "__float_first_crystal__") {
    try {
      handle.ctx.state.prefs.readerStoryCrystal = seed.crystal;
    } catch {
      /* 拿不到就让它弹选择器，也不是坏事 */
    }
  }
  clickIfPresent("kb-reader-storywin");
  await new Promise((r) => setTimeout(r, 320));

  // 窗尺寸变了要让结构窗重画一次线（桌面窗自己不会跟着重排）。
  const onResize = () => {
    try {
      const rt = handle.ctx && handle.ctx.reader;
      if (rt && typeof rt.onResize === "function") rt.onResize();
    } catch {
      /* 重画失败不该把窗搞崩 */
    }
  };
  window.addEventListener("resize", onResize);
  handle.__floatResize = onResize;
}

// ── 自举 ──────────────────────────────────────────────────────
//
// 配置由 preload 挂到 `window.__CRYSTAL_FLOAT__` 上。这里自己起，
// 是为了让 index.html **不含内联脚本**——CSP 里的 `script-src` 就能收紧到
// `'self'`，不必为了那一句 `ARIFLOAT.boot(...)` 开 `'unsafe-inline'`。
//
// 条件判断是给测试留的：把 bundle 装进一个没有那两个全局的页面时不许自动跑。
if (typeof document !== "undefined") {
  const auto = () => {
    const cfg = globalThis.__CRYSTAL_FLOAT__;
    if (!cfg) {
      // 没有配置（比如被当成普通页面打开）：至少把按钮接上，别让窗完全点不动。
      wireChrome("reader");
      return;
    }
    boot(cfg).catch((e) => setChromeText("float-status", "启动失败：" + ((e && e.message) || e)));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto);
  else auto();
}
