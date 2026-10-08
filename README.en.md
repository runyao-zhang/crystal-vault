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
Desktop mode:
<img width="1862" alt="Crystal Vault overview" src="https://github.com/user-attachments/assets/2da1ebb8-bdd6-4d82-bce8-88ce35194592" />

Storyline mode:

<img width="1677" alt="storyline mode" src="https://github.com/user-attachments/assets/65bc91ff-d3d9-4cc0-904f-b8e44be4c3d9" />


Its real home, though, is the **literature reader**: read PDFs, images and Markdown on one side, and build the structure out of what you read on the other. Finish a chapter and the chapter's structure is already there. The reader's **desk** lays it out as draggable, resizable windows; the **Structure window** keeps the vault's structure beside the page you are reading, so you never have to leave it.

Your cards stay plain Markdown in plain folders. Nothing is locked in a database, and nothing leaves your vault.

> 中文说明见 [README.md](README.md)。

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
- **If the bar is in your way, fold it.** The **▲** at the far left of the bar is a master switch, and **its colour is the state**: **blue** = the buttons are all out; **white** = they are all folded away and only that one button is left. Click again and they all come back. Whether it is folded is remembered, so you do not have to fold it on the next open.

### Draw: view / write

The 「**画线：看 / 写**」 toggle in the top bar decides **what dragging a line actually does**:

| Mode | What dragging a line does |
| --- | --- |
| **看 (view)** — default | Draws a **gold** line. It lives in the library's own view state and **does not touch your notes at all**. |
| **写 (write)** | Writes a **real `[[target card]]`** into the source card's body — the note changes. The line is **blue**. |

That is what the two colours mean: **a gold line is a way of looking; a blue line is something that genuinely exists in your notes.**

Delete a blue line in 写 mode and what you are deleting is **the `[[link]]` in the card's body**, not something drawn on screen. Get it wrong and there is one undo (the same undo as the card editor's).

### Right-click: three places, three results

- **A line you routed by hand is written into that card's own frontmatter** (a field called `晶体接法`) — so it travels with the note: renaming it, moving it to another folder, or **zipping it up and sending it to someone** all keep it. Lines you never touched are not written; for those, geometry is enough.
- **Which side a blue line attaches to is decided from the geometry by default**: two cards stacked one above the other run bottom-to-top, two side by side run right-to-left. To route one differently, drag it from the side you want in **write** mode — **that one line then follows your choice** (anything dragged by hand always beats the default).
- **Right-click a card → hide every link going into and out of it.**
  When one card has a dozen lines running through it, clearing them all out leaves the rest of the structure readable at a glance. **Right-click it again to bring them back.** While anything is hidden, a 「**显示全部**」 (Show all) button appears in the top bar and restores everything at once.
- **Right-click on a gold line → enter link-edit mode.** Two buttons appear in the top bar, 「**选框：线**」 and 「**选框**」; drag to box in some lines, and a 「**删除实线（N）**」 (Delete lines) button appears. (Click the first one and it turns into 「**框：卡**」 — that mode is for **moving a batch of cards at once**, see below.)
- **Right-click empty space (in 写 mode) → the same 「选框」 button, but this one boxes *blue* lines.** What appears then is 「**删除蓝线（N）**」 — and pressing it removes the matching `[[link]]` **from the card's body**.

> One detail: the **card right-click is opened by 写 mode**. In 看 mode, right-clicking a card still does the old thing (enters link mode). But **once a card is hidden, right-clicking it works in either mode** — otherwise switching back to 看 would leave the hidden state reachable only from the top-bar button.

### Boxes: tidy a region away without pretending the links are gone

The dashed rectangles are **boxes**. **Every sub-crystal gets one automatically**, named after its folder; a box can be **renamed** (click the name) and **collapsed** (click the little triangle on its left).

There are two colours of box, and they mean different things:

| | What it is | Container? |
| --- | --- | --- |
| **Gold** (dotted, warm) | a **sub-crystal** — grown from a folder | **yes** — see below |
| **Blue** (dashed, cool) | a box **you drew** with 「＋ 框」 | no — cards move in and out freely |

**Gold boxes nest, one per level** (since 1.3.88). A folder's box contains that folder's own cards *and* a box for each of its subfolders, so the hierarchy is visible all the way down. Inside a box:

```
┌ A ─────────────────────────────────┐
│  [A's own cards]  ┃  [B1's cards]  ┊  [B2's cards] │
└───────────────────┸───────────────┸────────────────┘
          coral line ↑        gold line ↑
      (this level ↔ subfolders)  (sibling ↔ sibling)
```

- **Coral `#FF6B6B`** separates a folder's **own cards** from its **subfolders**.
- **Gold** separates two **sibling** subfolders from each other.

**A gold box is a container.** Cards inside it cannot be dragged into another gold box, nor across the coral line into the parent's own cards; the card **stops at the boundary**. A **blue box cannot be moved or resized out of the gold box it sits in** — but it is not a container itself, so cards still move in and out of it. **Dragging a gold box carries everything inside it**, blue boxes included.

> **A blue box you drew belongs to the layer you drew it on.** Make one inside 「Python/数据分析」 and it is not there when you switch to 「Python/爬虫」 — go back and it is exactly as you left it. It did not used to work that way: boxes were global, so switching folders left the other layer's boxes sitting on screen.

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

## A fourth mode: outside Obsidian entirely (the floating companion)

All three modes above **stay inside Obsidian's window** — they are overlays the plugin draws in its own process. To sit **on top of Edge, WeChat, Word** (reading something in a browser with read-and-note still hanging beside it) you need an OS-level window, and **a plugin cannot make one**: an Obsidian plugin sandbox has no route to it.

Hence **CrystalFloat** — a **separate small program**:

| | Size | Where from |
| --- | --- | --- |
| Crystal Vault (this plugin) | ~2 MB | the plugin store, unchanged |
| CrystalFloat (the companion) | ~107 MB | [another repo's Releases](https://github.com/runyao-zhang/crystal-vault-float/releases/latest) |

Once installed **there is no path to configure** — the plugin finds it on its own. Two commands appear in the palette:

- **Crystal Vault: Floating window: read and note**
- **Crystal Vault: Floating window: structure window**

The window has a drag strip along the top; on the right are **on-top toggle / minimize / close**.

> **With no companion installed, everything above still works** — only those two commands are missing. Clicking them tells you so in plain words and offers a download link; it never fails silently.

### What "on top" beats, and what it doesn't

**Beats**: Edge, Chrome, WeChat, QQ, Word, Explorer — regular windows, maximized included.

**Does not beat** (this list is honest):
- Exclusive-fullscreen apps (fullscreen video, games)
- **Another always-on-top window** — in that band, whichever was activated last wins. Raycast (on top by default) or certain screenshot/recording tools will collide with it
- UAC elevation prompts (those live on the secure desktop; nothing gets above them)

### Three known trade-offs

1. **Editing a card body inside the floating window uses a plain textarea**, not Obsidian's live-preview editor — that component cannot cross a process boundary. Turning pages, dragging cards and writing notes all work; only the editing experience is downgraded.
2. **`[[wikilinks]]` and callouts inside a floated document render as plain text**, and extensions like Dataview do not apply there.
3. **Don't drag the same card in both windows at once** — card coordinates are written with debouncing and no baseline comparison, so a simultaneous edit silently loses one side. Sequential edits are fine.

## Install

### From the community directory

Search for **Crystal Vault** in *Settings → Community plugins → Browse*.

### Manually

Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/runyao-zhang/crystal-vault/releases/latest) and put them in `<your vault>/.obsidian/plugins/crystal-vault/`, then enable the plugin in *Settings → Community plugins*.

### Problems, questions, requests

**QQ group: 831440768** — a Chinese-language group; it is where this plugin's users actually are, so it is usually the fastest place to get an answer.

You can also open an [issue](https://github.com/runyao-zhang/crystal-vault/issues) on GitHub.

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

**1.4.9** · Fixed: **the "open the card after saving" feature from 1.4.8 never ran.**

A scoping mistake: `viaHost` was declared **inside** a `{ }` block while the new code read it **outside** — `const` is block-scoped, so reading it there is a `ReferenceError`.

Worse, that code sat inside a `try/catch`, so **the error was swallowed**: no card window, and not a single line in the console.

That `catch` now logs with `console.error` — the same failure will at least be visible next time.

---

**1.4.8** · Changed: **in desk mode, saving a card puts it in front of you, ready to keep writing.**

Saving used to create the card while nothing moved on screen — you had to go find it in the
vault yourself.

Now, in **desk mode**, saving a card will

- **open it as a window**, pinned to the bottom-right (the window's **right edge** 5% in from
  the desk's right edge, its **bottom edge** 5% up from the bottom);
- and **drop straight into edit mode**, cursor in the body, ready for the next sentence.

Desk mode only. Grid mode is "N pages at once, for scanning" — forcing a window open there
would yank you out of the page you are reading.

---

**1.4.7** · Fixed: **the three capabilities added in 1.4.6 never reached the reader.**

`mount()` takes **named parameters**, and the line inside it that builds the reader is a
**hard-coded list**. 1.4.6 added `storyHost` / `cardHost` / `onCardCreated` to the reader's
parameter list but forgot to list them on `mount` — and a field that isn't listed is
**silently dropped**, with no error on screen and none in the console.

The symptom was the companion behaving as before: clicks that did nothing, cards that
couldn't get out.

Two omissions from the same release are fixed as well:

- Clicking the structure window inside the companion's read-and-note window used to
  **do nothing** (the capability said "hand it to the host", but the host's structure
  window only exists in **another** window). It now **opens or focuses that window**, and
  can push a "show this crystal" into it when it's already open.
- Clicking a node inside the companion's structure window used to **hand the card to
  Obsidian**. It now **opens a window of its own for that card** — which is what was asked
  for.

⚠️ Needs **CrystalFloat 1.0.9**.

---

**1.4.6** · Changed: **the floating companion mounts components directly, and every card gets its own window.**

Nothing visible changes **inside the app** — this release adds the three host
capabilities the companion needs:

- **The structure window no longer goes through the desk layer.** It used to bring the
  whole desk layer along with one full-size structure window on it; now the structure
  window component is **mounted straight into the window** and the desk layer is not
  involved at all. (1.4.3 tried this once, but it also stripped the read-and-note
  window's navigation — this time nothing else is touched.)
- **Every card gets its own system window.** Click a card in the card box or the
  structure window and the companion opens a **separate window for that card**: above all
  other windows, **not minimized along with the companion window**, and draggable outside
  it.
- **"New card" is a window of its own**: it opens as a blank card, and once you save, it
  becomes that card's window.

⚠️ Needs **CrystalFloat 1.0.5**, from the
[companion's releases](https://github.com/runyao-zhang/crystal-vault-float/releases/latest).

---

**1.4.5** · Changed: **the reader's top bar is rearranged, and the read-and-note column is gone.**

The top bar now reads (new items in parentheses):

```
‹ Back │ Swap  Desk  + Page  Dock (File ops) (New card) Card box Scratch Storyline Structure  Collapse
        └ in desk mode: prev / next / − / 100% / + are hidden
        └ in page-grid mode: "+ Page" is hidden
```

**Removed**: the document name, the page counter, and the `read-and-note` toggle.
The name and the counter both described **the document you just picked yourself** —
saying it again in the bar is repetition, and the page number is already on every page.

**Two new buttons**:

- **File ops** — a dropdown holding the old five: new crystal / delete crystal / delete
  card / rename card / rename crystal. **Nothing about them changed** — they simply moved
  from the right-hand column up to the bar.
- **New card** — opens, to its right: a box for the body → `More` (card name / concept /
  source / target folder) → `Save to vault`. **Leave the name empty and it is taken from
  the body's first line**, so the default flow is "type, then save".
  **Works with no document open** — the card lands in the folder you last picked
  (or the card root if you never picked one).

**The read-and-note column is gone entirely**; nothing in it was lost:

| Was there | Now |
| --- | --- |
| The five file operations | The `File ops` dropdown |
| Name / concept / source / body / Save | The `New card` box |
| The "will be created in" folder picker | Inside `More` |
| The scratch-note name box | Moved into a flyout, **still works** |

**One thing was deleted**: `✎ Write in the editor` (and its "Back = trash the card I just
created" flow). It was a second, parallel way to create a card — and that one left a
half-finished card behind in the vault.

⚠️ This release **only touches the in-app reader**. The floating companion was not touched
this time — how its two windows should split is still open.

---

**1.4.4** · **Reverted: the floating windows go back to the 1.4.2 shape.**

1.4.3 made the structure window **mount the component directly** (bypassing the desk layer). Cleaner on paper, wrong in use — so this goes back to the 1.4.2 shape: **two windows, and the structure window one is "the desk layer with a single full-size structure window on it"**.

The 1.4.3 changelog entry below is **left as it was** — that version did ship. This one withdraws it.

⚠️ This needs **CrystalFloat 1.0.4**.

---

**1.4.3** · Changed: **what floats out is the component, not the whole desk mode.**

1.4.2 got the structure window **wrong**: it opened the entire desk layer with one full-size structure window sitting on it. Measured, the window actually contained:

```
.kb-v13-trigger       976x80     the vault's entry button (library leftovers, unrelated to floating)
.kb-v13-reader-desk   976x778    the whole desk layer container
  .kb-v13-desk-win   1378x1180   a desk window with its own bar 「结构：X 收纳 ✕」 and a resize grip
```

That is the desk mode pulled out whole, not the structure window. The component is now **mounted directly** — the desk layer is not involved at all:

```
#float-story-host      906x724
  .kb-v13-embedstory   906x724
    .kb-v13-stage      906x724   the node canvas
    .kb-v13-embedbar   304x34    the structure window's own top bar
```

Both windows also drop **Crystal Vault's own entry button** (pointless in a floating window — the companion does not carry the vault layer).

The read-and-note window additionally drops **the vault's own navigation** (desk / +page / dock / card box / storyline / structure window) — those belong to the whole library, not to this component. Especially the desk button: pressing it pulls the desk layer into that window. The reader's own controls (back / switch document / page turning / zoom / read-and-note / fold top bar) all remain.

---

**1.4.2** · Changed: **the two features are now two separate windows, side by side.**

1.4.0/1.4.1 used one window switching between modes, and the "structure window" command **dragged the whole desk layer out with it** (auto-adding a PDF window on top of that). That is not what was asked for. Now:

| Command | What opens |
| --- | --- |
| **Floating window: read and note** | The document plus the note pane on the right. The top strip gains a **note-pane-only** toggle that collapses the document area so the note pane fills the window — handy pinned to one side of your screen. |
| **Floating window: structure window** | **The structure window, and nothing else.** No desk layer showing through, no auto-added PDF window, and the reader's own top bar is tucked away. |

The two commands **do not affect each other**: the second one no longer closes the first, and no longer kills-and-restarts. Each window keeps its own position and its own state.

Also fixed something that **had never worked**: the floating windows' path for reading prefs and view state was broken (the contract requires a synchronous read, the bridge is async, and the first version leaked a Promise through) — so "set it up in Obsidian, then float it" **never actually succeeded**. It does now.

⚠️ This needs **CrystalFloat 1.0.2**.

---

**1.4.1** · Fixes **the two floating-window commands going dead after you close the window once.**

Caught the same day 1.4.0 shipped. The companion **did not exit** when you clicked ✕ — it stayed alive as an invisible process, and it **kept holding the single-instance lock**. Every later "floating window" command was therefore rejected cleanly in the background (exit code 0, not even a flicker), so all you saw was **nothing happening** — and the diagnostic log said only "companion exited", never a word about a lock.

Closing the window now quits it. And **launching the companion by double-clicking it works now too**: without a `--bridge` argument it used to sit there unable to reach the vault; it now reads the discovery file the plugin leaves behind.

⚠️ **This needs a fresh companion download** (CrystalFloat 1.0.1). Uninstall or close the old one first — it is the process holding the lock. If the old one is still open after installing, end `CrystalFloat.exe` in Task Manager and try again.

---

**1.4.0** · New: **read-and-note and the structure window can now float outside Obsidian.**

The three modes in settings (full screen / floating window / embedded) **all stay inside Obsidian's window** — they are overlays the plugin draws in its own process. This version adds a **fourth**: a genuinely separate window that **sits on top of Edge, WeChat, Word**.

It has to be a **separate program** (CrystalFloat, ~107 MB), because a plugin sandbox cannot create an OS-level window — a platform limit, not laziness. Once installed **there is no path to configure**; the plugin finds it on its own, and two commands appear: **Floating window: read and note** and **Floating window: structure window**.

**With no companion installed, everything above still works** — only those two commands are missing.

Three trade-offs worth knowing up front (the full list is above):

- **Editing a card body in the floating window uses a plain textarea** — that component cannot cross a process boundary. Turning pages, dragging cards and writing notes all work.
- `[[wikilinks]]` and callouts inside a floated document render as plain text.
- **Don't drag the same card in both windows at once** (card coordinates are debounced writes with no baseline comparison, so a simultaneous edit silently loses one side).

---

**1.3.97** · Fixes **an unreadable error when you press 「编辑」 on a desk card while no note is open.**

The plugin mounts Obsidian's **native editor**, and Obsidian **does not export the editor class** — it can only be **borrowed from a live note instance**. The old test required "at least one Markdown note must be open", a precondition that was **never written down anywhere** — and your usage is probably **never opening an `.md` tab at all** (you read inside the crystal vault). So every press fell into the degraded path, with a developer-facing error attached.

There are now **three ways to borrow it**, tried in order, first one that works wins:

1. **a live Markdown instance** (the original path, with the test relaxed)
2. **Obsidian's view-type table** (`viewRegistry.viewByType`) — **no note needs to be open**
3. **the one borrowed last time**, still valid for the rest of the session

When all three fail, the message is in plain language now: it says **why** and **what to do next**, and points out that the input box below **still works** — this is a fallback, not an error.

**1.3.96** · Fixes **deleting a blue line and the line staying there** — surviving a restart, even though **the file no longer contains it**, and turning into a **ghost**.

The cause was that **working out the relationships read into the frontmatter**. The `晶体接法` field looks like this:

```yaml
晶体接法: ["[[花式索引和布尔索引]] b t"]
```

Storing the target as a `[[wikilink]]` is **deliberate** — renaming that card makes Obsidian rewrite it too, so the attachment never loses its target. But the step that decides whether two cards are related searched for `[[…]]` **across the whole file**, so that frontmatter entry **grew an edge of its own**:

- deleting a blue line removes the link from the **body**, and never touches the frontmatter → **the line stays**
- it lives in the file → **it survives a restart**
- when the target card is not on this layer → it becomes a **ghost**

Relationships now read **the body only**. This strips just the frontmatter block at the **very top of the file** — a horizontal rule (`---` on its own line) partway down the body is unaffected.

**1.3.95** · In the Structure window and the storyline, **right-clicking empty space in 写 (write) mode no longer pops up the hint bar**.

It used to say: `点顶栏「选框」，然后拖出方框 · Esc 退出`. It appeared in the state "right-clicked empty space, entered delete-blue-line mode, nothing selected yet" — with nothing selected on screen, that line is just noise.

**The other three states keep theirs**, in particular the one for right-clicking a **gold line in 看 (view) mode**: the top-bar 「选框」 button is the only way into gold-line marquee selection, and without that line you just sit there staring at the lines.

**1.3.94** · Fixes **a box reverting to an old position after you quit Obsidian and reopen** (1.3.93 did not get to the bottom of it; this is the root cause).

The clue was yours: *"as long as I do not close Obsidian everything is fine; close it and open it again and the bug is back."* Only one thing satisfies both halves — **the stale copy is what gets saved.**

The cause: **the two persistence paths were reading different objects.**

Entering the storyline or the Structure window means entering the **camera stage**, which opens a **draft**; your edits all land in that draft. But the function that saves the view state **read `state.view` only — it never looked at the draft**. So while the storyline was open, every "save" wrote **the old state, the one the draft had not been merged into yet**. The sidecar (`.crystal-boxes.json`) reads draft-first.

So: **the screen is correct** (it reads the draft), **the sidecar is correct**, and **only the view state is stale**. The two paths were bound to diverge — and the divergence **only shows up after a restart**.

That function now uses **the same expression as "commit the draft"** (`{ ...view, ...draft }`), so the two paths read one and the same thing and cannot diverge.

> This also explains why 1.3.93's timestamps could not save you: that version makes "newest wins" work, but **the newer copy was never written into the view state at all** — it sat in the draft the whole time.

**1.3.93** · Fixes **a blue manual box jumping back to an old position when you quit Obsidian and reopen** — while everything looks correct as long as Obsidian stays open.

In your words: *"as long as I do not close Obsidian everything is fine; close it and open it again and the bug is back."* Those two halves pin it down: **the follow was not broken, the write never reached the file.**

The cause is the persistence rule itself: the sidecar (`.crystal-boxes.json`) was **"the file always wins"**. That rule carries its own stated precondition — **the file is always the newer of the two**. It is not:

> Writing the sidecar is **asynchronous**, and the flush on the close path **is never awaited** (`closeFullscreen` is an entirely synchronous function). If that write does not finish, the file stays at its old value — while **the view state is written synchronously, and is newer**.

So on open the stale file overwrites the newer state: **the box jumps back, the cards stay where they were**, which reads as *"the cards are outside the blue box"* — **and only after a restart**.

Every box now carries a timestamp, and opening the vault **compares them box by box — newest wins**:

- the file is not older than mine → the file wins (**on a tie the file wins too**; it is the copy meant to travel between machines);
- mine is strictly newer → mine stays, **and the file is rewritten to match** (otherwise it would never catch up);
- neither side has a timestamp (data written before 1.3.93) → **mine wins**. Mine is what you last saw on this machine, and the file is precisely the copy that may have lost a write.

> **A lost write can no longer destroy your layout** — whatever the reason it was lost.
> The box in your vault (m:6) is right now in exactly that state — view state says 2667, sidecar says 2730 — and **this version will simply take the newer one on open.** You do not have to drag it again.

**1.3.92** · **Dragging a gold box now carries blue boxes stored on deeper layers.** (This is the one the previous versions kept missing.)

**Blue boxes are stored per layer** — wherever you drew it is where it is recorded. Gold boxes, since 1.3.88, exist **on every layer**. Put those two together and you get a shape you hit constantly:

> You are on a **shallow layer** (say 「机器学习」) and drag the gold box of a **deeper folder** (say 「…/准确度的陷阱与混沌矩阵」). That moves the cards in that folder — but the blue box you drew for that folder is stored **on the deeper layer** (that is where you went in to draw it), so it is not on this screen at all and **nothing follows it**.
>
> Then you open the structure window (pinned to that deepest layer) — and **the cards are already well outside the blue box**.

It now goes by **folder containment**: drag a gold box and every blue box drawn **inside it** — on its own layer or any layer beneath — follows, as long as any of its member cards moves in that drag.

> Those boxes are **not drawn** on the shallow layer (they belong to another layer; drawing them would be ghosts), so you do not see them move — but **they are already in the right place** when you open the structure window, which is what matters. The write-back was fixed along the way too: on a cross-layer drag the sidecar goes to **the box's own layer**, not to the one you happen to be standing on.

**1.3.91** · Three fixes, all around dragging a gold box:

**① Blue manual boxes still did not follow a dragged gold box.** The test had been wrong all along, and wrong in exactly your case:

It asked *"are **all** of my members inside you?"* But when a blue box spans **two sibling sub-folders**, its common ancestor **is the layer you are standing on** — and by your own decision the current layer gets no gold box. So no box can hold it, the test answers false, and the code falls back to an even older rule that looks at *where the blue box is drawn*. **Your hand-drawn box is bigger than the tight gold box, so its centre lands outside** — and it silently doesn't follow. A blue box holding one **imported** card lands in the same place.

It is now one **exact** sentence: **the cards that move in this drag are precisely the ones under that gold box.** If **any** of the blue box's cards is among them, it follows; if none is, it stays put. Nothing about how you drew it, how big it is, or whether it is collapsed.

> Along the way: **a collapsed blue box now follows too** (its bar sits at the centroid, so the offset has to come from where it actually is — it used to be skipped entirely).

**② Gold boxes were getting a doubled identity.** The same folder produced **a different id depending on which layer you were looking from** — and a box's name and collapsed state are two global tables keyed by id. So *"I collapsed it on this layer and it unfolded itself on the next one"*, and the same for renaming — with nothing said. The cause was the recursive box walk appending the full path to the parent path a second time.

**③ The file that holds box positions silently drops a write.** This one came out of **your own vault's data**:

```
data.json (view state, written on every drag)   m:6  x=3003  bottom=294
.crystal-boxes.json (sidecar, 11:55:52)         m:6  x=2709  bottom=252
```

The two disagree, and the rule is **the file wins** — so the next time the vault opens that box **jumps back** while the cards stay where they are, which reads as *"the cards are outside the blue box"* **whether or not you dragged anything**. The cause: the close path's flush **is never awaited** (`closeFullscreen` is an entirely synchronous function), and the pending-write queue was emptied *before* the write landed. It now **only leaves the queue once the write succeeds**, and the coalescing window went from a 700 ms debounce to **a single tick** (several writes from one release merge; anything across ticks goes out immediately).

**1.3.90** · **The structure window's top bar can now be folded away entirely.** The **▲** at its far left is a single two-state button, and **its colour is the state**:

- **Blue** = every button in the bar is out (the default, same as before);
- **White** = **all of them are folded away**, leaving only that one ▲; click again and they all come back.

Whether it is folded is **remembered**, so you do not have to fold it again on the next open. (This replaces the 1.3.84 ▲/▼ pair, which folded only the crystal name — that was finer-grained, but this one button now takes the name and the buttons together, so ▼ is gone.)

> **Why folding away the crystal switcher is allowed here** (an earlier version's comments forbade it outright): **the way back is in the same place** — the same ▲ restores everything. What that rule was guarding against was an entry point that is invisible exactly when you need it **with no way back**; this is not that. The floor is unchanged: **this ▲ is never itself folded away**, because it is the only way to bring the bar back.

**1.3.89** · Two fixes, both fallout from 1.3.88:

**① Blue manual boxes still did not follow when you dragged a gold box.** In your words: *"by the time I open the structure window the cards have moved well outside the blue box, but the box still counts them as members — so moving the blue box drags along cards that aren't physically in it."*

The cause was the test 1.3.88 used: it asked whether the blue box's **centre** fell inside the gold rectangle. But **a blue box is hand-drawn and is usually bigger than the tight gold box** — once it extends past one side, its centre lands outside, and that drag **found no followers at all**, silently.

It now goes by **membership**: which gold box a blue box lives in is decided by whether **all the cards it holds** are inside that box. That has nothing to do with how you drew it. Two things come along with it:

- **Dragging an outer gold box now carries blue boxes living further in** (dragging A moves the cards inside C too).
- The "a blue box may not leave its gold box" rule uses the same test — it had exactly the same flaw, silently dropping the constraint once the blue box was drawn a little larger.

**② A gold solid line now sits under a gold box's title bar.** With boxes nested, there was nothing separating a box's name from the data below it — you could not tell at a glance whether that line was *this* box's header or something belonging to a sub-box inside.

**1.3.88** · **Gold boxes are split up, one level at a time.** A gold box used to swallow the folder's **entire subtree** — so when A contained B1 and B2, and B2 contained C, the screen showed one single box for A with all four levels of cards flattened together. **The hierarchy was invisible**, which is the one thing this window exists to show.

Now **every folder in the subtree gets its own box**, so they nest naturally. Inside a box, the layout splits left to right the way you asked:

```
┌ A ─────────────────────────────────┐
│  [A's own cards]  ┃  [B1's cards]  ┊  [B2's cards] │
└───────────────────┸───────────────┸────────────────┘
          coral line ↑        gold line ↑
      (this level ↔ subfolders)  (sibling ↔ sibling)
```

- The **coral `#FF6B6B` line** marks a **change of level**: this folder's own cards ↔ its subfolders.
- The **gold line** (the same gold as the boxes) marks **siblings**: two subfolders side by side. Deeper levels work the same way — C inside B2 gives B2 an internal "B2's own cards ┃ C", again coral.

Three more things came with it, all from the same report:

- **Blue manual boxes now sit above gold boxes.** With gold boxes nesting, a blue box is usually inside several of them; without a higher layer it gets covered by the inner ones.
- **A gold box is a container: cards inside it cannot be dragged into another gold box**, nor into the parent's "own cards" zone (the other side of the coral line). The card **stops at the boundary** rather than sliding in and bouncing back. **A blue manual box cannot leave the gold box it sits in either** — neither by dragging nor by resizing. A blue box is *not* a container, though: cards still move in and out of it freely.
- **Dragging a gold box carries everything inside it.** Cards already did; what was missing was **blue manual boxes** — they store their own rectangle, so they used to stay pinned in place while the cards moved out from under them.

**1.3.87** · **Link attachments now travel with your cards** — zip up a crystal and send it to someone, and the lines run exactly the way they do on your machine. (Reported 10-01: "I zipped it and sent it to a friend; on his side every line is left-right.")

The cause was that **the attachment had always lived on your machine**: it sat in the view state, keyed by *which layer you happened to be standing on*. So a different computer starts empty, and copying the folder elsewhere in your own vault breaks the key too — **the zip never carried it**. It is now written into each card's own frontmatter:

```yaml
晶体接法: ["[[02-中继]] b t"]
```

One entry = "the line to `02-中继` leaves my **bottom** edge and enters its **top**" (`t/r/b/l` = top/right/bottom/left). Only lines you **dragged by hand** are written; anything you never touched is left alone (the default attachment is computed from the layout, so it already comes out the same on any machine). A card with ten hand-routed lines gains roughly 250 bytes.

> - **The target is stored in `[[wikilink]]` form**, so renaming that card makes Obsidian rewrite it too — the attachment never loses its target.
> - **Existing attachments are migrated into the files** the first time you open the vault (one batch per open; the rest follow on later opens).
> - Along the way, a "written to the file but never read back" path got closed: the parser ran twice, and the second pass received already-parsed objects, discarded the whole table as strings — present in the file, invisible on screen, with nothing said.

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
