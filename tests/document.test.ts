import { describe, expect, it } from 'vitest';

import { checkExportTarget, folderNameProblem, pandocMetadata, readDocMeta, safeStem } from '../src/core/document';
import { extractBody } from '../src/core/exportBody';
import { autociteCommand, citeHeader, latexEscape, metaHeader, unmatchedCommand } from '../src/core/latex';
import type { ExportResolver } from '../src/core/obsidianMarkdown';
import { buildFiles, prepareDocument } from '../src/core/render';
import { initialParentDir, mergeSettings } from '../src/core/settings';
import type { CitationEntry } from '../src/core/sources';

describe('readDocMeta', () => {
	it('uses frontmatter title, else the basename', () => {
		expect(readDocMeta({ title: 'My Paper' }, 'note').title).toBe('My Paper');
		expect(readDocMeta({ title: '  ' }, 'note').title).toBe('note');
		expect(readDocMeta(undefined, 'note').title).toBe('note');
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
	it('detects collisions and a missing parent; never proposes overwriting', () => {
		expect(checkExportTarget('/p', 'Paper', exists)).toMatchObject({ ok: false, reason: 'collision' });
		expect(checkExportTarget('/missing', 'Paper', exists)).toMatchObject({ ok: false, reason: 'no-parent' });
		expect(checkExportTarget('/p/', 'Paper 2', exists)).toEqual({ ok: true, target: '/p/Paper 2' });
	});
});

describe('settings', () => {
	it('defaults the parent folder to _Schar/Classes, then remembers the last one', () => {
		const s = mergeSettings(undefined);
		expect(initialParentDir(s, '/Users/x')).toBe('/Users/x/Library/CloudStorage/Dropbox/_Schar/Classes');
		expect(initialParentDir(mergeSettings({ lastParentDir: '/tmp/out' }), '/Users/x')).toBe('/tmp/out');
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
	it('sets \\DocTitle escaped', () => {
		expect(metaHeader('A_B')).toContain('\\def\\DocTitle{A\\_B}');
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
		const target = { resourcePath: '/v', parentDir: '/out', folderName: 'Paper', stem: 'Paper' };
		const cited = buildFiles(await prepareDocument('(Bonica, 2018)', 'P.md', '@', resolver, index), readDocMeta({}, 'P'), target);
		expect(cited.job).toMatchObject({ bibliography: 'refs.bib', after: 'after.tex', headers: ['meta.tex', 'preamble.tex', 'cite.tex'] });
		expect(cited.files['after.tex']).toBe('\\printbibliography[title={References}]\n');

		const plain = buildFiles(await prepareDocument('No cites (Jones, 2015).', 'P.md', '@', resolver, index), readDocMeta({}, 'P'), target);
		expect(plain.job).toMatchObject({ bibliography: '', after: '' });
		expect(plain.files['after.tex']).toBeUndefined();
		expect(plain.files['cite.tex']).not.toContain('biblatex');
		expect(plain.files['cite.tex']).toContain('\\rdunmatched');
	});
});
