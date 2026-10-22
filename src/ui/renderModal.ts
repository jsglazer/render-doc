// The pre-export dialog (Developer Decision "Pre-export dialog"): parent folder
// with a native picker, folder name with a live collision check that disables
// Render while it collides, and a summary — source notes found, citations
// resolved, citations left highlighted — with every warning. No font size.

import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';

import type { TargetCheck } from '../core/document';
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
		contentEl.addClass('render-doc-modal');

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
			.setDesc('A new folder holding the PDF, the .tex file, refs.bib and images. An existing folder is never overwritten.')
			.addText((text) =>
				text.setValue(plan.folderName).onChange((v) => {
					plan.folderName = v;
					this.refresh();
				}),
			);
		this.statusEl = contentEl.createDiv({ cls: 'render-doc-status' });

		this.renderSummary(contentEl.createDiv({ cls: 'render-doc-summary' }));

		new Setting(contentEl)
			.addButton((b) => {
				b.setButtonText('Render')
					.setCta()
					.onClick(() => {
						if (!this.hooks.check(plan).ok) return;
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

	private refresh(): void {
		const check = this.hooks.check(this.plan);
		this.renderButton?.setDisabled(!check.ok);
		if (!this.statusEl) return;
		this.statusEl.empty();
		this.statusEl.toggleClass('mod-warning', !check.ok);
		this.statusEl.setText(check.ok ? `Will create ${check.target}` : check.message);
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
