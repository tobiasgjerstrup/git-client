type GitPorcelainV2Key = "1" | "2" | "u" | "?" | "!";

type GitStatusLine = {
	key: GitPorcelainV2Key;
	xy: string;
	path: string;
	origPath?: string;
	text: string;
};

type GitChangeSide = "staged" | "unstaged";

type GitChangeEntry = {
	key: string;
	path: string;
	label: string;
	side: GitChangeSide;
	diffFile?: GitDiffOutput["files"][0];
	buttonsHtml: string;
	statusClass: string;
};

export interface GitStatusOutput {
	files: string[];
	branchName: string;
}

export interface GitCommit {
	hash: string;
	author: string;
	message: string;
	date: string;
}

export interface GitDiffOutput {
	files: {
		path: string;
		diff: string;
		linesAdded: number;
		linesRemoved: number;
	}[];
}

export interface GitBranch {
	name: string;
	remote: boolean;
	commitId: string;
	commitsAhead: number;
	commitsBehind: number;
}

let commits: GitCommit[] = [];
let branches: GitBranch[] = [];
let currentBranchName: string = "";

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function parseGitStatusLine(line: string): GitStatusLine | null {
	if (line.startsWith("# ")) {
		return null;
	}

	if (line.startsWith("? ")) {
		const path = line.slice(2);
		return { key: "?", xy: "??", path, text: `?? ${path}` };
	}

	if (line.startsWith("! ")) {
		const path = line.slice(2);
		return { key: "!", xy: "!!", path, text: `!! ${path}` };
	}

	const ordinaryChangedMatch = line.match(/^1 (\S{2}) (?:\S+ ){6}(.+)$/);
	if (ordinaryChangedMatch) {
		const path = ordinaryChangedMatch[2];
		return { key: "1", xy: ordinaryChangedMatch[1], path, text: `${ordinaryChangedMatch[1]} ${path}` };
	}

	const renamedOrCopiedMatch = line.match(/^2 (\S{2}) (?:\S+ ){7}(.+)$/);
	if (renamedOrCopiedMatch) {
		const pathWithOrigin = renamedOrCopiedMatch[2];
		const [path, origPath] = pathWithOrigin.split("\t");
		const text = origPath
			? `${renamedOrCopiedMatch[1]} ${origPath} -> ${path}`
			: `${renamedOrCopiedMatch[1]} ${path}`;
		return { key: "2", xy: renamedOrCopiedMatch[1], path, origPath, text };
	}

	const unmergedMatch = line.match(/^u (\S{2}) (?:\S+ ){8}(.+)$/);
	if (unmergedMatch) {
		const path = unmergedMatch[2];
		return { key: "u", xy: unmergedMatch[1], path, text: `${unmergedMatch[1]} ${path}` };
	}

	// Backward compatibility with porcelain v1 ("XY path")
	if (line.length >= 3) {
		const xy = line.substring(0, 2);
		const path = line.substring(3);
		if (xy === "??") {
			return { key: "?", xy, path, text: line };
		}
		if (xy === "!!") {
			return { key: "!", xy, path, text: line };
		}
		return { key: "1", xy, path, text: line };
	}

	return null;
}

function isStagedFromXYStatus(xy: string): boolean {
	// In porcelain v2, "." means unchanged; in v1, " " means unchanged.
	return xy[0] !== "." && xy[0] !== " " && xy[0] !== "?" && xy[0] !== "!";
}

function hasUnstagedFromXYStatus(xy: string): boolean {
	return xy[1] !== "." && xy[1] !== " ";
}

function describeStatusCode(code: string, side: GitChangeSide): string {
	switch (code) {
		case "M":
			return side === "staged" ? "Modified in index" : "Modified in working tree";
		case "A":
			return side === "staged" ? "Added" : "Added in working tree";
		case "D":
			return side === "staged" ? "Deleted from index" : "Deleted in working tree";
		case "R":
			return side === "staged" ? "Renamed" : "Renamed in working tree";
		case "C":
			return side === "staged" ? "Copied" : "Copied in working tree";
		case "T":
			return side === "staged" ? "Type changed in index" : "Type changed in working tree";
		case "U":
			return "Unmerged";
		default:
			return side === "staged" ? "Staged change" : "Unstaged change";
	}
}

function buildStatusLabel(parsedLine: GitStatusLine, side: GitChangeSide, code: string): string {
	const prefix = describeStatusCode(code, side);
	if (parsedLine.origPath) {
		return `${prefix}: ${parsedLine.origPath} -> ${parsedLine.path}`;
	}
	return `${prefix}: ${parsedLine.path}`;
}

function buildActionPath(parsedLine: GitStatusLine): string {
	if (parsedLine.origPath) {
		return `${parsedLine.origPath}\t${parsedLine.path}`;
	}
	return parsedLine.path;
}

function renderDiffContent(diffFile?: GitDiffOutput["files"][0]): string {
	if (!diffFile) {
		return "";
	}

	return `<div class="diff-content" style="display:none"><pre class="changedLinesContainer">${diffFile.diff}</pre><p>Lines Added: ${diffFile.linesAdded}, Lines Removed: ${diffFile.linesRemoved}</p></div>`;
}

function renderChangeEntry(entry: GitChangeEntry): string {
	return `<div class="diff-file-entry">
		<div class="diff-file-header-row">
			${entry.buttonsHtml}
			<span class="diff-file-status ${entry.statusClass}">${escapeHtml(entry.label)}</span>
			<h3 class="diff-file-header" onclick="toggleDiff(this)">${escapeHtml(entry.path)}</h3>
		</div>
		${renderDiffContent(entry.diffFile)}
	</div>`;
}

export async function gitStatus() {
	const output = await window.go.main.App.RunGitStatus() as GitStatusOutput;
	currentBranchName = output.branchName;
	document.getElementById("BranchName")!.innerText = `Current Branch: ${currentBranchName}`;
}

export async function getGitCommits() {
	commits = await window.go.main.App.GetCommitHistory() as GitCommit[];
	let commitsHtml = "";
	for (const commit of commits) {
		commitsHtml += `<div class="commit">`
		commitsHtml += `<span>${commit.date.substring(0, 16)} <strong>${escapeHtml(commit.author)}</strong></span><br>`;
		commitsHtml += `<span>${escapeHtml(commit.message)}</span><br>`;
		commitsHtml += `<hr></div>`;
	}
	document.getElementById("GitCommits")!.innerHTML = commitsHtml;
}

export async function getGitBranches() {
	branches = await window.go.main.App.GetGitBranches() as GitBranch[];
	const branchesHtml = branches.map(branch => `<p>${branch.remote ? "☁️" : "🗃️"}${escapeHtml(branch.name)} ${branch.commitsAhead}/${branch.commitsBehind}</p>`)/*(Commit ID: ${escapeHtml(branch.commitId)})</p>`)*/.join("");
	document.getElementById("GitBranches")!.innerHTML = branchesHtml;

	// if local branch is ahead, highlight push button
	if (currentBranchName) {
		const currentBranch = branches.find(branch => branch.name === currentBranchName && !branch.remote);
		const remoteBranch = branches.find(branch => branch.name === "origin/"+currentBranchName && branch.remote);
		if (!remoteBranch) {
			document.getElementById("PushButton")!.classList.add("highlight");
		} else {
			if (remoteBranch && currentBranch && currentBranch.commitsAhead > remoteBranch.commitsAhead) {
				document.getElementById("PushButton")!.classList.add("highlight");
			} else {
				document.getElementById("PushButton")!.classList.remove("highlight");
			}
		}
	}
}

export async function gitDiff() {
	const [diffOutput, diffStagedOutput, statusOutput] = await Promise.all([
		window.go.main.App.GitDiff() as Promise<GitDiffOutput>,
		window.go.main.App.GitDiffStaged() as Promise<GitDiffOutput>,
		window.go.main.App.RunGitStatus() as Promise<GitStatusOutput>,
	]);

	const stagedDiffMap = new Map<string, GitDiffOutput["files"][0]>();
	for (const file of diffStagedOutput.files) {
		stagedDiffMap.set(file.path, file);
	}

	const unstagedDiffMap = new Map<string, GitDiffOutput["files"][0]>();
	for (const file of diffOutput.files) {
		unstagedDiffMap.set(file.path, file);
	}

	const seenPaths = new Set<string>();

	for (const map of [stagedDiffMap, unstagedDiffMap]) {
		for (const file of map.values()) {
			const newDiff: string[] = [];
			for (let line of file.diff.split("\n")) {
				if (line.startsWith("+") && !line.startsWith("+++ b/" + file.path)) {
					newDiff.push(`<span class="addedLine">${escapeHtml(line)}</span>`);
				} else if (line.startsWith("-") && !line.startsWith("--- a/" + file.path)) {
					newDiff.push(`<span class="removedLine">${escapeHtml(line)}</span>`);
				} else {
					newDiff.push(`<span class="unchangedLine">${escapeHtml(line)}</span>`);
				}
			}
			file.diff = newDiff.join("\n");
		}
	}

	let changesHtml = "";

	for (const file of statusOutput.files) {
		const parsedLine = parseGitStatusLine(file);
		if (!parsedLine) continue;

		seenPaths.add(parsedLine.path);

		const stagedCode = parsedLine.xy[0];
		const unstagedCode = parsedLine.xy[1];
		const entries: GitChangeEntry[] = [];
		const actionPath = buildActionPath(parsedLine);

		if (isStagedFromXYStatus(parsedLine.xy)) {
			entries.push({
				key: `${parsedLine.path}:staged`,
				path: parsedLine.path,
				label: buildStatusLabel(parsedLine, "staged", stagedCode),
				side: "staged",
				diffFile: stagedDiffMap.get(parsedLine.path),
				buttonsHtml: `<button onclick='unstageGitFile(${escapeHtml(JSON.stringify(actionPath))})'>Unstage</button>`,
				statusClass: "staged",
			});
		}

		if (hasUnstagedFromXYStatus(parsedLine.xy) || parsedLine.key === "?" || parsedLine.key === "!") {
			entries.push({
				key: `${parsedLine.path}:unstaged`,
				path: parsedLine.path,
				label: buildStatusLabel(parsedLine, "unstaged", parsedLine.key === "?" ? "A" : unstagedCode),
				side: "unstaged",
				diffFile: unstagedDiffMap.get(parsedLine.path),
				buttonsHtml: `<button onclick='stageGitFile(${escapeHtml(JSON.stringify(actionPath))})'>Stage</button><button onclick='discardGitFile(${escapeHtml(JSON.stringify(actionPath))})'>Discard</button>`,
				statusClass: "unstaged",
			});
		}

		if (entries.length === 0) {
			entries.push({
				key: `${parsedLine.path}:fallback`,
				path: parsedLine.path,
				label: parsedLine.text,
				side: "unstaged",
				diffFile: unstagedDiffMap.get(parsedLine.path),
				buttonsHtml: `<button onclick='stageGitFile(${escapeHtml(JSON.stringify(actionPath))})'>Stage</button><button onclick='discardGitFile(${escapeHtml(JSON.stringify(actionPath))})'>Discard</button>`,
				statusClass: "unstaged",
			});
		}

		for (const entry of entries) {
			changesHtml += renderChangeEntry(entry);
		}
	}

	// Include any diff files not covered by status (edge case)
	for (const [path, diffFile] of unstagedDiffMap) {
		if (seenPaths.has(path)) continue;
		seenPaths.add(path);

		const buttonsHtml = `<button onclick='stageGitFile(${escapeHtml(JSON.stringify(path))})'>Stage</button><button onclick='discardGitFile(${escapeHtml(JSON.stringify(path))})'>Discard</button>`;

		changesHtml += renderChangeEntry({
			key: `${path}:unstaged-fallback`,
			path,
			label: `Unstaged change: ${path}`,
			side: "unstaged",
			diffFile,
			buttonsHtml,
			statusClass: "unstaged",
		});
	}

	for (const [path, diffFile] of stagedDiffMap) {
		if (seenPaths.has(path)) continue;

		changesHtml += renderChangeEntry({
			key: `${path}:staged-fallback`,
			path,
			label: `Staged change: ${path}`,
			side: "staged",
			diffFile,
			buttonsHtml: `<button onclick='unstageGitFile(${escapeHtml(JSON.stringify(path))})'>Unstage</button>`,
			statusClass: "staged",
		});
	}

	document.getElementById("Changes")!.innerHTML = changesHtml;
	currentBranchName = statusOutput.branchName;
	document.getElementById("BranchName")!.innerText = `Current Branch: ${currentBranchName}`;
}

export async function gitFetch() {
	await window.go.main.App.GitFetch();
}
