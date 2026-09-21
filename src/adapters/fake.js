// 假适配层：内存卡片数组 + 名字索引 + 可注入的渲染器。
//
// 原型和测试都用它供数，因此整条核心链路不依赖 Obsidian。
// render 可注入——测试传一个探针，原型传真实的网页渲染器。

import { toLinkTarget, viewStateKey, prefsKey } from "../adapter.js";
import { CARDS_FOLDER } from "../config.js";

/**
 * watchCards 的订阅者。**故意放在模块作用域**，不放在 createFakeAdapter 里面。
 *
 * 真宿主那边这一格是 `app.vault.on("modify")`——订阅挂在**全局的 vault** 上，
 * 不是挂在适配层实例上。所以「宿主重挂时旧实例的监听没退」这件事在真库里是
 * 真的会堆积，而如果这里每个适配层实例各存一份，重挂出来的新实例数出来永远是 1，
 * 泄漏就永远测不出来。同构比干净重要。
 *
 * 每次 page.goto 会重载模块、这格自然清空；同一个页面里 boot 两次（重挂那条用例）
 * 才会看到它累积——那正是要测的场景。
 */
const vaultWatchers = new Set();

/**
 * @param {object} opts
 * @param {Array}  opts.cards     卡片原始数据（见 adapter.js 的 Card）
 * @param {Function} [opts.render] (md, el, srcPath) => void
 * @param {object} [opts.assets]   路径 -> URL，给 assetUrl 用
 * @param {Function} [opts.onOpenNote] (path, { split, line }) => void
 * @param {Function} [opts.onWriteCard] (path, content, opts) => (WriteResult|undefined)
 *   写盘探针，兼故障注入。返回非 undefined 时**该结果原样采用、不再写盘**——
 *   测试用这条造冲突（reason: "conflict"）或写盘失败（"error"）。
 * @param {string} [opts.storageKey] 视图状态的存储键，缺省与 Obsidian 侧同构
 * @param {Array}  [opts.docs]      3.0 刀 6：可读文献清单（见 adapter.js 的 Doc）
 * @param {object} [opts.binaries]  路径 -> 字节（ArrayBuffer / Uint8Array），给 readBinary 用。
 *   测试拿它验「PDF 那条路真的去读了字节」，而不是只验调用发生没发生。
 * @param {Function} [opts.onCreateCard] (name, content, folder) => (WriteResult|undefined)
 *   建卡探针兼故障注入，语义同 onWriteCard。返回非 undefined 就原样采用、不建。
 * @param {Function} [opts.onMountEditor] (el, {path, text}) => (EditorHandle|null|undefined)
 *   原生编辑器探针。返回非 undefined 就原样采用；返回 undefined 按契约回 null
 *   （核心退回自己的输入框）。浏览器里没有真的宿主编辑器，所以「宿主给了编辑器、
 *   核心真的用它」那条分支只有注入一个假的才验得到。
 */
export function createFakeAdapter({
  cards = [],
  render,
  assets = {},
  docs = [],
  binaries = {},
  onOpenNote,
  // 3.0 刀 19：外部标签页的浏览器兜底。注入它就等于「宿主能开浏览器」，
  // 顺便把开出去的网址记下来。
  onOpenExternal,
  onWriteCard,
  onCreateCard,
  onCreateFolder,
  onTrashFolder,
  onMountEditor,
  storageKey,
} = {}) {
  const byName = new Map();
  // 视图状态落浏览器 localStorage——原型和测试台因此能真的验证「状态恢复」
  // 这条行为，而不是只验证一个接口签名。
  const viewKey = storageKey || viewStateKey(CARDS_FOLDER);
  // #22 偏好的键跟着视图状态那个 storageKey 走：测试注入自定义键时，
  // 两个存储要一起被隔离，否则换库的用例会读到上一个库留下的颜色
  const prefKey = storageKey ? storageKey + ":prefs" : prefsKey(CARDS_FOLDER);
  // 假盘：path -> 全文。writeCard 改这里，loadCards 也从这里读，
  // 所以「改完重新加载能读到新内容」在原型和测试里都是真的。
  // 建过的文件夹（假盘没有真目录）。只用来让「再建一次」回 exists。
  const folders = new Set();
  const disk = new Map();
  for (const c of cards) {
    byName.set(c.name, c);
    disk.set(c.path, c.content == null ? "" : c.content);
  }
  // markdown **文献**也放进同一张盘。
  //
  // 它们从前只住在 `binaries`（路径 -> 字节，PDF 走那条路），于是「读」和「写」
  // 是两套存储：在阅读器里改完一份 md 文献，`readBinary` 读回来还是改之前那份——
  // 写盘成功了、界面不动。真宿主那边没这回事，`vault.readBinary` 与
  // `vault.process` 摸的是同一个文件；假盘要演的就是那张「同一张盘」。
  // 二进制（PDF / 图片）仍然只走 binaries，它们本来就不该被文本写回。
  for (const d of docs) {
    if (d.kind !== "markdown" || disk.has(d.path)) continue;
    const bytes = binaries[d.path];
    if (bytes) disk.set(d.path, new TextDecoder().decode(bytes));
  }

  function fallbackRender(md, el) {
    // 兜底：只保证有内容，不追求排版。真排版由调用方注入。
    const p = el.ownerDocument.createElement("p");
    p.textContent = String(md);
    el.appendChild(p);
  }

  /**
   * 从一篇刚写下的全文里读回三个卡片字段（createCard 之后重新加载要用）。
   *
   * 故意写得很笨：只认核心 composeCard 产出的那种行内写法，不处理块列表、
   * 不处理多行标量、不处理 YAML 的转义全套。**这不是一个 YAML 解析器**，
   * 也不该长成一个——真宿主那边这三个值来自 metadataCache，根本不走这条路。
   * 它要保证的只有一件事：用核心写下的东西、核心自己读得回来。
   */
  function readCardFields(content) {
    const out = { concept: "", source: "", tags: [] };
    const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(String(content || ""));
    if (!m) return out;
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^([^:\s][^:]*)[ \t]*:[ \t]*(.*)$/.exec(line);
      if (!kv) continue;
      const key = kv[1].trim();
      const raw = kv[2].trim();
      if (key === "概念") out.concept = unquote(raw);
      else if (key === "来源") out.source = unquote(raw);
      else if (key === "tags" && /^\[.*\]$/.test(raw)) {
        out.tags = raw
          .slice(1, -1)
          .split(",")
          .map((s) => unquote(s.trim()))
          .filter(Boolean);
      }
    }
    return out;
  }

  function unquote(s) {
    if (!/^".*"$/.test(s)) return s;
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }

  const adapter = {
    async loadCards() {
      // content 从假盘现取：写过之后再加载能读到新内容。
      // 顺带记着「核心拿到的是副本」——核心改完自己的 card 之后，
      // 不能让核心以为假盘也变了，两边都得更新（见 entry-web 的 boot 注释）。
      return cards.map((c) => ({ ...c, content: disk.get(c.path) }));
    },

    // 对齐 Obsidian getFirstLinkpathDest 的常见情形：按文件名匹配，忽略目录
    resolveLink(target, fromPath) {
      const clean = String(target || "").split("#")[0].trim();
      const hit = byName.get(clean) || byName.get(clean.split("/").pop());
      return hit ? toLinkTarget(hit) : null;
    },

    assetUrl(path) {
      return assets[path] || "";
    },

    renderMarkdown(md, el, srcPath) {
      return (render || fallbackRender)(md, el, srcPath);
    },

    openNote(path, opts = {}) {
      // 展开转发：只给 split 补缺省，别的字段（#14 的 line）原样过。
      // 别写成 { split, line } 字面量——调用方没给 line 时那样会凭空多出一个
      // line: undefined 的键，「split 原样交给宿主」那条契约就变味了。
      if (onOpenNote) onOpenNote(path, { ...opts, split: !!opts.split });
    },

    // 3.0 刀 19：外部标签页的浏览器兜底。探测那条回调是**展开转发**那个路子，
    // 与 openNote 同一条（不给就什么都不记，回 true = 「交出去了」。
    // 归 false 会让核心说一句「打不开」，而测试里根本没打算真开浏览器）。
    openExternal(url) {
      if (onOpenExternal) {
        onOpenExternal(url);
        return true;
      }
      return true;
    },

    // 读取失败（截断的 JSON / 存储被禁用）一律当「没存过」。
    // 形状校验不在这里——适配层只负责搬运，认不认得出是核心的事（core/viewstate.js）。
    loadViewState() {
      try {
        const raw = globalThis.localStorage.getItem(viewKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch (e) {
        return null;
      }
    },

    saveViewState(state) {
      try {
        globalThis.localStorage.setItem(viewKey, JSON.stringify(state));
      } catch (e) {
        // 存储写满或被禁用：视图状态丢就丢了，不该影响界面能用
      }
    },

    // #22 偏好。与视图状态**分键存**，理由见 adapter.js 的 prefsKey：
    // 「忘掉上次看到哪儿」清的是视角，不该顺手把用户调好的颜色也清了。
    // 形状同样不在这里校验——搬运是适配层的事，认不认得出是核心的事。
    loadPrefs() {
      try {
        const raw = globalThis.localStorage.getItem(prefKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch (e) {
        return null;
      }
    },

    savePrefs(prefs) {
      try {
        globalThis.localStorage.setItem(prefKey, JSON.stringify(prefs));
      } catch (e) {
        // 同 saveViewState
      }
    },

    // 假盘的 writeCard：与 Obsidian 侧同构的三态返回（见 adapter.js 的契约）。
    // 比对基线与写盘在同一个同步块里，没有 await 夹在中间——这正是真宿主那边
    // 用 vault.process 想换到的东西，假盘天然就有。
    writeCard(path, content, opts = {}) {
      // 探针兼故障注入先跑：返回非 undefined 就原样采用，不写盘
      if (onWriteCard) {
        const injected = onWriteCard(path, content, opts);
        if (injected !== undefined) return Promise.resolve(injected);
      }
      if (cards.length && !disk.has(path)) {
        return Promise.resolve({ ok: false, reason: "missing" });
      }
      const cur = disk.get(path);
      if (opts.base != null && cur !== opts.base) {
        // 磁盘上那份是「别人的」——回给核心拿去展示差异
        return Promise.resolve({ ok: false, reason: "conflict", content: cur });
      }
      disk.set(path, content);
      return Promise.resolve({ ok: true, content });
    },

    // ---- 3.0 刀 6 文献阅读器 ----

    // 假盘没有目录可扫，清单由调用方给（见 opts.docs）。
    // 这里**不排序也不分组**——契约要求排序分组归核心，两个实现要是各自排一遍，
    // 迟早会出现「原型里是这个顺序、Obsidian 里是另一个」。
    listDocs() {
      return Promise.resolve(docs.map((d) => ({ ...d })));
    },

    /**
     * 建一个文件夹（= 一颗新晶体）。3.0 刀 9 第三版。
     *
     * 假盘没有真目录，这里只做一件有意义的模拟：**已经有卡住在这个路径下面**
     * 就当它存在（回 `exists`）——那正是真宿主那边会撞到的情况。
     * 此外记进 `folders`，让「建完再建一次」这类用例有东西可断言。
     */
    /**
     * 列出够格当晶体的文件夹（规则见 adapter.js 的契约）。3.0 刀 9 第三版。
     *
     * 假盘没有真目录，就按同一套规则现算：**卡片与 markdown 文献算「有卡片」**，
     * PDF / 图片算「有文件但没卡片」，`createFolder` 建过的算「一个文件都没有」。
     * 两个实现要是各写一套判断，迟早出现「原型里有这颗晶体、真机上没有」。
     */
    listFolders() {
      const root = CARDS_FOLDER;
      const under = (q) => q === root || q.indexOf(root + "/") === 0;
      const hasFile = new Set();
      const hasMd = new Set();
      const mark = (folderPath, md) => {
        let cur = String(folderPath == null ? "" : folderPath);
        while (cur && under(cur)) {
          hasFile.add(cur);
          if (md) hasMd.add(cur);
          if (cur === root) break;
          const i = cur.lastIndexOf("/");
          if (i < 0) break;
          cur = cur.slice(0, i);
        }
      };
      for (const c of cards) mark(c.folder, true);
      for (const d of docs) {
        const path = String(d.path || "");
        const i = path.lastIndexOf("/");
        mark(i > 0 ? path.slice(0, i) : "", d.kind === "markdown");
      }
      const dirs = new Set(folders);
      for (const q of hasFile) dirs.add(q);
      return [...dirs].filter((q) => q !== root && under(q) && (hasMd.has(q) || !hasFile.has(q)));
    },

    createFolder(folder) {
      // 探针先跑（与 writeCard / createCard 同一套）：记一笔，然后按真的走。
      // 它存在是为了让测试**看得见「建了哪个路径」**——返回值只能验成功与否，
      // 而「建在哪儿」才是这个功能真正要钉住的东西。
      if (onCreateFolder) {
        const injected = onCreateFolder(folder);
        if (injected !== undefined) return Promise.resolve(injected);
      }
      const path = String(folder == null ? "" : folder).replace(/\/+$/, "");
      if (!path) return Promise.resolve({ ok: false, reason: "error", message: "空路径" });
      if (folders.has(path)) return Promise.resolve({ ok: false, reason: "exists" });
      const used = cards.some((c) => {
        const f = String(c.folder == null ? "" : c.folder);
        return f === path || f.indexOf(path + "/") === 0;
      });
      if (used) return Promise.resolve({ ok: false, reason: "exists" });
      folders.add(path);
      return Promise.resolve({ ok: true, path });
    },

    trashFile(folder) {
      // 探针先跑（与 createFolder 同一套）：让测试**看得见删了哪个路径**。
      // 「删对了没有」是这条功能唯一要钉的东西——返回值只说成功与否。
      if (onTrashFolder) {
        const injected = onTrashFolder(folder);
        if (injected !== undefined) return Promise.resolve(injected);
      }
      const path = String(folder == null ? "" : folder).replace(/\/+$/, "");
      if (!path) return Promise.resolve({ ok: false, reason: "error", message: "空路径" });
      // ⚠️ **文件和文件夹都要认。** 真机那边走 `getAbstractFileByPath`，
      // 两者本来就都拿得到；这里第一版只查了 `folders`，于是传一个**卡的文件路径**
      // 进来会被判成 `missing`——核心据此以为「文件已经不在了」直接返回，
      // 阅读器的「返回」就把用户刚写的正文丢在半路上（而且不报错）。
      // 是 scratch 那条用例抓出来的。
      const isFile = cards.some((c) => c.path === path);
      if (isFile) {
        const i = cards.findIndex((c) => c.path === path);
        if (i >= 0) cards.splice(i, 1);
        return Promise.resolve({ ok: true, path });
      }
      const hasCards = cards.some((c) => {
        const f = String(c.folder == null ? "" : c.folder);
        return f === path || f.indexOf(path + "/") === 0;
      });
      const known = folders.has(path) || hasCards;
      if (!known) return Promise.resolve({ ok: false, reason: "missing", path });
      // 丢掉这一棵子树上的卡片与子文件夹——原型里「删了就是删了」，
      // 但**回收站那件事原型验不了**（假适配层没有回收站），
      // 真实现在 entry-obsidian.js，那一支由契约与真机负责。
      for (const c of cards.slice()) {
        const f = String(c.folder == null ? "" : c.folder);
        if (f === path || f.indexOf(path + "/") === 0) cards.splice(cards.indexOf(c), 1);
      }
      for (const f of Array.from(folders)) {
        if (f === path || f.indexOf(path + "/") === 0) folders.delete(f);
      }
      return Promise.resolve({ ok: true, path });
    },

    /**
     * 3.0 刀 9 第三版：假适配层**没有**原生编辑器。
     *
     * 浏览器里没有 Obsidian 的编辑器组件，硬造一个假的只会让测试去验一个
     * 不存在的约定。按契约回 `null`，核心据此退回它自己的 `<textarea>`——
     * 于是原型和全部自动化测试的断言一条都不用动，而真机走的是原生编辑器。
     */
    mountEditor(el, opts) {
      // 探针：测试注入一个**假的原生编辑器**，用来验「宿主给了编辑器，核心真的用它」
      // ——那条分支在浏览器里没有真货可跑，不注入就一条断言都下不了。
      // 返回 undefined 就当这次没注入，按契约回 null（核心退回自己的输入框）。
      if (onMountEditor) {
        const injected = onMountEditor(el, opts);
        if (injected !== undefined) return Promise.resolve(injected);
      }
      return Promise.resolve(null);
    },

    // 路径 -> 字节。测试拿它验「PDF 那条路真的去读了字节」。
    //
    // 文本类（markdown 文献）**先看假盘**：它可能刚被 writeCard 改过，
    // 而 binaries 里那份是开机时抄的、永远不会变。两套存储各说各的下场是
    // 「改完重画，屏幕上还是旧的」——真宿主那边读写摸的是同一个文件，没有这一出。
    readBinary(path) {
      if (disk.has(path)) return Promise.resolve(new TextEncoder().encode(disk.get(path)));
      const hit = binaries[path];
      return Promise.resolve(hit == null ? null : hit);
    },

    // 新建一张卡。与 Obsidian 侧同构的三态：exists / error / ok。
    createCard(name, content, folder) {
      if (onCreateCard) {
        const injected = onCreateCard(name, content, folder);
        if (injected !== undefined) return Promise.resolve(injected);
      }
      const dir = folder || (cards[0] && cards[0].folder) || CARDS_FOLDER;
      const path = dir + "/" + name + ".md";
      if (disk.has(path)) {
        return Promise.resolve({ ok: false, reason: "exists", path });
      }
      disk.set(path, content);
      // 顺着这张卡重新加载时字段得有值，否则「建完卡再重挂一次，概念没了」。
      // 真宿主那边这三个值来自 metadataCache；假盘没有缓存，只能从刚写进去的
      // 全文里读回来。**这不算违背「适配层不解析 YAML」**——那条规矩管的是
      // 真实现不许把核心的序列化规则复制一份，而这里读的正是核心刚写下的那三个键。
      const fm = readCardFields(content);
      const record = { path, folder: dir, name, ...fm };
      cards.push(record);
      byName.set(name, record);
      return Promise.resolve({ ok: true, path, content });
    },

    // 假适配层没有「别的进程改了文件」这回事，所以这里只把回调存下来；
    // 测试用下面那个 emitModify 演一次外部改动，走的是与真宿主同一条回调。
    // 契约要求「没有这个能力的宿主返回一个空的退订函数」，这里返回的是真退订
    // ——测试要能验「退订之后不再响」。
    watchCards(cb) {
      vaultWatchers.add(cb);
      return () => {
        vaultWatchers.delete(cb);
      };
    },
  };

  // 测试专用（不在契约里）：模拟一次「宿主发现这张卡在别处被改了」。
  // 与真宿主一样**先落盘再通知**——核心那边是拿通知里的内容跟模型比的，
  // 只通知不落盘的话，下一条断言读到的还是旧假盘。
  //
  // content 缺省 = 取假盘现状，对应「文件被碰过但内容没变」（真宿主里
  // 保存一次就是 modify + 内容可能逐字节相同）。
  adapter.emitModify = (path, content) => {
    if (content !== undefined) disk.set(path, content);
    if (!vaultWatchers.size) return;
    const base = cards.find((c) => c.path === path);
    const payload = {
      path,
      folder: base ? base.folder : "",
      name: base ? base.name : "",
      // 字段没跟着变：真宿主那边字段走 metadataCache，测试里没有那层，
      // 就沿用卡上原有的值（要测字段变更的用 emitModifyFields）。
      concept: base ? base.concept : "",
      tags: base ? base.tags || [] : [],
      source: base ? base.source : "",
      content: disk.get(path),
    };
    // 广播给所有订阅者——真宿主那边一个 modify 会打到每一个还挂着监听的实例上，
    // 包括那些已经被宿主摘掉、只是没人退订的旧实例。
    vaultWatchers.forEach((cb) => cb(payload));
  };

  // 测试专用：现在还有几个订阅者。重挂之后必须回到 1，
  // 多出来的每一个都是一份永远不会生效、却每次都白跑一趟读盘的监听。
  adapter.watchCount = () => vaultWatchers.size;

  // 测试专用：连 frontmatter 字段一起改（对应真库里"在别处改了概念/来源/tags"）
  adapter.emitModifyFields = (path, fields, content) => {
    const base = cards.find((c) => c.path === path);
    if (base) Object.assign(base, fields);
    adapter.emitModify(path, content);
  };

  return adapter;
}
