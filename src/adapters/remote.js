// 远程适配层 —— 悬浮伴侣（独立 Electron 窗口）这一侧的宿主触点。
//
// 它**不是**一个新的接缝：契约还是 adapter.js 那一份 22 个方法，形状一模一样。
// 变的是「这些方法背后是谁」——前面两个实现背后是 Obsidian / 假盘，
// 这个背后是一条到 Obsidian 的桥（bridge/client.js 的 transport）。
// test/seam.spec.js 会像要求另外两个实现一样要求它把 22 个方法都写出来。
//
// ── 三件容易做错的事，都写在各处注释里 ──
//
// 1. **兜底是逐方法的，不是统一的。** 桥信封 `{ok:false}` 只说「这次没成功」，
//    翻译成各方法自己的契约形状是这里的活（表在 bridge/protocol.js 的 FALLBACKS）。
//    `loadCards` 要抛（否则用户看到一座空库而不是「连不上」），
//    `readTextFile` 也要抛（null 的语义是「文件不在」，塌成 null 会让另一台机器
//    摆好的收纳方框被整份覆盖），而 `listDocs` 回 `[]`、`assetUrl` 回 `""`。
//
// 2. **状态键要带命名空间。** 和应用内那一份共用同一个键的话，两边会同时防抖写
//    `prefs.readerDesk`——而桌窗坐标是**桌面局部坐标**，悬浮窗的桌面尺寸不同，
//    同一个 {x,y,w,h} 含义不同，几何会在两个值之间来回跳。见下面 `nsKey`。
//
// 3. **断线后要对一次账。** 契约里没有「重新同步」这个信号，得自己造：
//    重连时全量读一次 loadCards，和上次那份比，把差异按契约的三元组补报出去。

import { toLinkTarget, viewStateKey, prefsKey } from "../adapter.js";
import { FALLBACKS, assertBridgeCoversContract } from "../bridge/protocol.js";

/** 深拷贝一份种子状态：它是从插件那边传过来的对象，别让核心改到对方的引用上。 */
function clone(o) {
  if (o == null) return o;
  try {
    return JSON.parse(JSON.stringify(o));
  } catch {
    return null;
  }
}

function parseObject(raw) {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null; // 坏 JSON 一律当「没存过」，与另两个实现同一条口径
  }
}

/**
 * @param {object} opts
 * @param {object} opts.transport   见 bridge/client.js（进程内的 / HTTP 的，接口一样）
 * @param {string} opts.cardsFolder 卡片目录。**视图状态/偏好的键里要带它**——
 *   同一个人会有多个 vault，共用一个全局键会互相串（adapter.js 的 viewStateKey 写着）。
 * @param {string} [opts.keySuffix] 命名空间后缀。**这就是上面第 2 条**。
 *   做成参数而不是硬编码，是为了让测试能像 fake.js 的 storageKey 那样隔离实例。
 * @param {object} [opts.seed]      启动播种：`{ viewState, prefs }`。
 *   只在命名空间键**还不存在**时用一次——用户在 Obsidian 里布置好再「飘出来」，
 *   第一次打开该是那个样子，而不是默认样子。之后各存各的，永不回看。
 * @param {Function} [opts.render]  (md, el, srcPath) => void|Promise<void>
 *   本地 markdown 渲染器。不传就退回「原文当纯文本」——难看但不空白。
 * @param {Function} [opts.openExternalImpl] (url) => boolean
 *   把网址交给系统浏览器。伴侣那边走 preload → shell.openExternal。
 * @returns {import("../adapter.js").Adapter}
 */
export function createRemoteAdapter({
  transport,
  cardsFolder,
  keySuffix = "",
  seed = null,
  render = null,
  openExternalImpl = null,
} = {}) {
  if (!transport) throw new Error("[remote] 缺少 transport");

  // 契约与桥对不上就**当场**炸。放在这里而不是某个启动脚本里，是因为
  // 测试、伴侣、插件三处都会走到这一行。
  assertBridgeCoversContract();

  const nsKey = (base) => base + keySuffix;

  /**
   * 在 loadCards / listDocs 里见过的路径。
   *
   * 用途只有一个：保住 `assetUrl` 契约里「解析不到回 `""`」那一半。
   * Obsidian 那边靠 `metadataCache.getFirstLinkpathDest` 判断能不能解析；
   * 我们看不见那个索引，只能拿「见过的路径」近似。**这是近似，不是等价**——
   * 一张还没进过 loadCards 的图会解析不出来。主内容是 PDF 与图片，
   * 它们都从 listDocs 里来，所以够用。
   */
  const known = new Set();

  /**
   * 走桥并**按该方法的契约形状兜底**。
   * 统一兜底是错的：`readTextFile` 要抛、`loadCards` 要抛、别的多半要回空值。
   */
  async function over(method, args) {
    try {
      return await transport.call(method, args);
    } catch (e) {
      const fb = FALLBACKS[method];
      if (!fb) throw e;
      return fb.apply(null, args || []);
    }
  }

  const adapter = {
    async loadCards() {
      const cards = await over("loadCards", []);
      if (Array.isArray(cards)) {
        for (const c of cards) if (c && c.path) known.add(c.path);
      }
      return cards;
    },

    // 解析不到回 null —— 契约明写。这里**不做本地近似**：双链解析要的是
    // Obsidian 的链接索引（不带扩展名、忽略目录、还认别名），猜错了会给出
    // 一张"看起来很正常"的错卡，比回 null 糟得多。
    async resolveLink(target, fromPath) {
      return over("resolveLink", [target, fromPath]);
    },

    // ---- 以下四个是**本地**的，不过桥（见 protocol.js 的 LOCAL_METHODS）----

    assetUrl(path) {
      const p = String(path == null ? "" : path);
      if (!p) return "";
      if (!known.has(p)) return "";
      return transport.blobUrl(p);
    },

    renderMarkdown(md, el, srcPath) {
      if (render) {
        try {
          return render(md, el, srcPath);
        } catch {
          // 本地渲染器自己挂了也**不能留一块空白**——退回纯文本。
          return FALLBACKS.renderMarkdown(md, el);
        }
      }
      return FALLBACKS.renderMarkdown(md, el);
    },

    // 契约明文许可：跨不了进程的宿主回 null，核心据此退回自己的 <textarea>。
    // ⚠️ 这条**必须让用户知道**：悬浮窗里编辑卡片正文是纯文本框，
    // 不是 Obsidian 的实时预览编辑器（要在首次运行提示里说）。
    mountEditor() {
      return Promise.resolve(null);
    },

    openExternal(url) {
      const u = String(url || "");
      if (!/^https?:/i.test(u)) return false;
      if (openExternalImpl) {
        try {
          return !!openExternalImpl(u);
        } catch {
          return false;
        }
      }
      try {
        if (globalThis.open) {
          globalThis.open(u, "_blank", "noopener,noreferrer");
          return true;
        }
      } catch {
        /* 打不开就回 false，绝不抛 */
      }
      return false;
    },

    // ---- 存储：命名空间 + 播种（见文件头第 2 条）----

    async loadViewState() {
      const key = nsKey(viewStateKey(cardsFolder));
      let raw = null;
      try {
        raw = await transport.getStored(key);
      } catch {
        return FALLBACKS.loadViewState();
      }
      // 只在这一格**还没有**的时候用种子。写过一次之后各存各的，永不回看——
      // 否则用户把悬浮窗挪成自己习惯的样子，下次启动又被打回 Obsidian 那套几何。
      if (raw == null) return seed && seed.viewState ? clone(seed.viewState) : null;
      return parseObject(raw);
    },

    async saveViewState(state) {
      try {
        await transport.setStored(nsKey(viewStateKey(cardsFolder)), JSON.stringify(state));
      } catch {
        // 丢就丢了，不该影响界面能用（与另两个实现同一条口径）
      }
    },

    async loadPrefs() {
      const key = nsKey(prefsKey(cardsFolder));
      let raw = null;
      try {
        raw = await transport.getStored(key);
      } catch {
        return FALLBACKS.loadPrefs();
      }
      if (raw == null) return seed && seed.prefs ? clone(seed.prefs) : null;
      return parseObject(raw);
    },

    async savePrefs(prefs) {
      try {
        await transport.setStored(nsKey(prefsKey(cardsFolder)), JSON.stringify(prefs));
      } catch {
        /* 同 saveViewState */
      }
    },

    // ---- 卡片与文件：远程，逐方法兜底 ----

    async writeCard(path, content, opts) {
      return over("writeCard", [path, content, opts]);
    },

    async listDocs() {
      const docs = await over("listDocs", []);
      if (Array.isArray(docs)) {
        for (const d of docs) if (d && d.path) known.add(d.path);
      }
      return docs;
    },

    async readBinary(path) {
      try {
        const buf = await transport.readBinary(path);
        return buf == null ? null : buf;
      } catch {
        return null; // 契约：读不出返回 null，**绝不抛**
      }
    },

    async createCard(name, content, folder) {
      return over("createCard", [name, content, folder]);
    },

    async createFolder(folder) {
      return over("createFolder", [folder]);
    },

    async listFolders() {
      return over("listFolders", []);
    },

    async trashFile(path) {
      return over("trashFile", [path]);
    },

    async renameFile(path, newName) {
      return over("renameFile", [path, newName]);
    },

    async readTextFile(path) {
      // ⚠️ 这个**要抛**，而且兜底也得抛——见 protocol.js 里那条的说明。
      return over("readTextFile", [path]);
    },

    async writeTextFile(path, text) {
      return over("writeTextFile", [path, text]);
    },

    async openNote(path, opts) {
      return over("openNote", [path, opts]);
    },

    /**
     * 订阅外部改动。契约里**没有**「重新同步」这个信号，所以自己造一个：
     *
     *   断线 → 重连（transport 报 "open"）时，全量读一次 loadCards，
     *   和上次那份逐路径比内容，差异按契约的三元组补报出去。
     *
     * 这样：删除也覆盖得到（比对会发现某条路径没了）、代价是每次重连一次全量读、
     * 而且**完全复用核心自己那套内容比对**，服务端不必记任何增量账。
     *
     * ⚠️ 改名在重连那一趟会退化成「删旧的 + 加新的」（全量比对分不出改名与
     * 「删一张、加一张同名内容」）。这是可接受的降级：正常在线时走的是 SSE
     * 推来的真三元组、带 `from`，只有重连那一趟才降级；而降级后的形状
     * （cb(card) + cb(null, undefined, oldPath)）核心照样处理得对，
     * **不会造出那张内容为空的影子卡**。
     */
    watchCards(cb) {
      if (typeof cb !== "function") return () => {};
      let stopped = false;
      /** 上次已知的全景：path -> content。null = 还没有基线。 */
      let last = null;

      function applyToBaseline(p) {
        if (!last) return;
        if (p.gone) last.delete(p.gone);
        if (p.from) last.delete(p.from);
        if (p.card && p.card.path) last.set(p.card.path, p.card.content);
      }

      async function resync() {
        let cards;
        try {
          cards = await transport.call("loadCards", []);
        } catch {
          return; // 还是连不上，下一次 "open" 再说
        }
        if (stopped || !Array.isArray(cards)) return;
        const now = new Map();
        for (const c of cards) if (c && c.path) now.set(c.path, c.content);

        if (last) {
          // 新增 / 内容变了
          for (const [path, content] of now) {
            if (!last.has(path) || last.get(path) !== content) {
              const card = cards.find((c) => c.path === path);
              if (card) cb(card, undefined);
            }
          }
          // 没了
          for (const path of last.keys()) {
            if (!now.has(path)) cb(null, undefined, path);
          }
        }
        last = now;
      }

      const off =
        transport.subscribe({
          onCard(p) {
            if (stopped || !p) return;
            applyToBaseline(p);
            if (p.gone) cb(null, undefined, p.gone);
            else if (p.card) cb(p.card, p.from);
          },
          onStatus(s) {
            if (stopped) return;
            // 第一次连上也要走一趟：它顺手把基线建立起来（last 为 null 时不报任何事件）。
            if (s === "open") resync();
          },
        }) || (() => {});

      return () => {
        stopped = true;
        try {
          off();
        } catch {
          /* 退订失败不该把拆机搅黄 */
        }
      };
    },
  };

  return adapter;
}
