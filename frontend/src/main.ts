import './style.css';
import './app.css';
import './defaults.css';

import { getGitBranches, getGitCommits, gitDiff, gitFetch } from './git';
import { beginGitAction, endGitAction, isGitActionPending } from './gitActionState';
import { getGitSelectionTargets, handleGitSelectionClick, handleGitSelectionKeydown, type GitSelectionAction } from './gitSelectionState';

export let openedFolder: string | null = null;

type DiscardModalState = {
	items: { filePath: string; description: string }[];
} | null;

let discardModalState: DiscardModalState = null;
let gitSelectionKeyListenerBound = false;

window.pickFolder = async function () {
	const folder = await window.go.main.App.PickFolder();
	openedFolder = folder;

	loadHtml();
};

window.stageGitFile = async function (filePath: string, changeKey?: string) {
	const targets = getActionTargetsOrFallback("stage", filePath, changeKey);
	await runGitAction("stage", targets, async (targetPath) => {
		await window.go.main.App.StageGitFile(targetPath);
	});
}

window.unstageGitFile = async function (filePath: string, changeKey?: string) {
	const targets = getActionTargetsOrFallback("unstage", filePath, changeKey);
	await runGitAction("unstage", targets, async (targetPath) => {
		await window.go.main.App.UnstageGitFile(targetPath);
	});
}

window.commitGitChanges = async function () {
	try {
		document.getElementById("CommitChanges")!.setAttribute("disabled", "");
		const messageInput = document.getElementById("CommitMessage") as HTMLInputElement;
		const message = messageInput.value;
		if (!message) {
			alert("Please enter a commit message.");
			document.getElementById("CommitChanges")!.removeAttribute("disabled");
			return;
		}
		await window.go.main.App.CommitGitChanges(message);
		messageInput.value = "";
	} finally {
		document.getElementById("CommitChanges")!.removeAttribute("disabled");
		window.refresh();
	}
}

window.switchGitBranch = async function () {
	try {
		document.getElementById("SwitchBranch")!.setAttribute("disabled", "");
		const branchInput = document.getElementById("BranchNameInput") as HTMLInputElement;
		const branchName = branchInput.value;
		if (!branchName) {
			alert("Please enter a branch name");
			document.getElementById("SwitchBranch")!.removeAttribute("disabled");
			return;
		}
		await window.go.main.App.SwitchGitBranch(branchName);
		branchInput.value = "";
		window.refresh();
	} finally {
		document.getElementById("SwitchBranch")!.removeAttribute("disabled");
	}
}

/*
window.refresh = async function () {
	try {
		document.getElementById("Refresh")!.setAttribute("disabled", "");
		await gitFetch();
		await Promise.allSettled([
			getGitCommits(),
			getGitBranches(),
			gitDiff(),
		]);
	} finally {
		document.getElementById("Refresh")!.removeAttribute("disabled");
	}
}
*/

async function timeIt(label: string, fn: () => Promise<any>) {
    const start = performance.now();
    try {
        return await fn();
    } finally {
        const end = performance.now();
        console.log(`${label} took ${(end - start).toFixed(2)} ms`);
    }
}

window.refresh = async function () {
	try {
		document.getElementById("Refresh")!.setAttribute("disabled", "");

		await timeIt("gitFetch", () => gitFetch());

		await Promise.allSettled([
			timeIt("getGitCommits", () => getGitCommits()),
			timeIt("getGitBranches", () => getGitBranches()),
			timeIt("gitDiff", () => gitDiff()),
		]);

	} finally {
		document.getElementById("Refresh")!.removeAttribute("disabled");
	}
}


window.discardGitFile = async function (filePath: string, description?: string, changeKey?: string) {
	const targets = getActionTargetsOrFallback("discard", filePath, changeKey, description);
	discardModalState = {
		items: targets.map((target) => ({
			filePath: target.actionPath,
			description: target.label,
		})),
	};
	updateDiscardModal();
}

window.confirmDiscardGitFile = async function () {
	if (!discardModalState) {
		return;
	}

	const targets = discardModalState.items;
	hideDiscardModal();
	await runGitAction("discard", targets.map((target) => ({ actionPath: target.filePath, label: target.description })), async (targetPath) => {
		await window.go.main.App.DiscardGitFile(targetPath);
	});
}

window.selectGitChange = function (event: MouseEvent, key: string) {
	handleGitSelectionClick(event, key);
}

window.cancelDiscardGitFile = function () {
	hideDiscardModal();
}

window.pushGitChanges = async function () {
	try {
		document.getElementById("PushButton")!.setAttribute("disabled", "");
		await window.go.main.App.PushGitChanges();
		getGitBranches();
	} finally {
		document.getElementById("PushButton")!.removeAttribute("disabled");
	}
}

window.toggleDiff = function (headerEl: HTMLElement) {
	const entry = headerEl.closest('.diff-file-entry') as HTMLElement;
	const content = entry.querySelector('.diff-content') as HTMLElement;
	if (content.style.display === "none") {
		content.style.display = "";
	} else {
		content.style.display = "none";
	}
}

window.pullGitChanges = async function () {
	try {
		document.getElementById("PullChanges")!.setAttribute("disabled", "");
		await window.go.main.App.PullGitChanges();
		window.refresh();
	} finally {
		document.getElementById("PullChanges")!.removeAttribute("disabled");
	}
}

import appHtml from './app.html?raw';
import branchPanelHtml from './panels/branchPanel.html?raw';
import commitPanelHtml from './panels/commitPanel.html?raw';

function loadHtml() {
	document.querySelector('#app')!.innerHTML = appHtml;
	document.getElementById('BranchPanel')!.innerHTML = branchPanelHtml;
	document.getElementById('CommitPanel')!.innerHTML = commitPanelHtml;
	ensureGitSelectionKeyListener();
	updateDiscardModal();
	window.refresh();
}

function updateDiscardModal() {
	const modal = document.getElementById("DiscardModal");
	if (!modal) {
		return;
	}

	const descriptionEl = document.getElementById("DiscardModalDescription");
	const confirmButton = document.getElementById("ConfirmDiscardButton") as HTMLButtonElement | null;
	if (discardModalState) {
		modal.removeAttribute("hidden");
		descriptionEl!.textContent = formatDiscardDescription(discardModalState.items);
		if (confirmButton) {
			confirmButton.disabled = discardModalState.items.some((item) => isGitActionPending("discard", item.filePath));
		}
	} else {
		modal.setAttribute("hidden", "");
		if (descriptionEl) {
			descriptionEl.textContent = "";
		}
		if (confirmButton) {
			confirmButton.disabled = false;
		}
	}
}

function hideDiscardModal() {
	discardModalState = null;
	updateDiscardModal();
}

function getActionTargetsOrFallback(action: GitSelectionAction, filePath: string, changeKey?: string, label?: string) {
	const selectionTargets = getGitSelectionTargets(action, changeKey);
	if (selectionTargets.length > 0) {
		return selectionTargets;
	}

	return [{
		actionPath: filePath,
		label: label ?? filePath,
		supportedActions: [action],
		key: changeKey ?? filePath,
	}];
}

async function runGitAction(
	action: GitSelectionAction,
	targets: Array<{ actionPath: string; label?: string }>,
	runner: (targetPath: string) => Promise<void>,
) {
	const actionKeys: string[] = [];
	const actionPaths: string[] = [];

	for (const target of targets) {
		const actionKey = beginGitAction(action, target.actionPath);
		if (!actionKey) {
			continue;
		}
		actionKeys.push(actionKey);
		actionPaths.push(target.actionPath);
	}

	if (actionPaths.length === 0) {
		return;
	}

	try {
		for (const actionPath of actionPaths) {
			await runner(actionPath);
		}
		await gitDiff();
	} finally {
		for (const actionKey of actionKeys) {
			endGitAction(actionKey);
		}
	}
}

function formatDiscardDescription(items: { filePath: string; description: string }[]): string {
	if (items.length === 1) {
		return items[0].description;
	}

	return `${items.length} selected items:\n${items.map((item) => `- ${item.description}`).join("\n")}`;
}

function ensureGitSelectionKeyListener() {
	if (gitSelectionKeyListenerBound) {
		return;
	}

	document.addEventListener("keydown", handleGitSelectionKeydown);
	gitSelectionKeyListenerBound = true;
}

if (openedFolder) {
	loadHtml();
} else {
	document.querySelector('#app')!.innerHTML = `<section class="welcome-shell">
		<div class="welcome-panel surface-card">
			<p class="eyebrow">Desktop Git Workspace</p>
			<h1>Open a repository to get started</h1>
			<p class="welcome-copy">Track diffs, review branches, select multiple files like VS Code, and commit with a faster local workflow.</p>
			<div class="welcome-actions">
				<button class="button-primary" onclick="pickFolder()">Choose Repository</button>
			</div>
		</div>
	</section>`;
}

declare global {
    interface Window {
        greet: () => void;
		stageGitFile: (filePath: string, changeKey?: string) => Promise<void>;
		unstageGitFile: (filePath: string, changeKey?: string) => Promise<void>;
		discardGitFile: (filePath: string, description?: string, changeKey?: string) => Promise<void>;
		confirmDiscardGitFile: () => Promise<void>;
		cancelDiscardGitFile: () => void;
		selectGitChange: (event: MouseEvent, key: string) => void;
    }
}
