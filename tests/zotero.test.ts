import { describe, expect, it } from 'vitest';

import type { CiteKeyRef, LibraryKey, ZoteroManagerApiLike } from '../src/core/zotero';
import { concatBib, fetchBibLaTeX, groupKeysByLibrary } from '../src/core/zotero';

// A fake ZoteroManagerAPI: library 1 is the personal library, 7 a group.
class FakeZoteroManager implements ZoteroManagerApiLike {
	version = 1;
	calls: { keys: CiteKeyRef[]; libraryID: number }[] = [];
	constructor(
		private available: boolean,
		private known: LibraryKey[],
		private bibs: Record<number, string | null>,
	) {}
	isAvailable(): Promise<boolean> {
		return Promise.resolve(this.available);
	}
	getAllCiteKeys(): Promise<LibraryKey[]> {
		return Promise.resolve(this.known);
	}
	getBibLaTeX(keys: CiteKeyRef[], libraryID: number): Promise<string | null> {
		this.calls.push({ keys, libraryID });
		return Promise.resolve(this.bibs[libraryID] ?? null);
	}
}

const KNOWN: LibraryKey[] = [
	{ citekey: 'Bonica-2018', libraryID: 1 },
	{ citekey: 'Shor-2011', libraryID: 7 },
	{ citekey: 'Lee-2020', libraryID: 1 },
	{ citekey: 'Shor-2011', libraryID: 1 }, // also in library 1; the first listing wins
];

describe('groupKeysByLibrary', () => {
	it('groups keys by their library and separates unknown ones', () => {
		const { byLibrary, unknown } = groupKeysByLibrary(['Bonica-2018', 'Shor-2011', 'Lee-2020', 'Nope'], KNOWN);
		expect([...byLibrary.entries()]).toEqual([
			[1, ['Bonica-2018', 'Lee-2020']],
			[7, ['Shor-2011']],
		]);
		expect(unknown).toEqual(['Nope']);
	});
});

describe('concatBib', () => {
	it('joins non-empty parts with one blank line and a final newline', () => {
		expect(concatBib(['@a{x}\n\n', '', '  @b{y}'])).toBe('@a{x}\n\n@b{y}\n');
		expect(concatBib([])).toBe('');
	});
});

describe('fetchBibLaTeX', () => {
	it('fails when Zotero Manager is not installed', async () => {
		const r = await fetchBibLaTeX(null, ['Bonica-2018']);
		expect(r).toMatchObject({ ok: false, reason: 'not-installed' });
	});

	it('fails when Zotero is unavailable, before asking for keys', async () => {
		const api = new FakeZoteroManager(false, KNOWN, {});
		const r = await fetchBibLaTeX(api, ['Bonica-2018']);
		expect(r).toMatchObject({ ok: false, reason: 'not-running' });
		expect(api.calls).toEqual([]);
	});

	it('aborts and lists citekeys missing from Zotero, exporting nothing', async () => {
		const api = new FakeZoteroManager(true, KNOWN, { 1: '@x{}' });
		const r = await fetchBibLaTeX(api, ['Bonica-2018', 'Gone-1999', 'Lost-2000']);
		expect(r).toMatchObject({ ok: false, reason: 'missing-keys', missing: ['Gone-1999', 'Lost-2000'] });
		if (!r.ok) expect(r.message).toContain('Gone-1999, Lost-2000');
		expect(api.calls).toEqual([]);
	});

	it('exports per library and concatenates the .bib', async () => {
		const api = new FakeZoteroManager(true, KNOWN, {
			1: '@article{Bonica-2018,\n  title = {A}\n}\n@article{Lee-2020,\n  title = {C}\n}\n',
			7: '@article{Shor-2011,\n  title = {B}\n}\n',
		});
		const r = await fetchBibLaTeX(api, ['Shor-2011', 'Bonica-2018', 'Lee-2020']);
		expect(api.calls).toEqual([
			{
				keys: [
					{ key: 'Bonica-2018', library: 1 },
					{ key: 'Lee-2020', library: 1 },
				],
				libraryID: 1,
			},
			{ keys: [{ key: 'Shor-2011', library: 7 }], libraryID: 7 },
		]);
		expect(r).toEqual({
			ok: true,
			libraries: [1, 7],
			bib: '@article{Bonica-2018,\n  title = {A}\n}\n@article{Lee-2020,\n  title = {C}\n}\n\n@article{Shor-2011,\n  title = {B}\n}\n',
		});
	});

	it('fails when a library export returns null', async () => {
		const api = new FakeZoteroManager(true, KNOWN, { 1: '@a{}', 7: null });
		const r = await fetchBibLaTeX(api, ['Bonica-2018', 'Shor-2011']);
		expect(r).toMatchObject({ ok: false, reason: 'failed' });
	});
});
