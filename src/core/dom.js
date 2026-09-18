// 纯 DOM / 格式化工具。不引用 Obsidian，不引用 Dataview。

export function toStr(v) {
  if (Array.isArray(v)) return v.join(", ");
  if (v === null || v === undefined) return "";
  return String(v);
}

export function truncate(s, max) {
  s = toStr(s);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export function hsl(h, sat, l, a) {
  return "hsla(" + h + "," + sat + "%," + l + "%," + (a || 1) + ")";
}

export const EL = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 文件名去掉「卡片-」/「卡片_」前缀，作为显示标题。
export function stripCardPrefix(name) {
  return toStr(name).replace(/^卡片[-_]?/, "");
}

export function svgEl(tag) {
  return document.createElementNS("http://www.w3.org/2000/svg", tag);
}

/**
 * 吞掉紧接着的那一次 click。
 *
 * 「按下 → 移动 → 抬起」之后浏览器还会补一个 click，而那个 click 是**假的**：
 * 用户做的是拖动，不是点击。不掐掉的话，每拖一次都会顺手触发一次点击语义
 * ——平移一次清掉选中、拖一颗晶体顺手把它钻进。
 *
 * 挂在**捕获阶段**：调用方那些 click 处理器是冒泡阶段注册的，捕获先到，
 * 比去逐个改它们的判定逻辑干净，也不必让它们知道「刚才在拖」这件事。
 *
 * `once` + 兜底移除两条都要：没有 click 跟上来时（比如拖到一半指针没了），
 * 那个监听器会一直挂着，把下一次**真**点击也吃掉。
 */
export function swallowNextClick(el) {
  const swallow = (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
  };
  el.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 0);
}
