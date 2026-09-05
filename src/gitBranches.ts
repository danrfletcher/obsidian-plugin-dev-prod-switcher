import { execFile } from "child_process";
import * as fsh from "./util/fsHelpers";
import * as path from "path";
import { GitBranchInfo } from "./types";

function runGit(cwd: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
			"git",
			args,
			{ cwd, maxBuffer: 10 * 1024 * 1024 },
			(err, stdout, stderr) => {
				if (err) {
					reject(new Error(stderr?.trim() || err.message));
					return;
				}
				resolve(stdout.trim());
			}
		);
	});
}

export function isGitRepo(folder: string): boolean {
	return fsh.exists(path.join(folder, ".git"));
}

/** T5 AC1/AC4/AC5: current branch, local + remote branch lists, dirty-tree flag. */
export async function getBranchInfo(folder: string): Promise<GitBranchInfo> {
	if (!isGitRepo(folder)) {
		return { local: [], remote: [], current: null, isRepo: false, isDirty: false };
	}
	const [localRaw, remoteRaw, current, statusRaw] = await Promise.all([
		runGit(folder, ["branch", "--format=%(refname:short)"]),
		runGit(folder, ["branch", "-r", "--format=%(refname:short)"]),
		runGit(folder, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => ""),
		runGit(folder, ["status", "--porcelain"]).catch(() => ""),
	]);
	const local = localRaw ? localRaw.split("\n").filter(Boolean) : [];
	const remote = remoteRaw
		? remoteRaw
				.split("\n")
				.filter(Boolean)
				.filter((r) => !r.endsWith("/HEAD"))
		: [];
	return {
		local,
		remote,
		current: current || null,
		isRepo: true,
		isDirty: statusRaw.length > 0,
	};
}

/** T5 AC4: re-list without switching anything — remote branches can change independently. */
export async function fetchRemote(folder: string): Promise<void> {
	await runGit(folder, ["fetch", "--all", "--prune"]);
}

/** T5 AC3: fetch + pull current branch, caller re-lists branches afterward. */
export async function pullCurrentBranch(folder: string): Promise<void> {
	await runGit(folder, ["pull"]);
}

/**
 * T5 AC2/AC5: switches to a local branch, or creates a tracking branch for a
 * remote-only one (`origin/foo` -> local `foo` tracking it). Blocks on a
 * dirty tree first so a switch never silently discards work.
 */
export async function checkoutBranch(
	folder: string,
	branch: string,
	isRemote: boolean
): Promise<void> {
	const info = await getBranchInfo(folder);
	if (info.isDirty) {
		throw new Error(
			"Working tree has uncommitted changes — commit, stash, or discard them before switching branches."
		);
	}
	if (!isRemote) {
		await runGit(folder, ["checkout", branch]);
		return;
	}
	const localName = branch.replace(/^[^/]+\//, "");
	if (info.local.includes(localName)) {
		await runGit(folder, ["checkout", localName]);
		return;
	}
	await runGit(folder, ["checkout", "-b", localName, "--track", branch]);
}
