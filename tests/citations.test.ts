import { describe, expect, it } from 'vitest';

import { classifyParenthetical, MULTI_WORK_MESSAGE, OLD_FORMAT_MESSAGE, replaceCitations } from '../src/core/citations';
import type { CitationEntry } from '../src/core/sources';

const INDEX = new Map<string, CitationEntry[]>([
	['Bonica 2018', [{ citekey: 'Bonica-InferringRollCallScores-2018', path: 'S/Bonica.md' }]],
	['Shor and McCarty 2011', [{ citekey: 'ShorMcCarty-2011', path: 'S/Shor.md' }]],
	['Shor and McCarty 2022', [{ citekey: 'ShorMcCarty-2022', path: 'S/Shor22.md' }]],
	[
		'Smith 2020',
		[
			{ citekey: 'Smith-A-2020', path: 'S/a.md' },
			{ citekey: 'Smith-B-2020', path: 'S/b.md' },
		],
	],
	[
		'Dup 2019',
		[
			{ citekey: 'Dup-2019', path: 'S/a.md' },
			{ citekey: 'Dup-2019', path: 'S/b.md' },
		],
	],
]);

const run = (md: string): ReturnType<typeof replaceCitations> => replaceCitations(md, INDEX);

describe('classifyParenthetical', () => {
	it('recognizes (citeshort) and (citeshort: locator)', () => {
		expect(classifyParenthetical('Bonica 2018')).toEqual({ kind: 'citation', citeshort: 'Bonica 2018', locator: '' });
		expect(classifyParenthetical('Bonica 2018: 123')).toEqual({ kind: 'citation', citeshort: 'Bonica 2018', locator: '123' });
		expect(classifyParenthetical('Bonica 2018a: 12–25')).toEqual({ kind: 'citation', citeshort: 'Bonica 2018a', locator: '12–25' });
		expect(classifyParenthetical('Handan‐Nader et al. 2026')).toMatchObject({ kind: 'citation' });
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

	it('splits multi-work parentheticals into parts', () => {
		expect(classifyParenthetical('Bonica 2018; Shor and McCarty 2011: 5')).toEqual({
			kind: 'multi',
			parts: [
				{ citeshort: 'Bonica 2018', locator: '' },
				{ citeshort: 'Shor and McCarty 2011', locator: '5' },
			],
		});
		expect(classifyParenthetical('Bonica 2018;')).toEqual({ kind: 'citation', citeshort: 'Bonica 2018', locator: '' });
		expect(classifyParenthetical('Bonica 2018; see also Table 2')).toEqual({ kind: 'multi-work', bad: ['see also Table 2'] });
		expect(classifyParenthetical('a; b')).toEqual({ kind: 'not-citation' });
	});

	it('splits one author\'s works into parts, a page per work', () => {
		expect(classifyParenthetical('Barber 2016, 2022')).toEqual({
			kind: 'multi',
			parts: [
				{ citeshort: 'Barber 2016', locator: '' },
				{ citeshort: 'Barber 2022', locator: '' },
			],
		});
		expect(classifyParenthetical('Barber 2016: 12, 2022a: 5–7; Duca 2017')).toEqual({
			kind: 'multi',
			parts: [
				{ citeshort: 'Barber 2016', locator: '12' },
				{ citeshort: 'Barber 2022a', locator: '5–7' },
				{ citeshort: 'Duca 2017', locator: '' },
			],
		});
	});

	it('keeps non-year commas in the locator and in multi-author text', () => {
		expect(classifyParenthetical('Tsai 2007: 356, 358')).toEqual({ kind: 'citation', citeshort: 'Tsai 2007', locator: '356, 358' });
		expect(classifyParenthetical('Alesina, Baqir and Easterly 1999')).toEqual({ kind: 'citation', citeshort: 'Alesina, Baqir and Easterly 1999', locator: '' });
		expect(classifyParenthetical('Evolution of Penalties, 2000–2022')).toEqual({ kind: 'not-citation' });
	});

	it('flags the old (Author, Year) form', () => {
		expect(classifyParenthetical('Bonica, 2018: 12')).toEqual({ kind: 'old-format', bad: ['Bonica, 2018: 12'] });
		expect(classifyParenthetical('Hall 2014; Barber, 2016, 2022')).toEqual({ kind: 'old-format', bad: ['Barber, 2016, 2022'] });
	});
});

describe('replaceCitations', () => {
	it('replaces (citeshort) with \\autocite{key}', () => {
		const r = run('As shown (Bonica 2018).');
		expect(r.markdown).toBe('As shown `\\autocite{Bonica-InferringRollCallScores-2018}`{=latex}.');
		expect(r.citekeys).toEqual(['Bonica-InferringRollCallScores-2018']);
		expect(r.unmatched).toEqual([]);
	});

	it('replaces (citeshort: locator) with \\autocite[locator]{key}, locator verbatim', () => {
		const r = run('Scores (Bonica 2018: 123) and (Bonica 2018: 123–25).');
		expect(r.markdown).toBe(
			'Scores `\\autocite[123]{Bonica-InferringRollCallScores-2018}`{=latex} and `\\autocite[123–25]{Bonica-InferringRollCallScores-2018}`{=latex}.',
		);
		expect(r.resolved.map((c) => c.locator)).toEqual(['123', '123–25']);
		expect(r.citekeys).toHaveLength(1);
	});

	it('LaTeX-escapes the locator and braces square brackets', () => {
		const r = run('(Bonica 2018: §3 & fn_2 [b])');
		expect(r.markdown).toBe('`\\autocite[§3 \\& fn\\_2 {[}b{]}]{Bonica-InferringRollCallScores-2018}`{=latex}');
	});

	it('matches citeshort after whitespace collapsing only', () => {
		expect(run('(Shor  and McCarty  2011)').citekeys).toEqual(['ShorMcCarty-2011']);
		expect(run('(Shor & McCarty 2011)').citekeys).toEqual([]);
	});

	it('highlights an unmatched (Author, Year) and warns', () => {
		const r = run('Claimed (Jones 2015: 4).');
		expect(r.markdown).toBe('Claimed `\\rdunmatched{(Jones 2015: 4)}`{=latex}.');
		expect(r.unmatched).toEqual([{ text: '(Jones 2015: 4)', reason: 'no-match', message: 'no source note has citeshort "Jones 2015"' }]);
		expect(r.citekeys).toEqual([]);
	});

	it('highlights an ambiguous citeshort and names the citekeys', () => {
		const r = run('(Smith 2020)');
		expect(r.markdown).toBe('`\\rdunmatched{(Smith 2020)}`{=latex}');
		expect(r.unmatched[0]?.reason).toBe('ambiguous');
		expect(r.unmatched[0]?.message).toContain('Smith-A-2020, Smith-B-2020');
	});

	it('resolves duplicates that share one citekey', () => {
		expect(run('(Dup 2019)').citekeys).toEqual(['Dup-2019']);
	});

	it('replaces a multi-work citation with one \\autocites, in written order, locators per part', () => {
		const r = run('(Shor and McCarty 2011; Bonica 2018: 12)');
		expect(r.markdown).toBe('`\\autocites{ShorMcCarty-2011}[12]{Bonica-InferringRollCallScores-2018}`{=latex}');
		expect(r.resolved.map((c) => [c.citekey, c.locator])).toEqual([
			['ShorMcCarty-2011', ''],
			['Bonica-InferringRollCallScores-2018', '12'],
		]);
		expect(r.citekeys).toEqual(['ShorMcCarty-2011', 'Bonica-InferringRollCallScores-2018']);
		expect(r.unmatched).toEqual([]);
	});

	it('highlights a multi-work citation when any part fails, naming each failure', () => {
		const r = run('(Bonica 2018; Jones 2015; Smith 2020)');
		expect(r.markdown).toBe('`\\rdunmatched{(Bonica 2018; Jones 2015; Smith 2020)}`{=latex}');
		expect(r.unmatched).toHaveLength(1);
		expect(r.unmatched[0]?.reason).toBe('no-match');
		expect(r.unmatched[0]?.message).toBe('no source note has citeshort "Jones 2015"; "Smith 2020" is the citeshort of Smith-A-2020, Smith-B-2020');
		expect(r.citekeys).toEqual([]);
	});

	it('highlights a mixed parenthetical whose other parts are not citations', () => {
		const r = run('(Bonica 2018; see Table 2)');
		expect(r.markdown).toBe('`\\rdunmatched{(Bonica 2018; see Table 2)}`{=latex}');
		expect(r.unmatched[0]).toMatchObject({ reason: 'multi-work', message: `${MULTI_WORK_MESSAGE}; not a citation: "see Table 2"` });
	});

	it('replaces one author\'s works and the combined form with one \\autocites', () => {
		const r = run('(Shor and McCarty 2011: 3, 2022; Bonica 2018)');
		expect(r.markdown).toBe('`\\autocites[3]{ShorMcCarty-2011}{ShorMcCarty-2022}{Bonica-InferringRollCallScores-2018}`{=latex}');
		expect(r.citekeys).toEqual(['ShorMcCarty-2011', 'ShorMcCarty-2022', 'Bonica-InferringRollCallScores-2018']);
		expect(r.unmatched).toEqual([]);
	});

	it('highlights an old-format citation and says to drop the comma', () => {
		const r = run('As shown (Bonica, 2018).');
		expect(r.markdown).toBe('As shown `\\rdunmatched{(Bonica, 2018)}`{=latex}.');
		expect(r.unmatched).toEqual([{ text: '(Bonica, 2018)', reason: 'old-format', message: `${OLD_FORMAT_MESSAGE}; found: "Bonica, 2018"` }]);
		expect(r.citekeys).toEqual([]);
	});

	it('escapes special characters inside highlighted text', () => {
		const r = run('(O_Brien & Co 2010: 5%)');
		expect(r.markdown).toBe('`\\rdunmatched{(O\\_Brien \\& Co 2010: 5\\%)}`{=latex}');
	});

	it('leaves prose parentheticals alone', () => {
		const md = 'Three cases (see Section 2, 2024) and (N = 1,200) and (Table 3).';
		const r = run(md);
		expect(r.markdown).toBe(md);
		expect(r.unmatched).toEqual([]);
	});

	it('never touches fenced code blocks', () => {
		const md = ['```', '(Bonica 2018)', '```', '~~~~', '(Jones 2015)', '~~~~'].join('\n');
		expect(run(md).markdown).toBe(md);
	});

	it('never touches inline code', () => {
		const md = 'Write `(Bonica 2018)` or ``(Jones 2015)``.';
		expect(run(md).markdown).toBe(md);
	});

	it('never touches inline or display math', () => {
		const inline = 'Let $f(Bonica 2018)$ and $$g(Jones 2015)$$ hold.';
		expect(run(inline).markdown).toBe(inline);
		const block = ['$$', 'h(Bonica 2018)', '(Jones 2015)', '$$', 'After (Bonica 2018).'].join('\n');
		const r = run(block);
		expect(r.markdown.split('\n').slice(0, 4).join('\n')).toBe(['$$', 'h(Bonica 2018)', '(Jones 2015)', '$$'].join('\n'));
		expect(r.markdown.split('\n')[4]).toBe('After `\\autocite{Bonica-InferringRollCallScores-2018}`{=latex}.');
	});

	it('does not mistake dollar amounts for math', () => {
		const r = run('It cost $5 and $10 (Bonica 2018).');
		expect(r.citekeys).toEqual(['Bonica-InferringRollCallScores-2018']);
	});

	it('never touches Markdown links, images or autolinks', () => {
		const md = 'See [the paper (Bonica 2018)](https://example.com/a_(b)) and ![fig (Jones 2015)](media/x.png) <https://x.org/(Bonica,2018)>.';
		const r = run(md);
		expect(r.unmatched).toEqual([]);
		expect(r.citekeys).toEqual([]);
	});

	it('handles several citations on one line and in footnotes', () => {
		const r = run('A (Bonica 2018) b (Shor and McCarty 2011: 7).^[Also (Bonica 2018: 9).]');
		expect(r.resolved).toHaveLength(3);
		expect(r.citekeys).toEqual(['Bonica-InferringRollCallScores-2018', 'ShorMcCarty-2011']);
	});
});
