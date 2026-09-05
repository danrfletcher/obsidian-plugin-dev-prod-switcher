import { ChildProcess, execFile, spawn } from "child_process";
import { EventEmitter } from "events";
import { DevServerRuntimeState, DevServerStatus } from "./types";
import { MAX_LOG_LINES } from "./constants";
import { isWindows } from "./util/platform";

/**
 * Owns every registered plugin's dev-server child process, in memory only.
 * Nothing here is persisted — on a fresh Obsidian session every plugin starts
 * "stopped" (§5.3 AC4), and one plugin's process/log state never touches
 * another's (each keyed independently by realId).
 */
export class DevServerManager extends EventEmitter {
	private processes = new Map<string, ChildProcess>();
	private state = new Map<string, DevServerRuntimeState>();
	/** Set right before we kill intentionally, so the exit handler reports "stopped" not "crashed". */
	private killingIntentionally = new Set<string>();

	getState(realId: string): DevServerRuntimeState {
		return (
			this.state.get(realId) ?? { status: "stopped" as DevServerStatus, log: [] }
		);
	}

	isRunning(realId: string): boolean {
		return this.getState(realId).status === "running";
	}

	start(realId: string, cwd: string, command: string): void {
		if (this.isRunning(realId)) return;

		const child = spawn(command, {
			cwd,
			shell: true,
			detached: !isWindows(),
			env: process.env,
		});
		this.processes.set(realId, child);
		this.setState(realId, { status: "running", log: [], pid: child.pid });

		const appendLog = (chunk: Buffer, stream: "out" | "err") => {
			const lines = chunk
				.toString("utf8")
				.split(/\r?\n/)
				.filter((l) => l.length > 0)
				.map((l) => (stream === "err" ? `[err] ${l}` : l));
			const current = this.getState(realId);
			const log = [...current.log, ...lines].slice(-MAX_LOG_LINES);
			this.setState(realId, { ...current, log });
		};

		child.stdout?.on("data", (c) => appendLog(c, "out"));
		child.stderr?.on("data", (c) => appendLog(c, "err"));

		child.on("exit", (code) => {
			this.processes.delete(realId);
			const wasIntentional = this.killingIntentionally.delete(realId);
			const current = this.getState(realId);
			this.setState(realId, {
				...current,
				status: wasIntentional || code === 0 ? "stopped" : "crashed",
				pid: undefined,
			});
		});

		child.on("error", (err) => {
			this.processes.delete(realId);
			const current = this.getState(realId);
			this.setState(realId, {
				...current,
				status: "crashed",
				log: [...current.log, `[error] ${String(err)}`],
				pid: undefined,
			});
		});
	}

	/**
	 * Reliable process-tree kill (§5.3 AC3): Windows has no SIGTERM concept
	 * that propagates to child processes spawned via a shell, so `taskkill
	 * /t /f` (same pattern Local Runner uses) is required there. On
	 * macOS/Linux the child was spawned detached, so its pid is also its
	 * process-group id — signal the negative pid to reach the whole tree,
	 * SIGTERM first, SIGKILL if it hasn't exited shortly after.
	 */
	async kill(realId: string): Promise<void> {
		const child = this.processes.get(realId);
		if (!child || child.pid === undefined) return;
		this.killingIntentionally.add(realId);

		// Send the platform-appropriate kill signal, but always resolve on the
		// child's own "exit" event (registered after start()'s own exit handler,
		// so status/log state is already updated by the time callers see this
		// resolve) rather than on the kill command's own callback — resolving
		// on taskkill's callback alone raced ahead of the actual process exit
		// on Windows, letting a follow-up start() see stale "running" state.
		if (isWindows()) {
			execFile("taskkill", ["/pid", String(child.pid), "/t", "/f"], () => {
				// Errors ignored here — the exit-event wait below is authoritative,
				// and the process may already have exited before this ran.
			});
		} else {
			try {
				process.kill(-child.pid, "SIGTERM");
			} catch {
				// Group may already be gone.
			}
		}

		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				if (!isWindows()) {
					try {
						if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
					} catch {
						// Already dead.
					}
				}
				resolve();
			}, 2000);
			child.once("exit", () => {
				clearTimeout(timer);
				resolve();
			});
		});
	}

	async restart(realId: string, cwd: string, command: string): Promise<void> {
		await this.kill(realId);
		this.start(realId, cwd, command);
	}

	/** Called once on plugin unload — kills every still-running dev server. */
	async killAll(): Promise<void> {
		await Promise.all([...this.processes.keys()].map((id) => this.kill(id)));
	}

	private setState(realId: string, state: DevServerRuntimeState): void {
		this.state.set(realId, state);
		this.emit("change", realId);
	}
}
