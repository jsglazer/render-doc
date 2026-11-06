import { describe, expect, it } from 'vitest';

import { readDocMeta } from '../src/core/document';
import type { ExportResolver } from '../src/core/obsidianMarkdown';
import { buildFiles, prepareDocument } from '../src/core/render';
import type { CitationEntry } from '../src/core/sources';
import { stripTags } from '../src/core/tags';

describe('stripTags', () => {
	it('removes a tag from anywhere in a line, closing up the space', () => {
		expect(stripTags('Before #fix after.')).toBe('Before after.');
		expect(stripTags('Ends here #fix')).toBe('Ends here');
		expect(stripTags('Ends here #fix.')).toBe('Ends here.');
		expect(stripTags('#fix starts here.')).toBe('starts here.');
		expect(stripTags('Two #one #two tags.')).toBe('Two tags.');
	});
	it('handles nested, hyphenated, underscored and non-English tags', () => {
		expect(stripTags('A #to-do/later_now b #résumé c.')).toBe('A b c.');
	});
	it('keeps a hard line break after the tag', () => {
		expect(stripTags('Line #fix  \nNext')).toBe('Line  \nNext');
	});
	it('drops a line that held only a tag, keeping the paragraph whole', () => {
		expect(stripTags('One\n#fix\nTwo')).toBe('One\nTwo');
		expect(stripTags('One\n\n#fix\n\nTwo')).toBe('One\n\nTwo');
		expect(stripTags('One\n\n#fix')).toBe('One');
	});
	it('drops list items, headings and quote lines left empty', () => {
		expect(stripTags('- a\n- #fix\n- b')).toBe('- a\n- b');
		expect(stripTags('- [ ] #fix\n1. #fix\n> #fix\n## #fix\nText')).toBe('Text');
	});
	it('keeps the block prefix when text remains', () => {
		expect(stripTags('- #fix item')).toBe('- item');
		expect(stripTags('## Title #fix')).toBe('## Title');
		expect(stripTags('> quoted #fix text')).toBe('> quoted text');
	});
	it('leaves headings and everything else that is not a tag', () => {
		for (const text of ['# Heading', '## Heading two', 'Issue #123 stays', 'C# and F#', 'x#y', 'See https://a.b/#frag', '[Go](#frag)', 'Escaped \\#fix', '# ', 'A # alone']) {
			expect(stripTags(text)).toBe(text);
		}
	});
	it('leaves code and math alone', () => {
		for (const text of ['Run `git log #fix` now', '``a ` #fix`` b', '`\\autocite{K #fix}`{=latex}', 'Math $a #fix b$ here', '```\n#fix\n```', '~~~\na #fix\n~~~', '$$\n#fix\n$$', '    #fix code']) {
			expect(stripTags(text)).toBe(text);
		}
	});
	it('does not mistake money for math', () => {
		expect(stripTags('Costs $5 #fix and $6')).toBe('Costs $5 and $6');
	});
	it('strips a tag in a table cell without touching the row', () => {
		expect(stripTags('| a #fix | b |')).toBe('| a | b |');
	});
	it('strips tags in a nested list item, which is not indented code', () => {
		expect(stripTags('- a\n    - b #fix')).toBe('- a\n    - b');
	});
});

describe('Submit renders drop tags', () => {
	const resolver: ExportResolver = {
		resolveLink: (link) => (link === 'Other' ? { path: 'Other.md', kind: 'markdown' } : null),
		readNote: () => Promise.resolve('Embedded #inembed text.'),
		stageImage: () => 'assets/1-x.png',
	};
	const index = new Map<string, CitationEntry[]>([['Bonica, 2018', [{ citekey: 'Bonica-2018', path: 'S/b.md' }]]]);
	const doc = ['---', 'title: T', '---', '# Heading #fix', '', '(Bonica, 2018) says #fix so.', '#todo', 'More.', '', '![[Other]]'].join('\n');
	const target = { resourcePath: '/v', parentDir: '/out', folderName: 'P', stem: 'P', overwrite: false };

	it('Submit source.md has no tags, keeps headings and citations; Dev keeps the tags', async () => {
		const p = await prepareDocument(doc, 'P.md', '@', resolver, index);
		const submit = buildFiles(p, readDocMeta({}, 'P'), target, { mode: 'submit' }).files['source.md'];
		expect(submit).toBe(['# Heading', '', '`\\autocite{Bonica-2018}`{=latex} says so.', 'More.', '', 'Embedded text.', ''].join('\n'));
		const dev = buildFiles(p, readDocMeta({}, 'P'), target, { mode: 'dev' }).files['source.md'];
		for (const tag of ['#fix', '#todo', '#inembed']) expect(dev).toContain(tag);
		expect(buildFiles(p, readDocMeta({}, 'P'), target, { mode: 'dev', lineNumbers: true }).files['source.md']).toContain('#fix');
		expect(buildFiles(p, readDocMeta({}, 'P'), target, { mode: 'submit', lineNumbers: true }).files['source.md']).toBe(submit);
	});
});
