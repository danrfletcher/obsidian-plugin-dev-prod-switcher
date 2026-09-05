import * as path from "path";
import { App, PluginManifest } from "obsidian";
import { DEV_ID_SUFFIX } from "./constants";
import { getPluginDir } from "./util/fsHelpers";
import * as fsh from "./util/fsHelpers";
import { isPluginActive } from "./toggle";

export function devId(realId: string): string {
	return `${realId}${DEV_ID_SUFFIX}`;
}

/** Does the dev folder currently have a build output at all? */
export function isDevFolderBuilt(devFolderPath: string): boolean {
	return fsh.exists(path.join(devFolderPath, "main.js"));
}

function readSourceManifest(devFolderPath: string): Partial<PluginManifest> {
	const fromDevFolder = fsh.readJson<PluginManifest>(
		path.join(devFolderPath, "manifest.json")
	);
	return fromDevFolder ?? {};
}

/**
 * Creates/refreshes `.obsidian/plugins/<id>-dev/`: a real directory holding a
 * generated manifest.json (id `<id>-dev`, so it can coexist with the real
 * `<id>` without ever touching the real plugin's files — T3 AC1/AC2), a
 * *copy* of the dev folder's build output, and a `.hotreload` marker so Hot
 * Reload watches it.
 *
 * Build output is copied, not symlinked. A symlinked whole-folder plugin
 * path works with Hot Reload (it special-cases that), but individual
 * symlinked files inside an otherwise-real watched folder do not reliably
 * get change events forwarded to the folder watch — verified live in a test
 * container 2026-09-05: the very first load picks up the symlink's current
 * target fine, but subsequent rebuilds never re-trigger Hot Reload. Real
 * copies land as plain writes inside the folder Hot Reload is actually
 * watching, which is unambiguous. Call this again whenever the dev build
 * changes (see devFileWatcher.ts) to keep the copy fresh — this only copies
 * files, it never re-implements Hot Reload's own reload/debounce logic.
 */
export function syncDevWrapper(
	app: App,
	realId: string,
	realName: string,
	devFolderPath: string
): { wrapperDir: string; built: boolean } {
	const wrapperDir = getPluginDir(app, devId(realId));
	fsh.ensureDir(wrapperDir);

	const sourceManifest = readSourceManifest(devFolderPath);
	const manifest: PluginManifest = {
		id: devId(realId),
		name: `${realName} (Dev)`,
		version: sourceManifest.version ?? "0.0.0-dev",
		minAppVersion: sourceManifest.minAppVersion ?? "0.15.0",
		description:
			sourceManifest.description ??
			"Local dev build, linked by Dev-Prod Switcher.",
		author: sourceManifest.author ?? realName,
		authorUrl: sourceManifest.authorUrl,
		isDesktopOnly: sourceManifest.isDesktopOnly ?? false,
	};
	fsh.writeJson(path.join(wrapperDir, "manifest.json"), manifest);

	const built = isDevFolderBuilt(devFolderPath);
	// main.js/styles.css only — data.json is the *dev plugin instance's own*
	// runtime settings (written by its saveData()), not a build artifact.
	// Copying/deleting it based on the source folder's contents would wipe
	// the dev instance's settings on every rebuild.
	for (const file of ["main.js", "styles.css"]) {
		const src = path.join(devFolderPath, file);
		const dest = path.join(wrapperDir, file);
		if (fsh.exists(src)) {
			fsh.copyIfChanged(src, dest);
		} else {
			fsh.removeIfExists(dest);
		}
	}

	const marker = path.join(wrapperDir, ".hotreload");
	if (!fsh.exists(marker)) {
		fsh.writeJson(marker, {});
	}

	return { wrapperDir, built };
}

export async function removeDevWrapper(
	app: App,
	realId: string
): Promise<void> {
	const id = devId(realId);
	if (isPluginActive(app, id)) {
		await app.plugins.disablePluginAndSave(id);
	}
	const wrapperDir = getPluginDir(app, id);
	fsh.removeIfExists(wrapperDir);
	await app.plugins.loadManifests();
}

/** Obsidian only picks up a brand-new plugins/<id> folder after a manifest rescan. */
export async function refreshManifests(app: App): Promise<void> {
	await app.plugins.loadManifests();
}
