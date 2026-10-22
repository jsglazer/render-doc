// Render Doc: one command that typesets the active note as an academic paper
// with LaTeX — short citations resolved to biblatex \autocite, a bibliography
// from Zotero — delivered as a new folder (PDF, .tex, refs.bib, media/).
//
// The shell only wires Obsidian to the pure core (src/core/) and the
// renderer (src/export/); undocumented surfaces go through src/adapter/.

import { MarkdownView, Notice, Plugin } from 'obsidian';

import { pickFolder, revealInFinder } from './adapter/obsidianInternals';
import type { RenderDocSettings } from './core/settings';
import { initialParentDir, mergeSettings } from './core/settings';
import type { RenderPlan } from './export/exporter';
import { RenderExporter } from './export/exporter';
import { pruneBuildDirs } from './export/installer';
import { node } from './export/node';
import { RenderModal } from './ui/renderModal';

const ERROR_NOTICE_MS = 20000;

export default class RenderDocPlugin extends Plugin {
	settings: RenderDocSettings = mergeSettings(null);
	private exporter!: RenderExporter;
	private busy = false;

	async onload(): Promise<void> {
		this.settings = mergeSettings(await this.loadData());
		this.exporter = new RenderExporter(this.app, this.manifest.version);

		this.addCommand({
			id: 'render-current-note',
			name: 'Render current note',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
				if (!file || file.extension !== 'md') return false;
				if (!checking) void this.openDialog(file);
				return true;
			},
		});

		this.app.workspace.onLayoutReady(() => {
			void pruneBuildDirs().catch(() => undefined);
		});
	}

	private async openDialog(file: NonNullable<MarkdownView['file']>): Promise<void> {
		if (this.busy) {
			new Notice('Render Doc is already rendering a note.');
			return;
		}
		const parentDir = initialParentDir(this.settings, node().os.homedir());
		const plan = await this.exporter.plan(file, parentDir);
		if (typeof plan === 'string') {
			new Notice(plan);
			return;
		}
		new RenderModal(this.app, plan, {
			check: (p) => this.exporter.check(p),
			pickFolder: async (current) => {
				try {
					return await pickFolder('Choose the parent folder', current);
				} catch (e) {
					new Notice(e instanceof Error ? e.message : String(e));
					return null;
				}
			},
			onSubmit: (p) => void this.render(p),
		}).open();
	}

	private async render(plan: RenderPlan): Promise<void> {
		this.busy = true;
		this.settings.lastParentDir = plan.parentDir;
		await this.saveData(this.settings);
		const progress = new Notice('Render Doc: starting…', 0);
		try {
			const outcome = await this.exporter.run(plan, (msg) => progress.setMessage(`Render Doc: ${msg}`));
			progress.hide();
			if (!outcome.ok) {
				const where = outcome.logPath ?? outcome.buildDir;
				new Notice(`Render Doc failed (${outcome.stage}): ${outcome.message}${where ? `\n\nLog: ${where}` : ''}`, ERROR_NOTICE_MS);
				return;
			}
			const unmatched = plan.prepared.citations.unmatched.length;
			const tail = unmatched > 0 ? `\n${unmatched} citation${unmatched === 1 ? ' is' : 's are'} highlighted as unmatched.` : '';
			new Notice(`Rendered to ${outcome.folder}${tail}`, 10000);
			revealInFinder(outcome.pdf);
		} catch (e) {
			progress.hide();
			new Notice(`Render Doc failed: ${e instanceof Error ? e.message : String(e)}`, ERROR_NOTICE_MS);
		} finally {
			this.busy = false;
		}
	}
}
