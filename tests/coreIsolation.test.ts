// Reviewer criterion: src/core/ has zero value imports from 'obsidian' (and
// none from the adapter, the export shell or Node). Checked statically, so a
// stray import fails the suite instead of waiting for review.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const CORE = join(__dirname, '..', 'src', 'core');
const IMPORT_RE = /^\s*import\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/gm;

describe('src/core isolation', () => {
	const files = readdirSync(CORE).filter((f) => f.endsWith('.ts'));

	it('has core modules to check', () => {
		expect(files.length).toBeGreaterThan(5);
	});

	for (const file of files) {
		it(`${file} imports only sibling core modules`, () => {
			const text = readFileSync(join(CORE, file), 'utf8');
			const imports = [...text.matchAll(IMPORT_RE)].map((m) => m[2] ?? '');
			for (const spec of imports) expect(spec, `${file} imports ${spec}`).toMatch(/^\.\/[A-Za-z]+$/);
			expect(text).not.toMatch(/require\(/);
		});
	}
});
