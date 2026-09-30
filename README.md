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
  When the name is too long, click the **▲** to its left to put the name away (the button shrinks to just 「晶体」); **▼** brings it back. That choice is remembered, so you do not have to re-collapse it on the next open.

### Draw: view / write

The 「**画线：看 / 写**」 toggle in the top bar decides **what dragging a line actually does**:

| Mode | What dragging a line does |
| --- | --- |
| **看 (view)** — default | Draws a **gold** line. It lives in the library's own view state and **does not touch your notes at all**. |
| **写 (write)** | Writes a **real `[[target card]]`** into the source card's body — the note changes. The line is **blue**. |

That is what the two colours mean: **a gold line is a way of looking; a blue line is something that genuinely exists in your notes.**

Delete a blue line in 写 mode and what you are deleting is **the `[[link]]` in the card's body**, not something drawn on screen. Get it wrong and there is one undo (the same undo as the card editor's).

### Right-click: three places, three results

- **Which side a blue line attaches to is decided from the geometry by default**: two cards stacked one above the other run bottom-to-top, two side by side run right-to-left. To route one differently, drag it from the side you want in **write** mode — **that one line then follows your choice** (anything dragged by hand always beats the default).
- **Right-click a card → hide every link going into and out of it.**
  When one card has a dozen lines running through it, clearing them all out leaves the rest of the structure readable at a glance. **Right-click it again to bring them back.** While anything is hidden, a 「**显示全部**」 (Show all) button appears in the top bar and restores everything at once.
- **Right-click on a gold line → enter link-edit mode.** Two buttons appear in the top bar, 「**选框：线**」 and 「**选框**」; drag to box in some lines, and a 「**删除实线（N）**」 (Delete lines) button appears. (Click the first one and it turns into 「**框：卡**」 — that mode is for **moving a batch of cards at once**, see below.)
- **Right-click empty space (in 写 mode) → the same 「选框」 button, but this one boxes *blue* lines.** What appears then is 「**删除蓝线（N）**」 — and pressing it removes the matching `[[link]]` **from the card's body**.

> One detail: the **card right-click is opened by 写 mode**. In 看 mode, right-clicking a card still does the old thing (enters link mode). But **once a card is hidden, right-clicking it works in either mode** — otherwise switching back to 看 would leave the hidden state reachable only from the top-bar button.

### Boxes: tidy a region away without pretending the links are gone

The dashed rectangles are **boxes**. **Every sub-crystal gets one automatically**, named after its folder; a box can be **renamed** (click the name) and **collapsed** (click the little triangle on its left).

> **A box you drew belongs to the layer you drew it on.** Make one inside 「Python/数据分析」 and it is not there when you switch to 「Python/爬虫」 — go back and it is exactly as you left it. It did not used to work that way: boxes were global, so switching folders left the other layer's boxes sitting on screen.

A box made with 「**＋ 框**」 lands **where you are looking** (the middle of the viewport), not in some fixed corner of the world — boxes used to appear at a hard-coded (60, 60), so if you had panned away you had to pan back to find it. Same for a newly created card.

**Any blank part of a box drags the whole box** (since 1.3.83) — not just the title bar. Grab the box's edge or any empty spot inside it and the box moves together with the cards in it. Pressing on a card still drags the card (cards sit higher), so: to move a card press the card, to move the whole box press the box's blank space. Dragging **follows the grid** — see "Placing cards by the square" below.

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
3. on release the whole batch is re-checked for membership: **drop it inside a box and it joins; drop it outside and it leaves**;
4. to get rid of them, hit the **red-outlined 「删除卡片 (n)」** in the top bar — they **go to the recycle bin along with their note files**.

Without this, filing a dozen cards into one box meant dragging them **one at a time** — and
clearing a batch meant going back to the vault and deleting them one at a time.

> - Press on a card that is **not** in the selection and only that card moves — after boxing an area, reaching for a different card clearly means "move *this* one", not "and those five as well".
> - **「删除卡片」 removes the card files themselves** — not an unlink, not a hide. The note goes to the **recycle bin** with it and can be recovered, and the **crystal it belonged to is untouched**. The button only appears when cards are actually boxed, and the count is written on it: this window has **no confirmation dialog**, so the count on the button, the tooltip, and the hint line below are the whole warning.
> - **The D key does not delete cards here**: one bare keystroke putting several files in the recycle bin is far too easy to trigger — especially with your hand on the arrow keys nudging cards. Deleting goes through that button.
> - The boxing itself **does not touch a single word of your notes** — the 「删除实线 / 删除蓝线」 button hides itself in card mode, because there are no lines to delete there.
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

> - **Manual boxes are on the grid too** (since 1.3.83): dragging snaps the box's **bottom-left corner** to the grid, and the cards inside move by **one and the same offset** — their relative positions do not change at all. **Resizing is still free** — a box is a container *you* draw and its size is yours to decide; only *where* it sits needs to line up.
> - **Gold boxes (the ones grown from folders) move in whole squares.** Their position and size are **computed** from the cards inside, so they have no coordinates of their own to snap — what snaps is the **offset**: the box and its cards travel by a whole number of minimum units, which is still a plain translation.
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
- **The folder picker's header has a 「取消」** (since 1.3.83). "Will be created in", new / delete / rename crystal, delete / rename card and the structure window's crystal picker all open that same panel, and **closing it is now this one button** — it puts the panel away and changes nothing else.
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

## Three ways to open it: full screen / floating window / embedded

Opening the vault from the ribbon icon gives you the **full screen** by default — it fills the window and covers your note. The other two live in the plugin's 「**打开方式**」 (how it opens) setting, and the button in the vault's own top bar cycles through all three (**the label names the mode you will get**):

| | What it looks like |
| --- | --- |
| **Full screen** | Fills the whole window, over your note. The old behaviour, and the default. |
| **Floating window** | Shrinks to a rectangle **floating over your note** — read and use the vault at the same time. |
| **Embedded** | **Lives inside its own Obsidian tab**, covering nothing. Can sit side by side with other tabs. |

**Floating window**: drag its top bar to move it, drag the bottom-right corner to resize it; the position and size **travel with the vault**, so it opens where you left it on another machine.

> - Switching between the three **reopens the view** (whatever you had open in the reader, and the windows on the desk, are dropped). The mode changes the vault's *geometry*, and patching that in place always leaves something stale.
> - **The reader and the card panel stay inside whichever mode you are in** — in a floating window, clicking a card does not cover your note; embedded, they only occupy that tab.
> - **Embedded mode does not lock your note's scrolling** (the other two do — they sit over the note, so it should not scroll behind them).
> - **The dataviewjs form has none of this** (it already lives inside a note), so that button never appears there.

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

**1.3.86** · Fixes: **a blue line always attached on the left and right sides, wherever the cards sat**. Two cards stacked one above the other still had their line leave the right edge and loop back into the left. The cause was the fallback used when nothing was set by hand: it was hard-wired to left/right (whichever card is further left gets the left side). It now **picks the facing side from the geometry**: cards stacked vertically run bottom-to-top, cards side by side run right-to-left.
There is a second layer to this, and it is where switching computers comes in: **the attachment you set by hand lives in that machine's view state, not with the cards** — so carrying your material to another computer leaves every one of them behind, and the whole screen degrades to left/right. With the geometry-based default, **the default attachment is derived from the layout**, identical on any machine; the ones you dragged by hand still win over it (manual > automatic).

**1.3.85** · Fixes: **clicking a box's name stopped renaming it**, introduced by 1.3.83. That version made **the whole box** start a drag, and the drag took pointer capture **the instant you pressed**. So on a press-and-release-in-place over the name: the **press targeted the name, the release targeted the whole box**, and since a `click` targets the **nearest common ancestor** of the two, it landed on the box — the name could not be found and renaming died on the spot. (Before 1.3.83 this only worked on **empty** boxes: those returned early and never captured. Opening that early return up also tore down a door that "empty boxes can be dragged" and "click the name to rename" were sharing.) The fix follows the lesson already written in panzoom / holodrag: **capture only after 4px**. A press that never really dragged changes nothing at all.

**1.3.84** · Fixes: **a long crystal name in the structure window's top bar pushed the buttons behind it out of the window**. The bar did not wrap and had no width cap, and the crystal name is the **only thing in it that grows** — so a long name shoved everything rightward, and since the window's outer element is `overflow:hidden`, **the pushed-out buttons could no longer be clicked**. The name is now capped (ellipsis when it overruns; the full one is in the tooltip) and the bar itself **wraps at the edge** — two guards, so a button can never leave the window again. A **▲ / ▼** pair now sits to the left of the name: **▲ puts the name away, ▼ brings it back** (collapsed, that button shrinks to just 「晶体」 — the way to switch crystals stays reachable). That choice is **remembered in your preferences**, so you do not have to re-collapse it every time you open the window.
(One aside: if you still see the "an empty box cannot be dragged" bug that 1.3.83 fixed, your plugin probably did not reload — toggle it off and on again in *Settings → Community plugins*.)

**1.3.83** · Four things, all in the storyline / structure window (user, 09-30).

**A box is draggable by its whole body now.** Only the 26px title bar could be grabbed before; now **any blank part of the box** starts the drag. Pressing on a card still drags the card — cards sit above boxes, so that part is given by stacking order rather than by an extra check (which is why "dragging a card area never drags the box" comes for free). The cost, stated plainly: pressing on blank space inside a box **no longer pans the camera** — pan by dragging outside a box, or with the wheel. One thing fixed along the way: **an empty box used to be immovable**; it can be positioned now.

**Lines inside a gold box now run the same way they do inside that folder.** The "attachment" (which side of a card a line leaves from, and how it bends) was recorded **per layer**, so looking at a gold box from the outside found no record and fell back to the default "whichever card is further left gets the left side" — the same pair of cards, the same single line, drawn differently in the two places, with nothing on screen explaining why. Now **every layer's record counts, with the current layer winning**.

**Boxes are on the grid again.** A manual box snaps to the grid (same ruler as cards: the **bottom-left corner**), and the cards inside move by **one and the same offset** — their relative positions do not change at all, so they never collapse into each other. A gold box has no coordinates of its own, so it snaps by **whole squares** instead. **Resizing is still free** — only *where* a box sits needs to line up. (The grid was removed from boxes in 1.3.34; this version puts it back, as asked.)

**The folder picker's header gained a 「取消」.** "Will be created in", new / delete / rename crystal, delete / rename card, and the structure window's crystal picker all open the same panel, so closing it is now one button for all of them. (Before, the only way out was clicking 「将建在」 again — a button whose label reads "will be created in", which does not look like a close.)

**1.3.82** · New: **the structure window can now delete a whole batch of cards at once**. Once you have boxed some cards (「框：卡」 + 「选框」 in the top bar), a **red-outlined 「删除卡片 (n)」** appears — one click sends those cards to the **recycle bin together with their note files** (recoverable), leaving the **crystal they belonged to untouched**.
What it deletes is a **file**, so the cost is stated in three places: the count on the button, the tooltip, and the hint line below. This window has **no confirmation dialog** by design (settled 09-20), so the hint line is the only notice it gives.
**D does not delete cards**: a single bare keystroke putting several files in the recycle bin is far too easy to trigger, especially with your hand on the arrow keys nudging cards. Deleting goes through that button.
(The vault's own story view still only moves cards in card mode — there is no such button there.)

**1.3.81** · Fixes: **clicking "Edit" left a stray blank tab behind** (full screen, floating window and embedded alike). The plugin asked the host to "reuse an existing tab" with `getLeaf(false)`, and that call **does not** mean "reuse one" — internally the host runs `getUnpinnedLeaf()`, which asks for **an unpinned** tab and **creates a fresh empty one** whenever the active tab happens to be pinned. While you are in the reader, the active tab is **the vault's own**, so every ✎ click added one. The proof: a probe in the host console printed the call stack at the moment a tab was inserted into the DOM (`mountEditor → getLeaf → getUnpinnedLeaf → setActiveLeaf → … → insertBefore`). The fix: that spot **needs the class, not a real tab** — it now takes the constructor from an already-known markdown tab, which is a lookup: no activation, no creation.

**1.3.80** · Fixes: **a card changed on another machine had not been picked up here since 1.3.59**. When sync brought over new body text, concept, source, tags or position, **none of it changed** and the screen did nothing — it looked as if the notification never arrived. The cause: when the position field was added, the call **shifted its arguments by one**, so the card object was squeezed out; a second thing of the same name was in scope, so **nothing threw**. The tests caught 2 cases; what was broken was the whole sync path.

**1.3.79** · Fixes: new cards still landed at the "default coordinates". In 1.3.77 I had used **screen coordinates** where **world coordinates** were needed, and the two **only coincide when the camera sits at the origin with zoom 1** — so a new card always landed somewhere **with no relation to where you had panned**. The conversion now happens first: **the "current viewport" you meant is wherever the camera is right now**, so a new card really does land **5% in from the right edge of the screen you are looking at, vertically centred**.

**1.3.78** · Fixes: **in windowed and embedded modes, "Edit" opened your note beside an empty tab**. The cause was not "Edit" itself but the assumption under it: split away from "the currently active leaf" — and those two modes **have a leaf of the plugin's own**, which can be the active one. The split now picks an existing markdown leaf itself. **Full-screen mode is unchanged word for word** (there, "the most recently used leaf" was your note all along).

**1.3.77** · Fixes: **a card created inside a sub-folder still landed at the default position** — there are two ways to create a card and I had only placed one of them, while you were using the other ("✎ write it in the editor"). Both are "create a card", so the position had to behave the same. The landing formula is now the one you specified: **5% in from the right of the viewport** (the card's **right edge** sits at "right edge minus 5% of the width", vertically centred), and it is **not snapped to the grid** — you gave an exact formula, and snapping would knock it half a square off.

**1.3.76** · Fixes: **a card created inside a sub-folder was not placed in the structure window's viewport** (it fell back to the default position). The test used to be "the card's crystal chain must equal the layer you are looking at exactly", but **cards are usually created in a deeper folder** — it is plainly drawn on that screen (card lookup is recursive) and was still being rejected.

**1.3.75** · The reader's top bar can be **collapsed**: a new icon at its right end squashes it down to that one icon, freeing a strip the desk can use — the structure window and page windows can now sit where the bar used to be. **The icon rotates 180° between the two states** (arrow up when expanded, meaning pressing moves things up; arrow down when collapsed, meaning pressing brings them back), and it is **always the same glyph** — the tooltip is what explains the state. Expanding again **pushes down** any window that had moved under the bar.

**1.3.74** · Four fixes to 1.3.73 plus one you reported: the embedded mode's resize observer **was never created at all** — a declaration-order error, swallowed by a `catch` that left no trace; embedded mode scaled the vault to the whole screen instead of the tab (card rows overflowed a half-width split); double-clicking the mode button skipped a mode; and that button's refresh missed the re-layout. **And: a card saved into the vault now appears in the structure window immediately** — it used to need closing and reopening (the refresh is now wired to "the vault redrew" instead of being added to each entry point).

**1.3.73** · A third mode, 「**嵌入**」 (embedded): the vault lives inside its own Obsidian tab, covering nothing, and can sit side by side with other tabs. The top-bar button now **cycles through all three** (full screen → floating window → embedded) and names the one you will get. Embedded mode **does not lock your note's scrolling** (the other two do — they sit over the note).

**1.3.72** · Six fixes to windowed mode: **satellites and floating windows were offset** (their coordinates come from the screen, but the layer they live in uses layer-local coordinates — the two differ by the window's origin once it is not fullscreen); **the resize grip stayed on your note after closing the vault** (and only ever accumulated); drag listeners were never unbound (six leaked per open); **the card panel could be taller than the window** (`vh` always measures the viewport) — the CSS now asks how big *this layer* is; **the toolbar was clipped in a narrow window** (✕ included) — it wraps now; and a window wider than the screen could put the grip out of reach.

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
