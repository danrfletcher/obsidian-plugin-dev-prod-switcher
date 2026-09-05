import * as fs from "fs";
import * as path from "path";
import { App, FileSystemAdapter } from "obsidian";

/** Absolute filesystem path to the vault root. Desktop-only, callers must gate. */
export function getVaultBasePath(app: App): string {
	const adapter = app.vault.adapter;
	if (adapter instanceof FileSystemAdapter) {
		return adapter.getBasePath();
	}
	throw new Error(
		"Dev-Prod Switcher: no filesystem adapter available (not running on desktop)."
	);
}

/** Absolute filesystem path to `.obsidian/plugins/<id>`. */
export function getPluginDir(app: App, id: string): string {
	return path.join(
		getVaultBasePath(app),
		app.vault.configDir,
		"plugins",
		id
	);
}

export function exists(p: string): boolean {
	try {
		fs.accessSync(p);
		return true;
	} catch {
		return false;
	}
}

export function isSymlink(p: string): boolean {
	try {
		return fs.lstatSync(p).isSymbolicLink();
	} catch {
		return false;
	}
}

/**
 * (Re)creates a symlink at `linkPath` pointing at `targetPath`. Removes
 * whatever is currently at `linkPath` first (file, stale symlink, or — never
 * expected here, but guarded — a directory), so re-linking is idempotent.
 */
export function forceSymlink(targetPath: string, linkPath: string): void {
	if (exists(linkPath) || isSymlink(linkPath)) {
		fs.rmSync(linkPath, { force: true, recursive: true });
	}
	fs.symlinkSync(targetPath, linkPath, "file");
}

/**
 * Copies `srcPath` over `destPath` only if the content actually differs
 * (mtime/size aren't reliable enough across the copy step's own writes, and
 * a full-content compare is cheap for plugin-sized build output). Returns
 * whether a copy actually happened, so callers can skip redundant work
 * (e.g. re-triggering Hot Reload's manifest-change branch needlessly).
 */
export function copyIfChanged(srcPath: string, destPath: string): boolean {
	const src = fs.readFileSync(srcPath);
	// A leftover symlink at destPath (e.g. from an older version of this
	// plugin) must be removed first — writeFileSync follows symlinks, which
	// would otherwise write through it to whatever it points at instead of
	// replacing it with a real file.
	if (isSymlink(destPath)) {
		fs.rmSync(destPath, { force: true });
	} else if (exists(destPath)) {
		const dest = fs.readFileSync(destPath);
		if (src.equals(dest)) return false;
	}
	fs.writeFileSync(destPath, src);
	return true;
}

export function removeIfExists(p: string): void {
	if (exists(p) || isSymlink(p)) {
		fs.rmSync(p, { force: true, recursive: true });
	}
}

export function ensureDir(p: string): void {
	fs.mkdirSync(p, { recursive: true });
}

export function readJson<T>(p: string): T | null {
	try {
		// Route through `unknown` rather than casting JSON.parse's `any`
		// straight to T — same static result, but avoids "unsafe return"
		// lint findings at every call site that pass a generic through here.
		const parsed: unknown = JSON.parse(fs.readFileSync(p, "utf8"));
		return parsed as T;
	} catch {
		return null;
	}
}

export function writeJson(p: string, data: unknown): void {
	fs.writeFileSync(p, JSON.stringify(data, null, "\t") + "\n", "utf8");
}
