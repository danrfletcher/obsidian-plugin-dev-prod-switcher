import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type DevProdSwitcherPlugin from "./main";
import { getHotReloadState } from "./hotReloadGate";
import { HOT_RELOAD_REPO_URL, HOT_RELOAD_COMMUNITY_URL } from "./constants";
import { RegisteredPlugin } from "./types";
import { LinkDevFolderModal } from "./ui/linkModal";
import { ConfirmModal } from "./ui/confirmModal";
import {
	devId,
	isDevFolderBuilt,
	refreshManifests,
	removeDevWrapper,
	syncDevWrapper,
} from "./pluginLinking";
import { applyMode, currentMode } from "./toggle";
import { isLikelyBratInstalled } from "./bratDetect";
import {
	checkoutBranch,
	fetchRemote,
	getBranchInfo,
	getStashInfo,
	isGitRepo,
	popStashAndReturn,
	pullCurrentBranch,
	stashChanges,
} from "./gitBranches";
import { isDesktop } from "./util/platform";

export class DevProdSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: DevProdSwitcherPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h1", { text: "Dev/Prod Plugin Switcher" });

		if (!isDesktop()) {
			containerEl.createEl("p", {
				text:
					"This plugin's features (dev/prod toggle, dev server control, git branches) all require child_process and native filesystem access, so they're desktop-only. Nothing to configure here on mobile.",
			});
			return;
		}

		const hotReload = getHotReloadState(this.app);
		if (!hotReload.enabled) {
			this.renderHotReloadBanner(containerEl, hotReload.installed);
		}

		this.renderLinkSection(containerEl, hotReload.enabled);
		this.renderManagedSection(containerEl, hotReload.enabled);
	}

	private renderHotReloadBanner(container: HTMLElement, installed: boolean): void {
		const banner = container.createDiv({ cls: "dpps-banner dpps-banner-error" });
		banner.createEl("strong", {
			text: installed
				? "Hot Reload is installed but disabled."
				: "Hot Reload is not installed.",
		});
		banner.createEl("p", {
			text:
				"The Dev/Prod toggle depends entirely on pjeby's Hot Reload plugin (MIT licensed) to actually reload a plugin when its dev build changes. Until it's installed and enabled, the toggle and dev-server controls stay hidden here so you can't register a plugin for dev mode that nothing will ever reload.",
		});
		const links = banner.createDiv();
		links.createEl("a", { text: "Hot Reload on GitHub", href: HOT_RELOAD_REPO_URL });
		links.createSpan({ text: "  ·  " });
		links.createEl("a", {
			text: "Open in Obsidian (if installed via BRAT already)",
			href: HOT_RELOAD_COMMUNITY_URL,
		});
	}

	private renderLinkSection(container: HTMLElement, hotReloadOk: boolean): void {
		container.createEl("h2", { text: "Link a plugin" });
		const registeredIds = new Set(this.plugin.settings.registered.map((r) => r.id));
		const ownId = this.plugin.manifest.id;
		const eligible = Object.values(this.app.plugins.manifests)
			.filter((m) => m.id !== ownId)
			.filter((m) => !registeredIds.has(m.id))
			.filter((m) => !this.plugin.settings.registered.some((r) => devId(r.id) === m.id))
			.sort((a, b) => a.name.localeCompare(b.name));

		if (eligible.length === 0) {
			container.createEl("p", {
				text: "Every installed plugin is already linked.",
				cls: "dpps-muted",
			});
			return;
		}

		let selectedId = eligible[0].id;
		new Setting(container)
			.setName("Link local dev build")
			.setDesc("Pick an installed plugin, then point it at your local dev build folder.")
			.addDropdown((dd) => {
				for (const m of eligible) dd.addOption(m.id, m.name);
				dd.onChange((v) => (selectedId = v));
			})
			.addButton((btn) =>
				btn
					.setButtonText("Link…")
					.setCta()
					.onClick(() => {
						const manifest = this.app.plugins.manifests[selectedId];
						new LinkDevFolderModal(this.app, manifest.name, async (folderPath, command) => {
							const reg: RegisteredPlugin = {
								id: manifest.id,
								name: manifest.name,
								devFolderPath: folderPath,
								devServerCommand: command,
								lastKnownMode: "prod",
							};
							syncDevWrapper(this.app, reg.id, reg.name, reg.devFolderPath);
							await refreshManifests(this.app);
							this.plugin.settings.registered.push(reg);
							await this.plugin.saveSettings();
							this.plugin.devFileWatcher.watch(
								this.app,
								reg.id,
								reg.name,
								reg.devFolderPath
							);
							new Notice(`Linked ${reg.name}. Hot Reload will pick up its dev build on the next change.`);
							this.display();
						}).open();
					})
			);
	}

	private renderManagedSection(container: HTMLElement, hotReloadOk: boolean): void {
		container.createEl("h2", { text: "Managed plugins" });
		const { registered } = this.plugin.settings;
		if (registered.length === 0) {
			container.createEl("p", { text: "No plugins linked yet.", cls: "dpps-muted" });
			return;
		}
		for (const reg of registered) {
			this.renderManagedRow(container, reg, hotReloadOk);
		}
	}

	private renderManagedRow(
		container: HTMLElement,
		reg: RegisteredPlugin,
		hotReloadOk: boolean
	): void {
		const row = container.createDiv({ cls: "dpps-plugin-row" });
		const header = row.createDiv({ cls: "dpps-plugin-row-header" });
		const title = header.createDiv({ cls: "dpps-plugin-row-title" });
		title.createSpan({ text: reg.name });

		const mode = currentMode(this.app, reg.id);
		title.createSpan({
			text: mode === "dev" ? "Dev" : "Prod",
			cls: `dpps-badge ${mode === "dev" ? "dpps-badge-dev" : "dpps-badge-prod"}`,
		});
		if (isLikelyBratInstalled(this.app, reg.id)) {
			title.createSpan({ text: "BRAT", cls: "dpps-badge" });
		}

		const headerButtons = header.createDiv();
		const unlinkBtn = headerButtons.createEl("button", { text: "Unlink" });
		unlinkBtn.onclick = async () => {
			if (this.plugin.devServerManager.isRunning(reg.id)) {
				await this.plugin.devServerManager.kill(reg.id);
			}
			this.plugin.devFileWatcher.unwatch(reg.id);
			await removeDevWrapper(this.app, reg.id);
			this.plugin.settings.registered = this.plugin.settings.registered.filter(
				(r) => r.id !== reg.id
			);
			await this.plugin.saveSettings();
			new Notice(`Unlinked ${reg.name}.`);
			this.display();
		};

		row.createEl("div", { text: reg.devFolderPath, cls: "dpps-muted" });

		if (!isDevFolderBuilt(reg.devFolderPath)) {
			row.createEl("div", {
				text: "No build output found in this folder yet (no main.js) — run the dev server first.",
				cls: "dpps-muted",
			});
		}

		this.renderToggleControls(row, reg, mode, hotReloadOk);
		this.renderDevServerControls(row, reg);
		this.renderGitControls(row, reg);
	}

	private renderToggleControls(
		row: HTMLElement,
		reg: RegisteredPlugin,
		mode: "dev" | "prod",
		hotReloadOk: boolean
	): void {
		if (!hotReloadOk) {
			row.createEl("p", {
				text: "Dev/Prod toggle hidden until Hot Reload is installed and enabled (see banner above).",
				cls: "dpps-muted",
			});
			return;
		}
		const controls = row.createDiv({ cls: "dpps-controls-row" });
		const targetMode = mode === "dev" ? "prod" : "dev";
		const btn = controls.createEl("button", {
			text: `Switch to ${targetMode === "dev" ? "Dev" : "Prod"}`,
		});
		btn.onclick = async () => {
			const doSwitch = async () => {
				try {
					await applyMode(this.app, reg.id, reg.name, targetMode);
				} catch (e) {
					// applyMode enables the target before disabling the other id, so
					// a failure here (e.g. broken/empty dev build) leaves whichever
					// mode was previously active untouched rather than disabling both.
					new Notice(`Couldn't switch ${reg.name} to ${targetMode === "dev" ? "Dev" : "Prod"}: ${(e as Error).message}`);
					return;
				}
				reg.lastKnownMode = targetMode;
				if (targetMode === "prod" && this.plugin.devServerManager.isRunning(reg.id)) {
					// T3 AC4: stop the dev server on switching to Prod. Otherwise, if
					// the dev folder has a live .git dir, Hot Reload's own watcher
					// can silently flip the dev copy back on underneath this toggle
					// the next time the build writes to disk (spec §7 flagged risk).
					await this.plugin.devServerManager.kill(reg.id);
					new Notice(`Stopped ${reg.name}'s dev server so Hot Reload can't re-enable it.`);
				}
				await this.plugin.saveSettings();
				// enablePluginAndSave()/disablePluginAndSave() can resolve slightly
				// before app.plugins.isEnabled() reflects the new state (observed
				// live in a test container 2026-09-05) — poll briefly rather than
				// re-render on a stale read that would flip back a tick later.
				for (
					let i = 0;
					i < 10 && currentMode(this.app, reg.id) !== targetMode;
					i++
				) {
					await new Promise((resolve) => setTimeout(resolve, 50));
				}
				this.display();
			};
			if (targetMode === "dev" && !this.plugin.devServerManager.isRunning(reg.id)) {
				new ConfirmModal(
					this.app,
					`${reg.name}'s dev server isn't running — the dev build may be stale or empty. Switch to Dev anyway?`,
					doSwitch
				).open();
			} else {
				await doSwitch();
			}
		};
	}

	private renderDevServerControls(row: HTMLElement, reg: RegisteredPlugin): void {
		const state = this.plugin.devServerManager.getState(reg.id);
		const controls = row.createDiv({ cls: "dpps-controls-row" });
		controls.createSpan({ cls: `dpps-status-dot dpps-status-${state.status}` });
		controls.createSpan({ text: state.status, cls: "dpps-muted" });

		if (state.status === "running") {
			const killBtn = controls.createEl("button", { text: "Kill" });
			killBtn.onclick = async () => {
				await this.plugin.devServerManager.kill(reg.id);
				this.display();
			};
			const restartBtn = controls.createEl("button", { text: "Restart" });
			restartBtn.onclick = async () => {
				await this.plugin.devServerManager.restart(
					reg.id,
					reg.devFolderPath,
					reg.devServerCommand
				);
				this.display();
			};
		} else {
			const runBtn = controls.createEl("button", { text: "Run Dev Server" });
			runBtn.onclick = () => {
				this.plugin.devServerManager.start(
					reg.id,
					reg.devFolderPath,
					reg.devServerCommand
				);
				this.display();
			};
		}

		if (state.log.length > 0) {
			const details = row.createEl("details");
			details.createEl("summary", { text: `Logs (${state.log.length} lines)` });
			details.createEl("pre", { text: state.log.join("\n"), cls: "dpps-log-panel" });
		}
	}

	private renderGitControls(row: HTMLElement, reg: RegisteredPlugin): void {
		if (!isGitRepo(reg.devFolderPath)) return;
		const section = row.createDiv();
		section.createEl("div", { text: "Loading branches…", cls: "dpps-muted" });

		Promise.all([
			getBranchInfo(reg.devFolderPath),
			getStashInfo(reg.devFolderPath),
		]).then(([info, stash]) => {
			section.empty();
			if (info.isDirty) {
				const dirtyRow = section.createDiv({ cls: "dpps-controls-row" });
				dirtyRow.createSpan({
					text: "Working tree has uncommitted changes — branch switching is disabled until it's clean.",
					cls: "dpps-muted",
				});
				const stashBtn = dirtyRow.createEl("button", { text: "Stash" });
				stashBtn.onclick = async () => {
					try {
						await stashChanges(reg.devFolderPath, info.current ?? "HEAD");
						new Notice(`Stashed changes for ${reg.name}.`);
					} catch (e) {
						new Notice(`Stash failed: ${(e as Error).message}`);
					}
					this.display();
				};
			}
			if (stash.hasPluginStash && stash.stashBranch) {
				const stashRow = section.createDiv({ cls: "dpps-controls-row" });
				const sameBranch = stash.stashBranch === info.current;
				const popBtn = stashRow.createEl("button", {
					text: sameBranch ? "Pop stash" : `Return to ${stash.stashBranch} and pop`,
				});
				popBtn.onclick = async () => {
					try {
						await popStashAndReturn(reg.devFolderPath, stash.stashBranch as string);
						new Notice(`Restored stashed changes for ${reg.name} on ${stash.stashBranch}.`);
					} catch (e) {
						new Notice(`Pop failed: ${(e as Error).message}`);
					}
					this.display();
				};
			}
			const controls = section.createDiv({ cls: "dpps-controls-row" });
			const select = controls.createEl("select");
			const localGroup = select.createEl("optgroup", { attr: { label: "Local" } });
			for (const b of info.local) {
				const opt = localGroup.createEl("option", { text: b, value: `local:${b}` });
				if (b === info.current) opt.selected = true;
			}
			if (info.remote.length > 0) {
				const remoteGroup = select.createEl("optgroup", { attr: { label: "Remote" } });
				for (const b of info.remote) {
					remoteGroup.createEl("option", { text: b, value: `remote:${b}` });
				}
			}
			select.disabled = info.isDirty;
			select.onchange = async () => {
				const [kind, ...rest] = select.value.split(":");
				const branch = rest.join(":");
				try {
					await checkoutBranch(reg.devFolderPath, branch, kind === "remote");
					new Notice(`Checked out ${branch} for ${reg.name}.`);
				} catch (e) {
					new Notice(`Checkout failed: ${(e as Error).message}`);
				}
				this.display();
			};

			const pullBtn = controls.createEl("button", { text: "Pull" });
			pullBtn.disabled = info.isDirty || !info.current;
			pullBtn.onclick = async () => {
				try {
					await pullCurrentBranch(reg.devFolderPath);
					new Notice(`Pulled latest for ${reg.name}.`);
				} catch (e) {
					new Notice(`Pull failed: ${(e as Error).message}`);
				}
				this.display();
			};

			const refreshBtn = controls.createEl("button", { text: "Refresh" });
			refreshBtn.onclick = async () => {
				try {
					await fetchRemote(reg.devFolderPath);
				} catch (e) {
					new Notice(`Fetch failed: ${(e as Error).message}`);
				}
				this.display();
			};
		});
	}
}
