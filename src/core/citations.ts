// Short citations → biblatex. Pure — no 'obsidian', no I/O.
//
// Josh types `(Bonica 2018: 123)` as plain text, author-date with no comma
// before the year (since 1.0.25; the old `(Bonica, 2018)` form is flagged).
// Each work is looked up by its citeshort ("Bonica 2018") in the source-note
// index:
//
//   matched         → `\autocite[123]{Bonica-InferringRollCallScores-2018}`{=latex}
//   no match        → `\rdunmatched{(Bonica 2018: 123)}`{=latex} + warning
//   ambiguous       → highlighted the same way + warning naming the citekeys
//   multi-work      → `(Hall 2014: 12; Barber 2016)` → `\autocites[12]{Hall-…}{Barber-…}`;
//                     one author's works share a part: `(Barber 2016, 2022: 5)`
//                     → `\autocites{Barber-…2016}[5]{Barber-…2022}`, and the
//                     two combine: `(Barber 2016, 2022; Bonica 2014)`. When
//                     every work matches; otherwise the whole parenthetical is
//                     highlighted and the warning names the work(s) that failed
//   old format      → `(Bonica, 2018)` is highlighted with a warning to drop the comma
//
// Citation-like (Developer Decision "Citation-like grammar", revised 1.0.25):
// one parenthetical with no nested parentheses, at most 120 characters inside;
// `;` separates parts. A part is author text starting with an uppercase letter,
// a space, then one or more works separated by `, `: each work a year
// (1500–2099, optional lowercase suffix) with an optional `: locator`. A
// comma followed by a year starts the next work; any other comma stays in the
// locator, so `(Tsai 2007: 356, 358)` is one work. Lowercase-led prose such as
// `(see Section 2, 2024)` is never a citation.
//
// Never scanned: fenced code, inline code, math ($…$, $$…$$, including $$
// blocks spanning lines), Markdown links and images, and autolinks.

import { isFenceLine, nextFenceState } from './exportBody';
import { autociteCommand, autocitesCommand, rawLatex, unmatchedCommand } from './latex';
import type { CiteIndex } from './sources';
import { distinctCitekeys, normalizeCiteshort } from './sources';

export const MAX_PARENTHETICAL = 120;
export const MULTI_WORK_MESSAGE = 'every part of a multi-work citation must be (Author Year)';
export const OLD_FORMAT_MESSAGE = 'no comma before the year: write (Author Year), as in (Barber 2016)';

// A year that starts a work: 1500–2099 with an optional lowercase suffix,
// followed by `:`, `,` or the end of the part.
const YEAR = '(?:1[5-9]|20)\\d{2}[a-z]?';
const YEAR_AHEAD = `(?=\\s*(?:[:,]|$))`;
// Author text (uppercase-led, no parentheses or semicolons), whitespace, then the works.
const PART_RE = new RegExp(`^(\\p{Lu}[^();]*?)\\s+(${YEAR}${YEAR_AHEAD}.*)$`, 'u');
const WORK_SPLIT_RE = new RegExp(`\\s*,\\s*(?=${YEAR}${YEAR_AHEAD})`, 'u');
const WORK_RE = new RegExp(`^(${YEAR})(?:\\s*:\\s*([^()]*?))?$`, 'u');
const PARENTHETICAL_RE = /\(([^()\n]*)\)/g;

// Spans on one line that are never scanned, in priority order. An unclosed
// `$$` runs to the end of the line and opens a display-math block.
const PROTECTED_RE = new RegExp(
	[
		'(`+)[\\s\\S]*?\\1', // inline code
		'\\$\\$[\\s\\S]*?\\$\\$', // inline display math
		'(\\$\\$[\\s\\S]*$)', // display math opening here, closing on a later line
		'(?<![\\\\$])\\$(?=[^\\s$])(?:[^$\\\\\\n]|\\\\.)*?(?<=\\S)\\$(?!\\d)', // inline math
		'!?\\[[^\\]\\n]*\\]\\([^)\\n]*\\)', // Markdown link or image
		'<[A-Za-z][A-Za-z0-9+.-]*:[^>\\s]*>', // autolink
	].join('|'),
	'g',
);

export type UnmatchedReason = 'no-match' | 'ambiguous' | 'multi-work' | 'old-format';

export interface ResolvedCitation {
	text: string; // the parenthetical as written, parentheses included
	citekey: string;
	locator: string;
}

export interface UnmatchedCitation {
	text: string;
	reason: UnmatchedReason;
	message: string;
}

export interface CitationResult {
	markdown: string;
	resolved: ResolvedCitation[];
	unmatched: UnmatchedCitation[];
	citekeys: string[]; // distinct, in first-cited order
}

export interface CitationPart {
	citeshort: string;
	locator: string;
}

export type Classification =
	| { kind: 'not-citation' }
	| { kind: 'citation'; citeshort: string; locator: string }
	| { kind: 'multi'; parts: CitationPart[] }
	| { kind: 'multi-work'; bad: string[] } // some `;` parts are citations, some are not
	| { kind: 'old-format'; bad: string[] }; // `(Author, Year)`: the parts written with a comma before the year

// One `;` part: its works, each with citeshort `Author Year`. `old` marks the
// pre-1.0.25 form, a comma between author and year.
function parsePart(text: string): { works: CitationPart[]; old: boolean } | null {
	const m = PART_RE.exec(text);
	if (!m) return null;
	const author = (m[1] ?? '').trim();
	const works: CitationPart[] = [];
	for (const w of (m[2] ?? '').split(WORK_SPLIT_RE)) {
		const wm = WORK_RE.exec(w.trim());
		if (!wm) return null;
		works.push({ citeshort: `${author.replace(/\s*,$/, '')} ${wm[1] ?? ''}`, locator: (wm[2] ?? '').trim() });
	}
	return { works, old: author.endsWith(',') };
}

// What a parenthetical's inner text (without the parentheses) is.
export function classifyParenthetical(inner: string): Classification {
	if (inner.length > MAX_PARENTHETICAL) return { kind: 'not-citation' };
	const texts = inner.split(';').map((p) => p.trim()).filter((p) => p !== '');
	const parsed = texts.map(parsePart);
	if (parsed.every((p) => p === null)) return { kind: 'not-citation' };
	if (parsed.some((p) => p === null)) return { kind: 'multi-work', bad: texts.filter((_, i) => parsed[i] === null) };
	if (parsed.some((p) => p?.old)) return { kind: 'old-format', bad: texts.filter((_, i) => parsed[i]?.old) };
	const parts = parsed.flatMap((p) => p?.works ?? []);
	return parts.length === 1 ? { kind: 'citation', ...(parts[0] as CitationPart) } : { kind: 'multi', parts };
}

interface Segment {
	text: string;
	scan: boolean;
}

// Splits one line into scannable and protected segments. `inMath` says whether
// the line starts inside a $$ display-math block; the returned flag says
// whether the next line does.
export function splitProtected(line: string, inMath: boolean): { segments: Segment[]; inMath: boolean } {
	const segments: Segment[] = [];
	let rest = line;
	if (inMath) {
		const close = rest.indexOf('$$');
		if (close === -1) return { segments: [{ text: rest, scan: false }], inMath: true };
		segments.push({ text: rest.slice(0, close + 2), scan: false });
		rest = rest.slice(close + 2);
	}
	let opensMath = false;
	let last = 0;
	PROTECTED_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = PROTECTED_RE.exec(rest)) !== null) {
		if (m[0] === '') {
			PROTECTED_RE.lastIndex++;
			continue;
		}
		if (m.index > last) segments.push({ text: rest.slice(last, m.index), scan: true });
		segments.push({ text: m[0], scan: false });
		if (m[2] !== undefined) opensMath = true;
		last = m.index + m[0].length;
	}
	if (last < rest.length) segments.push({ text: rest.slice(last), scan: true });
	return { segments, inMath: opensMath };
}

export function replaceCitations(markdown: string, index: CiteIndex): CitationResult {
	const resolved: ResolvedCitation[] = [];
	const unmatched: UnmatchedCitation[] = [];
	const citekeys: string[] = [];

	// The one citekey for a citeshort, or why there isn't one.
	const lookup = (citeshort: string): { citekey: string } | { reason: UnmatchedReason; message: string } => {
		const key = normalizeCiteshort(citeshort);
		const keys = distinctCitekeys(index.get(key) ?? []);
		if (keys.length === 0) return { reason: 'no-match', message: `no source note has citeshort "${key}"` };
		if (keys.length > 1) return { reason: 'ambiguous', message: `"${key}" is the citeshort of ${keys.join(', ')}` };
		return { citekey: keys[0] ?? '' };
	};

	const rewrite = (whole: string, inner: string): string => {
		const c = classifyParenthetical(inner);
		if (c.kind === 'not-citation') return whole;
		if (c.kind === 'old-format') {
			const named = c.bad.map((b) => `"${b}"`).join(', ');
			unmatched.push({ text: whole, reason: 'old-format', message: `${OLD_FORMAT_MESSAGE}; found: ${named}` });
			return rawLatex(unmatchedCommand(whole));
		}
		if (c.kind === 'multi-work') {
			const named = c.bad.map((b) => `"${b}"`).join(', ');
			unmatched.push({ text: whole, reason: 'multi-work', message: `${MULTI_WORK_MESSAGE}; not a citation: ${named}` });
			return rawLatex(unmatchedCommand(whole));
		}
		const parts = c.kind === 'multi' ? c.parts : [{ citeshort: c.citeshort, locator: c.locator }];
		const found = parts.map((p) => ({ part: p, hit: lookup(p.citeshort) }));
		const failed = found.filter((f) => !('citekey' in f.hit));
		if (failed.length > 0) {
			// Single citation: the lookup's own reason. Multi: the first failure's
			// reason, with every failing part's message.
			const first = failed[0]?.hit as { reason: UnmatchedReason; message: string };
			const message = failed.map((f) => (f.hit as { message: string }).message).join('; ');
			unmatched.push({ text: whole, reason: first.reason, message });
			return rawLatex(unmatchedCommand(whole));
		}
		const cites = found.map((f) => ({ citekey: (f.hit as { citekey: string }).citekey, locator: f.part.locator }));
		for (const cite of cites) {
			resolved.push({ text: whole, ...cite });
			if (!citekeys.includes(cite.citekey)) citekeys.push(cite.citekey);
		}
		const only = cites[0];
		return rawLatex(cites.length === 1 && only ? autociteCommand(only.citekey, only.locator) : autocitesCommand(cites));
	};

	const out: string[] = [];
	let fence: string | null = null;
	let inMath = false;
	for (const line of markdown.split('\n')) {
		if (!inMath && (fence !== null || isFenceLine(line))) {
			fence = nextFenceState(line, fence);
			out.push(line);
			continue;
		}
		const split = splitProtected(line, inMath);
		inMath = split.inMath;
		out.push(split.segments.map((s) => (s.scan ? s.text.replace(PARENTHETICAL_RE, rewrite) : s.text)).join(''));
	}
	return { markdown: out.join('\n'), resolved, unmatched, citekeys };
}
