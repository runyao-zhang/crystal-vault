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
// 结构窗那个组件（3.0 刀 44）。**它是导出的**，所以伴侣能把它挂进自己的窗口，
// 而不是像 1.0.2 那样伪造一条"一扇铺满的桌面存档"把桌面层骗出来。
import { createEmbedStory } from "./core/embedstory.js";
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

  // ⚠️ 这里原本接着一颗「只看笔记栏」的开关注（3.0 刀 43 撤掉）。
  // 它切的是 `kb-float-sideonly`，而那一档靠 `.kb-v13-reader-side` 铺满窗口
  // —— 那一栏整个没有了（用户 10-07 改的架构）。按钮本体也一并从
  // floating/index.html 撤了，`theme.css` 里那三条规则同理。
}

/**
 * 按 role 造种子。
 *
 * `reader` —— 原样用插件给的那份（用户在 Obsidian 里布置好的样子）。
 *
 * `story`  —— 3.0 刀 44 起**只需要往偏好里塞一颗晶体**。
 *
 * ⚠️ 这里从前有一大段伪造桌面存档的代码（一条 `w/h` 比窗口还大的
 * `kind:"storyline"` 记录，配一个认不出的占位晶体），为的是让
 * `setDeskMode(true)` 别走"替你摆一页 PDF"那条兜底。**那一整段删了**——
 * 结构窗现在直接挂组件，桌面层根本不参与，也就没有"兜底摆一页 PDF"这回事。
 * 那一百来行是"把组件挂出去"这件事最绕的一段，它存在只是因为当时没有别的路。
 */
function seedFor(role, seed, cardPath) {
  const base = seed || {};

  if (role === "story") {
    const prefs = { ...(base.prefs || {}) };
    // 插件知道用户刚才在库里待的是哪颗晶体，随 seed 带上来。写进偏好，
    // 免得第一次开这扇窗先弹一棵树让他挑。
    // ⚠️ 只在这条槽**空着**的时候写：用户自己挑过的那颗比插件猜的更准。
    if (!prefs.readerStoryCrystal && base.crystal) prefs.readerStoryCrystal = base.crystal;
    return { ...base, prefs };
  }

  // ── 卡片窗（3.0 刀 44）───────────────────────────────────────────
  //
  // 用户 10-08 选的「复用桌面的卡片窗」：一枚桌面存档，桌上**只摆这一张卡**、
  // 而且给得比窗口大——桌子是 `overflow:hidden`，超出去的被裁掉，
  // 于是"铺满"这件事不必知道窗口此刻的确切尺寸（那个数挂载时才量得到）。
  //
  // ⚠️ **path 不能留空**：`core/prefs.js` 的 `sanitizeDesk` 对非结构窗的 kind
  // 要求 path 非空，空串会让**整条记录被丢掉** → 桌面空着 →
  // `setDeskMode` 走"先替你摆一页 PDF"那条兜底 → 这扇卡片窗里冒出一页 PDF。
  // 所以空 path = 空白新卡那一档，**根本不走桌面**（见 `bootCard`）。
  if (role === "card" && cardPath) {
    const prefs = { ...(base.prefs || {}) };
    const w = Math.max(1200, (globalThis.innerWidth || 1000) + 400);
    const h = Math.max(900, (globalThis.innerHeight || 700) + 400);
    prefs.readerDesk = {
      windows: [{ kind: "card", path: cardPath, crystal: "", cam: null, page: 1, from: 1, to: 1, x: 0, y: 0, w, h, docked: false }],
    };
    return { ...base, prefs };
  }

  return base;
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
  const role = cfg && ["story", "card"].includes(cfg.role) ? cfg.role : "reader";
  const cardPath = (cfg && cfg.path) || "";

  wireChrome(role);
  setChromeText(
    "float-title",
    role === "story" ? "晶体库 · 结构窗" : role === "card" ? "晶体库 · 卡片" : "晶体库 · 边看边记"
  );

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
    // ⚠️ **按窗分家**。几扇窗共用一个键的话，它们会同时防抖写
    // `prefs.readerDesk`——而卡片窗那份存档是"一张卡铺满"、边看边记那份是
    // "用户自己摆的样子"，两边会互相覆盖，几何来回跳。
    //
    // ⚠️ 卡片窗还要**带上那张卡的路径**（3.0 刀 44）：不带的话两张卡的窗写
    // 同一份存档，A 窗写下去 B 窗读到，屏幕上就是"打开这张、显示的是那张"。
    keySuffix: ":float:" + (role === "card" ? "card:" + cardPath : role),
    seed: seedFor(role, seed, cardPath),
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

  // ── 结构窗那一扇（3.0 刀 44）──────────────────────────────────────
  //
  // **能力位**：给了它，阅读器里那几个"开结构窗"的入口就改道到宿主这一份，
  // 桌面层根本不参与（见 core/reader.js 里 `storyHost` 那段）。
  //
  // ⚠️ **必须在 `mount()` 之前造好、而且是个可变的壳**：`show()` 要调到
  // 那一刻还不存在的 embed（embed 要等 `mount()` 回来才有 ctx）。
  // 用一个 `let storyEmbed` 当插槽破掉这个循环——和上面 `renderer` 那一处同一个手法。
  let storyEmbed = null;
  const storyHost =
    role === "story"
      ? {
          show: (key) => {
            if (storyEmbed) storyEmbed.show(key);
          },
          importCard: (path) => (storyEmbed ? storyEmbed.importCard(path) : false),
          placeNewCard: (path) => (storyEmbed ? storyEmbed.placeNewCard(path) : false),
        }
      : null;

  // ── 卡片窗那一档（3.0 刀 44）──────────────────────────────────────
  //
  // 用户 10-08：「我希望在卡片盒里或者结构窗里面打开的卡片**也能成为独立悬浮窗
  // 浮在所有页面之上**，而且**不随桌面的最小化而最小化**。」
  //
  // 那就不能是"伴侣窗口里的一个方块"——方块会跟着伴侣一起最小化，也拖不出去。
  // 只能**每张卡一扇原生窗口**，而原生窗口只有主进程造得出来，所以这里只是
  // 请外壳去开（`floating/main.js` 的 `float:openCard`）。
  //
  // ⚠️ **只在伴侣里给这两个能力位。** Obsidian 应用内那一份不给，
  // 它那边"点卡 = 摆到桌面上"是**对的**（桌面上能同时看好多张、能连线）。
  const shell = globalThis.__FLOAT_SHELL__;
  const cardHost =
    role === "reader" || role === "story"
      ? {
          open: (path) => {
            try {
              if (shell && typeof shell.openCard === "function") shell.openCard(path);
            } catch {
              /* 开不出来不该把当前这扇窗搞崩 */
            }
          },
        }
      : null;

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
      storyHost,
      cardHost,
      // 「新建卡片」那扇窗里存下一张之后：**开一扇属于它的卡片窗，然后关掉自己**。
      //
      // 为什么是"开一扇新的、关掉这扇"而不是"当场变成那张卡"：这扇窗的底子是
      // 阅读器（带着整条顶栏），而要变成的那张卡是**一枚桌面窗**——两套版式在
      // 同一扇窗里换档，会留下"顶栏还在不在""桌面层开没开"一堆中间态。
      // 换一扇窗是一次干净的开始，而那扇窗的尺寸位置由主进程按卡片窗的默认给。
      onCardCreated: role === "card"
        ? (card) => {
            try {
              if (shell && typeof shell.openCard === "function") shell.openCard(card.path);
              if (shell && typeof shell.close === "function") shell.close();
            } catch {
              /* 开不出来也**不许**把这扇窗关掉——那会把用户刚写的卡弄丢在屏幕上 */
            }
          }
        : null,
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

  if (role === "story") await bootStory(handle, (v) => { storyEmbed = v; });
  else if (role === "card") await bootCard(handle, cardPath);
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
 * 结构窗那一扇：**把结构窗组件直接挂进窗口**（3.0 刀 44）。
 *
 * ── 这一版和 1.0.2 的根本差别 ──
 *
 * 1.0.2 是「开桌面层 + 桌上摆一扇铺满的结构窗」：伪造一条桌面存档骗过
 * `setDeskMode` 的兜底，再点两下真按钮把它开出来。量出来的 DOM 是
 * `.kb-v13-reader-desk`（整个桌面层）里装着一扇带自己顶栏和拖拽角的桌面窗。
 *
 * 现在：`.kb-v13-reader-main` 里直接挂一个 `createEmbedStory`，**桌面层不参与**。
 *
 * ── 为什么阅读器还开着 ──
 *
 * 「换晶体」「导入卡片」那两棵树长在阅读器里（`openFolderPick` 是闭包里的），
 * 而它们是这扇窗**必须有**的入口。所以阅读器照旧挂着，只是：
 *   · 顶栏、页阵、收纳栏由 `theme.css` 按 `data-float-role="story"` 收掉；
 *   · 树自己浮在阅读区上面（`z-index` 比结构窗那一层高），照常点得到。
 *
 * ⚠️ 1.0.3 **把「边看边记」那扇的晶体库导航也一起收掉了**（桌面/＋页/收纳栏/
 * 卡片盒/故事线/结构窗）。这一版**不动那些**——两扇窗长得一样是用户 10-07 要的。
 *
 * @param {object} handle  mount() 的返回值
 * @param {(view: object) => void} publish 把造好的 embed 塞进 boot() 那个插槽
 */
async function bootStory(handle, publish) {
  // ⚠️ `.kb-v13-reader-main` **只有类名、没有 id**（`getElementById` 会回 null，
  // 而 null 上再 `.appendChild` 是**当场报错**，比静默好；但更坏的一种是
  // 有人写成 `if (!main) return` —— 那会静默不挂任何东西，而屏幕上什么都不说）。
  const main = handle.reader.el.querySelector(".kb-v13-reader-main");
  if (!main) {
    setChromeText("float-status", "阅读器没有那层容器——结构窗挂不上去");
    return null;
  }

  const host = document.createElement("div");
  host.id = "float-story-host";
  main.appendChild(host);

  const view = createEmbedStory(handle.ctx, {
    injectStyles: false, // 样式走 index.html 那份 <link>，与插件逐字节相同
    // 点节点 = 打开那张卡。**桌面那一版是"摆到桌面上"**，而这里没有桌面可摆
    // ——交给 Obsidian 打开它（`openNote` 是适配层的方法，伴侣这一侧是 RPC）。
    onPlaceCard: (card) => {
      try {
        handle.ctx.adapter.openNote(card && card.path);
      } catch {
        /* 打不开不该把窗搞崩 */
      }
    },
    // 幽灵节点：在窗里换一颗晶体看。**偏好也要跟着写**——那是「结构窗固定看
    // 哪颗」的记忆，只改这一份的话，关掉重开会回到上一次那颗。
    onCrystal: (key) => {
      try {
        handle.ctx.state.prefs = { ...(handle.ctx.state.prefs || {}), readerStoryCrystal: key };
        if (handle.ctx.savePrefs) handle.ctx.savePrefs();
      } catch {
        /* 存不下偏好不影响这一趟看 */
      }
      view.show(key);
    },
    // 这两颗按钮开的是**阅读器那棵树**（和桌面那一版同一个选择器、同一套
    // 抬头与搜索）。挑完由 `storyHost` 交回这里（见 core/reader.js）。
    onPickCrystal: () => {
      try {
        handle.reader.pickCrystal();
      } catch {
        /* 开不出来就算了，别把窗搞崩 */
      }
    },
    onPickCard: () => {
      try {
        handle.reader.pickCard();
      } catch {
        /* 同上 */
      }
    },
  });
  publish(view);
  host.appendChild(view.root);

  // 走**真按钮**（仓库的规矩：句柄上开操作入口等于把真实那条路绕过去）。
  // `openStoryWindow()` 会：先请走「选哪份文献」那层 → 有晶体就 `storyHost.show()`，
  // 没挑过就把树摊开让他挑。两条路都归到 `storyEmbed` 上。
  clickIfPresent("kb-reader-storywin");

  // 窗尺寸变了要让结构窗重画一次线（它自己不会跟着重排）。
  const onResize = () => {
    try {
      view.onResize();
    } catch {
      /* 重画失败不该把窗搞崩 */
    }
  };
  window.addEventListener("resize", onResize);
  handle.__floatResize = onResize;
  return view;
}

/**
 * 卡片窗那一扇（3.0 刀 44）。**一张卡一扇窗。**
 *
 * 两档，靠 `cardPath` 分：
 *
 *   · **有路径** —— 这扇窗就是**那一张卡**。进桌面层，桌上只摆它一张、铺满
 *     （那份存档是我们自己播的，见 `seedFor`）。底子是**桌面的卡片窗**，
 *     所以长得和 Obsidian 里那张**逐像素一样**，`✎` 编辑器、撤销条、
 *     "空基线不许进编辑态"那道保护全是同一份代码——这正是不另写一份的理由。
 *
 *   · **没路径** —— 这是一扇**空白的新卡**（「新建卡片」那条命令 / 用户选的那个 1）。
 *     不碰桌面层，只把阅读器顶栏那颗「新建卡片」摊开：写正文 →（更多）→ 存进晶体库。
 *     存下去之后 `onCardCreated` 会开一扇属于它的卡片窗、再关掉这扇。
 */
async function bootCard(handle, cardPath) {
  // 版式分档：`one` = 只有一张卡（顶栏要收掉），`new` = 正在写一张新卡（顶栏要用）。
  // ⚠️ **不能只按 role 收顶栏**——「新建卡片」那个框就长在顶栏里，
  // 按 role 一刀切会把用户唯一能打字的地方也收掉。
  document.documentElement.setAttribute("data-float-cardmode", cardPath ? "one" : "new");

  if (!cardPath) {
    clickIfPresent("kb-reader-newcard");
    return;
  }

  // 「桌面」那颗会把桌面层拉出来，而存档里只有这一张卡 —— 于是屏幕上就是它。
  clickIfPresent("kb-reader-deskbtn");
  await new Promise((r) => setTimeout(r, 260));

  const onResize = () => {
    try {
      handle.reader.onResize();
    } catch {
      /* 重排失败不该把窗搞崩 */
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
