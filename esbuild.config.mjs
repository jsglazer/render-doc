import esbuild from 'esbuild';
import process from 'process';
import { builtinModules } from 'node:module';

const prod = process.argv[2] === 'production';

const context = await esbuild.context({
	entryPoints: ['src/main.ts'],
	bundle: true,
	external: ['obsidian', 'electron', '@electron/remote', ...builtinModules],
	format: 'cjs',
	target: 'es2018',
	logLevel: 'info',
	sourcemap: prod ? false : 'inline',
	treeShaking: true,
	outfile: 'main.js',
	// The renderer (renderer/) ships inside main.js as strings, so it travels
	// wherever the plugin syncs; src/export/installer.ts writes it out.
	loader: { '.sh': 'text', '.py': 'text' },
	minify: false,
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
