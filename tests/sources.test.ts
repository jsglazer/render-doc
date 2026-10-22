import { describe, expect, it } from 'vitest';

import type { NoteMeta } from '../src/core/sources';
import {
	buildCiteIndex,
	collectSourceNotes,
	discoverSources,
	findAmbiguities,
	normalizeCiteshort,
	parseCiteSources,
	resolveScope,
} from '../src/core/sources';

const NOTE = 'Classes/2026-B/POGO 801/Assign/Polarization/Paper.md';

const FOLDERS = new Set([
	'Classes',
	'Classes/2026-B',
	'Classes/2026-B/POGO 801',
	'Classes/2026-B/POGO 801/Assign',
	'Classes/2026-B/POGO 801/Assign/Polarization',
	'Classes/2026-B/POGO 801/Assign/Polarization/Sources',
	'Classes/2026-B/POGO 801/Readings',
	'Library/Sources',
	'Top',
]);
const exists = (f: string): boolean => FOLDERS.has(f);

function source(path: string, citekey: unknown, citeshort: unknown): NoteMeta {
	return { path, frontmatter: { citekey, citeshort, doctype: 'source' } };
}

const NOTES: NoteMeta[] = [
	{ path: NOTE, frontmatter: { title: 'Paper' } },
	source('Classes/2026-B/POGO 801/Assign/Polarization/Sources/Bonica-2018.md', 'Bonica-InferringRollCallScores-2018', 'Bonica, 2018'),
	source('Classes/2026-B/POGO 801/Assign/Polarization/Sources/Shor-2011.md', 'ShorMcCarty-Ideological-2011', 'Shor and McCarty, 2011'),
	source('Classes/2026-B/POGO 801/Assign/Other.md', 'Other-2020', 'Other, 2020'),
	source('Classes/2026-B/POGO 801/Readings/Far.md', 'Far-2019', 'Far, 2019'),
	source('Library/Sources/Lib.md', 'Lib-2001', 'Lib, 2001'),
	source('Classes/2026-B/POGO 801/Assign/EmptyShort.md', 'Empty-2000', ''),
	source('Classes/2026-B/POGO 801/Assign/NoKey.md', undefined, 'NoKey, 2000'),
	source('Classes/2026-B/POGO 801/Assign/Blank.md', '   ', 'Blank, 2000'),
	{ path: 'Classes/2026-B/POGO 801/Assign/NoFrontmatter.md', frontmatter: undefined },
];

describe('parseCiteSources', () => {
	it('accepts a string or a list and normalizes slashes', () => {
		expect(parseCiteSources('Library/Sources/')).toEqual(['Library/Sources']);
		expect(parseCiteSources(['/Library/Sources', 'Top', 'Top'])).toEqual(['Library/Sources', 'Top']);
	});
	it('is null when absent, empty or not strings', () => {
		expect(parseCiteSources(undefined)).toBeNull();
		expect(parseCiteSources('  ')).toBeNull();
		expect(parseCiteSources([1, null])).toBeNull();
	});
	it('maps an explicit "/" to the vault root', () => {
		expect(parseCiteSources('/')).toEqual(['']);
	});
});

describe('resolveScope', () => {
	it('uses explicit cite-sources folders from the frontmatter', () => {
		expect(resolveScope(NOTE, ['Library/Sources', 'Top'], exists)).toEqual({ roots: ['Library/Sources', 'Top'], warnings: [] });
	});

	it('warns about missing cite-sources folders and keeps the rest', () => {
		const r = resolveScope(NOTE, ['Library/Sources', 'Nope'], exists);
		expect(r.roots).toEqual(['Library/Sources']);
		expect(r.warnings).toEqual(['cite-sources folder not found: Nope']);
	});

	it('falls back to the default scope when no cite-sources folder exists', () => {
		const r = resolveScope(NOTE, 'Nope', exists);
		expect(r.roots).toEqual(['Classes/2026-B/POGO 801/Assign']);
		expect(r.warnings).toHaveLength(2);
	});

	it('defaults to the folder tree one level above the note', () => {
		expect(resolveScope(NOTE, undefined, exists)).toEqual({ roots: ['Classes/2026-B/POGO 801/Assign'], warnings: [] });
	});

	it("searches the note's own folder, with a warning, when one level up is the vault root", () => {
		const r = resolveScope('Top/Paper.md', undefined, exists);
		expect(r.roots).toEqual(['Top']);
		expect(r.warnings[0]).toMatch(/vault root/);
	});

	it('never scans the vault root implicitly for a note at the root', () => {
		const r = resolveScope('Paper.md', undefined, exists);
		expect(r.roots).toEqual([]);
		expect(r.warnings[0]).toMatch(/cite-sources/);
	});
});

describe('collectSourceNotes', () => {
	it('keeps in-scope notes with both citekey and citeshort, and skips the rest', () => {
		const sources = collectSourceNotes(NOTES, ['Classes/2026-B/POGO 801/Assign']);
		expect(sources.map((s) => s.citekey)).toEqual(['Other-2020', 'Bonica-InferringRollCallScores-2018', 'ShorMcCarty-Ideological-2011']);
	});

	it('does not treat a folder-name prefix as containment', () => {
		const notes = [source('Classes/2026-B/POGO 801/AssignX/A.md', 'A', 'A, 2000')];
		expect(collectSourceNotes(notes, ['Classes/2026-B/POGO 801/Assign'])).toEqual([]);
	});
});

describe('normalizeCiteshort', () => {
	it('trims, collapses whitespace and applies NFC only', () => {
		expect(normalizeCiteshort('  Bonica,\t 2018 ')).toBe('Bonica, 2018');
		expect(normalizeCiteshort('Müller, 2001')).toBe('Müller, 2001');
	});
	it('does no and/&, et al. or hyphen folding', () => {
		expect(normalizeCiteshort('Shor & McCarty, 2011')).not.toBe(normalizeCiteshort('Shor and McCarty, 2011'));
		expect(normalizeCiteshort('Handan‐Nader et al., 2026')).not.toBe(normalizeCiteshort('Handan-Nader et al., 2026'));
	});
});

describe('ambiguity', () => {
	const dupSameKey = [source('A/x.md', 'Same-2018', 'Bonica, 2018'), source('A/y.md', 'Same-2018', 'Bonica,  2018')];
	const dupDifferentKeys = [source('A/x.md', 'Bonica-A-2018', 'Bonica, 2018'), source('A/y.md', 'Bonica-B-2018', 'Bonica, 2018')];

	it('does not flag duplicates that share a citekey', () => {
		expect(findAmbiguities(buildCiteIndex(collectSourceNotes(dupSameKey, ['A'])))).toEqual([]);
	});

	it('flags a citeshort shared by different citekeys', () => {
		const amb = findAmbiguities(buildCiteIndex(collectSourceNotes(dupDifferentKeys, ['A'])));
		expect(amb).toHaveLength(1);
		expect(amb[0]?.citeshort).toBe('Bonica, 2018');
		expect(amb[0]?.entries.map((e) => e.citekey)).toEqual(['Bonica-A-2018', 'Bonica-B-2018']);
	});
});

describe('discoverSources', () => {
	it('runs the whole discovery with no Obsidian runtime', () => {
		const d = discoverSources(NOTE, undefined, NOTES, exists);
		expect(d.roots).toEqual(['Classes/2026-B/POGO 801/Assign']);
		expect(d.sources).toHaveLength(3);
		expect(d.index.get('Bonica, 2018')).toEqual([
			{ citekey: 'Bonica-InferringRollCallScores-2018', path: 'Classes/2026-B/POGO 801/Assign/Polarization/Sources/Bonica-2018.md' },
		]);
		expect(d.index.has('Far, 2019')).toBe(false);
		expect(d.ambiguities).toEqual([]);
	});

	it('honours cite-sources over the default', () => {
		const d = discoverSources(NOTE, 'Library/Sources', NOTES, exists);
		expect(d.sources.map((s) => s.citekey)).toEqual(['Lib-2001']);
	});
});
