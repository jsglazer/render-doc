// Blank lines pandoc needs but Obsidian doesn't. Pure — no 'obsidian'.
//
// Obsidian (CommonMark) lets a heading, a blockquote, a pipe table or a code
// fence start on the line right after paragraph text. Pandoc's Markdown does
// not: without a blank line before it, `### State-level data` is read as more
// words of the paragraph above (blank_before_header), and likewise a `>` quote,
// a table or a fence. This inserts that blank line, outside fenced code only.
// Lists get the same treatment later, in renderer/lists.py.

import { isFenceLine, nextFenceState } from './exportBody';

const HEADING_RE = /^#{1,6}(?:[ \t]|$)/;
const QUOTE_RE = /^ {0,3}>/;
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

function opensTable(line: string, next: string | undefined): boolean {
	return line.includes('|') && next !== undefined && next.includes('-') && TABLE_SEPARATOR_RE.test(next);
}

export function separateBlocks(markdown: string): string {
	const lines = markdown.split('\n');
	const out: string[] = [];
	let fence: string | null = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? '';
		if (fence !== null) {
			fence = nextFenceState(line, fence);
			out.push(line);
			continue;
		}
		const prev = out.length > 0 ? (out[out.length - 1] ?? '') : '';
		const afterText = prev.trim() !== '';
		const needsBlank =
			afterText &&
			(HEADING_RE.test(line) ||
				isFenceLine(line) ||
				(QUOTE_RE.test(line) && !QUOTE_RE.test(prev)) ||
				(opensTable(line, lines[i + 1]) && !prev.includes('|')));
		if (needsBlank) out.push('');
		if (isFenceLine(line)) fence = nextFenceState(line, fence);
		out.push(line);
	}
	return out.join('\n');
}
