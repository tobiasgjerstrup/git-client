import { openedFolder } from "./main";

type GitPorcelainV2Key = "1" | "2" | "u" | "?" | "!";

type GitStatusLine = {
	key: GitPorcelainV2Key;
	xy: string;
	path: string;
	text: string;
};

const gitPorcelain: Record<GitPorcelainV2Key, { description: string }> = {
	"1": {
		description: "Changed",
	},
	"2": {
		description: "Renamed/Copied",
	},
	"u": {
		description: "Unmerged",
	},
	"?": {
		description: "Untracked",
	},
	"!": {
		description: "Ignored",
	},
} as const;

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
		const path = pathWithOrigin.split("\t")[0];
		return { key: "2", xy: renamedOrCopiedMatch[1], path, text: `${renamedOrCopiedMatch[1]} ${path}` };
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

export function generateGitStatusHtml(output: GitStatusOutput): string {
	let resultHtml = "";

	for (const file of output.files) {
		const parsedLine = parseGitStatusLine(file);
		if (!parsedLine) {
			continue;
		}

		const porcelainMeta = gitPorcelain[parsedLine.key];
		if (!porcelainMeta) {
			resultHtml += `<p class="unknown">${escapeHtml(file)}</p>`;
			continue;
		}
		if (isStagedFromXYStatus(parsedLine.xy)) {
			resultHtml += `<span class="staged">${escapeHtml(parsedLine.text)}</span>`;
			resultHtml += `<button onclick='unstageGitFile(${JSON.stringify(parsedLine.path)})'>Unstage</button>`;
		} else {
			resultHtml += `<span class="unstaged">${escapeHtml(parsedLine.text)}</span>`;
			resultHtml += `<button onclick='stageGitFile(${escapeHtml(JSON.stringify(parsedLine.path))})'>Stage</button>`;
			resultHtml += `<button onclick='discardGitFile(${escapeHtml(JSON.stringify(parsedLine.path))})'>Discard</button>`;
		}
	}
	return resultHtml;
}

export async function gitStatus() {
	const output = await window.go.main.App.RunGitStatus(openedFolder) as GitStatusOutput;
	const resultHtml = generateGitStatusHtml(output);	
	document.getElementById("result")!.innerHTML = resultHtml;
	document.getElementById("branchName")!.innerText = `Current Branch: ${output.branchName}`;
}

export async function getGitCommits() {
	const output = await window.go.main.App.GetCommitHistory() as GitCommit[];
	let commitsHtml = "";
	for (const commit of output) {
		commitsHtml += `<div class="commit">`
		commitsHtml += `<span>${commit.date.substring(0, 16)} <strong>${escapeHtml(commit.author)}</strong></span><br>`;
		commitsHtml += `<span>${escapeHtml(commit.message)}</span><br>`;
		commitsHtml += `<hr></div>`;
	}
	document.getElementById("gitCommits")!.innerHTML = commitsHtml;
}

export async function getGitBranches() {
	const branches = await window.go.main.App.GetGitBranches() as GitBranch[];
	const branchesHtml = branches.map(branch => `<p>${branch.remote ? "☁️" : "🗃️"}${escapeHtml(branch.name)} ${branch.commitsAhead}/${branch.commitsBehind}</p>`)/*(Commit ID: ${escapeHtml(branch.commitId)})</p>`)*/.join("");
	document.getElementById("gitBranches")!.innerHTML = branchesHtml;
	console.log(branches);
}

export async function gitDiff() {
	const output = await window.go.main.App.GitDiff() as GitDiffOutput;

	for (const file of output.files) {
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

	const changes = output.files.map(file => `<h3>${escapeHtml(file.path)}</h3><pre class="changedLinesContainer">${file.diff}</pre><p>Lines Added: ${file.linesAdded}, Lines Removed: ${file.linesRemoved}</p>`).join("");
	document.getElementById("changes")!.innerHTML = changes;
	console.log("Git diff output:", output);
}
