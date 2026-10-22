// Node/Electron modules, loaded lazily so nothing evaluates them until a
// desktop export actually runs (the plugin is desktop-only, but a top-level
// require would still run during Obsidian's plugin load).
// Copied from virtual-outliner's src/export/node.ts.

/* eslint-disable @typescript-eslint/no-require-imports -- desktop-only export needs fs/child_process, loaded lazily */

export interface NodeModules {
	fs: typeof import('fs');
	path: typeof import('path');
	os: typeof import('os');
	crypto: typeof import('crypto');
	childProcess: typeof import('child_process');
	process: typeof import('process');
	stream: typeof import('stream/promises');
}

// Where pandoc, MacTeX and python3 live; Obsidian's own PATH rarely has them.
export const SEARCH_PATH = ['/opt/homebrew/bin', '/usr/local/bin', '/Library/TeX/texbin', '/usr/bin', '/bin'];

let cached: NodeModules | null = null;

export function node(): NodeModules {
	if (cached === null) {
		cached = {
			fs: require('fs') as typeof import('fs'),
			path: require('path') as typeof import('path'),
			os: require('os') as typeof import('os'),
			crypto: require('crypto') as typeof import('crypto'),
			childProcess: require('child_process') as typeof import('child_process'),
			process: require('process') as typeof import('process'),
			stream: require('stream/promises') as typeof import('stream/promises'),
		};
	}
	return cached;
}
