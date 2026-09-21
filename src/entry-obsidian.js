// Obsidian 适配层 —— 14 个宿主触点（对 ADAPTER_METHODS 数）全部收敛在这里，核心不碰 app/dv。
//
// 落回 vault 时，dataviewjs 代码块里只有一行：
//   await ARI.bootObsidian(dv, this.container);

import { mount } from "./core/app.js";
import { toStr } from "./core/dom.js";
import { toLinkTarget, viewStateKey, prefsKey } from "./adapter.js";
import { CARDS_FOLDER, VAULT_PDF_RUNTIME_PATH } from "./config.js";
import { createLazyPdfRenderer } from "./core/pdfdoc.js";
// ⚠️ **这里不许 import pdf.js。**
//
// 一开始是 import 的，esbuild 就把它合进了那张 markdown 笔记——笔记从 7,665 行
// 涨到 30,260 行、346KB 涨到 2.6MB，Obsidian 的编辑器**直接打不开它**；
// 而块在笔记里，笔记打不开，块就永远没机会跑。pdf.js 现在是 vault 里另外一份
// .js（`dist/pdf-runtime.js` 落过去的），由下面 readPdfRuntime 按需读进来。
//
// 这条没有任何自动检查守得住「你别 import」这个动作本身，但**有守得住结果的**：
// scripts/build.mjs 末尾会体检那份产物的行数与体积，超了直接失败。

// 文献阅读器认得的扩展名。**pptx 不在里面，也不打算加**——Obsidian 和 pdf.js
// 都渲染不了它，收进来只会变成一条「点了没反应」的条目。用户自己导出成 PDF、
// 或导出成每页一张图再进来（3.0 路线图·刀 6 里写明了）。
const DOC_KINDS = {
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  svg: "image",
  avif: "image",
  md: "markdown",
};

// watchCards 的防抖窗口。与视图状态落盘那个 250ms 同一个量级，取 400 是因为
// 它挡的是**别人写完盘之后的一连串余波**（同步落盘、metadataCache 重解析），
// 而不是用户手速——那是「一件事办完了没有」的量级，不是「手停了没有」。
//
// 顺带也把「我们自己写盘引起的回声」挡成一次：核心那边还有一道内容比较兜底
// （见 core/app.js 的 applyExternalChange），两道都在，不是重复。
const WATCH_DEBOUNCE_MS = 400;

/**
 * tags 归一成字符串数组。
 *
 * **别写回 `(fm.tags || []).map(...)`。** Dataview 的 `p.tags` 一定是数组，
 * 但 Obsidian 的 frontmatter 是**原样 YAML**：哪张卡写成 `tags: 单个词` 而不是
 * `[a, b]` 行内列表，读回来就是字符串，`.map` 直接抛 TypeError。
 *
 * 而 readCard 在 loadCards 里是**逐张**跑的——抛一张，整次加载就挂了，
 * 笔记里只剩一句「晶体库挂载失败」。一张卡的 tags 写得随意，不该有这种后果。
 */
function tagsOf(v) {
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean);
  if (v == null || v === "") return [];
  return [toStr(v)].filter(Boolean);
}

/** 异常转一句人能读的话。适配层的错误要能直接显示在界面上，不能是 [object Object]。 */
function errText(e) {
  if (!e) return "未知错误";
  if (typeof e === "string") return e;
  return String(e.message || e);
}

/**
 * Obsidian 适配层。**两个入口共用它**：
 *   · dataviewjs 那条（`bootObsidian`）—— 传 `dv`，渲染走 Dataview 暴露的原生渲染器；
 *   · 插件那条（`entry-plugin.js`）—— 不传 `dv`，渲染走 `MarkdownRenderer`。
 *
 * 三种参数化，都是为了「一份内核、两扇门」：
 *   @param {object|null} [dv]        Dataview 的 dv 对象。**没有也能跑**（插件里就没有）。
 *   @param {object}      app         Obsidian 的 app。两条路都要。
 *   @param {string}      [cardsFolder] 卡片目录。默认取 config 里那个写死的值；
 *                                     插件版从设置里来。
 *   @param {Function}    [renderMd]  自己实现渲染时用（插件版传 MarkdownRenderer 的封装）。
 *                                   给了它就不看 `dv`。
 */
export function createObsidianAdapter({
  dv = null,
  app,
  cardsFolder = CARDS_FOLDER,
  renderMd = null,
  store = null,
}) {
  // 键带卡片目录路径：同一个人的多个 vault 不能共用一个全局键。
  // 代价是各端布局独立（桌面排好的画布不会同步到手机），这条在 #9 里已记录接受。
  const viewKey = viewStateKey(cardsFolder);
  // #22 偏好另存一个键：清「上次看到哪儿」不该把用户调好的颜色也清掉
  const prefKey = prefsKey(cardsFolder);

  /**
   * 「上次看到哪儿」和偏好往哪儿写。
   *
   * 契约是**两个方法、进出都是 JSON 字符串**（不是解析好的对象）：
   *   `store.get(key) -> string | null`、`store.set(key, str)`
   *
   * 定成字符串是有意的——这样默认那条路（localStorage）和从前**逐字节等价**，
   * 而它是真正被日常使用和测试覆盖的那一条；换后端只是换一个实现，
   * 解析、容错、脏数据兜底那些逻辑一份都不用重写。
   *
   * 插件形态传自己的 store（落在 `plugin.saveData` 里，跟着 vault 走），
   * dataviewjs 形态不传，用下面这个默认的。
   */
  const backing =
    store ||
    {
      get(key) {
        try {
          return window.localStorage.getItem(key);
        } catch (e) {
          return null;
        }
      },
      set(key, str) {
        try {
          window.localStorage.setItem(key, str);
        } catch (e) {
          // 存储写满或被禁用：状态丢就丢了，不该影响界面能用
        }
      },
    };

  // 读全文的唯一入口。**loadCards 与 writeCard 的基线比对必须走同一条路**——
  // 两条路要是在行尾规范化（CRLF/LF）或解码上有任何差别，核心每次保存都会拿到
  // 一个与磁盘「看起来不一样」的基线，于是每次保存都报「在别处被改过」这种假冲突，
  // 而用户什么都没动过。这类 bug 只在真机上、只在有 CRLF 文件时出现，最难查。
  async function readText(path) {
    try {
      const file = app.vault.getAbstractFileByPath(path);
      if (file) return await app.vault.read(file);
    } catch (e) {
      // 落到下面的低层读
    }
    return app.vault.adapter.read(path);
  }

  /**
   * 把一个 vault 文件读成契约里的 Card（见 adapter.js）。
   * **loadCards 与 watchCards 共用这一条读法**：两处要是各自拼一遍，
   * 字段名或取值方式迟早漂移，表现是「外部改动刷新出来的卡跟重新加载的不一样」。
   */
  async function readCard(file) {
    // 字段值走 metadataCache，与下面 resolveLink 同一个出处。
    // 刚从别处同步下来、cache 还没解析完的文件拿不到 frontmatter——按空处理，
    // 不报错：那次改动随后会再来一记（cache 就绪后 metadataCache 也会变）。
    const fm = (app.metadataCache.getFileCache(file) || {}).frontmatter || {};
    let content = "";
    try {
      content = await readText(file.path);
    } catch (e) {
      content = "";
    }
    return {
      path: file.path,
      folder: toStr(file.parent && file.parent.path),
      name: toStr(file.basename),
      concept: toStr(fm["概念"]),
      tags: tagsOf(fm.tags),
      source: toStr(fm["来源"]),
      content,
    };
  }

  /**
   * 卡片目录那一棵子树里的**全部文件与文件夹**。
   *
   * ⚠️ 这里**故意不用 `vault.getFiles()` / `getMarkdownFiles()` / `getAllLoadedFiles()`**
   * （3.0 刀 11）。那三个返回的都是**整个 vault** 的文件表——这个插件只管知识卡片，
   * 却把用户所有笔记的路径都过了一遍。内容一个字节都没读，但「列了一遍」这件事
   * 本身，在社区目录的自动审查里是一条独立的建议项（Vault Enumeration），
   * 而**它还说得对**。
   *
   * 换成从卡片目录顺着 `children` 往下走。好处不只是过审：
   * **范围就是用户在设置里指的那个目录**，换成哪个就只看哪个，
   * 别的文件夹连名字都不进内存。dataviewjs 形态下这个目录是写死的常量，
   * 那时这条改进照样成立（只是没有设置可换）。
   *
   * 目录不存在（还没建、或者路径填错）时返回空——那时库里本来就一张卡都没有，
   * **空是对的答案**，不是错误。
   */
  function walkCardsFolder() {
    const rootPath = toStr(cardsFolder).replace(/\/+$/, "");
    const root = rootPath && app.vault.getFolderByPath ? app.vault.getFolderByPath(rootPath) : null;
    const files = [];
    const folders = [];
    if (!root) return { rootPath, root: null, files, folders };
    const walk = (folder) => {
      for (const child of folder.children || []) {
        // 宿主用 `children` 区分文件夹与文件（同下面 listFolders 的老判据）
        if (child.children !== undefined) {
          folders.push(child);
          walk(child);
        } else {
          files.push(child);
        }
      }
    };
    walk(root);
    return { rootPath, root, files, folders };
  }

  return {
    // ⚠️ 这里**故意不用 `dv.pages()`**，别改回去。
    //
    // Dataview 会把一次查询碰过的文件登记成**这个块的依赖**，此后任何一个依赖文件
    // 被写盘，它就把整个 dataviewjs 块重跑一遍：宿主销毁容器 → 重建 → 从头 mount。
    // 表现就是用户报的「保存后闪退」——晶体库肉眼可见地关掉再开，而且 `loadCards`
    // 那一趟全量读盘整段挡在清理旧 DOM 之前（见 core/app.js 的 mount）。
    //
    // 于是这里绕开 Dataview 自己的查询，改走 vault 的文件表 + metadataCache：
    // 本块在 Dataview 眼里从此**没有任何依赖**，写盘不再触发重跑。
    // 「外部改动要能自动出现」由契约里的 watchCards 负责，那条路是增量的。
    async loadCards() {
      const files = walkCardsFolder().files.filter((f) => f.path.toLowerCase().endsWith(".md"));
      // 并行读：原来是逐个 await，30 张卡就是 30 个来回串起来。
      // 这一趟现在只在挂载时跑一次，但仍然是最长的等待，没有理由串着做。
      return Promise.all(files.map((f) => readCard(f)));
    },

    /**
     * 外部改动。三个来源：多设备同步（FNS 把别的设备上的改动拖下来）、
     * 用户在分屏/别处手改这张卡、别的插件改盘。这些核心自己听不见——
     * 关掉 Dataview 自动刷新之后尤其听不见，所以这条路必须补上。
     */
    watchCards(cb) {
      // 宿主的事件比核心想要的密得多：一次保存连着来 modify + metadataCache changed，
      // 一次同步拖下来更是连着来一串。在这里就压成一记——核心连「事件有多密」
      // 都不该知道，那是宿主的事。
      const pending = new Map(); // path -> File，一记窗口内同一个文件只算一次
      let timer = 0;
      const bump = (file) => {
        const path = file && file.path;
        // 前缀一定带斜杠：不带的话「知识卡片2」这种同前缀目录会被误伤
        if (!path || !path.startsWith(cardsFolder + "/") || !path.endsWith(".md")) return;
        pending.set(path, file);
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const files = Array.from(pending.values());
          pending.clear();
          for (const f of files) {
            let card;
            try {
              card = await readCard(f);
            } catch (e) {
              continue; // 读不出来（正被删/改名）就别惊动核心
            }
            cb(card);
          }
        }, WATCH_DEBOUNCE_MS);
      };
      // 两处都要听，理由不同：
      //   vault.modify          —— 内容变了（别处改盘、别的设备同步下来）
      //   metadataCache.changed —— 字段值变了。**必须单独听这一个**：getFileCache
      //     在写盘之后有一小段时间还是旧的，只靠前一个事件会读到「新正文 + 旧字段」，
      //     把过期字段写进模型——而后面再没有第三个事件来纠正它，那张卡的概念/来源
      //     就这么错下去，直到重开。
      // 两个事件会被 400ms 的防抖收进同一记（按 path 去重），不会重复读盘。
      const refModify = app.vault.on("modify", bump);
      const refMeta = app.metadataCache.on("changed", (file) => bump(file));
      return () => {
        clearTimeout(timer);
        pending.clear();
        app.vault.offref(refModify);
        app.metadataCache.offref(refMeta);
      };
    },

    resolveLink(target, fromPath) {
      const clean = String(target || "").split("#")[0];
      const dest = app.metadataCache.getFirstLinkpathDest(clean, fromPath);
      if (!dest) return null;
      const fc = app.metadataCache.getCache(dest.path);
      const fm = (fc && fc.frontmatter) || {};
      return toLinkTarget({
        path: dest.path,
        name: toStr(dest.basename),
        concept: toStr(fm["概念"]),
        tags: tagsOf(fm.tags),
        source: toStr(fm["来源"]),
      });
    },

    // Obsidian 侧由原生渲染器自己解析图片，核心不会调到这里。
    // 保留是因为它是契约的一部分，换宿主时需要它。
    assetUrl(path) {
      try {
        const dest = app.metadataCache.getFirstLinkpathDest(String(path || ""), "");
        return dest ? app.vault.getResourcePath(dest) : "";
      } catch (e) {
        return "";
      }
    },

    // #5 / ADR-0002：正文整段交给**宿主的**渲染器，核心不手搓一遍。
    //
    // 两条路，同一件事：
    //   · dataviewjs 里**不能** `require('obsidian')`（会抛 Cannot find module），
    //     也没有全局 `MarkdownRenderer`（它不是全局变量）——只能借 Dataview 的
    //     `dv.api.renderValue`，Component 传 `dv.component` 且不要自己 unload()。
    //   · 插件里反过来：`require('obsidian')` 才是正路，`MarkdownRenderer.render`
    //     直接可用，Component 传插件自己（`this`）。入口把这件事包成 `renderMd`
    //     递进来，适配层只负责调它——**判断只留一处**。
    renderMarkdown(md, el, srcPath) {
      if (renderMd) return renderMd(md, el, srcPath);
      return dv.api.renderValue(md, el, dv.component, srcPath || dv.currentFilePath);
    },

        /**
     * 3.0 刀 9 第三版：把**宿主自己的 markdown 编辑器**挂进 el（实时预览）。
     *
     * ---- 它是**绑文件**的，这一条是用户拍的板（09-18）----
     *
     * 中途试过「不绑文件」那条路（`embedRegistry` 造一块只装某段文本的编辑器），
     * 真机连报三轮：转不出编辑器、位置参数签名不对、owner 差容器……每一轮都在收窄，
     * 但收窄的速度赶不上它要的轮次。用户改主意：**回滚到绑文件这一版**，
     * 用两个更朴素的办法解决「一扇窗 = 一段」这件事：
     *
     *   1. 打开时**自动定位到第 a 行**（区间起点），不是只装那一段；
     *   2. 窗子底下给一个「**回到第 __ 行**」，随手填行号就跳过去。
     *
     * 于是这里得到的是**百分之百原生的编辑器**——就是平时写笔记那个，
     * 实时预览、双链补全、搜索替换、撤销栈一样不缺。代价：编辑器里是**整个文件**，
     * 行号区间退化成「跳到哪儿」。
     *
     * ---- ⚠️ 绑文件 = 宿主会自己存盘 ----
     *
     * 这一点必须写死在代码里：宿主的编辑器**随编辑自动存盘**。所以
     *   · 这一支**不能用核心那套「带基线的写盘」**——宿主刚存过，基线当场过期，
     *     用户一保存就报「在别处被改过」，那是我们自己制造的假冲突；
     *   · 但也不能不写：万一宿主的自动存盘没接上（我们这套挂法没有文档背书），
     *     用户改了半天会**一个字都不落盘**。丢字比假冲突严重得多。
     *
     * 所以「完成」那一下由**核心**把编辑器里的全文写回去，**不带基线**：
     * 宿主存过的话这一下是幂等的（同样的内容再写一次），没存过的话这一下就是保命的。
     *
     * ---- 还是没有文档背书 ----
     *
     * `require('obsidian')` 在 dataviewjs 里是抛的，拿不到 `MarkdownView` 这个类，
     * 只能**从已经开着的视图实例上把构造函数取下来**。所以每一步都兜住、
     * 最后还要自检：编辑器没真的长出来（`.cm-editor` 不在）就回 null，
     * 让核心退回它自己的输入框。**宁可退回输入框，也不要给一块空白。**
     */
    /**
     * 建一个文件夹（= 一颗新晶体）。3.0 刀 9 第三版。
     *
     * 用 `vault.createFolder`（它会把父目录一层层补齐，这正是我们要的：
     * 「在『将建在』那个文件夹里面再开一颗」= 路径多一段而已）。
     *
     * 「已经存在」要单独回一个 `exists`，不能混进 `error`：前者的下一句话是
     * 「换个名字」，后者是「去看看出了什么事」，两件事两个动作。
     */
    /**
     * 列出够格当晶体的文件夹（规则见 adapter.js 的契约）。3.0 刀 9 第三版。
     *
     * 走 `getAllLoadedFiles()` 而不是 `getFiles()`——后者只给文件，看不见空文件夹，
     * 而「空文件夹也要上环」正是这一条存在的理由。
     */
    async listFolders() {
      try {
        const { rootPath: root, files, folders } = walkCardsFolder();
        const under = (p) => p === root || p.indexOf(root + "/") === 0;
        const hasFile = new Set(); // 这个文件夹（含子树）里有文件吗
        const hasMd = new Set(); // ……有卡片吗
        const dirs = folders.map((d) => toStr(d.path)).filter((p) => p && p !== root);
        for (const f of files) {
          const p = toStr(f.path);
          if (!p || !under(p)) continue;
          // 文件：从它所在那一层往上，每一级祖先都记一笔
          const isMd = p.toLowerCase().endsWith(".md");
          let cur = toStr(f.parent && f.parent.path);
          while (cur && under(cur)) {
            hasFile.add(cur);
            if (isMd) hasMd.add(cur);
            if (cur === root) break;
            const i = cur.lastIndexOf("/");
            if (i < 0) break;
            cur = cur.slice(0, i);
          }
        }
        return dirs.filter((d) => hasMd.has(d) || !hasFile.has(d));
      } catch (e) {
        return []; // 契约：读不出一律回空数组，绝不抛
      }
    },

    async createFolder(folder) {
      // 去掉结尾的斜杠：`a/b/` 和 `a/b` 是同一个文件夹，不去的话
      // 第二次建会绕过 exists 判断，建出一个宿主眼里的重复路径。
      let path = toStr(folder);
      while (path.endsWith('/')) path = path.slice(0, -1); // 结尾的斜杠去掉：`a/b/` 就是 `a/b`
      if (!path) return { ok: false, reason: "error", message: "空路径" };
      const exists = () => {
        try {
          return !!app.vault.getAbstractFileByPath(path);
        } catch (e) {
          return false;
        }
      };
      try {
        if (exists()) return { ok: false, reason: "exists" };
        await app.vault.createFolder(path);
        return { ok: true, path };
      } catch (e) {
        // 并发或宿主自己的判断：再查一次，「其实已经有了」当 exists 回，
        // 别把一个「换个名字就行」的事报成故障。
        if (exists()) return { ok: false, reason: "exists" };
        return { ok: false, reason: "error", message: errText(e) };
      }
    },

    /**
     * 把一个文件或文件夹丢进回收站——**不是永久删除**（3.0 刀 12）。
     *
     * 删一整个文件夹 = 里面所有卡片一起没了，这是核心发起的最不可逆的动作。
     * 所以这里**只请宿主丢回收站**，让用户自己在「文件与链接 → 删除的文件」
     * 里选的那一档说了算（系统回收站 / vault 里的 .trash / 永久删除）。
     *
     * ⚠️ **不许退化成 `vault.delete`**：那是永久删除。用户把设置选成回收站的时候
     * 用它，等于绕过他的设置——而这一下删掉的是他的笔记。
     *
     * 老版本 Obsidian 没有 `fileManager.trashFile`，退到 `vault.trash(f, true)`
     * （那个也尊重用户的设置）。两个都没有就回 `unsupported`，核心据此不显示按钮。
     */
    async trashFile(folder) {
      const path = toStr(folder).replace(/\/+$/, "");
      if (!path) return { ok: false, reason: "error", message: "空路径" };
      let target = null;
      try {
        target = app.vault.getAbstractFileByPath(path);
      } catch (e) {
        target = null;
      }
      if (!target) return { ok: false, reason: "missing", path };
      try {
        const fm = app.fileManager;
        if (fm && typeof fm.trashFile === "function") {
          await fm.trashFile(target);
        } else if (typeof app.vault.trash === "function") {
          await app.vault.trash(target, true); // true = 用系统回收站那一档
        } else {
          return { ok: false, reason: "unsupported", path };
        }
        return { ok: true, path };
      } catch (e) {
        return { ok: false, reason: "error", message: errText(e) };
      }
    },

    async mountEditor(el, opts = {}) {
      const path = toStr(opts.path);
      const wantLine = Math.max(1, Math.round(Number(opts.line)) || 1);
      if (!el || !path) return null;
      let leaf = null;
      let view = null;
      let host = null;
      let done = false;

      const teardown = () => {
        if (done) return;
        done = true;
        try {
          if (host && host.parentNode) host.parentNode.removeChild(host);
        } catch (e) {
          /* 已经不在 DOM 里了 */
        }
        try {
          if (view && typeof view.onunload === "function") view.onunload();
        } catch (e) {
          /* 半路搭起来的对象，生命周期方法不一定齐 */
        }
        try {
          if (leaf && typeof leaf.detach === "function") leaf.detach();
        } catch (e) {
          /* 同上 */
        }
      };

      /** 挂不上时的那一句：控制台一份，**界面上**一份（用户不开开发者工具也看得见）。 */
      const fail = (why) => {
        const msg = (why && why.message) || why || "原因未知";
        try {
          console.warn("[晶体库] 原生编辑器没挂上，已退回输入框：", msg);
        } catch (err) {
          /* 控制台都没有就算了 */
        }
        try {
          const note = document.createElement("div");
          note.className = "kb-v13-editor-note";
          note.textContent = "宿主原生编辑器没挂上，已退回输入框：" + msg;
          el.appendChild(note);
        } catch (err) {
          /* 连 DOM 都写不进去就算了 */
        }
        return null;
      };

      try {
        const file = app.vault.getAbstractFileByPath(path);
        if (!file) return fail("找不到这个文件");
        // 构造函数只能从**活着的实例**上取。取不到就说明这个宿主不给这个口子。
        let ViewCtor = null;
        for (const l of app.workspace.getLeavesOfType("markdown") || []) {
          const v = l && l.view;
          if (v && typeof v.setState === "function" && v.editor) {
            ViewCtor = v.constructor;
            break;
          }
        }
        const anyLeaf = app.workspace.getLeaf(false); // false = 用现成的叶子，不新开一个
        if (!ViewCtor || !anyLeaf) return fail("拿不到宿主的编辑器类（它没开任何 markdown 视图？）");

        leaf = new anyLeaf.constructor(app);
        view = new ViewCtor(leaf);
        // View 的构造函数会建 containerEl，但我们不把它交给工作区——它只活在
        // 我们这扇窗里，所以自己挂。脱离工作区的那几个生命周期方法也自己补上：
        // 不补的话编辑器组件不会初始化（这是没有文档的那一段里最靠猜的一步）。
        try {
          leaf.view = view;
        } catch (e) {
          /* 只读就算了，下面的自检会说话 */
        }
        try {
          if (typeof view.onload === "function") view.onload();
        } catch (e) {
          /* 同上 */
        }
        host = view.containerEl;
        if (!host) return fail("宿主的视图没有 containerEl");
        host.classList.add("kb-v13-native-editor");
        el.appendChild(host);

        // mode:"source" + source:false = **实时预览**那一档。这两个是宿主的内部
        // 开关，不是「渲染/编辑两种视图」：mode:"preview" 是阅读视图，那个改不了字。
        await view.setState({ file, mode: "source", source: false }, { history: false });
        try {
          if (typeof view.onOpen === "function") view.onOpen();
        } catch (e) {
          /* 同上 */
        }

        // 自检：等编辑器真的长出来。等不到就当没挂上——见函数开头那段。
        const ok = await new Promise((resolve) => {
          let tries = 0;
          const tick = () => {
            if (host.querySelector && host.querySelector(".cm-editor")) return resolve(true);
            if (++tries > 40) return resolve(false); // 40 帧 ≈ 0.7 秒
            (window.requestAnimationFrame || window.setTimeout)(tick);
          };
          tick();
        });
        if (!ok) return fail("宿主的视图挂上了，但编辑器没长出来（等不到 .cm-editor）");

        const ed = view.editor;

        /**
         * 跳到第 n 行（1 基，**文件行号**）。返回真正落到的那个行号——
         * 越界会被夹回文件范围内，把夹过的数交回去，界面上的输入框才能跟着纠正。
         */
        const gotoLine = (n) => {
          try {
            if (!ed) return wantLine;
            const total = ed.lastLine() + 1;
            const at = Math.max(1, Math.min(total, Math.round(Number(n)) || 1));
            const pos = { line: at - 1, ch: 0 };
            ed.setCursor(pos);
            ed.scrollIntoView({ from: pos, to: pos }, true); // true = 尽量居中
            ed.focus();
            return at;
          } catch (e) {
            return wantLine;
          }
        };
        // 出生就把光标和视口落到第 a 行——这就是「一扇窗 = 从第 a 行看起」在
        // 绑文件这一版里的落点（用户 09-18 拍板的那条）。
        gotoLine(wantLine);

        return {
          // ⚠️ **宿主自己会存盘**，核心据此不再走「带基线的写盘」那条路
          // （宿主刚存过，基线必然过期）。见函数开头那一段。
          selfSaving: true,
          gotoLine,
          getValue: () => {
            try {
              return toStr(ed ? ed.getValue() : "");
            } catch (err) {
              return "";
            }
          },
          setValue: (v) => {
            try {
              if (ed) ed.setValue(toStr(v));
            } catch (err) {
              /* 编辑器正在合成输入时可能拒绝，忽略 */
            }
          },
          focus: () => {
            try {
              if (ed) ed.focus();
            } catch (err) {
              /* 同上 */
            }
          },
          destroy: teardown,
        };
      } catch (e) {
        teardown();
        return fail(e);
      }
    },

    // split: true —— 在右侧新开一个分屏放源文件，晶体库所在的叶子不关。
    // opts.line 是正文首行的 0 基行号（core/model.js 的 bodyStartLine），走 eState
    // 让编辑器把光标和视口直接落到那一行，不停在 frontmatter 的 YAML 上；
    // 0 / 缺省 = 笔记顶部，那就整个第二参都不传——传一个空的 eState 进去是拿
    // 「宿主默认」换「我们猜的默认」，越界还会让 Obsidian 直接抛。
    // 拿不到文件或叶子时退回整页跳转：宁可是老行为，也不能点了没反应。
    async openNote(path, opts = {}) {
      if (opts.split) {
        try {
          const file = app.vault.getAbstractFileByPath(path);
          const leaf = app.workspace.getLeaf("split", "vertical");
          if (file && leaf) {
            await leaf.openFile(file, opts.line > 0 ? { eState: { line: opts.line, ch: 0 } } : undefined);
            return;
          }
        } catch (e) {
          // 落到下面的整页跳转
        }
      }
      app.workspace.openLinkText(path, "", false);
    },

    // 3.0 刀 19：把网址交给系统浏览器。阅读器的外部标签页嵌不进来时走这条。
    //
    // ⚠️ **三条路依次试，而且都要试**：这条路的失败是**静默的**（点了什么都不发生），
    // 而用户点这颗按钮时已经站在「网页嵌不进来」那一档了——再给他一个没反应，
    // 这扇窗就彻底是死的。每一条都包在自己的 try 里，一条不通换下一条。
    //
    //   1. Electron 的 `shell.openExternal` —— 桌面端最直接的一条。用
    //      `globalThis.require` 取（**不是裸 `require`**）：同一个文件也被
    //      dataviewjs 形态打包，那边没有 CommonJS 的 `require`，裸写会让打包器
    //      在解析阶段就报错——而这一条本来就该是「拿不到就算了」。
    //   2. `window.open(url, "_blank")` —— 网页标准 API。Obsidian 桌面把外链
    //      交给系统的 window-open handler，效果通常和上面一样。
    //      这条**必须带 `_blank`**：不给的话同窗口导航会把整个 Obsidian 换掉。
    openExternal(url) {
      const u = String(url || "").trim();
      // 只放行 http/https。`file:` / `javascript:` 这类交给宿主去开是危险的，
      // 而这一条网址来自用户在输入框里敲的东西——不该有第二个解释。
      if (!/^https?:\/\//i.test(u)) return false;
      try {
        const req = typeof globalThis !== "undefined" ? globalThis.require : null;
        if (typeof req === "function") {
          const shell = req("electron").shell;
          if (shell && typeof shell.openExternal === "function") {
            shell.openExternal(u);
            return true;
          }
        }
      } catch (e) {
        /* 没有 electron（网页端）或者被隔离了，走下面那条 */
      }
      try {
        const w = typeof window !== "undefined" ? window : null;
        if (w && typeof w.open === "function") {
          w.open(u, "_blank", "noopener,noreferrer");
          return true;
        }
      } catch (e) {
        /* 弹窗被拦，如实回 false */
      }
      return false;
    },

    // 写回一张卡。新全文由核心算好（core/frontmatter.js），这里只管三件事：
    // 比对基线 → 写盘 → 回读。适配层不解析、不改写、不序列化 YAML。
    async writeCard(path, content, opts = {}) {
      let file;
      try {
        file = app.vault.getAbstractFileByPath(path);
      } catch (e) {
        return { ok: false, reason: "error", message: errText(e) };
      }
      if (!file) return { ok: false, reason: "missing" };

      const base = opts.base;
      try {
        if (typeof app.vault.process === "function") {
          // vault.process 把「读当前内容 → 我们返回新内容 → 写盘」压在一次原子操作里，
          // 比对与写盘之间没有 await。别的设备（FNS 同步）在这一瞬插进来的窗口
          // 因此被压到最小——**消不掉**，快照比对不是锁，只能让它越来越小。
          let conflicted = false;
          await app.vault.process(file, (cur) => {
            if (base != null && cur !== base) {
              conflicted = true;
              return cur; // 原样返回 = 不写，别人的改动留着
            }
            return content;
          });
          if (conflicted) {
            return { ok: false, reason: "conflict", content: await readText(path) };
          }
        } else {
          // 老宿主没有 vault.process：只能先读后写，中间那个窗口更大。
          // 行为一样，只是更窄的那类竞态挡不住。
          const cur = await readText(path);
          if (base != null && cur !== base) {
            return { ok: false, reason: "conflict", content: cur };
          }
          await app.vault.modify(file, content);
        }
        // 回读真实结果：宿主可能规范化了行尾等，核心不能假设写进去什么样就是什么样
        return { ok: true, content: await readText(path) };
      } catch (e) {
        // 绝不抛——对齐 loadViewState 那条「失败静默兜底」的既有风格，
        // 也保证核心那边有个干净的结果去渲染错误界面。
        return { ok: false, reason: "error", message: errText(e) };
      }
    },

    // ---- 3.0 刀 6 文献阅读器 ----

    /**
     * 可读的文献：卡片目录下（含子文件夹）的 PDF / 图片 / markdown。
     *
     * 走 `getFiles()` 而不是 `getMarkdownFiles()`——后一个看不见 PDF 和图片，
     * 而「阅读器看不见 PDF」正是这一刀要解决的那件事。
     *
     * **目录口径与 loadCards 完全一致**（都以 CARDS_FOLDER 为根）。留在适配层
     * 而不是让核心去读 config.js，是与 loadCards 同一条纪律：路径这种宿主知识
     * 只有一处，换宿主时不必去核心里找常量。
     */
    async listDocs() {
      try {
        const out = [];
        for (const f of walkCardsFolder().files) {
          const kind = DOC_KINDS[String(f.extension || "").toLowerCase()];
          if (!kind) continue;
          out.push({
            path: f.path,
            name: toStr(f.basename),
            kind,
            folder: toStr(f.parent && f.parent.path),
          });
        }
        // **不排序**：排序与分组归核心。两个实现各自排一遍的话，迟早会出现
        // 「原型里是这个顺序、Obsidian 里是另一个」，而那种差异没人会去查。
        return out;
      } catch (e) {
        return []; // 契约：读不出一律回空数组，绝不抛
      }
    },

    /**
     * 读原始字节，给 pdf.js 用。
     *
     * **不走 `assetUrl` + `fetch`**：那是拿 `app://` 这类宿主私有协议去赌 CSP
     * 放行，而这条链路上任何一处的失败都长一个样（「PDF 打不开」）。
     * vault.readBinary 是显式的、零赌注的一条路，而且 .md 也走它——
     * 阅读器那边用 TextDecoder 解码，不必为文本再加第十五个方法。
     */
    async readBinary(path) {
      try {
        const file = app.vault.getAbstractFileByPath(path);
        if (!file) return null;
        return await app.vault.readBinary(file);
      } catch (e) {
        return null; // 契约：读不出返回 null，绝不抛
      }
    },

    /**
     * 新建一张卡片。**不能复用 writeCard**——那个是 getAbstractFileByPath
     * 找不到就回 missing，语义是「写一张已经存在的卡」，正好相反。
     *
     * 返回里的 `path` 是**宿主落地的那个路径**，不是我们拼的那个：Obsidian 在
     * 重名时会自动改成 `名字 1.md`。核心拿回读的路径去建卡，才不会出现
     * 「屏幕上说建了 A、盘上其实叫 A 1」。
     */
    async createCard(name, content, folder) {
      const dir = String(folder || cardsFolder).replace(/\/+$/, "");
      const path = dir + "/" + name + ".md";
      try {
        if (app.vault.getAbstractFileByPath(path)) {
          return { ok: false, reason: "exists", path };
        }
        // 目标目录不在就建。`vault.create` 在父目录缺失时**抛异常**，而那句话
        // 是文件系统口吻的，用户看不懂自己做错了什么。
        if (!app.vault.getAbstractFileByPath(dir) && typeof app.vault.createFolder === "function") {
          await app.vault.createFolder(dir);
        }
        const made = await app.vault.create(path, content);
        const real = made && made.path ? made.path : path;
        // 回读真实全文：宿主可能规范化了行尾。与 writeCard 同一条纪律——
        // 核心不能假设写进去什么样就是什么样。
        return { ok: true, path: real, content: await readText(real) };
      } catch (e) {
        return { ok: false, reason: "error", message: errText(e) };
      }
    },

    loadViewState() {
      try {
        const raw = backing.get(viewKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch (e) {
        return null;
      }
    },

    saveViewState(state) {
      backing.set(viewKey, JSON.stringify(state));
    },

    // #22 偏好。读写都不校验字段——形状由核心定、核心自己兜底，
    // 适配层加一层校验只会让「加一个新偏好」变成要动两个地方。
    loadPrefs() {
      try {
        const raw = backing.get(prefKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch (e) {
        return null;
      }
    },

    savePrefs(prefs) {
      backing.set(prefKey, JSON.stringify(prefs));
    },
  };
}

/**
 * 把 pdf.js 运行时那份文件读成源码全文。
 *
 * 走 `adapter.read` 而不是 `vault.read`：它是 vault 里的一个普通文件，不是一个
 * 笔记——`vault.read` 吃的是 TFile 且会走 Obsidian 的缓存层，而这里要的就是
 * 「把盘上那份字节原样拿出来」。读不到时退一步走 vault API，再不行才报错。
 */
async function readPdfRuntime() {
  try {
    return await app.vault.adapter.read(VAULT_PDF_RUNTIME_PATH);
  } catch (e) {
    try {
      const f = app.vault.getAbstractFileByPath(VAULT_PDF_RUNTIME_PATH);
      if (f) return await app.vault.read(f);
    } catch (e2) {
      /* 落到下面那句错误 */
    }
    throw new Error("读不到 " + VAULT_PDF_RUNTIME_PATH + "：" + errText(e));
  }
}

export async function bootObsidian(dv, container) {
  const adapter = createObsidianAdapter({ dv, app });
  // PDF 渲染器在这里建、从 mount 参数递进去。**不进适配层契约**：契约的语义是
  // 「宿主能力」，而「怎么把 PDF 画出来」是核心的实现选择——宿主只负责用
  // readBinary 把字节递过来。往契约里加方法要动两个实现 + 契约 + seam.spec 的
  // 标题，为了一个纯核心的渲染实现去污染接缝，方向是反的（同刀 5 的 storyLayout）。
  //
  // **懒加载**：这时候只是把「怎么取源码」交出去，2MB 要等用户真点开第一份 PDF
  // 才读、才解析。不这么做的话，光是打开晶体库就要先扛 2MB 的解析。
  return mount({
    adapter,
    container,
    pdfRenderer: createLazyPdfRenderer(readPdfRuntime, typeof document === "undefined" ? null : document),
  });
}

export { mount };
