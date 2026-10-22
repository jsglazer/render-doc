// Copies a file into the staging folder by reading it as a stream.
//
// LatexPre.tex lives in Dropbox, which can evict it to an online-only
// placeholder. pandoc opening such a file directly fails with "resource
// deadlock avoided"; a plain stream read makes the File Provider hydrate it
// first. So the preamble is ALWAYS staged this way before pandoc runs
// (builder constraint §4 / Reviewer criterion: LatexPre.tex copied by stream).
// No 'obsidian' import, so the integration test uses this exact function.

import { node } from './node';

export async function stageByStream(source: string, destination: string): Promise<void> {
	const { fs, stream } = node();
	await stream.pipeline(fs.createReadStream(source), fs.createWriteStream(destination));
}
