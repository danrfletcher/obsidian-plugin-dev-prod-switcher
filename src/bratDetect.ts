import { App } from "obsidian";
import * as path from "path";
import { getPluginDir } from "./util/fsHelpers";
import * as fsh from "./util/fsHelpers";

interface BratData {
	pluginList?: string[];
}

/**
 * Best-effort only (§5.1 AC5): BRAT has no public API for "is this plugin
 * BRAT-managed" and stores its list keyed by GitHub repo path
 * (`owner/repo`), not plugin id, in its own data.json — undocumented, read
 * directly per the spec's instruction rather than guessed at. Matches on the
 * repo path's last segment against the plugin id as a heuristic. Any failure
 * (BRAT not installed, unexpected shape) yields "unknown", never throws —
 * this must never block the core registry feature.
 */
export function isLikelyBratInstalled(app: App, pluginId: string): boolean {
	try {
		const bratDataPath = path.join(
			getPluginDir(app, "obsidian42-brat"),
			"data.json"
		);
		const data = fsh.readJson<BratData>(bratDataPath);
		if (!data?.pluginList) return false;
		return data.pluginList.some((repo) => repo.split("/").pop() === pluginId);
	} catch {
		return false;
	}
}
