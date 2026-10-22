// Body extraction for Render Doc. Pure — no 'obsidian', no DOM.
//
// Copied and simplified from virtual-outliner's src/core/exportBody.ts and
// src/core/sigil.ts (Developer Decision: reuse by copy, no runtime import).
// The rendered paper is the prose alone: the YAML frontmatter, every
// virtual-outliner outline entry line (`@@ Heading`, including a bare `@@ `)
// and every outline comment line (`@% note to self`) are dropped. The
// `%%md-outline` metadata block is an Obsidian %% comment, so
// obsidianMarkdown.stripComments removes it with every other comment.
//
// Paragraphs (virtual-outliner's rule): an entry's body CONTINUES the paragraph
// above it. A new paragraph starts where the entry carries the paragraph flag
// (`@@p text`), where the note has a blank line, or where either side of the
// seam is not plain prose — a heading, list, table, quote or code fence, which
// pandoc would otherwise misread as lazy continuation of the block before it.

export const DEFAULT_SIGIL_CHAR = '@';
const PARAGRAPH_FLAG = 'p';
const COMMENT_MARK = '%';
const MAX_LEVEL = 6;

const FENCE_RE = /^\s*(`{3,}|~{3,})/;

// A code fence opens with ``` or ~~~ and closes with the same character run
// at least as long. Returns the open fence marker, or null outside a fence.
export function nextFenceState(line: string, open: string | null): string | null {
	const m = FENCE_RE.exec(line);
	if (!m) return open;
	const marker = m[1] ?? '';
	if (open === null) return marker;
	return marker[0] === open[0] && marker.length >= open.length ? null : open;
}

export function isFenceLine(line: string): boolean {
	return FENCE_RE.test(line);
}

export function stripFrontmatter(doc: string): string {
	const lines = doc.split('\n');
	if ((lines[0] ?? '').trimEnd() !== '---') return doc;
	for (let i = 1; i < lines.length; i++) {
		const t = (lines[i] ?? '').trimEnd();
		if (t === '---' || t === '...') return lines.slice(i + 1).join('\n');
	}
	return doc;
}

function escapeForRegex(char: string): string {
	return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// One to six sigils, the optional paragraph flag, the required space, and
// optional text: virtual-outliner's outlineLineRegex.
function outlineLineRegex(sigilChar: string): RegExp {
	const flag = sigilChar === PARAGRAPH_FLAG ? '' : `${PARAGRAPH_FLAG}?`;
	return new RegExp(`^(${escapeForRegex(sigilChar)}{1,${MAX_LEVEL}})(?:${flag})[ \\t]+(.*)$`);
}

function commentLineRegex(sigilChar: string): RegExp {
	return new RegExp(`^${escapeForRegex(sigilChar)}{1,${MAX_LEVEL}}${escapeForRegex(COMMENT_MARK)}(?:[ \\t]+.*)?$`);
}

function hasParagraphFlag(line: string, sigilChar: string, entryRe: RegExp): boolean {
	const match = entryRe.exec(line);
	if (!match || sigilChar === PARAGRAPH_FLAG) return false;
	const sigils = match[1] ?? '';
	return line.slice(sigils.length, sigils.length + PARAGRAPH_FLAG.length) === PARAGRAPH_FLAG;
}

// Line starts that open their own block, so a seam next to one must keep its
// blank line: heading, list item, blockquote, fence, table row, thematic
// break, indented code, and pandoc's `:::` divs and `:` definitions.
const BLOCK_START_RE = /^(?:\s{4,}|\t|#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||:{1,3}(?:\s|$)|`{3,}|~{3,}|(?:[-*_]\s*){3,}$)/;

function isPlainProse(line: string): boolean {
	return line.trim() !== '' && !BLOCK_START_RE.test(line);
}

export interface BodyExtraction {
	body: string;
	// How many outline entry lines were removed — the dialog mentions it.
	outlineLinesStripped: number;
	isEmpty: boolean;
}

export function extractBody(doc: string, sigilChar: string = DEFAULT_SIGIL_CHAR): BodyExtraction {
	const lines = stripFrontmatter(doc).split('\n');
	const entryRe = outlineLineRegex(sigilChar);
	const commentRe = commentLineRegex(sigilChar);
	const out: string[] = [];
	let fence: string | null = null;
	let stripped = 0;
	let lastBlank = true; // suppresses leading blank lines too
	let lastText = ''; // the last non-blank line emitted
	let dropped = false; // an entry line was removed since the last body line
	let forceBreak = false; // …and at least one of them carried the flag

	for (const line of lines) {
		if (fence === null && entryRe.test(line)) {
			stripped++;
			dropped = true;
			if (hasParagraphFlag(line, sigilChar, entryRe)) forceBreak = true;
			continue;
		}
		// A comment line leaves no trace: it does not even mark a seam.
		if (fence === null && sigilChar !== COMMENT_MARK && commentRe.test(line)) continue;
		const blank = fence === null && line.trim() === '';
		if (dropped && !blank && !lastBlank && (forceBreak || !isPlainProse(lastText) || !isPlainProse(line))) {
			out.push('');
			lastBlank = true;
		}
		dropped = false;
		forceBreak = false;
		if (fence !== null || FENCE_RE.test(line)) {
			fence = nextFenceState(line, fence);
			out.push(line);
			lastBlank = false;
			lastText = line;
			continue;
		}
		if (blank && lastBlank) continue;
		out.push(blank ? '' : line);
		lastBlank = blank;
		if (!blank) lastText = line;
	}
	while (out.length > 0 && (out[out.length - 1] ?? '').trim() === '') out.pop();

	const body = out.join('\n');
	return { body, outlineLinesStripped: stripped, isEmpty: body.trim() === '' };
}
