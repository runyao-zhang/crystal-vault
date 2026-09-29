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
> - **Manual boxes (the ones you drew) are not in the files** — their positions live only on this machine. "Whose box is this?" needs an answer of its own, and this round did not touch it.
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

## Licence

[GPL-3.0](LICENSE).
