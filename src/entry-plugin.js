// Obsidian 插件入口（3.0 刀 10）。
//
// 这个库有**两种形态，共用同一份内核**：
//
//   · dataviewjs 那条 —— 代码块住在笔记里，入口是 `entry-obsidian.js` 的 bootObsidian；
//   · 插件这条     —— 库住自己的视图里，入口就是这个文件。
//
// 两边唯一的差别只有三件事，其余一行不差：
//   1. **谁渲染正文** —— Dataview 的 `dv.api.renderValue` / Obsidian 的 `MarkdownRenderer`；
//   2. **卡片目录从哪儿来** —— 写死的常量 / 用户的设置；
//   3. **样式谁放** —— 运行时注入 / 仓库根目录的 `styles.css`。
//
// ⚠️ 所以这个文件里**不该有业务逻辑**。凡是想在这儿写 `if` 的，先问一句
//    「dataviewjs 那条路要不要也一样」——要的话，它属于 core 或适配层，不属于这里。

import { ItemView, MarkdownRenderer, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { mount } from "./core/app.js";
import { createObsidianAdapter } from "./entry-obsidian.js";
import { createPdfRenderer } from "./core/pdfdoc.js";
// pdf.js 直接进主包。**这和 dataviewjs 形态是反的**：那边必须拆出去单放一个文件，
// 因为代码块住在笔记里，笔记被编辑器打开不了块就跑不了（详见 entry-pdf-runtime.js）。
// 插件里代码住在 main.js，没有那条线——1.8MB 就是 1.8MB，Obsidian 不会拿它去打编辑器。
import { pdfjs, workerSrc } from "./entry-pdf-runtime.js";
/**
 * 插件形态的卡片目录默认值。
 *
 * ⚠️ **故意不是 `config.js` 里那个 `CARDS_FOLDER`。**
 *
 * 那一个是**我自己 vault 的目录结构**（`3.资产舱/知识卡片`）。dataviewjs 形态下
 * 它是对的——代码块就住在那张笔记里，写死是契约的一部分（#2：加晶体 = 建子文件夹）。
 *
 * 但插件是**给别人用的**：默认值写 `3.资产舱/知识卡片`，每个新用户装完第一步都是
 * 「这路径哪来的」——而那个路径对世界上任何别人都不存在。默认值该是**中性的、
 * 别人一看就知道该改成什么**的东西。
 *
 * 用 `cards` 而不是空串：空串的话新用户打开是一个**空环**，而且看不出该怎么办。
 * `cards` 至少是一句像样的提示——建一个叫这个名字的文件夹，就能开始了。
 */
const DEFAULT_CARDS_FOLDER = "cards";

/** 视图类型。**改它等于让用户已有的标签页失效**，发布后别动。 */
const VIEW_TYPE = "crystal-vault-view";
const RIBBON_ICON = "gem";

/**
 * 卡片目录的默认值 = `config.js` 里那个常量。
 *
 * 那个常量在 dataviewjs 形态下是**写死**的（#2 契约：加晶体 = 建子文件夹，不改脚本）。
 * 插件形态下它必须可配——别人的 vault 不会正好也叫 `3.资产舱/知识卡片`。
 * 默认值仍取它，是为了你自己从 dataviewjs 切过来时**什么都不用填**。
 */
/**
 * 草稿纸落在 vault 的哪个文件夹。
 *
 * **vault 根目录下一个叫「草稿纸」的文件夹**——特意不放在卡片目录底下：
 * 放那儿它就会变成环上的一颗晶体，而草稿纸不是晶体，是便签。
 *
 * 可配（设置页有那一格）：一个公开插件往别人 vault 根上钉一个中文文件夹名，
 * 得让人能改。
 */
const DEFAULT_SCRATCH_FOLDER = "草稿纸";

const DEFAULT_SETTINGS = { cardsFolder: DEFAULT_CARDS_FOLDER, scratchFolder: DEFAULT_SCRATCH_FOLDER };

class CrystalVaultView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.handle = null;
    this.pdfRenderer = null;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return "晶体库";
  }

  getIcon() {
    return RIBBON_ICON;
  }

  async onOpen() {
    const host = this.contentEl;
    host.empty();
    host.addClass("kb-v13-plugin-host");
    this.renderInto(host);
  }

  async onClose() {
    this.dispose();
  }

  /** 拆干净：库自己挂的那些监听、浮窗、样式都得跟着走，否则关一个视图漏一堆。 */
  dispose() {
    if (this.handle && typeof this.handle.close === "function") {
      try {
        this.handle.close();
      } catch (e) {
        /* 收尾失败不该挡住拆视图 */
      }
    }
    this.handle = null;
    this.pdfRenderer = null;
    this.contentEl.empty();
  }

  /**
   * 把库挂进这个视图。
   *
   * 单独一个方法是为了**设置改了之后能原地重挂**——换卡片目录等于换了一整份数据，
   * 唯一的正路是拆了重来（`mount` 里 `container.innerHTML = ""` 也是这么做的）。
   */
  async renderInto(host) {
    this.handle = null;
    // PDF 渲染器在这一层建，从 mount 参数递进去（**不进适配层契约**：契约的语义是
    // 「宿主能力」，而「怎么画 PDF」是核心的实现选择）。与 entry-obsidian.js 同一套。
    this.pdfRenderer = createPdfRenderer({ pdfjs, workerSrc });
    try {
      this.handle = await mount({
        adapter: createObsidianAdapter({
          app: this.app,
          cardsFolder: this.plugin.settings.cardsFolder,
          // 核心只要求「把这段 markdown 画进这个元素」——具体谁来画是宿主的事。
          // 插件里 `MarkdownRenderer` 直接可用（dataviewjs 里反而不可用），
          // Component 传这个视图自己；不要自己 unload 它，Obsidian 随视图一起收。
          renderMd: (md, el, srcPath) =>
            MarkdownRenderer.render(this.app, md, el, srcPath || "", this),
          // 「上次看到哪儿」和偏好改走 plugin.saveData（跟着 vault 走），
          // 不再用 localStorage（跟着这台机器走）。见下面 makeStore。
          store: makeStore(this.plugin),
        }),
        container: host,
        pdfRenderer: this.pdfRenderer,
        // 阅读器顶栏那颗「草稿纸」落在哪儿。不传就没有那颗按钮
        // （宿主没这个能力时**整颗不出现**，不是摆一颗点了没反应的）。
        scratch: { folder: this.plugin.settings.scratchFolder, name: "_" },
        // 样式走仓库根目录的 styles.css（Obsidian 自己加载），运行时一份都不注。
        injectStyles: false,
      });
    } catch (e) {
      host.empty();
      host.createEl("div", {
        cls: "kb-v13-plugin-err",
        text: "晶体库没打开：" + ((e && e.message) || e),
      });
      return;
    }
    // 挂完直接把库**推开**：用户点侧边栏图标要的是「进库」，不是「看见一个按钮」。
    // 关掉全屏之后这个视图还在，那颗按钮留在那儿可以再进去。
    if (this.handle && typeof this.handle.open === "function") this.handle.open();
  }
}

class CrystalVaultSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "晶体库" });

    new Setting(containerEl)
      .setName("卡片目录")
      .setDesc(
        "知识卡片放在哪个文件夹里。**每个子文件夹是一颗晶体**，文件夹名就是晶体名。" +
          "改了之后原来那份布局还在（存储键带着目录路径），换回来就回来了。"
      )
      .addText((t) => {
        t.setPlaceholder(DEFAULT_CARDS_FOLDER).setValue(this.plugin.settings.cardsFolder);
        // ⚠️ **提交时机是「失焦 / 回车」，不是 onChange。**
        //
        // 提交要重挂视图（换目录等于换了一整份数据），而 `onChange` 是**每敲一个
        // 字符**触发一次——用 onChange 的话，用户打「Python」这几个字母，
        // 视图会被拆了重挂六遍：卡顿、闪烁，中途还会因为路径不存在而空一下。
        // （第一版就是这么写的，这是修。）
        const commit = () =>
          Promise.resolve(this.plugin.setCardsFolder(t.inputEl.value)).then(() => this.paintProbe && this.paintProbe());
        t.inputEl.addEventListener("blur", commit);
        t.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") commit();
        });
      });

    // 当下就能看出这个路径对不对。
    //
    // 不加这一条的话，用户改完**不知道生效没有**——而症状是「库里空的，什么都没有」，
    // 看着像插件坏了。这里直接告诉他：这个文件夹在不在、里面有几颗晶体。
    const probe = containerEl.createEl("p", { cls: "setting-item-description" });
    this.paintProbe = () => {
      const path = String(this.plugin.settings.cardsFolder || "").replace(/\/+$/, "");
      if (!path) {
        probe.setText("还没设卡片目录。");
        return;
      }
      const folder =
        this.app.vault.getFolderByPath && this.app.vault.getFolderByPath(path);
      if (!folder) {
        probe.setText(
          "vault 里没有「" + path + "」这个文件夹。先建一个（在文件管理器里右键新建文件夹），" +
            "或者把上面改成你卡片真正所在的地方。"
        );
        return;
      }
      const kids = folder.children || [];
      // 宿主用 `children` 区分文件夹与文件（与适配层同一条判据）
      const subs = kids.filter((c) => c.children !== undefined).length;
      const files = kids.length - subs;
      probe.setText(
        "找到了：里面 " + subs + " 个子文件夹（每个是一颗晶体）、" + files + " 个直属文件。" +
          (subs || files ? "" : "　现在是空的——建一个子文件夹，那就是你的第一颗晶体。")
      );
    };
    this.paintProbe();

    new Setting(containerEl)
      .setName("草稿纸文件夹")
      .setDesc(
        "阅读器顶栏那颗「草稿纸」把便签建在哪儿。**它不是卡片**，不参与晶体库的关系图——" +
          "所以默认放在 vault 根目录，不放进卡片目录（放进去它就会变成一颗晶体）。"
      )
      .addText((t) => {
        t.setPlaceholder(DEFAULT_SCRATCH_FOLDER).setValue(this.plugin.settings.scratchFolder);
        const commit = () =>
          Promise.resolve(this.plugin.setScratchFolder(t.inputEl.value));
        t.inputEl.addEventListener("blur", commit);
        t.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") commit();
        });
      });

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "改完会自动重开一次视图（换目录等于换了一整份数据）。",
    });
  }
}

export default class CrystalVaultPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf) => new CrystalVaultView(leaf, this));

    this.addRibbonIcon(RIBBON_ICON, "打开晶体库", () => this.activateView());
    this.addCommand({
      id: "open",
      name: "打开晶体库",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new CrystalVaultSettingTab(this.app, this));
  }

  // ⚠️ 这里**不要** detachLeavesOfType：那会让用户重开插件后视图全没了。
  // 视图由 Obsidian 自己拆（它会调每个 ItemView 的 onClose）。

  async activateView() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) {
      workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    const raw = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
    if (!this.settings.cardsFolder) this.settings.cardsFolder = DEFAULT_CARDS_FOLDER;
    if (!this.settings.scratchFolder) this.settings.scratchFolder = DEFAULT_SCRATCH_FOLDER;
    // 「上次看到哪儿」、画布排布、面板颜色那一大坨**单独一个字段**，不跟设置混在
    // 一起：它们的寿命不一样（设置是「我的工作台长什么样」，状态是「我上次停在哪」），
    // 而且状态写得极频繁，没理由让每次滚动都去动设置页看的那几个值。
    this.store = raw.__state && typeof raw.__state === "object" ? raw.__state : {};
    this.saving = 0;
  }

  /**
   * 落盘。**防抖**——视图状态是随滚动和拖动写的，一次交互能来几十下，
   * 每一下都写一次 data.json 是没必要的 IO。
   *
   * 与核心那侧 250ms 的视图状态防抖同一个量级，取 400 是因为到这里已经是
   * 「一件事办完了没有」的量级了。
   */
  persist() {
    if (this.saving) clearTimeout(this.saving);
    this.saving = setTimeout(() => {
      this.saving = 0;
      this.saveData({ ...this.settings, __state: this.store });
    }, 400);
  }

  /** 立刻落盘（关插件、改设置这类「不能等」的场合） */
  async flush() {
    if (this.saving) {
      clearTimeout(this.saving);
      this.saving = 0;
    }
    await this.saveData({ ...this.settings, __state: this.store });
  }

  /**
   * 改卡片目录：存下来，并**把开着的视图重挂一遍**。
   *
   * 不重挂的话，用户改完目录、切回那个标签页，看到的还是旧目录的数据——
   * 而设置页上明明写着改了。那比不支持修改更糟。
   */
  /** 改草稿纸位置。同样要重挂视图——阅读器是拿着这个路径建起来的。 */
  async setScratchFolder(v) {
    const next = String(v || "").trim().replace(/\/+$/, "");
    if (!next || next === this.settings.scratchFolder) return;
    this.settings.scratchFolder = next;
    await this.flush();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (view && typeof view.dispose === "function" && typeof view.renderInto === "function") {
        view.dispose();
        await view.renderInto(view.contentEl);
      }
    }
    new Notice("晶体库：草稿纸改到 " + this.settings.scratchFolder);
  }

  async setCardsFolder(v) {
    const next = String(v || "").trim().replace(/\/+$/, "");
    if (!next || next === this.settings.cardsFolder) return;
    this.settings.cardsFolder = next;
    await this.flush();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (view && typeof view.dispose === "function" && typeof view.renderInto === "function") {
        view.dispose();
        await view.renderInto(view.contentEl);
      }
    }
    new Notice("晶体库：卡片目录已改成 " + this.settings.cardsFolder);
  }

  async onunload() {
    // 关插件（或者用户禁用）时把还在防抖窗口里的那一笔写下去。
    // 不写的话，最后一次滚动/拖动就丢了——而用户多半就是摆完位置就关了。
    await this.flush();
  }
}

/**
 * 视图状态/偏好的存储后端，落在 `plugin.saveData` 里。
 *
 * 契约是「进出都是 JSON 字符串」（见 entry-obsidian.js 里 backing 那段）。
 *
 * ⚠️ `get` 有一层 **localStorage 回退**，是给第一版用户的一次性迁移：
 * 插件 1.0.0 把那坨状态存在 localStorage 里，直接切到 saveData 会让用户
 * **已经摆好的画布、推到的镜头、调过的颜色凭空消失**——而屏幕上没有任何东西
 * 说明为什么。读的时候顺手看一眼旧地方，读到就自然带过来，下次写盘就落新家了。
 *
 * 只读回退、不回写 localStorage：迁移是一次性的，两边都写会让「哪个是真的」变得
 * 说不清（用户清一次浏览器数据就退回旧值）。
 */
function makeStore(plugin) {
  return {
    get(key) {
      const v = plugin.store[key];
      if (typeof v === "string") return v;
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },
    set(key, str) {
      plugin.store[key] = str;
      plugin.persist();
    },
  };
}
