// 插件形态的样式出口（3.0 刀 10）。
//
// 这个模块**没有别的用途**：构建脚本 import 它、把默认导出的那个字符串写成插件仓
// 根目录的 `styles.css`。Obsidian 加载插件时会自己读那个文件，所以插件形态下
// `mount({ injectStyles: false })`，运行时一份都不注（理由见 app.js 里那段）。
//
// 两份 CSS 必须**都在**，而且顺序不能反：
//   1. `styles.js` 的 CSS —— 主体；
//   2. `embedstory.js` 的 EMBED_CSS —— 结构窗那一小块。
// 运行时注入时 embedstory 那份是**后到**的（模块加载完才注），所以它在后面。
// 这里保持一致，否则插件版和 dataviewjs 版同一个选择器的胜负会反过来。
//
// ⚠️ 改这两个模块的导出名时记得同步这里——它是**唯一**知道「插件版要哪两份」的地方。

import { CSS } from "./core/styles.js";
import { EMBED_CSS } from "./core/embedstory.js";

export default CSS + EMBED_CSS;
