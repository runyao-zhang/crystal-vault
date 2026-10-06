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
// 悬浮伴侣（独立 Electron 窗口）。**它不是插件的一部分**——是一个单独的产物，
// 买家要装两样。这里只负责"找到它、拉起来、桥的生命周期"，全部逻辑在 companion.js。
import { createCompanion, detectCompanionPath } from "./companion.js";
import { prefsKey, viewStateKey } from "./adapter.js";
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

/**
 * 3.0 刀 18：阅读器收纳栏那条竖栏的底色。**默认白。**
 *
 * 为什么是白的：用户点名要的（他那一侧是浅色主题）。而阅读器其余部分跟着宿主的
 * 深色主题走，两者并排本来就未必合眼——所以它可配，不是写死的。
 */
const DEFAULT_DOCK_COLOR = "#ffffff";

/**
 * 伴侣路径**存在 Obsidian 的 localStorage 里，不进 data.json**。
 *
 * 理由：data.json 跟着 vault 走（同步到手机、传到别的电脑），而一个
 * `C:\Users\甲\AppData\...\CrystalFloat.exe` 换台机器就是错的。
 * 「这台机器上那个程序装在哪」是纯机器局部的属性，寿命不该跟着库走。
 *
 * 读不到就退回自动探测（见 companion.js 的 detectCompanionPath），
 * 所以这一格大多数人是永远不用填的。
 */
const FLOAT_PATH_KEY = "crystal-vault:float-path";

/**
 * **开发用**：未打包时指向伴侣的应用目录（`dist/floating/`）。
 *
 * 填了它，启动就变成 `electron.exe <这一格> --bridge …`，于是**不必先打包**
 * 就能把整条链在自己的库里跑通。装了正式版之后清空这一格即可——
 * 打包后的 exe 自带入口，多一个目录参数反而起不来。
 *
 * 同样存在 localStorage：它指向的是这台机器上的一份构建产物，跟 vault 无关。
 */
const FLOAT_APPDIR_KEY = "crystal-vault:float-appdir";

/** 伴侣的下载页。找不到程序时那颗按钮指向它。 */
const FLOAT_DOWNLOAD_URL = "https://github.com/runyao-zhang/crystal-vault-float/releases/latest";

const DEFAULT_SETTINGS = {
  cardsFolder: DEFAULT_CARDS_FOLDER,
  scratchFolder: DEFAULT_SCRATCH_FOLDER,
  dockColor: DEFAULT_DOCK_COLOR,
  // 3.0 刀 36/37：**打开方式**。三档，出厂是全屏（老行为）。
  //   · `"full"`     铺满整个窗口，盖在笔记上
  //   · `"windowed"` 收成屏幕上一块可拖可缩的矩形，浮在笔记上
  //   · `"embedded"` 就长在它那颗 Obsidian 标签页里，不盖任何东西
  // ⚠️ 1.3.70/1.3.71 里它是**布尔** `windowed`。`loadSettings` 里有一条迁移把它读过来
  // ——**别把那条删了**，删了的话已经切过浮窗的人升级后会静默回到全屏。
  openMode: "full",
  /** 浮窗上次摆在哪儿 `{x,y,w,h}`。**跟着 vault 走**（同其它设置），
   *  于是换台机器打开时窗口也在你习惯的位置。`null` = 还没摆过，用默认摆位。 */
  windowBox: null,
};

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
        // ⚠️ **落在卡片目录里面**（用户 09-20 点名）：那样「草稿纸」就是环上的
        // 一颗晶体，草稿纸是它里面的真卡片——会出现在库里、参与关系图。
        // （第一版放在 vault 根目录，特意躲开晶体身份；用户要的是反过来。）
        scratch: {
          folder:
            String(this.plugin.settings.cardsFolder || "").replace(/\/+$/, "") +
            "/" +
            String(this.plugin.settings.scratchFolder || "").replace(/^\/+|\/+$/g, ""),
        },
        // 3.0 刀 18：阅读器收纳栏那条竖栏的底色。**只影响一层皮**，
        // 所以它是设置项而不是核心偏好（理由见 `prefs.js` 那个白名单的坑）。
        dockColor: this.plugin.settings.dockColor,
        // 3.0 刀 36：非全屏（浮窗）。三项一起给，缺一不可：
        //   · windowed   —— 这次开成哪个档（设置里那行「打开方式」）
        //   · windowBox  —— 上次摆在哪儿
        //   · onWindowBox—— 拖完/缩完之后写回设置（不然下次又回默认摆位）
        // `onToggleWindow` 是顶栏那颗按钮：**切档 + 重挂**。
        windowed: this.plugin.settings.openMode === "windowed",
        embedded: this.plugin.settings.openMode === "embedded",
        windowBox: this.plugin.settings.windowBox,
        onWindowBox: (box) => this.plugin.saveWindowBox(box),
        onToggleWindow: () => this.plugin.cycleOpenMode(),
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
        "阅读器顶栏那颗「草稿纸」把便签建在**卡片目录里的哪个子文件夹**。" +
          "那个子文件夹就是环上的一颗晶体，你起的每张草稿纸是它里面的一张真卡片。"
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

    // 3.0 刀 36：打开方式。**下拉而不是开关**——两档各有各的用处，说成
    // "开/关"会让人以为浮窗是某种增强功能，而它其实是"占多少屏幕"的取舍。
    new Setting(containerEl)
      .setName("打开方式")
      .setDesc(
        "全屏：铺满整个窗口，盖在笔记上，老行为。" +
          "浮窗：收成屏幕上一块可拖可缩的矩形，浮在笔记上——拖顶栏挪位置、" +
          "拖右下角改大小，**下次打开还在你放的地方**（这份设置跟着 vault 走）。" +
          "嵌入：就长在它那颗 Obsidian 标签页里，不盖任何东西，可以和别的标签页分屏。" +
          "库里顶栏那颗按钮能随时循环切换（全屏 → 浮窗 → 嵌入），**换档都会重开一次视图**。"
      )
      .addDropdown((d) => {
        d.addOption("full", "全屏");
        d.addOption("windowed", "浮窗");
        d.addOption("embedded", "嵌入");
        d.setValue(String(this.plugin.settings.openMode));
        d.onChange(async (v) => {
          if (String(v) === String(this.plugin.settings.openMode)) return;
          // 走同一个方法落档（它与顶栏那颗按钮是同一条路，不另写一份）。
          // ⚠️ 那个方法是**循环**的（给按钮用），所以这里不能直接调——先把
          // 当前档设成"目标档的前一档"，再循环一步就正好落到目标档。
          // 听着绕，但比再写一份"设到某一档"的实现强：两份实现迟早会漂。
          const order = ["full", "windowed", "embedded"];
          const want = order.indexOf(String(v));
          if (want < 0) return;
          this.plugin.settings.openMode = order[(want + order.length - 1) % order.length];
          await this.plugin.cycleOpenMode();
          d.setValue(String(this.plugin.settings.openMode));
        });
      });

    new Setting(containerEl)
      .setName("收纳栏底色")
      .setDesc(
        "阅读器左边那条收纳栏（顶栏那颗「收纳栏」开出来的）的底色。默认白色。" +
          "它只换一层皮，所以**改完当场生效**，不会重开视图——上面两项才要重开。"
      )
      .addColorPicker((p) => {
        p.setValue(this.plugin.settings.dockColor).onChange((v) =>
          this.plugin.setDockColor(v)
        );
      });

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "改完会自动重开一次视图（换目录等于换了一整份数据）。",
    });

    // ── 悬浮伴侣 ────────────────────────────────────────────────────────
    //
    // 这一段是买家唯一会看到「为什么我要装第二个程序」的地方，所以文案要把
    // 那句话说出来，而不是让用户自己纳闷。**一句话说完，不辩解。**
    containerEl.createEl("h3", { text: "悬浮伴侣（独立窗口）" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text:
        "把「边看边记」和「结构窗」浮在其它窗口之上（比如压在 Edge 上面）。" +
        "它必须是一个**单独的程序**——Obsidian 的插件沙箱里造不出系统级的窗口，" +
        "这是平台限制，不是偷懒。没装它的时候，上面所有功能照常，只是没有这两条命令。",
    });

    const pathSetting = new Setting(containerEl)
      .setName("伴侣程序路径")
      .setDesc("留空 = 自动查找常见安装位置。找不到时点右边那颗「自动检测」。")
      .addText((t) => {
        let cur = "";
        try {
          cur = this.plugin.app.loadLocalStorage(FLOAT_PATH_KEY) || "";
        } catch {
          cur = "";
        }
        t.setPlaceholder("（自动）").setValue(cur).onChange((v) => {
          try {
            this.plugin.app.saveLocalStorage(FLOAT_PATH_KEY, String(v || "").trim());
          } catch {
            /* 存不下就只是这次会话有效，不致命 */
          }
        });
      })
      .addButton((b) =>
        b.setButtonText("自动检测").onClick(() => {
          const hit = this.plugin.companionPath();
          if (hit) {
            try {
              this.plugin.app.saveLocalStorage(FLOAT_PATH_KEY, hit);
            } catch {
              /* 同上 */
            }
            new Notice("晶体库：找到伴侣了 —— " + hit);
            this.display(); // 重画一遍，把找到的路径显示出来
          } else {
            new Notice("晶体库：没找到。装完之后回来再点一次，或者手动填路径。", 8000);
          }
        })
      )
      .addButton((b) =>
        b.setButtonText("下载").onClick(() => {
          try {
            globalThis.require("electron").shell.openExternal(FLOAT_DOWNLOAD_URL);
          } catch {
            new Notice("晶体库：打不开浏览器，地址是 " + FLOAT_DOWNLOAD_URL, 10000);
          }
        })
      );
    pathSetting.settingEl.addClass("kb-v13-float-setting");

    new Setting(containerEl)
      .setName("开发用：未打包的应用目录")
      .setDesc(
        "**只在开发时用**。填了它，启动方式变成 `electron.exe <这一格> --bridge …`，" +
          "于是不必先打包就能试。装了正式版之后**请清空这一格**——" +
          "打包后的程序自带入口，多一个目录参数会让它起不来。"
      )
      .addText((t) => {
        let cur = "";
        try {
          cur = this.plugin.app.loadLocalStorage(FLOAT_APPDIR_KEY) || "";
        } catch {
          cur = "";
        }
        t.setPlaceholder("（留空 = 用已打包的程序）")
          .setValue(cur)
          .onChange((v) => {
            try {
              this.plugin.app.saveLocalStorage(FLOAT_APPDIR_KEY, String(v || "").trim());
            } catch {
              /* 存不下就只是这次会话有效 */
            }
          });
      });

    new Setting(containerEl)
      .setName("试一试")
      .setDesc("起一扇悬浮窗，看看通不通。它不会动你库里的东西。")
      .addButton((b) =>
        b.setButtonText("打开悬浮窗").onClick(() => this.plugin.openFloating("reader"))
      )
      .addButton((b) =>
        b.setButtonText("复制诊断信息").onClick(async () => {
          // 买家没有开发环境，这几行日志是他能给回来的唯一线索。
          const c = this.plugin.getCompanion();
          const logs = c.getLogs();
          const text = [
            "晶体库 悬浮伴侣 诊断",
            "插件版本: " + (this.plugin.manifest ? this.plugin.manifest.version : "?"),
            "伴侣路径: " + (this.plugin.companionPath() || "(没找到)"),
            "卡片目录: " + this.plugin.settings.cardsFolder,
            "--- 日志 ---",
            ...(logs.length ? logs : ["(还没有日志，先点一次「打开悬浮窗」)"]),
          ].join("\n");
          try {
            await navigator.clipboard.writeText(text);
            new Notice("晶体库：诊断信息已复制");
          } catch {
            console.log(text);
            new Notice("晶体库：复制失败，已打到控制台");
          }
        })
      );
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

    // 悬浮伴侣那两条。**没装伴侣时它们照样出现**——点下去给一句人话 + 一个下载入口，
    // 而不是"命令列表里没有这一条"。藏起来的话用户根本不知道有这功能
    // （代价是命令面板里多两行，比"功能不可发现"轻）。
    this.addCommand({
      id: "float-reader",
      name: "独立窗口：边看边记",
      callback: () => this.openFloating("reader"),
    });
    this.addCommand({
      id: "float-story",
      name: "独立窗口：结构窗",
      callback: () => this.openFloating("story"),
    });

    this.addSettingTab(new CrystalVaultSettingTab(this.app, this));
  }

  // ── 悬浮伴侣 ──────────────────────────────────────────────────────────

  /**
   * 懒建。**没点过「独立窗口」的人不该多一个监听端口**——
   * 桥只在第一次真要用的时候才起（`ensureBridge` 是幂等的）。
   */
  getCompanion() {
    if (!this.companion) {
      this.companion = createCompanion({
        // 复用同一份适配层工厂：桥转发给它的就是应用内那一份在用的同一个东西。
        adapter: createObsidianAdapter({
          app: this.app,
          cardsFolder: this.settings.cardsFolder,
          renderMd: (md, el, srcPath) => MarkdownRenderer.render(this.app, md, el, srcPath || "", this),
          store: makeStore(this),
        }),
        store: makeStore(this),
        version: this.manifest ? this.manifest.version : "",
      });
    }
    return this.companion;
  }

  /** 用户在设置里指定的路径优先；没指定就按常见位置找（见 companion.js）。 */
  companionPath() {
    let explicit = "";
    try {
      explicit = this.app.loadLocalStorage(FLOAT_PATH_KEY) || "";
    } catch {
      explicit = ""; // 老版本 Obsidian 没有这个 API，退回自动探测
    }
    let vaultPath = "";
    try {
      vaultPath = this.app.vault.adapter.getBasePath() || "";
    } catch {
      vaultPath = "";
    }
    return detectCompanionPath({ explicit, vaultPath });
  }

  /**
   * 种子：用户在 Obsidian 里摆好的那套，**第一次打开悬浮窗时该是那个样子**。
   *
   * 只播一次种。之后伴侣用它自己的命名空间键（`:float` 后缀），两边各存各的
   * ——共用的话，两边会同时防抖写 `prefs.readerDesk`，而桌窗坐标是**桌面局部**的，
   * 悬浮窗桌面尺寸不同，几何会在两个值之间来回跳。
   */
  buildSeed() {
    const store = makeStore(this);
    const cf = this.settings.cardsFolder;
    const readJson = (k) => {
      try {
        const raw = store.get(k);
        return raw == null ? null : JSON.parse(raw);
      } catch {
        return null;
      }
    };
    const seed = {
      prefs: readJson(prefsKey(cf)),
      viewState: readJson(viewStateKey(cf)),
      dockColor: this.settings.dockColor,
      scratch: {
        folder:
          String(cf || "").replace(/\/+$/, "") +
          "/" +
          String(this.settings.scratchFolder || "").replace(/^\/+|\/+$/g, ""),
      },
    };
    // 那边现在开着哪份文献，就让它接着看哪一份。句柄上是**只读**的取法
    // （`handle.reader.doc()`），操作入口一律留在真实按钮上——见 app.js 那段注释。
    try {
      const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
      const h = leaf && leaf.view && leaf.view.handle;
      const d = h && h.reader && h.reader.doc();
      if (d && d.path) seed.docPath = d.path;
    } catch {
      /* 视图没开着就没有种子文献，正常 */
    }
    if (seed.prefs && seed.prefs.readerStoryCrystal) seed.crystal = seed.prefs.readerStoryCrystal;
    return seed;
  }

  /** 打开悬浮窗。找不到伴侣时给一句人话 + 一个下载入口，而不是静默失败。 */
  async openFloating(mode) {
    const exe = this.companionPath();
    if (!exe) {
      new Notice("晶体库：还没装「悬浮伴侣」。它是**单独一个程序**——Obsidian 的插件造不出系统级窗口。设置页里有下载入口。", 10000);
      return;
    }
    // 开发形态：填了应用目录就用 `electron.exe <目录>` 起（见 FLOAT_APPDIR_KEY）。
    let appDir = "";
    try {
      appDir = String(this.app.loadLocalStorage(FLOAT_APPDIR_KEY) || "").trim();
    } catch {
      appDir = "";
    }
    // ⚠️ 只认 electron.exe。填着这一格又换成正式版 exe 的话，多出来的目录参数
    // 会让它**起不来且不报错**（Electron 把那个目录当成第二个应用入口）。
    // 与其让用户对着一扇不出现的窗发呆，不如在这里忽略掉、并且说一句。
    if (appDir && !/electron(\.exe)?$/i.test(exe)) {
      new Notice("晶体库：填了「开发用应用目录」但启动的是正式版程序，已忽略那一格。装完正式版请把它清空。", 8000);
      appDir = "";
    }

    try {
      await this.getCompanion().launch(exe, {
        mode,
        cardsFolder: this.settings.cardsFolder,
        seed: this.buildSeed(),
        appDir,
      });
    } catch (e) {
      new Notice("晶体库：悬浮窗没起来——" + ((e && e.message) || e), 10000);
    }
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
    if (!/^#[0-9a-f]{6}$/i.test(String(this.settings.dockColor || ""))) {
      this.settings.dockColor = DEFAULT_DOCK_COLOR;
    }
    // 3.0 刀 36：浮窗那两项也要过一道。**不可信输入**（用户手改过 data.json、
    // 或者从旧版本升上来）——`windowed` 只要真值语义，`windowBox` 形状不对就当没有，
    // 让它回默认摆位。交给核心那边兜也行，但这里顺手做掉，设置页读的时候才一致。
    // ⚠️ **1.3.70/1.3.71 那个布尔 `windowed` 的迁移。** 那两版里「打开方式」
    // 只有全屏/浮窗两档、存的是一个布尔；1.3.72 起换成了三档的字符串。
    // 不迁的话，已经切过浮窗的人升级后会**静默回到全屏**（`openMode` 取默认值），
    // 而他会以为自己那次设置没生效。只在"没有 openMode 但 windowed 是真的"时才迁。
    if (!raw.openMode && raw.windowed === true) this.settings.openMode = "windowed";
    if (["full", "windowed", "embedded"].indexOf(String(this.settings.openMode)) < 0) {
      this.settings.openMode = "full";
    }
    const wb = this.settings.windowBox;
    this.settings.windowBox =
      // ⚠️ **不能只 `Number.isFinite(Number(v))`**：`Number(null)` 与 `Number("")`
      // 都是 `0`（有限），那样 `{x:null,…}` 会被当成合法矩形。与核心那边
      // `validBox` 同一条口径。
      wb && typeof wb === "object" && ["x", "y", "w", "h"].every((k) => typeof wb[k] === "number" && Number.isFinite(wb[k]))
        ? { x: wb.x, y: wb.y, w: wb.w, h: wb.h }
        : null;
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

  /**
   * 3.0 刀 36：记下浮窗摆在哪儿。**不重挂视图**——重挂会把阅读器里开着的文献、
   * 桌面上摆的窗全丢掉，而拖动一次窗口就来一记，那代价完全不成比例。
   * 窗口的矩形是 `mount` 那边自己在改的，这里只负责落盘。
   */
  async saveWindowBox(box) {
    this.settings.windowBox = box && typeof box === "object" ? { ...box } : null;
    await this.flush();
  }

  /**
   * 3.0 刀 36：全屏 ⇄ 浮窗（顶栏那颗按钮）。
   *
   * ⚠️ **必须重挂**，和 `setCardsFolder` 那两个同一类理由：这一档换的是
   * **库的几何**——三块层的矩形、环形排布的缩放基准（`createMetrics` 是挂载时
   * 算一次）、以及一堆"这一层多大"的推导，全都长在挂载那一刻。原地改的话
   * 总有一块不跟着变，而那种坏法是"卡片位置差一截"，很难查。
   *
   * 代价是阅读器里开着的文献、桌面上的窗会没——与 `setCardsFolder` 同一条，
   * 换档本来就是件"重新摆一次"的事，用户点它的时候心里有数。
   */
  async cycleOpenMode() {
    // ⚠️ **重入闸。** 这个方法是"翻一档 + 重挂视图"，而重挂是异步的（要 await mount）。
    // 两档的时候没有这个问题（连点两下等于没点）；三档之后**连点两下会跳一档**
    // ——用户想要浮窗，落在嵌入，而提示还报着错的那个名字。
    // 更糟的是两次重挂会撞在一起：第一次的 `handle` 还是 null（正在 mount），
    // 第二次的 `dispose` 看到 null 就跳过 close，把 `contentEl` 从正在跑的那个
    // mount 底下清空，于是同一个容器上跑起**两个活实例**（两份监听、一份被丢弃）。
    if (this.modeBusy) return;
    this.modeBusy = true;
    try {
      await this._cycleOpenModeOnce();
    } finally {
      this.modeBusy = false;
    }
  }

  /** 真正翻档那一下（拆出来是为了让上面的闸管得住它）。 */
  async _cycleOpenModeOnce() {
    // 三档循环：全屏 → 浮窗 → 嵌入 → 全屏。**顺序与库顶栏那颗按钮的文案一致**
    // （它写的就是"下一档叫什么"，见 app.js 里那颗）。
    const order = ["full", "windowed", "embedded"];
    const at = order.indexOf(String(this.settings.openMode));
    this.settings.openMode = order[(at + 1) % order.length];
    // 切成浮窗时**把上次那个矩形留着**：来回切几次不该每次都回到默认摆位。
    await this.flush();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (view && typeof view.dispose === "function" && typeof view.renderInto === "function") {
        view.dispose();
        await view.renderInto(view.contentEl);
        // 重挂之后 `renderInto` 自己会 `open()`，不用在这里再喊。
      }
    }
    const label = { full: "回到全屏了", windowed: "收成浮窗了", embedded: "嵌进这颗标签页了" };
    new Notice("晶体库：" + (label[this.settings.openMode] || "换档了"));
  }

  /**
   * 改收纳栏底色（3.0 刀 18）。
   *
   * ⚠️ **不重挂视图**，与上面两个 setter 正相反。那两个换的是数据（卡片目录、
   * 草稿纸落点），不重挂就会指着一份不存在的数据；这个只换一个 CSS 变量。
   * 重挂的代价在这里格外大：阅读器里开着的文献、桌面上摆的那几扇窗全会没。
   * 而取色器是**拖出来的**，一次拖动会来几十个 `change`——那就是几十次重挂。
   *
   * 走 handle 上的 `setDockColor` 而不是自己去 setProperty：那一句话属于核心
   * （它才知道变量铺在哪一层），这里只负责把值转过去。这个文件里不该有业务逻辑，
   * 见文件头。
   */
  async setDockColor(v) {
    const next = String(v || "").trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(next) || next === this.settings.dockColor) return;
    this.settings.dockColor = next;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const h = leaf.view && leaf.view.handle;
      if (h && typeof h.setDockColor === "function") h.setDockColor(next);
    }
    // 防抖那一条（400ms），不是 `flush()`：拖一次取色器几十个事件，
    // 每个都整份写一遍 data.json 没必要。寿命上它也只是个设置。
    this.persist();
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
    // 伴侣跟着一起收。**顺序在 companion.stop() 里**（先杀伴侣再停桥）——
    // 反过来的话伴侣会看到桥没了、弹一句"连接断了"，而用户明明是正常关的 Obsidian。
    if (this.companion) {
      try {
        await this.companion.stop();
      } catch {
        /* 卸载路径上不许抛 */
      }
      this.companion = null;
    }
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
