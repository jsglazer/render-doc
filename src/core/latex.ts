// LaTeX text the renderer needs: escaping, the raw-LaTeX spans written into
// the pandoc Markdown, and the three header/trailer files pandoc includes.
// Pure — no 'obsidian', no I/O.
//
// Include order on the pandoc command line (renderer/render-pdf.sh):
//   -H meta.tex       \DocTitle, \DocAuthor, … BEFORE the preamble, so its
//                     \providecommand defaults leave them alone
//   -H preamble.tex   the Dev or Submit preamble from the settings page
//   -H cite.tex       \rdunmatched always; biblatex only when the note cites;
//                     \rdln (Obsidian line numbers) only when the dialog asked
//   -A after.tex      References on a page of its own, only when the note cites
//
// No pandoc --biblatex or --citeproc: the body already carries raw \autocite
// commands (Developer Decision "biblatex loading").

import type { DocMeta } from './document';
import { formatCoverDate } from './document';

// Escapes text for a LaTeX argument. Backticks become \textasciigrave{} too,
// so the result can sit inside a pandoc raw inline span (`…`{=latex}).
export function latexEscape(text: string): string {
	let out = '';
	for (const ch of text) {
		if (ch === '\\') out += '\\textbackslash{}';
		else if ('&%$#_{}'.includes(ch)) out += `\\${ch}`;
		else if (ch === '~') out += '\\textasciitilde{}';
		else if (ch === '^') out += '\\textasciicircum{}';
		else if (ch === '`') out += '\\textasciigrave{}';
		else out += ch;
	}
	return out;
}

// An \autocite optional argument: escaped, and square brackets braced so a
// `]` in the locator cannot close the argument early.
export function latexOptionalArg(text: string): string {
	return latexEscape(text).replace(/\[/g, '{[}').replace(/\]/g, '{]}');
}

// A pandoc raw inline LaTeX span. `latex` must contain no backtick (every
// caller passes escaped text, which never does).
export function rawLatex(latex: string): string {
	return `\`${latex}\`{=latex}`;
}

export function autociteCommand(citekey: string, locator: string): string {
	return locator === '' ? `\\autocite{${citekey}}` : `\\autocite[${latexOptionalArg(locator)}]{${citekey}}`;
}

export function unmatchedCommand(text: string): string {
	return `\\rdunmatched{${latexEscape(text)}}`;
}

// The per-note macros the preambles use (see src/core/preambles.ts).
export function metaHeader(meta: DocMeta): string {
	const t = latexEscape(meta.title);
	const author = latexEscape(meta.authors.join(', '));
	const def = (name: string, value: string | null): string => `\\def\\${name}{${value === null ? '' : latexEscape(value)}}`;
	return [
		'% Written by Render Doc — included BEFORE the preamble, so its',
		'% \\providecommand defaults leave these alone.',
		`\\def\\DocTitle{${t}}`,
		def('DocShortTitle', meta.shortTitle),
		`\\def\\DocAuthor{${author}}`,
		def('DocClass', meta.className),
		def('DocProf', meta.prof),
		def('DocDate', formatCoverDate(meta.date)),
		`\\AtBeginDocument{\\hypersetup{pdftitle={${t}},pdfauthor={${author}},pdfcreator={Render Doc}}}`,
		'',
	].join('\n');
}

// Unmatched and ambiguous citation-like parentheticals stay in the text,
// highlighted. lua-ul's \highLight breaks across lines; \colorbox cannot
// (Developer Decision "Unmatched highlight").
const UNMATCHED_MACRO = [
	'\\usepackage{xcolor}',
	'\\usepackage{luacolor}',
	'\\usepackage{lua-ul}',
	'\\newcommand{\\rdunmatched}[1]{\\highLight[yellow!40]{#1}}',
];

// biblatex-ext's ext-authoryear (TeX Live 2024 has no apsa.bbx), configured so
// \autocite prints exactly (Bonica, 2018: 123) and the bibliography reads
//   Bonica, Adam. 2018. “Title.” Journal 62(4): 830–848.
const BIBLATEX = [
	'\\usepackage{csquotes}',
	'\\usepackage[backend=biber, style=ext-authoryear, maxcitenames=2, uniquename=false, uniquelist=false, dashed=false]{biblatex}',
	'\\addbibresource{refs.bib}',
	'% In-text: comma between name and year, colon before the page, no "p."',
	'\\DeclareDelimFormat{nameyeardelim}{\\addcomma\\space}',
	'\\DeclareDelimFormat{postnotedelim}{\\addcolon\\space}',
	'\\DeclareFieldFormat{postnote}{#1}',
	'\\DeclareFieldFormat{multipostnote}{#1}',
	'% Bibliography, toward APSA',
	'\\DeclareDelimFormat[bib]{nameyeardelim}{\\addperiod\\space}',
	'\\DeclareFieldFormat{biblabeldate}{#1}',
	'\\DeclareNameAlias{sortname}{family-given/given-family}',
	'\\DeclareDelimFormat[bib]{finalnamedelim}{\\addcomma\\space\\bibstring{and}\\space}',
	'\\uspunctuation',
	'\\renewbibmacro{in:}{\\ifentrytype{article}{}{\\printtext{\\bibstring{in}\\intitlepunct}}}',
	'\\DeclareFieldFormat[article]{number}{\\mkbibparens{#1}}',
	'\\DeclareDelimFormat{volnumdelim}{}',
	'\\DeclareFieldFormat{pages}{#1}',
	'\\renewcommand*{\\bibpagespunct}{\\addcolon\\space}',
	'\\defbibheading{rdreferences}[\\refname]{\\section*{\\centering #1}\\markboth{#1}{#1}}',
];

// Obsidian's line number in the left margin, beside the first printed line of
// each block (Update000; see src/core/lineMarkers.ts). \rdln must vanish from
// running heads and PDF bookmarks when it sits in a heading.
const LINE_NUMBERS = [
	'\\usepackage{marginnote}',
	'\\reversemarginpar',
	'\\makeatletter',
	'\\DeclareRobustCommand{\\rdln}[1]{\\leavevmode\\marginnote{\\hfill\\normalfont\\scriptsize\\color{gray}#1}}',
	'\\let\\rd@markright\\markright',
	'\\renewcommand*{\\markright}[1]{{\\let\\rdln\\@gobble\\rd@markright{#1}}}',
	'\\let\\rd@markboth\\markboth',
	'\\renewcommand*{\\markboth}[2]{{\\let\\rdln\\@gobble\\rd@markboth{#1}{#2}}}',
	'\\ifdefined\\pdfstringdefDisableCommands\\pdfstringdefDisableCommands{\\let\\rdln\\@gobble}\\fi',
	'\\makeatother',
];

export function citeHeader(withBibliography: boolean, lineNumbers = false): string {
	const lines = ['% Written by Render Doc — included AFTER the preamble.', ...UNMATCHED_MACRO];
	if (withBibliography) lines.push(...BIBLATEX);
	if (lineNumbers) lines.push(...LINE_NUMBERS);
	return `${lines.join('\n')}\n`;
}

// References start a new page under a centred heading (Update000).
export const BIBLIOGRAPHY_TRAILER = '\\clearpage\n\\printbibliography[heading=rdreferences, title={References}]\n';
