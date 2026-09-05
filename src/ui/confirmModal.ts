import { App, Modal, Setting } from "obsidian";

/** Used only for the one confirmation case in the spec (T3 AC3): switching to
 * Dev while that plugin's dev server isn't running, so the user doesn't land
 * on a stale/empty build by accident. Every other flip is confirmation-free. */
export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private message: string,
		private onConfirm: () => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("p", { text: this.message });
		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((btn) =>
				btn
					.setButtonText("Switch anyway")
					.setCta()
					.onClick(() => {
						this.close();
						this.onConfirm();
					})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
