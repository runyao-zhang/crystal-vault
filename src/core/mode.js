// #9 学习模式：回忆 / 复习。
//
// 两个模式只差一件事——**遮挡要不要点才开**：
//   - 回忆（recall，默认）：卡面「回忆一下」、卡头关键词条、点开后的分段正文一律遮住，
//     点一下才显示。这是自测：先自己想，再对答案。也就是这个库一直以来的行为。
//   - 复习（review）：同一批遮挡全部摊开，一个字都不用点。通读、串讲、考前过一遍用它。
//
// 放在单独一个模块里（而不是塞进 app.js），是因为三个建 DOM 的地方都要问
// 「现在是复习模式吗」——cardgrid 建卡面、hologram 建分段遮罩、app 切模式。
// 让它们各自 import app.js 会绕成环，这里是一个谁都能拿的叶子模块。
//
// 模式**不进 viewstate.js**：它不落盘，每次打开晶体库都回到回忆模式。
// 理由是别让一次误切把自测悄悄变成看答案，代价只是多点一下。

export const MODE_RECALL = "recall";
export const MODE_REVIEW = "review";

/** 认得出的一律归一化，认不出的一律退回回忆（默认态永远是最安全那个） */
export function normalizeMode(mode) {
  return mode === MODE_REVIEW ? MODE_REVIEW : MODE_RECALL;
}

export function isReview(ctx) {
  return !!ctx && ctx.state && ctx.state.mode === MODE_REVIEW;
}
