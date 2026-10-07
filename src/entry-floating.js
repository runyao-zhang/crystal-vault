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
// 结构窗**那个组件本身**。用户 2026-10-07 点名要的就是它——
// 不是"桌面模式的整扇窗"，所以那一扇窗里不再开桌面层，直接挂这个。
import { createEmbedStory } from "./core/embedstory.js";
// 本地打包 pdf.js。**比在 Obsidian 里简单**：那两级 eval / blob 兜底
// （entry-pdf-runtime.js 顶上记着）只是为了把 2MB 塞进 markdown 笔记，
// 伴侣没有那条约束，直接 import 就完了。
import { pdfjs, workerSrc } from "./entry-pdf-runtime.js";

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
  // 结构窗那扇只需要一件事：**固定看哪颗晶体**。
  //
  // ⚠️ 1.0.2 这里还塞过一条"只有一扇铺满的结构窗"的桌面存档（为了让桌面层
  // 恢复它、别触发"替你摆一页 PDF"）。**那一版整个方向是错的**——用户要的是
  // 结构窗**组件**单独分出去，不是桌面模式的整扇窗。现在桌面层根本不参与，
  // 那条存档连同它的占位晶体一并不需要了。
  const prefs = { ...(base.prefs || {}) };
  if (base.crystal) prefs.readerStoryCrystal = base.crystal;
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

  if (role === "story") await bootStory(handle, seed, adapter);
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
 * 结构窗：**直接挂那个组件，不开桌面层。**
 *
 * ── 这一版为什么推翻了上一版 ──
 *
 * 1.0.2 是「开桌面层 + 桌上只摆一扇铺满的结构窗」。用户 2026-10-07 说不对：
 * 「让你把边看边记和结构窗两个**组件**单独分出去，而不是仅把桌面模式的
 * 整扇窗分出去」。量了一遍屏幕上到底有什么，他说得对——那一扇窗里实际是：
 *
 *     .kb-v13-trigger      976×80    ← 晶体库的入口按钮（跟浮窗毫无关系的库层残渣）
 *     .kb-v13-reader-desk  976×778   ← 整个桌面层容器
 *       .kb-v13-desk-win  1378×1180  ← 桌面窗，带自己的 bar「结构：甲晶体 收纳 ✕」+ 拖拽角
 *
 * 那就是「桌面模式的整扇窗」。所以现在**不碰桌面层**，直接把
 * `createEmbedStory` 这个组件挂进窗口——它自带顶栏（画线：看/写、
 * 晶体：X、导入卡片），那才是结构窗本来的样子。
 *
 * ── 两处代价，以及怎么处理的 ──
 *
 * · `onPickCrystal` / `onPickCard` 那两棵树渲染在**阅读器的笔记栏**里，
 *   所以阅读器还是得挂着（只是它的顶栏、页阵、遮罩全被 CSS 收掉了）。
 *   那两棵树走 `handle.reader.pickCrystal()/pickCard()`（核心为此开的口子）。
 * · `onPlaceCard`（点节点 = 把那张卡摆到桌上）**没有桌面可摆了**，
 *   退而求其次：把那张卡的源文件交给 Obsidian 打开——同一件事的另一半。
 */
async function bootStory(handle, seed, adapter) {
  const ctx = handle.ctx;
  // ⚠️ **按类名找，不是 id。** `.kb-v13-reader-main` 只有类名没有 id
  // （对比 `#kb-reader-sheets` 是两者都有）——`getElementById` 会回 null，
  // 于是这里静默 early-return，组件一个都不挂，而**屏幕上什么错都不报**。
  // 这个坑是量「屏幕上到底有什么」量出来的：窗里只剩一个空的
  // `.kb-v13-reader-main`，7 个可见元素。
  const main = document.querySelector(".kb-v13-reader-main");
  if (!main) return;

  let host = document.getElementById("float-story-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "float-story-host";
    main.appendChild(host);
  }

  const prefs = (ctx.state && ctx.state.prefs) || {};
  const boot = prefs.floatStoryCam && Number.isFinite(prefs.floatStoryCam.k) ? prefs.floatStoryCam : null;

  const view = createEmbedStory(ctx, {
    injectStyles: false,
    camera: boot,
    onCamera: (cam) => {
      // 相机是「上次推到哪儿」——跟着这扇窗自己的偏好走（命名空间是 :float:story）。
      try {
        ctx.state.prefs.floatStoryCam = cam;
        if (ctx.savePrefs) ctx.savePrefs();
      } catch {
        /* 记不住相机不该影响看 */
      }
    },
    onCrystal: (key) => {
      try {
        ctx.state.prefs.readerStoryCrystal = key;
        if (ctx.savePrefs) ctx.savePrefs();
      } catch {
        /* 同上 */
      }
      try {
        view.show(key);
      } catch {
        /* 换不过去就留在原来那颗 */
      }
    },
    onPickCrystal: () => {
      try {
        handle.reader.pickCrystal();
      } catch {
        /* 树开不出来不该把窗搞崩 */
      }
    },
    onPickCard: () => {
      try {
        handle.reader.pickCard();
      } catch {
        /* 同上 */
      }
    },
    onPlaceCard: (card) => {
      try {
        if (card && card.path && adapter) adapter.openNote(card.path);
      } catch {
        /* 打开失败就算了 */
      }
    },
  });

  host.appendChild(view.root);

  const keys = (ctx.model && ctx.model.crystalKeys) || [];
  const want = seed && seed.crystal;
  const key = ctx.model && want && ctx.model.hasNode(want) ? want : keys[0] || "";
  if (key) {
    try {
      view.show(key, { keepCamera: !!boot });
    } catch {
      /* 画不出来就留一块空舞台，比把窗搞崩强 */
    }
  } else {
    host.textContent = "这张库里还没有晶体。";
  }

  // 窗尺寸变了要重画一次线（只是重画，不重新 fit——用户推过的相机不该被悄悄重置）。
  const onResize = () => {
    try {
      view.onResize();
    } catch {
      /* 重画失败不该把窗搞崩 */
    }
  };
  window.addEventListener("resize", onResize);
  handle.__floatStory = view;
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
