import { getGitActionButtonAttrs } from './gitActionState';
import { setRenderedGitEntries, type GitSelectionEntry } from './gitSelectionState';

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
	mergeInProgress: boolean;
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

export function parseGitStatusLine(line: string): GitStatusLine | null {
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

	const unmergedCodeMatch = line.match(/^(AA|AU|DD|DU|UD|UA|UU) (.+)$/);
	if (unmergedCodeMatch) {
		const xy = unmergedCodeMatch[1];
		const path = unmergedCodeMatch[2];
		return { key: "u", xy, path, text: `${xy} ${path}` };
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

	// Backward compatibility with porcelain v1 ("XY path")
	if (line.length >= 3) {
		const xy = line.substring(0, 2);
		const path = line.substring(3);
		if (isUnmergedStatusCode(xy)) {
			return { key: "u", xy, path, text: line };
		}
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

function isUnmergedStatusCode(xy: string): boolean {
	return xy === "AA" || xy === "AU" || xy === "DD" || xy === "DU" || xy === "UD" || xy === "UA" || xy === "UU";
}

export function isStagedFromXYStatus(xy: string): boolean {
	// In porcelain v2, "." means unchanged; in v1, " " means unchanged.
	return xy[0] !== "." && xy[0] !== " " && xy[0] !== "?" && xy[0] !== "!";
}

export function hasUnstagedFromXYStatus(xy: string): boolean {
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

	return `<div class="diff-content" style="display:none"><pre class="changedLinesContainer">${diffFile.diff}</pre><div class="diff-stats"><span class="diff-stat diff-stat-added">+${diffFile.linesAdded}</span><span class="diff-stat diff-stat-removed">-${diffFile.linesRemoved}</span></div></div>`;
}

function renderChangeEntry(entry: GitChangeEntry): string {
	return `<div class="diff-file-entry" data-change-key="${escapeHtml(entry.key)}" onclick="selectGitChange(event, ${escapeHtml(JSON.stringify(entry.key))})">
		<div class="diff-file-header-row">
			<div class="diff-file-copy">
				<span class="diff-file-status ${entry.statusClass}">${escapeHtml(entry.label)}</span>
				<h3 class="diff-file-header">
					<button type="button" class="diff-file-toggle" onclick="event.stopPropagation(); toggleDiff(this.closest('.diff-file-entry').querySelector('.diff-file-header'))">
						${escapeHtml(entry.path)} ${renderSvg(entry.path)}
					</button>
				</h3>
			</div>
			<div class="diff-file-actions">${entry.buttonsHtml}</div>
		</div>
		${renderDiffContent(entry.diffFile)}
	</div>`;
}

import GoIcon from "../../assets/images/icons/file_type_go.svg";
import FolderIcon from "../../assets/images/icons/default_folder.svg";
import CssIcon from "../../assets/images/icons/file_type_css2.svg";
import HtmlIcon from "../../assets/images/icons/file_type_html.svg";
import JsIcon from "../../assets/images/icons/file_type_js.svg";
import JsonIcon from "../../assets/images/icons/file_type_json.svg";
import PhpIcon from "../../assets/images/icons/file_type_php.svg";
import PrettierIcon from "../../assets/images/icons/file_type_prettier.svg";
import PrismaIcon from "../../assets/images/icons/file_type_prisma.svg";
import TsIcon from "../../assets/images/icons/file_type_ts.svg";
import EsbuildIcon from "../../assets/images/icons/file_type_esbuild.svg";
import EslintIcon from "../../assets/images/icons/file_type_eslint.svg";
import SvgIcon from "../../assets/images/icons/file_type_svg.svg";
import TsOfficialIcon from "../../assets/images/icons/file_type_typescript_official.svg"
import GitIcon from "../../assets/images/icons/file_type_git.svg"
import GoFuchsiaIcon from "../../assets/images/icons/file_type_go_fuchsia.svg"
import GoGopherIcon from "../../assets/images/icons/file_type_go_gopher.svg"
import ImageIcon from "../../assets/images/icons/file_type_image.svg"
import MarkdownIcon from "../../assets/images/icons/file_type_markdown.svg"
import JsTestIcon from "../../assets/images/icons/file_type_testjs.svg"
import TsTestIcon from "../../assets/images/icons/file_type_testts.svg"
import FileIcon from "../../assets/images/icons/default_file.svg"

export function renderSvg(filePath: string): string {
    const lower = filePath.toLowerCase();

    // --- 1. Special‑case rules (checked first) ---
    const specialCases: Record<string, string> = {
        ".test.js": JsTestIcon,
        ".spec.js": JsTestIcon,
        ".test.ts": TsTestIcon,
        ".spec.ts": TsTestIcon,
        "go.mod": GoGopherIcon,
        "_test.go": GoFuchsiaIcon,
        ".gitignore": GitIcon,
        "tsconfig.json": TsOfficialIcon,
		"prettier.config.js": PrettierIcon,
    };

    for (const key in specialCases) {
        if (lower.endsWith(key)) {
            return `<img height="20" src="${specialCases[key]}" class="file-icon">`;
        }
    }

    // --- 2. Dotfile detection ---
    const baseName = lower.split("/").pop()!;
    if (baseName.startsWith(".")) {
        const dotfileMap: Record<string, string> = {
            ".prettierrc": PrettierIcon,
            ".prettier.config.js": PrettierIcon,
			".prettierrc.js": PrettierIcon,
			".prettierrc.json": PrettierIcon,
			".prettierrc.yaml": PrettierIcon,
            ".eslintrc": EslintIcon,
            ".eslintrc.js": EslintIcon,
            ".eslintrc.json": EslintIcon,
        };
        if (dotfileMap[baseName]) {
            return `<img height="20" src="${dotfileMap[baseName]}" class="file-icon">`;
        }
    }

    // --- 3. Extension detection ---
    const extension = baseName.includes(".") ? baseName.split(".").pop()! : "";

    const svgMap: Record<string, string> = {
        go: GoIcon,
        css: CssIcon,
        html: HtmlIcon,
        js: JsIcon,
        json: JsonIcon,
        php: PhpIcon,
        prettier: PrettierIcon,
        prisma: PrismaIcon,
        ts: TsIcon,
        esbuild: EsbuildIcon,
        eslint: EslintIcon,
        svg: SvgIcon,
        png: ImageIcon,
        jpg: ImageIcon,
        jpeg: ImageIcon,
        gif: ImageIcon,
        webp: ImageIcon,
        md: MarkdownIcon,
    };

    if (svgMap[extension]) {
        return `<img height="20" src="${svgMap[extension]}" class="file-icon">`;
    }

    // --- 4. Folder fallback ---
    if (filePath.endsWith("/")) {
        return `<img height="20" src="${FolderIcon}" class="file-icon">`;
    }

    // --- 5. Default fallback ---
    return `<img height="20" src="${FileIcon}" class="file-icon">`;
}

function renderStageButton(actionPath: string, entryKey: string): string {
	return `<button ${getGitActionButtonAttrs(actionPath)} onclick='event.stopPropagation(); stageGitFile(${escapeHtml(JSON.stringify(actionPath))}, ${escapeHtml(JSON.stringify(entryKey))})'>Stage</button>`;
}

function renderUnstageButton(actionPath: string, entryKey: string): string {
	return `<button ${getGitActionButtonAttrs(actionPath)} onclick='event.stopPropagation(); unstageGitFile(${escapeHtml(JSON.stringify(actionPath))}, ${escapeHtml(JSON.stringify(entryKey))})'>Unstage</button>`;
}

function renderDiscardButton(actionPath: string, label: string, entryKey: string): string {
	return `<button ${getGitActionButtonAttrs(actionPath)} onclick='event.stopPropagation(); discardGitFile(${escapeHtml(JSON.stringify(actionPath))}, ${escapeHtml(JSON.stringify(label))}, ${escapeHtml(JSON.stringify(entryKey))})'>Discard</button>`;
}

function renderConflictResolutionButtons(actionPath: string, entryKey: string): string {
	return `<button ${getGitActionButtonAttrs(actionPath)} onclick='event.stopPropagation(); resolveGitConflict(${escapeHtml(JSON.stringify(actionPath))}, "ours", ${escapeHtml(JSON.stringify(entryKey))})'>Use ours</button><button ${getGitActionButtonAttrs(actionPath)} onclick='event.stopPropagation(); resolveGitConflict(${escapeHtml(JSON.stringify(actionPath))}, "theirs", ${escapeHtml(JSON.stringify(entryKey))})'>Use theirs</button>`;
}

export async function gitStatus() {
	const output = await window.go.main.App.RunGitStatus() as GitStatusOutput;
	currentBranchName = output.branchName;
	document.getElementById("BranchName")!.innerText = currentBranchName || "No repository selected";
}

export async function getGitCommits() {
	commits = await window.go.main.App.GetCommitHistory() as GitCommit[];
	if (commits.length === 0) {
		document.getElementById("GitCommits")!.innerHTML = `<div class="empty-panel-state">No commits available yet.</div>`;
		return;
	}

	let commitsHtml = "";
	for (const commit of commits) {
		commitsHtml += `<article class="commit-card">`;
		commitsHtml += `<div class="commit-meta"><span class="commit-author">${escapeHtml(commit.author)}</span><span class="commit-date">${escapeHtml(commit.date.substring(0, 16))}</span></div>`;
		commitsHtml += `<p class="commit-message">${escapeHtml(commit.message)}</p>`;
		commitsHtml += `<code class="commit-hash">${escapeHtml(commit.hash.substring(0, 8))}</code></article>`;
	}
	document.getElementById("GitCommits")!.innerHTML = commitsHtml;
}

export async function getGitBranches() {
	branches = await window.go.main.App.GetGitBranches() as GitBranch[];
	if (branches.length === 0) {
		document.getElementById("GitBranches")!.innerHTML = `<div class="empty-panel-state">No branches detected.</div>`;
		return;
	}

	const branchesHtml = branches.map(branch => {
		const branchKind = branch.remote ? "Remote" : "Local";
		const kindClass = branch.remote ? "remote" : "local";
		const isCurrentBranch = !branch.remote && branch.name === currentBranchName;
		const matchingRemoteBranch = !branch.remote ? branches.find(candidate => candidate.remote && candidate.name === `origin/${branch.name}`) : undefined;
		const isUnsyncedLocalBranch = !branch.remote && (!matchingRemoteBranch || matchingRemoteBranch.commitId !== branch.commitId);
		const cardClass = isCurrentBranch ? `${kindClass} current` : kindClass;
		const cardAttrs = isCurrentBranch
			? ""
			: ` onclick="promptBranchSwitch(${escapeHtml(JSON.stringify(branch.name))}, ${branch.remote})" oncontextmenu="event.preventDefault(); toggleBranchContextMenu(this)"`;
		const actionHint = isCurrentBranch
			? `<span class="branch-card-hint current">Current branch</span>`
			: `<details class="branch-menu-dropdown" onclick="event.stopPropagation()">
				<summary class="branch-menu-trigger" title="Branch options">⋯</summary>
				<div class="branch-menu-dropdown-menu surface-card">
					${branch.remote
						? `<button type="button" class="branch-menu-item" onclick="event.stopPropagation(); this.closest('.branch-menu-dropdown').open = false; promptBranchSwitch(${escapeHtml(JSON.stringify(branch.name))}, true)">Create local</button>`
						: `<button type="button" class="branch-menu-item" onclick="event.stopPropagation(); this.closest('.branch-menu-dropdown').open = false; promptBranchSwitch(${escapeHtml(JSON.stringify(branch.name))}, false)">Switch</button>
						<button type="button" class="branch-menu-item" onclick="event.stopPropagation(); this.closest('.branch-menu-dropdown').open = false; promptArchiveBranch(${escapeHtml(JSON.stringify(branch.name))})">Archive</button>
						<button type="button" class="branch-menu-item branch-menu-item-danger" onclick="event.stopPropagation(); this.closest('.branch-menu-dropdown').open = false; promptDeleteBranch(${escapeHtml(JSON.stringify(branch.name))}, ${isUnsyncedLocalBranch})">Delete</button>`
					}
				</div>
			</details>`;
		return `<article class="branch-card ${cardClass}"${cardAttrs}>
			<div class="branch-card-top">
				<span class="branch-name">${escapeHtml(branch.name)}</span>
				<span class="branch-kind">${branchKind}</span>
			</div>
			<div class="branch-card-bottom">
				<span class="branch-delta">↑ ${branch.commitsAhead}</span>
				<span class="branch-delta">↓ ${branch.commitsBehind}</span>
				${actionHint}
			</div>
		</article>`;
	}).join("");
	document.getElementById("GitBranches")!.innerHTML = branchesHtml;

	const pushButton = document.getElementById("PushButton");
	const pullButton = document.getElementById("PullChanges");
	// Highlight sync actions when the current branch is out of date relative to origin.
	if (currentBranchName) {
		const currentBranch = branches.find(branch => branch.name === currentBranchName && !branch.remote);
		const remoteBranch = branches.find(branch => branch.name === "origin/"+currentBranchName && branch.remote);
		const isBehindRemote = !!currentBranch && !!remoteBranch && remoteBranch.commitsAhead > currentBranch.commitsAhead;
		const isAheadOfRemote = !remoteBranch || !!currentBranch && currentBranch.commitsAhead > remoteBranch.commitsAhead;

		if (pushButton) {
			pushButton.classList.toggle("highlight", isAheadOfRemote);
		}
		if (pullButton) {
			pullButton.classList.toggle("highlight", isBehindRemote);
		}
	} else {
		if (pushButton) {
			pushButton.classList.remove("highlight");
		}
		if (pullButton) {
			pullButton.classList.remove("highlight");
		}
	}
}

export async function gitDiff() {
	const [diffOutput, diffStagedOutput, statusOutput] = await Promise.all([
		window.go.main.App.GitDiff() as Promise<GitDiffOutput>,
		window.go.main.App.GitDiffStaged() as Promise<GitDiffOutput>,
		window.go.main.App.RunGitStatus() as Promise<GitStatusOutput>,
	]);

	updateCommitButtonHighlight(statusOutput.files);

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
	const renderedEntries: GitSelectionEntry[] = [];
	let currentMergeConflictCount = 0;

	for (const file of statusOutput.files) {
		const parsedLine = parseGitStatusLine(file);
		if (!parsedLine) continue;

		seenPaths.add(parsedLine.path);

		const stagedCode = parsedLine.xy[0];
		const unstagedCode = parsedLine.xy[1];
		const entries: GitChangeEntry[] = [];
		const actionPath = buildActionPath(parsedLine);

		if (parsedLine.key === "u") {
			currentMergeConflictCount++;
			renderedEntries.push({
				key: `${parsedLine.path}:conflict`,
				actionPath,
				label: parsedLine.path,
				supportedActions: ["stage"],
			});
			entries.push({
				key: `${parsedLine.path}:conflict`,
				path: parsedLine.path,
				label: `Merge conflict: ${parsedLine.path}`,
				side: "unstaged",
				diffFile: unstagedDiffMap.get(parsedLine.path) ?? stagedDiffMap.get(parsedLine.path),
				buttonsHtml: renderConflictResolutionButtons(actionPath, `${parsedLine.path}:conflict`),
				statusClass: "unstaged",
			});

			for (const entry of entries) {
				changesHtml += renderChangeEntry(entry);
			}
			continue;
		}

		if (isStagedFromXYStatus(parsedLine.xy)) {
			renderedEntries.push({
				key: `${parsedLine.path}:staged`,
				actionPath,
				label: buildStatusLabel(parsedLine, "staged", stagedCode),
				supportedActions: ["unstage"],
			});
			entries.push({
				key: `${parsedLine.path}:staged`,
				path: parsedLine.path,
				label: buildStatusLabel(parsedLine, "staged", stagedCode),
				side: "staged",
				diffFile: stagedDiffMap.get(parsedLine.path),
				buttonsHtml: renderUnstageButton(actionPath, `${parsedLine.path}:staged`),
				statusClass: "staged",
			});
		}

		if (hasUnstagedFromXYStatus(parsedLine.xy) || parsedLine.key === "?" || parsedLine.key === "!") {
			const discardLabel = parsedLine.origPath
				? `${parsedLine.origPath} -> ${parsedLine.path}`
				: parsedLine.path;
			renderedEntries.push({
				key: `${parsedLine.path}:unstaged`,
				actionPath,
				label: discardLabel,
				supportedActions: ["stage", "discard"],
			});
			entries.push({
				key: `${parsedLine.path}:unstaged`,
				path: parsedLine.path,
				label: buildStatusLabel(parsedLine, "unstaged", parsedLine.key === "?" ? "A" : unstagedCode),
				side: "unstaged",
				diffFile: unstagedDiffMap.get(parsedLine.path),
				buttonsHtml: `${renderStageButton(actionPath, `${parsedLine.path}:unstaged`)}${renderDiscardButton(actionPath, discardLabel, `${parsedLine.path}:unstaged`)}`,
				statusClass: "unstaged",
			});
		}

		if (entries.length === 0) {
			renderedEntries.push({
				key: `${parsedLine.path}:fallback`,
				actionPath,
				label: parsedLine.path,
				supportedActions: ["stage", "discard"],
			});
			entries.push({
				key: `${parsedLine.path}:fallback`,
				path: parsedLine.path,
				label: parsedLine.text,
				side: "unstaged",
				diffFile: unstagedDiffMap.get(parsedLine.path),
				buttonsHtml: `${renderStageButton(actionPath, `${parsedLine.path}:fallback`)}${renderDiscardButton(actionPath, parsedLine.path, `${parsedLine.path}:fallback`)}`,
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

		renderedEntries.push({
			key: `${path}:unstaged-fallback`,
			actionPath: path,
			label: path,
			supportedActions: ["stage", "discard"],
		});

		const buttonsHtml = `${renderStageButton(path, `${path}:unstaged-fallback`)}${renderDiscardButton(path, path, `${path}:unstaged-fallback`)}`;

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

		renderedEntries.push({
			key: `${path}:staged-fallback`,
			actionPath: path,
			label: path,
			supportedActions: ["unstage"],
		});

		changesHtml += renderChangeEntry({
			key: `${path}:staged-fallback`,
			path,
			label: `Staged change: ${path}`,
			side: "staged",
			diffFile,
			buttonsHtml: renderUnstageButton(path, `${path}:staged-fallback`),
			statusClass: "staged",
		});
	}

	document.getElementById("Changes")!.innerHTML = changesHtml;
	setRenderedGitEntries(renderedEntries);
	updateMergeConflictBanner(statusOutput.mergeInProgress, currentMergeConflictCount);
	currentBranchName = statusOutput.branchName;
	document.getElementById("BranchName")!.innerText = currentBranchName || "No repository selected";
}

function updateMergeConflictBanner(mergeInProgress: boolean, conflictCount: number) {
	const banner = document.getElementById("MergeConflictBanner");
	if (!banner) {
		return;
	}

	banner.hidden = !mergeInProgress;
	const continueButton = document.getElementById("ContinueMergeButton") as HTMLButtonElement | null;
	const abortButton = document.getElementById("AbortMergeButton") as HTMLButtonElement | null;
	if (continueButton) {
		continueButton.hidden = !mergeInProgress || conflictCount > 0;
		continueButton.disabled = !mergeInProgress || conflictCount > 0;
	}
	if (abortButton) {
		abortButton.hidden = !mergeInProgress;
		abortButton.disabled = !mergeInProgress;
	}
	if (mergeInProgress && conflictCount > 0) {
		const title = banner.querySelector(".merge-conflict-title");
		if (title) {
			title.textContent = conflictCount === 1 ? "Merge conflict detected" : `${conflictCount} merge conflicts detected`;
		}
		const copy = banner.querySelector(".merge-conflict-copy");
		if (copy) {
			copy.textContent = conflictCount === 1
				? "Resolve the file below with Use ours / Use theirs, then continue the merge or abort if you want to start over."
				: "Resolve the files below with Use ours / Use theirs, then continue the merge or abort if you want to start over.";
		}
	} else if (mergeInProgress) {
		const title = banner.querySelector(".merge-conflict-title");
		if (title) {
			title.textContent = "Merge ready to continue";
		}
		const copy = banner.querySelector(".merge-conflict-copy");
		if (copy) {
			copy.textContent = "All conflicts are resolved. Continue the merge to finish it, or abort if you want to start over.";
		}
	}
}

function updateCommitButtonHighlight(files: string[]) {
	const commitButton = document.getElementById("CommitChanges");
	if (!commitButton) {
		return;
	}

	const hasStagedChanges = files.some((line) => {
		const parsedLine = parseGitStatusLine(line);
		return parsedLine ? isStagedFromXYStatus(parsedLine.xy) : false;
	});

	commitButton.classList.toggle("highlight", hasStagedChanges);
}

export async function gitFetch() {
	await window.go.main.App.GitFetch();
}
