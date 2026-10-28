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
import type { CiteIndex } from './sources';

export interface PreparedDocument {
	markdown: string; // pandoc Markdown with raw \autocite / \rdunmatched spans
	numberedMarkdown: string; // the same, plus raw \rdln{<Obsidian line>} spans
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
	// along, then become \rdln or vanish (src/core/lineMarkers.ts).
	const extraction = extractBody(markSourceLines(doc, sigilChar), sigilChar);
	const converted = await toPandocMarkdown(extraction.body, notePath, sigilChar, resolver);
	const citations = replaceCitations(separateBlocks(converted.markdown), index);
	return {
		markdown: stripMarkers(citations.markdown),
		numberedMarkdown: markersToLatex(citations.markdown),
		citations,
		issues: converted.issues,
		outlineLinesStripped: extraction.outlineLinesStripped,
		isEmpty: extraction.isEmpty,
	};
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
	options: { lineNumbers?: boolean } = {},
): BuildFiles {
	const cites = prepared.citations.citekeys.length > 0;
	const files: Record<string, string> = {
		'source.md': `${options.lineNumbers === true ? prepared.numberedMarkdown : prepared.markdown}\n`,
		'meta.tex': metaHeader(meta),
		'cite.tex': citeHeader(cites, options.lineNumbers ?? false),
		'meta.json': `${JSON.stringify(pandocMetadata(meta), null, 2)}\n`,
	};
	if (cites) files['after.tex'] = BIBLIOGRAPHY_TRAILER;
	const job: RenderJob = {
		version: 1,
		source: 'source.md',
		headers: ['meta.tex', PREAMBLE_FILE, 'cite.tex'],
		after: cites ? 'after.tex' : '',
		metadataFile: 'meta.json',
		bibliography: cites ? BIB_FILE : '',
		...target,
	};
	return { files, job };
}
