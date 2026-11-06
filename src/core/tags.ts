// Obsidian tags in the Submit copy (Update004: "in Submit mode ignore all tags,
// like #fix"). Tags are working notes to self, so the copy handed in drops them;
// Dev keeps them as written. Pure — no 'obsidian'.
//
// Runs on the finished pandoc Markdown, so tags from embedded notes go too, and
// citations are already raw `\autocite`{=latex} code spans, which are skipped.
//
// A tag is what Obsidian treats as one: # at the start of a line or after a
// space, then letters, digits, _, - or /, not all digits. So these all stay:
// "# Heading", "#123", "C#", "x#y", "https://a.b/#frag", "\#fix", and anything
// inside code spans, $math$, fenced code, $$ blocks or indented code.
//
// A line left with nothing but its block prefix (a tag alone on a line, "- #fix",
// "## #fix", "> #fix") goes entirely, so it can't print an empty list item or
// heading, and the lines around it stay one paragraph.

import { nextFenceState } from './exportBody';

// Leftmost match wins, so a code span or math span swallows any # inside it.
const TOKEN_RE = /(?<!`)(`+)(?!`).*?(?<!`)\1(?!`)|(?<![\\$])\$(?=\S)[^$]*?(?<=\S)\$(?!\d)|(^|[ \t]+)#([\p{L}\p{N}_/-]+)/gu;
const ALL_DIGITS_RE = /^\p{N}+$/u;
const BARE_PREFIX_RE = /^[ \t]*(?:>[ \t]*)*(?:#{1,6}[ \t]*|(?:[-*+]|\d+[.)])[ \t]*(?:\[.\][ \t]*)?)?$/;
const INDENTED_CODE_RE = /^(?: {4}|\t)/;
const LIST_ITEM_RE = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]/;

function stripLineTags(line: string): string | null {
	let found = false;
	let atStart = false;
	const stripped = line.replace(TOKEN_RE, (whole: string, _ticks: string | undefined, lead: string | undefined, name: string | undefined, offset: number) => {
		if (lead === undefined || name === undefined || ALL_DIGITS_RE.test(name)) return whole;
		found = true;
		if (offset === 0) atStart = true;
		return '';
	});
	if (!found) return line;
	if (BARE_PREFIX_RE.test(stripped)) return null;
	return atStart ? stripped.trimStart() : stripped;
}

export function stripTags(markdown: string): string {
	const out: string[] = [];
	let fence: string | null = null;
	let math = false;
	let dropped = false; // a line just went, so a blank line after it may double up
	for (const line of markdown.split('\n')) {
		const fenceAfter = nextFenceState(line, fence);
		if (fence !== null || fenceAfter !== null) {
			fence = fenceAfter;
			out.push(line);
			dropped = false;
			continue;
		}
		const trimmed = line.trim();
		if (trimmed.startsWith('$$')) {
			// A lone $$ opens or closes a block; $$…$$ on one line does neither.
			if (trimmed === '$$' || !trimmed.slice(2).includes('$$')) math = !math;
			out.push(line);
			dropped = false;
			continue;
		}
		if (math || (INDENTED_CODE_RE.test(line) && !LIST_ITEM_RE.test(line))) {
			out.push(line);
			dropped = false;
			continue;
		}
		const kept = stripLineTags(line);
		if (kept === null) {
			dropped = true;
			continue;
		}
		if (dropped && trimmed === '' && (out.length === 0 || (out[out.length - 1] ?? '').trim() === '')) continue;
		out.push(kept);
		dropped = false;
	}
	while (out.length > 0 && (out[out.length - 1] ?? '').trim() === '') out.pop();
	return out.join('\n');
}
