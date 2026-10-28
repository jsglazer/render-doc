// The pre-export dialog (Developer Decision "Pre-export dialog"): parent folder
// with a native picker, folder name with a live check — an existing folder is
// a warning that Render will overwrite it, a bad name or missing parent
// disables Render — and a summary: source notes found, citations resolved,
// citations left highlighted, with every warning. A Dev/Submit selector and a
// line-numbers toggle, both remembered between renders. No font size.
//
// The title sits in an alert box: yellow for Dev, red for Submit, so a
// working draft is hard to mistake for the copy being handed in.

import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';

import type { TargetCheck } from '../core/document';
import { folderNameFor } from '../core/document';
import type { RenderMode } from '../core/settings';
import type { RenderPlan } from '../export/exporter';

export interface RenderModalHooks {
	check(plan: RenderPlan): TargetCheck;
	pickFolder(current: string): Promise<string | null>;
	onSubmit(plan: RenderPlan): void;
}

export class RenderModal extends Modal {
	private statusEl: HTMLElement | null = null;
	private renderButton: { setDisabled(disabled: boolean): unknown } | null = null;
	private parentText: { setValue(value: string): unknown } | null = null;
	private folderText: { setValue(value: string): unknown } | null = null;

	constructor(
		app: App,
		private plan: RenderPlan,
		private hooks: RenderModalHooks,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, plan } = this;
		this.setTitle(`Render "${plan.file.basename}"`);
		this.titleEl.addClass('render-doc-title');
		this.showMode();
		contentEl.addClass('render-doc-modal');

		new Setting(contentEl)
			.setName('Version')
			.setDesc('Dev: date/time stamp, page x of y bottom left. Submit: short title and author header, page x of y centred, no stamp.')
			.addDropdown((d) =>
				d
					.addOption('dev', 'Dev')
					.addOption('submit', 'Submit')
					.setValue(plan.mode)
					.onChange((v) => {
						plan.mode = v as RenderMode;
						plan.folderName = folderNameFor(plan.folderName, plan.mode);
						this.folderText?.setValue(plan.folderName);
						this.showMode();
						this.refresh();
					}),
			);

		new Setting(contentEl)
			.setName('Parent folder')
			.setDesc('The export folder is created inside this folder.')
			.addText((text) => {
				text.setValue(plan.parentDir).onChange((v) => {
					plan.parentDir = v.trim();
					this.refresh();
				});
				text.inputEl.addClass('render-doc-path');
				this.parentText = text;
			})
			.addButton((b) =>
				b.setButtonText('Choose…').onClick(async () => {
					const picked = await this.hooks.pickFolder(plan.parentDir);
					if (picked === null) return;
					plan.parentDir = picked;
					this.parentText?.setValue(picked);
					this.refresh();
				}),
			);

		new Setting(contentEl)
			.setName('Folder name')
			.setDesc('The folder holding the PDF, the .tex file, refs.bib and images. If it already exists, those files in it are overwritten.')
			.addText((text) => {
				text.setValue(plan.folderName).onChange((v) => {
					plan.folderName = v;
					this.refresh();
				});
				this.folderText = text;
			});
		this.statusEl = contentEl.createDiv({ cls: 'render-doc-status' });

		new Setting(contentEl)
			.setName('Line numbers')
			.setDesc('Number every line of text in the left margin, counting through the whole document.')
			.addToggle((t) =>
				t.setValue(plan.lineNumbers).onChange((v) => {
					plan.lineNumbers = v;
				}),
			);

		new Setting(contentEl)
			.setName('Open export folder')
			.setDesc('Show the new PDF in Finder when rendering finishes.')
			.addToggle((t) =>
				t.setValue(plan.openFolder).onChange((v) => {
					plan.openFolder = v;
				}),
			);

		this.renderSummary(contentEl.createDiv({ cls: 'render-doc-summary' }));

		new Setting(contentEl)
			.addButton((b) => {
				b.setButtonText('Render')
					.setCta()
					.onClick(() => {
						const check = this.hooks.check(plan);
						if (!check.ok) return;
						plan.overwrite = check.exists;
						this.close();
						this.hooks.onSubmit(plan);
					});
				this.renderButton = b;
			})
			.addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()));

		this.refresh();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private showMode(): void {
		this.titleEl.toggleClass('is-dev', this.plan.mode === 'dev');
		this.titleEl.toggleClass('is-submit', this.plan.mode === 'submit');
	}

	private refresh(): void {
		const check = this.hooks.check(this.plan);
		this.renderButton?.setDisabled(!check.ok);
		if (!this.statusEl) return;
		this.statusEl.empty();
		this.statusEl.toggleClass('mod-error', !check.ok);
		this.statusEl.toggleClass('mod-warning', check.ok && check.exists);
		this.statusEl.setText(!check.ok ? check.message : check.exists ? check.warning : `Will create ${check.target}`);
	}

	private renderSummary(el: HTMLElement): void {
		const { discovery, prepared } = this.plan;
		const { citations } = prepared;
		const scope = discovery.roots.length === 0 ? 'no folders' : discovery.roots.map((r) => (r === '' ? '/' : r)).join(', ');
		el.createEl('h4', { text: 'Summary' });
		const list = el.createEl('ul');
		list.createEl('li', { text: `Source notes found: ${discovery.sources.length} (searched ${scope})` });
		list.createEl('li', {
			text: `Citations resolved: ${citations.resolved.length} (${citations.citekeys.length} distinct work${citations.citekeys.length === 1 ? '' : 's'})`,
		});
		list.createEl('li', { text: `Unmatched, left highlighted: ${citations.unmatched.length}` });
		if (prepared.outlineLinesStripped > 0) {
			list.createEl('li', { text: `Outline lines stripped: ${prepared.outlineLinesStripped}` });
		}

		const warnings = [
			...discovery.warnings,
			...citations.unmatched.map((u) => `${u.text} — ${u.message}`),
			...prepared.issues.map((i) => `${i.kind} embed or link: ${i.target}`),
		];
		if (warnings.length === 0) return;
		el.createEl('h4', { text: 'Warnings' });
		const wl = el.createEl('ul', { cls: 'render-doc-warnings' });
		for (const w of warnings) wl.createEl('li', { text: w });
	}
}
