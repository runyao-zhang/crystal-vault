// Phase 2：环形卡片网格 + 翻页 + 「概念」遮罩 + 卡头关键词条（#13）。

import { EL, truncate, hsl } from "./dom.js";
import { COLS, VISIBLE_ROWS } from "./layout.js";
import { hideTooltip } from "./tooltip.js";
import { createMask } from "./mask.js";
import { isReview } from "./mode.js";

const MAX_TAGS_BIG = 4;
const MAX_TAGS_SMALL = 3;
// 卡头一行放得下几个词条。多出来的收成「+N」——关键词条只占一行，
// 让它换行就会把下面的概念区挤掉一块，卡面高度是被写死的。
const MAX_KW = 3;

/**
 * 当前这一屏能往下翻几页（0 = 只有一页，翻不动）。
 *
 * 三个调用点必须用同一个数：渲染时夹一次（renderRingCards）、翻页时判边界一次
 * （smoothScroll / bindScrollListeners 的 doScroll）、#14 恢复时再夹一次。
 * 各写一遍的话，改一处漏一处，表现就是「恢复的页码被悄悄吃掉」这种最难查的形状。
 */
export function maxScrollOffset(cards) {
  return Math.max(0, Math.ceil(cards.length / COLS) - VISIBLE_ROWS);
}

function tagsNode(card, max) {
  const wrap = EL("div", "kb-v13-card-tags");
  for (const t of card.tags.slice(0, max)) {
    const el = EL("span", "kb-v13-card-tag");
    el.textContent = t;
    wrap.appendChild(el);
  }
  return wrap;
}

// 概念区：默认被 .kb-v13-concept-cover 盖住，揭开时才渲染 markdown（#6）
function conceptNode(card) {
  const wrap = EL("div", "kb-v13-card-concept big");
  const body = EL("div", "kb-v13-concept-body");
  const cover = EL("div", "kb-v13-concept-cover");
  const empty = !card.concept;
  if (empty) wrap.classList.add("is-empty");
  cover.textContent = empty ? "无概念" : "回忆一下";
  wrap.appendChild(body);
  wrap.appendChild(cover);
  wrap._card = card;
  wrap._body = body;
  wrap._rendered = false;
  return wrap;
}

/** 揭开「概念」——首次揭开才渲染 markdown */
export function revealConcept(ctx, conceptEl) {
  if (!conceptEl || conceptEl.classList.contains("revealed")) return;
  conceptEl.classList.add("revealed");
  const card = conceptEl._card;
  if (!card || !card.concept || conceptEl._rendered) return;
  conceptEl._rendered = true;
  ctx.adapter.renderMarkdown(card.concept, conceptEl._body, card.path);
}

/** 移开焦点重新遮上（渲染结果留着，下次揭开不用重渲染） */
export function concealConcept(conceptEl) {
  if (conceptEl) conceptEl.classList.remove("revealed");
}

/**
 * #13 卡头关键词条：正文里抽出来的 `==…==`，默认遮住，点封条才显示。
 *
 * 抽取发生在渲染之前、且跳过代码围栏（见 model.js 的 extractHighlights）——
 * 真库里有高亮的卡有一大半的 `==` 在模板代码里，不认围栏的话卡头上挂的就是
 * 「==要背的词==」这种模板占位。
 *
 * 开关本身与 #12 的分段遮罩是同一份实现（mask.js），肤色也是同一套：
 * 遮住态一条青色虚线封条，揭开态缩成一枚暗青小签。用户学一次就够。
 *
 * #9：复习模式下出生即揭开——卡面一建好，词条就挂在那儿。
 */
function keywordNode(ctx, card) {
  const kws = card.keywords || [];
  // 没有高亮的卡这一块整个不出现，也不留占位空白
  if (!kws.length) return null;

  return createMask({
    cls: "kb-v13-kw-strip",
    label: "关键词 " + kws.length,
    revealed: isReview(ctx),
    onReveal: (root) => {
      // 词条早就算好了，但仍然等揭开才塞进 DOM：遮住的答案不该躺在 DOM 里
      // 让人用 Ctrl+F 直接搜到。
      kws.slice(0, MAX_KW).forEach((w) => {
        const chip = EL("span", "kb-v13-kw");
        chip.textContent = w;
        root._body.appendChild(chip);
      });
      const rest = kws.length - MAX_KW;
      if (rest > 0) {
        const more = EL("span", "kb-v13-kw-more");
        more.textContent = "+" + rest;
        // 收起来的那几个不是丢了：连名字一起挂在 title 上，
        // 「+1」自己说得出它省掉的是哪个词
        more.title = "还有：" + kws.slice(MAX_KW).join("、");
        root._body.appendChild(more);
      }
    },
  });
}

function buildCardEl(ctx, card, def, hue) {
  const el = EL("div", "kb-v13-card kb-v13-card-in");
  el.style.position = "relative";
  el.style.width = def.w + "px";
  el.style.height = def.h + "px";
  el.style.flexShrink = "0";
  el.style.animation = "none";

  const body = EL("div", "kb-v13-card-body");
  const header = EL("div", "kb-v13-card-header");
  if (!def.big) header.style.padding = "6px 10px";

  const strip = EL("div", "kb-v13-card-strip");
  strip.style.background = hsl(hue, 70, 50, def.big ? 0.5 : 0.3);
  if (!def.big) strip.style.height = "24px";
  header.appendChild(strip);

  if (def.big) {
    const title = EL("div", "kb-v13-card-title");
    title.textContent = truncate(card.title, 16);
    header.appendChild(title);
  } else {
    const title = EL("span");
    title.style.cssText = "font-size:11px;font-weight:700;color:rgba(220,235,255,.65)";
    title.textContent = truncate(card.title, 18);
    header.appendChild(title);
  }
  body.appendChild(header);

  // 关键词条贴着卡头（标题行）下沿，标签之上——它是"卡头"的一部分，不是标签的一种
  const keywords = def.big ? keywordNode(ctx, card) : null;
  if (keywords) body.appendChild(keywords);

  body.appendChild(tagsNode(card, def.big ? MAX_TAGS_BIG : MAX_TAGS_SMALL));

  // 只有大卡有卡面概念区；窄条卡的概念靠悬停浮层给（卡高 55px 放不下）
  if (def.big) {
    const concept = conceptNode(card);
    el._concept = concept;
    body.appendChild(concept);
    // #9 复习模式：概念区不是一个 .kb-v13-mask（它走 .revealed 那条路），
    // 所以扫遮罩扫不到它，得在建卡这一刻单独掀开。放在 appendChild 之后，
    // 是因为 revealConcept 会往里塞渲染结果——先上树再填，和悬停揭开同一条路。
    if (isReview(ctx)) revealConcept(ctx, concept);
  }

  el.appendChild(body);
  el._card = card;
  el._big = def.big;
  el.dataset.title = card.title; // 供断言 / 排查用
  el.dataset.orphan = ctx.model.isOrphan(card) ? "1" : "0";
  return el;
}

export function renderRingCards(ctx, cards, hue) {
  const { gridStage, state, ring, stage } = ctx;
  hideTooltip(ctx);
  ctx._hoverCard = null;

  if (!cards.length) return;

  const m = ring(stage.getBoundingClientRect().height);
  const maxOffset = maxScrollOffset(cards);
  state.scrollOffset = Math.max(0, Math.min(state.scrollOffset, maxOffset));

  gridStage.innerHTML = "";

  const start = state.scrollOffset * COLS;
  for (let r = 0; r < VISIBLE_ROWS; r++) {
    const raw = cards.slice(start + r * COLS, start + r * COLS + COLS);
    const slice = raw.filter((c) => c != null);
    if (!slice.length) continue;

    const def = m.rowDefs[r];
    const rowEl = EL("div", "kb-v13-wave " + def.wave);
    rowEl.style.position = "absolute";
    rowEl.style.top = m.rowY[r] + "px";
    rowEl.style.left = "0";
    rowEl.style.right = "0";
    rowEl._r = r;

    slice.forEach((card) => {
      const el = buildCardEl(ctx, card, def, hue);
      el._r = r;
      // #20：孤岛卡**不再描红边、不再挂「孤」小标**——孤岛集中到顶栏那份汇总。
      // 类名留着：它和 `data-orphan` 一样是「这张卡是孤岛」这个**事实**，
      // 不是装饰，contract.spec.js 也钉着。删掉的只是 styles.js 里让它显形的规则。
      if (ctx.model.isOrphan(card)) el.classList.add("kb-v13-card-orphan");
      rowEl.appendChild(el);
    });

    gridStage.appendChild(rowEl);
  }

  updateNavArrows(ctx, maxOffset);
}

export function updateNavArrows(ctx, maxOff) {
  const { navUp, navDown, state } = ctx;
  if (navUp) navUp.style.display = state.scrollOffset > 0 ? "" : "none";
  if (navDown) navDown.style.display = state.scrollOffset < maxOff ? "" : "none";
}

export function smoothScroll(ctx, dir) {
  const { gridStage, state, ring, stage } = ctx;
  const maxOff = maxScrollOffset(state.currentCards);
  const newOffset = state.scrollOffset + dir;
  if (newOffset < 0 || newOffset > maxOff) return;

  const m = ring(stage.getBoundingClientRect().height);

  // 记录旧卡行号
  const oldR = new Map();
  gridStage.querySelectorAll(".kb-v13-card-in").forEach((el) => {
    if (el._card) oldR.set(el._card.path, el._r);
  });

  // 完全重建
  state.scrollOffset = newOffset;
  // 滚轮连发时这里一屏能被调很多次，写盘交给 ctx.persistViewState 内部防抖，
  // 这里只管「状态改完了」报一声
  ctx.persistViewState();
  renderRingCards(ctx, state.currentCards, state.currentHue);

  // 动画：新卡从旧行位置滑入
  gridStage.querySelectorAll(".kb-v13-card-in").forEach((el) => {
    const card = el._card;
    if (!card) return;
    const prevR = oldR.get(card.path);
    const newR = el._r;

    if (prevR == null) {
      const entry = dir > 0 ? m.rowY[3] + m.rowH[3] + m.gap : m.rowY[0] - m.rowH[0];
      el.animate(
        [
          { transform: "translateY(" + (entry - m.rowY[newR]) + "px)" },
          { transform: "translateY(0)" },
        ],
        { duration: 350, easing: "cubic-bezier(.25,.1,.25,1)", fill: "none" }
      );
      return;
    }
    if (prevR === newR) return;

    el.animate(
      [
        {
          transform: "translateY(" + (m.rowY[prevR] - m.rowY[newR]) + "px)",
          width: m.rowW[prevR] + "px",
          height: m.rowH[prevR] + "px",
        },
        {
          transform: "translateY(0)",
          width: m.rowW[newR] + "px",
          height: m.rowH[newR] + "px",
        },
      ],
      { duration: 380, easing: "cubic-bezier(.25,.1,.25,1)", fill: "none" }
    );
  });

  updateNavArrows(ctx, maxOff);
}

// 绑定滚轮 / 箭头 / 触摸滚动；每次展开前清理旧监听，避免重复绑定
export function bindScrollListeners(ctx, cards) {
  const { stage, navUp, navDown, state } = ctx;
  let scrollTimer = 0;

  const doScroll = (dir) => {
    const maxOff = maxScrollOffset(cards);
    const prev = state.scrollOffset;
    const next = Math.max(0, Math.min(maxOff, state.scrollOffset + dir));
    if (next === prev) return;
    smoothScroll(ctx, dir);
  };

  if (stage._v3WheelHandler) stage.removeEventListener("wheel", stage._v3WheelHandler);
  if (stage._v3TouchStart) stage.removeEventListener("touchstart", stage._v3TouchStart);
  if (stage._v3TouchMove) stage.removeEventListener("touchmove", stage._v3TouchMove);

  const wHandler = (e) => {
    if (!state.openCrystal) return;
    e.preventDefault();
    const now = Date.now();
    if (now - scrollTimer < 400) return;
    scrollTimer = now;
    doScroll(e.deltaY > 0 ? 1 : -1);
  };
  stage.addEventListener("wheel", wHandler, { passive: false });
  stage._v3WheelHandler = wHandler;
  stage._v3DoScroll = doScroll;

  let touchY = 0;
  const tStart = (e) => {
    touchY = e.touches[0].clientY;
  };
  const tMove = (e) => {
    if (!state.openCrystal || !touchY) return;
    const dy = touchY - e.touches[0].clientY;
    if (Math.abs(dy) > 50) {
      doScroll(dy > 0 ? 1 : -1);
      touchY = 0;
    }
  };
  stage.addEventListener("touchstart", tStart, { passive: true });
  stage.addEventListener("touchmove", tMove, { passive: true });
  stage._v3TouchStart = tStart;
  stage._v3TouchMove = tMove;

  navUp.onclick = () => doScroll(-1);
  navDown.onclick = () => doScroll(1);
}

export function unbindScrollListeners(ctx) {
  const { stage } = ctx;
  if (stage._v3WheelHandler) {
    stage.removeEventListener("wheel", stage._v3WheelHandler);
    stage._v3WheelHandler = null;
  }
  if (stage._v3TouchStart) {
    stage.removeEventListener("touchstart", stage._v3TouchStart);
    stage._v3TouchStart = null;
  }
  if (stage._v3TouchMove) {
    stage.removeEventListener("touchmove", stage._v3TouchMove);
    stage._v3TouchMove = null;
  }
  stage._v3DoScroll = null;
}
