// Per-document values: title/author/date from the frontmatter, and the export
// folder's name and collision check. Pure — no 'obsidian', no I/O (existence
// checks are injected).

export interface DocMeta {
	title: string; // frontmatter title, else the note's basename
	authors: string[]; // only when the frontmatter has author:
	date: string | null; // only when the frontmatter has date:
}

function asText(value: unknown): string | null {
	if (typeof value === 'string' && value.trim() !== '') return value.trim();
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	return null;
}

// Developer Decision "Title": the title feeds \DocTitle (running header) and
// pandoc's title (\maketitle); author and date reach pandoc only if present.
export function readDocMeta(frontmatter: Readonly<Record<string, unknown>> | undefined, basename: string): DocMeta {
	const fm = frontmatter ?? {};
	const rawAuthor = fm.author;
	const authors = (Array.isArray(rawAuthor) ? rawAuthor : [rawAuthor]).map(asText).filter((a): a is string => a !== null);
	return {
		title: asText(fm.title) ?? basename,
		authors,
		date: asText(fm.date),
	};
}

// pandoc --metadata-file contents (JSON is YAML).
export function pandocMetadata(meta: DocMeta): Record<string, unknown> {
	const out: Record<string, unknown> = { title: meta.title };
	if (meta.authors.length > 0) out.author = meta.authors;
	if (meta.date !== null) out.date = meta.date;
	return out;
}

// A safe folder/file stem from the note's basename: path separators and
// control characters become '-', and leading dots or trailing dots/spaces go.
export function safeStem(name: string): string {
	const cleaned = name
		.replace(/[/\\:]/g, '-')
		// eslint-disable-next-line no-control-regex -- stripping control characters is the point
		.replace(/[\u0000-\u001f\u007f]/g, '')
		.trim()
		.replace(/^\.+/, '')
		.replace(/[.\s]+$/, '');
	return cleaned === '' ? 'Document' : cleaned;
}

// Why a typed folder name can't be used, or null when it can.
export function folderNameProblem(name: string): string | null {
	const t = name.trim();
	if (t === '') return 'Enter a folder name.';
	if (t === '.' || t === '..') return 'That folder name is reserved.';
	if (/[/:]/.test(t)) return 'A folder name cannot contain / or :.';
	return null;
}

export function joinPath(dir: string, name: string): string {
	return `${dir.replace(/\/+$/, '')}/${name}`;
}

export type TargetCheck =
	| { ok: true; target: string; exists: false }
	| { ok: true; target: string; exists: true; warning: string }
	| { ok: false; reason: 'invalid' | 'no-parent'; message: string };

// An existing export folder no longer blocks the export (Josh, 2026-10-21:
// "allow saving to overwrite existing file, just warn about it"): the dialog
// shows the warning, and delivery replaces only Render Doc's own files in it.
// Never silent — a folder that appears after the dialog checked still fails.
export function checkExportTarget(
	parentDir: string,
	folderName: string,
	exists: (path: string) => boolean,
): TargetCheck {
	const problem = folderNameProblem(folderName);
	if (problem !== null) return { ok: false, reason: 'invalid', message: problem };
	const parent = parentDir.trim().replace(/(.)\/+$/, '$1');
	if (parent === '' || !exists(parent)) {
		return { ok: false, reason: 'no-parent', message: `The parent folder does not exist: ${parentDir}` };
	}
	const target = joinPath(parent, folderName.trim());
	if (exists(target)) {
		return {
			ok: true,
			target,
			exists: true,
			warning: `${target} already exists. Rendering will overwrite its PDF, .tex, refs.bib and media/.`,
		};
	}
	return { ok: true, target, exists: false };
}
