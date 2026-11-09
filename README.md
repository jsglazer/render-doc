# Render Doc

[![GitHub release](https://img.shields.io/github/v/release/jsglazer/render-doc?logo=github)](https://github.com/jsglazer/render-doc/releases) [![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/jsglazer/render-doc/blob/main/LICENSE) [![Made with Claude](https://img.shields.io/badge/Made_with-Claude-D97756?logo=anthropic)](https://claude.ai)

Render the current Obsidian note as a finished academic paper: typeset with LaTeX through your own preamble, with a cover page, every short citation such as `(Bonica, 2018: 123)` turned into a real biblatex citation, and a bibliography pulled from Zotero. Each render goes into a new folder of its own.

## What it does

- **One command, Render current note.** It opens a dialog, then exports the active note to a new folder holding `<Note>.pdf`, the standalone `<Note>.tex`, `refs.bib`, and a `media/` folder for embedded images. The `.tex` file recompiles as-is inside that folder.
- **Short citations as plain text.** Write `(Bonica, 2018)` or `(Bonica, 2018: 123)` in the body. On render, each one is matched against the `citeshort:` frontmatter of your source notes (notes with a `citekey:` and a `citeshort:`) and becomes `\autocite{citekey}` or `\autocite[123]{citekey}`. The PDF prints exactly `(Bonica, 2018: 123)`: a comma between name and year, a colon before the page, and no "p.".
- **APSA-style bibliography.** References are typeset with biblatex and biber (`ext-authoryear`, configured toward APSA) and list only the works the paper cites: `Bonica, Adam. 2018. “Title.” Journal 62(4): 830–848.`
- **Unmatched citations stay visible.** A parenthetical that looks like a citation but matches no source note, matches two different citekeys, or cites several works at once is left in the text with a yellow highlight, and listed as a warning in the dialog. Turn on **Hide citation alerts** in the dialog to print them as plain text instead, without the highlight (they are still listed as warnings). That switch starts off every time the dialog opens and works in Dev and Submit.
- **Dev and Submit versions.** The dialog's **Version** selector picks one of two preambles. **Dev** is the working draft, with no title page: the title and author in the header, page x of y bottom left, and a date/time stamp bottom right. **Submit** is the copy you hand in: a cover page, then the short title in bold top left, the author top right, page x of y centred, and no stamp. The dialog title sits in an alert box (yellow for Dev, red for Submit), so a draft is hard to mistake for the final copy. Your choice is remembered.
- **No tags in the Submit copy.** A Submit render leaves out every Obsidian tag (`#fix`, `#to-do/later`), including tags in embedded notes, and a line that held only a tag disappears. Dev keeps them as written, printed in dark purple. `# Headings`, numbers like `#123`, links and anything in code or math are not tags and stay. A tag right against other punctuation, like `**#fix**` or `(#fix)`, is not recognised.
- **Excalidraw drawings as pictures.** An **Include drawings** switch in the dialog, on every time it opens and in both Dev and Submit, prints each embedded Excalidraw drawing (`![[Name.excalidraw]]`, `|500` or `|90%` sizes kept, including drawings in embedded notes) as a picture. Render Doc asks the Excalidraw plugin to export it to PNG at render time, so that plugin must be enabled; the dialog warns if it isn't. Turn the switch off to leave drawings out, along with exported `.excalidraw.png` or `.svg` images; the text around them stays. A drawing's own note text never prints. A plain `[[Name.excalidraw]]` link still prints as text.
- **Your preambles, in settings.** Both preambles are editable LaTeX on the plugin's settings page, each with **Reset to default**. Render Doc defines `\DocTitle`, `\DocShortTitle`, `\DocAuthor`, `\DocClass`, `\DocProf` and `\DocDate` from the note before the preamble runs, so a preamble can use any of them.
- **Cover page (Submit).** `\maketitle` (redefined in the Submit preamble) draws an APA-style cover page: the title (wrapped to a centred column), the author, then the class, course number, professor and date at the foot. The values come from the note's frontmatter (`title:`, else the note name; `author:`; `class:`; `coursenum:`; `prof:`; `date:`). Empty lines are left out. A date such as `2026-10-28` is written out as "Wednesday, October 28th, 2026", and a blank `date:` prints today's date. The cover has no header or footer and isn't counted, so the text starts on page 1. A note with none of these fields in its frontmatter gets no cover page at all — the render skips it and starts the text on page 1 (the header still shows the note name and the Default author).
- **References on their own page.** The bibliography starts a new page under a centred **References** heading, with two-thirds of a blank line between entries.
- **Obsidian syntax handled.** Headings, quotes, tables and code blocks typed directly under a line of text still render as headings, quotes, tables and code, though pandoc would otherwise merge them into the paragraph above. Wikilinks become plain text, embedded notes and sections are inlined, images are copied in, `%%comments%%` are dropped, and Virtual Outliner outline lines (`@`, `@@ …`) are stripped.
- **Line numbers that match Obsidian.** A **Line numbers** switch in the dialog prints each paragraph's, heading's, list item's or quote line's Obsidian line number in the left margin, beside its first printed line, so the PDF and the note can be cross-referenced. Line numbers are for Dev renders only: the switch is hidden for Submit, and a Submit render never carries them. Wrapped lines carry no number, and code, math, tables and embeds are never numbered. The choice is remembered for the next render.
- **A table of the note's tags.** An **Include tags** switch in the dialog, just below **Line numbers**, ends the PDF with a page headed **Tags**, after the References. It lists every tag that prints, in document order, with the page it prints on (a link back to it) and its Obsidian line number, the same number the margin shows when line numbers are on. Tags in outline entries, `%%` comments or embedded notes are not listed. Like line numbers, the table is for Dev renders only: the switch is hidden for Submit, which still leaves tags out. In Dev, the dialog's summary shows how many tags were found. The choice is remembered for the next render.
- **Choose the font size.** The body text renders at 12 pt unless you pick another size. Set the default with **Default font size** on the settings page, or change it for one render with the **Font size** dropdown in the dialog, which always opens on the default. The sizes are 8, 9, 10, 11, 12, 14, 17 and 20 pt. LaTeX's standard `article` class only has 10, 11 and 12 pt, so the other sizes use `extarticle` from the extsizes package (included in MacTeX).
- **Optional page break before each `#` heading.** Turn on **Page break before # headings** in the dialog to start each level-one heading (`# Heading`) on a new page, in Dev or Submit. A `#` heading in the first 15 lines below the frontmatter never gets a break, so an opening heading can't leave the title alone on page 1. `##` and deeper headings, `#` lines inside code blocks, and headings from embedded notes are not affected. The switch starts off every time the dialog opens. The delivered `.tex` keeps the breaks when recompiled.
- **Overwrites only with a warning.** If the export folder already exists, the dialog warns that rendering will overwrite it. Rendering anyway replaces the PDF, `.tex`, `refs.bib` and `media/` in that folder and leaves any other files there alone.
- **Shows the result, if you ask.** Turn on **Open export folder** in the dialog (it starts off and remembers your choice) to show the new PDF in Finder when rendering finishes.

## Requirements

- Obsidian desktop on macOS (the plugin is desktop-only).
- [pandoc](https://pandoc.org) and [MacTeX](https://tug.org/mactex/) (`latexmk`, `lualatex`, `biber`), plus `python3`.
- For citations: [Zotero](https://www.zotero.org) with [Better BibTeX](https://retorque.re/zotero-better-bibtex/), and the [Zotero Manager](https://github.com/jsglazer/zotero-manager) plugin version 1.1.15 or later, which supplies the BibLaTeX entries. A note with no resolved citations renders without Zotero.

## Settings

| Setting | What it does |
| --- | --- |
| Default author | Shown on the cover page and in the header. A note with an `author:` field uses that instead. Defaults to `Joshua S. Glazer`. |
| Default parent folder | The render dialog always opens on this folder. `~` means your home folder. Defaults to `~/Library/CloudStorage/Dropbox/_Schar/Classes`. **Choose…** opens a folder picker. |
| Default font size | The body text size the render dialog opens on: 8, 9, 10, 11, 12, 14, 17 or 20 pt. Defaults to 12 pt. |
| Dev preamble / Submit preamble | The LaTeX included in Dev and Submit renders. **Reset to default** (or clearing the box) restores the built-in version. |

### Frontmatter the paper uses

| Key | Used for |
| --- | --- |
| `title:` | Cover page, Dev header and PDF title. Defaults to the note name. |
| `subtitle:` | Submit cover page, centred below the title at 70% of its size. Left off when absent. |
| `titleshort:` | Submit header. Defaults to the title. |
| `author:` | Cover page and header. A string or a list; overrides the Default author setting. |
| `class:` (or `course:`), `coursenum:` (or `classnum:`), `prof:` | Submit cover page, the course number on the line under the class. Left off when absent. |
| `date:` | Submit cover page, written out in full (`2026-10-28` → "Wednesday, October 28th, 2026"). Today's date when blank. |
| `cite-sources:` | Where source notes are searched (see below). |

## Usage

1. Open a note and run **Render Doc: Render current note** from the command palette.
2. In the dialog, choose the **Version** (Dev or Submit) and, if you want something other than the default, the **Font size** for this render.
3. Check the **Parent folder** (it starts on the Default parent folder setting; **Choose…** opens a folder picker) and the **Folder name** (it defaults to the note's name plus the version, such as `TheoryHypo Dev`, and the suffix follows the Version choice). If that folder already exists, a warning says rendering will overwrite it.
4. For a Dev render, turn on **Line numbers** if you want Obsidian's line numbers in the margin, and **Include tags** if you want a table of the note's tags at the end. In either version, turn on **Page break before # headings** to start each top-level section on a new page, **Hide citation alerts** to drop the yellow highlight from unmatched citations, **Include drawings** off to leave Excalidraw drawings out, and **Open export folder** if you want Finder to show the PDF afterwards.
5. Read the summary: how many source notes were found, how many citations resolved, and any left unmatched, with the reason for each.
6. Click **Render**.

### Where source notes are searched

| Frontmatter of the note being rendered | Folders searched |
| --- | --- |
| `cite-sources: Classes/2026-B/Sources` (a string or a list) | Exactly those folders and their subfolders. Use `/` for the whole vault. |
| no `cite-sources:` | The folder tree one level above the note's folder, plus the nearest `Sources` folder sitting beside any folder above the note, such as `Classes/2026-B/POGO 801/Sources` for a note in `POGO 801/Assign/Asgn03/`. A `Sources` folder at the vault root doesn't count. |
| no `cite-sources:`, and that level is the vault root | Only the note's own folder tree, with a warning. The vault root is never searched unless you ask for it. |

### Citation rules

- A citation is one parenthetical with no nested parentheses, at most 120 characters, starting with an uppercase letter, then `, YYYY` (optionally with a letter, as in `2018a`), then optionally `: locator`.
- Text that starts lowercase, such as `(see Section 2, 2024)`, is never treated as a citation.
- Matching is exact once leading and trailing spaces are trimmed, runs of spaces are collapsed and Unicode is normalized. `Shor & McCarty, 2011` does not match `Shor and McCarty, 2011`.
- Citations are never read inside code, math (`$…$`, `$$…$$`) or Markdown links.
- Citing several works at once, as in `(Bonica, 2018; Shor and McCarty, 2011)`, is not supported. The parenthetical is highlighted and flagged instead.
- If a cited key isn't in Zotero, or Zotero isn't running, nothing is rendered and a notice lists the missing keys.

## How it works

Render Doc converts the note to pandoc Markdown inside Obsidian, writing each citation as raw LaTeX. It then hands a staging folder in `$TMPDIR` to a small bundled renderer. The renderer is installed to `~/Library/Application Support/render-doc/renderer/` on first use. It runs pandoc to produce a standalone `.tex` file, then `latexmk -lualatex` with biber, and copies only the deliverables into the new folder. LaTeX's intermediate files stay in the staging folder, which is deleted after a successful render and kept after a failure, with its log path shown in the error notice.

TeX Live's universal `biber` binary fails to start on some macOS versions ("extracting arm64 binary with lipo failed"). When that happens, Render Doc extracts the native slice once into `~/Library/Caches/render-doc/` and uses that copy.

## Development

```sh
npm install
npm run build      # type-check and bundle main.js
npm run lint
npm test           # unit tests plus the real-toolchain integration test
```

The integration test (`tests/integration/`) renders a fixture paper with the real pandoc, latexmk, lualatex and biber and the built-in Dev and Submit preambles, all in a temporary folder. It checks the cover page, the References page, the Submit header, the Obsidian line numbers, the page breaks before `#` headings, the tag table's pages and line numbers, and renders at 10 pt and 20 pt (the latter through `extarticle`). It skips itself when any of them is missing.

## License

[MIT](LICENSE)
