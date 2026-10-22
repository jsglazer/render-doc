// Runs renderer/render-pdf.sh on a staged build folder and parses the JSON
// status line it always prints last. No 'obsidian' import, so the integration
// test drives the renderer through this exact function.

import { node, SEARCH_PATH } from './node';

const RENDER_TIMEOUT_MS = 5 * 60 * 1000;

export type RendererStatus = { ok: true; output: string; pdf: string } | { ok: false; stage: string; message: string };

export function runRenderer(script: string, jobPath: string, cwd: string): Promise<RendererStatus> {
	const { childProcess, process } = node();
	return new Promise((resolve) => {
		const env = { ...process.env, PATH: [...SEARCH_PATH, '/usr/sbin', '/sbin', process.env.PATH ?? ''].join(':') };
		const child = childProcess.execFile(
			'/bin/zsh',
			[script, '--job', jobPath],
			{ cwd, env, timeout: RENDER_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
			(error, stdout, stderr) => {
				const last = stdout.trim().split('\n').pop() ?? '';
				try {
					const parsed = JSON.parse(last) as { ok?: boolean; output?: string; pdf?: string; stage?: string; message?: string };
					if (parsed.ok === true && typeof parsed.output === 'string' && typeof parsed.pdf === 'string') {
						resolve({ ok: true, output: parsed.output, pdf: parsed.pdf });
						return;
					}
					resolve({ ok: false, stage: parsed.stage ?? 'render', message: parsed.message ?? 'The renderer failed.' });
				} catch {
					const detail = error?.killed ? 'The renderer timed out.' : (stderr || stdout || error?.message || '').trim().slice(-2000);
					resolve({ ok: false, stage: 'render', message: detail || 'The renderer failed without a message.' });
				}
			},
		);
		child.stdin?.end();
	});
}
