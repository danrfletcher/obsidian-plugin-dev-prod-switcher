// Obsidian's plugin manager (`app.plugins`) is not part of the documented
// public API, but it is the only way to enumerate/enable/disable plugins and
// every dev-tooling plugin in this space (BRAT, Hot Reload Picker, Hot Reload
// itself) relies on it the same way. Kept in one file so if the shape ever
// drifts between Obsidian versions, there's exactly one place to fix it —
// see README "Compatibility notes".
import "obsidian";

declare module "obsidian" {
	interface CommunityPluginManager {
		manifests: Record<string, PluginManifest>;
		/**
		 * Populated from community-plugins.json at startup. NOT kept in sync by
		 * enablePlugin()/disablePlugin() at runtime (verified live 2026-09-05 in
		 * a test container) — use isEnabled()/enablePluginAndSave()/
		 * disablePluginAndSave() instead of reading/writing this directly.
		 */
		enabledPlugins: Set<string>;
		plugins: Record<string, unknown>;
		enablePlugin(id: string): Promise<void>;
		disablePlugin(id: string): Promise<void>;
		/** Enables AND persists to community-plugins.json — use this, not enablePlugin(), for anything that must survive a restart. */
		enablePluginAndSave(id: string): Promise<void>;
		disablePluginAndSave(id: string): Promise<void>;
		isEnabled(id: string): boolean;
		loadManifests(): Promise<void>;
	}

	interface App {
		plugins: CommunityPluginManager;
	}
}
