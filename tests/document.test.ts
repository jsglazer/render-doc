import { describe, expect, it } from 'vitest';

import { checkExportTarget, folderNameFor, folderNameProblem, formatCoverDate, pandocMetadata, readDocMeta, safeStem } from '../src/core/document';
import { extractBody, PAGE_BREAK_BLOCK } from '../src/core/exportBody';
import { autociteCommand, citeHeader, latexEscape, metaHeader, unmatchedCommand } from '../src/core/latex';
import type { ExportResolver } from '../src/core/obsidianMarkdown';
import { buildFiles, prepareDocument } from '../src/core/render';
import { DEFAULT_DEV_PREAMBLE, DEFAULT_SUBMIT_PREAMBLE, preambleFingerprint, RETIRED_DEFAULT_FINGERPRINTS } from '../src/core/preambles';
import { documentClassFor, initialParentDir, mergeSettings, preambleFor, settingsToSave } from '../src/core/settings';
import type { CitationEntry } from '../src/core/sources';

describe('readDocMeta', () => {
	it('uses frontmatter title, else the basename', () => {
		expect(readDocMeta({ title: 'My Paper' }, 'note').title).toBe('My Paper');
		expect(readDocMeta({ title: '  ' }, 'note').title).toBe('note');
		expect(readDocMeta(undefined, 'note').title).toBe('note');
	});
	it('uses the note author, else the default author', () => {
		expect(readDocMeta({ author: 'Note Author' }, 'n', 'Default').authors).toEqual(['Note Author']);
		expect(readDocMeta({}, 'n', 'Default').authors).toEqual(['Default']);
		expect(readDocMeta({}, 'n', '  ').authors).toEqual([]);
	});
	it('reads titleshort, class and prof, with the short title falling back to the title', () => {
		const m = readDocMeta({ title: 'Long Title', titleshort: 'Short', class: 'POLS 501', prof: 'Dr. Smith' }, 'n');
		expect(m).toMatchObject({ title: 'Long Title', shortTitle: 'Short', className: 'POLS 501', classNum: null, prof: 'Dr. Smith', date: null });
		expect(readDocMeta({ course: 'Methods', coursenum: '(POGO-801)' }, 'n')).toMatchObject({ className: 'Methods', classNum: '(POGO-801)' });
		expect(readDocMeta({ class: 'Methods', classnum: '(POGO-801-001)' }, 'n').classNum).toBe('(POGO-801-001)');
		expect(readDocMeta({ title: 'Long Title' }, 'n').shortTitle).toBe('Long Title');
	});
	it('has a title block only when the note has a title-block field (Update003)', () => {
		expect(readDocMeta(undefined, 'n', 'Default').hasTitleBlock).toBe(false);
		expect(readDocMeta({ tags: ['x'], cite_sources: 'Lib', title: '  ' }, 'n', 'Default').hasTitleBlock).toBe(false);
		for (const fm of [{ title: 'T' }, { titleshort: 'S' }, { author: 'A' }, { author: ['A'] }, { class: 'C' }, { course: 'C' }, { coursenum: '1' }, { classnum: 1 }, { prof: 'P' }, { date: '2026-11-03' }]) {
			expect(readDocMeta(fm, 'n').hasTitleBlock).toBe(true);
		}
	});
	it('formats the cover date like "Monday, January 1st, 2020", using today for a blank one', () => {
		expect(formatCoverDate('2020-01-01')).toBe('Wednesday, January 1st, 2020');
		expect(formatCoverDate('2026-10-28')).toBe('Wednesday, October 28th, 2026');
		expect(formatCoverDate('2026-03-22T10:00')).toBe('Sunday, March 22nd, 2026');
		expect(formatCoverDate('2026-03-23')).toBe('Monday, March 23rd, 2026');
		expect(formatCoverDate('2026-03-11')).toBe('Wednesday, March 11th, 2026');
		expect(formatCoverDate('Fall 2026')).toBe('Fall 2026');
		expect(formatCoverDate('2026-02-30')).toBe('2026-02-30');
		expect(formatCoverDate(null, new Date(2026, 9, 28))).toBe('Wednesday, October 28th, 2026');
	});
	it('passes author and date only when present', () => {
		expect(pandocMetadata(readDocMeta({}, 'n'))).toEqual({});
		expect(pandocMetadata(readDocMeta({ class: 'POLS 501' }, 'n'))).toEqual({ title: 'n' });
		expect(pandocMetadata(readDocMeta({ author: ['A', 'B'], date: '2026-10-21' }, 'n'))).toEqual({
			title: 'n',
			author: ['A', 'B'],
			date: '2026-10-21',
		});
	});
});

describe('export folder', () => {
	const existing = new Set(['/p', '/p/Paper']);
	const exists = (p: string): boolean => existing.has(p);

	it('makes a safe stem from the note name', () => {
		expect(safeStem('A/B: C.')).toBe('A-B- C');
		expect(safeStem('...')).toBe('Document');
	});
	it('suffixes the folder name with the version, swapping an existing suffix', () => {
		expect(folderNameFor('TheoryHypo', 'dev')).toBe('TheoryHypo Dev');
		expect(folderNameFor('TheoryHypo Dev', 'submit')).toBe('TheoryHypo Submit');
		expect(folderNameFor('My Draft Submit', 'dev')).toBe('My Draft Dev');
		expect(folderNameFor('Developer', 'dev')).toBe('Developer Dev');
	});
	it('rejects bad folder names', () => {
		expect(folderNameProblem('')).not.toBeNull();
		expect(folderNameProblem('..')).not.toBeNull();
		expect(folderNameProblem('a/b')).not.toBeNull();
		expect(folderNameProblem('Paper 2')).toBeNull();
	});
	it('warns, without blocking, when the folder exists; blocks a missing parent', () => {
		const existingCheck = checkExportTarget('/p', 'Paper', exists);
		expect(existingCheck).toMatchObject({ ok: true, target: '/p/Paper', exists: true });
		if (existingCheck.ok && existingCheck.exists) expect(existingCheck.warning).toMatch(/already exists.*overwrite/);
		expect(checkExportTarget('/missing', 'Paper', exists)).toMatchObject({ ok: false, reason: 'no-parent' });
		expect(checkExportTarget('/p/', 'Paper 2', exists)).toEqual({ ok: true, target: '/p/Paper 2', exists: false });
	});
});

describe('settings', () => {
	it('always opens on the default parent folder, expanding ~', () => {
		const s = mergeSettings(undefined);
		expect(initialParentDir(s, '/Users/x')).toBe('/Users/x/Library/CloudStorage/Dropbox/_Schar/Classes');
		expect(initialParentDir(mergeSettings({ defaultParentDir: '/tmp/out', lastParentDir: '/elsewhere' }), '/Users/x')).toBe('/tmp/out');
		expect(initialParentDir(mergeSettings({ defaultParentDir: '~/Papers' }), '/Users/x/')).toBe('/Users/x/Papers');
		expect(initialParentDir(mergeSettings({ defaultParentDir: '' }), '/Users/x')).toBe('/Users/x/Library/CloudStorage/Dropbox/_Schar/Classes');
		expect(s.lineNumbers).toBe(false);
		expect(mergeSettings({ lineNumbers: true }).lineNumbers).toBe(true);
	});
	it('defaults to Dev with the built-in preambles; a cleared preamble falls back to its default', () => {
		const s = mergeSettings(undefined);
		expect(s.mode).toBe('dev');
		expect(s.defaultAuthor).toBe('Joshua S. Glazer');
		expect(mergeSettings({ mode: 'submit' }).mode).toBe('submit');
		expect(mergeSettings({ mode: 'bogus' }).mode).toBe('dev');
		expect(preambleFor(s, 'dev')).toBe(DEFAULT_DEV_PREAMBLE);
		expect(preambleFor(s, 'submit')).toBe(DEFAULT_SUBMIT_PREAMBLE);
		expect(mergeSettings({ devPreamble: '  ' }).devPreamble).toBe(DEFAULT_DEV_PREAMBLE);
		expect(mergeSettings({ submitPreamble: '% mine' }).submitPreamble).toBe('% mine');
		expect(s.openFolder).toBe(false);
		expect(mergeSettings({ openFolder: true }).openFolder).toBe(true);
	});
	it('defaults the font size to 12 pt and keeps only sizes LaTeX offers', () => {
		expect(mergeSettings(undefined).fontSize).toBe(12);
		expect(mergeSettings({ fontSize: 14 }).fontSize).toBe(14);
		expect(mergeSettings({ fontSize: 13 }).fontSize).toBe(12);
		expect(mergeSettings({ fontSize: '11' }).fontSize).toBe(12);
		expect(documentClassFor(11)).toBe('article');
		expect(documentClassFor(9)).toBe('extarticle');
		expect(documentClassFor(17)).toBe('extarticle');
	});
	it('saves default preambles empty, and treats a saved old default as the current one', () => {
		const saved = settingsToSave(mergeSettings({ submitPreamble: '% mine' }));
		expect(saved.devPreamble).toBe('');
		expect(saved.submitPreamble).toBe('% mine');
		expect(mergeSettings(saved).devPreamble).toBe(DEFAULT_DEV_PREAMBLE);
		expect(RETIRED_DEFAULT_FINGERPRINTS.has(preambleFingerprint(DEFAULT_DEV_PREAMBLE))).toBe(false);
		expect(RETIRED_DEFAULT_FINGERPRINTS.has(preambleFingerprint(DEFAULT_SUBMIT_PREAMBLE))).toBe(false);
	});
});

describe('preambles', () => {
	it('Dev keeps the date/time stamp bottom right and page x of y bottom left', () => {
		expect(DEFAULT_DEV_PREAMBLE).toContain('\\fancyfoot[R]{\\scriptsize{\\dashdate{\\today} at \\dottime}}');
		expect(DEFAULT_DEV_PREAMBLE).toContain('\\fancyfoot[L]{\\scriptsize{\\thepage\\ of \\pageref{LastPage}}}');
		expect(DEFAULT_DEV_PREAMBLE).toContain('\\fancyhead[R]{\\small{\\DocAuthor}}');
	});
	it('Submit has the bold short title left, the author right, page x of y centred and no stamp', () => {
		expect(DEFAULT_SUBMIT_PREAMBLE).toContain('\\fancyhead[L]{\\small{\\textbf{\\HeaderShortTitle}}}');
		expect(DEFAULT_SUBMIT_PREAMBLE).toContain('\\fancyhead[R]{\\small{\\DocAuthor}}');
		expect(DEFAULT_SUBMIT_PREAMBLE).toContain('\\fancyfoot[C]{\\scriptsize{\\thepage\\ of \\pageref{LastPage}}}');
		expect(DEFAULT_SUBMIT_PREAMBLE).not.toContain('dottime}}');
	});
	it('Submit draws the cover page from \\maketitle; Dev has no title page', () => {
		expect(DEFAULT_SUBMIT_PREAMBLE).toContain('\\CoverLine{\\DocClass}\\CoverLine{\\DocClassNum}\\CoverLine{\\DocProf}\\CoverLine{\\DocDate}');
		expect(DEFAULT_DEV_PREAMBLE).toContain('\\renewcommand{\\maketitle}{}');
		expect(DEFAULT_DEV_PREAMBLE).not.toContain('CoverLine');
		for (const p of [DEFAULT_DEV_PREAMBLE, DEFAULT_SUBMIT_PREAMBLE]) expect(p).not.toContain('Joshua S. Glazer');
	});
});

describe('latex', () => {
	it('escapes every special character, including backticks', () => {
		expect(latexEscape('a\\b&c%d$e#f_g{h}i~j^k`l')).toBe(
			'a\\textbackslash{}b\\&c\\%d\\$e\\#f\\_g\\{h\\}i\\textasciitilde{}j\\textasciicircum{}k\\textasciigrave{}l',
		);
	});
	it('writes autocite and rdunmatched commands', () => {
		expect(autociteCommand('K', '')).toBe('\\autocite{K}');
		expect(autociteCommand('K', '12')).toBe('\\autocite[12]{K}');
		expect(unmatchedCommand('(A & B, 2000)')).toBe('\\rdunmatched{(A \\& B, 2000)}');
	});
	it('always defines \\rdunmatched with lua-ul, and biblatex only when citing', () => {
		expect(citeHeader(false)).toContain('\\highLight[yellow!40]');
		expect(citeHeader(false)).not.toContain('biblatex');
		expect(citeHeader(false)).not.toContain('colorbox');
		const withBib = citeHeader(true);
		expect(withBib).toContain('style=ext-authoryear');
		expect(withBib).toContain('\\DeclareDelimFormat{nameyeardelim}{\\addcomma\\space}');
		expect(withBib).toContain('\\DeclareDelimFormat{postnotedelim}{\\addcolon\\space}');
		expect(withBib).toContain('\\DeclareFieldFormat{postnote}{#1}');
	});
	it('defines \\rdln (margin line numbers) only when line numbers are asked for', () => {
		expect(citeHeader(true)).not.toContain('rdln');
		expect(citeHeader(false, { lineNumbers: true })).toContain('\\usepackage{marginnote}');
		expect(citeHeader(false, { lineNumbers: true })).toContain('\\DeclareRobustCommand{\\rdln}');
		expect(citeHeader(false, { lineNumbers: true })).not.toContain('lineno');
	});
	it('guards lua-ul behind \\ifLuaTeX with a soul fallback for pdfLaTeX/XeLaTeX', () => {
		const tex = citeHeader(false);
		expect(tex).toContain('\\usepackage{iftex}');
		const lua = tex.indexOf('\\ifLuaTeX');
		const els = tex.indexOf('\\else');
		const fi = tex.indexOf('\\fi');
		expect(lua).toBeGreaterThan(-1);
		expect(tex.indexOf('\\usepackage{lua-ul}')).toBeGreaterThan(lua);
		expect(tex.indexOf('\\usepackage{lua-ul}')).toBeLessThan(els);
		expect(tex.indexOf('\\usepackage{soul}')).toBeGreaterThan(els);
		expect(tex).toContain('\\newcommand{\\rdunmatched}[1]{\\hl{#1}}');
		expect(fi).toBeGreaterThan(els);
		expect(citeHeader(false, { hideUnmatched: true })).not.toContain('lua-ul');
	});
	it('prints unmatched citations as plain text when citation alerts are hidden', () => {
		expect(citeHeader(false)).toContain('\\newcommand{\\rdunmatched}[1]{\\highLight[yellow!40]{#1}}');
		const hidden = citeHeader(true, { hideUnmatched: true });
		expect(hidden).toContain('\\newcommand{\\rdunmatched}[1]{#1}');
		expect(hidden).not.toContain('\\highLight');
	});
	it('defines \\rdpagebreak as \\clearpage only when page breaks are asked for', () => {
		expect(citeHeader(false)).toContain('\\newcommand{\\rdpagebreak}{}');
		expect(citeHeader(true, { lineNumbers: true, pageBreaks: true })).toContain('\\newcommand{\\rdpagebreak}{\\clearpage}');
	});
	it('puts References on its own page under a centred heading', () => {
		expect(citeHeader(true)).toContain('\\setlength{\\bibitemsep}{.67\\baselineskip}');
		expect(citeHeader(true)).toContain('\\defbibheading{rdreferences}[\\refname]{\\section*{\\centering #1}');
	});
	it('sets the per-note macros escaped, the date formatted', () => {
		const tex = metaHeader(readDocMeta({ title: 'A_B', titleshort: 'AB', class: 'POLS & Co', date: '2020-01-01' }, 'n', 'Me'));
		expect(tex).toContain('\\def\\DocTitle{A\\_B}');
		expect(tex).toContain('\\def\\DocShortTitle{AB}');
		expect(tex).toContain('\\def\\DocAuthor{Me}');
		expect(tex).toContain('\\def\\DocClass{POLS \\& Co}');
		expect(tex).toContain('\\def\\DocProf{}');
		expect(tex).toContain('\\def\\DocClassNum{}');
		expect(tex).toContain('\\def\\DocDate{Wednesday, January 1st, 2020}');
	});
});

describe('extractBody', () => {
	it('drops frontmatter, outline entry lines and outline comment lines', () => {
		const doc = ['---', 'title: T', '---', '@ Intro', 'First sentence.', '@@ Detail', 'continues here.', '@% note to self', '', '@@p New para', 'Second.'].join('\n');
		const r = extractBody(doc);
		expect(r.body).toBe(['First sentence.', 'continues here.', '', 'Second.'].join('\n'));
		expect(r.outlineLinesStripped).toBe(3);
	});
	it('marks a page break before level-one headings past the first 15 lines below the frontmatter', () => {
		// Below the frontmatter: line 1 "# Intro" (skipped), lines 2–15 filler, line 16 "# Second" (marked).
		const filler = Array.from({ length: 14 }, (_, i) => `Line ${i + 2}.`);
		const doc = ['---', 'a: 1', 'b: 2', '---', '# Intro', ...filler, '# Second', 'Text.', '## Sub', 'More.', '```', '# not a heading', '```', 'Prose', '# Third'].join('\n');
		const body = extractBody(doc).body;
		const marker = PAGE_BREAK_BLOCK.join('\n');
		expect(body.startsWith('# Intro')).toBe(true);
		expect(body).toContain(`Line 15.\n\n${marker}\n\n# Second`);
		expect(body).toContain(`Prose\n\n${marker}\n\n# Third`);
		expect(body.split(marker)).toHaveLength(3);
	});
	it('does not mark a level-one heading on line 15 below the frontmatter, however long the frontmatter', () => {
		const lines = (headingAt: number) => [...Array.from({ length: headingAt - 1 }, (_, i) => `P${i + 1}.`), '# H', 'x'].join('\n');
		expect(extractBody(lines(15)).body).not.toContain('rdpagebreak');
		expect(extractBody(lines(16)).body).toContain('rdpagebreak');
		const longFrontmatter = ['---', ...Array.from({ length: 20 }, (_, i) => `k${i}: v`), '---'].join('\n');
		expect(extractBody(`${longFrontmatter}\n${lines(15)}`).body).not.toContain('rdpagebreak');
	});
	it('keeps the page-break mark in front of a heading that carries an Obsidian line number', async () => {
		const doc = ['---', 't: 1', '---', ...Array.from({ length: 16 }, (_, i) => `P${i + 1}.`), '# Later', 'x'].join('\n');
		const p = await prepareDocument(doc, 'P.md', '@', { resolveLink: () => null, readNote: () => Promise.resolve(''), stageImage: () => '' }, new Map());
		const marker = PAGE_BREAK_BLOCK.join('\n');
		expect(p.markdown).toContain(`${marker}\n\n# Later`);
		expect(p.numberedMarkdown).toContain(`${marker}\n\n# \`\\rdln{20}\`{=latex}Later`);
	});
	it('keeps sigil-like lines inside code fences', () => {
		const doc = ['```', '@ not an entry', '```'].join('\n');
		expect(extractBody(doc).body).toBe(doc);
	});
});

describe('prepareDocument + buildFiles', () => {
	const resolver: ExportResolver = {
		resolveLink: (link) => (link === 'fig.png' ? { path: 'img/fig.png', kind: 'image' } : link === 'Other' ? { path: 'Other.md', kind: 'markdown' } : null),
		readNote: () => Promise.resolve('---\ncitekey: x\n---\nEmbedded (Bonica, 2018: 5).'),
		stageImage: () => 'assets/1-fig.png',
	};
	const index = new Map<string, CitationEntry[]>([['Bonica, 2018', [{ citekey: 'Bonica-2018', path: 'S/b.md' }]]]);

	it('converts Obsidian syntax, then resolves citations, including in embeds', async () => {
		const doc = ['---', 'title: T', '---', '@ Outline', 'See [[Other|the other note]] (Bonica, 2018).', '', '![[fig.png|300]]', '', '![[Other]]', '%%hidden (Jones, 2015)%%'].join('\n');
		const p = await prepareDocument(doc, 'Paper.md', '@', resolver, index);
		expect(p.markdown).toBe(
			['See the other note `\\autocite{Bonica-2018}`{=latex}.', '', '![](assets/1-fig.png){width=300px}', '', 'Embedded `\\autocite[5]{Bonica-2018}`{=latex}.'].join('\n'),
		);
		expect(p.citations.citekeys).toEqual(['Bonica-2018']);
		expect(p.citations.unmatched).toEqual([]);
	});

	it('includes biblatex, refs.bib and the bibliography only when the note cites', async () => {
		const target = { resourcePath: '/v', parentDir: '/out', folderName: 'Paper', stem: 'Paper', overwrite: false };
		const cited = buildFiles(await prepareDocument('(Bonica, 2018)', 'P.md', '@', resolver, index), readDocMeta({}, 'P'), target);
		expect(cited.job).toMatchObject({ bibliography: 'refs.bib', after: 'after.tex', headers: ['meta.tex', 'preamble.tex', 'cite.tex'] });
		expect(cited.files['after.tex']).toBe('\\clearpage\n\\printbibliography[heading=rdreferences, title={References}]\n');

		const plain = buildFiles(await prepareDocument('No cites (Jones, 2015).', 'P.md', '@', resolver, index), readDocMeta({}, 'P'), target);
		expect(plain.job).toMatchObject({ bibliography: '', after: '' });
		expect(plain.files['after.tex']).toBeUndefined();
		expect(plain.files['cite.tex']).not.toContain('biblatex');
		expect(plain.files['cite.tex']).toContain('\\rdunmatched');
	});
});
