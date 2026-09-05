import { App, Notice } from "obsidian";
import { PluginMode } from "./types";
import { devId } from "./pluginLinking";

/**
 * Whether a plugin id currently has a live, running instance. This is the
 * only reliable live-state check (verified in a test container 2026-09-05):
 * `app.plugins.enabledPlugins` is only populated from community-plugins.json
 * at boot and isn't kept in sync by runtime enable/disable calls, and
 * `app.plugins.isEnabled()` was observed returning stale results seconds
 * after a switch. `app.plugins.plugins[id]` truthiness matched the real
 * Community Plugins toggle state in every case tested.
 */
export function isPluginActive(app: App, id: string): boolean {
	return Boolean((app.plugins.plugins as Record<string, unknown>)[id]);
}

/**
 * The whole Approach B flip (§4): enable the target id, *then* disable
 * whichever id was live before. Never touches files — just Obsidian's own
 * enable/disable (T3 AC2). Uses the *AndSave variants — plain
 * enablePlugin()/disablePlugin() mutate the live plugin instance but do NOT
 * persist to community-plugins.json, so a plain toggle would silently
 * revert to whichever mode was last saved the next time Obsidian restarts.
 *
 * Enable-before-disable is deliberate: if the target build is broken (e.g.
 * an empty/invalid main.js) and enabling it throws, the previously-active
 * id is left untouched instead of the plugin ending up disabled in both
 * modes.
 */
export async function applyMode(
	app: App,
	realId: string,
	realName: string,
	targetMode: PluginMode
): Promise<void> {
	const devPluginId = devId(realId);
	const enableId = targetMode === "dev" ? devPluginId : realId;
	const disableId = targetMode === "dev" ? realId : devPluginId;

	if (!isPluginActive(app, enableId)) {
		await app.plugins.enablePluginAndSave(enableId);
	}
	if (isPluginActive(app, disableId)) {
		await app.plugins.disablePluginAndSave(disableId);
	}

	new Notice(
		`Switched ${realName} to ${targetMode === "dev" ? "Dev" : "Prod"}`
	);
}

export function currentMode(app: App, realId: string): PluginMode {
	return isPluginActive(app, devId(realId)) ? "dev" : "prod";
}
