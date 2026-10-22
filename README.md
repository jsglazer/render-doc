# Render Doc

[![GitHub release](https://img.shields.io/github/v/release/jsglazer/render-doc?logo=github)](https://github.com/jsglazer/render-doc/releases) [![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/jsglazer/render-doc/blob/main/LICENSE) [![Made with Claude](https://img.shields.io/badge/Made_with-Claude-D97756?logo=anthropic)](https://claude.ai)

Render the current Obsidian note as a finished academic paper: typeset with LaTeX through your own preamble, every short citation such as `(Bonica, 2018: 123)` turned into a real biblatex citation, and a bibliography pulled from Zotero. Each render goes into a new folder of its own.

## What it does

- **One command, Render current note.** It opens a dialog, then exports the active note to a new folder holding `<Note>.pdf`, the standalone `<Note>.tex`, `refs.bib`, and a `media/` folder for embedded images. The `.tex` file recompiles as-is inside that folder.
- **Short citations as plain text.** Write `(Bonica, 2018)` or `(Bonica, 2018: 123)` in the body. On render, each one is matched against the `citeshort:` frontmatter of your source notes (notes with a `citekey:` and a `citeshort:`) and becomes `\autocite{citekey}` or `\autocite[123]{citekey}`. The PDF prints exactly `(Bonica, 2018: 123)`: a comma between name and year, a colon before the page, and no "p.".
- **APSA-style bibliography.** References are typeset with biblatex and biber (`ext-authoryear`, configured toward APSA) and list only the works the paper cites: `Bonica, Adam. 2018. “Title.” Journal 62(4): 830–848.`
- **Unmatched citations stay visible.** A parenthetical that looks like a citation but matches no source note, matches two different citekeys, or cites several works at once is left in the text with a yellow highlight, and listed as a warning in the dialog.
- **Your preamble.** The preamble is read fresh from `~/Library/CloudStorage/Dropbox/SysAdmin/config/Files/LatexPre.tex` on every render, so your edits apply right away. The title (frontmatter `title:`, or else the note name) goes in both a title block on page 1 and the running header.
- **Obsidian syntax handled.** Headings, quotes, tables and code blocks typed directly under a line of text still render as headings, quotes, tables and code, though pandoc would otherwise merge them into the paragraph above. Wikilinks become plain text, embedded notes and sections are inlined, images are copied in, `%%comments%%` are dropped, and Virtual Outliner outline lines (`@`, `@@ …`) are stripped.
- **Overwrites only with a warning.** If the export folder already exists, the dialog warns that rendering will overwrite it. Rendering anyway replaces the PDF, `.tex`, `refs.bib` and `media/` in that folder and leaves any other files there alone.
- **Shows the result.** When rendering finishes, the new folder opens in Finder.

## Requirements

- Obsidian desktop on macOS (the plugin is desktop-only).
- [pandoc](https://pandoc.org) and [MacTeX](https://tug.org/mactex/) (`latexmk`, `lualatex`, `biber`), plus `python3`.
- For citations: [Zotero](https://www.zotero.org) with [Better BibTeX](https://retorque.re/zotero-better-bibtex/), and the [Zotero Manager](https://github.com/jsglazer/zotero-manager) plugin version 1.1.15 or later, which supplies the BibLaTeX entries. A note with no resolved citations renders without Zotero.

## Usage

1. Open a note and run **Render Doc: Render current note** from the command palette.
2. In the dialog, check the **Parent folder** (it defaults to the last one you used, or `~/Library/CloudStorage/Dropbox/_Schar/Classes`; **Choose…** opens a folder picker) and the **Folder name** (it defaults to the note's name). If that folder already exists, a warning says rendering will overwrite it.
3. Read the summary: how many source notes were found, how many citations resolved, and any left unmatched, with the reason for each.
4. Click **Render**.

### Where source notes are searched

| Frontmatter of the note being rendered | Folders searched |
| --- | --- |
| `cite-sources: Classes/2026-B/Sources` (a string or a list) | Exactly those folders and their subfolders. Use `/` for the whole vault. |
| no `cite-sources:` | The folder tree one level above the note's folder. |
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

The integration test (`tests/integration/`) renders a fixture paper with the real pandoc, latexmk, lualatex, biber and `LatexPre.tex`, all in a temporary folder. It skips itself when any of them is missing.

## License

[MIT](LICENSE)
