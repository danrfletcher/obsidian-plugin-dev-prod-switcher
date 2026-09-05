import { App } from "obsidian";
import { HOT_RELOAD_PLUGIN_ID } from "./constants";
import { isPluginActive } from "./toggle";

export interface HotReloadState {
	installed: boolean;
	enabled: boolean;
}

/**
 * Re-checked every time it's called (settings-tab open, plugin load) rather
 * than cached, because the user can disable Hot Reload from Obsidian's own
 * plugin list at any time (spec §5.2 AC3 / T1 AC3).
 */
export function getHotReloadState(app: App): HotReloadState {
	const installed = Boolean(app.plugins.manifests[HOT_RELOAD_PLUGIN_ID]);
	const enabled = isPluginActive(app, HOT_RELOAD_PLUGIN_ID);
	return { installed, enabled: installed && enabled };
}
