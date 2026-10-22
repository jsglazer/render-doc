// Headless integration test of renderer/render-pdf.sh with the real toolchain:
// pandoc, latexmk, lualatex, biber, Josh's LatexPre.tex and a fixture refs.bib.
// The build folder is prepared by the same core functions the plugin uses
// (prepareDocument, buildFiles) and LatexPre.tex is staged by the plugin's own
// stream copy (stageByStream).
//
// Everything is written under a fresh temp folder: the export parent, the build
// folder and the biber cache. Nothing touches ~/Library/CloudStorage/Dropbox/
// _Schar/Classes or any .obsidian folder. The test skips itself on a Mac
// without the toolchain or LatexPre.tex.

import { execFileSync } from 'node:child_process';
import { accessSync, constants, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readDocMeta } from '../../src/core/document';
import { citeHeader } from '../../src/core/latex';
import type { ExportResolver } from '../../src/core/obsidianMarkdown';
import { buildFiles, prepareDocument } from '../../src/core/render';
import { PREAMBLE_PATH_HOME } from '../../src/core/settings';
import { discoverSources } from '../../src/core/sources';
import { SEARCH_PATH } from '../../src/export/node';
import { runRenderer } from '../../src/export/runRenderer';
import type { RendererStatus } from '../../src/export/runRenderer';
import { stageByStream } from '../../src/export/staging';

const ROOT = join(__dirname, '..', '..');
const RENDERER = join(ROOT, 'renderer', 'render-pdf.sh');
const FIXTURES = join(ROOT, 'tests', 'fixtures');
const PREAMBLE = join(homedir(), PREAMBLE_PATH_HOME);
const TOOLS = ['pandoc', 'latexmk', 'lualatex', 'biber', 'python3', 'pdftotext'];
const AUX = /\.(aux|bbl|bcf|blg|fls|fdb_latexmk|run\.xml|log|out|toc)$/;

function hasTool(name: string): boolean {
	return SEARCH_PATH.some((dir) => {
		try {
			accessSync(join(dir, name), constants.X_OK);
			return true;
		} catch {
			return false;
		}
	});
}

const missing = TOOLS.filter((t) => !hasTool(t));
const ready = missing.length === 0 && existsSync(PREAMBLE);
if (!ready) {
	process.stderr.write(`render integration test skipped: ${missing.length > 0 ? `missing ${missing.join(', ')}` : `no ${PREAMBLE}`}\n`);
}

const NOTE = [
	'---',
	'title: Polarization & Money',
	'---',
	'@ Outline entry that must not appear',
	'Campaign money predicts roll-call ideology (Bonica, 2018: 123), and state legislatures polarize (Shor and McCarty, 2011).',
	'',
	'An uncited claim (Jones, 2015) stays highlighted, as does prose about code like `(Bonica, 2018)`.',
	'### State-level data',
	'A heading typed right under a text line, as Obsidian allows.',
	'',
	'![[fig.png|40]]',
].join('\n');

const ENV_PATH = [...SEARCH_PATH, '/usr/sbin', '/sbin', process.env.PATH ?? ''].join(':');

function pdfText(pdf: string): string {
	return execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8', env: { ...process.env, PATH: ENV_PATH } });
}

function listTree(dir: string): string[] {
	const out: string[] = [];
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, e.name);
		if (e.isDirectory()) out.push(`${e.name}/`, ...listTree(full).map((f) => `${e.name}/${f}`));
		else out.push(e.name);
	}
	return out.sort();
}

describe.skipIf(!ready)('render-pdf.sh (real toolchain)', () => {
	let tmp = '';
	let buildDir = '';
	let parentDir = '';
	let status: RendererStatus;
	let unmatchedCount = 0;

	beforeAll(async () => {
		tmp = mkdtempSync(join(tmpdir(), 'render-doc-it-'));
		buildDir = join(tmp, 'build');
		parentDir = join(tmp, 'out');
		mkdirSync(join(buildDir, 'assets'), { recursive: true });
		mkdirSync(parentDir);
		process.env.RENDER_DOC_CACHE = join(tmp, 'cache');

		const discovery = discoverSources(
			'Classes/Polarization/Paper.md',
			undefined,
			[
				{ path: 'Classes/Sources/Bonica.md', frontmatter: { citekey: 'Bonica-InferringRollCallScores-2018', citeshort: 'Bonica, 2018' } },
				{ path: 'Classes/Sources/Shor.md', frontmatter: { citekey: 'ShorMcCarty-IdeologicalMappingAmerican-2011', citeshort: 'Shor and McCarty, 2011' } },
			],
			() => true,
		);
		const resolver: ExportResolver = {
			resolveLink: (link) => (link === 'fig.png' ? { path: 'Classes/Polarization/fig.png', kind: 'image' } : null),
			readNote: () => Promise.resolve(''),
			stageImage: () => 'assets/1-fig.png',
		};
		const prepared = await prepareDocument(NOTE, 'Classes/Polarization/Paper.md', '@', resolver, discovery.index);
		unmatchedCount = prepared.citations.unmatched.length;
		const { files, job } = buildFiles(prepared, readDocMeta({ title: 'Polarization & Money' }, 'Paper'), {
			resourcePath: FIXTURES,
			parentDir,
			folderName: 'Paper',
			stem: 'Paper',
			overwrite: false,
		});
		for (const [name, content] of Object.entries(files)) writeFileSync(join(buildDir, name), content, 'utf8');
		await stageByStream(PREAMBLE, join(buildDir, 'preamble.tex'));
		copyFileSync(join(FIXTURES, 'refs.bib'), join(buildDir, 'refs.bib'));
		copyFileSync(join(FIXTURES, 'fig.png'), join(buildDir, 'assets', '1-fig.png'));
		writeFileSync(join(buildDir, 'job.json'), JSON.stringify(job, null, 2), 'utf8');

		status = await runRenderer(RENDERER, join(buildDir, 'job.json'), buildDir);
	}, 300_000);

	afterAll(() => {
		delete process.env.RENDER_DOC_CACHE;
		if (tmp !== '') rmSync(tmp, { recursive: true, force: true });
	});

	it('succeeds and reports the export folder', () => {
		expect(status, JSON.stringify(status)).toMatchObject({ ok: true, output: join(parentDir, 'Paper'), pdf: join(parentDir, 'Paper', 'Paper.pdf') });
		expect(unmatchedCount).toBe(1);
	});

	it('delivers only the PDF, the .tex, refs.bib and media/', () => {
		const tree = listTree(join(parentDir, 'Paper'));
		expect(tree.filter((f) => !f.startsWith('media/') || f === 'media/')).toEqual(['Paper.pdf', 'Paper.tex', 'media/', 'refs.bib']);
		expect(tree.filter((f) => f.startsWith('media/') && !f.endsWith('/'))).toEqual(['media/assets/1-fig.png']);
		expect(tree.filter((f) => AUX.test(f))).toEqual([]);
	});

	it('leaves every LaTeX intermediate in the build folder', () => {
		expect(existsSync(join(buildDir, 'doc.aux'))).toBe(true);
		expect(existsSync(join(buildDir, 'doc.bcf'))).toBe(true);
		expect(existsSync(join(buildDir, 'doc.bbl'))).toBe(true);
	});

	it('renders the APSA-style citation, the highlight and the bibliography', () => {
		const text = pdfText(join(parentDir, 'Paper', 'Paper.pdf')).replace(/\s+/g, ' ');
		expect(text).toContain('(Bonica, 2018: 123)');
		expect(text).toContain('(Shor and McCarty, 2011)');
		expect(text).toContain('(Jones, 2015)');
		expect(text).toContain('Polarization & Money');
		expect(text).toContain('References');
		expect(text).toContain('Bonica, Adam. 2018.');
		expect(text).toContain('American Journal of Political Science 62(4): 830–848.');
		expect(text).toContain('Shor, Boris, and Nolan McCarty. 2011.');
		expect(text).not.toContain('Outline entry');
		expect(text).not.toContain('###');
		expect(text).toMatch(/highlighted, as does prose about code like \(Bonica, 2018\)\. \S*\s*State-level data A heading/);
		expect(text).not.toMatch(/p\. ?123/);
	});

	it('writes a standalone .tex with relative refs.bib and media paths', () => {
		const tex = readFileSync(join(parentDir, 'Paper', 'Paper.tex'), 'utf8');
		expect(tex).toContain('\\autocite[123]{Bonica-InferringRollCallScores-2018}');
		expect(tex).toContain('\\rdunmatched{(Jones, 2015)}');
		expect(tex).toContain('\\addbibresource{refs.bib}');
		expect(tex).toContain('\\fancyhead[R]{\\small{Joshua S. Glazer}}');
		expect(tex).toMatch(/\\includegraphics(\[[^\]]*\])?\{media\//);
		expect(tex).not.toContain(buildDir);
	});

	it('refuses an existing export folder unless the job says overwrite', () => {
		const python = SEARCH_PATH.map((d) => join(d, 'python3')).find((p) => existsSync(p)) ?? 'python3';
		let out = '';
		try {
			execFileSync(python, [join(ROOT, 'renderer', 'job.py'), 'deliver', join(buildDir, 'job.json')], { encoding: 'utf8' });
		} catch (e) {
			out = String((e as { stdout?: string }).stdout ?? '');
		}
		expect(JSON.parse(out.trim().split('\n').pop() ?? '{}')).toMatchObject({ ok: false, stage: 'collision' });
	});

	it('recompiles the delivered .tex in place', () => {
		const copy = join(tmp, 'recompile');
		cpSync(join(parentDir, 'Paper'), copy, { recursive: true });
		const env = { ...process.env, PATH: ENV_PATH };
		const biber = execFileSync('/bin/zsh', ['-c', `LOG=/dev/null; source ${JSON.stringify(join(ROOT, 'renderer', 'lib.sh'))}; resolve_biber`], { encoding: 'utf8', env }).trim();
		writeFileSync(join(copy, 'rc'), `$biber = q{"${biber}" %O %S};\n`);
		execFileSync('latexmk', ['-lualatex', '-interaction=nonstopmode', '-halt-on-error', '-r', 'rc', 'Paper.tex'], { cwd: copy, env, stdio: 'ignore', timeout: 240_000 });
		expect(pdfText(join(copy, 'Paper.pdf')).replace(/\s+/g, ' ')).toContain('(Bonica, 2018: 123)');
	}, 300_000);

	it('numbers the lines when cite.tex asks for it', () => {
		const numbered = join(tmp, 'numbered');
		cpSync(join(parentDir, 'Paper'), numbered, { recursive: true });
		const lineno = citeHeader(false, true).trim().split('\n').slice(-2).join('\n');
		const tex = readFileSync(join(numbered, 'Paper.tex'), 'utf8').replace('\\begin{document}', `${lineno}\n\\begin{document}`);
		writeFileSync(join(numbered, 'Paper.tex'), tex, 'utf8');
		const env = { ...process.env, PATH: ENV_PATH };
		const biber = execFileSync('/bin/zsh', ['-c', `LOG=/dev/null; source ${JSON.stringify(join(ROOT, 'renderer', 'lib.sh'))}; resolve_biber`], { encoding: 'utf8', env }).trim();
		writeFileSync(join(numbered, 'rc'), `$biber = q{"${biber}" %O %S};\n`);
		execFileSync('latexmk', ['-lualatex', '-interaction=nonstopmode', '-halt-on-error', '-r', 'rc', 'Paper.tex'], { cwd: numbered, env, stdio: 'ignore', timeout: 240_000 });
		expect(pdfText(join(numbered, 'Paper.pdf'))).toMatch(/^\s*1\s+\S/m);
		expect(pdfText(join(parentDir, 'Paper', 'Paper.pdf'))).not.toMatch(/^\s*1\s+\S/m);
	}, 300_000);

	it('overwrites only its own files when the job says overwrite', () => {
		const folder = join(parentDir, 'Paper');
		writeFileSync(join(folder, 'notes.txt'), 'mine', 'utf8');
		mkdirSync(join(folder, 'media', 'old'), { recursive: true });
		writeFileSync(join(folder, 'media', 'old', 'stale.png'), 'x', 'utf8');
		writeFileSync(join(folder, 'Paper.pdf'), 'old pdf', 'utf8');
		const jobPath = join(buildDir, 'job.json');
		const job = JSON.parse(readFileSync(jobPath, 'utf8')) as Record<string, unknown>;
		writeFileSync(jobPath, JSON.stringify({ ...job, overwrite: true }), 'utf8');

		const python = SEARCH_PATH.map((d) => join(d, 'python3')).find((p) => existsSync(p)) ?? 'python3';
		const out = execFileSync(python, [join(ROOT, 'renderer', 'job.py'), 'deliver', jobPath], { encoding: 'utf8' });
		expect(JSON.parse(out.trim().split('\n').pop() ?? '{}')).toMatchObject({ ok: true, output: folder });
		expect(listTree(folder)).toEqual(['Paper.pdf', 'Paper.tex', 'media/', 'media/assets/', 'media/assets/1-fig.png', 'notes.txt', 'refs.bib']);
		expect(readFileSync(join(folder, 'notes.txt'), 'utf8')).toBe('mine');
		expect(pdfText(join(folder, 'Paper.pdf'))).toContain('(Bonica, 2018: 123)');
	});
});
