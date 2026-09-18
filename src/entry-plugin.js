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
import { CARDS_FOLDER } from "./config.js";

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
const DEFAULT_SETTINGS = { cardsFolder: CARDS_FOLDER };

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
        }),
        container: host,
        pdfRenderer: this.pdfRenderer,
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
      .addText((t) =>
        t
          .setPlaceholder(CARDS_FOLDER)
          .setValue(this.plugin.settings.cardsFolder)
          .onChange(async (v) => {
            const next = String(v || "").trim().replace(/\/+$/, "");
            if (!next || next === this.plugin.settings.cardsFolder) return;
            this.plugin.settings.cardsFolder = next;
            await this.plugin.saveSettings();
          })
      );

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

  async onunload() {
    // 视图由 Obsidian 拆（它会调每个 ItemView 的 onClose），这里不用手动遍历。
    // **不要** detachLeavesOfType：那会让用户重开插件后视图全没了。
  }

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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!this.settings.cardsFolder) this.settings.cardsFolder = CARDS_FOLDER;
  }

  /**
   * 存设置，并**把开着的视图重挂一遍**。
   *
   * 不重挂的话，用户改完目录、切回那个标签页，看到的还是旧目录的数据——
   * 而设置页上明明写着改了。那比不支持修改更糟。
   */
  async saveSettings() {
    await this.saveData(this.settings);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (view && typeof view.dispose === "function" && typeof view.renderInto === "function") {
        view.dispose();
        await view.renderInto(view.contentEl);
      }
    }
    new Notice("晶体库：卡片目录已改成 " + this.settings.cardsFolder);
  }
}
