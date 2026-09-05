import * as fs from "fs";
import { App } from "obsidian";
import { syncDevWrapper } from "./pluginLinking";

const DEBOUNCE_MS = 150;

/**
 * Watches each linked dev folder and re-copies its build output into the
 * matching `<id>-dev` wrapper folder whenever it changes, so Hot Reload
 * (which watches the wrapper, not the dev folder) has something to react
 * to (see pluginLinking.ts's syncDevWrapper doc for why this is a copy, not
 * a symlink). This is pure file propagation, not a reimplementation of Hot
 * Reload's own debounce/reload behaviour — it does nothing but keep the
 * wrapper folder's files in sync with the source, whether the source is
 * being rebuilt by our own "Run Dev Server" or a terminal the user started
 * outside Obsidian.
 */
export class DevFileWatcher {
	private watchers = new Map<string, fs.FSWatcher>();
	private timers = new Map<string, number>();

	watch(
		app: App,
		realId: string,
		realName: string,
		devFolderPath: string
	): void {
		this.unwatch(realId);
		try {
			const watcher = fs.watch(devFolderPath, () => {
				const existing = this.timers.get(realId);
				if (existing) window.clearTimeout(existing);
				this.timers.set(
					realId,
					window.setTimeout(() => {
						this.timers.delete(realId);
						try {
							syncDevWrapper(app, realId, realName, devFolderPath);
						} catch {
							// Dev folder may be mid-rebuild (file briefly missing) —
							// the next change event will retry.
						}
					}, DEBOUNCE_MS)
				);
			});
			this.watchers.set(realId, watcher);
		} catch {
			// Dev folder may not exist yet (unbuilt/relocated) — nothing to watch
			// until the user relinks it; the settings tab already surfaces
			// "no build output found" separately.
		}
	}

	unwatch(realId: string): void {
		this.watchers.get(realId)?.close();
		this.watchers.delete(realId);
		const timer = this.timers.get(realId);
		if (timer) window.clearTimeout(timer);
		this.timers.delete(realId);
	}

	unwatchAll(): void {
		for (const id of [...this.watchers.keys()]) this.unwatch(id);
	}
}
