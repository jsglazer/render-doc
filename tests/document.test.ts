import { describe, expect, it } from 'vitest';

import { checkExportTarget, folderNameProblem, formatCoverDate, pandocMetadata, readDocMeta, safeStem } from '../src/core/document';
import { extractBody } from '../src/core/exportBody';
import { autociteCommand, citeHeader, latexEscape, metaHeader, unmatchedCommand } from '../src/core/latex';
import type { ExportResolver } from '../src/core/obsidianMarkdown';
import { buildFiles, prepareDocument } from '../src/core/render';
import { DEFAULT_DEV_PREAMBLE, DEFAULT_SUBMIT_PREAMBLE } from '../src/core/preambles';
import { initialParentDir, mergeSettings, preambleFor } from '../src/core/settings';
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
		expect(m).toMatchObject({ title: 'Long Title', shortTitle: 'Short', className: 'POLS 501', prof: 'Dr. Smith', date: null });
		expect(readDocMeta({ title: 'Long Title' }, 'n').shortTitle).toBe('Long Title');
	});
	it('formats the cover date like "Monday, January 1st, 2020", skipping a blank one', () => {
		expect(formatCoverDate('2020-01-01')).toBe('Wednesday, January 1st, 2020');
		expect(formatCoverDate('2026-10-28')).toBe('Wednesday, October 28th, 2026');
		expect(formatCoverDate('2026-03-22T10:00')).toBe('Sunday, March 22nd, 2026');
		expect(formatCoverDate('2026-03-23')).toBe('Monday, March 23rd, 2026');
		expect(formatCoverDate('2026-03-11')).toBe('Wednesday, March 11th, 2026');
		expect(formatCoverDate('Fall 2026')).toBe('Fall 2026');
		expect(formatCoverDate('2026-02-30')).toBe('2026-02-30');
		expect(formatCoverDate(null)).toBeNull();
	});
	it('passes author and date only when present', () => {
		expect(pandocMetadata(readDocMeta({}, 'n'))).toEqual({ title: 'n' });
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
	it('both draw the cover page from \\maketitle', () => {
		for (const p of [DEFAULT_DEV_PREAMBLE, DEFAULT_SUBMIT_PREAMBLE]) {
			expect(p).toContain('\\renewcommand{\\maketitle}');
			expect(p).toContain('\\CoverLine{\\DocClass}\\CoverLine{\\DocProf}\\CoverLine{\\DocDate}');
			expect(p).not.toContain('Joshua S. Glazer');
		}
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
		expect(citeHeader(false, true)).toContain('\\usepackage{marginnote}');
		expect(citeHeader(false, true)).toContain('\\DeclareRobustCommand{\\rdln}');
		expect(citeHeader(false, true)).not.toContain('lineno');
	});
	it('puts References on its own page under a centred heading', () => {
		expect(citeHeader(true)).toContain('\\defbibheading{rdreferences}[\\refname]{\\section*{\\centering #1}');
	});
	it('sets the per-note macros escaped, the date formatted', () => {
		const tex = metaHeader(readDocMeta({ title: 'A_B', titleshort: 'AB', class: 'POLS & Co', date: '2020-01-01' }, 'n', 'Me'));
		expect(tex).toContain('\\def\\DocTitle{A\\_B}');
		expect(tex).toContain('\\def\\DocShortTitle{AB}');
		expect(tex).toContain('\\def\\DocAuthor{Me}');
		expect(tex).toContain('\\def\\DocClass{POLS \\& Co}');
		expect(tex).toContain('\\def\\DocProf{}');
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
