// Source-note discovery and the citeshort index. Pure — no 'obsidian': the
// shell hands in every Markdown file's path and frontmatter, plus a folder
// existence check backed by the vault.
//
// A source note is any in-scope note whose frontmatter has a non-empty
// `citekey:` and a non-empty `citeshort:` (e.g. `citeshort: Bonica, 2018`).
// Notes with either missing or empty are skipped (Developer Decision
// "Matching").
//
// Scope (Developer Decisions "Source scope key" and "Fallback scope"):
//   cite-sources: a vault-relative folder path, or a list of them. `/` names
//                 the vault root, and only an explicit `/` ever scans it.
//   no cite-sources: the folder tree rooted one level above the note's folder.
//                 If that is the vault root, the note's own folder tree is
//                 searched instead, with a warning.

export interface NoteMeta {
	path: string; // vault-relative, e.g. "Classes/2026-B/Paper.md"
	frontmatter: Readonly<Record<string, unknown>> | undefined;
}

export interface SourceNote {
	path: string;
	citekey: string;
	citeshort: string; // as written in the frontmatter
}

export interface CitationEntry {
	citekey: string;
	path: string;
}

// Normalized citeshort → every in-scope source note carrying it.
export type CiteIndex = ReadonlyMap<string, readonly CitationEntry[]>;

export interface Ambiguity {
	citeshort: string;
	entries: CitationEntry[];
}

export interface SourceDiscovery {
	roots: string[]; // vault-relative folders searched; '' is the vault root
	sources: SourceNote[];
	index: CiteIndex;
	ambiguities: Ambiguity[];
	warnings: string[];
}

export const CITE_SOURCES_KEY = 'cite-sources';

// Trim, collapse internal whitespace, Unicode NFC — and nothing else: no
// and/&, et al., or hyphen folding (Developer Decision "Matching").
export function normalizeCiteshort(text: string): string {
	return text.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function parentFolder(path: string): string {
	const slash = path.lastIndexOf('/');
	return slash === -1 ? '' : path.slice(0, slash);
}

function normalizeFolder(raw: string): string {
	return raw.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

// The folders named by `cite-sources`, or null when the key is absent or
// names nothing. Non-string list items are ignored.
export function parseCiteSources(raw: unknown): string[] | null {
	const items = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
	const folders: string[] = [];
	for (const item of items) {
		if (typeof item !== 'string' || item.trim() === '') continue;
		const folder = normalizeFolder(item);
		if (!folders.includes(folder)) folders.push(folder);
	}
	return folders.length > 0 ? folders : null;
}

export function resolveScope(
	notePath: string,
	citeSourcesRaw: unknown,
	folderExists: (folder: string) => boolean,
): { roots: string[]; warnings: string[] } {
	const warnings: string[] = [];
	const explicit = parseCiteSources(citeSourcesRaw);
	if (explicit !== null) {
		const roots = explicit.filter((folder) => {
			const ok = folder === '' || folderExists(folder);
			if (!ok) warnings.push(`cite-sources folder not found: ${folder}`);
			return ok;
		});
		if (roots.length > 0) return { roots, warnings };
		warnings.push('None of the cite-sources folders exist, so the default search scope was used.');
	}

	const noteFolder = parentFolder(notePath);
	if (noteFolder === '') {
		warnings.push('This note is at the vault root, so no source notes were searched. Add cite-sources to its frontmatter.');
		return { roots: [], warnings };
	}
	const oneUp = parentFolder(noteFolder);
	if (oneUp === '' || !folderExists(oneUp)) {
		warnings.push(`The folder above this note is the vault root, so only ${noteFolder} was searched for source notes.`);
		return { roots: [noteFolder], warnings };
	}
	return { roots: [oneUp], warnings };
}

export function inScope(path: string, roots: readonly string[]): boolean {
	return roots.some((root) => root === '' || path.startsWith(`${root}/`));
}

function nonEmptyString(value: unknown): string | null {
	if (typeof value === 'string' && value.trim() !== '') return value.trim();
	return null;
}

export function collectSourceNotes(notes: readonly NoteMeta[], roots: readonly string[]): SourceNote[] {
	const sources: SourceNote[] = [];
	for (const note of notes) {
		if (!inScope(note.path, roots)) continue;
		const citekey = nonEmptyString(note.frontmatter?.citekey);
		const citeshort = nonEmptyString(note.frontmatter?.citeshort);
		if (citekey === null || citeshort === null) continue;
		sources.push({ path: note.path, citekey, citeshort });
	}
	return sources.sort((a, b) => a.path.localeCompare(b.path));
}

export function buildCiteIndex(sources: readonly SourceNote[]): Map<string, CitationEntry[]> {
	const index = new Map<string, CitationEntry[]>();
	for (const s of sources) {
		const key = normalizeCiteshort(s.citeshort);
		const list = index.get(key) ?? [];
		list.push({ citekey: s.citekey, path: s.path });
		index.set(key, list);
	}
	return index;
}

export function distinctCitekeys(entries: readonly CitationEntry[]): string[] {
	return [...new Set(entries.map((e) => e.citekey))];
}

// Ambiguous only when 2+ source notes share a citeshort with DIFFERENT
// citekeys; duplicates of one citekey resolve normally (Developer Decision
// "Ambiguity").
export function findAmbiguities(index: CiteIndex): Ambiguity[] {
	const out: Ambiguity[] = [];
	for (const [citeshort, entries] of index) {
		if (distinctCitekeys(entries).length > 1) out.push({ citeshort, entries: [...entries] });
	}
	return out.sort((a, b) => a.citeshort.localeCompare(b.citeshort));
}

export function discoverSources(
	notePath: string,
	citeSourcesRaw: unknown,
	notes: readonly NoteMeta[],
	folderExists: (folder: string) => boolean,
): SourceDiscovery {
	const { roots, warnings } = resolveScope(notePath, citeSourcesRaw, folderExists);
	const sources = collectSourceNotes(
		notes.filter((n) => n.path !== notePath),
		roots,
	);
	const index = buildCiteIndex(sources);
	return { roots, sources, index, ambiguities: findAmbiguities(index), warnings };
}
