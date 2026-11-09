// THE adapter for every undocumented surface Render Doc touches. Nothing else
// in the plugin reaches into an Obsidian private object or Electron; when one
// of these breaks, the fix is confined to this file. src/core/ never imports it.
//
// | Surface                                   | Targeted version            | Verified                                                        |
// |-------------------------------------------|-----------------------------|-----------------------------------------------------------------|
// | Obsidian `app.plugins.plugins[id]`        | 1.14.4 (minAppVersion 1.7.2) | installed obsidian-1.14.4.asar: `this.plugins={}`, `getPlugin(e)` reads it, 2026-10-21 |
// | Electron `dialog` / `shell`               | 39.8.3                      | Electron Framework CFBundleVersion, 2026-10-21                  |
// | zotero-manager public `api`               | API version 1 (plugin 1.1.15) | jsglazer/zotero-manager origin src/api.ts (getBibLaTeX, getAllCiteKeys), 2026-10-21 |
// | Excalidraw `ea.getAPI().createPNG`        | obsidian-excalidraw-plugin 2.29.2 | live export of a VaultSchar drawing via the Obsidian CLI, 1828×614 PNG Blob, 2026-11-08 |
//
// The build prompt's generic note about file-explorer internals (fileItems,
// setCollapsed) does not apply: this plugin's audit specified no explorer
// access, so none is taken.

import type { App } from 'obsidian';

import type { ZoteroManagerApiLike } from '../core/zotero';

export const TARGETED_OBSIDIAN_VERSION = '1.14.4';
export const TARGETED_ELECTRON_VERSION = '39.8.3';

/* ------------------------------------------------------------------ plugin registry -- */

// `App.plugins` is not in obsidian.d.ts. This is the only place its shape is asserted.
interface PluginRegistry {
	plugins?: Record<string, { api?: unknown; ea?: unknown } | undefined>;
}

/* ------------------------------------------------------------------ Excalidraw -- */

// The slice of ExcalidrawAutomate Render Doc uses: createPNG(templatePath,
// scale, exportSettings, loader, theme, padding) → PNG Blob.
interface ExcalidrawAutomateLike {
	getAPI?(): ExcalidrawAutomateLike;
	createPNG(templatePath: string, scale?: number, exportSettings?: { withBackground: boolean; withTheme: boolean }, loader?: undefined, theme?: string, padding?: number): Promise<Blob>;
}

function excalidrawAutomate(app: App): ExcalidrawAutomateLike | null {
	const registry = (app as App & { plugins?: PluginRegistry }).plugins;
	const ea = registry?.plugins?.['obsidian-excalidraw-plugin']?.ea as Partial<ExcalidrawAutomateLike> | undefined;
	if (!ea || typeof ea.createPNG !== 'function') return null;
	const fresh = typeof ea.getAPI === 'function' ? ea.getAPI() : (ea as ExcalidrawAutomateLike);
	return typeof fresh.createPNG === 'function' ? fresh : null;
}

// Whether the Excalidraw plugin is enabled and can export drawings.
export function excalidrawAvailable(app: App): boolean {
	return excalidrawAutomate(app) !== null;
}

// A drawing as a PNG for print: 2× scale, light theme on a white background,
// 10 px padding. Throws when Excalidraw is unavailable or the export fails.
export async function exportDrawingPng(app: App, drawingPath: string): Promise<ArrayBuffer> {
	const ea = excalidrawAutomate(app);
	if (ea === null) throw new Error('the Excalidraw plugin is not enabled');
	const blob = await ea.createPNG(drawingPath, 2, { withBackground: true, withTheme: false }, undefined, 'light', 10);
	if (!(blob instanceof Blob) || blob.size === 0) throw new Error(`Excalidraw returned no image for ${drawingPath}`);
	return blob.arrayBuffer();
}

// Zotero Manager's API object when the plugin is enabled and exposes the
// version-1 calls Render Doc needs (getBibLaTeX arrived in 1.1.15), else null.
export function zoteroManagerApi(app: App): ZoteroManagerApiLike | null {
	const registry = (app as App & { plugins?: PluginRegistry }).plugins;
	const api = registry?.plugins?.['zotero-manager']?.api as Partial<ZoteroManagerApiLike> | undefined;
	if (!api || typeof api.version !== 'number' || api.version < 1) return null;
	if (typeof api.isAvailable !== 'function' || typeof api.getAllCiteKeys !== 'function' || typeof api.getBibLaTeX !== 'function') {
		return null;
	}
	return api as ZoteroManagerApiLike;
}

/* ------------------------------------------------------------------------- electron -- */

/* eslint-disable @typescript-eslint/no-require-imports -- Electron is only reachable through require at runtime */

interface ElectronDialog {
	showOpenDialog(options: {
		title: string;
		defaultPath?: string;
		properties: ('openDirectory' | 'createDirectory')[];
	}): Promise<{ canceled: boolean; filePaths: string[] }>;
}

interface ElectronShell {
	showItemInFolder(path: string): void;
}

interface ElectronModule {
	remote?: { dialog?: ElectronDialog };
	dialog?: ElectronDialog;
	shell?: ElectronShell;
}

function electronModule(id: string): ElectronModule | null {
	try {
		return require(id) as ElectronModule;
	} catch {
		return null;
	}
}

// Native folder picker. Resolves to null on cancel; throws when Electron's
// dialog cannot be reached at all.
export async function pickFolder(title: string, defaultPath: string): Promise<string | null> {
	for (const id of ['electron', '@electron/remote']) {
		const dialog = electronModule(id)?.remote?.dialog ?? electronModule(id)?.dialog;
		if (dialog === undefined) continue;
		const result = await dialog.showOpenDialog({
			title,
			...(defaultPath === '' ? {} : { defaultPath }),
			properties: ['openDirectory', 'createDirectory'],
		});
		return result.canceled ? null : (result.filePaths[0] ?? null);
	}
	throw new Error("Electron's folder dialog could not be reached.");
}

// Reveals a file in Finder. False when Electron's shell is unavailable.
export function revealInFinder(path: string): boolean {
	const shell = electronModule('electron')?.shell;
	if (!shell) return false;
	shell.showItemInFolder(path);
	return true;
}
