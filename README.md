# Crystal Vault

Turn a folder of Markdown cards into a **living crystal vault** — a place where you can see the structure of what you know, follow the links between ideas, and test yourself on what you wrote.

Its real home, though, is the **literature reader**: read PDFs, images and Markdown on one side, and build the structure out of what you read on the other. Finish a chapter and the chapter's structure is already there. The reader's **desk** lays it out as draggable, resizable windows; the **Structure window** keeps the vault's structure beside the page you are reading, so you never have to leave it.

Your cards stay plain Markdown in plain folders. Nothing is locked in a database, and nothing leaves your vault.

> 中文说明见 [README.zh.md](README.zh.md)。

> **Note on the interface:** the plugin's UI labels are currently **Chinese only** (the reader button says 文献, the structure window says 结构窗, and so on). This README names those labels verbatim so you can find them. Localisation has not been done yet.

---

## The main thing: the reader's desk

The reader has two layouts. **Grid** spreads N pages across one screen (for scanning). **Desk** gives each page its own window — and Desk is the one you will live in, because it hands the *"I want to see several things at once"* problem back to you.

- **One page, one window, arranged by you.** Drag the title bar to move it, the corner grip to resize it — and **the layout is still there next time you open the reader**.
- **Not just document pages.** Cards, structure and web pages are all the same kind of window, sharing the same drag / resize / stow.
- **The dock** (button in the top bar). A strip slides out on the left and acts as the rack for those windows: drag a window onto it — or press its **收纳 / Stow** button — and it is put away with an entry left behind. Click the entry to bring it back. **Stowed windows survive closing the reader.**
- **External tabs** (the `+` at the top of the dock). Type a URL and a course site or docs page sits beside the page you are reading, draggable and stowable like any other window.

  > ⚠️ Whether a site *can* be embedded is decided by that site, not by this plugin — sites may refuse to be framed (Google does, across the board). That is a browser rule and there is no way around it. So the window always carries an **Open in browser** button: embeddable sites work as windows, and non-embeddable ones still have a way out. You never get a dead white box.

- **The right-hand column tucks away too.** The same button squeezes the notes column out of the way when you want to read wider.

## The Structure window: build structure while you read

This is the half that pairs with the desk.

The annoying part of reading is *"what does this actually look like in my vault?"* — switch away to check, and you come back having lost your line. The Structure window puts that structure in **a window on the same desk**, right beside the page:

- **A glance, not a departure.** Switching away is *leaving*; a window beside you is just a glance.
- **Draw a link and the note changes for real.** Drag a line between two cards and it writes a real `[[link]]` into the note — with a field for *why* you linked them, and one undo.
- **Pin it to one crystal.** You choose which crystal it watches, and it is still watching it next time.

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
2. Click the gem icon in the ribbon (or run the command **Crystal Vault: Open**).
3. Make a subfolder inside your card folder. That is a crystal.
4. Write a card. See the format below.
5. Link cards to each other with `[[double brackets]]` and watch the structure appear.
6. Hit **文献 / Reader** in the top bar, pick a PDF, image or Markdown file — then switch to **Desk** and open a **Structure window**. That is what using this thing actually looks like day to day.

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
