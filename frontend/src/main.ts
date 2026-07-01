import './style.css';
import './app.css';
import './defaults.css';

import { getGitBranches, getGitCommits, gitDiff, gitFetch } from './git';
import { beginGitAction, endGitAction, isAnyGitActionPending } from './gitActionState';
import { getGitSelectionTargets, handleGitSelectionClick, handleGitSelectionKeydown, type GitSelectionAction } from './gitSelectionState';

export let openedFolder: string | null = null;

type DiscardModalState = {
	items: { filePath: string; description: string }[];
} | null;

type BranchSwitchModalState = {
	displayBranchName: string;
	targetBranchName: string;
	createLocal: boolean;
} | null;

type BranchDeleteModalState = {
	branchName: string;
	forceDelete: boolean;
} | null;

let discardModalState: DiscardModalState = null;
let branchSwitchModalState: BranchSwitchModalState = null;
let branchDeleteModalState: BranchDeleteModalState = null;
let gitSelectionKeyListenerBound = false;
let modalKeyListenerBound = false;

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

window.promptBranchSwitch = function (branchName: string, isRemote?: boolean) {
	branchSwitchModalState = isRemote
		? {
			displayBranchName: branchName,
			targetBranchName: toLocalBranchName(branchName),
			createLocal: true,
		}
		: {
			displayBranchName: branchName,
			targetBranchName: branchName,
			createLocal: false,
		};
	updateBranchSwitchModal();
}

window.confirmBranchSwitch = async function () {
	if (!branchSwitchModalState) {
		return;
	}

	const { targetBranchName } = branchSwitchModalState;
	hideBranchSwitchModal();

	try {
		document.getElementById("SwitchBranch")!.setAttribute("disabled", "");
		await window.go.main.App.SwitchGitBranch(targetBranchName);
		const branchInput = document.getElementById("BranchNameInput") as HTMLInputElement | null;
		if (branchInput) {
			branchInput.value = "";
		}
		await window.refresh();
	} finally {
		document.getElementById("SwitchBranch")!.removeAttribute("disabled");
	}
}

window.cancelBranchSwitch = function () {
	hideBranchSwitchModal();
}

window.promptDeleteBranch = function (branchName: string, forceDelete?: boolean) {
	branchDeleteModalState = {
		branchName,
		forceDelete: !!forceDelete,
	};
	updateBranchDeleteModal();
}

window.confirmDeleteBranch = async function () {
	if (!branchDeleteModalState) {
		return;
	}

	const { branchName, forceDelete } = branchDeleteModalState;
	hideBranchDeleteModal();

	try {
		await window.go.main.App.DeleteGitBranch(branchName, forceDelete);
		await window.refresh();
	} catch (error) {
		throw error;
	}
	}

window.cancelDeleteBranch = function () {
	hideBranchDeleteModal();
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

window.pruneGitBranches = async function () {
	try {
		document.getElementById("PruneButton")!.setAttribute("disabled", "");
		await window.go.main.App.GitPrune();
		await window.refresh();
	} finally {
		document.getElementById("PruneButton")!.removeAttribute("disabled");
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
	updateBranchSwitchModal();
	updateBranchDeleteModal();
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
			confirmButton.disabled = discardModalState.items.some((item) => isAnyGitActionPending(item.filePath));
		}
		focusModalInitialTarget("DiscardModal");
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

function updateBranchSwitchModal() {
	const modal = document.getElementById("BranchSwitchModal");
	if (!modal) {
		return;
	}

	const titleEl = document.getElementById("BranchSwitchModalTitle");
	const copyEl = document.getElementById("BranchSwitchModalCopy");
	const descriptionEl = document.getElementById("BranchSwitchModalDescription");
	const confirmButton = document.getElementById("ConfirmBranchSwitchButton") as HTMLButtonElement | null;
	if (branchSwitchModalState) {
		modal.removeAttribute("hidden");
		if (titleEl) {
			titleEl.textContent = branchSwitchModalState.createLocal ? "Create local branch and switch?" : "Switch branch?";
		}
		if (copyEl) {
			copyEl.textContent = branchSwitchModalState.createLocal
				? "This will create a local branch from the selected remote branch and check it out in your current repository."
				: "This will check out the selected branch in your current repository.";
		}
		if (descriptionEl) {
			descriptionEl.textContent = branchSwitchModalState.createLocal
				? `${branchSwitchModalState.displayBranchName} -> ${branchSwitchModalState.targetBranchName}`
				: branchSwitchModalState.displayBranchName;
		}
		if (confirmButton) {
			confirmButton.disabled = false;
			confirmButton.textContent = branchSwitchModalState.createLocal ? "Create local and switch" : "Switch branch";
		}
		focusModalInitialTarget("BranchSwitchModal", "#ConfirmBranchSwitchButton");
	} else {
		modal.setAttribute("hidden", "");
		if (titleEl) {
			titleEl.textContent = "Switch branch?";
		}
		if (copyEl) {
			copyEl.textContent = "This will check out the selected branch in your current repository.";
		}
		if (descriptionEl) {
			descriptionEl.textContent = "";
		}
		if (confirmButton) {
			confirmButton.disabled = false;
			confirmButton.textContent = "Switch branch";
		}
	}
}

function hideBranchSwitchModal() {
	branchSwitchModalState = null;
	updateBranchSwitchModal();
}

function updateBranchDeleteModal() {
	const modal = document.getElementById("BranchDeleteModal");
	if (!modal) {
		return;
	}

	const titleEl = document.getElementById("BranchDeleteModalTitle");
	const copyEl = document.getElementById("BranchDeleteModalCopy");
	const descriptionEl = document.getElementById("BranchDeleteModalDescription");
	const confirmButton = document.getElementById("ConfirmDeleteBranchButton") as HTMLButtonElement | null;
	if (branchDeleteModalState) {
		modal.removeAttribute("hidden");
		if (titleEl) {
			titleEl.textContent = branchDeleteModalState.forceDelete ? "Force delete unsynced local branch?" : "Delete local branch?";
		}
		if (copyEl) {
			copyEl.textContent = branchDeleteModalState.forceDelete
				? "This branch is not synced with its remote counterpart. Deleting it will force-remove the local branch even if it contains work not present on origin."
				: "This will delete the selected local branch from your repository.";
		}
		if (descriptionEl) {
			descriptionEl.textContent = branchDeleteModalState.branchName;
		}
		if (confirmButton) {
			confirmButton.disabled = false;
			confirmButton.textContent = branchDeleteModalState.forceDelete ? "Force delete branch" : "Delete branch";
		}
		focusModalInitialTarget("BranchDeleteModal");
	} else {
		modal.setAttribute("hidden", "");
		if (titleEl) {
			titleEl.textContent = "Delete local branch?";
		}
		if (copyEl) {
			copyEl.textContent = "This will delete the selected local branch from your repository.";
		}
		if (descriptionEl) {
			descriptionEl.textContent = "";
		}
		if (confirmButton) {
			confirmButton.disabled = false;
			confirmButton.textContent = "Delete branch";
		}
	}
}

function hideBranchDeleteModal() {
	branchDeleteModalState = null;
	updateBranchDeleteModal();
}

function toLocalBranchName(remoteBranchName: string) {
	const slashIndex = remoteBranchName.indexOf("/");
	if (slashIndex < 0 || slashIndex === remoteBranchName.length-1) {
		return remoteBranchName;
	}

	return remoteBranchName.slice(slashIndex + 1);
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

	let actionError: unknown;
	try {
		for (const actionPath of actionPaths) {
			await runner(actionPath);
		}
	} catch (error) {
		actionError = error;
		throw error;
	} finally {
		for (const actionKey of actionKeys) {
			endGitAction(actionKey);
		}
		try {
			await gitDiff();
		} catch (refreshError) {
			if (!actionError) {
				throw refreshError;
			}
			console.error("Failed to refresh git diff after git action", refreshError);
		}
	}
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
	ensureModalKeyListener();

	if (gitSelectionKeyListenerBound) {
		return;
	}

	document.addEventListener("keydown", handleGitSelectionKeydown);
	gitSelectionKeyListenerBound = true;
}

function ensureModalKeyListener() {
	if (modalKeyListenerBound) {
		return;
	}

	document.addEventListener("keydown", handleModalKeydown);
	modalKeyListenerBound = true;
}

function handleModalKeydown(event: KeyboardEvent) {
	const activeModal = getActiveModal();
	if (!activeModal) {
		return;
	}

	if (event.key !== "Escape") {
		if (event.key !== "Tab") {
			return;
		}

		const focusableElements = getModalFocusableElements(activeModal);
		if (focusableElements.length === 0) {
			focusModalCard(activeModal);
			event.preventDefault();
			return;
		}

		const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
		if (currentIndex === -1) {
			focusableElements[event.shiftKey ? focusableElements.length - 1 : 0].focus({ preventScroll: true });
			event.preventDefault();
			return;
		}

		if (event.shiftKey && currentIndex === 0) {
			focusableElements[focusableElements.length - 1].focus({ preventScroll: true });
			event.preventDefault();
			return;
		}

		if (!event.shiftKey && currentIndex === focusableElements.length - 1) {
			focusableElements[0].focus({ preventScroll: true });
			event.preventDefault();
		}
		return;
	}

	if (discardModalState) {
		event.preventDefault();
		event.stopImmediatePropagation();
		hideDiscardModal();
		return;
	}

	if (branchSwitchModalState) {
		event.preventDefault();
		event.stopImmediatePropagation();
		hideBranchSwitchModal();
		return;
	}

	if (branchDeleteModalState) {
		event.preventDefault();
		event.stopImmediatePropagation();
		hideBranchDeleteModal();
	}
}

function focusModalInitialTarget(modalId: string, preferredSelector?: string) {
	requestAnimationFrame(() => {
		const modal = document.getElementById(modalId);
		if (!modal || modal.hasAttribute("hidden")) {
			return;
		}

		const preferredTarget = preferredSelector ? modal.querySelector(preferredSelector) as HTMLElement | null : null;
		if (preferredTarget) {
			preferredTarget.focus({ preventScroll: true });
			return;
		}

		focusModalCard(modal);
	});
}

function focusModalCard(modal: HTMLElement) {
	const modalCard = modal.querySelector(".modal-card") as HTMLElement | null;
	modalCard?.focus({ preventScroll: true });
}

function getActiveModal() {
	if (discardModalState) {
		return document.getElementById("DiscardModal") as HTMLElement | null;
	}

	if (branchSwitchModalState) {
		return document.getElementById("BranchSwitchModal") as HTMLElement | null;
	}

	if (branchDeleteModalState) {
		return document.getElementById("BranchDeleteModal") as HTMLElement | null;
	}

	return null;
}

function getModalFocusableElements(modal: HTMLElement) {
	return Array.from(modal.querySelectorAll<HTMLElement>([
		"button:not([disabled])",
		"[href]",
		"input:not([disabled])",
		"select:not([disabled])",
		"textarea:not([disabled])",
		"[tabindex]:not([tabindex='-1'])",
	].join(",")));
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
		pruneGitBranches: () => Promise<void>;
		discardGitFile: (filePath: string, description?: string, changeKey?: string) => Promise<void>;
		confirmDiscardGitFile: () => Promise<void>;
		cancelDiscardGitFile: () => void;
		promptBranchSwitch: (branchName: string, isRemote?: boolean) => void;
		confirmBranchSwitch: () => Promise<void>;
		cancelBranchSwitch: () => void;
		promptDeleteBranch: (branchName: string, forceDelete?: boolean) => void;
		confirmDeleteBranch: () => Promise<void>;
		cancelDeleteBranch: () => void;
		selectGitChange: (event: MouseEvent, key: string) => void;
    }
}
