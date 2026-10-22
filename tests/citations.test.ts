import { describe, expect, it } from 'vitest';

import { classifyParenthetical, MULTI_WORK_MESSAGE, replaceCitations } from '../src/core/citations';
import type { CitationEntry } from '../src/core/sources';

const INDEX = new Map<string, CitationEntry[]>([
	['Bonica, 2018', [{ citekey: 'Bonica-InferringRollCallScores-2018', path: 'S/Bonica.md' }]],
	['Shor and McCarty, 2011', [{ citekey: 'ShorMcCarty-2011', path: 'S/Shor.md' }]],
	[
		'Smith, 2020',
		[
			{ citekey: 'Smith-A-2020', path: 'S/a.md' },
			{ citekey: 'Smith-B-2020', path: 'S/b.md' },
		],
	],
	[
		'Dup, 2019',
		[
			{ citekey: 'Dup-2019', path: 'S/a.md' },
			{ citekey: 'Dup-2019', path: 'S/b.md' },
		],
	],
]);

const run = (md: string): ReturnType<typeof replaceCitations> => replaceCitations(md, INDEX);

describe('classifyParenthetical', () => {
	it('recognizes (citeshort) and (citeshort: locator)', () => {
		expect(classifyParenthetical('Bonica, 2018')).toEqual({ kind: 'citation', citeshort: 'Bonica, 2018', locator: '' });
		expect(classifyParenthetical('Bonica, 2018: 123')).toEqual({ kind: 'citation', citeshort: 'Bonica, 2018', locator: '123' });
		expect(classifyParenthetical('Bonica, 2018a: 12–25')).toEqual({ kind: 'citation', citeshort: 'Bonica, 2018a', locator: '12–25' });
		expect(classifyParenthetical('Handan‐Nader et al., 2026')).toMatchObject({ kind: 'citation' });
	});

	it('never treats lowercase-led prose as a citation', () => {
		expect(classifyParenthetical('see Section 2, 2024')).toEqual({ kind: 'not-citation' });
		expect(classifyParenthetical('e.g., 2019')).toEqual({ kind: 'not-citation' });
	});

	it('ignores uppercase prose without a year and over-long parentheticals', () => {
		expect(classifyParenthetical('See Table 2')).toEqual({ kind: 'not-citation' });
		expect(classifyParenthetical('N = 1,200')).toEqual({ kind: 'not-citation' });
		expect(classifyParenthetical(`${'A'.repeat(115)}, 2018`)).toEqual({ kind: 'not-citation' });
	});

	it('flags multi-work parentheticals', () => {
		expect(classifyParenthetical('Bonica, 2018; Shor and McCarty, 2011')).toEqual({ kind: 'multi-work' });
		expect(classifyParenthetical('a; b')).toEqual({ kind: 'not-citation' });
	});
});

describe('replaceCitations', () => {
	it('replaces (citeshort) with \\autocite{key}', () => {
		const r = run('As shown (Bonica, 2018).');
		expect(r.markdown).toBe('As shown `\\autocite{Bonica-InferringRollCallScores-2018}`{=latex}.');
		expect(r.citekeys).toEqual(['Bonica-InferringRollCallScores-2018']);
		expect(r.unmatched).toEqual([]);
	});

	it('replaces (citeshort: locator) with \\autocite[locator]{key}, locator verbatim', () => {
		const r = run('Scores (Bonica, 2018: 123) and (Bonica, 2018: 123–25).');
		expect(r.markdown).toBe(
			'Scores `\\autocite[123]{Bonica-InferringRollCallScores-2018}`{=latex} and `\\autocite[123–25]{Bonica-InferringRollCallScores-2018}`{=latex}.',
		);
		expect(r.resolved.map((c) => c.locator)).toEqual(['123', '123–25']);
		expect(r.citekeys).toHaveLength(1);
	});

	it('LaTeX-escapes the locator and braces square brackets', () => {
		const r = run('(Bonica, 2018: §3 & fn_2 [b])');
		expect(r.markdown).toBe('`\\autocite[§3 \\& fn\\_2 {[}b{]}]{Bonica-InferringRollCallScores-2018}`{=latex}');
	});

	it('matches citeshort after whitespace collapsing only', () => {
		expect(run('(Shor  and McCarty,  2011)').citekeys).toEqual(['ShorMcCarty-2011']);
		expect(run('(Shor & McCarty, 2011)').citekeys).toEqual([]);
	});

	it('highlights an unmatched (Author, Year) and warns', () => {
		const r = run('Claimed (Jones, 2015: 4).');
		expect(r.markdown).toBe('Claimed `\\rdunmatched{(Jones, 2015: 4)}`{=latex}.');
		expect(r.unmatched).toEqual([{ text: '(Jones, 2015: 4)', reason: 'no-match', message: 'no source note has citeshort "Jones, 2015"' }]);
		expect(r.citekeys).toEqual([]);
	});

	it('highlights an ambiguous citeshort and names the citekeys', () => {
		const r = run('(Smith, 2020)');
		expect(r.markdown).toBe('`\\rdunmatched{(Smith, 2020)}`{=latex}');
		expect(r.unmatched[0]?.reason).toBe('ambiguous');
		expect(r.unmatched[0]?.message).toContain('Smith-A-2020, Smith-B-2020');
	});

	it('resolves duplicates that share one citekey', () => {
		expect(run('(Dup, 2019)').citekeys).toEqual(['Dup-2019']);
	});

	it('highlights multi-work citations with the fixed warning', () => {
		const r = run('(Bonica, 2018; Shor and McCarty, 2011)');
		expect(r.markdown).toBe('`\\rdunmatched{(Bonica, 2018; Shor and McCarty, 2011)}`{=latex}');
		expect(r.unmatched[0]).toMatchObject({ reason: 'multi-work', message: MULTI_WORK_MESSAGE });
	});

	it('escapes special characters inside highlighted text', () => {
		const r = run('(O_Brien & Co, 2010: 5%)');
		expect(r.markdown).toBe('`\\rdunmatched{(O\\_Brien \\& Co, 2010: 5\\%)}`{=latex}');
	});

	it('leaves prose parentheticals alone', () => {
		const md = 'Three cases (see Section 2, 2024) and (N = 1,200) and (Table 3).';
		const r = run(md);
		expect(r.markdown).toBe(md);
		expect(r.unmatched).toEqual([]);
	});

	it('never touches fenced code blocks', () => {
		const md = ['```', '(Bonica, 2018)', '```', '~~~~', '(Jones, 2015)', '~~~~'].join('\n');
		expect(run(md).markdown).toBe(md);
	});

	it('never touches inline code', () => {
		const md = 'Write `(Bonica, 2018)` or ``(Jones, 2015)``.';
		expect(run(md).markdown).toBe(md);
	});

	it('never touches inline or display math', () => {
		const inline = 'Let $f(Bonica, 2018)$ and $$g(Jones, 2015)$$ hold.';
		expect(run(inline).markdown).toBe(inline);
		const block = ['$$', 'h(Bonica, 2018)', '(Jones, 2015)', '$$', 'After (Bonica, 2018).'].join('\n');
		const r = run(block);
		expect(r.markdown.split('\n').slice(0, 4).join('\n')).toBe(['$$', 'h(Bonica, 2018)', '(Jones, 2015)', '$$'].join('\n'));
		expect(r.markdown.split('\n')[4]).toBe('After `\\autocite{Bonica-InferringRollCallScores-2018}`{=latex}.');
	});

	it('does not mistake dollar amounts for math', () => {
		const r = run('It cost $5 and $10 (Bonica, 2018).');
		expect(r.citekeys).toEqual(['Bonica-InferringRollCallScores-2018']);
	});

	it('never touches Markdown links, images or autolinks', () => {
		const md = 'See [the paper (Bonica, 2018)](https://example.com/a_(b)) and ![fig (Jones, 2015)](media/x.png) <https://x.org/(Bonica,2018)>.';
		const r = run(md);
		expect(r.unmatched).toEqual([]);
		expect(r.citekeys).toEqual([]);
	});

	it('handles several citations on one line and in footnotes', () => {
		const r = run('A (Bonica, 2018) b (Shor and McCarty, 2011: 7).^[Also (Bonica, 2018: 9).]');
		expect(r.resolved).toHaveLength(3);
		expect(r.citekeys).toEqual(['Bonica-InferringRollCallScores-2018', 'ShorMcCarty-2011']);
	});
});
