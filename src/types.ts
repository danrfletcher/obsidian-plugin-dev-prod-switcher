export type PluginMode = "dev" | "prod";

export type DevServerStatus = "stopped" | "running" | "crashed";

export interface RegisteredPlugin {
	/** The real, published plugin id (folder name under .obsidian/plugins/). */
	id: string;
	/** Display name, copied from the prod manifest at link time. */
	name: string;
	/** Absolute path to the user's local dev build folder (anywhere on disk). */
	devFolderPath: string;
	/** Shell command run in devFolderPath to start the dev build, e.g. "npm run dev". */
	devServerCommand: string;
	/** Last mode this plugin was switched to. Dev server status is NOT persisted (§5.3 AC4). */
	lastKnownMode: PluginMode;
}

export interface DevProdSwitcherSettings {
	registered: RegisteredPlugin[];
}

export const DEFAULT_SETTINGS: DevProdSwitcherSettings = {
	registered: [],
};

/** In-memory only — never persisted, never reconnected across restarts (§5.3 AC4). */
export interface DevServerRuntimeState {
	status: DevServerStatus;
	log: string[];
	pid?: number;
}

export interface GitBranchInfo {
	local: string[];
	remote: string[];
	current: string | null;
	isRepo: boolean;
	isDirty: boolean;
}
