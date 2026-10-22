---
Project: render-doc
Created: 2026-10-21 20:37
Closed: 2026-10-21 23:41
---
# Claude output

> Post-build change log. No `UpdateNNN.md` existed in `~/VaultDEV/2-Projects/Obsidian/render-doc/Updates/`, so per the Dev CLAUDE.md this file holds the log. The build itself is logged in `~/VaultDEV/2-Projects/Obsidian/render-doc/BuildLog.md`.

## 2026-10-21 20:25 — Deploy 1.0.0 to VaultSchar

**User prompt:** "deploy it to VaultSchar"

Ran `/dev-deploy render-doc`. `DEPLOY.sh render-doc --dest 2 -y` copied `main.js`, `manifest.json` and `styles.css` to `~/VaultSchar/.obsidian/plugins/render-doc/`. The CLI reload failed with `Plugin "render-doc" not found` because it was a first install, and Obsidian only scans for new plugin folders when the vault reloads. That was left to Josh. Logged in the Dev file under `# Claude Log`; `LastShipCheck: 2026-10-21`.

## 2026-10-21 20:37 — 1.0.1: overwrite with a warning; headings typed under text

**User prompt:** "allow saving to overwrite existing file, just warn about it on the export dialog / text fails to break on p.6, see ~/Dev/TEMP/Lit Rev Clean/Lit Rev Clean.pdf"

**Diagnosis, page 6:** `pdftotext` showed `More text here ### State-level data The next milestone…` and `…data and methodology. ### Growing polarization Shor and McCarty…` running inside paragraphs. In the source note (`Classes/2026-B/RD - POGO 801/Assign/Polarization/Lit Rev Clean.md`), seven headings (lines 27, 28, 42, 123, 142, 151, 167) sit directly under a text line. Obsidian accepts that; pandoc's Markdown requires a blank line before a heading (`blank_before_header`), so it read each one as more paragraph text. The same rule applies to blockquotes, pipe tables and code fences. Lists were already handled by `renderer/lists.py`.

**Also on page 6, not a plugin bug:** `(Poole, Keith T and Rosenthal, Howard, 1997)`. In `refs.bib`, `PooleKeithT-CongressPoliticalEconomicHistory-1997` has `author = {{Poole, Keith T} and {Rosenthal, Howard}}`. Zotero stores both creators as single-field names, and biblatex prints such names whole. Fix it in Zotero by switching each creator to two-field (last, first) mode. The other Poole items are fine.

**Changes:**
- `src/core/blockSeparation.ts` (new): `separateBlocks` inserts a blank line before an ATX heading, a `>` quote, a pipe table (header row followed by a separator row) or a code fence when the line above is text. It skips fenced code and leaves `#tags` alone. Called in `prepareDocument` between the Obsidian conversion and citation replacement.
- `src/core/document.ts`: `checkExportTarget` now returns `{ ok: true, exists: true, warning }` for an existing folder instead of a blocking collision. A bad name or a missing parent folder still blocks.
- `src/ui/renderModal.ts` and `styles.css`: an existing folder shows a bold warning-coloured line ("… already exists. Rendering will overwrite its PDF, .tex, refs.bib and media/."). Render stays enabled. Errors use a separate `mod-error` style. Clicking Render records `plan.overwrite`.
- `src/export/exporter.ts` and `src/core/render.ts`: `RenderPlan.overwrite` is passed to `job.json` `"overwrite"`. If the folder exists at render time but the dialog didn't show the warning (it appeared after the check), the render still stops with nothing written.
- `renderer/job.py` `deliver`: with `overwrite`, it reuses the existing folder. The PDF, `.tex` and `refs.bib` are each replaced atomically (temp file plus `os.replace`), a stale `refs.bib` is removed when the new render has no citations, `media/` is replaced wholesale, and any other files in the folder are left untouched. Without `overwrite`, the result is still stage `collision` with nothing written. A new folder created during a failed copy is rolled back; a reused one is not deleted.
- Tests: `tests/blockSeparation.test.ts` (new, 6 cases); `tests/document.test.ts` updated for the warning; the integration test's fixture note now has a heading typed under text (asserts no `###` and that the heading isn't inside the paragraph) plus a new overwrite case (`notes.txt` kept, stale `media/old/` removed, PDF replaced and showing `(Bonica, 2018: 123)`).
- `README.md`: the overwrite behaviour and the heading handling. Version 1.0.1 in `manifest.json`, `package.json`, `versions.json` and the Dev file.

**Verification:** `tsc` clean, `eslint src` clean, `vitest run` 7 files and 83/83 passed (including the real-toolchain integration test). The real note, run through `prepareDocument` and pandoc, now yields all 11 headings as `\subsection`/`\subsubsection`, including State-level data and Growing polarization. Deployed to VaultSchar (`DEPLOY.sh --dest 2 -y`) and reloaded with `plugin:disable`/`plugin:enable`. A live `eval` of `exporter.check` on an existing folder returned the new overwrite warning, so VaultSchar is running 1.0.1 code. Obsidian's plugin info still reports 1.0.0 because it caches manifests until the vault reloads.

| # | Issue | Fix |
| --- | --- | --- |
| 1 | Headings typed directly under a text line were merged into the paragraph (`### State-level data` on p.6) | New `separateBlocks` core step adds the blank line pandoc requires before headings, quotes, tables and fences |
| 2 | An existing export folder blocked Render | It now shows a warning and Render still works; `job.py deliver` overwrites only Render Doc's own files in that folder |
| 3 | A folder created after the dialog checked could be overwritten without a warning | `plan.overwrite` is recorded at the Render click; the exporter and `deliver` refuse an unwarned existing folder |
| 4 | `(Poole, Keith T and Rosenthal, Howard, 1997)` | Not a code issue: the Zotero item has single-field creators; switch them to two-field in Zotero |

**Session summary (as presented to Josh):**

Both fixes are in Render Doc 1.0.1, which is pushed and deployed to VaultSchar. I confirmed VaultSchar is running the new code.

**Page 6 headings:** headings typed directly under a line of text, like `### State-level data` on line 151, were being read as part of the paragraph. Obsidian accepts that layout, but pandoc needs a blank line before a heading. Seven headings in Lit Rev Clean had this problem (lines 27, 28, 42, 123, 142, 151, 167). The plugin now adds the blank line itself, and does the same for quotes, tables and code blocks. I ran your note through the new conversion: all 11 headings now come out as real section headings. You don't need to change the note.

**Overwrite:** if the export folder already exists, the dialog shows a bold warning that rendering will overwrite it, and Render still works. It replaces the PDF, `.tex`, `refs.bib` and `media/` in that folder and leaves anything else you've put there alone. If the folder appears only after the dialog checked, the render still stops without writing anything, so there's never an overwrite you weren't warned about.

**One more thing on page 6, which needs fixing in Zotero:** `(Poole, Keith T and Rosenthal, Howard, 1997)` comes from the Zotero item for the 1997 *Congress* book. Its two authors are stored as single-field names, so they print in full. In Zotero, switch each creator to the two-field (last, first) layout and the citation will read `(Poole and Rosenthal, 1997)`.

Re-render Lit Rev Clean to check it. All 83 tests pass. Obsidian's plugin list will show version 1.0.0 until the next vault reload, but the code that's running is 1.0.1.

## 2026-10-21 23:41 — 1.0.2: line numbers option

**User prompt:** "add an option to print line numbers.  do it and deploy immeditely to VaultSchar"

**Changes:**
- `src/ui/renderModal.ts`: a **Line numbers** toggle under the folder fields ("Number every line of text in the left margin, restarting on each page.").
- `src/core/settings.ts`: `lineNumbers` (default off) is remembered between renders; `src/main.ts` passes it to `plan()` and saves it when Render is clicked.
- `src/core/latex.ts`: `citeHeader(withBibliography, lineNumbers)` appends `\usepackage[pagewise]{lineno}` and `\linenumbers` to `cite.tex` (after LatexPre.tex) only when the toggle is on. `src/core/render.ts` `buildFiles` takes `{ lineNumbers }`; `src/export/exporter.ts` carries it on `RenderPlan`. The delivered `.tex` keeps the line numbers when recompiled.
- Tests: unit tests for the lineno header and the setting; an integration test compiles the delivered `.tex` with the lineno lines using real lualatex and checks that `pdftotext` shows a line `1`, and that the default render has none.
- README: the option and the usage step. Version 1.0.2 in `manifest.json`, `package.json`, `versions.json` and the Dev file.

**Verification:** `tsc` clean, `eslint src` clean, `vitest run` 7 files and 85/85 passed. Deployed to VaultSchar (`DEPLOY.sh --dest 2 -y`) and reloaded with `plugin:disable`/`plugin:enable`. A live `eval` showed `exporter.plan` taking 3 arguments and settings `{"lastParentDir":"/Users/josh/Dev/TEMP","lineNumbers":false}`, so the new code is loaded. Plugin info still reports a cached version (1.0.1) until the vault reloads.

| # | Issue | Fix |
| --- | --- | --- |
| 1 | No way to print line numbers | **Line numbers** toggle in the dialog, remembered between renders; it adds `lineno` (pagewise) after LatexPre.tex |

**Session summary (as presented to Josh):**

Render Doc 1.0.2 adds a **Line numbers** switch to the render dialog, and it's deployed to VaultSchar. I reloaded the plugin and confirmed the new code is running. When the switch is on, every line of text is numbered in the left margin, starting again at 1 on each page. The plugin remembers the setting for the next render, and the `.tex` file in the export folder keeps the line numbers if you recompile it. It's off by default. All 85 tests pass, including a real LaTeX compile that checks the numbers appear in the PDF. The change is committed and pushed. Obsidian's plugin list will show the old version number until the next vault reload.
