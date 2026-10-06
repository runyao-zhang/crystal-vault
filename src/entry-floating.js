// 悬浮伴侣的渲染进程入口 —— 第四个入口，和 entry-web / entry-obsidian / entry-plugin 平级。
//
// 它和另外三个唯一的区别是**适配层背后是谁**：那边是 Obsidian / 假盘，
// 这边是一条到 Obsidian 的桥（bridge/client.js）。核心一行不改。
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
 * 把拖拽条上那三颗按钮接上外壳。
 *
 * **先接按钮、再连桥**：桥连不上的时候，用户至少还能把窗关掉/最小化，
 * 而不是对着一扇既没内容也点不动的窗发呆。
 */
function wireChrome() {
  const shell = globalThis.__FLOAT_SHELL__;
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
}

/**
 * @param {object} cfg 由 preload 从命令行参数里带进来（见 floating/preload.js）
 * @param {string} cfg.origin     桥的地址，如 http://127.0.0.1:51234
 * @param {string} cfg.token
 * @param {string} cfg.cardsFolder
 * @param {string} [cfg.keySuffix] 状态命名空间后缀，默认 ":float"
 * @param {object} [cfg.seed]     { viewState, prefs, docPath, scratch, crystal }
 * @param {"reader"|"story"} [cfg.mode]
 * @param {string} [cfg.version]
 */
export async function boot(cfg) {
  const {
    origin,
    token,
    cardsFolder,
    keySuffix = ":float",
    seed = null,
    mode = "reader",
  } = cfg || {};

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
    keySuffix,
    seed,
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

  if (seed && seed.docPath) {
    try {
      await handle.reader.openDoc(seed.docPath);
    } catch {
      // 那份文献可能已经被删了——不是致命错误，让用户自己从列表里挑。
    }
  }

  if (mode === "story") {
    await new Promise((r) => setTimeout(r, 250));
    clickIfPresent("kb-reader-deskbtn");
    await new Promise((r) => setTimeout(r, 350));
    if (seed && seed.crystal) {
      // 偏好先设上：为空时那颗按钮会**转去开文件夹选择器**，那不是我们要的。
      try {
        handle.ctx.state.prefs.readerStoryCrystal = seed.crystal;
      } catch {
        /* 拿不到就让它弹选择器，也不是坏事 */
      }
    }
    clickIfPresent("kb-reader-storywin");
  }

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

// ── 自举 ──────────────────────────────────────────────────────
//
// 配置由 preload 挂到 `window.__CRYSTAL_FLOAT__` 上。这里自己起，
// 是为了让 index.html **不含内联脚本**——CSP 里的 `script-src` 就能收紧到
// `'self'`，不必为了那一句 `ARIFLOAT.boot(...)` 开 `'unsafe-inline'`。
//
// 条件判断是给测试留的：把 bundle 装进一个没有那两个全局的页面时不许自动跑。
if (typeof document !== "undefined") {
  const auto = () => {
    wireChrome();
    const cfg = globalThis.__CRYSTAL_FLOAT__;
    if (!cfg) return;
    boot(cfg).catch((e) => setChromeText("float-status", "启动失败：" + ((e && e.message) || e)));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto);
  else auto();
}
