// 3.0 刀 35：**收纳方框的落盘**——每颗晶体一个 `.crystal-boxes.json`。
//
// 用户 09-29 拍板的：「每颗晶体一个 .json，点开头」。
//
// ---- 为什么需要它 ----
//
// 收纳方框（你自己画的那些）原本只活在**视图状态**里，而视图状态是每台机器
// 各存各的。用户要的是「换台电脑打开，相对摆放位置也一样」——卡片那一半
// 已经靠 frontmatter 的 `晶体坐标` 做到了（刀 34），框这一半得有地方放。
//
// ---- 为什么是"每颗晶体一个"、"点开头" ----
//
//   · **按晶体分**：框从 1.3.58 起就是按层存的（`v.boxes[layerKey]`），
//     边车跟着这个结构走，一一对应。而且两台机器同时改**不同**晶体的框
//     永远不会撞在同一个文件上。
//   · **点开头**：Obsidian 不索引隐藏文件——它不出现在文件列表里，
//     **也不会被当成一张卡片**（适配层另外只认 `.md`，两道都挡得住）。
//     ⚠️ 反过来说：**同步通道必须带点开头的文件**。FNS 走文件系统那一层，
//     没问题；换成会跳过 `.` 开头的通道（Obsidian Sync 就是）这个功能会整体失效。
//   · **JSON**：这个文件给程序和手两用。坏了要能一眼看出来，所以带 `v` 版本号，
//     形状不对就当没有——**绝不因为一个坏文件打不开晶体库**。
//
// ---- 谁是权威 ----
//
// **文件**。开库时读到什么就是什么。唯一的例外是**文件不存在**（第一次升级上来、
// 或者从来没写过）——那时留着本地那份，并排队写出去，那就是老用户的迁移。
//
// ⚠️ 这个文件是**我们自己的**，所以没有 `storywrite` 那套 `{base}` 冲突检测：
//   两台机器同时改同一层的框，就是后写的赢。说清楚比假装能防住好。

/** 边车的文件名。点开头 = Obsidian 不索引 = 不会变成一张卡。 */
export const SIDE_CAR = ".crystal-boxes.json";
/** 文件格式版本。形状对不上（不是 1）就整份丢掉，宁可回默认也不猜。 */
const FILE_VERSION = 1;
/** 写盘防抖。**比卡片坐标长**：框是"画完就完了"的东西，不像拖卡片那样连着动。 */
const FLUSH_MS = 700;

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** 层键（链 join 空格）。**这是这个模块里唯一拼层键的地方。** */
const keyOfChain = (chain) => (Array.isArray(chain) ? chain : []).join(" ");

// ---------------------------------------------------------------- 纯函数

/**
 * 一串框 → JSON 文本。
 *
 * ⚠️ 存的是 `x` + **`bottom`**（下边缘），不是 `y`。用户从头到尾要的坐标
 * 都是「**左下角**」（09-28 第 3 条、09-29 又强调过一次），所以这个文件里
 * 也按那个来——**文件是可以手打开看的**，里面写个左上角会误导人。
 * 内部代码用左上角（CSS 的 left/top 就是左上角），转换只在这一层做。
 *
 * ⚠️ `name` / `collapsed` **不在框对象上**（名字在 `v.boxNames[id]`、
 * 收起状态在 `v.collapsedBoxes`），所以要调用方传进来。不传的话写出去的
 * 永远是建框时那个默认名「方框 N」——**改名和收起就跟着文件走不了**，
 * 而"我在另一台机器上把框改了名"是用户会做的事。
 *
 * @param {Array} list      `v.boxes[key]` 那一串（**不是 `boxesOf` 的输出**：
 *   那个按"此刻在这一层"过滤过成员，照着它写会把暂时不在这一层的成员丢掉）
 * @param {object} [names]  `v.boxNames`
 * @param {string[]} [collapsed] `v.collapsedBoxes`
 */
export function serialize(list, names, collapsed) {
  const nm = isObj(names) ? names : {};
  const col = new Set(Array.isArray(collapsed) ? collapsed.map(String) : []);
  const boxes = (Array.isArray(list) ? list : []).map((b) => {
    const id = String(b.id || "");
    const h = Number(b.h) || 0;
    return {
      id,
      // 名字以**那张覆盖表**为准（框对象上的 `name` 是建框那一刻的默认值，之后没人改它）
      name: String(nm[id] || b.name || "").slice(0, 80),
      // 世界坐标，像素。框不走格点（09-29 拍板），所以没有"格"这个单位可用。
      x: Number(b.x) || 0,
      bottom: (Number(b.y) || 0) + h,
      w: Number(b.w) || 0,
      h,
      collapsed: col.has(id),
      // 成员是**卡片路径**（宿主里那个相对 vault 根的路径）。同一个库在另一台
      // 机器上路径一样，所以它跟着文件走是对的。
      paths: (Array.isArray(b.paths) ? b.paths : []).filter((p) => typeof p === "string" && p),
    };
  });
  return JSON.stringify(
    {
      v: FILE_VERSION,
      note: "Crystal Vault 的收纳方框。x/bottom 是框的【左下角】世界坐标（像素）；手改前先关掉 Obsidian。",
      boxes,
    },
    null,
    2
  );
}

/**
 * JSON 文本 → 一串框（形状不对一律当没有）。
 *
 * **绝不抛**：这是从盘上读回来的不可信输入，而调用它的那条路在开库的路径上——
 * 一个坏文件不该把晶体库锁死（同 `sanitizeViewState` 顶上那条硬要求）。
 */
export function parse(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return null;
  }
  if (!isObj(raw) || raw.v !== FILE_VERSION || !Array.isArray(raw.boxes)) return null;
  const out = [];
  const seen = new Set();
  for (const b of raw.boxes) {
    if (!isObj(b)) continue;
    const id = String(b.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const h = Number(b.h);
    const bottom = Number(b.bottom);
    // ⚠️ 造出来的**键序要和 `createBox` 一致**（id, name, paths, x, y, …）。
    // 不一致的话，"文件变了没有"那个比较会永远为真（JSON.stringify 看键序），
    // 于是每次开库都判成"变了"、每次都无条件拿文件盖掉本地那份。
    out.push({
      id,
      name: String(b.name || "").slice(0, 80),
      paths: (Array.isArray(b.paths) ? b.paths : []).filter((p) => typeof p === "string" && p),
      x: Number(b.x) || 0,
      // 下边缘 → 上边缘（内部一律用左上角）
      y: (Number.isFinite(bottom) ? bottom : 0) - (Number.isFinite(h) ? h : 0),
      w: Number(b.w) || 0,
      h: Number.isFinite(h) ? h : 0,
      collapsed: !!b.collapsed,
    });
  }
  return out;
}

// ---------------------------------------------------------------- 层 → 文件夹

/**
 * 一条层链（`ctx.state.crystalPath` 那种数组）对应**宿主里的哪个文件夹**。
 *
 * ⚠️ **收的是链数组，不是拼好的字符串。** 原来收字符串、在里面 `split(" ")`，
 * 而晶体文件夹名里**可以带空格**（`Python 基础`）——那样切出来的末段在树里
 * 找不到，这一层的框就**永远出不了这台机器，而且一声不响**；更坏的是它会在
 * 全树里按 key 找节点，于是 `My Notes` 那一层会命中 `Notes` 那个节点，
 * 两层的框共用一个边车文件、交替互相覆盖。
 *
 * 💡 链的最后一截就是节点的 `key`（晶体 key = 相对卡片根目录的路径），
 * 而 `folderTree()` 每个节点上就带着完整的宿主路径，直接查表就行。
 *
 * ⚠️ **根层（空链）故意回 null。** 框永远建不在根层（`createBox` 拒绝空的
 * `crystalPath`），而根文件夹**没法从树里可靠地推出来**——树里第一个节点
 * 可能是"散卡"那个伪节点（`model.js` 的 `looseNode`，它的 `folder` 就是根、
 * 而 `key` 是根文件夹的末段，两者不是一个东西）。推错的后果是**真的去
 * mkdir 出一个不存在的文件夹**。既然这一层永远没有框，直接不做。
 *
 * @returns {string|null} 宿主路径；拿不到就 null（调用方跳过，不报错）
 */
export function folderOfChain(ctx, chain) {
  const model = ctx && ctx.model;
  if (!model || typeof model.folderTree !== "function") return null;
  const parts = (Array.isArray(chain) ? chain : []).filter((p) => typeof p === "string" && p);
  if (!parts.length) return null;
  const want = parts[parts.length - 1];
  let tree;
  try {
    tree = model.folderTree() || [];
  } catch (e) {
    return null;
  }
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.key === want) return n;
      const hit = walk(n.children);
      if (hit) return hit;
    }
    return null;
  };
  const node = walk(tree);
  return node && node.folder ? String(node.folder) : null;
}

/** 某一层的边车文件在宿主里的完整路径（拿不到文件夹就回 null）。 */
export function sideCarPath(ctx, chain) {
  const dir = folderOfChain(ctx, chain);
  return dir ? dir.replace(/\/+$/, "") + "/" + SIDE_CAR : null;
}

// ---------------------------------------------------------------- 写

/**
 * 待写的层：层键 → `{chain, ctx}`。
 *
 * ⚠️ **每一项都记着"是谁排的队"**，不是只记一个层键。两个 code block 可以指向
 * **不同的卡片目录**（同一个 window、同一个模块实例），重挂也会换一套 ctx——
 * 只记层键的话，A 库排的队会被 B 库的 ctx 解析成 **B 库的文件夹**，
 * 把 A 库的框写进 B 库；反过来 B 的视图里那一层没有桶时会兜底成空数组，
 * **一个空边车盖掉好的那份**。
 */
const dirty = new Map();
let timer = 0;

/** 记一笔「这一层的框变了」，防抖到期再真写盘。`chain` 是链数组。 */
export function queueBoxFile(ctx, chain) {
  const arr = (Array.isArray(chain) ? chain : []).filter((p) => typeof p === "string" && p);
  if (!arr.length) return; // 根层永远没有框（见 folderOfChain）
  const k = keyOfChain(arr);
  // 已经在队里就**保留最早那个 ctx**：同一层被两个 ctx 排队时，先来的更可能是
  // 真正显示着它的那一屏。
  if (!dirty.has(k)) dirty.set(k, { chain: arr, ctx });
  schedule(ctx);
}

function schedule(ctx) {
  const win = (ctx && ctx.win) || {};
  if (win.__kbV13BoxFileTimer) clearTimeout(win.__kbV13BoxFileTimer);
  win.__kbV13BoxFileTimer = setTimeout(() => {
    win.__kbV13BoxFileTimer = 0;
    flushBoxFiles(ctx);
  }, FLUSH_MS);
}

/**
 * 把攒着的层写出去（关库 / 关窗之前催一下）。
 *
 * @param {object} [fallbackCtx] 队里没记 ctx 时用它（正常走不到）
 */
export async function flushBoxFiles(fallbackCtx) {
  if (!dirty.size) return;
  const batch = [...dirty];
  dirty.clear();
  for (const [key, ent] of batch) {
    // 用**排队时那个 ctx**，不是当下这个。见 `dirty` 上面那段。
    const ctx = ent.ctx || fallbackCtx;
    const api = ctx && ctx.adapter;
    if (!api || typeof api.writeTextFile !== "function") continue;
    const path = sideCarPath(ctx, ent.chain);
    if (!path) continue;
    // 视图**现取**，不缓存：读/写之间隔着 await，缓存的可能是已经被
    // `commitDraft` 换掉的那个对象（写进一个没人看的东西 = 白写）。
    const v = viewOf(ctx);
    const list = v && v.boxes && Array.isArray(v.boxes[key]) ? v.boxes[key] : [];
    let ok = false;
    try {
      const res = await api.writeTextFile(path, serialize(list, v && v.boxNames, v && v.collapsedBoxes));
      ok = !!(res && res.ok);
    } catch (e) {
      ok = false;
    }
    // 写失败**放回队里**：只读 vault、目录建不出来、同步中途——这些都会失败，
    // 而失败了就永久丢掉的话，用户是在"换台电脑"那一刻才发现，那时他能做的
    // 只有重摆一遍。留在队里，下一次框动一下就会再试。
    if (!ok && !dirty.has(key)) dirty.set(key, ent);
    // 失败本身不弹提示：边车写不进去顶多是"别的机器上对不上"，
    // 而把它说成"出错了"会让人以为他的框要没了。真要诊断看这一行。
    if (!ok) console.warn("[crystal-vault] 收纳方框边车写失败：" + path);
  }
}

// ---------------------------------------------------------------- 读

/**
 * 开库时把各层的边车读回来。
 *
 * 扫的是**模型知道的所有晶体文件夹**——因为一台新机器上 `v.boxes` 是空的，
 * 除了扫没有别的办法知道"哪些层有框"。一次开库扫一轮小文件，几十个晶体
 * 也就是几十次本地读；而且**每次开库都扫是有意的**：别的机器刚同步过来的
 * 框要能看见。
 *
 * ⚠️ **先全部读完，再一次性写回**（不边读边写）：
 *   读是异步的，而用户可能在这期间就进了晶体（`beginDraft` 会拷一份草稿）。
 *   边读边写的话，写进去的可能是**已经被换掉的那个视图对象**（白写，框不出现），
 *   或者落进一份新开的草稿里（"未保存"小点当场亮起来，而用户什么都没做——
 *   `storyboxes.js` 专门为这件事立过规矩）。
 *
 * ⚠️ 文件存在就以文件为准（它才是能跨机器的那一份）；不存在就**留着本地那份**
 * 并排队写出去——那是老用户升级上来的迁移。
 *
 * @returns {Promise<boolean>} 真的有哪一层被动过吗（宿主拿它决定要不要重画）
 */
export async function loadBoxFiles(ctx) {
  const api = ctx && ctx.adapter;
  if (!api || typeof api.readTextFile !== "function") return false;

  const chains = allLayerChains(ctx);
  if (!chains.length) return false;

  // ---- 第一步：全部读完（并发），先不碰任何状态 ----
  const reads = chains.map(async (chain) => {
    const path = sideCarPath(ctx, chain);
    if (!path) return null;
    try {
      const text = await api.readTextFile(path);
      // `null` = 文件不在；抛出 = 读的过程中出的错（**当"不知道"处理，别动这一层**）。
      return { chain, key: keyOfChain(chain), text };
    } catch (e) {
      return null;
    }
  });
  const got = (await Promise.all(reads)).filter(Boolean);

  // ---- 第二步：一次性写回，而且**现取视图** ----
  const v = viewOf(ctx);
  if (!v) return false;
  if (!v.boxes || typeof v.boxes !== "object" || Array.isArray(v.boxes)) v.boxes = {};
  if (!v.boxNames || typeof v.boxNames !== "object" || Array.isArray(v.boxNames)) v.boxNames = {};
  if (!Array.isArray(v.collapsedBoxes)) v.collapsedBoxes = [];

  let changed = false;
  for (const { chain, key, text } of got) {
    if (text == null) {
      // 没有边车：本地那层有框的话，把它写出去（老用户升级的迁移）。
      if (Array.isArray(v.boxes[key]) && v.boxes[key].length) queueBoxFile(ctx, chain);
      continue;
    }
    const list = parse(text);
    // 解析失败（文件坏了 / 版本对不上）**保持本地那份不动**，也不去覆盖它——
    // 万一那是别人手改坏的，我们这边的数据至少还在。
    if (!list) continue;
    // ⚠️ **读盘是异步的，而用户可能在这期间就动了这一层的框。**
    // 已经排进待写表的那一层跳过——不跳的话，刚摆好的框会被几百毫秒前
    // 读到的那份旧文件盖掉，而且**看不出来是谁盖的**。
    if (dirty.has(key)) continue;
    const boxes = list.map((b) => ({ id: b.id, name: b.name, paths: b.paths, x: b.x, y: b.y, w: b.w, h: b.h }));
    // 比较**走 `serialize`**，别拿 `JSON.stringify` 直接比两个对象：
    // 键序不一样（`createBox` 造的和大括号里写的顺序不同）就永远判"变了"，
    // 于是"文件优先"变成无条件的——本地那份再新也一定被盖掉，没有任何保护。
    // `serialize` 两侧都过一遍，形状和键序就都统一了。
    const same =
      serialize(v.boxes[key], v.boxNames, v.collapsedBoxes) ===
      serialize(boxes, v.boxNames, v.collapsedBoxes);
    if (!same) {
      v.boxes[key] = boxes;
      changed = true;
    }
    // 名字和收起状态是**按 id 索引的全局表**（id 全局唯一，见 createBox），
    // 所以这两样直接并进去，与"文件优先"同一条规矩。
    for (const b of list) {
      if (b.name && v.boxNames[b.id] !== b.name) {
        v.boxNames[b.id] = b.name;
        changed = true;
      }
      const at = v.collapsedBoxes.indexOf(b.id);
      if (b.collapsed && at < 0) {
        v.collapsedBoxes.push(b.id);
        changed = true;
      } else if (!b.collapsed && at >= 0) {
        v.collapsedBoxes.splice(at, 1);
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * 所有可能有过框的层链。
 *
 * ⚠️ **不含根层**（空链）：框永远建不在根层，而根文件夹推不准（见 `folderOfChain`）。
 * 多它一条只会每次开库多一次无意义的读。
 */
function allLayerChains(ctx) {
  const model = ctx && ctx.model;
  if (!model || typeof model.folderTree !== "function") return [];
  const out = [];
  const walk = (nodes, prefix) => {
    for (const n of nodes || []) {
      if (!n || !n.key) continue;
      const chain = prefix.concat([String(n.key)]);
      out.push(chain);
      walk(n.children, chain);
    }
  };
  try {
    walk(model.folderTree(), []);
  } catch (e) {
    return out;
  }
  return out;
}

/** 视图状态那一份（走草稿，理由同 storyboxes 的 `view`）。 */
function viewOf(ctx) {
  const st = ctx && ctx.state ? ctx.state : null;
  if (!st) return null;
  const v = st.draft || st.view;
  return v && typeof v === "object" ? v : null;
}
