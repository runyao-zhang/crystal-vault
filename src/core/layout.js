// 布局常量与几何计算。
//
// 之前卡片布局常量重复在 renderRingCards / smoothScroll / applyExpanded 三处，
// 改一处不改另一处翻页动画就错位。这里收敛成唯一来源：ring()。
// 改尺寸只改这里。

export const REF_W = 1440;
export const REF_H = 900;

export const CRYSTAL_SIZE = 140;

// 一屏 4 行 × 4 列
export const COLS = 4;
export const VISIBLE_ROWS = 4;

// ---- #19 多层：钻进之后子晶体走的左右侧栏 ----

/** 子晶体比顶层小一圈——视觉上就是「低一层」 */
export const SUB_CRYSTAL_SIZE = Math.round(CRYSTAL_SIZE * 0.7);

/**
 * 「晶体为主」那一档把晶体放大到几倍（#21）。
 *
 * 按左键的意图是「我想看清子文件夹」，所以放大是这一档的主要效果——
 * 只把卡片缩小是「卡片变小了」，不是「晶体变大了」。
 */
export const CRYSTAL_FOCUS_ZOOM = 2;

// ---- #21 左右两栏：晶体栏 ⇄ 卡片栏 ----

/**
 * 两栏的宽度比（**晶体栏**占总宽的比例）。按左右键在这两档之间切。
 *
 * 卡片那一栏有个硬下限：一行的 4 张大卡是 `4×280 + 3×10 = 1150`（未缩放），
 * 窄过它就靠 `cardScale` 把整片卡阵等比缩小。所以 `cards` 这一档取 0.19——
 * 1440 的舞台留 1166 给卡片，刚好不用缩。
 */
export const LEVEL_SPLIT = {
  cards: 0.19, // 卡片为主（默认）：晶体栏窄，卡阵基本原尺寸
  crystals: 0.56, // 晶体为主：晶体栏宽，卡阵缩到一半上下
};

/** 一行的 4 张大卡需要多宽（未缩放） */
const ROW_NEED_W = 4 * 280 + 3 * 10;
/** 卡阵缩到这个比例以下就没法读了，兜住——宁可让它横向溢出被裁 */
export const MIN_CARD_SCALE = 0.34;

/** 晶体栏里相邻六边形之间留多少（按尺寸的比例） */
const FACET_STEP_X = 1.15;
const FACET_STEP_Y = 1.18;

/**
 * 把舞台切成「晶体栏 + 卡片栏」两块。
 * @param {"cards"|"crystals"} focus 哪一栏为主
 */
export function levelRegions(W, H, focus) {
  const ratio = LEVEL_SPLIT[focus] === undefined ? LEVEL_SPLIT.cards : LEVEL_SPLIT[focus];
  const split = Math.round(W * ratio);
  return {
    ratio,
    crystal: { x: 0, y: 0, w: split, h: H },
    cards: { x: split, y: 0, w: W - split, h: H },
  };
}

/** 卡阵要塞进这一栏得缩多少。1 = 不用缩。 */
export function cardScale(regionW) {
  if (!(regionW > 0)) return 1;
  return Math.max(MIN_CARD_SCALE, Math.min(1, regionW / ROW_NEED_W));
}

/**
 * 把若干个六边形铺进一块矩形区域：按宽排满一行再换行，整块居中。
 *
 * 晶体在层内的唯一摆法：铺满左边那一栏（#21）。**不按数量换另一套布局**——
 * 晶体栏的宽度会跟着左右键变，换布局就意味着「晶体少的时候按左键没反应」。
 *
 * @returns {{x:number,y:number}[]} 与 count 等长，每项是左上角
 */
export function facetGrid(count, region, size = SUB_CRYSTAL_SIZE) {
  const out = new Array(count);
  if (!(count > 0)) return out;

  const stepX = size * FACET_STEP_X;
  const stepY = size * FACET_STEP_Y;
  const cols = Math.max(1, Math.floor((region.w - size * 0.4) / stepX));
  const rows = Math.ceil(count / cols);

  const inRow = Math.min(cols, count);
  const gridW = (inRow - 1) * stepX + size;
  const gridH = (rows - 1) * stepY + size;
  const x0 = region.x + (region.w - gridW) / 2;
  const y0 = region.y + (region.h - gridH) / 2;

  for (let i = 0; i < count; i++) {
    out[i] = {
      x: x0 + (i % cols) * stepX,
      y: y0 + Math.floor(i / cols) * stepY,
    };
  }
  return out;
}

// 行尺寸基准（未缩放）：第 1/4 行是窄条，第 2/3 行是主卡
const ROW_SPEC = [
  { w: 180, h: 55, big: false, wave: "kb-v13-w1" },
  { w: 280, h: 180, big: true, wave: "kb-v13-w2" },
  { w: 280, h: 180, big: true, wave: "kb-v13-w3" },
  { w: 180, h: 55, big: false, wave: "kb-v13-w4" },
];

// 舞台上下留白（缩放后）
const STAGE_PAD = 72;

export function createMetrics(win) {
  // 与原脚本一致：SCALE 在脚本执行时算一次，不随 resize 更新
  const SCALE = Math.min(win.innerWidth / REF_W, win.innerHeight / REF_H, 1.3);
  const s = (v) => Math.round(v * SCALE);

  // 环形卡片布局：行高、行距、每行尺寸
  function ring(stageHeight) {
    const sh = stageHeight - s(STAGE_PAD);
    const rowDefs = ROW_SPEC.map((spec) => ({ ...spec, w: s(spec.w), h: s(spec.h) }));
    const totalH = rowDefs.reduce((sum, d) => sum + d.h, 0);
    const gap = (sh - totalH) / 5;
    const rowY = [];
    let y = gap;
    for (const d of rowDefs) {
      rowY.push(y);
      y += d.h + gap;
    }
    return {
      sh,
      gap,
      totalH,
      rowDefs,
      rowY,
      rowW: rowDefs.map((d) => d.w),
      rowH: rowDefs.map((d) => d.h),
      // 展开晶体后晶体名居中于第 2、3 行（大卡）之间
      crystalCenterY: gap * 2.5 + rowDefs[0].h + rowDefs[1].h,
    };
  }

  return { SCALE, s, ring };
}
