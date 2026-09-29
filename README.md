# Crystal Vault

Turn a folder of Markdown cards into a **living crystal vault** — a place where you can see the structure of what you know, follow the links between ideas, and test yourself on what you wrote.

<!-- ⚠️ **Do not put a `height` attribute on this image.**
     GitHub's web editor always inserts both `width="…" height="…"` when you drag
     an image in. With both present the browser treats them as the *display* size,
     and Obsidian's plugin detail pane only clamps the width (`max-width:100%`) —
     nothing resets the height — so the height stays pinned at 1016px while the
     width shrinks and the picture comes out **squashed**.
     Width alone: the browser derives the height from the intrinsic ratio, so it
     scales cleanly at any container size. -->
<img width="1917" alt="Crystal Vault overview" src="https://github.com/user-attachments/assets/54550694-81b4-418f-a394-efd485701c1a" />

Its real home, though, is the **literature reader**: read PDFs, images and Markdown on one side, and build the structure out of what you read on the other. Finish a chapter and the chapter's structure is already there. The reader's **desk** lays it out as draggable, resizable windows; the **Structure window** keeps the vault's structure beside the page you are reading, so you never have to leave it.

Your cards stay plain Markdown in plain folders. Nothing is locked in a database, and nothing leaves your vault.

> 中文说明见 [README.zh.md](README.zh.md)。

> **Note on the interface:** the plugin's UI labels are currently **Chinese only** (the reader button says 文献, the structure window says 结构窗, and so on). This README names those labels verbatim so you can find them. Localisation has not been done yet.

---

## The main thing: the reader's desk

The reader has two layouts. **Grid** spreads N pages across one screen (for scanning). **Desk** gives each page its own window — and Desk is the one you will live in, because it hands the *"I want to see several things at once"* problem back to you.

- **One page, one window, arranged by you.** Drag the title bar to move it, the corner grip to resize it — and **the layout is still there next time you open the reader**.
- **Not just document pages.** Cards, structure and web pages are all the same kind of window, sharing the same drag / resize / stow. A card window shows that card's **concept** across the top, formulas and all.
- **The dock** (button in the top bar). A strip slides out on the left and acts as the rack for those windows: drag a window onto it — or press its **收纳 / Stow** button — and it is put away with an entry left behind. Click the entry to bring it back. **Stowed windows survive closing the reader.**
- **External tabs** (the `+` at the top of the dock). Type a URL and a course site or docs page sits beside the page you are reading, draggable and stowable like any other window.

  > ⚠️ Whether a site *can* be embedded is decided by that site, not by this plugin — sites may refuse to be framed (Google does, across the board). That is a browser rule and there is no way around it. So the window always carries an **Open in browser** button: embeddable sites work as windows, and non-embeddable ones still have a way out. You never get a dead white box.

- **The right-hand column tucks away too.** The same button squeezes the notes column out of the way when you want to read wider.

### ＋ 页: Markdown documents are paginated by line

Each press of 「**＋ 页**」 (Add page) puts the **next slice** of the document on the desk. For a Markdown document a "slice" is a **range of lines** — it picks up at the last window's ending line and runs 40 lines further.

To change which lines a given window shows, edit the two boxes in its title bar — 「**起始行**」 (start line) and 「**结束行**」 (end line) — and **press Enter when you are done**. The 「共 N 行」 label next to them is the file's current total line count; use it as your ruler when picking a range.

> The same rule applies to the PDF / image windows: their title-bar box is a **page number**, and it is **also Enter-to-commit**.

## The Structure window: build structure while you read

This is the half that pairs with the desk.

The annoying part of reading is *"what does this actually look like in my vault?"* — switch away to check, and you come back having lost your line. The Structure window puts that structure in **a window on the same desk**, right beside the page:

- **A glance, not a departure.** Switching away is *leaving*; a window beside you is just a glance.
- **Pin it to one crystal.** The 「晶体：…」 button in its top bar picks which crystal it watches, and it is still watching it next time.

### Draw: view / write

The 「**画线：看 / 写**」 toggle in the top bar decides **what dragging a line actually does**:

| Mode | What dragging a line does |
| --- | --- |
| **看 (view)** — default | Draws a **gold** line. It lives in the library's own view state and **does not touch your notes at all**. |
| **写 (write)** | Writes a **real `[[target card]]`** into the source card's body — the note changes. The line is **blue**. |

That is what the two colours mean: **a gold line is a way of looking; a blue line is something that genuinely exists in your notes.**

Delete a blue line in 写 mode and what you are deleting is **the `[[link]]` in the card's body**, not something drawn on screen. Get it wrong and there is one undo (the same undo as the card editor's).

### Right-click: three places, three results

- **Right-click a card → hide every link going into and out of it.**
  When one card has a dozen lines running through it, clearing them all out leaves the rest of the structure readable at a glance. **Right-click it again to bring them back.** While anything is hidden, a 「**显示全部**」 (Show all) button appears in the top bar and restores everything at once.
- **Right-click on a gold line → enter link-edit mode.** Two buttons appear in the top bar, 「**选框：线**」 and 「**选框**」; drag to box in some lines, and a 「**删除实线（N）**」 (Delete lines) button appears. (Click the first one and it turns into 「**框：卡**」 — that mode is for **moving a batch of cards at once**, see below.)
- **Right-click empty space (in 写 mode) → the same 「选框」 button, but this one boxes *blue* lines.** What appears then is 「**删除蓝线（N）**」 — and pressing it removes the matching `[[link]]` **from the card's body**.

> One detail: the **card right-click is opened by 写 mode**. In 看 mode, right-clicking a card still does the old thing (enters link mode). But **once a card is hidden, right-clicking it works in either mode** — otherwise switching back to 看 would leave the hidden state reachable only from the top-bar button.

### Boxes: tidy a region away without pretending the links are gone

The dashed rectangles are **boxes**. **Every sub-crystal gets one automatically**, named after its folder; a box can be **renamed** (click the name) and **collapsed** (click the little triangle on its left).

> **A box you drew belongs to the layer you drew it on.** Make one inside 「Python/数据分析」 and it is not there when you switch to 「Python/爬虫」 — go back and it is exactly as you left it. It did not used to work that way: boxes were global, so switching folders left the other layer's boxes sitting on screen.

A box made with 「**＋ 框**」 lands **where you are looking** (the middle of the viewport), not in some fixed corner of the world — boxes used to appear at a hard-coded (60, 60), so if you had panned away you had to pan back to find it. Same for a newly created card.

Collapsing puts the cards inside away together with the lines running to them — **but "there is still something in there" is never lost**:

- any outside card that still has a blue line into a collapsed box gets a **yellow filled dot** in its corner;
- hover that card and the collapsed boxes it relates to **flash around their edge**.

Without that, collapsing would read as *"my links are gone"* when you never deleted anything. While a box is open, the cards inside link outward with blue lines as usual — **across levels included**.

### 框：卡 — move a whole batch at once

Two buttons sit next to each other in the structure window's top bar, and they **do two different jobs**:

| Button | What it tells you |
| --- | --- |
| **选框：线** ⇄ **框：卡** | **what** the marquee catches |
| **选框** ⇄ **退出选框** | **whether** you can marquee right now |

The default is 「选框：线」: right-click to enter link-edit mode, drag a box around some lines, then hit 「删除实线 / 删除蓝线」. Click 「选框：线」 and it becomes 「**框：卡**」 — now the box you drag **catches cards**:

1. box in a few cards and they **light up with a cyan edge**;
2. **drag any one of them and the whole batch moves**;
3. on release the whole batch is re-checked for membership: **drop it inside a box and it joins; drop it outside and it leaves**.

Without this, filing a dozen cards into one box meant dragging them **one at a time**.

> - Press on a card that is **not** in the selection and only that card moves — after boxing an area, reaching for a different card clearly means "move *this* one", not "and those five as well".
> - **There is no "delete" in card mode**: the 「删除实线 / 删除蓝线」 button hides itself. Boxing cards only moves them around — it **does not touch a single word of your notes**.
> - To un-highlight them, **click empty space** or press **Esc**.

### Card positions travel with your notes

**Where a card sits is written into that card's own frontmatter** (a field called `晶体坐标`). So open the same vault on another machine with the same plugin and **every card sits exactly where you left it** — the view state is per-machine, and only what is written into the files travels.

The field looks like this; the unit is a grid square (the minimum unit is a tenth of a card's width, 21px), anchored at the **bottom-left corner**:

```yaml
晶体坐标: [3, 5]
```

> The `晶体` ("crystal") prefix is deliberate: this plugin gets installed in other people's vaults, and a bare `坐标` ("coordinate") is far too generic a name — anyone with a field of their own by that name would have it silently overwritten.

> - **Gold boxes need nothing of their own:** their position and size are the bounding box of the cards inside, so they follow along automatically.
> - **Manual boxes have a file of their own too**: one `.crystal-boxes.json` per crystal, sitting in that crystal's folder. The leading dot means Obsidian's file list never shows it and it **never becomes a card** (the adapter separately only reads `.md` — two independent guards). It holds each box's **bottom-left** corner, name, size, **collapsed state** and members. Close Obsidian before editing it by hand.
> - ⚠️ **Your sync channel has to carry dot-prefixed files.** FNS works on the filesystem layer, so it is fine; a channel that skips `.`-prefixed entries (Obsidian's own Sync, for instance) will not carry this file, and your boxes will then exist only on this machine — with no warning that it happened.
> - **Imported cards (borrowed via 「导入卡片」) are not written either**: where it sits in *your* layer is a different thing from where it sits in its own crystal, and writing it would move it back home.
> - Position writes are **debounced** — they land a moment after you stop dragging (you sync across devices, and a write per drag would set off a sync storm). Closing the vault flushes anything still pending, so nothing is lost.

### Placing cards by the square: the grid and the arrow keys

Cards in the storyline sit on a **grid**, anchored at the **bottom-left corner** — so two cards side by side line up along their **bottom edge**.

| Key | One step |
| --- | --- |
| **← →** | **42px** (twice the minimum unit — five steps is exactly one card wide) |
| **↑ ↓** | **21px** (the minimum unit) |

**The minimum unit is a tenth of a card's width: 21px.** That is where it comes from — every card is the same size, so using it as the ruler makes the whole picture line up.

Drag a card and it settles onto the nearest grid point; box some cards in and step them one square at a time with the arrow keys.

> - **Manual boxes are not on the grid**: they go wherever you drag them and resize to whatever you pull. A box is a free container *you* draw; cards are the things that need to line up — the two jobs are not the same.
> - **Gold boxes (the ones grown from folders) are not on it either.** Their position and size are **computed** from the cards inside, so they have no position of their own.
> - **Positions you already arranged are never mass-moved.** The grid only takes effect the next time you drag that card or press an arrow key — otherwise it would be a change nobody pressed a button for. The cost: a card you have never touched may sit off-grid until you move it once.

### Import a card: borrow one from another crystal

A crystal only ever draws the cards **in its own folder**. But you often want a card in crystal A to link to a card in crystal B — so hit 「**导入卡片**」 (Import card) in the structure window's top bar and pick one:

1. it **lands in the middle of the window** (it does not tuck itself into a corner — you need to see that it arrived);
2. drag it into any box and it belongs there, so **cross-level blue links** work from then on;
3. to get rid of it, click the **✕ in its top-right corner**.

Imported cards are drawn as **dotted purple rectangles**, so they never read as belonging to this layer. **The card itself is not touched at all**: it stays in its own folder and every `[[link]]` pointing at it is intact. Take it away and import it again later and even the position you gave it is still there.

> - Importing a card that is **already in this crystal** is refused, and it tells you why.
> - Only the **structure window** can import; once imported, the card also shows up if you open the same crystal's storyline in the vault itself.
> - 「删除实线 / 删除蓝线」 has nothing to do with it — **importing never deletes anything**.
> - One crystal can hold at most 500 imports (a guard against corrupt saves, not a limit you will ever meet).
> - An imported card **cannot join a sub-crystal box** — those boxes draw their membership from folders. Dropping one there tells you so; use 「＋ 框」 to make a manual box instead.
> - Clicking a **folder name** in the picker expands it (it does not mean "pick this folder"). That is the feel in all three card-picking modes (import / delete card / rename card).

## Read-and-jot: turn what you read into a card on the spot

The column on the right of the reader. Fill in **name / concept / source / body** and you have a card — without leaving the page.

- **Prefer a real editor?** Hit **✎ Write in editor**: it creates the card first, then swaps the body field for Obsidian's own live-preview editor (renders as you type, saves automatically).
- **Changed your mind?** Hit **Back**: the card you just made is removed and its body moves, untouched, into a **scratch note**.
- **Scratch notes** are a pad written in the native editor, dropped into a folder you choose — deliberately *not* a card.
- **Card box**: search the vault's cards, click one to put it on the desk, and it leaves a line in that card linking back to **the exact page** you are reading.
- **Rename card / Rename crystal** live here too. They go through Obsidian's own rename channel, so **every `[[link]]` pointing at it is updated along with it**.

## The vault itself, when you are not reading

- **A folder is a crystal.** Every subfolder under your card folder becomes one crystal on the ring. Nested folders become nested crystals — drill in and out, and the breadcrumb always tells you where you are.
- **Links become shape.** Write `[[another card]]` in a card's body and a line appears between them. The storyline view lays every card out by link topology. Links `A → B` and `B → A` are drawn as **one line with arrows at both ends** — one arrow means one-way, two means mutual.
- **Orphans are a signal, not an error.** A card nobody links to and that links to nobody is flagged. It is not a mistake; it is a card that has not been connected to anything yet.
- **Recall before you peek.** In recall mode every card's content is hidden until you click. Say it to yourself first, then check. Switch to review mode when you just want to read through.
- **Edit in place.** The pencil in the panel's top-right turns it into a form — concept / source / tags / body — without navigating away or opening a new tab.
- **Deleting goes to the bin.** Deleting a crystal or a card respects whatever you chose under *Files & Links → Deleted files*, so you can get it back.

## Why not just the graph view?

The graph view answers **"what is this note connected to?"** It starts from notes, the links are the subject — and **folders do not appear in it at all**. If you organise your knowledge by subject and chapter, the graph mixes all of it into one cloud. That is why so many people find it beautiful and useless: they cannot find the line they organised their knowledge along.

Crystal Vault answers a different question: **"what is in this collection, and how far along is it?"** It starts from folders. The structure *is* the subject.

It is not a better graph. It is a different starting point.

## Windowed mode: it does not have to take the whole screen

Opening the vault from the ribbon icon gives you the **full screen** by default. If you would rather **keep your note visible while you use the vault**, set 「**打开方式**」 (how it opens) to 「**浮窗**」 (floating window) in the plugin settings: the vault shrinks to a rectangle on screen with your note still visible beside it.

- **Drag its top bar** to move it, **drag the bottom-right corner** to resize it;
- the position and size **travel with the vault**, so it opens where you left it on another machine;
- the 「**浮窗 / 全屏**」 button in the vault's own top bar switches either way — the label tells you what pressing it does.

> - Switching **reopens the view** (whatever you had open in the reader, and the windows on the desk, are dropped). This mode changes the vault's *geometry*, and patching that in place always leaves something stale.
> - **The reader and the card panel stay inside the window too** — click a card and the panel does not cover your note.
> - **The dataviewjs form has no such mode** (it already lives inside a note), so that button never appears there.

## Install

### From the community directory

Search for **Crystal Vault** in *Settings → Community plugins → Browse*.

### Manually

Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/runyao-zhang/crystal-vault/releases/latest) and put them in `<your vault>/.obsidian/plugins/crystal-vault/`, then enable the plugin in *Settings → Community plugins*.

## Getting started

1. Open the plugin settings and point **Card folder** at the folder you keep your notes in. It defaults to `cards` — if you do not have one yet, create a folder with that name in your vault. The settings pane tells you right away whether that path exists and how many crystals are in it.
2. **Drop something readable into the card folder** — the book you are reading, a course handout, a paper. **A PDF is best** (images work too). **Do not put an empty file in** — the reader will just say *"this document has nothing to display"*. Once it is in there it shows up in the reader's document list, which step 6 needs.
3. Click the gem icon in the ribbon (or run the command **Crystal Vault: Open**).
4. Make a subfolder inside your card folder. That is a crystal.
5. Write a card. See the format below.
6. Link cards to each other with `[[double brackets]]` and watch the structure appear.
7. Hit **文献 / Reader** in the top bar, pick the file you just dropped in — then switch to **Desk** and open a **Structure window**. That is what using this thing actually looks like day to day.

> **Which formats work:** the reader accepts **PDF / images (png, jpg, jpeg, gif, webp, bmp, svg, avif) / Markdown**.
> **PPTX is not among them and will not be** — export it to PDF first.
>
> ⚠️ A `.md` dropped into the card folder is **also a card** (a subfolder is a crystal, a `.md` is a card), so that markdown will show up in the vault too. Keep it simple and use a PDF.

## The card format

A card is a Markdown file. Three frontmatter fields are read; everything else is yours.

```markdown
---
概念: One sentence saying what this is
来源: Which book / lecture / paper it came from
tags: [subject, type]
---

Say what it is in your own words…

Then link onward: [[02-Next card]] and say why you are linking

==Highlight== the part you want to be quizzed on.
```

| Field | Where it shows up |
| --- | --- |
| (the filename) | The card's title. A `card-` / `card_` prefix is stripped automatically |
| `概念` | The line at the top of the card panel |
| `来源` | The "source" line in the hover card |
| `tags` | Up to six shown on the card face |

**Four habits that make the vault come alive:**

1. **Link at least once** — a card with no links either way is an orphan.
2. **Write the reason** — text after `]]` on the same line is shown on the connecting line.
3. **Number the filename** (`01-`, `02-`, …) to control ordering. Cards are sorted by filename.
4. **Use `==highlight==`** for anything you want turned into a quiz point.

## Changelog

Newest first. Kept current with every release, and it **only records things you can see**.

**1.3.71** · Fixes a fatal bug in 1.3.70: **the vault would not open at all** (`Cannot access 'j' before initialization`). I had declared `viewBox` *after* the line that reads it — a temporal-dead-zone error — and in the production bundle the variable is minified to a single letter, so the message names nothing recognisable. The declaration now comes first.

**1.3.70** · **Windowed mode**: the vault no longer has to fill the screen — it can shrink to a draggable, resizable rectangle floating over your note, so you can read and use the vault at the same time. Pick the default in the plugin settings, or flip it any time with the button in the vault's top bar. (The version jumps from 1.3.60 because this is an architectural change: the vault gained a notion of *how much screen it occupies*, and every piece of coordinate maths that assumed "the viewport" now asks "this layer" instead.)

**1.3.60** · Boxes are written to disk: one `.crystal-boxes.json` per crystal (dot-prefixed, so Obsidian never shows it), holding each box's name, size, collapsed state and members. Positions that only ever lived on this machine are moved in automatically the first time you open the vault after upgrading.

**1.3.59** · Card positions are written into the card's own frontmatter (`晶体坐标: [3, 5]`, anchored at the **bottom-left corner**) — so the same vault on another machine has the same arrangement. Also: manual boxes are **off the grid** (they go wherever you drag them), and new cards and 「＋ 框」 **land where you are looking** instead of in a fixed corner of the world you have to pan back to.

**1.3.58** · Manual boxes are **scoped to their crystal**. They used to be global — switch to another folder and the other layer's boxes were still sitting there.

**1.3.57** · Cards get a **grid and arrow keys**: drags snap to the grid, and arrow keys step a selection one square at a time. The minimum unit is a tenth of a card's width, anchored at the **bottom-left corner**.

**1.3.56** · Four fixes to Import card. Two matter: clicking a **folder name** in the card picker silently changed your "create cards in" setting, and dropping an imported card onto a sub-crystal box did nothing at all (it now tells you to use 「＋ 框」).

**1.3.55** · **Import a card**: pull a card in from another crystal, drop it into a box, and **cross-level blue links** work from then on. The card itself is not touched.

**1.3.54** · **Box cards in and move the whole batch**. A 「框：卡」 button joins the top bar — box a few cards, drag any one of them and the batch moves, and on release the whole batch is re-filed. Before this, filing a dozen cards into a box meant dragging them one at a time.

**1.3.53** · Fixed: a dragged box moved a different distance from a dragged card (whenever the camera was zoomed), and dragging a collapsed box flung its cards outside it.

**1.3.52** · Manual boxes became **boxes you draw yourself**: draggable, resizable, no longer just a computed shell around cards. And when collapsed, an outside card with a blue line into it gets a **yellow dot**; hover it and the related boxes **flash around their edge**.

**1.3.51** · Box colour darkened. The first pass was so faint it was invisible on the library's own dark background.

**1.3.50** · Fixed: empty boxes were not drawn, so 「＋ 框」 looked like it did nothing. You have to be able to *see* a box before you can drag cards into it.

**1.3.49** · Dragging a box's **title bar moves the whole group of cards** with it.

**1.3.48** · The 「**＋ 框**」 entry point for manual boxes; drag cards in and out; delete a box (a box is just a grouping — deleting one does not touch your cards).

**1.3.47** · Fixed: boxes were not being cleared from the stage, so they stacked up one layer per redraw.

**1.3.46** · **Boxes** in the structure window: one per sub-crystal, renameable and collapsible. Collapsing puts the cards and their lines away — but "there is still something in there" is never lost.

**1.3.45** · A 「concept」 line on the desk's card windows.

**1.3.44** · The structure window section filled in (**view / write** modes, the three right-click targets); ＋ pages paginate markdown **by line, and take effect on Enter**; getting started gained a step about putting something readable into the cards folder. The README was rewritten in this version to put **文献模式 · 桌面 (the reader's desk)** front and centre.

**1.3.43** · **Rename card / Rename crystal** buttons; and a fix for "somebody renamed a file in Obsidian and the plugin never noticed" — which used to leave a grey card on the graph that opened to nothing.

**1.3.42** · Every window gets a 「收纳」 (dock) button, unconditionally.

**1.3.41** · The `+` at the top of the dock: **external tabs**, so you can keep deepseek, Google and the like open inside the reader.

**1.3.40** · The reader's **dock**, and the toggle for the 「边看边记」 column.

**1.3.39** · The storyline gets its own **view / write** modes: in write mode dragging a line really writes a `[[link]]`, the marquee deletes blue lines, and there is one undo.

**1.3.38** · Removed the "why does this link exist?" box in write mode — it interrupted you once per line while you were drawing several. You can still hand-write the reason after the `]]`; the plugin just no longer asks.

**1.3.37** · A 「**选框**」 (marquee) in write mode to delete blue lines: box in a few and the matching `[[link]]` is cut out of the card body — both directions, byte-exact, one undo.

**1.3.36** · Blue lines became **orthogonal polylines** like the gold ones (straight runs with rounded corners) instead of bezier arcs — an arc cuts across the middle of cards, and two of them crossing makes it impossible to tell which connects to which.

**1.3.35** · Blue lines can attach from top / bottom / left / right (it honours the port you dragged from); in write mode, **right-clicking a card hides every link into and out of it**, with a 「显示全部」 button to bring them all back; the rubber-band preview is now the same shape and colour as what you get on release.

**1.1.31 / 1.1.3 / 1.1.2 / 1.1.1 / 1.1.0** · Scratch notes, the "back" button in read-and-jot, delete a card; and scratch notes went from a pile of text to **a real card placed on the desk**. The odd patch numbers are because a published version number can never be reused.

**1.0.2 / 1.0.1 / 1.0.0** · Default card folder became the neutral `cards`; three fixes from the automated review; first commit.

## Licence

[GPL-3.0](LICENSE).
