// 3.0 刀 17：故事线的「写」——拖一根线 = 往卡片正文里写一条 [[双链]]；
// 删一根蓝线 = 把那条 [[…]] 从正文里挖掉；外加一层撤销。
//
// **晶体库和结构窗共用这一份。** 两边的差别只有三样，都从 `ui` 传进来：
//   · 往哪儿说话（库是顶栏那条状态条，窗是工具栏上那个 span）
//   · 写完之后重画什么（库是 renderCrystals，窗是重画这一扇窗）
//   · 撤销按钮在哪（两颗不同的按钮）
// ctx 侧要的口子两边都有：`adapter.resolveLink` / `adapter.writeCard`、
// `model.byPath`，以及 `refreshRelations` / `refreshCards` / `refreshCrystalLayer`
// / `flushViewState` / `refreshStageUi`（后面几个都是「有就调」）。
//
// ⚠️ 这个模块**会改用户手写的笔记**，是全库唯一这么干的地方。下面每一条注释背后
//    都是一次踩过的坑，搬家的时候一条都别省。

import { cutLinkSpans, patchBody, splitCard, stripBodyPrefix } from "./frontmatter.js";
import { applyCardFields, parseLinks } from "./model.js";

/**
 * @param {object} ctx 宿主上下文（晶体库那个真 ctx，或结构窗的影子对象）
 * @param {{
 *   say: (text: string, ok?: boolean) => void,
 *   afterWrite: () => void,
 *   setUndoVisible: (on: boolean) => void,
 * }} ui 两个宿主唯一不同的三件事
 * @returns {{writeStoryLink: Function, removeStoryLinks: Function, undoWrite: Function, hasUndo: Function}}
 */
export function createStoryWrite(ctx, ui) {
  const say = ui.say;

  /**
   * 一层撤销。形状**只有一种**：`{ entries: [{ path, prev, base }] }`。
   *
   * 写成数组是因为「删一根蓝线」可能一次动**两张卡**（两个方向各一条字面量）。
   * 写模式 ADD 那条只放一条进去。
   * `prev` 是**任何写之前**那一份，`base` 是写完之后**回读**的那一份——撤销时拿它
   * 当基线，传旧的必假冲突、不传就是静默盖掉别处的改动。
   *
   * 它活在闭包里（内存态、不落盘）：宿主把这一份丢掉了，撤销也就没了 ——
   * 与「一层、不给重做」是同一条规矩。
   */
  let undoState = null;

  /**
   * 写一条链接进正文。
   *
   * @returns {Promise<"ok"|"dup"|"conflict"|"missing"|"error">}
   */
  async function writeStoryLink(fromPath, toPath) {
    const card = ctx.model.byPath.get(fromPath);
    const target = ctx.model.byPath.get(toPath);
    if (!card || !target) return "error";
    const link = "[[" + target.title + "]]";
    const base = card.content == null ? "" : card.content;
    if (base.indexOf(link) >= 0) {
      // 3.0 刀 13：这一句原来只说"没有重复写"，可接法提示**照样会按你拖的改**，
      // 屏幕上那根线会挪。用户读到的是「说没写，可线动了」——那是在说谎。
      say("这两张卡已经连着了。接的位置按你拖的改过来了。", true);
      return "dup";
    }
    const { body } = splitCard(base);
    const content = patchBody(base, stripBodyPrefix(body) + "\n\n" + link + "\n");
    let res;
    try {
      res = await ctx.adapter.writeCard(card.path, content, { base });
    } catch (e) {
      say("写不进去：" + ((e && e.message) || e), false);
      return "error";
    }
    if (!res || !res.ok) {
      const why =
        res && res.reason === "conflict"
          ? "这张卡在别处被改过（多半是手机同步），**没有**写。"
          : res && res.reason === "missing"
            ? "这张卡的文件不在了。"
            : "写盘失败。";
      say(why, false);
      return (res && res.reason) || "error";
    }
    // 用**回读的真实全文**更新模型，不是我们自己拼的那份（宿主可能规范化了行尾）。
    applyCardFields(card, {}, res.content);
    if (ctx.refreshRelations) ctx.refreshRelations();
    // ⚠️ **不要调 `ctx.refreshCard`**。它的名字看着像「重画那张卡」，实际是
    // `showHologram(...)`——会把卡片盒收掉、还在背后打开一张卡的面板。
    // reader.js 的 writeBacklink 在同一个坑上写过一整段注释，这里是同一个坑。
    if (ctx.refreshCards) ctx.refreshCards();
    if (ctx.refreshCrystalLayer) ctx.refreshCrystalLayer();
    if (ctx.flushViewState) ctx.flushViewState();

    undoState = { entries: [{ path: card.path, prev: base, base: res.content }] };
    ui.setUndoVisible(true);
    say("已写入 " + link, true);
    ui.afterWrite();
    return "ok";
  }

  /**
   * 删掉选中的那几根蓝线 = 把笔记正文里的 `[[…]]` 挖掉（3.0 刀 16）。
   *
   * 用户 09-20 判的两条：
   *   · **两个方向都删**——`mergePairs` 把 A→B 和 B→A 合成一根线画，那一根上可能
   *     压着两条字面量（两张卡各一条）；
   *   · 不弹确认，只给一层撤销（复用那颗「撤销」）。
   *
   * ⚠️ 这是整个库里**唯一会删用户手写内容**的地方，三条纪律：
   *   1. 认目标一律**比 `resolveLink` 出来的 path**，绝不比标题——同名卡会让边指错人
   *      （`edgesUnder` 顶上那段注释说的就是这件事），比错名字 = 删掉**另一张卡**的
   *      正文。认不出来就**少删、并且说出来**，绝不猜。
   *   2. 每张卡**只写一次盘**：一张卡同时丢两条链时，分两次写的话第二次会撞上自己
   *      刚写下去的那一份（基线对不上 → 假冲突）。
   *   3. `{ base }` **一次都不能省**：省了等于关掉冲突检测，会盲写覆盖手机上刚改的那份。
   *
   * @param {{from: string, to: string}[]} pairs 选中的边（mergePairs 的规范序）
   * @returns {Promise<number>} 真的从正文里挖掉了几处 `[[…]]`
   */
  async function removeStoryLinks(pairs) {
    const list = Array.isArray(pairs) ? pairs : [];
    if (!list.length) return 0;

    // 按卡分组，**两个方向都塞**：屏幕上一根线只说明"两边之一链向另一个"，
    // fwd/back 是渲染的产物，不能拿它当"这条是谁写的"。
    const want = new Map();
    for (const p of list) {
      if (!p || !p.from || !p.to || p.from === p.to) continue;
      for (const [a, b] of [
        [p.from, p.to],
        [p.to, p.from],
      ]) {
        if (!want.has(a)) want.set(a, new Set());
        want.get(a).add(b);
      }
    }

    const done = [];
    const failures = [];
    const missed = [];
    let removed = 0;
    let ateLines = false;

    for (const [srcPath, targets] of want) {
      const card = ctx.model.byPath.get(srcPath);
      if (!card) {
        missed.push(srcPath);
        continue;
      }
      const base = card.content == null ? "" : card.content;
      const { fmBlock, body } = splitCard(base);
      // 正文里每一处 `[[…]]` 各自解析成谁。**在 body 上解析、也在 body 上切**——
      // 偏移在一个串上算、在另一个串上切，症状是"删掉了旁边的几个字"。
      const spans = [];
      for (const l of parseLinks(body)) {
        const r = ctx.adapter.resolveLink(l.target, card.path);
        if (r && r.path && targets.has(r.path)) spans.push({ start: l.start, end: l.end });
      }
      if (!spans.length) {
        missed.push(srcPath);
        continue;
      }
      const cut = cutLinkSpans(body, spans);
      // ⚠️ 拼 `fmBlock + 新正文`、**不走 patchBody**：patchBody 会把**原样**的正文
      // 前缀接回去，而链接被挖掉之后写模式 ADD 加的那两行分隔换行就落进了"前缀"
      // 区间——接回去等于凭空多留一行，文件跟写之前对不上。
      const next = fmBlock + cut.text;
      // 空操作护栏：算出来跟原文一模一样就什么都别做。
      // 这是防"某天算出一个把整篇删空的 bug"的那道安全带。
      if (next === base) {
        missed.push(srcPath);
        continue;
      }
      let res;
      try {
        res = await ctx.adapter.writeCard(card.path, next, { base });
      } catch (e) {
        failures.push(srcPath);
        continue;
      }
      // **一张卡失败不影响其余卡**：一整批里有一张在手机上被改过，
      // 不该把别的几张也一起卡住。
      if (!res || !res.ok) {
        failures.push(srcPath);
        continue;
      }
      applyCardFields(card, {}, res.content);
      done.push({ path: card.path, prev: base, base: res.content });
      removed += cut.removed;
      if (cut.ateLines) ateLines = true;
    }

    if (done.length) {
      if (ctx.refreshRelations) ctx.refreshRelations();
      // ⚠️ **不要调 `ctx.refreshCard`**——同 writeStoryLink 顶上那条注释
      if (ctx.refreshCards) ctx.refreshCards();
      if (ctx.refreshCrystalLayer) ctx.refreshCrystalLayer();
      if (ctx.flushViewState) ctx.flushViewState();
      undoState = { entries: done };
      ui.setUndoVisible(true);
    }

    // 出了什么事**一律说清楚**，一句都不许静默
    const parts = [];
    if (removed) parts.push("删掉 " + removed + " 处 [[链接]]（" + done.length + " 张卡）");
    if (removed && ateLines) parts.push("连着链那一行一起删了（撤销能回来）");
    if (missed.length) parts.push("有 " + missed.length + " 张卡没找到对应的 [[链接]]，没动它");
    if (failures.length) parts.push("有 " + failures.length + " 张没删成（多半是手机同步改过）");
    say(parts.length ? parts.join("；") + "。" : "没有可删的。", !failures.length && !missed.length);

    if (done.length) {
      ui.afterWrite();
      if (ctx.refreshStageUi) ctx.refreshStageUi();
    }
    return removed;
  }

  /**
   * 写盘之后的后悔药。**只给一层、不给重做**——与 editform 同一条规矩。
   *
   * 3.0 刀 16：一次操作可能动了**好几张卡**（删一根蓝线 = 两个方向 = 两张卡），
   * 所以这里是循环，`entries` 里每张卡各写各的。
   *
   * ⚠️ **没全撤回来时按钮要留着、`entries` 只保留失败的那几条**。原来是一失败就
   *    把 undoState 清空、按钮收起来——那张冲突的卡（恰恰最需要再撤一次的）从此
   *    永远没机会，而屏幕上什么都不说。
   */
  async function undoWrite() {
    const u = undoState;
    if (!u) return;
    undoState = null;
    ui.setUndoVisible(false);
    const failed = [];
    for (const ent of u.entries) {
      let res;
      try {
        res = await ctx.adapter.writeCard(ent.path, ent.prev, { base: ent.base });
      } catch (e) {
        failed.push(ent);
        continue;
      }
      // conflict / missing / error 都留着重试——下一轮再撤一次可能就成了
      if (!res || !res.ok) {
        failed.push(ent);
        continue;
      }
      const card = ctx.model.byPath.get(ent.path);
      if (card) applyCardFields(card, {}, res.content);
    }
    if (ctx.refreshRelations) ctx.refreshRelations();
    if (ctx.refreshCards) ctx.refreshCards();
    if (ctx.refreshCrystalLayer) ctx.refreshCrystalLayer();
    if (ctx.flushViewState) ctx.flushViewState();
    if (failed.length) {
      undoState = { entries: failed };
      ui.setUndoVisible(true);
      say("有 " + failed.length + " 张没撤回来（在别处被改过），可以再点一次。", false);
    } else {
      say("撤销了。", true);
    }
    ui.afterWrite();
  }

  /** 此刻有没有可撤的东西（宿主拿它决定那颗按钮露不露脸） */
  function hasUndo() {
    return !!undoState;
  }

  return { writeStoryLink, removeStoryLinks, undoWrite, hasUndo };
}
