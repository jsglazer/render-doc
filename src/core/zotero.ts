// refs.bib from Zotero Manager's public API (version 1). Pure: the API object
// is injected — the shell obtains it through src/adapter/obsidianInternals.ts,
// and tests pass a fake.
//
// Every resolved citekey must exist in Zotero (getAllCiteKeys). If any is
// missing, or Zotero / Better BibTeX is not reachable, the export aborts
// before compiling — never a PDF with a broken bibliography entry (Developer
// Decision "Missing Zotero entries").

export interface CiteKeyRef {
	key: string;
	library: number;
}

export interface LibraryKey {
	citekey: string;
	libraryID: number;
}

// The slice of zotero-manager's ZoteroManagerAPI (src/api.ts) this plugin uses.
export interface ZoteroManagerApiLike {
	version: number;
	isAvailable(): Promise<boolean>;
	getAllCiteKeys(force?: boolean): Promise<LibraryKey[]>;
	getBibLaTeX(keys: CiteKeyRef[], libraryID: number): Promise<string | null>;
}

export type BibFetch =
	| { ok: true; bib: string; libraries: number[] }
	| { ok: false; reason: 'not-installed' | 'not-running' | 'missing-keys' | 'failed'; message: string; missing: string[] };

// Groups cite keys by the Zotero library that holds them (the first library
// wins when a key exists in several); keys no library knows come back apart.
// Copied from virtual-outliner's src/core/exportBody.ts.
export function groupKeysByLibrary(
	keys: readonly string[],
	known: readonly LibraryKey[],
): { byLibrary: Map<number, string[]>; unknown: string[] } {
	const libraryOf = new Map<string, number>();
	for (const k of known) if (!libraryOf.has(k.citekey)) libraryOf.set(k.citekey, k.libraryID);
	const byLibrary = new Map<number, string[]>();
	const unknown: string[] = [];
	for (const key of keys) {
		const lib = libraryOf.get(key);
		if (lib === undefined) {
			unknown.push(key);
			continue;
		}
		const list = byLibrary.get(lib) ?? [];
		list.push(key);
		byLibrary.set(lib, list);
	}
	return { byLibrary, unknown };
}

// One .bib from several per-library exports, each separated by a blank line.
export function concatBib(parts: readonly string[]): string {
	const kept = parts.map((p) => p.trim()).filter((p) => p !== '');
	return kept.length === 0 ? '' : `${kept.join('\n\n')}\n`;
}

export async function fetchBibLaTeX(api: ZoteroManagerApiLike | null, keys: readonly string[]): Promise<BibFetch> {
	const fail = (reason: Exclude<BibFetch, { ok: true }>['reason'], message: string, missing: string[] = []): BibFetch => ({
		ok: false,
		reason,
		message,
		missing,
	});
	if (api === null) {
		return fail('not-installed', 'This note cites sources, but the Zotero Manager plugin (1.1.15 or later) is not installed or enabled.');
	}
	if (!(await api.isAvailable())) {
		return fail('not-running', "Zotero isn't reachable. Start Zotero with Better BibTeX and render again.");
	}
	const { byLibrary, unknown } = groupKeysByLibrary(keys, await api.getAllCiteKeys(true));
	if (unknown.length > 0) {
		return fail('missing-keys', `These citekeys are not in Zotero: ${unknown.join(', ')}`, unknown);
	}
	const parts: string[] = [];
	const libraries = [...byLibrary.keys()].sort((a, b) => a - b);
	for (const library of libraries) {
		const libKeys = byLibrary.get(library) ?? [];
		const bib = await api.getBibLaTeX(
			libKeys.map((key) => ({ key, library })),
			library,
		);
		if (bib === null) return fail('failed', `Zotero Manager could not export BibLaTeX from Zotero library ${library}.`);
		parts.push(bib);
	}
	return { ok: true, bib: concatBib(parts), libraries };
}
