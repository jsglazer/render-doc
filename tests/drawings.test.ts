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
};
const index = new Map<string, CitationEntry[]>([['Bonica, 2018', [{ citekey: 'Bonica-2018', path: 'S/b.md' }]]]);
const target = { resourcePath: '/v', parentDir: '/out', folderName: 'P', stem: 'P', overwrite: false };

async function submitOf(body: string): Promise<string> {
	return (await prepareDocument(body, 'P.md', '@', resolver, index)).submit.markdown;
}

describe('Submit leaves out Excalidraw drawings (Update006)', () => {
	it('drops an embedded drawing note, with or without a size or section', async () => {
		for (const embed of ['![[D.excalidraw]]', '![[D.excalidraw|500]]', '![[D.excalidraw|90%]]', '![[D.excalidraw.md]]', '![[D.excalidraw#^area=abc]]']) {
			expect(await submitOf(['Before.', '', embed, '', 'After.'].join('\n'))).toBe('Before.\n\nAfter.');
		}
	});
	it('drops a drawing recognised only by its frontmatter', async () => {
		expect(await submitOf('Before.\n\n![[Renamed]]\n\nAfter.')).toBe('Before.\n\nAfter.');
	});
	it('drops .excalidraw files and exported images, without a warning', async () => {
		staged.length = 0;
		for (const embed of ['![[Raw.excalidraw]]', '![[D.excalidraw.png]]', '![[D.excalidraw.dark.svg|300]]', '![](D.excalidraw.png)', '![[Gone.excalidraw]]']) {
			const p = await prepareDocument(`Before.\n\n${embed}\n\nAfter.`, 'P.md', '@', resolver, index);
			expect(p.submit.markdown).toBe('Before.\n\nAfter.');
			expect(p.submit.issues).toEqual([]);
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
	it("does not count a citation inside a drawing, in Submit", async () => {
		const p = await prepareDocument('Text.\n\n![[D.excalidraw]]', 'P.md', '@', resolver, index);
		expect(versionOf(p, 'dev').citations.citekeys).toEqual(['Bonica-2018']);
		expect(versionOf(p, 'submit').citations.citekeys).toEqual([]);
		const { files, job } = buildFiles(p, readDocMeta({}, 'P'), target, { mode: 'submit' });
		expect(job.bibliography).toBe('');
		expect(files['after.tex']).toBeUndefined();
	});
	it('Dev is unchanged', async () => {
		const p = await prepareDocument('Text.\n\n![[D.excalidraw]]', 'P.md', '@', resolver, index);
		expect(p.markdown).toContain('Excalidraw Data');
		expect(buildFiles(p, readDocMeta({}, 'P'), target, { mode: 'submit' }).files['source.md']).toBe('Text.\n');
		expect(buildFiles(p, readDocMeta({}, 'P'), target, { mode: 'dev' }).files['source.md']).toContain('Excalidraw Data');
	});
});
