// 就地改名：把一个文字标签当场换成输入框，改完原地变回去。
//
// **为什么不复用 editform.js**：那是卡片编辑专用的，绑着 writeCard 的
// 基线比对、冲突处理、撤销整条链。方框名字是**纯本地**的东西（存在视图状态里，
// 一个字都不写盘），把那一整套宿主写盘逻辑拖进来，等于给一个不需要它的特性
// 加一堆它永远不会走到的分支——而每一条分支都要维护、都要测。
// treepanel.js 是只读的，也不合适。

/**
 * 空名字兜底。**与 viewstate.js 的 sanitizeModules 用同一个默认值**——
 * 两处各写一个字面量，迟早会漂移成两个「未命名」，用户看到的就是
 * 「我明明起过名字，怎么又变回未命名了」。
 */
export const UNNAMED = "未命名模块";

/**
 * 开始改名。
 *
 * @param {HTMLElement} hostEl 承载输入框的元素（标签本身，或被换掉的那个节点）
 * @param {string} current 当前名字
 * @param {(name: string) => void} onCommit 提交（拿到的**一定**是非空名字）
 * @returns {() => void} 取消并还原
 */
export function beginInlineRename(hostEl, current, onCommit) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "kb-v13-rename-input";
  input.value = current === UNNAMED ? "" : current;
  input.placeholder = UNNAMED;

  const parent = hostEl.parentNode;
  if (!parent) return () => {};
  parent.replaceChild(input, hostEl);

  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    if (parent.contains(input)) parent.replaceChild(hostEl, input);
    if (commit) onCommit(name || UNNAMED);
    try {
      hostEl.focus();
    } catch (e) {
      /* 标签不可聚焦是常态，无所谓 */
    }
  };

  input.addEventListener("keydown", (e) => {
    // ⚠️ **中文输入法**。用拼音打字时，选词那一下回车会被当成「提交」——
    // 用户想选「机器学习」的「机」，结果名字被截成了「ji」或者直接提交成半截。
    // 这是中文用户**第一次输入就会撞上**的 bug，不是边角情况。
    // isComposing 是标准写法，keyCode 229 是部分输入法的老写法，两个都认。
    if (e.isComposing || e.keyCode === 229) return;

    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation(); // 别让回车冒泡上去被全局快捷键接走
      finish(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      // 也拦住：全局那个 Esc 会顺手退层 / 关库，用户只是想放弃改名
      e.stopPropagation();
      finish(false);
    }
  });

  input.addEventListener("blur", () => finish(true));
  // 点输入框自己不该冒泡出去触发方框的拖动 / 选中
  input.addEventListener("pointerdown", (e) => e.stopPropagation());
  input.addEventListener("click", (e) => e.stopPropagation());

  input.focus();
  input.select();
  return () => finish(false);
}
