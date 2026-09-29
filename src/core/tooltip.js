// 悬停浮层。
//
// 与 #6 的分工：大卡有卡面概念区，悬停时概念在卡上揭开，浮层就不再重复一遍
// （重复会把同一句话显示两次，还盖住下一行卡片）。浮层只给卡面没有的东西：来源、关联理由。
// 窄条卡（55px 高）放不下卡面概念区，浮层仍是它揭开「概念」的唯一途径，所以照旧显示。
//
// #13 同理：卡头关键词条只有大卡放得下，窄条卡的关键词跟概念一样从浮层拿。
// 浮层里的词条不再遮一道——悬停本身就是窄条卡的"揭开"手势（#6 就是这么定的），
// 在浮层里再要一次点击，等于让人悬停着还要去点一个跟着鼠标跑的浮层。
// 卫星卡的浮层不给关键词：那是"看见这张关联卡"的地方，不是自测的地方。

import { hsl, EL } from "./dom.js";

export function showTooltip(ctx, cardEl, card, hue) {
  const { s, win, tooltip, ttTitle, ttConcept, ttKeywords, ttSource, ttReason } = ctx;
  const cardRect = cardEl.getBoundingClientRect();
  const revealsOnCard = !!cardEl._concept;

  ttTitle.textContent = card.title;
  ttTitle.style.color = hsl(hue, 70, 65);

  // 窄条卡放不下卡面概念区，浮层就是它揭开「概念」的唯一途径，
  // 所以同样走 renderMarkdown（#6 要求揭开时按 #5 的原生渲染呈现）。
  ttConcept.style.display = revealsOnCard ? "none" : "";
  ttConcept.innerHTML = "";
  if (!revealsOnCard) {
    if (card.concept) ctx.adapter.renderMarkdown(card.concept, ttConcept, card.path);
    else ttConcept.textContent = "暂无概念描述";
  }

  // 关键词条：只补窄条卡（大卡的词条长在卡头上）。全部列出、不截断、允许换行——
  // 浮层宽 320px 且不占卡面位置，没有"一行放不下"的问题。
  const kws = !revealsOnCard && cardEl.classList.contains("kb-v13-card") ? card.keywords || [] : [];
  ttKeywords.innerHTML = "";
  ttKeywords.style.display = kws.length ? "" : "none";
  if (kws.length) {
    // 与「来源:」「关联:」一个排法：先说这条是什么，再说内容。
    // 光秃秃几个词条在这个浮层里会被当成标签，而浮层是不显示标签的。
    const label = EL("span", "kb-v13-kw-label");
    label.textContent = "关键词";
    ttKeywords.appendChild(label);
  }
  kws.forEach((w) => {
    const chip = EL("span", "kb-v13-kw");
    chip.textContent = w;
    ttKeywords.appendChild(chip);
  });

  ttSource.textContent = card.source ? "来源: " + card.source : "";
  ttReason.textContent = cardEl.dataset.reason ? "关联: " + cardEl.dataset.reason : "";

  tooltip.style.setProperty("--tt-clr", hsl(hue, 70, 50, 0.3));

  // 左右边界保护。
  // ⚠️ 3.0 刀 36：边界是**这一层界面**（`ctx.viewRect()`），不是视口。浮层本身是
  // `position:fixed`、坐标就是屏幕坐标，所以这里只换"夹在哪个范围内"，
  // 位置本身不用换算。全屏时两者相同，逐像素不变。
  const vr = ctx.viewRect ? ctx.viewRect() : { left: 0, top: 0, w: win.innerWidth, h: win.innerHeight };
  const ttL = cardRect.left - s(40);
  const ttR = cardRect.right + s(40);
  const pad = s(10);
  const clampL = Math.max(vr.left + pad, ttL);
  const clampR = Math.min(vr.left + vr.w - pad, ttR);
  tooltip.style.left = clampL + "px";
  tooltip.style.width = Math.max(clampR - clampL, s(200)) + "px";
  tooltip.style.borderColor = hsl(hue, 70, 45, 0.3);

  const belowY = cardRect.bottom + 10;
  const aboveY = cardRect.top - 180 - 10;
  const vPad = s(10);
  let ttTop;
  let arrowFlip = false;

  // 上下同理：夹在**这一层界面**里（`vr.top` ~ `vr.top + vr.h`），不是视口。
  if (belowY + 180 < vr.top + vr.h - vPad) {
    ttTop = belowY;
  } else if (aboveY > vr.top + vPad) {
    ttTop = aboveY;
    arrowFlip = true;
  } else {
    ttTop = Math.max(vr.top + vPad, vr.top + vr.h - 180 - vPad);
    arrowFlip = belowY + 180 > vr.top + vr.h;
  }

  tooltip.style.top = ttTop + "px";
  const arrow = tooltip.querySelector(".kb-v13-tt-arrow");
  if (arrow) {
    if (arrowFlip) {
      arrow.style.top = "auto";
      arrow.style.bottom = "-6px";
      arrow.style.borderBottom = "none";
      arrow.style.borderTop = "7px solid rgba(8,16,30,0.95)";
    } else {
      arrow.style.top = "";
      arrow.style.bottom = "";
      arrow.style.borderBottom = "";
      arrow.style.borderTop = "";
    }
  }

  tooltip.classList.add("show");
}

export function hideTooltip(ctx) {
  ctx.tooltip.classList.remove("show");
}
