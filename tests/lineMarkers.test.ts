import { describe, expect, it } from 'vitest';

import { markersToLatex, markSourceLines, stripMarkers } from '../src/core/lineMarkers';
import type { ExportResolver } from '../src/core/obsidianMarkdown';
import { buildFiles, prepareDocument } from '../src/core/render';
import { readDocMeta } from '../src/core/document';
import type { CitationEntry } from '../src/core/sources';

const ln = (n: number): string => `\`\\rdln{${n}}\`{=latex}`;
const m = (n: number): string => `${n}`;

describe('markSourceLines', () => {
	it('marks each text line with its Obsidian line number, after block prefixes', () => {
		const doc = ['---', 'title: T', '---', '# Heading', 'Text.', '', '- item', '  1. nested', '- [ ] task', '> quote'].join('\n');
		expect(markSourceLines(doc, '@').split('\n')).toEqual([
			'---',
			'title: T',
			'---',
			`# ${m(4)}Heading`,
			`${m(5)}Text.`,
			'',
			`- ${m(7)}item`,
			`  1. ${m(8)}nested`,
			`- [ ] ${m(9)}task`,
			`> ${m(10)}quote`,
		]);
	});
	it('leaves code, math, tables, embeds, callouts, comments and outline lines alone', () => {
		const lines = ['```', 'code', '```', '$$', 'x^2', '$$', '| a | b |', '![[fig.png]]', '> [!note] Title', '%% c %%', '@@ entry', '---', '    indented code'];
		expect(markSourceLines(lines.join('\n'), '@')).toBe(lines.join('\n'));
	});
});

describe('markersToLatex', () => {
	it('keeps only the first marker of each printed block', () => {
		const md = [`${m(5)}One sentence`, `${m(7)}joined to it.`, '', `- ${m(9)}item`, `- ${m(10)}item`, `## ${m(12)}Head`, `${m(13)}Text`].join('\n');
		expect(markersToLatex(md).split('\n')).toEqual([`${ln(5)}One sentence`, 'joined to it.', '', `- ${ln(9)}item`, `- ${ln(10)}item`, `## ${ln(12)}Head`, `${ln(13)}Text`]);
	});
	it('strips markers for an unnumbered render', () => {
		expect(stripMarkers(`# ${m(3)}Head`)).toBe('# Head');
	});
});

describe('prepareDocument line numbers', () => {
	const resolver: ExportResolver = {
		resolveLink: (link) => (link === 'Other' ? { path: 'Other.md', kind: 'markdown' } : null),
		readNote: () => Promise.resolve('Embedded text.'),
		stageImage: () => 'assets/1-x.png',
	};
	const index = new Map<string, CitationEntry[]>([['Bonica, 2018', [{ citekey: 'Bonica-2018', path: 'S/b.md' }]]]);

	it('numbers the surviving lines with their Obsidian line numbers, citations intact', async () => {
		const doc = ['---', 'title: T', '---', '@ Outline', '(Bonica, 2018) starts this.', '### Heading', '', '![[Other]]', '', 'Last.'].join('\n');
		const p = await prepareDocument(doc, 'P.md', '@', resolver, index);
		expect(p.markdown).toBe(['`\\autocite{Bonica-2018}`{=latex} starts this.', '', '### Heading', '', 'Embedded text.', '', 'Last.'].join('\n'));
		expect(p.numberedMarkdown).toBe(
			[`${ln(5)}\`\\autocite{Bonica-2018}\`{=latex} starts this.`, '', `### ${ln(6)}Heading`, '', 'Embedded text.', '', `${ln(10)}Last.`].join('\n'),
		);
		const target = { resourcePath: '/v', parentDir: '/out', folderName: 'P', stem: 'P', overwrite: false };
		expect(buildFiles(p, readDocMeta({}, 'P'), target, { lineNumbers: true }).files['source.md']).toContain('\\rdln{10}');
		expect(buildFiles(p, readDocMeta({}, 'P'), target).files['source.md']).not.toContain('rdln');
	});
});
