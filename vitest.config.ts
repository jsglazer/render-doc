import { defineConfig } from 'vitest/config';

// Headless tests. Unit tests import only from src/core/, which has zero
// dependencies on 'obsidian' or the DOM. The integration test drives the real
// renderer (renderer/render-pdf.sh) with pandoc, latexmk, lualatex and biber,
// and skips itself when that toolchain or LatexPre.tex is not on this Mac.
export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node',
		coverage: {
			provider: 'v8',
			include: ['src/core/**/*.ts'],
			reporter: ['text', 'html'],
		},
	},
});
