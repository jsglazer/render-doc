// Short citations → biblatex. Pure — no 'obsidian', no I/O.
//
// Josh types `(Bonica, 2018: 123)` as plain text. Each such parenthetical is
// looked up by its citeshort ("Bonica, 2018") in the source-note index:
//
//   matched         → `\autocite[123]{Bonica-InferringRollCallScores-2018}`{=latex}
//   no match        → `\rdunmatched{(Bonica, 2018: 123)}`{=latex} + warning
//   ambiguous       → highlighted the same way + warning naming the citekeys
//   multi-work (;)  → highlighted the same way + "multi-work citations not supported"
//
// Citation-like (Developer Decision "Citation-like grammar"): one parenthetical
// with no nested parentheses, at most 120 characters inside, whose content is
// author text starting with an uppercase letter, then `, YYYY` with an optional
// lowercase year suffix, then optionally `: locator`. Lowercase-led prose such
// as `(see Section 2, 2024)` is never a citation.
//
// Never scanned: fenced code, inline code, math ($…$, $$…$$, including $$
// blocks spanning lines), Markdown links and images, and autolinks.

import { isFenceLine, nextFenceState } from './exportBody';
import { autociteCommand, rawLatex, unmatchedCommand } from './latex';
import type { CiteIndex } from './sources';
import { distinctCitekeys, normalizeCiteshort } from './sources';

export const MAX_PARENTHETICAL = 120;
export const MULTI_WORK_MESSAGE = 'multi-work citations not supported';

// Author text (uppercase-led, no parentheses or semicolons), `, YYYY[a-z]`,
// then an optional `: locator`.
const CITATION_RE = /^(\p{Lu}[^();]*?,\s*\d{4}[a-z]?)(?:\s*:\s*([^()]*?))?$/u;
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

export type UnmatchedReason = 'no-match' | 'ambiguous' | 'multi-work';

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

export type Classification =
	| { kind: 'not-citation' }
	| { kind: 'citation'; citeshort: string; locator: string }
	| { kind: 'multi-work' };

// What a parenthetical's inner text (without the parentheses) is.
export function classifyParenthetical(inner: string): Classification {
	if (inner.length > MAX_PARENTHETICAL) return { kind: 'not-citation' };
	const content = inner.trim();
	if (content.includes(';')) {
		const parts = content.split(';').map((p) => p.trim());
		return parts.some((p) => CITATION_RE.test(p)) ? { kind: 'multi-work' } : { kind: 'not-citation' };
	}
	const m = CITATION_RE.exec(content);
	if (!m) return { kind: 'not-citation' };
	return { kind: 'citation', citeshort: m[1] ?? '', locator: (m[2] ?? '').trim() };
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

	const rewrite = (whole: string, inner: string): string => {
		const c = classifyParenthetical(inner);
		if (c.kind === 'not-citation') return whole;
		if (c.kind === 'multi-work') {
			unmatched.push({ text: whole, reason: 'multi-work', message: MULTI_WORK_MESSAGE });
			return rawLatex(unmatchedCommand(whole));
		}
		const key = normalizeCiteshort(c.citeshort);
		const keys = distinctCitekeys(index.get(key) ?? []);
		if (keys.length === 0) {
			unmatched.push({ text: whole, reason: 'no-match', message: `no source note has citeshort "${key}"` });
			return rawLatex(unmatchedCommand(whole));
		}
		if (keys.length > 1) {
			unmatched.push({ text: whole, reason: 'ambiguous', message: `"${key}" is the citeshort of ${keys.join(', ')}` });
			return rawLatex(unmatchedCommand(whole));
		}
		const citekey = keys[0] ?? '';
		resolved.push({ text: whole, citekey, locator: c.locator });
		if (!citekeys.includes(citekey)) citekeys.push(citekey);
		return rawLatex(autociteCommand(citekey, c.locator));
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
