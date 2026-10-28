// Obsidian line numbers in the printed margin (Update000: "line numbers on
// the printed page should match the line numbers in Obsidian"). Pure — no
// 'obsidian'.
//
// Before anything else touches the note, markSourceLines puts a private-use
// placeholder, <line>, at the start of each line's text (after
// any heading, list, task or quote prefix, so block syntax is unchanged).
// The placeholders ride through body extraction, Obsidian → pandoc
// conversion, block separation and citation replacement; lines that are
// dropped (frontmatter, outline entries, comments) take theirs with them, so
// the remaining numbers are exactly Obsidian's. markersToLatex then turns
// each into a raw \rdln{<line>} (see src/core/latex.ts), keeping only the
// first one of each printed block: one Obsidian line is one paragraph, so a
// paragraph's wrapped lines carry no number, and a paragraph pandoc joins
// from several Obsidian lines shows the first line's number.
//
// Never marked: code fences and $$ math (marker text would show verbatim),
// table rows, embeds and images on their own line (an inline marker would
// stop them being figures/blocks), callout headers, footnote definitions,
// HTML, %% comment lines, thematic breaks, indented code and outline lines.

import { nextFenceState } from './exportBody';
import { rawLatex } from './latex';

const OPEN = '';
const CLOSE = '';
const MARKER_RE = new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g');

// Heading, then any quote markers, list marker and task box.
const PREFIX_RE = /^(#{1,6}[ \t]+|(?:[ \t]*>[ \t]?)*(?:[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[.\][ \t]+)?)?)/;
const SKIP_RE = /^(?:\||!\[|\$\$|%%|<|\[\^|:::|\[!)/;
const THEMATIC_RE = /^\s*(?:[-*_=]\s*){3,}$/;
const INDENTED_CODE_RE = /^(?: {4}|\t)/;
const LIST_ITEM_RE = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]/;

function escapeForRegex(char: string): string {
	return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function markSourceLines(doc: string, sigilChar: string): string {
	const lines = doc.split('\n');
	let start = 0;
	if ((lines[0] ?? '').trimEnd() === '---') {
		for (let i = 1; i < lines.length; i++) {
			const t = (lines[i] ?? '').trimEnd();
			if (t === '---' || t === '...') {
				start = i + 1;
				break;
			}
		}
	}
	const sigilRe = new RegExp(`^${escapeForRegex(sigilChar)}`);
	let fence: string | null = null;
	let math = false;
	return lines
		.map((line, i) => {
			if (i < start) return line;
			const fenceAfter = nextFenceState(line, fence);
			if (fence !== null || fenceAfter !== null) {
				fence = fenceAfter;
				return line;
			}
			if (line.trim().startsWith('$$')) {
				// A lone $$ opens or closes a block; $$…$$ on one line does neither.
				if (line.trim() === '$$' || !line.trim().slice(2).includes('$$')) math = !math;
				return line;
			}
			if (math || line.trim() === '' || sigilRe.test(line) || THEMATIC_RE.test(line)) return line;
			if (INDENTED_CODE_RE.test(line) && !LIST_ITEM_RE.test(line)) return line;
			const prefix = PREFIX_RE.exec(line)?.[0] ?? '';
			const rest = line.slice(prefix.length);
			if (rest.trim() === '' || SKIP_RE.test(rest)) return line;
			return `${prefix}${OPEN}${i + 1}${CLOSE}${rest}`;
		})
		.join('\n');
}

// A line that opens its own printed block (rather than continuing the
// paragraph above): a heading, a list item, or anything after a blank line.
const BLOCK_OPENER_RE = /^(?:#{1,6}[ \t]|[ \t]*(?:[-*+]|\d+[.)])[ \t])/;

function quoteContent(line: string): string {
	return line.replace(/^(?:[ \t]*>[ \t]?)+/, '');
}

export function markersToLatex(markdown: string): string {
	const lines = markdown.split('\n');
	return lines
		.map((line, i) => {
			if (!line.includes(OPEN)) return line;
			const prev = i > 0 ? (lines[i - 1] ?? '') : '';
			const content = quoteContent(line);
			const prevContent = /^[ \t]*>/.test(line) === /^[ \t]*>/.test(prev) ? quoteContent(prev) : '';
			const continues = prevContent.trim() !== '' && !BLOCK_OPENER_RE.test(content) && !/^#{1,6}[ \t]/.test(prevContent);
			let first = !continues;
			return line.replace(MARKER_RE, (_m, n: string) => {
				if (!first) return '';
				first = false;
				return rawLatex(`\\rdln{${n}}`);
			});
		})
		.join('\n');
}

export function stripMarkers(text: string): string {
	return text.replace(MARKER_RE, '');
}
