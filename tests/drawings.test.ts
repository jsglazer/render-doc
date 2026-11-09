import { describe, expect, it } from 'vitest';

import { readDocMeta } from '../src/core/document';
import type { ExportResolver } from '../src/core/obsidianMarkdown';
import { buildFiles, prepareDocument, versionOf } from '../src/core/render';
import type { CitationEntry } from '../src/core/sources';

const DRAWING = ['---', 'excalidraw-plugin: parsed', 'tags: [excalidraw]', '---', '==Switch to EXCALIDRAW VIEW== (Bonica, 2018)', '', '# Excalidraw Data', '', '## Text Elements', 'A label'].join('\n');
const NOTES: Record<string, string> = {
	'D.excalidraw.md': DRAWING,
	'Renamed.md': DRAWING,
	'Host.md': ['Host text.', '', '![[D.excalidraw]]', '', 'More host text.'].join('\n'),
	'Plain.md': 'Plain embed text.',
};
const staged: string[] = [];
const resolver: ExportResolver = {
	resolveLink: (link) => {
		if (link === 'D.excalidraw') return { path: 'D.excalidraw.md', kind: 'markdown' };
		if (link === 'Raw.excalidraw') return { path: 'Raw.excalidraw', kind: 'other' };
		if (/\.(png|svg)$/.test(link)) return { path: link, kind: 'image' };
		return `${link}.md` in NOTES ? { path: `${link}.md`, kind: 'markdown' } : null;
	},
	readNote: (path) => Promise.resolve(NOTES[path] ?? ''),
	stageImage: (path) => {
		staged.push(path);
		return `assets/${path}`;
	},
	stageDrawing: (path) => `assets/drawing-${path}.png`,
};
const index = new Map<string, CitationEntry[]>([['Bonica, 2018', [{ citekey: 'Bonica-2018', path: 'S/b.md' }]]]);
const target = { resourcePath: '/v', parentDir: '/out', folderName: 'P', stem: 'P', overwrite: false };

// "Include drawings" off: the text both modes print (Submit's, here).
async function submitOf(body: string): Promise<string> {
	return (await prepareDocument(body, 'P.md', '@', resolver, index)).noDrawings.submit.markdown;
}

// "Include drawings" on (the default).
async function withDrawings(body: string): Promise<string> {
	return (await prepareDocument(body, 'P.md', '@', resolver, index)).submit.markdown;
}

describe('"Include drawings" off leaves out Excalidraw drawings (Update006)', () => {
	it('drops an embedded drawing note, with or without a size or section', async () => {
		for (const embed of ['![[D.excalidraw]]', '![[D.excalidraw|500]]', '![[D.excalidraw|90%]]', '![[D.excalidraw.md]]', '![[D.excalidraw#^area=abc]]']) {
			expect(await submitOf(['Before.', '', embed, '', 'After.'].join('\n'))).toBe('Before.\n\nAfter.');
		}
	});
	it('drops a drawing recognised only by its frontmatter', async () => {
		expect(await submitOf('Before.\n\n![[Renamed]]\n\nAfter.')).toBe('Before.\n\nAfter.');
	});
	it('drops .excalidraw files and exported images, without a warning', async () => {
		for (const embed of ['![[Raw.excalidraw]]', '![[D.excalidraw.png]]', '![[D.excalidraw.dark.svg|300]]', '![](D.excalidraw.png)', '![[Gone.excalidraw]]']) {
			const p = await prepareDocument(`Before.\n\n${embed}\n\nAfter.`, 'P.md', '@', resolver, index);
			expect(p.noDrawings.submit.markdown).toBe('Before.\n\nAfter.');
			expect(p.noDrawings.issues).toEqual([]);
		}
	});
	it('drops a drawing inside an embedded note, keeping the rest of that note', async () => {
		expect(await submitOf('![[Host]]')).toBe('Host text.\n\nMore host text.');
	});
	it('keeps text beside an inline embed, and drops a line it leaves empty', async () => {
		expect(await submitOf('See ![[D.excalidraw]] here.')).toBe('See  here.');
		expect(await submitOf('- a\n- ![[D.excalidraw]]\n- b')).toBe('- a\n- b');
		expect(await submitOf('> ![[D.excalidraw]]\n\nText.')).toBe('Text.');
	});
	it('leaves ordinary embeds and images alone', async () => {
		expect(await submitOf('![[Plain]]')).toBe('Plain embed text.');
		expect(await submitOf('![[photo.png]]')).toBe('![](assets/photo.png)');
	});
	it('Dev leaves them out too', async () => {
		const p = await prepareDocument('Text.\n\n![[D.excalidraw]]', 'P.md', '@', resolver, index);
		expect(buildFiles(p, readDocMeta({}, 'P'), target, { mode: 'dev', drawings: false }).files['source.md']).toBe('Text.\n');
		expect(buildFiles(p, readDocMeta({}, 'P'), target, { mode: 'submit', drawings: false }).files['source.md']).toBe('Text.\n');
	});
});

describe('"Include drawings" on prints Excalidraw drawings as pictures', () => {
	it('turns an embedded drawing note into a staged PNG, keeping its size', async () => {
		expect(await withDrawings('![[D.excalidraw]]')).toBe('![](assets/drawing-D.excalidraw.md.png)');
		expect(await withDrawings('![[D.excalidraw|500]]')).toBe('![](assets/drawing-D.excalidraw.md.png){width=500px}');
		expect(await withDrawings('![[D.excalidraw|100%]]')).toBe('![](assets/drawing-D.excalidraw.md.png){width=100%}');
		expect(await withDrawings('![[Renamed]]')).toBe('![](assets/drawing-Renamed.md.png)');
		expect(await withDrawings('![[Raw.excalidraw]]')).toBe('![](assets/drawing-Raw.excalidraw.png)');
	});
	it('prints an exported drawing image as an ordinary image', async () => {
		expect(await withDrawings('![[D.excalidraw.png]]')).toBe('![](assets/D.excalidraw.png)');
	});
	it('handles a drawing inside an embedded note', async () => {
		expect(await withDrawings('![[Host]]')).toBe('Host text.\n\n![](assets/drawing-D.excalidraw.md.png)\n\nMore host text.');
	});
	it("never prints the drawing note's text, or counts a citation in it, in either mode", async () => {
		const p = await prepareDocument('Text.\n\n![[D.excalidraw]]', 'P.md', '@', resolver, index);
		expect(versionOf(p, true).citations.citekeys).toEqual([]);
		expect(versionOf(p, false).citations.citekeys).toEqual([]);
		for (const mode of ['dev', 'submit'] as const) {
			const { files, job } = buildFiles(p, readDocMeta({}, 'P'), target, { mode });
			expect(files['source.md']).toBe('Text.\n\n![](assets/drawing-D.excalidraw.md.png)\n');
			expect(files['source.md']).not.toContain('Excalidraw Data');
			expect(job.bibliography).toBe('');
		}
	});
	it('without a stageDrawing hook, prints nothing for the drawing', async () => {
		const bare: ExportResolver = { ...resolver, stageDrawing: undefined };
		expect((await prepareDocument('A.\n\n![[D.excalidraw]]\n\nB.', 'P.md', '@', bare, index)).submit.markdown).toBe('A.\n\nB.');
	});
});
