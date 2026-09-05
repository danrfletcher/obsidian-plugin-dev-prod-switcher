import { Plugin } from "obsidian";
import { DevProdSwitcherSettings, DEFAULT_SETTINGS } from "./types";
import { DevProdSettingTab } from "./settingsTab";
import { DevServerManager } from "./devServerManager";
import { DevFileWatcher } from "./devFileWatcher";
import { isDesktop } from "./util/platform";
import { syncDevWrapper } from "./pluginLinking";

export default class DevProdSwitcherPlugin extends Plugin {
	settings: DevProdSwitcherSettings = { ...DEFAULT_SETTINGS, registered: [] };
	devServerManager = new DevServerManager();
	devFileWatcher = new DevFileWatcher();

	async onload(): Promise<void> {
		await this.loadSettings();
		// §5.4 AC1 / T6 AC1: the whole feature set is desktop-only. Still
		// register a settings tab on mobile so users get a clear explanation
		// there instead of a missing plugin with no feedback.
		this.addSettingTab(new DevProdSettingTab(this.app, this));

		if (!isDesktop()) return;

		// Re-sync every registered plugin's wrapper folder and start watching
		// its dev folder for changes, so hot-reload keeps working across an
		// Obsidian restart without the user having to re-click anything.
		for (const reg of this.settings.registered) {
			try {
				syncDevWrapper(this.app, reg.id, reg.name, reg.devFolderPath);
			} catch {
				// Dev folder may have moved/been deleted since last session —
				// the settings tab surfaces this per-row, nothing to do here.
			}
			this.devFileWatcher.watch(this.app, reg.id, reg.name, reg.devFolderPath);
		}
	}

	async onunload(): Promise<void> {
		await this.devServerManager.killAll();
		this.devFileWatcher.unwatchAll();
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as
			| DevProdSwitcherSettings
			| null;
		// Spread DEFAULT_SETTINGS.registered into a new array rather than
		// aliasing it directly — otherwise a fresh install (or any load that
		// falls back to the default) would share and mutate the one
		// module-level default array on every future link/unlink.
		this.settings = {
			...DEFAULT_SETTINGS,
			registered: [],
			...loaded,
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
