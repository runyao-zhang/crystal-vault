// 网页端 markdown 渲染器 —— 只为原型验证用。
//
// Obsidian 侧走的是原生 MarkdownRenderer（MathJax），这里是它的近似：
// marked 负责 markdown，KaTeX 负责公式。两者排版细节不完全等同，
// 但足以验证「公式、标题、列表、引用、粗斜体、表格、图片、代码块」是否都出来了。
//
// 已知差异（不打算追平）：
//   - callout、脚注、嵌套 dataview/mermaid 都不执行，和 Obsidian 侧行为一致。

import { marked } from "marked";
import katex from "katex";
import { esc } from "../core/dom.js";
import { maskCode } from "../core/model.js";

const MATH_RE = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
const WIKILINK_RE = /(!?)\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;

/**
 * 在「涂掉代码」的副本上找匹配，再按索引把替换值拼回原串。
 *
 * 为什么不能直接 replace：围栏里**就是**公式是常态（```latex 里写 $$…$$ 正是 #17
 * 的用法）。裸正则会在 marked 解析围栏之前把围栏内容抽走，围栏只剩一个占位符，
 * 公式于是被 KaTeX 渲进 <code> 里；接着 #17 的公式围栏要读 code.textContent 当
 * LaTeX 源码，读到的是 KaTeX 的渲染产物，再渲染一遍就成了三重乱码。
 *
 * 偏移可以直接用，因为 maskCode 涂的是**等长**空白；匹配落在代码外时该处原文
 * 未被涂改，所以捕获组也是原样的。
 */
function replaceOutsideCode(raw, re, make) {
  const masked = maskCode(raw);
  const hits = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(masked))) hits.push([m.index, m.index + m[0].length, m]);
  if (!hits.length) return raw;

  let out = "";
  let at = 0;
  for (const [start, end, mm] of hits) {
    out += raw.slice(at, start) + make(mm);
    at = end;
  }
  return out + raw.slice(at);
}

/**
 * @param {object} opts
 * @param {(path: string) => string} [opts.assetUrl] 图片 / 附件路径解析
 */
export function createWebRenderer({ assetUrl } = {}) {
  const resolveAsset = assetUrl || (() => "");

  return function renderMarkdownWeb(md, el) {
    const maths = [];
    const wikis = [];

    // 先把公式和双链抽成占位符，免得被 marked 转义或吃掉。
    // 两者都跳过代码——围栏里的公式要原样留给 #17 的公式围栏去读，
    // 代码里的 [[...]] 也不该变成链接（Obsidian 的 metadataCache 同样不解析）。
    const raw = String(md);
    let src = replaceOutsideCode(raw, MATH_RE, (m) => {
      maths.push(m[0]);
      return "@@MATH" + (maths.length - 1) + "@@";
    });
    src = replaceOutsideCode(src, WIKILINK_RE, (m) => {
      wikis.push({ embed: m[1] === "!", target: m[2].trim(), alias: (m[3] || "").trim() });
      return "@@WIKI" + (wikis.length - 1) + "@@";
    });

    let html = marked.parse(src, { gfm: true, breaks: false });

    html = html.replace(/@@MATH(\d+)@@/g, (_, i) => {
      const raw = maths[Number(i)];
      const display = raw.startsWith("$$");
      const body = display ? raw.slice(2, -2) : raw.slice(1, -1);
      try {
        return katex.renderToString(body, { displayMode: display, throwOnError: false });
      } catch (e) {
        return esc(raw);
      }
    });

    html = html.replace(/@@WIKI(\d+)@@/g, (_, i) => {
      const w = wikis[Number(i)];
      const label = w.alias || w.target;
      if (w.embed) {
        const url = resolveAsset(w.target);
        if (url) return '<img src="' + escapeAttr(url) + '" alt="">';
        return '<span class="kb-v13-missing-asset">[缺附件] ' + esc(w.target) + "</span>";
      }
      // ADR-0002：双链在原生渲染下变成真链接，这里给等价形态
      return '<a class="kb-v13-wikilink" data-href="' + escapeAttr(w.target) + '">' + esc(label) + "</a>";
    });

    el.innerHTML = html;
  };
}

function escapeAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}
