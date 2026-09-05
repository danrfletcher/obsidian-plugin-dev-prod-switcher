import { App, Modal, Setting, Notice } from "obsidian";
import { DEFAULT_DEV_SERVER_COMMAND } from "../constants";

/**
 * Folder path entry for "Link local dev build" (§5.1 AC2). Tries Electron's
 * native folder-picker dialog first — Obsidian's desktop renderer exposes
 * `@electron/remote` to plugins for exactly this kind of legacy-compatible
 * call — and falls back to a plain text field if that throws (older/newer
 * Electron builds without it). Verified empirically in-container; either
 * path leaves the user able to complete linking.
 */
function tryOpenFolderDialog(): string | null {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const electron = (window as any).require?.("electron");
		const remote = electron?.remote;
		if (!remote?.dialog?.showOpenDialogSync) return null;
		const result = remote.dialog.showOpenDialogSync({
			properties: ["openDirectory"],
		});
		return result && result[0] ? result[0] : null;
	} catch {
		return null;
	}
}

export class LinkDevFolderModal extends Modal {
	private folderPath = "";
	private command = DEFAULT_DEV_SERVER_COMMAND;

	constructor(
		app: App,
		private pluginName: string,
		private onSubmit: (folderPath: string, command: string) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: `Link local dev build: ${this.pluginName}` });
		contentEl.createEl("p", {
			text: "Point this at the folder where your dev build outputs main.js (usually your plugin's repo root).",
			cls: "dpps-muted",
		});

		let pathTextEl: HTMLInputElement;
		new Setting(contentEl)
			.setName("Dev folder path")
			.addText((text) => {
				pathTextEl = text.inputEl;
				text.setPlaceholder("/path/to/your-plugin-repo").onChange(
					(v) => (this.folderPath = v)
				);
			})
			.addButton((btn) =>
				btn.setButtonText("Browse…").onClick(() => {
					const chosen = tryOpenFolderDialog();
					if (chosen) {
						this.folderPath = chosen;
						pathTextEl.value = chosen;
					} else {
						new Notice(
							"Native folder picker isn't available here — type or paste the path instead."
						);
					}
				})
			);

		new Setting(contentEl)
			.setName("Dev server command")
			.setDesc("Run in the dev folder when you click \"Run Dev Server\".")
			.addText((text) =>
				text
					.setValue(this.command)
					.onChange((v) => (this.command = v || DEFAULT_DEV_SERVER_COMMAND))
			);

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Link")
				.setCta()
				.onClick(() => {
					if (!this.folderPath.trim()) {
						new Notice("Enter a dev folder path first.");
						return;
					}
					this.onSubmit(this.folderPath.trim(), this.command.trim());
					this.close();
				})
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
