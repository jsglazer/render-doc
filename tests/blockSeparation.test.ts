import { describe, expect, it } from 'vitest';

import { separateBlocks } from '../src/core/blockSeparation';

describe('separateBlocks', () => {
	it('adds the blank line pandoc needs before a heading typed under text', () => {
		expect(separateBlocks('More text here\n### State-level data\nThe next milestone')).toBe('More text here\n\n### State-level data\nThe next milestone');
	});

	it('leaves headings that already have a blank line, start the note, or follow a heading', () => {
		const md = '## Intro\n### Sub\nText\n\n## Next';
		expect(separateBlocks(md)).toBe('## Intro\n\n### Sub\nText\n\n## Next');
		expect(separateBlocks('# Top\nText')).toBe('# Top\nText');
	});

	it('does not treat #tags or headings without a space as headings', () => {
		const md = 'Text\n#tag line\n#NoSpace';
		expect(separateBlocks(md)).toBe(md);
	});

	it('separates quotes, tables and fences from the text above them', () => {
		expect(separateBlocks('Text\n> quote\n> more')).toBe('Text\n\n> quote\n> more');
		expect(separateBlocks('Text\n| a | b |\n|---|---|\n| 1 | 2 |')).toBe('Text\n\n| a | b |\n|---|---|\n| 1 | 2 |');
		expect(separateBlocks('Text\n```\ncode\n```')).toBe('Text\n\n```\ncode\n```');
	});

	it('never edits inside fenced code', () => {
		const md = '```\nline\n# not a heading\n> not a quote\n```';
		expect(separateBlocks(md)).toBe(md);
	});

	it('leaves a pipe in ordinary text alone', () => {
		const md = 'Text\nA | B is not a table';
		expect(separateBlocks(md)).toBe(md);
	});
});
