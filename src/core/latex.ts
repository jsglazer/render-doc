// LaTeX text the renderer needs: escaping, the raw-LaTeX spans written into
// the pandoc Markdown, and the three header/trailer files pandoc includes.
// Pure — no 'obsidian', no I/O.
//
// Include order on the pandoc command line (renderer/render-pdf.sh):
//   -H meta.tex       \DocTitle, BEFORE LatexPre.tex so its \providecommand
//                     default leaves the title alone
//   -H preamble.tex   LatexPre.tex, staged by stream copy
//   -H cite.tex       \rdunmatched always; biblatex only when the note cites;
//                     lineno only when the dialog asked for line numbers
//   -A after.tex      \printbibliography, only when the note cites
//
// No pandoc --biblatex or --citeproc: the body already carries raw \autocite
// commands (Developer Decision "biblatex loading").

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

export function metaHeader(title: string): string {
	const t = latexEscape(title);
	return [
		'% Written by Render Doc — included BEFORE LatexPre.tex, so its',
		'% \\providecommand{\\DocTitle}{} default leaves this title alone.',
		`\\def\\DocTitle{${t}}`,
		`\\AtBeginDocument{\\hypersetup{pdftitle={${t}},pdfcreator={Render Doc}}}`,
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
];

// Every line of body text numbered in the left margin, restarting on each page.
const LINE_NUMBERS = ['\\usepackage[pagewise]{lineno}', '\\linenumbers'];

export function citeHeader(withBibliography: boolean, lineNumbers = false): string {
	const lines = ['% Written by Render Doc — included AFTER LatexPre.tex.', ...UNMATCHED_MACRO];
	if (withBibliography) lines.push(...BIBLATEX);
	if (lineNumbers) lines.push(...LINE_NUMBERS);
	return `${lines.join('\n')}\n`;
}

export const BIBLIOGRAPHY_TRAILER = '\\printbibliography[title={References}]\n';
