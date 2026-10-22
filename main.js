"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => RenderDocPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/adapter/obsidianInternals.ts
function zoteroManagerApi(app) {
  var _a, _b;
  const registry = app.plugins;
  const api = (_b = (_a = registry == null ? void 0 : registry.plugins) == null ? void 0 : _a["zotero-manager"]) == null ? void 0 : _b.api;
  if (!api || typeof api.version !== "number" || api.version < 1) return null;
  if (typeof api.isAvailable !== "function" || typeof api.getAllCiteKeys !== "function" || typeof api.getBibLaTeX !== "function") {
    return null;
  }
  return api;
}
function electronModule(id) {
  try {
    return require(id);
  } catch (e) {
    return null;
  }
}
async function pickFolder(title, defaultPath) {
  var _a, _b, _c, _d, _e;
  for (const id of ["electron", "@electron/remote"]) {
    const dialog = (_d = (_b = (_a = electronModule(id)) == null ? void 0 : _a.remote) == null ? void 0 : _b.dialog) != null ? _d : (_c = electronModule(id)) == null ? void 0 : _c.dialog;
    if (dialog === void 0) continue;
    const result = await dialog.showOpenDialog({
      title,
      ...defaultPath === "" ? {} : { defaultPath },
      properties: ["openDirectory", "createDirectory"]
    });
    return result.canceled ? null : (_e = result.filePaths[0]) != null ? _e : null;
  }
  throw new Error("Electron's folder dialog could not be reached.");
}
function revealInFinder(path) {
  var _a;
  const shell = (_a = electronModule("electron")) == null ? void 0 : _a.shell;
  if (!shell) return false;
  shell.showItemInFolder(path);
  return true;
}

// src/core/settings.ts
var DEFAULT_SETTINGS = {
  lastParentDir: "",
  lineNumbers: false
};
var DEFAULT_PARENT_DIR_HOME = "Library/CloudStorage/Dropbox/_Schar/Classes";
var PREAMBLE_PATH_HOME = "Library/CloudStorage/Dropbox/SysAdmin/config/Files/LatexPre.tex";
function mergeSettings(saved) {
  const s = saved !== null && typeof saved === "object" ? saved : {};
  return {
    lastParentDir: typeof s.lastParentDir === "string" ? s.lastParentDir : DEFAULT_SETTINGS.lastParentDir,
    lineNumbers: typeof s.lineNumbers === "boolean" ? s.lineNumbers : DEFAULT_SETTINGS.lineNumbers
  };
}
function initialParentDir(settings, home) {
  return settings.lastParentDir !== "" ? settings.lastParentDir : `${home.replace(/\/+$/, "")}/${DEFAULT_PARENT_DIR_HOME}`;
}

// src/export/exporter.ts
var import_obsidian = require("obsidian");

// src/core/document.ts
function asText(value) {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}
function readDocMeta(frontmatter, basename) {
  var _a;
  const fm = frontmatter != null ? frontmatter : {};
  const rawAuthor = fm.author;
  const authors = (Array.isArray(rawAuthor) ? rawAuthor : [rawAuthor]).map(asText).filter((a) => a !== null);
  return {
    title: (_a = asText(fm.title)) != null ? _a : basename,
    authors,
    date: asText(fm.date)
  };
}
function pandocMetadata(meta) {
  const out = { title: meta.title };
  if (meta.authors.length > 0) out.author = meta.authors;
  if (meta.date !== null) out.date = meta.date;
  return out;
}
function safeStem(name) {
  const cleaned = name.replace(/[/\\:]/g, "-").replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/^\.+/, "").replace(/[.\s]+$/, "");
  return cleaned === "" ? "Document" : cleaned;
}
function folderNameProblem(name) {
  const t = name.trim();
  if (t === "") return "Enter a folder name.";
  if (t === "." || t === "..") return "That folder name is reserved.";
  if (/[/:]/.test(t)) return "A folder name cannot contain / or :.";
  return null;
}
function joinPath(dir, name) {
  return `${dir.replace(/\/+$/, "")}/${name}`;
}
function checkExportTarget(parentDir, folderName, exists) {
  const problem = folderNameProblem(folderName);
  if (problem !== null) return { ok: false, reason: "invalid", message: problem };
  const parent = parentDir.trim().replace(/(.)\/+$/, "$1");
  if (parent === "" || !exists(parent)) {
    return { ok: false, reason: "no-parent", message: `The parent folder does not exist: ${parentDir}` };
  }
  const target = joinPath(parent, folderName.trim());
  if (exists(target)) {
    return {
      ok: true,
      target,
      exists: true,
      warning: `${target} already exists. Rendering will overwrite its PDF, .tex, refs.bib and media/.`
    };
  }
  return { ok: true, target, exists: false };
}

// src/core/exportBody.ts
var DEFAULT_SIGIL_CHAR = "@";
var PARAGRAPH_FLAG = "p";
var COMMENT_MARK = "%";
var MAX_LEVEL = 6;
var FENCE_RE = /^\s*(`{3,}|~{3,})/;
function nextFenceState(line, open) {
  var _a;
  const m = FENCE_RE.exec(line);
  if (!m) return open;
  const marker = (_a = m[1]) != null ? _a : "";
  if (open === null) return marker;
  return marker[0] === open[0] && marker.length >= open.length ? null : open;
}
function isFenceLine(line) {
  return FENCE_RE.test(line);
}
function stripFrontmatter(doc) {
  var _a, _b;
  const lines = doc.split("\n");
  if (((_a = lines[0]) != null ? _a : "").trimEnd() !== "---") return doc;
  for (let i = 1; i < lines.length; i++) {
    const t = ((_b = lines[i]) != null ? _b : "").trimEnd();
    if (t === "---" || t === "...") return lines.slice(i + 1).join("\n");
  }
  return doc;
}
function escapeForRegex(char) {
  return char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function outlineLineRegex(sigilChar) {
  const flag = sigilChar === PARAGRAPH_FLAG ? "" : `${PARAGRAPH_FLAG}?`;
  return new RegExp(`^(${escapeForRegex(sigilChar)}{1,${MAX_LEVEL}})(?:${flag})[ \\t]+(.*)$`);
}
function commentLineRegex(sigilChar) {
  return new RegExp(`^${escapeForRegex(sigilChar)}{1,${MAX_LEVEL}}${escapeForRegex(COMMENT_MARK)}(?:[ \\t]+.*)?$`);
}
function hasParagraphFlag(line, sigilChar, entryRe) {
  var _a;
  const match = entryRe.exec(line);
  if (!match || sigilChar === PARAGRAPH_FLAG) return false;
  const sigils = (_a = match[1]) != null ? _a : "";
  return line.slice(sigils.length, sigils.length + PARAGRAPH_FLAG.length) === PARAGRAPH_FLAG;
}
var BLOCK_START_RE = /^(?:\s{4,}|\t|#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||:{1,3}(?:\s|$)|`{3,}|~{3,}|(?:[-*_]\s*){3,}$)/;
function isPlainProse(line) {
  return line.trim() !== "" && !BLOCK_START_RE.test(line);
}
function extractBody(doc, sigilChar = DEFAULT_SIGIL_CHAR) {
  var _a;
  const lines = stripFrontmatter(doc).split("\n");
  const entryRe = outlineLineRegex(sigilChar);
  const commentRe = commentLineRegex(sigilChar);
  const out = [];
  let fence = null;
  let stripped = 0;
  let lastBlank = true;
  let lastText = "";
  let dropped = false;
  let forceBreak = false;
  for (const line of lines) {
    if (fence === null && entryRe.test(line)) {
      stripped++;
      dropped = true;
      if (hasParagraphFlag(line, sigilChar, entryRe)) forceBreak = true;
      continue;
    }
    if (fence === null && sigilChar !== COMMENT_MARK && commentRe.test(line)) continue;
    const blank = fence === null && line.trim() === "";
    if (dropped && !blank && !lastBlank && (forceBreak || !isPlainProse(lastText) || !isPlainProse(line))) {
      out.push("");
      lastBlank = true;
    }
    dropped = false;
    forceBreak = false;
    if (fence !== null || FENCE_RE.test(line)) {
      fence = nextFenceState(line, fence);
      out.push(line);
      lastBlank = false;
      lastText = line;
      continue;
    }
    if (blank && lastBlank) continue;
    out.push(blank ? "" : line);
    lastBlank = blank;
    if (!blank) lastText = line;
  }
  while (out.length > 0 && ((_a = out[out.length - 1]) != null ? _a : "").trim() === "") out.pop();
  const body = out.join("\n");
  return { body, outlineLinesStripped: stripped, isEmpty: body.trim() === "" };
}

// src/core/blockSeparation.ts
var HEADING_RE = /^#{1,6}(?:[ \t]|$)/;
var QUOTE_RE = /^ {0,3}>/;
var TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
function opensTable(line, next) {
  return line.includes("|") && next !== void 0 && next.includes("-") && TABLE_SEPARATOR_RE.test(next);
}
function separateBlocks(markdown) {
  var _a, _b;
  const lines = markdown.split("\n");
  const out = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = (_a = lines[i]) != null ? _a : "";
    if (fence !== null) {
      fence = nextFenceState(line, fence);
      out.push(line);
      continue;
    }
    const prev = out.length > 0 ? (_b = out[out.length - 1]) != null ? _b : "" : "";
    const afterText = prev.trim() !== "";
    const needsBlank = afterText && (HEADING_RE.test(line) || isFenceLine(line) || QUOTE_RE.test(line) && !QUOTE_RE.test(prev) || opensTable(line, lines[i + 1]) && !prev.includes("|"));
    if (needsBlank) out.push("");
    if (isFenceLine(line)) fence = nextFenceState(line, fence);
    out.push(line);
  }
  return out.join("\n");
}

// src/core/latex.ts
function latexEscape(text) {
  let out = "";
  for (const ch of text) {
    if (ch === "\\") out += "\\textbackslash{}";
    else if ("&%$#_{}".includes(ch)) out += `\\${ch}`;
    else if (ch === "~") out += "\\textasciitilde{}";
    else if (ch === "^") out += "\\textasciicircum{}";
    else if (ch === "`") out += "\\textasciigrave{}";
    else out += ch;
  }
  return out;
}
function latexOptionalArg(text) {
  return latexEscape(text).replace(/\[/g, "{[}").replace(/\]/g, "{]}");
}
function rawLatex(latex) {
  return `\`${latex}\`{=latex}`;
}
function autociteCommand(citekey, locator) {
  return locator === "" ? `\\autocite{${citekey}}` : `\\autocite[${latexOptionalArg(locator)}]{${citekey}}`;
}
function unmatchedCommand(text) {
  return `\\rdunmatched{${latexEscape(text)}}`;
}
function metaHeader(title) {
  const t = latexEscape(title);
  return [
    "% Written by Render Doc \u2014 included BEFORE LatexPre.tex, so its",
    "% \\providecommand{\\DocTitle}{} default leaves this title alone.",
    `\\def\\DocTitle{${t}}`,
    `\\AtBeginDocument{\\hypersetup{pdftitle={${t}},pdfcreator={Render Doc}}}`,
    ""
  ].join("\n");
}
var UNMATCHED_MACRO = [
  "\\usepackage{xcolor}",
  "\\usepackage{luacolor}",
  "\\usepackage{lua-ul}",
  "\\newcommand{\\rdunmatched}[1]{\\highLight[yellow!40]{#1}}"
];
var BIBLATEX = [
  "\\usepackage{csquotes}",
  "\\usepackage[backend=biber, style=ext-authoryear, maxcitenames=2, uniquename=false, uniquelist=false, dashed=false]{biblatex}",
  "\\addbibresource{refs.bib}",
  '% In-text: comma between name and year, colon before the page, no "p."',
  "\\DeclareDelimFormat{nameyeardelim}{\\addcomma\\space}",
  "\\DeclareDelimFormat{postnotedelim}{\\addcolon\\space}",
  "\\DeclareFieldFormat{postnote}{#1}",
  "\\DeclareFieldFormat{multipostnote}{#1}",
  "% Bibliography, toward APSA",
  "\\DeclareDelimFormat[bib]{nameyeardelim}{\\addperiod\\space}",
  "\\DeclareFieldFormat{biblabeldate}{#1}",
  "\\DeclareNameAlias{sortname}{family-given/given-family}",
  "\\DeclareDelimFormat[bib]{finalnamedelim}{\\addcomma\\space\\bibstring{and}\\space}",
  "\\uspunctuation",
  "\\renewbibmacro{in:}{\\ifentrytype{article}{}{\\printtext{\\bibstring{in}\\intitlepunct}}}",
  "\\DeclareFieldFormat[article]{number}{\\mkbibparens{#1}}",
  "\\DeclareDelimFormat{volnumdelim}{}",
  "\\DeclareFieldFormat{pages}{#1}",
  "\\renewcommand*{\\bibpagespunct}{\\addcolon\\space}"
];
var LINE_NUMBERS = ["\\usepackage[pagewise]{lineno}", "\\linenumbers"];
function citeHeader(withBibliography, lineNumbers = false) {
  const lines = ["% Written by Render Doc \u2014 included AFTER LatexPre.tex.", ...UNMATCHED_MACRO];
  if (withBibliography) lines.push(...BIBLATEX);
  if (lineNumbers) lines.push(...LINE_NUMBERS);
  return `${lines.join("\n")}
`;
}
var BIBLIOGRAPHY_TRAILER = "\\printbibliography[title={References}]\n";

// src/core/sources.ts
var CITE_SOURCES_KEY = "cite-sources";
function normalizeCiteshort(text) {
  return text.normalize("NFC").trim().replace(/\s+/g, " ");
}
function parentFolder(path) {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}
function normalizeFolder(raw) {
  return raw.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}
function parseCiteSources(raw) {
  const items = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
  const folders = [];
  for (const item of items) {
    if (typeof item !== "string" || item.trim() === "") continue;
    const folder = normalizeFolder(item);
    if (!folders.includes(folder)) folders.push(folder);
  }
  return folders.length > 0 ? folders : null;
}
function resolveScope(notePath, citeSourcesRaw, folderExists) {
  const warnings = [];
  const explicit = parseCiteSources(citeSourcesRaw);
  if (explicit !== null) {
    const roots = explicit.filter((folder) => {
      const ok = folder === "" || folderExists(folder);
      if (!ok) warnings.push(`cite-sources folder not found: ${folder}`);
      return ok;
    });
    if (roots.length > 0) return { roots, warnings };
    warnings.push("None of the cite-sources folders exist, so the default search scope was used.");
  }
  const noteFolder = parentFolder(notePath);
  if (noteFolder === "") {
    warnings.push("This note is at the vault root, so no source notes were searched. Add cite-sources to its frontmatter.");
    return { roots: [], warnings };
  }
  const oneUp = parentFolder(noteFolder);
  if (oneUp === "" || !folderExists(oneUp)) {
    warnings.push(`The folder above this note is the vault root, so only ${noteFolder} was searched for source notes.`);
    return { roots: [noteFolder], warnings };
  }
  return { roots: [oneUp], warnings };
}
function inScope(path, roots) {
  return roots.some((root) => root === "" || path.startsWith(`${root}/`));
}
function nonEmptyString(value) {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return null;
}
function collectSourceNotes(notes, roots) {
  var _a, _b;
  const sources = [];
  for (const note of notes) {
    if (!inScope(note.path, roots)) continue;
    const citekey = nonEmptyString((_a = note.frontmatter) == null ? void 0 : _a.citekey);
    const citeshort = nonEmptyString((_b = note.frontmatter) == null ? void 0 : _b.citeshort);
    if (citekey === null || citeshort === null) continue;
    sources.push({ path: note.path, citekey, citeshort });
  }
  return sources.sort((a, b) => a.path.localeCompare(b.path));
}
function buildCiteIndex(sources) {
  var _a;
  const index = /* @__PURE__ */ new Map();
  for (const s of sources) {
    const key = normalizeCiteshort(s.citeshort);
    const list = (_a = index.get(key)) != null ? _a : [];
    list.push({ citekey: s.citekey, path: s.path });
    index.set(key, list);
  }
  return index;
}
function distinctCitekeys(entries) {
  return [...new Set(entries.map((e) => e.citekey))];
}
function findAmbiguities(index) {
  const out = [];
  for (const [citeshort, entries] of index) {
    if (distinctCitekeys(entries).length > 1) out.push({ citeshort, entries: [...entries] });
  }
  return out.sort((a, b) => a.citeshort.localeCompare(b.citeshort));
}
function discoverSources(notePath, citeSourcesRaw, notes, folderExists) {
  const { roots, warnings } = resolveScope(notePath, citeSourcesRaw, folderExists);
  const sources = collectSourceNotes(
    notes.filter((n) => n.path !== notePath),
    roots
  );
  const index = buildCiteIndex(sources);
  return { roots, sources, index, ambiguities: findAmbiguities(index), warnings };
}

// src/core/citations.ts
var MAX_PARENTHETICAL = 120;
var MULTI_WORK_MESSAGE = "multi-work citations not supported";
var CITATION_RE = /^(\p{Lu}[^();]*?,\s*\d{4}[a-z]?)(?:\s*:\s*([^()]*?))?$/u;
var PARENTHETICAL_RE = /\(([^()\n]*)\)/g;
var PROTECTED_RE = new RegExp(
  [
    "(`+)[\\s\\S]*?\\1",
    // inline code
    "\\$\\$[\\s\\S]*?\\$\\$",
    // inline display math
    "(\\$\\$[\\s\\S]*$)",
    // display math opening here, closing on a later line
    "(?<![\\\\$])\\$(?=[^\\s$])(?:[^$\\\\\\n]|\\\\.)*?(?<=\\S)\\$(?!\\d)",
    // inline math
    "!?\\[[^\\]\\n]*\\]\\([^)\\n]*\\)",
    // Markdown link or image
    "<[A-Za-z][A-Za-z0-9+.-]*:[^>\\s]*>"
    // autolink
  ].join("|"),
  "g"
);
function classifyParenthetical(inner) {
  var _a, _b;
  if (inner.length > MAX_PARENTHETICAL) return { kind: "not-citation" };
  const content = inner.trim();
  if (content.includes(";")) {
    const parts = content.split(";").map((p) => p.trim());
    return parts.some((p) => CITATION_RE.test(p)) ? { kind: "multi-work" } : { kind: "not-citation" };
  }
  const m = CITATION_RE.exec(content);
  if (!m) return { kind: "not-citation" };
  return { kind: "citation", citeshort: (_a = m[1]) != null ? _a : "", locator: ((_b = m[2]) != null ? _b : "").trim() };
}
function splitProtected(line, inMath) {
  const segments = [];
  let rest = line;
  if (inMath) {
    const close = rest.indexOf("$$");
    if (close === -1) return { segments: [{ text: rest, scan: false }], inMath: true };
    segments.push({ text: rest.slice(0, close + 2), scan: false });
    rest = rest.slice(close + 2);
  }
  let opensMath = false;
  let last = 0;
  PROTECTED_RE.lastIndex = 0;
  let m;
  while ((m = PROTECTED_RE.exec(rest)) !== null) {
    if (m[0] === "") {
      PROTECTED_RE.lastIndex++;
      continue;
    }
    if (m.index > last) segments.push({ text: rest.slice(last, m.index), scan: true });
    segments.push({ text: m[0], scan: false });
    if (m[2] !== void 0) opensMath = true;
    last = m.index + m[0].length;
  }
  if (last < rest.length) segments.push({ text: rest.slice(last), scan: true });
  return { segments, inMath: opensMath };
}
function replaceCitations(markdown, index) {
  const resolved = [];
  const unmatched = [];
  const citekeys = [];
  const rewrite = (whole, inner) => {
    var _a, _b;
    const c = classifyParenthetical(inner);
    if (c.kind === "not-citation") return whole;
    if (c.kind === "multi-work") {
      unmatched.push({ text: whole, reason: "multi-work", message: MULTI_WORK_MESSAGE });
      return rawLatex(unmatchedCommand(whole));
    }
    const key = normalizeCiteshort(c.citeshort);
    const keys = distinctCitekeys((_a = index.get(key)) != null ? _a : []);
    if (keys.length === 0) {
      unmatched.push({ text: whole, reason: "no-match", message: `no source note has citeshort "${key}"` });
      return rawLatex(unmatchedCommand(whole));
    }
    if (keys.length > 1) {
      unmatched.push({ text: whole, reason: "ambiguous", message: `"${key}" is the citeshort of ${keys.join(", ")}` });
      return rawLatex(unmatchedCommand(whole));
    }
    const citekey = (_b = keys[0]) != null ? _b : "";
    resolved.push({ text: whole, citekey, locator: c.locator });
    if (!citekeys.includes(citekey)) citekeys.push(citekey);
    return rawLatex(autociteCommand(citekey, c.locator));
  };
  const out = [];
  let fence = null;
  let inMath = false;
  for (const line of markdown.split("\n")) {
    if (!inMath && (fence !== null || isFenceLine(line))) {
      fence = nextFenceState(line, fence);
      out.push(line);
      continue;
    }
    const split = splitProtected(line, inMath);
    inMath = split.inMath;
    out.push(split.segments.map((s) => s.scan ? s.text.replace(PARENTHETICAL_RE, rewrite) : s.text).join(""));
  }
  return { markdown: out.join("\n"), resolved, unmatched, citekeys };
}

// src/core/obsidianMarkdown.ts
var MAX_EMBED_DEPTH = 5;
var FENCE_START_RE = /^\s*(`{3,}|~{3,})/;
var EMBED_RE = /!\[\[([^\]]+)\]\]/g;
var WIKILINK_RE = /\[\[([^\]]+)\]\]/g;
var MD_IMAGE_RE = /!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)((?:\s+"[^"]*")?)\s*\)/g;
var MD_LINK_RE = /\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
var CALLOUT_RE = /^(\s*(?:>\s*)+)\[!([^\]]+)\][+-]?\s*(.*)$/;
var BLOCK_ID_RE = /\s\^[A-Za-z0-9-]+\s*$/;
var REMOTE_RE = /^[a-z][a-z0-9+.-]*:/i;
function stripComments(markdown) {
  const out = [];
  let fence = null;
  let inComment = false;
  for (const line of markdown.split("\n")) {
    if (!inComment && (fence !== null || FENCE_START_RE.test(line))) {
      fence = nextFenceState(line, fence);
      out.push(line);
      continue;
    }
    if (!inComment && !line.includes("%%")) {
      out.push(line);
      continue;
    }
    let kept = "";
    let rest = line;
    while (rest.length > 0) {
      const idx = rest.indexOf("%%");
      if (idx === -1) {
        if (!inComment) kept += rest;
        break;
      }
      if (!inComment) kept += rest.slice(0, idx);
      inComment = !inComment;
      rest = rest.slice(idx + 2);
    }
    if (kept.trim() !== "" || line.trim() === "") out.push(kept.trimEnd());
  }
  return out.join("\n");
}
function splitCode(line) {
  const parts = [];
  const re = /(`+)[\s\S]*?\1/g;
  let last = 0;
  let m;
  while ((m = re.exec(line)) !== null) {
    parts.push(line.slice(last, m.index), m[0]);
    last = m.index + m[0].length;
  }
  parts.push(line.slice(last));
  return parts;
}
function splitTarget(inner) {
  const bar = inner.indexOf("|");
  const target = (bar === -1 ? inner : inner.slice(0, bar)).trim();
  const alias = bar === -1 ? "" : inner.slice(bar + 1).trim();
  const hash = target.indexOf("#");
  return {
    linkpath: hash === -1 ? target : target.slice(0, hash),
    subpath: hash === -1 ? "" : target.slice(hash + 1),
    alias
  };
}
function wikilinkText(inner) {
  const { linkpath, subpath, alias } = splitTarget(inner);
  if (alias !== "") return alias;
  const name = linkpath.replace(/\.md$/i, "");
  const sub = subpath.startsWith("^") ? "" : subpath.replace(/#/g, " > ");
  if (name === "") return sub;
  return sub === "" ? name : `${name} > ${sub}`;
}
function extractSubpath(markdown, subpath) {
  var _a, _b, _c, _d, _e, _f;
  const lines = markdown.split("\n");
  if (subpath.startsWith("^")) {
    const id = subpath.slice(1);
    const idx = lines.findIndex((l) => new RegExp(`\\s\\^${id.replace(/[-]/g, "\\-")}\\s*$`).test(l));
    if (idx === -1) return null;
    let start2 = idx;
    while (start2 > 0 && ((_a = lines[start2 - 1]) != null ? _a : "").trim() !== "") start2--;
    return lines.slice(start2, idx + 1).join("\n");
  }
  const wanted = (_c = (_b = subpath.split("#").pop()) == null ? void 0 : _b.trim().toLowerCase()) != null ? _c : "";
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec((_d = lines[i]) != null ? _d : "");
    if (!m) continue;
    const lvl = ((_e = m[1]) != null ? _e : "").length;
    if (start === -1) {
      if (((_f = m[2]) != null ? _f : "").trim().toLowerCase() === wanted) {
        start = i;
        level = lvl;
      }
    } else if (lvl <= level) {
      return lines.slice(start, i).join("\n");
    }
  }
  return start === -1 ? null : lines.slice(start).join("\n");
}
function decodeTarget(raw) {
  const t = raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw;
  try {
    return decodeURIComponent(t);
  } catch (e) {
    return t;
  }
}
function imageRef(rel) {
  return /[\s()<>]/.test(rel) ? `<${rel}>` : rel;
}
function sizeAttr(alias) {
  const m = /^(\d+)(?:x\d+)?$/.exec(alias.trim());
  return m ? `{width=${m[1]}px}` : "";
}
async function convertEmbed(inner, fromPath, ctx, standalone) {
  const { linkpath, subpath, alias } = splitTarget(inner);
  const decoded = decodeTarget(linkpath);
  if (REMOTE_RE.test(decoded)) return `![](${imageRef(decoded)})${sizeAttr(alias)}`;
  const resolved = linkpath === "" ? { path: fromPath, kind: "markdown" } : ctx.resolver.resolveLink(decoded, fromPath);
  if (!resolved) {
    ctx.issues.push({ kind: "unresolved", target: inner });
    return "";
  }
  if (resolved.kind === "image") {
    const alt = sizeAttr(alias) === "" ? alias : "";
    return `![${alt}](${imageRef(ctx.resolver.stageImage(resolved.path))})${sizeAttr(alias)}`;
  }
  if (resolved.kind !== "markdown") {
    ctx.issues.push({ kind: "unsupported", target: inner });
    return "";
  }
  if (ctx.stack.includes(resolved.path) || ctx.stack.length >= MAX_EMBED_DEPTH) {
    ctx.issues.push({ kind: "cycle", target: inner });
    return "";
  }
  let content = extractBody(await ctx.resolver.readNote(resolved.path), ctx.sigilChar).body;
  if (subpath !== "") {
    const section = extractSubpath(content, subpath);
    if (section === null) {
      ctx.issues.push({ kind: "unresolved", target: inner });
      return "";
    }
    content = section;
  }
  ctx.stack.push(resolved.path);
  const converted = await convertText(content, resolved.path, ctx);
  ctx.stack.pop();
  return standalone ? `
${converted.trim()}
` : converted.trim().replace(/\n+/g, " ");
}
async function convertSegment(segment, fromPath, ctx, standalone) {
  var _a;
  let out = "";
  let last = 0;
  EMBED_RE.lastIndex = 0;
  const embeds = [];
  let m;
  while ((m = EMBED_RE.exec(segment)) !== null) embeds.push({ index: m.index, length: m[0].length, inner: (_a = m[1]) != null ? _a : "" });
  for (const e of embeds) {
    out += segment.slice(last, e.index);
    out += await convertEmbed(e.inner, fromPath, ctx, standalone);
    last = e.index + e.length;
  }
  out += segment.slice(last);
  out = out.replace(MD_IMAGE_RE, (whole, alt, target, title) => {
    const decoded = decodeTarget(target);
    if (REMOTE_RE.test(decoded) || decoded.startsWith("/") || decoded.startsWith("assets/")) return whole;
    const resolved = ctx.resolver.resolveLink(decoded, fromPath);
    if (!resolved || resolved.kind !== "image") {
      ctx.issues.push({ kind: "unresolved", target: decoded });
      return "";
    }
    return `![${alt}](${imageRef(ctx.resolver.stageImage(resolved.path))}${title})`;
  });
  out = out.replace(WIKILINK_RE, (_whole, inner) => wikilinkText(inner));
  out = out.replace(MD_LINK_RE, (whole, label, target, offset, full) => {
    if (offset > 0 && full[offset - 1] === "!") return whole;
    const decoded = decodeTarget(target);
    if (REMOTE_RE.test(decoded) || decoded.startsWith("#")) return whole;
    return label;
  });
  return out;
}
async function convertText(markdown, fromPath, ctx) {
  var _a, _b, _c, _d;
  const out = [];
  let fence = null;
  for (const rawLine of stripComments(markdown).split("\n")) {
    if (fence !== null || FENCE_START_RE.test(rawLine)) {
      fence = nextFenceState(rawLine, fence);
      out.push(rawLine);
      continue;
    }
    let line = rawLine;
    const callout = CALLOUT_RE.exec(line);
    if (callout) {
      const type = ((_a = callout[2]) != null ? _a : "").trim();
      const title = ((_b = callout[3]) != null ? _b : "").trim() || type.charAt(0).toUpperCase() + type.slice(1);
      line = `${(_c = callout[1]) != null ? _c : "> "}**${title}**`;
    }
    line = line.replace(BLOCK_ID_RE, "");
    const standalone = /^\s*!\[\[[^\]]+\]\]\s*$/.test(line);
    const parts = splitCode(line);
    let rebuilt = "";
    for (let i = 0; i < parts.length; i++) {
      const part = (_d = parts[i]) != null ? _d : "";
      rebuilt += i % 2 === 1 ? part : await convertSegment(part, fromPath, ctx, standalone);
    }
    out.push(rebuilt);
  }
  return out.join("\n");
}
async function toPandocMarkdown(body, fromPath, sigilChar, resolver) {
  const ctx = { sigilChar, resolver, issues: [], stack: [fromPath] };
  const markdown = await convertText(body, fromPath, ctx);
  return { markdown: collapseBlankRuns(markdown), issues: ctx.issues };
}
function collapseBlankRuns(markdown) {
  var _a, _b;
  const out = [];
  let fence = null;
  for (const line of markdown.split("\n")) {
    if (fence !== null || FENCE_START_RE.test(line)) {
      fence = nextFenceState(line, fence);
      out.push(line);
      continue;
    }
    if (line.trim() === "" && (out.length === 0 || ((_a = out[out.length - 1]) != null ? _a : "").trim() === "")) continue;
    out.push(line.trim() === "" ? "" : line);
  }
  while (out.length > 0 && ((_b = out[out.length - 1]) != null ? _b : "").trim() === "") out.pop();
  return out.join("\n");
}

// src/core/render.ts
async function prepareDocument(doc, notePath, sigilChar, resolver, index) {
  const extraction = extractBody(doc, sigilChar);
  const converted = await toPandocMarkdown(extraction.body, notePath, sigilChar, resolver);
  const citations = replaceCitations(separateBlocks(converted.markdown), index);
  return {
    markdown: citations.markdown,
    citations,
    issues: converted.issues,
    outlineLinesStripped: extraction.outlineLinesStripped,
    isEmpty: extraction.isEmpty
  };
}
var PREAMBLE_FILE = "preamble.tex";
var BIB_FILE = "refs.bib";
function buildFiles(prepared, meta, target, options = {}) {
  var _a;
  const cites = prepared.citations.citekeys.length > 0;
  const files = {
    "source.md": `${prepared.markdown}
`,
    "meta.tex": metaHeader(meta.title),
    "cite.tex": citeHeader(cites, (_a = options.lineNumbers) != null ? _a : false),
    "meta.json": `${JSON.stringify(pandocMetadata(meta), null, 2)}
`
  };
  if (cites) files["after.tex"] = BIBLIOGRAPHY_TRAILER;
  const job = {
    version: 1,
    source: "source.md",
    headers: ["meta.tex", PREAMBLE_FILE, "cite.tex"],
    after: cites ? "after.tex" : "",
    metadataFile: "meta.json",
    bibliography: cites ? BIB_FILE : "",
    ...target
  };
  return { files, job };
}

// src/core/zotero.ts
function groupKeysByLibrary(keys, known) {
  var _a;
  const libraryOf = /* @__PURE__ */ new Map();
  for (const k of known) if (!libraryOf.has(k.citekey)) libraryOf.set(k.citekey, k.libraryID);
  const byLibrary = /* @__PURE__ */ new Map();
  const unknown = [];
  for (const key of keys) {
    const lib = libraryOf.get(key);
    if (lib === void 0) {
      unknown.push(key);
      continue;
    }
    const list = (_a = byLibrary.get(lib)) != null ? _a : [];
    list.push(key);
    byLibrary.set(lib, list);
  }
  return { byLibrary, unknown };
}
function concatBib(parts) {
  const kept = parts.map((p) => p.trim()).filter((p) => p !== "");
  return kept.length === 0 ? "" : `${kept.join("\n\n")}
`;
}
async function fetchBibLaTeX(api, keys) {
  var _a;
  const fail = (reason, message, missing = []) => ({
    ok: false,
    reason,
    message,
    missing
  });
  if (api === null) {
    return fail("not-installed", "This note cites sources, but the Zotero Manager plugin (1.1.15 or later) is not installed or enabled.");
  }
  if (!await api.isAvailable()) {
    return fail("not-running", "Zotero isn't reachable. Start Zotero with Better BibTeX and render again.");
  }
  const { byLibrary, unknown } = groupKeysByLibrary(keys, await api.getAllCiteKeys(true));
  if (unknown.length > 0) {
    return fail("missing-keys", `These citekeys are not in Zotero: ${unknown.join(", ")}`, unknown);
  }
  const parts = [];
  const libraries = [...byLibrary.keys()].sort((a, b) => a - b);
  for (const library of libraries) {
    const libKeys = (_a = byLibrary.get(library)) != null ? _a : [];
    const bib = await api.getBibLaTeX(
      libKeys.map((key) => ({ key, library })),
      library
    );
    if (bib === null) return fail("failed", `Zotero Manager could not export BibLaTeX from Zotero library ${library}.`);
    parts.push(bib);
  }
  return { ok: true, bib: concatBib(parts), libraries };
}

// src/export/node.ts
var SEARCH_PATH = ["/opt/homebrew/bin", "/usr/local/bin", "/Library/TeX/texbin", "/usr/bin", "/bin"];
var cached = null;
function node() {
  if (cached === null) {
    cached = {
      fs: require("fs"),
      path: require("path"),
      os: require("os"),
      crypto: require("crypto"),
      childProcess: require("child_process"),
      process: require("process"),
      stream: require("stream/promises")
    };
  }
  return cached;
}

// renderer/job.py
var job_default = '#!/usr/bin/env python3\n"""Job helper for render-pdf.sh (Python 3.9+, stdlib only).\n\nCopied and simplified from virtual-outliner\'s renderer/job.py. A job is a\nbuild folder holding job.json plus the files it names (all build-relative):\n\n    {\n      "version": 1,\n      "source": "source.md",         # prepared pandoc Markdown\n      "headers": ["meta.tex", "preamble.tex", "cite.tex"],   # pandoc -H, in order\n      "after": "after.tex",          # pandoc -A ("" = none)\n      "metadataFile": "meta.json",   # pandoc --metadata-file (title/author/date)\n      "bibliography": "refs.bib",    # "" when the note cites nothing\n      "resourcePath": "/abs/note/folder",\n      "parentDir": "/abs/parent",    # the export folder is created inside it\n      "folderName": "Paper",\n      "stem": "Paper",               # <stem>.pdf and <stem>.tex in the export folder\n      "overwrite": false             # write into an existing export folder (the dialog warned)\n    }\n\nSubcommands:\n    env <job.json>                     shell assignments (JOB_*) for render-pdf.sh\n    deliver <job.json>                 create (or, with overwrite, reuse) the export folder\n                                       and copy the deliverables\n    latex-errors <doc.log> [doc.blg]   the useful lines of a failed LaTeX/biber run\n    status-fail <stage> <message>      prints a failure status JSON line\n"""\n\nimport json\nimport os\nimport re\nimport shlex\nimport shutil\nimport sys\n\nFENCE = re.compile(r"^\\s*(```|~~~)")\nATX_HEADING = re.compile(r"^(#{1,6})[ \\t]+\\S")\n\n\ndef status(obj):\n    print(json.dumps(obj))\n\n\ndef fail(stage, message, code=1):\n    status({"ok": False, "stage": stage, "message": message})\n    sys.exit(code)\n\n\ndef load_job(path):\n    with open(path, encoding="utf-8") as fh:\n        job = json.load(fh)\n    build = os.path.dirname(os.path.abspath(path))\n    return job, build\n\n\ndef in_build(build, value):\n    if not value:\n        return ""\n    return value if os.path.isabs(value) else os.path.join(build, value)\n\n\ndef heading_shift(text):\n    """How far to shift headings so the shallowest one used becomes a LaTeX\n    \\\\section: a note whose headings start at ## would otherwise number its\n    sections 0.1, 0.2, \u2026"""\n    levels = []\n    in_fence = False\n    for line in text.split("\\n"):\n        if FENCE.match(line):\n            in_fence = not in_fence\n            continue\n        m = None if in_fence else ATX_HEADING.match(line)\n        if m:\n            levels.append(len(m.group(1)))\n    return 1 - min(levels) if levels else 0\n\n\ndef cmd_env(job_path):\n    job, build = load_job(job_path)\n    source = in_build(build, job.get("source") or "source.md")\n    if not os.path.isfile(source):\n        fail("job", "Source not found: %s" % source)\n    headers = [in_build(build, h) for h in job.get("headers") or []]\n    for h in headers:\n        if not os.path.isfile(h):\n            fail("job", "Header file not found: %s" % h)\n    bibliography = in_build(build, job.get("bibliography", ""))\n    if bibliography and not os.path.isfile(bibliography):\n        fail("job", "Bibliography not found: %s" % bibliography)\n    with open(source, encoding="utf-8") as fh:\n        shift = heading_shift(fh.read())\n    values = {\n        "JOB_SOURCE": source,\n        "JOB_HEADERS": "\\n".join(headers),\n        "JOB_AFTER": in_build(build, job.get("after", "")),\n        "JOB_METADATA": in_build(build, job.get("metadataFile") or "meta.json"),\n        "JOB_BIBLIOGRAPHY": bibliography,\n        "JOB_HEADING_SHIFT": str(shift),\n        "JOB_RESOURCE_PATH": job.get("resourcePath") or build,\n    }\n    for key, value in values.items():\n        print("%s=%s" % (key, shlex.quote(value)))\n\n\ndef replace_file(src, dst):\n    """Copy src over dst atomically: a reader never sees half a PDF."""\n    tmp = dst + ".rd-partial"\n    shutil.copyfile(src, tmp)\n    os.replace(tmp, dst)\n\n\ndef cmd_deliver(job_path):\n    """Put ONLY the deliverables in <parentDir>/<folderName>: <stem>.pdf,\n    <stem>.tex, refs.bib (when cited) and media/.\n\n    A new folder is made with a non-recursive mkdir. An existing folder is\n    used only when the job says "overwrite" (the dialog showed the warning and\n    Josh rendered anyway); then Render Doc\'s own files in it are replaced, a\n    stale refs.bib or media/ from an earlier render is removed, and anything\n    else in the folder is left alone. Without "overwrite", an existing folder\n    fails with stage "collision" and nothing is written."""\n    job, build = load_job(job_path)\n    parent = job.get("parentDir") or ""\n    name = job.get("folderName") or ""\n    stem = job.get("stem") or name\n    overwrite = bool(job.get("overwrite"))\n    if not parent or not name:\n        fail("deliver", "The job names no export folder.")\n    pdf = os.path.join(build, "doc.pdf")\n    if not os.path.isfile(pdf):\n        fail("deliver", "LaTeX finished without producing a PDF.")\n    if not os.path.isdir(parent):\n        fail("deliver", "The parent folder does not exist: %s" % parent)\n    target = os.path.join(parent, name)\n    created = False\n    try:\n        os.mkdir(target)\n        created = True\n    except FileExistsError:\n        if not overwrite:\n            fail("collision", "%s already exists, so nothing was written. Render again to overwrite it." % target)\n        if not os.path.isdir(target):\n            fail("collision", "%s exists and is not a folder, so nothing was written." % target)\n    except OSError as e:\n        fail("deliver", "Could not create %s: %s" % (target, e))\n    try:\n        replace_file(pdf, os.path.join(target, stem + ".pdf"))\n        replace_file(os.path.join(build, "doc.tex"), os.path.join(target, stem + ".tex"))\n        bib = in_build(build, job.get("bibliography", ""))\n        bib_out = os.path.join(target, os.path.basename(bib) if bib else "refs.bib")\n        if bib:\n            replace_file(bib, bib_out)\n        elif os.path.isfile(bib_out):\n            os.remove(bib_out)\n        media_out = os.path.join(target, "media")\n        if os.path.isdir(media_out):\n            shutil.rmtree(media_out)\n        media = os.path.join(build, "media")\n        if os.path.isdir(media):\n            shutil.copytree(media, media_out)\n    except OSError as e:\n        if created:\n            shutil.rmtree(target, ignore_errors=True)\n        fail("deliver", "Could not write into %s: %s" % (target, e))\n    status({"ok": True, "output": target, "pdf": os.path.join(target, stem + ".pdf")})\n\n\ndef cmd_latex_errors(log_path, blg_path=None):\n    picked = []\n    try:\n        with open(log_path, encoding="utf-8", errors="replace") as fh:\n            lines = fh.read().split("\\n")\n    except OSError:\n        lines = []\n    for i, line in enumerate(lines):\n        if line.startswith("!") or re.match(r"^\\S+\\.tex:\\d+: ", line):\n            picked.extend(lines[i:i + 4])\n            picked.append("")\n        if len(picked) > 30:\n            break\n    if blg_path and os.path.isfile(blg_path):\n        with open(blg_path, encoding="utf-8", errors="replace") as fh:\n            picked.extend(l for l in fh.read().split("\\n") if l.startswith(("ERROR", "FATAL")))\n    if not picked and not lines:\n        print("LaTeX failed and left no log.")\n        return\n    print("\\n".join(picked).strip() or "\\n".join(lines[-20:]).strip())\n\n\ndef main(argv):\n    if len(argv) < 2:\n        print(__doc__)\n        return 2\n    cmd, args = argv[1], argv[2:]\n    if cmd == "env" and len(args) == 1:\n        cmd_env(*args)\n    elif cmd == "deliver" and len(args) == 1:\n        cmd_deliver(*args)\n    elif cmd == "latex-errors" and len(args) in (1, 2):\n        cmd_latex_errors(*args)\n    elif cmd == "status-fail" and len(args) == 2:\n        status({"ok": False, "stage": args[0], "message": args[1]})\n    else:\n        print(__doc__)\n        return 2\n    return 0\n\n\nif __name__ == "__main__":\n    sys.exit(main(sys.argv))\n';

// renderer/lib.sh
var lib_default = '# lib.sh \u2014 media and biber helpers for render-pdf.sh. Sourced, not run directly.\n#\n# Copied from virtual-outliner\'s renderer/lib.sh (itself forked from\n# ~/.claude/scripts/lib/md-convert-lib.sh). This copy ships inside the Render\n# Doc plugin bundle and is written to\n# ~/Library/Application Support/render-doc/renderer/<version>/ on first export,\n# so every path here is relative to the renderer folder, never ~/.claude.\n\n: ${IMG_MAX_WIDTH:=1600}\n# `=` not `:=`: an explicitly empty PNGQUANT_QUALITY="" must disable pngquant.\n: ${PNGQUANT_QUALITY=65-90}\n\nlog() { print -r -- "$(date \'+%Y-%m-%d %H:%M:%S\') $*" >>"${LOG:-/dev/null}" }\n\nhuman_size() {\n  local bytes=$1\n  if (( bytes >= 1048576 )); then\n    printf "%.1f MB" $(( bytes / 1048576.0 ))\n  else\n    printf "%d KB" $(( bytes / 1024 ))\n  fi\n}\n\n# Real format of a file, as a bare extension ("png", "jpg", "webp", ...).\nreal_format() {\n  local mime\n  mime=$(file -b --mime-type -- "$1" 2>/dev/null)\n  case $mime in\n    image/png)             print png  ;;\n    image/jpeg)            print jpg  ;;\n    image/webp)            print webp ;;\n    image/gif)             print gif  ;;\n    image/tiff)            print tiff ;;\n    image/svg+xml|text/*)  print svg  ;;\n    application/pdf)       print pdf  ;;\n    *)                     print ""   ;;\n  esac\n}\n\n# Convert $1 to PNG at $2. Returns non-zero if no converter could handle it.\nto_png() {\n  local src=$1 dst=$2\n  if [[ $(real_format "$src") == webp ]] && (( $+commands[dwebp] )); then\n    dwebp -quiet "$src" -o "$dst" && return 0\n  fi\n  if (( $+commands[magick] )); then\n    magick "$src" "$dst" && return 0\n  fi\n  sips -s format png "$src" --out "$dst" >/dev/null 2>&1\n}\n\n# Make every file under $1 actually be what its extension claims (CDNs lie).\n# Files with an extension lualatex can use (png/jpg/pdf) are converted in place;\n# files it cannot use at all (.webp, .gif, ...) get a new .png beside them and\n# the rename is echoed as "old<TAB>new" for the caller to patch into doc.tex.\nsanitize_media() {\n  local dir=$1\n  local f ext real png\n  [[ -d $dir ]] || return 0\n\n  for f in $dir/**/*(.N); do\n    ext=${${f:e}:l}\n    real=$(real_format "$f")\n\n    [[ -z $real || $real == svg ]] && continue\n    [[ $real == $ext ]] && continue\n    [[ $real == jpg && $ext == jpeg ]] && continue\n\n    case $ext in\n      png|jpg|jpeg)\n        if to_png "$f" "$f.tmp.png"; then\n          mv -f "$f.tmp.png" "$f"\n          log "  transcoded $real -> $ext: ${f:t}"\n        else\n          rm -f "$f.tmp.png"\n          log "  WARNING: could not transcode ${f:t} ($real)"\n        fi\n        ;;\n      *)\n        png="${f:r}.png"\n        if to_png "$f" "$png"; then\n          rm -f "$f"\n          print -r -- "${f:t}	${png:t}"\n          log "  converted $real -> png (renamed): ${f:t} -> ${png:t}"\n        else\n          log "  WARNING: could not convert ${f:t} ($real)"\n        fi\n        ;;\n    esac\n  done\n}\n\n# Shrink every PNG under $1: cap width at IMG_MAX_WIDTH, then lossy-recompress\n# with pngquant when it is installed. Never fatal, never makes a file bigger.\noptimize_media() {\n  local dir=$1\n  local f width before after\n  [[ -d $dir ]] || return 0\n\n  for f in $dir/**/*.png(.N); do\n    before=$(stat -f%z "$f")\n\n    if (( IMG_MAX_WIDTH > 0 )); then\n      width=$(sips -g pixelWidth "$f" 2>/dev/null | awk \'/pixelWidth/{print $2}\')\n      if [[ -n $width ]] && (( width > IMG_MAX_WIDTH )); then\n        sips --resampleWidth "$IMG_MAX_WIDTH" "$f" >/dev/null 2>&1\n      fi\n    fi\n\n    if [[ -n $PNGQUANT_QUALITY ]] && (( $+commands[pngquant] )); then\n      pngquant --quality="$PNGQUANT_QUALITY" --speed 1 --strip \\\n        --skip-if-larger --force --output "$f" -- "$f" 2>/dev/null\n    fi\n\n    after=$(stat -f%z "$f")\n    (( after < before )) && log "  optimized ${f:t}: $(human_size $before) -> $(human_size $after)"\n  done\n}\n\n# A biber that runs, printed as a command path. TeX Live\'s macOS biber is a\n# universal binary whose wrapper unpacks its native slice with /usr/bin/lipo on\n# first run; on some macOS/Xcode releases that unpack fails ("extracting arm64\n# binary with lipo failed") and biber never starts. When that happens, extract\n# the slice once with lipo ourselves into ~/Library/Caches/render-doc (or\n# $RENDER_DOC_CACHE, which the integration test points at its temp folder).\nresolve_biber() {\n  if biber --version >/dev/null 2>&1; then\n    print -r -- biber\n    return 0\n  fi\n  local src=${commands[biber]:-} arch=$(uname -m)\n  [[ -n $src ]] || return 1\n  local cache=${RENDER_DOC_CACHE:-$HOME/Library/Caches/render-doc}\n  local thin="$cache/biber-$arch-$(stat -f%m "$src")"\n  log "  biber --version failed; using a $arch slice at $thin"\n  if [[ ! -x $thin ]]; then\n    mkdir -p "$cache" || return 1\n    if ! /usr/bin/lipo "$src" -thin "$arch" -output "$thin.partial" >>"${LOG:-/dev/null}" 2>&1; then\n      rm -f "$thin.partial"\n      return 1\n    fi\n    mv -f "$thin.partial" "$thin"\n  fi\n  "$thin" --version >/dev/null 2>&1 || return 1\n  print -r -- "$thin"\n}\n';

// renderer/lists.py
var lists_default = `#!/usr/bin/env python3
"""Insert a blank line before a top-level list that starts immediately
after a paragraph line, with no blank line between them.

Pandoc's markdown reader (unlike CommonMark) never lets a list interrupt
a paragraph -- a list item with no blank line before it is read as a lazy
continuation of the preceding paragraph's text, numbers and all. Verified
experimentally: round-tripping a file through \`pandoc -t markdown\` turns

    **Assumptions**
    1. All five questions are relevant...
    2. Necessary data is available.

into a single run-on paragraph ("**Assumptions** 1. All five questions
are relevant... 2. Necessary data is available."), silently destroying
the list. This is the exact "number conversion failed" failure mode seen
in the Md-PDF/Md-Tex output. Obsidian (and CommonMark generally) renders
the same source as a proper list, so the source files are never wrong --
only pandoc's stricter blank-line requirement needs satisfying, and a
blank line before the list is invisible to every other renderer.

This only touches column-0 (top-level) list markers preceded by a
non-blank, non-list line, and leaves fenced code blocks alone. Indented
sub-list items are never touched -- they nest under an already-recognized
list item, so the interruption ambiguity doesn't apply to them.

Usage: lists.py <input.md> <output.md>
"""
import re
import sys

FENCE = re.compile(r'^\\s*(\`\`\`|~~~)')
TOP_LIST_ITEM = re.compile(r'^(\\d+[.)]|[-*+])\\s')
ANY_LIST_ITEM = re.compile(r'^\\s*(\\d+[.)]|[-*+])\\s')


def process(text):
    lines = text.split('\\n')
    out = []
    in_fence = False
    prev = None

    for line in lines:
        if FENCE.match(line):
            in_fence = not in_fence
            out.append(line)
            prev = line
            continue

        if (not in_fence and TOP_LIST_ITEM.match(line)
                and prev is not None and prev.strip() != ''
                and not ANY_LIST_ITEM.match(prev)):
            out.append('')

        out.append(line)
        prev = line

    return '\\n'.join(out)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding='utf-8') as fh:
        text = fh.read()
    with open(dst, 'w', encoding='utf-8') as fh:
        fh.write(process(text))


if __name__ == '__main__':
    main()
`;

// renderer/render-pdf.sh
var render_pdf_default = '#!/bin/zsh\n# render-pdf.sh \u2014 typeset one prepared build folder and deliver the export folder.\n#\n#   zsh render-pdf.sh --job /path/to/build/job.json\n#\n# Copied and simplified from virtual-outliner\'s renderer/render-pdf.sh. The\n# build folder is the folder holding job.json; the plugin has already written\n# source.md, meta.tex, preamble.tex (LatexPre.tex, staged by stream copy),\n# cite.tex, after.tex, meta.json and refs.bib there. job.py documents job.json.\n#\n# Pipeline: table widths -> list breaks -> pandoc to a standalone doc.tex\n# (preamble inlined via -H, images extracted to media/) -> sanitize/optimize\n# media -> table row lines -> latexmk -lualatex (runs biber) -> job.py deliver,\n# which creates <parentDir>/<folderName> with a non-recursive mkdir (or, when\n# the job says "overwrite", reuses the existing folder) and copies ONLY\n# <stem>.pdf, <stem>.tex, refs.bib and media/ into it. Every latexmk/biber\n# intermediate stays in the build folder.\n#\n# The LAST line on stdout is always one JSON status object, which is what the\n# plugin parses: {"ok":true,"output":\u2026} or {"ok":false,"stage":\u2026,"message":\u2026}.\n# Everything else goes to render.log in the build folder.\n#\n# Run with /bin/zsh explicitly: sync services drop the executable bit, so\n# nothing here relies on it.\n\nemulate -L zsh\nsetopt no_nomatch pipe_fail\nset -u\n\nHERE=${0:A:h}\nexport PATH=/opt/homebrew/bin:/usr/local/bin:/Library/TeX/texbin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}\n\nJOB=""\nwhile (( $# )); do\n  case $1 in\n    --job) JOB=${2:-}; shift 2 ;;\n    *) shift ;;\n  esac\ndone\n\nPY=python3\n(( $+commands[python3] )) || PY=/usr/bin/python3\n\nfail_json() {\n  # stage, message\n  "$PY" "$HERE/job.py" status-fail "$1" "$2" 2>/dev/null \\\n    || print -r -- \'{"ok":false,"stage":"\'"$1"\'","message":"renderer failure"}\'\n  exit 1\n}\n\n[[ -n $JOB && -f $JOB ]] || fail_json args "No job file given (expected --job <job.json>)."\nJOB=${JOB:A}\nBUILD=${JOB:h}\ncd "$BUILD" || fail_json args "Cannot enter build folder $BUILD"\n\nLOG="$BUILD/render.log"\nsource "$HERE/lib.sh"\nrm -rf media doc.* work*.md pandoc.out latexmk.out rd.latexmkrc\nlog "=== render $JOB"\n\nfor tool in pandoc latexmk lualatex biber; do\n  (( $+commands[$tool] )) || fail_json tools "$tool was not found. Install pandoc and MacTeX (latexmk, lualatex, biber)."\ndone\n\n# Shell assignments for the job\'s fields (values shell-quoted by job.py).\nENV_OUT=$("$PY" "$HERE/job.py" env "$JOB" 2>>"$LOG") || fail_json job "$(tail -3 "$LOG")"\neval "$ENV_OUT"\n\n"$PY" "$HERE/tables.py" "$JOB_SOURCE" work-tables.md 2>>"$LOG" || cp "$JOB_SOURCE" work-tables.md\n"$PY" "$HERE/lists.py" work-tables.md work-final.md 2>>"$LOG" || cp work-tables.md work-final.md\n\nargs=(\n  -f markdown+mark\n  -t latex -s -o doc.tex\n  --extract-media=media\n  --resource-path="$BUILD:$JOB_RESOURCE_PATH"\n  --metadata-file="$JOB_METADATA"\n  -V fontsize=12pt -V papersize=letter\n)\nfor header in "${(@ps:\\n:)JOB_HEADERS}"; do\n  [[ -n $header ]] && args+=(-H "$header")\ndone\n[[ -n $JOB_AFTER ]] && args+=(-A "$JOB_AFTER")\n(( JOB_HEADING_SHIFT )) && args+=(--shift-heading-level-by="$JOB_HEADING_SHIFT")\n\nlog "  pandoc ${args[*]}"\nif ! pandoc work-final.md "${args[@]}" >pandoc.out 2>&1; then\n  cat pandoc.out >>"$LOG"\n  fail_json pandoc "$(tail -15 pandoc.out)"\nfi\n[[ -s pandoc.out ]] && cat pandoc.out >>"$LOG"\n\nrenames=$(sanitize_media media)\nif [[ -n $renames ]]; then\n  while IFS=$\'\\t\' read -r old new; do\n    [[ -n $old ]] || continue\n    LC_ALL=C sed -i \'\' "s|media/${old}|media/${new}|g" doc.tex\n  done <<< "$renames"\nfi\noptimize_media media\n"$PY" "$HERE/rowlines.py" doc.tex >>"$LOG" 2>&1\n\nlatexmk_args=(-lualatex -interaction=nonstopmode -halt-on-error -file-line-error)\nif [[ -n $JOB_BIBLIOGRAPHY ]]; then\n  BIBER=$(resolve_biber) || fail_json tools "biber is installed but will not run on this Mac. See $LOG."\n  log "  biber: $BIBER"\n  print -r -- "\\$biber = q{\\"$BIBER\\" %O %S};" > rd.latexmkrc\n  latexmk_args+=(-r rd.latexmkrc)\nfi\n\nlog "  latexmk ${latexmk_args[*]}"\nif ! latexmk "${latexmk_args[@]}" doc.tex >latexmk.out 2>&1; then\n  fail_json latex "$("$PY" "$HERE/job.py" latex-errors doc.log doc.blg 2>/dev/null)"\nfi\n\n"$PY" "$HERE/job.py" deliver "$JOB" 2>>"$LOG"\n';

// renderer/rowlines.py
var rowlines_default = `#!/usr/bin/env python3
"""Insert a light grey \\\\hline after every body row of every pandoc-generated
longtable, so tables get a rule between rows instead of just top/mid/bottom.

Pandoc's longtable output always has the shape:
    \\\\begin{longtable}[]{...}
    \\\\toprule\\\\noalign{}
    <header row> \\\\\\\\
    \\\\midrule\\\\noalign{}
    \\\\endhead
    \\\\bottomrule\\\\noalign{}
    \\\\endlastfoot
    <body row> \\\\\\\\
    <body row> \\\\\\\\
    ...
    \\\\end{longtable}
\\\\bottomrule is a "last page footer" (\\\\endlastfoot) \u2014 longtable defers it and
actually renders it right after the final body row, so the last row is left
alone here to avoid a double line right on top of that rule.

A row may wrap across several physical lines (pandoc wraps at ~80 cols); only
the line ending the row actually ends in "\\\\\\\\", so matching on that is safe.

Requires \\\\usepackage{colortbl} and \\\\definecolor{rowline}{...} in the preamble
(see default-preamble.tex) \u2014 this script only touches the table body.

Usage: rowlines.py FILE [FILE ...]
Edits in place; prints a count of insertions per file.
"""
import re
import sys

ROW_END = re.compile(r'\\\\\\\\\\s*$')
RULE_LINE = '\\\\arrayrulecolor{rowline}\\\\hline'


def fix(path):
    with open(path, encoding='utf-8') as fh:
        lines = fh.read().split('\\n')

    # Pass 1: find every body-row-ending line index, per longtable block.
    row_end_indices = []
    in_body = False
    rows_this_table = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('\\\\begin{longtable}'):
            in_body = False
        elif stripped == '\\\\endlastfoot':
            in_body = True
            rows_this_table = 0
        elif stripped.startswith('\\\\end{longtable}'):
            if rows_this_table and row_end_indices[-1][1] == 'pending':
                # last row of this table: don't mark it, drop the pending tag
                row_end_indices[-1][1] = 'skip'
            in_body = False
        elif in_body and ROW_END.search(line):
            row_end_indices.append([i, 'pending'])
            rows_this_table += 1

    # Anything still 'pending' after the scan is a genuine row to rule under;
    # only the row immediately preceding \\end{longtable} was downgraded above.
    insert_after = {idx for idx, tag in row_end_indices if tag == 'pending'}

    out = []
    inserted = 0
    for i, line in enumerate(lines):
        out.append(line)
        if i in insert_after:
            out.append(RULE_LINE)
            inserted += 1

    if inserted:
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write('\\n'.join(out))
    print(f"{inserted} row line(s) inserted: {path}")


if __name__ == '__main__':
    for p in sys.argv[1:]:
        fix(p)
`;

// renderer/tables.py
var tables_default = `#!/usr/bin/env python3
"""Rewrite pipe-table separator rows so column widths are proportional to
real cell content, instead of whatever pandoc defaults to.

Pandoc's pipe-table reader takes each column's *relative* width straight
from the dash-run length in the header/body separator row -- it never looks
at actual cell content to size columns. Verified experimentally: a table
whose separator is a minimal "|---|---|---|" renders every column at an
equal 1/3 width in LaTeX, no matter how long the cells are. A table whose
separator dashes are already padded to match each column's widest cell (as
Obsidian's own table formatter does) renders with sane proportional widths.
That's the whole difference between a table that looks right after
conversion and one that doesn't -- this script does that padding
mechanically for every pipe table in a file, without touching cell content,
so it doesn't matter whether the source table was ever run through a
formatter.

Usage: tables.py <input.md> <output.md>
"""
import re
import sys

SEP_CELL = re.compile(r'^\\s*(:?)-+(:?)\\s*$')
FENCE = re.compile(r'^\\s*(\`\`\`|~~~)')


def split_row(line):
    line = line.rstrip('\\n')
    stripped = line.strip()
    if stripped.startswith('|'):
        stripped = stripped[1:]
    if stripped.endswith('|') and not stripped.endswith('\\\\|'):
        stripped = stripped[:-1]
    return re.split(r'(?<!\\\\)\\|', stripped)


def is_separator_row(cells):
    return len(cells) > 0 and all(SEP_CELL.match(c) for c in cells)


def rebuild_separator(cells, widths):
    out = []
    for cell, width in zip(cells, widths):
        m = SEP_CELL.match(cell)
        left, right = (m.group(1), m.group(2)) if m else ('', '')
        dash_len = max(3, width) - len(left) - len(right)
        dash_len = max(1, dash_len)
        out.append(left + '-' * dash_len + right)
    return '| ' + ' | '.join(out) + ' |'


def process(text):
    lines = text.split('\\n')
    n = len(lines)
    out = []
    i = 0
    in_fence = False
    while i < n:
        line = lines[i]

        if FENCE.match(line):
            in_fence = not in_fence
            out.append(line)
            i += 1
            continue

        if (not in_fence and '|' in line and i + 1 < n and '|' in lines[i + 1]):
            header_cells = split_row(line)
            sep_cells = split_row(lines[i + 1])
            if len(sep_cells) == len(header_cells) and is_separator_row(sep_cells):
                j = i + 2
                body = []
                while j < n and lines[j].strip() != '' and '|' in lines[j]:
                    body.append(split_row(lines[j]))
                    j += 1

                ncols = len(header_cells)
                widths = [len(c.strip()) for c in header_cells]
                for row in body:
                    for c in range(min(ncols, len(row))):
                        widths[c] = max(widths[c], len(row[c].strip()))

                out.append(line)
                out.append(rebuild_separator(sep_cells, widths))
                out.extend(lines[i + 2:j])
                i = j
                continue

        out.append(line)
        i += 1

    return '\\n'.join(out)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding='utf-8') as fh:
        text = fh.read()
    with open(dst, 'w', encoding='utf-8') as fh:
        fh.write(process(text))


if __name__ == '__main__':
    main()
`;

// src/export/rendererFiles.ts
var RENDERER_FILES = {
  "render-pdf.sh": render_pdf_default,
  "lib.sh": lib_default,
  "job.py": job_default,
  "tables.py": tables_default,
  "lists.py": lists_default,
  "rowlines.py": rowlines_default
};

// src/export/installer.ts
var KEEP_VERSIONS = 3;
var BUILD_DIR_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
function supportDir() {
  const { path, os } = node();
  return path.join(os.homedir(), "Library", "Application Support", "render-doc");
}
function buildRoot() {
  const { path, os } = node();
  return path.join(os.tmpdir(), "render-doc-build");
}
function rendererHash() {
  var _a;
  const hash = node().crypto.createHash("sha256");
  for (const name of Object.keys(RENDERER_FILES).sort()) {
    hash.update(name).update("\0").update((_a = RENDERER_FILES[name]) != null ? _a : "").update("\0");
  }
  return hash.digest("hex").slice(0, 8);
}
async function ensureRenderer(pluginVersion) {
  const { fs, path, crypto } = node();
  const root = path.join(supportDir(), "renderer");
  const name = `${pluginVersion}-${rendererHash()}`;
  const dir = path.join(root, name);
  await fs.promises.mkdir(root, { recursive: true });
  if (!fs.existsSync(path.join(dir, "render-pdf.sh"))) {
    const tmp = `${dir}.partial-${crypto.randomBytes(4).toString("hex")}`;
    for (const [rel, content] of Object.entries(RENDERER_FILES)) {
      const file = path.join(tmp, rel);
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(file, content, "utf8");
    }
    try {
      await fs.promises.rename(tmp, dir);
    } catch (e) {
      await fs.promises.rm(tmp, { recursive: true, force: true });
    }
  }
  await pruneVersions(root, name);
  return dir;
}
async function pruneVersions(root, keep) {
  const { fs, path } = node();
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  const dirs = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(root, e.name);
    const stat = await fs.promises.stat(full);
    if (e.name.includes(".partial-")) {
      if (Date.now() - stat.mtimeMs > 60 * 60 * 1e3) await fs.promises.rm(full, { recursive: true, force: true });
      continue;
    }
    dirs.push({ name: e.name, mtime: stat.mtimeMs });
  }
  dirs.sort((a, b) => b.mtime - a.mtime);
  const survivors = /* @__PURE__ */ new Set([keep, ...dirs.slice(0, KEEP_VERSIONS).map((d) => d.name)]);
  for (const d of dirs) {
    if (!survivors.has(d.name)) await fs.promises.rm(path.join(root, d.name), { recursive: true, force: true });
  }
}
function findTool(name) {
  const { fs, path } = node();
  for (const dir of SEARCH_PATH) {
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch (e) {
    }
  }
  return null;
}
var REQUIRED_TOOLS = ["pandoc", "latexmk", "lualatex", "biber", "python3"];
function missingTools() {
  return REQUIRED_TOOLS.filter((t) => findTool(t) === null);
}
async function pruneBuildDirs() {
  const { fs, path } = node();
  const root = buildRoot();
  if (!fs.existsSync(root)) return;
  for (const name of await fs.promises.readdir(root)) {
    const dir = path.join(root, name);
    const stat = await fs.promises.stat(dir).catch(() => null);
    if (stat && Date.now() - stat.mtimeMs > BUILD_DIR_MAX_AGE_MS) {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  }
}

// src/export/runRenderer.ts
var RENDER_TIMEOUT_MS = 5 * 60 * 1e3;
function runRenderer(script, jobPath, cwd) {
  const { childProcess, process } = node();
  return new Promise((resolve) => {
    var _a, _b;
    const env = { ...process.env, PATH: [...SEARCH_PATH, "/usr/sbin", "/sbin", (_a = process.env.PATH) != null ? _a : ""].join(":") };
    const child = childProcess.execFile(
      "/bin/zsh",
      [script, "--job", jobPath],
      { cwd, env, timeout: RENDER_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        var _a2, _b2, _c;
        const last = (_a2 = stdout.trim().split("\n").pop()) != null ? _a2 : "";
        try {
          const parsed = JSON.parse(last);
          if (parsed.ok === true && typeof parsed.output === "string" && typeof parsed.pdf === "string") {
            resolve({ ok: true, output: parsed.output, pdf: parsed.pdf });
            return;
          }
          resolve({ ok: false, stage: (_b2 = parsed.stage) != null ? _b2 : "render", message: (_c = parsed.message) != null ? _c : "The renderer failed." });
        } catch (e) {
          const detail = (error == null ? void 0 : error.killed) ? "The renderer timed out." : (stderr || stdout || (error == null ? void 0 : error.message) || "").trim().slice(-2e3);
          resolve({ ok: false, stage: "render", message: detail || "The renderer failed without a message." });
        }
      }
    );
    (_b = child.stdin) == null ? void 0 : _b.end();
  });
}

// src/export/staging.ts
async function stageByStream(source, destination) {
  const { fs, stream } = node();
  await stream.pipeline(fs.createReadStream(source), fs.createWriteStream(destination));
}

// src/export/exporter.ts
var IMAGE_EXTENSIONS = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "tif", "tiff", "bmp", "svg", "heic", "avif", "pdf"]);
function vaultBasePath(app) {
  const adapter = app.vault.adapter;
  return adapter instanceof import_obsidian.FileSystemAdapter ? adapter.getBasePath() : null;
}
function preamblePath() {
  const { path, os } = node();
  return path.join(os.homedir(), PREAMBLE_PATH_HOME);
}
var RenderExporter = class {
  constructor(app, pluginVersion) {
    this.app = app;
    this.pluginVersion = pluginVersion;
  }
  async plan(file, parentDir, lineNumbers) {
    var _a, _b, _c;
    const { app } = this;
    const base = vaultBasePath(app);
    if (base === null) return "Render Doc needs a vault stored on this computer.";
    const { path } = node();
    const doc = await app.vault.read(file);
    const frontmatter = (_a = app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter;
    const notes = app.vault.getMarkdownFiles().map((f) => {
      var _a2;
      return { path: f.path, frontmatter: (_a2 = app.metadataCache.getFileCache(f)) == null ? void 0 : _a2.frontmatter };
    });
    const discovery = discoverSources(file.path, frontmatter == null ? void 0 : frontmatter[CITE_SOURCES_KEY], notes, (folder) => app.vault.getFolderByPath(folder) !== null);
    const stagedImages = /* @__PURE__ */ new Map();
    const resolver = {
      resolveLink: (linkpath, fromPath) => {
        const target = app.metadataCache.getFirstLinkpathDest(linkpath, fromPath);
        if (!target) return null;
        const ext = target.extension.toLowerCase();
        return { path: target.path, kind: ext === "md" ? "markdown" : IMAGE_EXTENSIONS.has(ext) ? "image" : "other" };
      },
      readNote: async (notePath) => {
        const f = app.vault.getFileByPath(notePath);
        return f ? app.vault.cachedRead(f) : "";
      },
      stageImage: (imagePath) => {
        let rel = stagedImages.get(imagePath);
        if (rel === void 0) {
          rel = `assets/${stagedImages.size + 1}-${path.basename(imagePath)}`;
          stagedImages.set(imagePath, rel);
        }
        return rel;
      }
    };
    const prepared = await prepareDocument(doc, file.path, DEFAULT_SIGIL_CHAR, resolver, discovery.index);
    if (prepared.isEmpty) return `${file.basename} has no body text to render.`;
    const stem = safeStem(file.basename);
    return {
      file,
      meta: readDocMeta(frontmatter, file.basename),
      discovery,
      prepared,
      stagedImages,
      noteDir: path.join(base, (_c = (_b = file.parent) == null ? void 0 : _b.path) != null ? _c : ""),
      parentDir,
      folderName: stem,
      stem,
      overwrite: false,
      lineNumbers
    };
  }
  check(plan) {
    const { fs } = node();
    return checkExportTarget(plan.parentDir, plan.folderName, (p) => fs.existsSync(p));
  }
  async run(plan, progress) {
    var _a;
    const { fs, path, crypto } = node();
    const fail = (stage, message, buildDir2 = null) => ({
      ok: false,
      stage,
      message,
      buildDir: buildDir2,
      logPath: null
    });
    const base = vaultBasePath(this.app);
    if (base === null) return fail("vault", "Render Doc needs a vault stored on this computer.");
    const missing = missingTools();
    if (missing.length > 0) {
      return fail("tools", `Missing ${missing.join(", ")}. Render Doc needs pandoc, MacTeX (latexmk, lualatex, biber) and python3.`);
    }
    const preamble = preamblePath();
    if (!fs.existsSync(preamble)) return fail("preamble", `The LaTeX preamble was not found: ${preamble}`);
    const target = this.check(plan);
    if (!target.ok) return fail("folder", target.message);
    if (target.exists && !plan.overwrite) {
      return fail("folder", `${target.target} appeared after the dialog checked, so nothing was written. Render again to overwrite it.`);
    }
    let bib = "";
    const keys = plan.prepared.citations.citekeys;
    if (keys.length > 0) {
      progress("Fetching the bibliography from Zotero\u2026");
      const fetched = await fetchBibLaTeX(zoteroManagerApi(this.app), keys);
      if (!fetched.ok) return fail("zotero", fetched.message);
      bib = fetched.bib;
    }
    progress("Preparing renderer\u2026");
    const renderer = await ensureRenderer(this.pluginVersion);
    const buildDir = path.join(buildRoot(), `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`);
    await fs.promises.mkdir(path.join(buildDir, "assets"), { recursive: true });
    progress("Staging files\u2026");
    for (const [vaultPath, rel] of plan.stagedImages) {
      await fs.promises.copyFile(path.join(base, vaultPath), path.join(buildDir, rel));
    }
    const { files, job } = buildFiles(
      plan.prepared,
      plan.meta,
      {
        resourcePath: plan.noteDir,
        parentDir: plan.parentDir,
        folderName: plan.folderName.trim(),
        stem: plan.stem,
        overwrite: plan.overwrite
      },
      { lineNumbers: plan.lineNumbers }
    );
    for (const [name, content] of Object.entries(files)) {
      await fs.promises.writeFile(path.join(buildDir, name), content, "utf8");
    }
    try {
      await stageByStream(preamble, path.join(buildDir, PREAMBLE_FILE));
    } catch (e) {
      return fail("preamble", `Could not read the LaTeX preamble (${preamble}): ${e instanceof Error ? e.message : String(e)}`, buildDir);
    }
    if (job.bibliography !== "") await fs.promises.writeFile(path.join(buildDir, BIB_FILE), bib, "utf8");
    const jobPath = path.join(buildDir, "job.json");
    await fs.promises.writeFile(jobPath, `${JSON.stringify(job, null, 2)}
`, "utf8");
    progress("Typesetting\u2026");
    const status = await runRenderer(path.join(renderer, "render-pdf.sh"), jobPath, buildDir);
    if (!status.ok) {
      const log = (_a = ["doc.log", "render.log"].map((f) => path.join(buildDir, f)).find((f) => fs.existsSync(f))) != null ? _a : null;
      return { ok: false, stage: status.stage, message: status.message, buildDir, logPath: log };
    }
    await fs.promises.rm(buildDir, { recursive: true, force: true });
    return { ok: true, folder: status.output, pdf: status.pdf };
  }
};

// src/ui/renderModal.ts
var import_obsidian2 = require("obsidian");
var RenderModal = class extends import_obsidian2.Modal {
  constructor(app, plan, hooks) {
    super(app);
    this.plan = plan;
    this.hooks = hooks;
    this.statusEl = null;
    this.renderButton = null;
    this.parentText = null;
  }
  onOpen() {
    const { contentEl, plan } = this;
    this.setTitle(`Render "${plan.file.basename}"`);
    contentEl.addClass("render-doc-modal");
    new import_obsidian2.Setting(contentEl).setName("Parent folder").setDesc("The export folder is created inside this folder.").addText((text) => {
      text.setValue(plan.parentDir).onChange((v) => {
        plan.parentDir = v.trim();
        this.refresh();
      });
      text.inputEl.addClass("render-doc-path");
      this.parentText = text;
    }).addButton(
      (b) => b.setButtonText("Choose\u2026").onClick(async () => {
        var _a;
        const picked = await this.hooks.pickFolder(plan.parentDir);
        if (picked === null) return;
        plan.parentDir = picked;
        (_a = this.parentText) == null ? void 0 : _a.setValue(picked);
        this.refresh();
      })
    );
    new import_obsidian2.Setting(contentEl).setName("Folder name").setDesc("The folder holding the PDF, the .tex file, refs.bib and images. If it already exists, those files in it are overwritten.").addText(
      (text) => text.setValue(plan.folderName).onChange((v) => {
        plan.folderName = v;
        this.refresh();
      })
    );
    this.statusEl = contentEl.createDiv({ cls: "render-doc-status" });
    new import_obsidian2.Setting(contentEl).setName("Line numbers").setDesc("Number every line of text in the left margin, restarting on each page.").addToggle(
      (t) => t.setValue(plan.lineNumbers).onChange((v) => {
        plan.lineNumbers = v;
      })
    );
    this.renderSummary(contentEl.createDiv({ cls: "render-doc-summary" }));
    new import_obsidian2.Setting(contentEl).addButton((b) => {
      b.setButtonText("Render").setCta().onClick(() => {
        const check = this.hooks.check(plan);
        if (!check.ok) return;
        plan.overwrite = check.exists;
        this.close();
        this.hooks.onSubmit(plan);
      });
      this.renderButton = b;
    }).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
    this.refresh();
  }
  onClose() {
    this.contentEl.empty();
  }
  refresh() {
    var _a;
    const check = this.hooks.check(this.plan);
    (_a = this.renderButton) == null ? void 0 : _a.setDisabled(!check.ok);
    if (!this.statusEl) return;
    this.statusEl.empty();
    this.statusEl.toggleClass("mod-error", !check.ok);
    this.statusEl.toggleClass("mod-warning", check.ok && check.exists);
    this.statusEl.setText(!check.ok ? check.message : check.exists ? check.warning : `Will create ${check.target}`);
  }
  renderSummary(el) {
    const { discovery, prepared } = this.plan;
    const { citations } = prepared;
    const scope = discovery.roots.length === 0 ? "no folders" : discovery.roots.map((r) => r === "" ? "/" : r).join(", ");
    el.createEl("h4", { text: "Summary" });
    const list = el.createEl("ul");
    list.createEl("li", { text: `Source notes found: ${discovery.sources.length} (searched ${scope})` });
    list.createEl("li", {
      text: `Citations resolved: ${citations.resolved.length} (${citations.citekeys.length} distinct work${citations.citekeys.length === 1 ? "" : "s"})`
    });
    list.createEl("li", { text: `Unmatched, left highlighted: ${citations.unmatched.length}` });
    if (prepared.outlineLinesStripped > 0) {
      list.createEl("li", { text: `Outline lines stripped: ${prepared.outlineLinesStripped}` });
    }
    const warnings = [
      ...discovery.warnings,
      ...citations.unmatched.map((u) => `${u.text} \u2014 ${u.message}`),
      ...prepared.issues.map((i) => `${i.kind} embed or link: ${i.target}`)
    ];
    if (warnings.length === 0) return;
    el.createEl("h4", { text: "Warnings" });
    const wl = el.createEl("ul", { cls: "render-doc-warnings" });
    for (const w of warnings) wl.createEl("li", { text: w });
  }
};

// src/main.ts
var ERROR_NOTICE_MS = 2e4;
var RenderDocPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.settings = mergeSettings(null);
    this.busy = false;
  }
  async onload() {
    this.settings = mergeSettings(await this.loadData());
    this.exporter = new RenderExporter(this.app, this.manifest.version);
    this.addCommand({
      id: "render-current-note",
      name: "Render current note",
      checkCallback: (checking) => {
        var _a, _b;
        const file = (_b = (_a = this.app.workspace.getActiveViewOfType(import_obsidian3.MarkdownView)) == null ? void 0 : _a.file) != null ? _b : null;
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.openDialog(file);
        return true;
      }
    });
    this.app.workspace.onLayoutReady(() => {
      void pruneBuildDirs().catch(() => void 0);
    });
  }
  async openDialog(file) {
    if (this.busy) {
      new import_obsidian3.Notice("Render Doc is already rendering a note.");
      return;
    }
    const parentDir = initialParentDir(this.settings, node().os.homedir());
    const plan = await this.exporter.plan(file, parentDir, this.settings.lineNumbers);
    if (typeof plan === "string") {
      new import_obsidian3.Notice(plan);
      return;
    }
    new RenderModal(this.app, plan, {
      check: (p) => this.exporter.check(p),
      pickFolder: async (current) => {
        try {
          return await pickFolder("Choose the parent folder", current);
        } catch (e) {
          new import_obsidian3.Notice(e instanceof Error ? e.message : String(e));
          return null;
        }
      },
      onSubmit: (p) => void this.render(p)
    }).open();
  }
  async render(plan) {
    var _a;
    this.busy = true;
    this.settings.lastParentDir = plan.parentDir;
    this.settings.lineNumbers = plan.lineNumbers;
    await this.saveData(this.settings);
    const progress = new import_obsidian3.Notice("Render Doc: starting\u2026", 0);
    try {
      const outcome = await this.exporter.run(plan, (msg) => progress.setMessage(`Render Doc: ${msg}`));
      progress.hide();
      if (!outcome.ok) {
        const where = (_a = outcome.logPath) != null ? _a : outcome.buildDir;
        new import_obsidian3.Notice(`Render Doc failed (${outcome.stage}): ${outcome.message}${where ? `

Log: ${where}` : ""}`, ERROR_NOTICE_MS);
        return;
      }
      const unmatched = plan.prepared.citations.unmatched.length;
      const tail = unmatched > 0 ? `
${unmatched} citation${unmatched === 1 ? " is" : "s are"} highlighted as unmatched.` : "";
      new import_obsidian3.Notice(`Rendered to ${outcome.folder}${tail}`, 1e4);
      revealInFinder(outcome.pdf);
    } catch (e) {
      progress.hide();
      new import_obsidian3.Notice(`Render Doc failed: ${e instanceof Error ? e.message : String(e)}`, ERROR_NOTICE_MS);
    } finally {
      this.busy = false;
    }
  }
};
