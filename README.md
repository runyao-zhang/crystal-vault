# Crystal Vault

Turn a folder of Markdown cards into a **living crystal vault** — see the structure of what you know, follow the links between ideas, read source material side by side, and test yourself on what you wrote.

Your cards stay plain Markdown in plain folders. Nothing is locked in a database, and nothing leaves your vault.

> 中文说明见 [README.zh.md](README.zh.md)。

---

## Why not just the graph view?

The graph view answers **"what is this note connected to?"** It starts from notes, the links are the subject — and **folders do not appear in it at all**. If you organise your knowledge by subject and chapter, the graph mixes all of it into one cloud. That is why so many people find it beautiful and useless: they cannot find the line they organised their knowledge along.

Crystal Vault answers a different question: **"what is in this collection, and how far along is it?"** It starts from folders. The structure *is* the subject.

It is not a better graph. It is a different starting point.

## What it does

**A folder is a crystal.** Every subfolder under your card folder becomes one crystal on the ring. Nested folders become nested crystals — drill in and out, and the breadcrumb always tells you where you are.

**Links become shape.** Write `[[another card]]` in a card's body and a line appears between them. The storyline view lays every card out by link topology, so you can see what points at what. Links `A → B` and `B → A` are drawn as **one line with arrows at both ends** — one arrow means one-way, two means mutual.

**Orphans are a signal, not an error.** A card nobody links to and that links to nobody is flagged. It is not a mistake; it is a card that has not been connected to anything yet.

**Read and take notes at the same time.** The built-in reader opens PDFs, images and Markdown side by side, and lets you write a card without leaving the page. Choose a page of a PDF, and a card can keep a link back to exactly that page.

**Keep the structure beside you, not behind a mode switch.** The reader's **Structure window** puts the vault's structure in a *window on the same desk* as the document you are reading — not a screen you switch to. Switching away is *leaving*: you come back and have to find your line again. A window beside you is just a glance.

Drag a line between two cards in that window and it writes a real `[[link]]` into the note — with a field for *why* you linked them, and one undo.

**One page, one window — arranged by you.** The reader's **desk** spreads a document into windows you can drag and resize, laid out however you like, and they are still there next time you open the reader. The **dock** button in the top bar is the rack for them: drag a window onto the strip on the left and it is stowed, leaving an entry you can click to bring it back — stowed windows survive closing the reader. The same button tucks the right-hand column away so you can read wider.

**Hang a web page beside your reading.** The `+` at the top of the dock opens an **external tab**, so a course site or a docs page can sit next to the page you are reading, draggable and stowable like any other window.

> ⚠️ Whether a site *can* be embedded is decided by that site, not by this plugin — sites may refuse to be framed (Google does, across the board). That is a browser rule and there is no way around it. So the window always carries an **Open in browser** button: embeddable sites work as windows, and non-embeddable ones still have a way out. You never get a dead white box.

**Recall before you peek.** In recall mode every card's content is hidden until you click. Say it to yourself first, then check. Switch to review mode when you just want to read through.

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
