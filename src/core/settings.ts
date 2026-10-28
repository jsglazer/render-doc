// Plugin settings. Pure — no 'obsidian'.

import { DEFAULT_DEV_PREAMBLE, DEFAULT_SUBMIT_PREAMBLE, preambleFingerprint, RETIRED_DEFAULT_FINGERPRINTS } from './preambles';

// Dev: the working draft (title + author header, page x of y bottom left,
// date/time stamp bottom right). Submit: the copy handed in (short title and
// author header, page x of y centred, no stamp).
export type RenderMode = 'dev' | 'submit';

export interface RenderDocSettings {
	// The author on the cover page and in the header; a note's author: overrides it.
	defaultAuthor: string;
	// The render dialog always opens on this folder. A leading ~ is the home folder.
	defaultParentDir: string;
	// The LaTeX preambles, edited on the settings page (they replaced LatexPre.tex).
	devPreamble: string;
	submitPreamble: string;
	// The dialog's "Line numbers" toggle last time.
	lineNumbers: boolean;
	// The dialog's Dev/Submit choice last time.
	mode: RenderMode;
	// The dialog's "Open export folder" toggle last time; off until turned on.
	openFolder: boolean;
}

export const DEFAULT_PARENT_DIR = '~/Library/CloudStorage/Dropbox/_Schar/Classes';

export const DEFAULT_SETTINGS: RenderDocSettings = {
	defaultAuthor: 'Joshua S. Glazer',
	defaultParentDir: DEFAULT_PARENT_DIR,
	devPreamble: DEFAULT_DEV_PREAMBLE,
	submitPreamble: DEFAULT_SUBMIT_PREAMBLE,
	lineNumbers: false,
	mode: 'dev',
	openFolder: false,
};

function text(value: unknown, fallback: string): string {
	return typeof value === 'string' ? value : fallback;
}

// A preamble cleared to nothing falls back to the default, so clearing the
// box is another way to reset it. So does an unedited copy of an older default.
function preamble(value: unknown, fallback: string): string {
	if (typeof value !== 'string' || value.trim() === '') return fallback;
	return RETIRED_DEFAULT_FINGERPRINTS.has(preambleFingerprint(value)) ? fallback : value;
}

// What data.json holds: a preamble equal to the current default is saved
// empty, so a later default reaches it.
export function settingsToSave(settings: RenderDocSettings): RenderDocSettings {
	return {
		...settings,
		devPreamble: settings.devPreamble === DEFAULT_DEV_PREAMBLE ? '' : settings.devPreamble,
		submitPreamble: settings.submitPreamble === DEFAULT_SUBMIT_PREAMBLE ? '' : settings.submitPreamble,
	};
}

export function mergeSettings(saved: unknown): RenderDocSettings {
	const s = saved !== null && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
	return {
		defaultAuthor: text(s.defaultAuthor, DEFAULT_SETTINGS.defaultAuthor),
		defaultParentDir: text(s.defaultParentDir, DEFAULT_SETTINGS.defaultParentDir),
		devPreamble: preamble(s.devPreamble, DEFAULT_SETTINGS.devPreamble),
		submitPreamble: preamble(s.submitPreamble, DEFAULT_SETTINGS.submitPreamble),
		lineNumbers: typeof s.lineNumbers === 'boolean' ? s.lineNumbers : DEFAULT_SETTINGS.lineNumbers,
		mode: s.mode === 'submit' ? 'submit' : 'dev',
		openFolder: typeof s.openFolder === 'boolean' ? s.openFolder : DEFAULT_SETTINGS.openFolder,
	};
}

export function expandHome(dir: string, home: string): string {
	const d = dir.trim();
	if (d === '~') return home.replace(/\/+$/, '');
	return d.startsWith('~/') ? `${home.replace(/\/+$/, '')}/${d.slice(2)}` : d;
}

// The dialog always opens on the Default Parent Folder (Josh, Update000);
// an empty setting means the built-in default.
export function initialParentDir(settings: RenderDocSettings, home: string): string {
	return expandHome(settings.defaultParentDir.trim() !== '' ? settings.defaultParentDir : DEFAULT_PARENT_DIR, home);
}

export function preambleFor(settings: RenderDocSettings, mode: RenderMode): string {
	return mode === 'submit' ? settings.submitPreamble : settings.devPreamble;
}
