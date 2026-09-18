// #17 公式围栏 —— ```latex / ```math / ```tex 的围栏块按公式渲染。
//
// 宿主只认 $...$ / $$...$$（Obsidian 侧是原生 MathJax），围栏代码块一律当代码，
// 全 Obsidian 都这样，不是本库的取舍。所以渲染落地后在这里把围栏内容抽出来，
// 按公式再过一次渲染器，把那个 <pre> 原地换掉。
//
// 换的时机必须在 attachCodeFloats 之前：换掉的 <pre> 已经不是代码块，
// 不该再由代码块那条路给它挂入口（那会留下一堆指向死节点的回调，见 hologram.js 的 renderInto）。
// 公式围栏自己那份悬浮入口由 mathfloat.js 挂在**换出来的容器**上。
//
// 换的顺序也必须在**渲染之前**：先把容器挂进文档再往里渲染。Obsidian 侧是
// MathJax，排版要求节点已在文档里，离屏渲染会静默什么都不做。详见下面 expandMathFences。
//
// 围栏语言（latex / math / tex）在换掉 <pre> 的那一刻就没了——它只写在 <code> 的
// className 上。所以取下来存在容器的 data 上，供悬浮窗标题栏用（见下面 jobs 那一段）。

import { EL } from "./dom.js";

// 认这三种围栏语言：latex / tex 是写 LaTeX 的两种叫法，math 是「这就是公式」的直说。
// 不锚定两端——宿主会往 className 里加别的东西（codefloat.js 的 langOf 同样只找这一段）。
const MATH_LANG_RE = /language-(latex|tex|math)\b/i;

// 整篇 LaTeX 文档不是公式：\documentclass 那一套 MathJax 渲染不了，套进 $$ 只会
// 得到一串报错，而它本来就是**代码**（写给人看怎么起一篇文档）。这种留作代码块。
//
// 只认 document 这一层，别顺手把 \begin{...} 全否了——align / cases / matrix
// 这些环境是公式的一部分，本来就该渲染。
const DOC_RE = /\\(documentclass|usepackage|begin\s*\{\s*document\s*\}|end\s*\{\s*document\s*\})/;

/**
 * 围栏内容 → 可以交给宿主渲染器的公式源码。
 * 返回 null 表示「别动它，留着当代码块」。
 */
export function mathSourceOf(text) {
  const body = String(text == null ? "" : text).replace(/\s+$/, "");
  if (!body.trim()) return null;
  if (DOC_RE.test(body)) return null;

  // \[ \] → $$ $$、\( \) → $ $：宿主只认 $ 这一套定界符。
  // 替换值一律写成函数：替换串里的 $$ 是「一个字面 $」的转义，直接写字面量会少一半。
  const norm = body
    .replace(/\\\[/g, () => "$$")
    .replace(/\\\]/g, () => "$$")
    .replace(/\\\(/g, () => "$")
    .replace(/\\\)/g, () => "$");

  // 自带定界符的原样交给渲染器（一块围栏里可以放好几条公式，中间的文字也照常排版）；
  // 裸公式没有定界符可依，整段套成一块 $$。
  return norm.includes("$") ? norm : "$$\n" + norm + "\n$$";
}

/**
 * 把正文里公式围栏的 <pre> 就地换成渲染好的公式。
 *
 * 返回 Promise：宿主渲染是异步的（Obsidian 侧那条就是），必须等它落地才换得掉。
 * 每块各自渲染进自己的容器，位置互不相干，所以并发跑得。
 */
export function expandMathFences(ctx, el, path) {
  const jobs = [];
  el.querySelectorAll("pre").forEach((pre) => {
    const code = pre.querySelector("code");
    // 用 exec 而不是 test：`latex` / `math` / `tex` 这个字要跟着容器走
    // （<pre> 一换掉，className 就没了，浮窗标题栏到时候无从取值）
    const lang = code && MATH_LANG_RE.exec(String(code.className || ""));
    if (!lang) return;
    const md = mathSourceOf(code.textContent);
    if (md) jobs.push({ pre, md, fence: lang[1].toLowerCase() });
  });
  if (!jobs.length) return Promise.resolve();

  return Promise.all(
    jobs.map(({ pre, md, fence }) => {
      // 面板可能已经在这期间换卡（box 被清空）：节点不在树上就没什么可换的
      if (!pre.parentNode) return Promise.resolve();

      // 先把容器换进去，**再**往里渲染——顺序反过来就是那个只在真库里出现的 bug：
      // Obsidian 侧是 MathJax，排版要求节点已经在文档里，渲染进一个离屏节点会
      // 静默地什么都不做，等换进去时里面已经是空的。网页端 KaTeX 是同步拼字符串，
      // 所以从前这条在原型上一直看不出毛病，只有 vault 里公式不出现。
      const holder = EL("div", "kb-v13-mathfence");
      // 围栏语言存下来：<pre> 换掉之后它就没有别的出处了（mathfloat.js 读它做标题栏）
      holder.dataset.kbFence = fence;
      pre.parentNode.replaceChild(holder, pre);

      // 渲染不出来就把代码块还回去：围栏退回成代码，好过留一片空白（本仓「不留死路」）。
      // 这里吞掉异常而不往外抛——后面还排着 attachCodeFloats / attachImageFloats，
      // 一条公式渲不出来不该让整张卡的代码块与图片连悬浮入口都没了。
      const giveUp = (e) => {
        if (holder.parentNode) holder.parentNode.replaceChild(pre, holder);
        console.error("[kb] 公式围栏渲染失败，退回成代码块", e);
      };

      try {
        return Promise.resolve(ctx.adapter.renderMarkdown(md, holder, path)).catch(giveUp);
      } catch (e) {
        giveUp(e);
        return Promise.resolve();
      }
    })
  );
}
