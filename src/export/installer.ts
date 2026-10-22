// Writes the bundled renderer to a fixed local folder on this Mac, using
// virtual-outliner's installer pattern (Developer Decision "Reuse"):
//
//   ~/Library/Application Support/render-doc/
//     renderer/<pluginVersion>-<hash>/   one folder per bundled renderer
//
// main.js carries the renderer, so it reaches every Mac that syncs the plugin
// with no deploy step. Scripts are run as `/bin/zsh file` / `python3 file`,
// never via their executable bit, which sync services drop.

import { node, SEARCH_PATH } from './node';
import { RENDERER_FILES } from './rendererFiles';

const KEEP_VERSIONS = 3;
const BUILD_DIR_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function supportDir(): string {
	const { path, os } = node();
	return path.join(os.homedir(), 'Library', 'Application Support', 'render-doc');
}

// Staging folders live under $TMPDIR; a failed export's folder is kept for its
// log and pruned after a week.
export function buildRoot(): string {
	const { path, os } = node();
	return path.join(os.tmpdir(), 'render-doc-build');
}

function rendererHash(): string {
	const hash = node().crypto.createHash('sha256');
	for (const name of Object.keys(RENDERER_FILES).sort()) {
		hash.update(name).update('\0').update(RENDERER_FILES[name] ?? '').update('\0');
	}
	return hash.digest('hex').slice(0, 8);
}

// Installs this plugin version's renderer if it isn't there yet and returns
// its folder. Written to a temp sibling first and renamed into place, so a
// second window never sees half-written files.
export async function ensureRenderer(pluginVersion: string): Promise<string> {
	const { fs, path, crypto } = node();
	const root = path.join(supportDir(), 'renderer');
	const name = `${pluginVersion}-${rendererHash()}`;
	const dir = path.join(root, name);
	await fs.promises.mkdir(root, { recursive: true });

	if (!fs.existsSync(path.join(dir, 'render-pdf.sh'))) {
		const tmp = `${dir}.partial-${crypto.randomBytes(4).toString('hex')}`;
		for (const [rel, content] of Object.entries(RENDERER_FILES)) {
			const file = path.join(tmp, rel);
			await fs.promises.mkdir(path.dirname(file), { recursive: true });
			await fs.promises.writeFile(file, content, 'utf8');
		}
		try {
			await fs.promises.rename(tmp, dir);
		} catch {
			// Another window installed the same version first; theirs is identical.
			await fs.promises.rm(tmp, { recursive: true, force: true });
		}
	}
	await pruneVersions(root, name);
	return dir;
}

async function pruneVersions(root: string, keep: string): Promise<void> {
	const { fs, path } = node();
	const entries = await fs.promises.readdir(root, { withFileTypes: true });
	const dirs: { name: string; mtime: number }[] = [];
	for (const e of entries) {
		if (!e.isDirectory()) continue;
		const full = path.join(root, e.name);
		const stat = await fs.promises.stat(full);
		if (e.name.includes('.partial-')) {
			if (Date.now() - stat.mtimeMs > 60 * 60 * 1000) await fs.promises.rm(full, { recursive: true, force: true });
			continue;
		}
		dirs.push({ name: e.name, mtime: stat.mtimeMs });
	}
	dirs.sort((a, b) => b.mtime - a.mtime);
	const survivors = new Set([keep, ...dirs.slice(0, KEEP_VERSIONS).map((d) => d.name)]);
	for (const d of dirs) {
		if (!survivors.has(d.name)) await fs.promises.rm(path.join(root, d.name), { recursive: true, force: true });
	}
}

export function findTool(name: string): string | null {
	const { fs, path } = node();
	for (const dir of SEARCH_PATH) {
		const candidate = path.join(dir, name);
		try {
			fs.accessSync(candidate, fs.constants.X_OK);
			return candidate;
		} catch {
			// keep looking
		}
	}
	return null;
}

// biber is required alongside the virtual-outliner set: every citation is
// typeset with biblatex + biber (builder constraint §4).
export const REQUIRED_TOOLS = ['pandoc', 'latexmk', 'lualatex', 'biber', 'python3'] as const;

export function missingTools(): string[] {
	return REQUIRED_TOOLS.filter((t) => findTool(t) === null);
}

export async function pruneBuildDirs(): Promise<void> {
	const { fs, path } = node();
	const root = buildRoot();
	if (!fs.existsSync(root)) return;
	for (const name of await fs.promises.readdir(root)) {
		const dir = path.join(root, name);
		const stat = await fs.promises.stat(dir).catch(() => null);
		if (stat && Date.now() - stat.mtimeMs > BUILD_DIR_MAX_AGE_MS) {
			await fs.promises.rm(dir, { recursive: true, force: true });
		}
	}
}
