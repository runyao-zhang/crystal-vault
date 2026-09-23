/**
 * 适配层契约 —— 核心与宿主之间的唯一接缝。
 *
 * 核心（布局、渲染、交互）不直接引用 Obsidian / Dataview。
 * 所有宿主触点收敛到下面 14 个方法。改宿主 = 换一个适配层实现，核心不动。
 *
 * 生命周期：`mount({ adapter, container, win })` 只要求 `loadCards()` 在挂载前可用；
 * 其余七个方法在交互中按需调用。
 *
 * @typedef {Object} Card
 * @property {string}   path     卡片文件在宿主里的唯一路径（身份键）
 * @property {string}   folder   所在文件夹完整路径。**晶体身份由核心自己推**：
 *   取所有卡片 folder 的最长公共前缀当「卡片根目录」，相对它的路径就是晶体
 *   （`知识卡片/Python/数据分析/` → `Python/数据分析`）。适配层不必替它算，
 *   也不必把根路径传进来——口径只有一处，在 model.js 的 keyOfFolder。
 * @property {string}   name     文件名（不含扩展名）。卡片顺序按它比较
 * @property {string}   concept  frontmatter「概念」字段
 * @property {string[]} tags     frontmatter「tags」字段
 * @property {string}   source   frontmatter「来源」字段
 * @property {string}   content  正文原文（含 frontmatter），关系由核心从中解析
 *
 * @typedef {Object} LinkTarget
 * @property {string}   path
 * @property {string}   name
 * @property {string}   concept
 * @property {string[]} tags
 * @property {string}   source
 *
 * @typedef {Object} Adapter
 * @property {() => Promise<Card[]>} loadCards
 *   加载整个卡片目录。分组、排序、关系图都由核心基于返回值构建。
 * @property {(target: string, fromPath: string) => (LinkTarget|null)} resolveLink
 *   把双链里的目标串（如「02-散点图scatter」）解析成卡片；解析不到返回 null。
 * @property {(path: string) => string} assetUrl
 *   把图片路径 / 内嵌附件转成可直接塞进 <img src> 的地址。解析不到返回 ""。
 * @property {(md: string, el: HTMLElement, srcPath: string) => (void|Promise<void>)} renderMarkdown
 *   把 markdown 渲染进 el。宿主决定排版实现；核心不碰渲染后的 HTML 细节。
 * @property {(path: string, opts?: {split?: boolean, line?: number}) => (void|Promise<void>)} openNote
 *   打开某张卡片的源文件。`opts.split` 为 true 时请求宿主在右侧新分屏打开，
 *   当前视图所在的叶子不关；缺省 / false = 整页跳转（现有行为）。
 *   `opts.line` 是笔记文件里的 **0 基行号**，要求宿主把光标落到那一行
 *   （由 core/model.js 的 bodyStartLine 算出：落正文首行，不停在 frontmatter 里）；
 *   缺省 / 0 = 笔记顶部。宿主分不出叶子、拿不到文件时照旧退回整页跳转——
 *   宁可老行为，也不能点了没反应。
 * @property {(url: string) => boolean} openExternal
 *   把一条 http/https 网址交给**系统浏览器**，返回「交出去了没有」。
 *   给阅读器的外部标签页兜底用：那扇窗是 iframe，而站点可以用响应头拒绝被嵌
 *   （`X-Frame-Options` / CSP `frame-ancestors`），嵌不进来时只能开浏览器。
 *   宿主该怎么开是宿主的事（Electron 的 shell / window-open handler）；
 *   核心只传一条网址，**不碰宿主 API**。打不开回 false，绝不抛。
 * @property {() => (object|null)} loadViewState
 *   读回上次存的视图状态。没存过、读不出、解析失败一律返回 null，**绝不抛异常**。
 *   返回的是原样读回的对象，合法性由核心判定（见 core/viewstate.js）——
 *   适配层不做形状校验，换宿主时也就不必各自实现一套版本规则。
 * @property {(state: object) => void} saveViewState
 *   写入视图状态。写盘频率由核心控制（防抖），适配层不用管节流。
 * @property {(cb: (card: (Card|null), from?: string, gone?: string) => void) => (() => void)} watchCards
 *   订阅「卡片目录下有文件被改动」，返回退订函数。cb 收到的是**一个完整的 Card**
 *   （与 loadCards 产出的同形），不是路径——核心因此不必再回读一次，也不必自己解析 YAML。
 *
 *   3.0 刀 21 起，这个回调还报另外两件事，因为**光有「内容变了」是不够的**：
 *
 *   - **改了名**：`cb(card, from)`，`from` 是**旧路径**。不报的话，一个 `[[甲]]`
 *     被 Obsidian 顺手改成 `[[乙]]` 之后，核心只知道"别的卡正文变了"，
 *     而 `乙` 从没进过它的 `byPath`——于是给 `[[乙]]` 登记一张 content 为空的
 *     **影子卡**（灰的、「暂无描述」、点进去什么都没有）。用户 09-24 报的就是这个。
 *   - **路径没了**：`cb(null, undefined, path)`。文件被删或被移出卡片目录。
 *     删掉的文件读不出来，所以这一条**只有路径、没有 Card**。
 *
 *   ⚠️ **`create` 故意不订**：我们自己建的卡走 `addCard`（已经登记过了），
 *   而「外面新增一张卡」是另一个特性。这条是有意留白，不是漏了。
 *
 *   为什么要它：写盘会让**别的**路径也改到卡片（多设备同步、用户在分屏里手改、
 *   别的插件改盘），这些改动核心自己听不见。没有它就只能靠宿主重跑整个块，
 *   而那正是「保存后闪退」的来源。
 *
 *   节流与过滤都在适配层做——只有它知道宿主的事件有多密、卡片目录长什么样。
 *   核心负责回答「这张卡是不是我的、内容是不是真变了」。**绝不抛**；
 *   没有这个能力的宿主返回一个空的退订函数即可（见 adapters/fake.js）。
 * @property {(path: string, content: string, opts?: {base?: string}) => Promise<WriteResult>} writeCard
 *   把 `content` 整篇写回某张卡片的源文件。**新全文由核心算好**（见 core/frontmatter.js），
 *   适配层不解析、不改写、不序列化 YAML——它只负责「比对基线 → 写盘 → 回读」。
 *   这样切 YAML 的规则只有一份，两个实现不会各自漂移。写的是整篇而不是补丁，
 *   是因为「正文一字节不动」这条只能由算文本的那一方保证。
 *
 *   `opts.base` 是核心加载这张卡时拿到的原文（基线）。宿主在**写盘那一次原子操作里**
 *   拿磁盘现状与它比对：不一致说明这张卡在别处被改过（多设备同步、别的插件、
 *   用户自己开分屏改的），此时**不写**、回 conflict。比对是快照比对不是锁，
 *   残余竞态窗口消不掉，只能压到最小。
 *
 *   返回三态而不是抛异常——对齐 loadViewState 那条「失败静默兜底、绝不抛」的既有风格，
 *   也让核心有个干净的结果去渲染冲突界面：
 *   - `{ ok: true,  content }`  写成功，content 是**回读的真实全文**。核心不能假设
 *     写进去什么样就是什么样（宿主可能规范化行尾等），要拿这个去更新自己的模型。
 *   - `{ ok: false, reason: "conflict", content }` content 是磁盘上那份**别人的**全文，
 *     给核心拿去展示差异用。
 *   - `{ ok: false, reason: "missing" }` 文件没了（被删/被改名）。
 *   - `{ ok: false, reason: "error", message }` 其它写盘失败。**绝不抛**。
 * @property {() => Promise<Doc[]>} listDocs
 *   列出可读的文献（PDF / 图片 / markdown）。**扫描目录由适配层自己定**——
 *   和 loadCards 同一条纪律：目录常量留在宿主那一侧，核心不碰 config.js。
 *
 *   为什么要单独一个方法而不是让核心去翻 loadCards 的结果：loadCards 只收
 *   卡片目录下的 `.md`，PDF 和图片**核心根本看不见**。看不见的东西做不出列表。
 *   排序与分组由核心基于返回值做，这里不排——两处排序迟早会不一致。
 *
 *   读不出（目录没了、宿主没这个能力）回空数组，**绝不抛**。
 * @property {(path: string) => Promise<ArrayBuffer|null>} readBinary
 *   按路径读出原始字节，给 pdf.js 用。
 *
 *   **不用 `assetUrl` + `fetch` 凑**：那是拿 `app://` 这类宿主私有协议的
 *   跨协议 fetch 去赌 CSP 放行，而这条链路上任何一处的失败都长得一样
 *   （「PDF 打不开」）。readBinary 是显式的、零赌注的一条路。
 *
 *   读不出返回 null，**绝不抛**——调用方按「这份读不了」处理，接着给用户
 *   一句人能读的话，而不是一层壳的错误对象。
 * @property {(name: string, content: string, folder?: string) => Promise<WriteResult>} createCard
 *   在 `folder` 下新建一张卡片，返回三态结果（同 writeCard）。`name` 是
 *   **不含扩展名**的文件名，扩展名由宿主补。`folder` 缺省 = 宿主定的卡片目录。
 *
 *   **不能复用 writeCard**：那个是 `getAbstractFileByPath` 找不到就回 `missing`，
 *   语义是「写一张已经存在的卡」。新建要的是相反的那一半，而且还要挡住重名
 *   （回 `reason: "exists"`）——那是 writeCard 永远遇不到的情况。
 *
 *   `content` 是**核心算好的整篇全文**（含 frontmatter，见 core/frontmatter.js
 *   composeCard），与 writeCard 同一条分工：适配层不解析、不序列化 YAML。
 *
 * @property {(folder: string) => Promise<{ok: boolean, path?: string, reason?: string, message?: string}>} createFolder
 *
 * 3.0 刀 12（用户 2026-09-19 点名要的「删除晶体」）：
 *
 * @property {(path: string) => Promise<{ok: boolean, path?: string, reason?: string, message?: string}>} trashFile
 *
 *   **把一个文件或文件夹丢进回收站。⚠️ 语义是「丢进回收站」，不是「永久删除」——这一条是硬的。**
 *
 *   名字叫 trashFile 而不是 trashFolder：它两个都管（宿主那侧就是同一个
 *   `fileManager.trashFile`），而调用方两个都用得上——「删除晶体」扔的是文件夹，
 *   阅读器的「返回」扔的是刚建出来的那一个 .md。
 *
 *   删一整个文件夹意味着里面**所有卡片一起没了**，而这是核心发起的最不可逆的一个
 *   动作。所以契约里定的是「请宿主把它丢进回收站」，而不是「请宿主删掉它」：
 *   Obsidian 侧走 `fileManager.trashFile`，它会尊重用户在
 *   「文件与链接 → 删除的文件」里自己选的那一档（系统回收站 / vault 里的 .trash /
 *   永久删除）。**用户早就选好了丢掉的东西该去哪儿，这里不该替他改主意。**
 *
 *   反过来，适配层**不许**自己退化成 `vault.delete`——那是永久删除，用它在用户
 *   选了回收站的情况下等于绕过他的设置。没有回收站能力的宿主回 `reason: "unsupported"`，
 *   核心据此**不显示那颗按钮**（摆一颗按了没反应的按钮比不摆更糟）。
 *
 *   `reason` 与别的写盘方法同一套三态：`missing`（本来就不在）/ `unsupported`
 *   （这个宿主没这能力）/ `error`。
 *
 * 3.0 刀 21（用户 2026-09-24 报的「重命名之后全乱套」）：
 *
 * @property {(path: string, newName: string) => Promise<{ok: boolean, path?: string, reason?: string, message?: string}>} renameFile
 *
 *   **改一个文件或文件夹的名字（只换叶子，不搬地方）。**
 *
 *   名字叫 renameFile 而不是 renameFolder，理由同 `trashFile`：它两个都管——
 *   「重命名晶体」改的是文件夹，「重命名卡片」改的是 .md。
 *
 *   `newName` 是**新的叶子名、不含扩展名**（与 `createCard(name, …)` 同一口径）。
 *   目标 = 同一父目录下换个叶子；**不提供「顺便搬到别处」**——那是另一个动作，
 *   混在一起的话调用方要自己拼路径，而拼路径正是最容易出错的一步。
 *
 *   ⚠️ **返回里的 `path` 必须是宿主真正落地的那个路径**，不是我们拼的那个：
 *   Obsidian 撞上重名会自动改成 `名字 1`。同 `createCard` 那条纪律
 *   （`entry-obsidian.js` 里写着「屏幕上说建了 A、盘上其实叫 A 1」的教训）。
 *
 *   ⚠️ **「改完链接跟不跟着变」由宿主决定，核心不自己扫全库。** Obsidian 侧优先走
 *   `fileManager.renameFile`——它会把全库指向旧名的 `[[双链]]` 一起更新
 *   （还受用户设置里「自动更新内部链接」那一档管）。退到 `vault.rename` 时**只搬文件、
 *   不动链接**，是降级不是等价；两个都没有就回 `unsupported`。
 *
 *   `reason` 同 `trashFile` 那套：`missing` / `exists`（新名字被占了）/ `unsupported` / `error`。
 *   `exists` **不复用 `error`**：前者的下一句话是「换个名字」，后者是「去看看出了什么事」。
 *
 *   绝不抛。
 *
 *   建一个文件夹（= **一颗新晶体**）。3.0 刀 9 第三版加的：阅读器里读着文献，
 *   当场就能开一颗新晶体来装接下来的卡，不必先回晶体库、回文件管理器。
 *
 *   `folder` 是**完整路径**（`3.资产舱/知识卡片/文献/新晶体名`），父目录一层层补齐。
 *   已存在回 `{ok:false, reason:"exists"}`——**不复用 `"error"`**：那两句话的后续动作
 *   完全不同（一个是「换个名字」，一个是「去看看出了什么事」）。
 *
 *   ⚠️ **建出来的空文件夹在晶体库里暂时看不见**：那棵树是从**卡片**长出来的
 *   （`model.js` 的 ensureNode 只认卡片所在的文件夹），一个还没有卡的文件夹不会是
 *   节点。这是既有的、写明的取舍（见 model.js 里「要显示它得往契约加一个列出目录的
 *   方法，本版刻意不加」）。调用方拿到 ok 之后要**把这句话说给用户**，
 *   不然就是一次「点了没反应」。
 *
 *   绝不抛。没有这个能力的宿主回 `{ok:false, reason:"error", message:"…"}`。
 *
 * @property {() => Promise<string[]>} listFolders
 *   列出**够格当晶体的文件夹**（完整路径）。3.0 刀 9 第三版加的：让「刚刚建出来、
 *   还没有卡」的空晶体也能出现在环上——在那之前树是**从卡片长出来**的，
 *   一个空文件夹不会是节点，刚建完的晶体在库里看不见。
 *
 *   **哪算「够格」由宿主判断，规则写在契约里**（它要文件知识，核心看不见）：
 *     ① 子树里有 `.md` 的文件夹 —— 装着卡片，当然是晶体；
 *     ② **一个文件都没有**的文件夹 —— 刚建出来、等着放卡的那一颗。
 *   两条都不满足的不算：`我的成就线/assets` 那种装截图附件的、只有 PDF 的文献夹，
 *   都是「有文件但没有卡片」，上环只会让环上多一堆不是晶体的东西。
 *
 *   根目录自己不算（你永远「在里面」）。读不出回空数组，**绝不抛**——
 *   没有这个能力的宿主回空数组，那时退化成从前的行为（只有有卡的才上环）。
 *
 * @typedef {Object} WriteResult
 * @property {boolean} ok
 * @property {string}  [content]
 * @property {"conflict"|"missing"|"exists"|"error"} [reason]
 *   `"exists"` **只有 createCard 会回**：目标路径上已经有一份了。
 *   不复用 `"conflict"`——那个的语义是「别人改过了，这里有两份内容给你看差异」，
 *   而「这个名字被占了」要说的下一句话是「换个名字」，两件事、两个后续动作。
 *   加一个枚举值不影响 writeCard 的既有消费方：它们只可能拿到 conflict / missing / error。
 * @property {string}  [message]
 *
 * @typedef {Object} Doc
 * 文献阅读器的输入。**它不是卡片**：没有 frontmatter、不进关系图、不算晶体的一员。
 * 阅读器只把它当成「一叠能摊开看的页」。
 * @property {string} path    在宿主里的唯一路径（身份键）
 * @property {string} name    文件名（不含扩展名）。列表里按它排序、按它搜索
 * @property {"pdf"|"image"|"markdown"} kind
 *   渲染方式只有这三种。**PPTX 不在这里，将来也不会在**——Obsidian 和 pdf.js
 *   都渲染不了它，收进来只会变成一条「点了没反应」的条目（见 3.0 路线图·刀 6）。
 * @property {string} folder  所在文件夹完整路径
 *
 * @typedef {Object} EditorHandle
 * 宿主原生编辑器的把手（3.0 刀 9 第三版），见下面的 `mountEditor`。
 * @property {() => string} getValue  现在编辑器里的全文
 * @property {(v: string) => void} setValue
 * @property {() => void} focus
 * @property {() => void} destroy  摘干净。**每一处调用方都必须调**——
 *   它背后挂着一个宿主的视图对象，不摘就是每开一次窗漏一个。
 * @property {boolean} [selfSaving] true 表示**这块编辑器自己会存盘**
 *   （宿主的文件视图就是这样）。核心据此跳过「带基线的写盘」那一条路。
 * @property {(n: number) => number} [gotoLine] 跳到第 n 行（1 基文件行号），
 *   返回**真正落到的**行号（越界会被夹回文件范围内）。没有就不显示那个入口。
 *
 * @typedef {Object} Prefs
 * 用户偏好——**跨会话记住**的那点设置，与「上次看到哪儿」是两件事。
 * 形状是开放的（核心自己定字段、自己做兜底），适配层只管当 JSON 存取，
 * **不要**在这里校验字段：加一个偏好不该动适配层。
 * @property {string} [searchColor] 「文件夹」面板搜索框里打字用的颜色，`#rrggbb`
 */

/**
 * 3.0 刀 9 第三版：把**宿主自己的 markdown 编辑器**挂进 `el`。
 *
 * 为什么要它：原地编辑（阅读器的 ✎、卡片窗的 ✎）一开始是核心自己搭的
 * `<textarea>`——那是**源码模式**，写起来和 Obsidian 里完全两样。用户要的是
 * 「Obsidian 怎么做的你就怎么做」：**实时预览**、双链与标签补全、搜索替换。
 * 那些东西只有宿主自己有，核心造不出来，所以它是一条**宿主能力**。
 *
 * **没有这个能力的宿主返回 `null`**（与 `watchCards` 返回一个空退订函数同一条
 * 口径），核心收到 null 就退回自己那个 `<textarea>`。于是：
 *   - 浏览器原型与全部自动化测试走的仍是 textarea，一条断言都不用动；
 *   - Obsidian 真机走原生编辑器；
 *   - 宿主哪天改内部结构把这个口子堵了，用户看到的是「退回输入框」，
 *     而不是**一块什么都不显示的空白**。
 *
 * ---- 它是**绑文件**的（用户 09-18 拍板）----
 *
 * 中途试过「不绑文件」那条路（造一块只装某段文本的编辑器）：真机连报三轮
 * ——转不出编辑器、位置参数签名不对、owner 差容器——每一轮都在收窄，但收窄的
 * 速度赶不上它要的轮次。用户改主意：回滚到绑文件，用两个更朴素的办法解决
 * 「一扇窗 = 一段」：打开时**自动定位到第 a 行**；窗子底下给一个
 * 「**回到第 __ 行**」，随手填行号就跳过去。
 *
 * ⚠️ **绑文件 = 宿主自己会存盘**。所以这一支的 `selfSaving` 为 true，核心据此
 * **不再走「带基线的写盘」**（宿主刚存过，基线必然过期，用户一保存就报假冲突）；
 * 但核心**仍然要在「完成」时把编辑器里的全文写回去**（不带基线）——万一宿主的
 * 自动存盘没接上，用户改了半天会一个字都不落盘。**丢字比假冲突严重得多。**
 *
 * @property {(el: HTMLElement, opts: {path: string, line?: number}) => Promise<EditorHandle|null>} mountEditor
 *   `path` 是要编辑的**文件**；`line` 是出生时要把光标与视口落到的那一行（1 基，
 *   也就是这一扇窗顶栏那个 `from`）。宿主的编辑器里是**整个文件**，
 *   `line` 只决定「打开就看哪一段」。
 *
 *   宿主没有这个能力、或者挂上之后编辑器没真的长出来，一律回 `null`
 *   （核心退回自己的输入框）。**绝不抛**。
 */

export const ADAPTER_METHODS = [
  "loadCards",
  "resolveLink",
  "assetUrl",
  "renderMarkdown",
  "openNote",
  "loadViewState",
  "saveViewState",
  "loadPrefs",
  "savePrefs",
  "writeCard",
  // 3.0 刀 6 文献阅读器。三个都是「宿主能力」而不是宿主实现细节，
  // 所以它们进契约；而阅读器的**排布算法**（一屏摆几页、怎么翻屏）不进——
  // 那是纯核心的事，走 mount 参数注入（与刀 5 的 storyLayout 同一条纪律）。
  "listDocs",
  "readBinary",
  "createCard",
  "watchCards",
  // 3.0 刀 9 第三版：原生编辑器。见上面那段——没有这个能力的宿主回 null。
  "mountEditor",
  "createFolder",
  "listFolders",
  // 3.0 刀 12：「删除晶体」与阅读器的「返回」。
  // ⚠️ 名字是 trash**File** 不是 trashFolder——它同时管文件和文件夹（见下面那段）。
  "trashFile",
  // 3.0 刀 19：把一条网址交给**系统浏览器**。
  //
  // 为什么这也要进契约：阅读器的「外部标签页」是 iframe，而很多站点在响应头里
  // 禁止被别家页面嵌（`X-Frame-Options` / CSP `frame-ancestors`），Google 系
  // 首当其冲。嵌不进来时唯一的出路是交给浏览器——而「怎么交给浏览器」是宿主
  // 知识（Electron 的 shell / window-open handler），核心不该赌。
  //
  // **绝不抛**：打不开就回 false，由核心说一句人话。返回什么都不代表「打开了」，
  // 只代表「这条请求交给宿主了」——真正的打开是宿主的异步动作，核心看不见。
  "openExternal",
  // 3.0 刀 21：改一个文件或文件夹的名字（阅读器的「重命名卡片 / 重命名晶体」）。
  //
  // ⚠️ 与 `trashFile` 同一个命名理由：它**文件和文件夹都管**——宿主那侧是同一个
  // API，调用方两个都用得上。
  "renameFile",
];

/**
 * 视图状态的存储键。
 *
 * 键里必须带卡片目录路径：同一个人会有多个 vault，共用一个全局键会互相串。
 * 放在这里而不是各适配层里，是为了让两个实现（以及测试）从同一个函数取键，
 * 不会各自漂移出一个字面量。
 */
export function viewStateKey(cardsFolder) {
  return "ari-crystal:view:" + String(cardsFolder || "");
}

/**
 * 偏好的存储键（#22）。与视图状态**分开存**，两者的寿命完全不同：
 * 视图状态是「上次看到哪儿」，用户点一下「忘掉」就该清掉；偏好是
 * 「我把搜索框的字调成这个颜色了」，清视角不该连带把它也清了。
 */
export function prefsKey(cardsFolder) {
  return "ari-crystal:prefs:" + String(cardsFolder || "");
}

/** 挂载前校验适配层实现完整，缺方法时早失败、报清楚哪个。 */
export function assertAdapter(adapter) {
  if (!adapter) throw new Error("[ari-crystal] 缺少 adapter");
  const missing = ADAPTER_METHODS.filter((m) => typeof adapter[m] !== "function");
  if (missing.length) {
    throw new Error("[ari-crystal] 适配层缺少方法: " + missing.join(", "));
  }
  return adapter;
}

/** 去掉 frontmatter，返回正文 markdown。全息面板与卡片揭开都渲染这一份。 */
export function splitFrontmatter(raw) {
  return String(raw || "").replace(/^---[\s\S]*?\n---\s*/, "").trim();
}

/**
 * 从一张卡里取出 resolveLink 该返回的那五个性状。
 * 两个适配层实现共用，免得 LinkTarget 的手工拼装在多处各自漂移。
 */
export function toLinkTarget(source) {
  return {
    path: source.path,
    name: source.name,
    concept: source.concept,
    tags: source.tags || [],
    source: source.source,
  };
}
