import { Platform } from "obsidian";

/** True only for desktop app builds — every §5.3/T5 feature gates on this. */
export function isDesktop(): boolean {
	return Platform.isDesktopApp;
}

export function isWindows(): boolean {
	return process.platform === "win32";
}
