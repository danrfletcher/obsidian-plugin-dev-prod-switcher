import { execFile } from "child_process";
import * as fsh from "./util/fsHelpers";
import * as path from "path";
import { GitBranchInfo, StashInfo } from "./types";

/**
 * Tag put in the stash message so we only ever offer to pop a stash *this
 * plugin* created — never a stash the user made themselves outside it. Also
 * records which branch it was stashed from, since `git stash pop` always
 * pops stash@{0} in place on whatever branch you're currently on, and the
 * whole point of "Return to <branch> and pop" is to check that branch back
 * out first.
 */
const STASH_TAG = "dpps-stash";

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

/**
 * T5 AC7: is the top of the stash stack (stash@{0}) one this plugin created,
 * and if so which branch was it stashed from? Only ever looks at stash@{0}
 * — if the user has since pushed their own stash on top, we don't surface a
 * pop option at all rather than risk popping the wrong one.
 */
export async function getStashInfo(folder: string): Promise<StashInfo> {
	if (!isGitRepo(folder)) return { hasPluginStash: false, stashBranch: null };
	const list = await runGit(folder, ["stash", "list", "--format=%s"]).catch(
		() => ""
	);
	const top = list.split("\n")[0] ?? "";
	// `git stash push -m "<msg>"` stores the subject as "On <branch>: <msg>",
	// so match our tag anywhere in the string rather than anchoring at the
	// start (confirmed live 2026-09-05 — anchoring at "^" never matched).
	const match = top.match(new RegExp(`${STASH_TAG}:(.+):\\d+$`));
	if (!match) return { hasPluginStash: false, stashBranch: null };
	return { hasPluginStash: true, stashBranch: match[1] };
}

/** T5 AC7: stash everything (including untracked files) so the tree is
 * actually clean afterward — an untracked file left behind would still
 * trip the dirty check and defeat the point of stashing to unblock a
 * branch switch. */
export async function stashChanges(folder: string, branch: string): Promise<void> {
	await runGit(folder, [
		"stash",
		"push",
		"--include-untracked",
		"-m",
		`${STASH_TAG}:${branch}:${Date.now()}`,
	]);
}

/** T5 AC7: check the stashed-from branch back out, then pop. If the pop
 * conflicts, git leaves the stash entry in place (its own default
 * behaviour) and the error surfaces to the caller as-is. */
export async function popStashAndReturn(
	folder: string,
	branch: string
): Promise<void> {
	await runGit(folder, ["checkout", branch]);
	await runGit(folder, ["stash", "pop"]);
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
