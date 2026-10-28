// The settings page (Update000): default author, default parent folder, and
// the Dev and Submit LaTeX preambles, which replaced reading LatexPre.tex.

import type { App, Plugin } from 'obsidian';
import { PluginSettingTab, Setting } from 'obsidian';

import { DEFAULT_SETTINGS } from '../core/settings';
import type { RenderDocSettings } from '../core/settings';

export interface SettingsHost extends Plugin {
	settings: RenderDocSettings;
	saveSettings(): Promise<void>;
	pickFolder(current: string): Promise<string | null>;
}

type PreambleKey = 'devPreamble' | 'submitPreamble';

export class RenderDocSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private host: SettingsHost,
	) {
		super(app, host);
	}

	display(): void {
		const { containerEl, host } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Default author')
			.setDesc('Shown on the cover page and in the header. A note with an author: field uses that instead.')
			.addText((t) =>
				t.setValue(host.settings.defaultAuthor).onChange(async (v) => {
					host.settings.defaultAuthor = v;
					await host.saveSettings();
				}),
			);

		let parentText: { setValue(value: string): unknown } | null = null;
		new Setting(containerEl)
			.setName('Default parent folder')
			.setDesc('The render dialog opens on this folder. ~ means your home folder.')
			.addText((t) => {
				t.setValue(host.settings.defaultParentDir).onChange(async (v) => {
					host.settings.defaultParentDir = v.trim();
					await host.saveSettings();
				});
				t.inputEl.addClass('render-doc-path');
				parentText = t;
			})
			.addButton((b) =>
				b.setButtonText('Choose…').onClick(async () => {
					const picked = await host.pickFolder(host.settings.defaultParentDir);
					if (picked === null) return;
					host.settings.defaultParentDir = picked;
					parentText?.setValue(picked);
					await host.saveSettings();
				}),
			);

		new Setting(containerEl).setName('LaTeX preambles').setHeading();
		containerEl.createEl('p', {
			cls: 'setting-item-description',
			text: 'Included in every render after Render Doc defines \\DocTitle, \\DocShortTitle, \\DocAuthor, \\DocClass, \\DocProf and \\DocDate from the note. \\maketitle draws the cover page. Clearing a box restores its default.',
		});
		this.preambleSetting('Dev preamble', 'Used for Dev renders: title and author header, page x of y bottom left, date/time stamp bottom right.', 'devPreamble');
		this.preambleSetting('Submit preamble', 'Used for Submit renders: short title (bold) and author header, page x of y centred, no date/time stamp.', 'submitPreamble');
	}

	private preambleSetting(name: string, desc: string, key: PreambleKey): void {
		const { containerEl, host } = this;
		let area: { setValue(value: string): unknown } | null = null;
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addButton((b) =>
				b.setButtonText('Reset to default').onClick(async () => {
					host.settings[key] = DEFAULT_SETTINGS[key];
					area?.setValue(DEFAULT_SETTINGS[key]);
					await host.saveSettings();
				}),
			);
		new Setting(containerEl).setClass('render-doc-preamble').addTextArea((t) => {
			t.setValue(host.settings[key]).onChange(async (v) => {
				host.settings[key] = v.trim() === '' ? DEFAULT_SETTINGS[key] : v;
				await host.saveSettings();
			});
			t.inputEl.rows = 18;
			t.inputEl.spellcheck = false;
			area = t;
		});
	}
}
