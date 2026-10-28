// Render Doc orchestration (desktop only). plan() does all the pure work up
// front — body extraction, Obsidian → pandoc conversion, source discovery,
// citation replacement — so the dialog can show an exact summary. run() then
// stages a build folder, fetches refs.bib from Zotero, runs the bundled
// renderer, and reports.
//
//   $TMPDIR/render-doc-build/<random>/
//     source.md      the converted body with raw \autocite / \rdunmatched spans
//     assets/        vault images the note embeds (pandoc extracts them to media/)
//     meta.tex  preamble.tex  cite.tex  after.tex  meta.json   (see src/core/latex.ts;
//                    preamble.tex is the Dev or Submit preamble from the settings page)
//     refs.bib       BibLaTeX from Zotero Manager (only when the note cites)
//     job.json       see renderer/job.py
//
// The staging folder is removed after a success and kept after a failure, with
// its log path in the error notice (Developer Decision "Pipeline").

import type { App, TFile } from 'obsidian';
import { FileSystemAdapter } from 'obsidian';

import { zoteroManagerApi } from '../adapter/obsidianInternals';
import type { DocMeta, TargetCheck } from '../core/document';
import { checkExportTarget, readDocMeta, safeStem } from '../core/document';
import { DEFAULT_SIGIL_CHAR } from '../core/exportBody';
import type { ExportResolver } from '../core/obsidianMarkdown';
import type { PreparedDocument } from '../core/render';
import { BIB_FILE, buildFiles, prepareDocument, PREAMBLE_FILE } from '../core/render';
import type { RenderMode } from '../core/settings';
import type { NoteMeta, SourceDiscovery } from '../core/sources';
import { CITE_SOURCES_KEY, discoverSources } from '../core/sources';
import { fetchBibLaTeX } from '../core/zotero';
import { buildRoot, ensureRenderer, missingTools } from './installer';
import { node } from './node';
import { runRenderer } from './runRenderer';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'tif', 'tiff', 'bmp', 'svg', 'heic', 'avif', 'pdf']);

export interface RenderPlan {
	file: TFile;
	meta: DocMeta;
	discovery: SourceDiscovery;
	prepared: PreparedDocument;
	stagedImages: Map<string, string>; // vault path → build-relative path
	noteDir: string; // absolute
	parentDir: string; // absolute; edited by the dialog
	folderName: string; // edited by the dialog
	stem: string;
	// Set when Render is clicked while the dialog shows the "already exists"
	// warning. Only then may delivery write into an existing folder.
	overwrite: boolean;
	lineNumbers: boolean; // edited by the dialog
	mode: RenderMode; // edited by the dialog: which preamble to use
	openFolder: boolean; // edited by the dialog: reveal the PDF in Finder afterwards
}

export interface PlanOptions {
	parentDir: string;
	lineNumbers: boolean;
	mode: RenderMode;
	openFolder: boolean;
	defaultAuthor: string;
}

export type RenderOutcome =
	| { ok: true; folder: string; pdf: string }
	| { ok: false; stage: string; message: string; buildDir: string | null; logPath: string | null };

function vaultBasePath(app: App): string | null {
	const adapter = app.vault.adapter;
	return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
}

export class RenderExporter {
	constructor(
		private app: App,
		private pluginVersion: string,
	) {}

	async plan(file: TFile, options: PlanOptions): Promise<RenderPlan | string> {
		const { app } = this;
		const base = vaultBasePath(app);
		if (base === null) return 'Render Doc needs a vault stored on this computer.';
		const { path } = node();

		const doc = await app.vault.read(file);
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		const notes: NoteMeta[] = app.vault
			.getMarkdownFiles()
			.map((f) => ({ path: f.path, frontmatter: app.metadataCache.getFileCache(f)?.frontmatter }));
		const discovery = discoverSources(file.path, frontmatter?.[CITE_SOURCES_KEY], notes, (folder) => app.vault.getFolderByPath(folder) !== null);

		const stagedImages = new Map<string, string>();
		const resolver: ExportResolver = {
			resolveLink: (linkpath, fromPath) => {
				const target = app.metadataCache.getFirstLinkpathDest(linkpath, fromPath);
				if (!target) return null;
				const ext = target.extension.toLowerCase();
				return { path: target.path, kind: ext === 'md' ? 'markdown' : IMAGE_EXTENSIONS.has(ext) ? 'image' : 'other' };
			},
			readNote: async (notePath) => {
				const f = app.vault.getFileByPath(notePath);
				return f ? app.vault.cachedRead(f) : '';
			},
			stageImage: (imagePath) => {
				let rel = stagedImages.get(imagePath);
				if (rel === undefined) {
					rel = `assets/${stagedImages.size + 1}-${path.basename(imagePath)}`;
					stagedImages.set(imagePath, rel);
				}
				return rel;
			},
		};
		const prepared = await prepareDocument(doc, file.path, DEFAULT_SIGIL_CHAR, resolver, discovery.index);
		if (prepared.isEmpty) return `${file.basename} has no body text to render.`;

		const stem = safeStem(file.basename);
		return {
			file,
			meta: readDocMeta(frontmatter, file.basename, options.defaultAuthor),
			discovery,
			prepared,
			stagedImages,
			noteDir: path.join(base, file.parent?.path ?? ''),
			parentDir: options.parentDir,
			folderName: stem,
			stem,
			overwrite: false,
			lineNumbers: options.lineNumbers,
			mode: options.mode,
			openFolder: options.openFolder,
		};
	}

	check(plan: RenderPlan): TargetCheck {
		const { fs } = node();
		return checkExportTarget(plan.parentDir, plan.folderName, (p) => fs.existsSync(p));
	}

	// `preamble` is the text of the Dev or Submit preamble, per plan.mode.
	async run(plan: RenderPlan, preamble: string, progress: (msg: string) => void): Promise<RenderOutcome> {
		const { fs, path, crypto } = node();
		const fail = (stage: string, message: string, buildDir: string | null = null): RenderOutcome => ({
			ok: false,
			stage,
			message,
			buildDir,
			logPath: null,
		});
		const base = vaultBasePath(this.app);
		if (base === null) return fail('vault', 'Render Doc needs a vault stored on this computer.');

		const missing = missingTools();
		if (missing.length > 0) {
			return fail('tools', `Missing ${missing.join(', ')}. Render Doc needs pandoc, MacTeX (latexmk, lualatex, biber) and python3.`);
		}
		if (preamble.trim() === '') return fail('preamble', `The ${plan.mode === 'submit' ? 'Submit' : 'Dev'} preamble in Render Doc's settings is empty.`);

		const target = this.check(plan);
		if (!target.ok) return fail('folder', target.message);
		if (target.exists && !plan.overwrite) {
			return fail('folder', `${target.target} appeared after the dialog checked, so nothing was written. Render again to overwrite it.`);
		}

		// Before anything is compiled: every cited key must come back from Zotero.
		let bib = '';
		const keys = plan.prepared.citations.citekeys;
		if (keys.length > 0) {
			progress('Fetching the bibliography from Zotero…');
			const fetched = await fetchBibLaTeX(zoteroManagerApi(this.app), keys);
			if (!fetched.ok) return fail('zotero', fetched.message);
			bib = fetched.bib;
		}

		progress('Preparing renderer…');
		const renderer = await ensureRenderer(this.pluginVersion);
		const buildDir = path.join(buildRoot(), `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`);
		await fs.promises.mkdir(path.join(buildDir, 'assets'), { recursive: true });

		progress('Staging files…');
		for (const [vaultPath, rel] of plan.stagedImages) {
			await fs.promises.copyFile(path.join(base, vaultPath), path.join(buildDir, rel));
		}
		const { files, job } = buildFiles(
			plan.prepared,
			plan.meta,
			{
				resourcePath: plan.noteDir,
				parentDir: plan.parentDir,
				folderName: plan.folderName.trim(),
				stem: plan.stem,
				overwrite: plan.overwrite,
			},
			{ lineNumbers: plan.lineNumbers },
		);
		for (const [name, content] of Object.entries(files)) {
			await fs.promises.writeFile(path.join(buildDir, name), content, 'utf8');
		}
		await fs.promises.writeFile(path.join(buildDir, PREAMBLE_FILE), preamble.endsWith('\n') ? preamble : `${preamble}\n`, 'utf8');
		if (job.bibliography !== '') await fs.promises.writeFile(path.join(buildDir, BIB_FILE), bib, 'utf8');
		const jobPath = path.join(buildDir, 'job.json');
		await fs.promises.writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`, 'utf8');

		progress('Typesetting…');
		const status = await runRenderer(path.join(renderer, 'render-pdf.sh'), jobPath, buildDir);
		if (!status.ok) {
			const log = ['doc.log', 'render.log'].map((f) => path.join(buildDir, f)).find((f) => fs.existsSync(f)) ?? null;
			return { ok: false, stage: status.stage, message: status.message, buildDir, logPath: log };
		}
		await fs.promises.rm(buildDir, { recursive: true, force: true });
		return { ok: true, folder: status.output, pdf: status.pdf };
	}
}
