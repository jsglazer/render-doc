// Short citations → biblatex. Pure — no 'obsidian', no I/O.
//
// Josh types `(Bonica, 2018: 123)` as plain text. Each such parenthetical is
// looked up by its citeshort ("Bonica, 2018") in the source-note index:
//
//   matched         → `\autocite[123]{Bonica-InferringRollCallScores-2018}`{=latex}
//   no match        → `\rdunmatched{(Bonica, 2018: 123)}`{=latex} + warning
//   ambiguous       → highlighted the same way + warning naming the citekeys
//   multi-work (;)  → `(Hall, 2014: 12; Barber, 2016)` → `\autocites[12]{Hall-…}{Barber-…}`
//                     when every part matches; otherwise the whole parenthetical
//                     is highlighted and the warning names the part(s) that failed
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
import { autociteCommand, autocitesCommand, rawLatex, unmatchedCommand } from './latex';
import type { CiteIndex } from './sources';
import { distinctCitekeys, normalizeCiteshort } from './sources';

export const MAX_PARENTHETICAL = 120;
export const MULTI_WORK_MESSAGE = 'every part of a multi-work citation must be (Author, Year)';

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

export interface CitationPart {
	citeshort: string;
	locator: string;
}

export type Classification =
	| { kind: 'not-citation' }
	| { kind: 'citation'; citeshort: string; locator: string }
	| { kind: 'multi'; parts: CitationPart[] }
	| { kind: 'multi-work'; bad: string[] }; // some `;` parts are citations, some are not

function parseCitation(text: string): CitationPart | null {
	const m = CITATION_RE.exec(text);
	return m ? { citeshort: m[1] ?? '', locator: (m[2] ?? '').trim() } : null;
}

// What a parenthetical's inner text (without the parentheses) is.
export function classifyParenthetical(inner: string): Classification {
	if (inner.length > MAX_PARENTHETICAL) return { kind: 'not-citation' };
	const content = inner.trim();
	if (content.includes(';')) {
		const texts = content.split(';').map((p) => p.trim()).filter((p) => p !== '');
		const parsed = texts.map(parseCitation);
		const parts = parsed.filter((p): p is CitationPart => p !== null);
		if (parts.length === 0) return { kind: 'not-citation' };
		if (parts.length < texts.length) return { kind: 'multi-work', bad: texts.filter((_, i) => parsed[i] === null) };
		return parts.length === 1 ? { kind: 'citation', ...(parts[0] as CitationPart) } : { kind: 'multi', parts };
	}
	const part = parseCitation(content);
	return part ? { kind: 'citation', ...part } : { kind: 'not-citation' };
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
