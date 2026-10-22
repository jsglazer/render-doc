// Plugin settings and fixed locations. Pure — no 'obsidian'.

export interface RenderDocSettings {
	// The export dialog's parent folder last time; '' until the first export.
	lastParentDir: string;
	// The dialog's "Line numbers" toggle last time.
	lineNumbers: boolean;
}

export const DEFAULT_SETTINGS: RenderDocSettings = {
	lastParentDir: '',
	lineNumbers: false,
};

// Both are home-relative; the shell joins them onto os.homedir().
export const DEFAULT_PARENT_DIR_HOME = 'Library/CloudStorage/Dropbox/_Schar/Classes';
// Josh's LaTeX preamble, read at every export so edits apply immediately.
export const PREAMBLE_PATH_HOME = 'Library/CloudStorage/Dropbox/SysAdmin/config/Files/LatexPre.tex';

export function mergeSettings(saved: unknown): RenderDocSettings {
	const s = saved !== null && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
	return {
		lastParentDir: typeof s.lastParentDir === 'string' ? s.lastParentDir : DEFAULT_SETTINGS.lastParentDir,
		lineNumbers: typeof s.lineNumbers === 'boolean' ? s.lineNumbers : DEFAULT_SETTINGS.lineNumbers,
	};
}

// Last used parent folder, else the default (Developer Decision "Pre-export dialog").
export function initialParentDir(settings: RenderDocSettings, home: string): string {
	return settings.lastParentDir !== '' ? settings.lastParentDir : `${home.replace(/\/+$/, '')}/${DEFAULT_PARENT_DIR_HOME}`;
}
