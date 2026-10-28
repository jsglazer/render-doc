// Per-document values: the cover page and header fields from the frontmatter,
// and the export folder's name and collision check. Pure — no 'obsidian', no
// I/O (existence checks are injected).

export interface DocMeta {
	title: string; // frontmatter title, else the note's basename
	shortTitle: string; // titleshort:, else the title (the Submit header)
	authors: string[]; // the note's author:, else the Default author setting
	className: string | null; // class: (or course:)
	classNum: string | null; // coursenum: (or classnum:), printed under the class
	prof: string | null; // prof:
	date: string | null; // date:, as written
}

function asText(value: unknown): string | null {
	if (typeof value === 'string' && value.trim() !== '') return value.trim();
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	return null;
}

// Developer Decision "Title": the title feeds \DocTitle (running header and
// cover page). A note's author: overrides the Default author setting (Update000).
export function readDocMeta(frontmatter: Readonly<Record<string, unknown>> | undefined, basename: string, defaultAuthor = ''): DocMeta {
	const fm = frontmatter ?? {};
	const rawAuthor = fm.author;
	const noteAuthors = (Array.isArray(rawAuthor) ? rawAuthor : [rawAuthor]).map(asText).filter((a): a is string => a !== null);
	const fallback = asText(defaultAuthor);
	const title = asText(fm.title) ?? basename;
	return {
		title,
		shortTitle: asText(fm.titleshort) ?? title,
		authors: noteAuthors.length > 0 ? noteAuthors : fallback !== null ? [fallback] : [],
		className: asText(fm.class) ?? asText(fm.course),
		classNum: asText(fm.coursenum) ?? asText(fm.classnum),
		prof: asText(fm.prof),
		date: asText(fm.date),
	};
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ordinal(n: number): string {
	const tens = n % 100;
	if (tens >= 11 && tens <= 13) return `${n}th`;
	return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

// The cover page date, "Monday, January 1st, 2020", from a date: such as
// 2020-01-01 (a time after it is ignored); a blank date: is today. Anything
// else is printed as written.
export function formatCoverDate(raw: string | null, today: Date = new Date()): string {
	if (raw === null) return longDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
	const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/.exec(raw.trim());
	if (!m) return raw;
	const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const d = new Date(Date.UTC(year, month - 1, day));
	if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return raw;
	return longDate(year, month, day);
}

function longDate(year: number, month: number, day: number): string {
	const d = new Date(Date.UTC(year, month - 1, day));
	return `${WEEKDAYS[d.getUTCDay()] ?? ''}, ${MONTHS[month - 1] ?? ''} ${ordinal(day)}, ${year}`;
}

// pandoc --metadata-file contents (JSON is YAML). The title makes pandoc call
// \maketitle, which the preamble turns into the cover page.
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
