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
import type { ConversionIssue, ExportResolver } from './obsidianMarkdown';
import { toPandocMarkdown } from './obsidianMarkdown';
import type { FontSize, RenderMode } from './settings';
import { DEFAULT_FONT_SIZE, documentClassFor, lineNumbersAllowed, tagTableAllowed } from './settings';
import type { CiteIndex } from './sources';
import type { TagOccurrence } from './tags';
import { markTags, stripTags, stripTagMarkers, survivingTagIds, tagMarkersToLatex, tagTable, unmarkRawSpans } from './tags';

export interface PreparedDocument {
	markdown: string; // pandoc Markdown with raw \autocite / \rdunmatched spans
	numberedMarkdown: string; // the same, plus raw \rdln{<Obsidian line>} spans
	// The Dev copy with every line and tag placeholder still in place; buildFiles
	// decides what each becomes (src/core/lineMarkers.ts, src/core/tags.ts).
	markedMarkdown: string;
	tags: TagOccurrence[]; // the tags the Dev copy prints, in document order
	// The Submit copy: no Excalidraw drawings and no #tags (src/core/tags.ts). A
	// drawing's text can hold citations and failed embeds, so it keeps its own.
	submit: { markdown: string; citations: CitationResult; issues: ConversionIssue[] };
	citations: CitationResult;
	issues: ConversionIssue[];
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
	const converted = await toPandocMarkdown(extraction.body, notePath, sigilChar, resolver);
	const citations = replaceCitations(separateBlocks(converted.markdown), index);
	const tagMarked = unmarkRawSpans(citations.markdown);
	const printed = survivingTagIds(tagMarked);
	const untagged = stripTagMarkers(tagMarked);
	const markdown = stripMarkers(untagged);
	const submitConverted = await toPandocMarkdown(extraction.body, notePath, sigilChar, resolver, { skipDrawings: true });
	const submitCitations = replaceCitations(separateBlocks(submitConverted.markdown), index);
	return {
		markdown,
		numberedMarkdown: markersToLatex(untagged),
		markedMarkdown: tagMarked,
		tags: marked.tags.filter((t) => printed.has(t.id)),
		submit: { markdown: stripTags(stripTagMarkers(stripMarkers(submitCitations.markdown))), citations: submitCitations, issues: submitConverted.issues },
		citations,
		issues: converted.issues,
		outlineLinesStripped: extraction.outlineLinesStripped,
		isEmpty: extraction.isEmpty,
	};
}

// The citations and embed problems of the copy being rendered.
export function versionOf(prepared: PreparedDocument, mode: RenderMode): { citations: CitationResult; issues: ConversionIssue[] } {
	return mode === 'submit' ? prepared.submit : prepared;
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
	options: { lineNumbers?: boolean; mode?: RenderMode; pageBreaks?: boolean; hideUnmatched?: boolean; fontSize?: FontSize; tags?: boolean } = {},
): BuildFiles {
	const mode = options.mode ?? 'dev';
	const cites = versionOf(prepared, mode).citations.citekeys.length > 0;
	const fontSize = options.fontSize ?? DEFAULT_FONT_SIZE;
	const numbered = options.lineNumbers === true && lineNumbersAllowed(mode);
	const tagged = options.tags === true && tagTableAllowed(mode);
	let body: string;
	if (mode === 'submit') body = prepared.submit.markdown;
	else {
		const lined = numbered ? markersToLatex(prepared.markedMarkdown) : stripMarkers(prepared.markedMarkdown);
		body = tagMarkersToLatex(lined, tagged);
	}
	const files: Record<string, string> = {
		'source.md': `${body}\n`,
		'meta.tex': metaHeader(meta),
		'cite.tex': citeHeader(cites, { lineNumbers: numbered, pageBreaks: options.pageBreaks, hideUnmatched: options.hideUnmatched, tags: tagged }),
		'meta.json': `${JSON.stringify(pandocMetadata(meta), null, 2)}\n`,
	};
	// After the text: the References (only when the note cites), then the tag table.
	const after = `${cites ? BIBLIOGRAPHY_TRAILER : ''}${tagged ? tagTable(prepared.tags) : ''}`;
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
