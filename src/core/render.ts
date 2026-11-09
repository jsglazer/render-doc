// The whole note → build-folder preparation, minus I/O. Pure: vault lookups go
// through the injected ExportResolver, and the caller writes the returned
// files into the staging folder (src/export/exporter.ts, and the integration
// test, which drives the real renderer with exactly these files).

import { separateBlocks } from './blockSeparation';
import type { CitationResult } from './citations';
import { replaceCitations } from './citations';
import type { DocMeta } from './document';
import { pandocMetadata } from './document';
import { extractBody } from './exportBody';
import { BIBLIOGRAPHY_TRAILER, citeHeader, metaHeader } from './latex';
import { markersToLatex, markSourceLines, stripMarkers } from './lineMarkers';
import type { ConversionIssue, DrawingMode, ExportResolver } from './obsidianMarkdown';
import { toPandocMarkdown } from './obsidianMarkdown';
import type { FontSize, RenderMode } from './settings';
import { DEFAULT_FONT_SIZE, documentClassFor, lineNumbersAllowed, tagTableAllowed } from './settings';
import type { CiteIndex } from './sources';
import type { TagOccurrence } from './tags';
import { markTags, stripTags, stripTagMarkers, survivingTagIds, tagMarkersToLatex, tagTable, unmarkRawSpans } from './tags';

// One version of the note's text. There are two, because a drawing's note text
// can hold citations and failed embeds of its own: with drawings as pictures
// (the dialog's "Include drawings", on by default) and with drawings left out.
// Dev and Submit share a version; Submit then drops the #tags (src/core/tags.ts).
export interface PreparedVersion {
	markdown: string; // Dev: pandoc Markdown with raw \autocite / \rdunmatched spans
	numberedMarkdown: string; // the same, plus raw \rdln{<Obsidian line>} spans
	// The Dev copy with every line and tag placeholder still in place; buildFiles
	// decides what each becomes (src/core/lineMarkers.ts, src/core/tags.ts).
	markedMarkdown: string;
	tags: TagOccurrence[]; // the tags the Dev copy prints, in document order
	submit: { markdown: string }; // the Submit copy: no #tags, no markers
	citations: CitationResult;
	issues: ConversionIssue[];
}

// The top-level fields are the version with drawings as pictures.
export interface PreparedDocument extends PreparedVersion {
	noDrawings: PreparedVersion;
	outlineLinesStripped: number;
	isEmpty: boolean;
}

export async function prepareDocument(
	doc: string,
	notePath: string,
	sigilChar: string,
	resolver: ExportResolver,
	index: CiteIndex,
): Promise<PreparedDocument> {
	// Mark each source line with its Obsidian line number, extract the prose,
	// convert Obsidian syntax, add the blank lines pandoc needs before
	// headings/quotes/tables/fences, then resolve citations. The markers ride
	// along, then become \rdln or vanish (src/core/lineMarkers.ts). Tag
	// placeholders go in first, on the untouched note, so each records its
	// Obsidian line; they become \rdtag or vanish (src/core/tags.ts).
	const marked = markTags(doc);
	const extraction = extractBody(markSourceLines(marked.doc, sigilChar), sigilChar);
	const version = async (drawings: DrawingMode): Promise<PreparedVersion> => {
		const converted = await toPandocMarkdown(extraction.body, notePath, sigilChar, resolver, { drawings });
		const citations = replaceCitations(separateBlocks(converted.markdown), index);
		const tagMarked = unmarkRawSpans(citations.markdown);
		const printed = survivingTagIds(tagMarked);
		const untagged = stripTagMarkers(tagMarked);
		return {
			markdown: stripMarkers(untagged),
			numberedMarkdown: markersToLatex(untagged),
			markedMarkdown: tagMarked,
			tags: marked.tags.filter((t) => printed.has(t.id)),
			submit: { markdown: stripTags(stripMarkers(untagged)) },
			citations,
			issues: converted.issues,
		};
	};
	const withDrawings = await version('image');
	return {
		...withDrawings,
		noDrawings: await version('skip'),
		outlineLinesStripped: extraction.outlineLinesStripped,
		isEmpty: extraction.isEmpty,
	};
}

// The version being rendered: drawings as pictures, or left out.
export function versionOf(prepared: PreparedDocument, drawings: boolean): PreparedVersion {
	return drawings ? prepared : prepared.noDrawings;
}

// renderer/render-pdf.sh reads this (see renderer/job.py for every field).
export interface RenderJob {
	version: 1;
	source: string;
	headers: string[]; // pandoc -H, in order
	after: string; // pandoc -A, '' for none
	metadataFile: string;
	bibliography: string; // '' when the note cites nothing
	resourcePath: string; // absolute folder of the note, for relative images
	parentDir: string; // absolute; the export folder is created inside it
	folderName: string;
	stem: string; // <stem>.pdf and <stem>.tex in the export folder
	overwrite: boolean; // the dialog warned that the folder exists and Josh rendered anyway
	fontSize: number; // body size in pt, pandoc -V fontsize
	documentClass: string; // pandoc -V documentclass: article, or extarticle for sizes article lacks
}

export interface BuildFiles {
	files: Record<string, string>; // build-relative path → content
	job: RenderJob;
}

export const PREAMBLE_FILE = 'preamble.tex';
export const BIB_FILE = 'refs.bib';

// Everything the build folder needs except preamble.tex (staged by stream
// copy) and refs.bib (from Zotero). A note with zero resolved citations gets
// no biblatex, no refs.bib, no bibliography (Developer Decision "biblatex loading").
export function buildFiles(
	prepared: PreparedDocument,
	meta: DocMeta,
	target: { resourcePath: string; parentDir: string; folderName: string; stem: string; overwrite: boolean },
	options: { lineNumbers?: boolean; mode?: RenderMode; pageBreaks?: boolean; hideUnmatched?: boolean; fontSize?: FontSize; tags?: boolean; drawings?: boolean } = {},
): BuildFiles {
	const mode = options.mode ?? 'dev';
	const version = versionOf(prepared, options.drawings ?? true);
	const cites = version.citations.citekeys.length > 0;
	const fontSize = options.fontSize ?? DEFAULT_FONT_SIZE;
	const numbered = options.lineNumbers === true && lineNumbersAllowed(mode);
	const tagged = options.tags === true && tagTableAllowed(mode);
	let body: string;
	if (mode === 'submit') body = version.submit.markdown;
	else {
		const lined = numbered ? markersToLatex(version.markedMarkdown) : stripMarkers(version.markedMarkdown);
		body = tagMarkersToLatex(lined, tagged);
	}
	const files: Record<string, string> = {
		'source.md': `${body}\n`,
		'meta.tex': metaHeader(meta),
		'cite.tex': citeHeader(cites, { lineNumbers: numbered, pageBreaks: options.pageBreaks, hideUnmatched: options.hideUnmatched, tags: tagged }),
		'meta.json': `${JSON.stringify(pandocMetadata(meta), null, 2)}\n`,
	};
	// After the text: the References (only when the note cites), then the tag table.
	const after = `${cites ? BIBLIOGRAPHY_TRAILER : ''}${tagged ? tagTable(version.tags) : ''}`;
	if (after !== '') files['after.tex'] = after;
	const job: RenderJob = {
		version: 1,
		source: 'source.md',
		headers: ['meta.tex', PREAMBLE_FILE, 'cite.tex'],
		after: after !== '' ? 'after.tex' : '',
		metadataFile: 'meta.json',
		bibliography: cites ? BIB_FILE : '',
		...target,
		fontSize,
		documentClass: documentClassFor(fontSize),
	};
	return { files, job };
}
