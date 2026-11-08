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
import { latexEscape, rawLatex } from './latex';

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

// ---------------------------------------------------------------------------
// The "Include tags" option (Update007, Dev only): a table at the very end of
// the PDF listing every tag that prints — the tag, the page it prints on and
// its Obsidian line number (the same number the margin shows when line
// numbers are on).
//
// Before anything else touches the note, markTags puts a private-use
// placeholder, <id>, directly in front of each tag (the tag
// text itself is left alone, so Dev prints it exactly as before). Like the
// line markers (src/core/lineMarkers.ts), the placeholders ride through body
// extraction, conversion and citation replacement; a tag on a dropped line
// (outline entry, %% comment) takes its placeholder with it, so only tags that
// actually print are listed. tagMarkersToLatex turns each survivor into a raw
// \rdtag{<id>}, which records its page in the .aux file; the table reads it
// back with \rdtagref (TAG_MACROS in src/core/latex.ts). Every other render
// (and the Submit copy, before stripTags) drops them with stripTagMarkers.
// Tags pulled in by an embed are not lines of this note and are not listed.
//
// The same tag rule as stripTags, scanned on the raw note, so it also skips
// the frontmatter, [[wikilinks]] and their aliases, Markdown link targets and
// bare URLs, which the raw note still holds.

const OPEN = '';
const CLOSE = '';
const MARKER_RE = new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g');

export interface TagOccurrence {
	id: number;
	tag: string; // without the leading #
	line: number; // Obsidian's line number, 1-based
}

export interface MarkedTags {
	doc: string;
	tags: TagOccurrence[];
}

// Inline spans no tag can start inside: code, $math$, [[wikilinks]],
// Markdown link targets and URLs. Matched first, so the tag alternative only
// sees the text between them.
const SCAN_RE = /(?<!`)(`+)(?!`).*?(?<!`)\1(?!`)|(?<![\\$])\$(?=\S)[^$]*?(?<=\S)\$(?!\d)|\[\[[^\]]*\]\]|\]\([^)]*\)|<[a-z]+:[^>\s]*>|[a-z][a-z0-9+.-]*:\/\/\S*|(^|[ \t]+)#([\p{L}\p{N}_/-]+)/giu;

function frontmatterEnd(lines: string[]): number {
	if ((lines[0] ?? '').trimEnd() !== '---') return 0;
	for (let i = 1; i < lines.length; i++) {
		const t = (lines[i] ?? '').trimEnd();
		if (t === '---' || t === '...') return i + 1;
	}
	return 0;
}

export function markTags(doc: string): MarkedTags {
	const lines = doc.split('\n');
	const start = frontmatterEnd(lines);
	const tags: TagOccurrence[] = [];
	let fence: string | null = null;
	let math = false;
	const out = lines.map((line, i) => {
		if (i < start) return line;
		const fenceAfter = nextFenceState(line, fence);
		if (fence !== null || fenceAfter !== null) {
			fence = fenceAfter;
			return line;
		}
		if (line.trim().startsWith('$$')) {
			if (line.trim() === '$$' || !line.trim().slice(2).includes('$$')) math = !math;
			return line;
		}
		if (math || !line.includes('#') || (INDENTED_CODE_RE.test(line) && !LIST_ITEM_RE.test(line))) return line;
		return line.replace(SCAN_RE, (whole: string, ...groups: unknown[]) => {
			const lead = groups[1];
			const name = groups[2];
			if (typeof name !== 'string' || ALL_DIGITS_RE.test(name)) return whole;
			const id = tags.length + 1;
			tags.push({ id, tag: name, line: i + 1 });
			return `${typeof lead === 'string' ? lead : ''}${OPEN}${id}${CLOSE}#${name}`;
		});
	});
	return { doc: out.join('\n'), tags };
}

// The ids of the placeholders still present, in order.
export function survivingTagIds(text: string): Set<number> {
	return new Set([...text.matchAll(MARKER_RE)].map((m) => Number(m[1])));
}

export function tagMarkersToLatex(text: string): string {
	return text.replace(MARKER_RE, (_m, n: string) => rawLatex(`\\rdtag{${n}}`));
}

export function stripTagMarkers(text: string): string {
	return text.replace(MARKER_RE, '');
}

// The table after the References (or at the end when the note cites nothing):
// a page of its own under a centred heading, like the References.
export function tagTable(tags: TagOccurrence[]): string {
	const head = ['\\clearpage', '\\section*{\\centering Tags}\\markboth{Tags}{Tags}'];
	if (tags.length === 0) return `${[...head, 'This note has no tags.'].join('\n')}\n`;
	const rows = tags.map((t) => `\\#${latexEscape(t.tag)} & \\rdtagref{${t.id}} & ${t.line}\\\\`);
	return `${[
		...head,
		'\\begin{longtable}{@{}lrr@{}}',
		'\\toprule',
		'Tag & Page & Line\\\\',
		'\\midrule',
		'\\endhead',
		...rows,
		'\\bottomrule',
		'\\end{longtable}',
	].join('\n')}\n`;
}
