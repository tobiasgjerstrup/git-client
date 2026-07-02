import './style.css';
import './app.css';
import './defaults.css';

import { escapeHtml, getGitBranches, getGitCommits, gitDiff, gitFetch } from './git';
import { beginGitAction, endGitAction, isAnyGitActionPending } from './gitActionState';
import { getGitSelectionTargets, handleGitSelectionClick, handleGitSelectionKeydown, type GitSelectionAction } from './gitSelectionState';

export let openedFolder: string | null = null;

type ThemeName = "aurora" | "midnight";

const themeStorageKey = "git-client-theme";
const recentRepositoriesStorageKey = "git-client-recent-repositories";
const maxRecentRepositoriesStorageKey = "git-client-max-recent-repositories";
const defaultMaxRecentRepositories = 6;
const minMaxRecentRepositories = 1;
const maxMaxRecentRepositories = 99;
let activeTheme: ThemeName = "aurora";

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
let settingsModalOpen = false;
let gitSelectionKeyListenerBound = false;
let modalKeyListenerBound = false;
let recentRepositoriesDropdownListenerBound = false;

type RecentRepository = {
	path: string;
	label: string;
	lastOpenedAt: number;
};

initializeTheme();

window.pickFolder = async function () {
	const folder = await window.go.main.App.PickFolder();
	if (!folder) {
		return;
	}

	if (folder) {
		addRecentRepository(folder);
	}
	openedFolder = folder;

	loadHtml();
};

window.openRecentRepository = async function (repoPath: string) {
	await window.go.main.App.SetRepositoryPath(repoPath);
	openedFolder = repoPath;
	addRecentRepository(repoPath);
	settingsModalOpen = false;
	loadHtml();
};

window.openSettings = function () {
	settingsModalOpen = true;
	updateSettingsModal();
}

window.closeSettings = function () {
	settingsModalOpen = false;
	updateSettingsModal();
}

window.selectTheme = function (themeName: ThemeName) {
	applyTheme(themeName);
	syncRecentRepositoriesPanel();
	updateSettingsModal();
}

window.clearRecentRepositories = function () {
	saveRecentRepositories([]);
	syncRecentRepositoriesPanel();
	updateSettingsModal();
}

window.removeRecentRepository = function (repoPath: string) {
	const nextRepositories = getRecentRepositories().filter((item) => item.path !== repoPath);
	saveRecentRepositories(nextRepositories);
	syncRecentRepositoriesPanel();
	updateSettingsModal();
}

window.setMaxRecentRepositories = function (value: number) {
	const normalizedValue = normalizeMaxRecentRepositories(value);
	window.localStorage.setItem(maxRecentRepositoriesStorageKey, String(normalizedValue));

	// Re-save to enforce the new cap immediately.
	saveRecentRepositories(getRecentRepositories());
	syncRecentRepositoriesPanel();
	updateSettingsModal();
}

window.stageGitFile = async function (filePath: string, changeKey?: string) {
	const targets = getActionTargetsOrFallback("stage", filePath, changeKey);
	await runGitAction(targets, async (targetPath) => {
		await window.go.main.App.StageGitFile(targetPath);
	});
}

window.stageSelectedGitFiles = async function () {
	const targets = getGitSelectionTargets("stage");
	if (targets.length === 0) {
		return;
	}

	await runGitAction(targets, async (targetPath) => {
		await window.go.main.App.StageGitFile(targetPath);
	});
}

window.unstageGitFile = async function (filePath: string, changeKey?: string) {
	const targets = getActionTargetsOrFallback("unstage", filePath, changeKey);
	await runGitAction(targets, async (targetPath) => {
		await window.go.main.App.UnstageGitFile(targetPath);
	});
}

window.unstageSelectedGitFiles = async function () {
	const targets = getGitSelectionTargets("unstage");
	if (targets.length === 0) {
		return;
	}

	await runGitAction(targets, async (targetPath) => {
		await window.go.main.App.UnstageGitFile(targetPath);
	});
}

window.resolveGitConflict = async function (filePath: string, strategy: "ours" | "theirs", changeKey?: string) {
	const targets = getActionTargetsOrFallback("stage", filePath, changeKey);
	await runGitAction(targets, async (targetPath) => {
		await window.go.main.App.ResolveGitConflict(targetPath, strategy);
	});
}

window.abortMerge = async function () {
	await window.go.main.App.AbortMerge();
	await window.refresh();
}

window.continueMerge = async function () {
	await window.go.main.App.ContinueMerge();
	await window.refresh();
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
		await window.refresh();
		document.getElementById("CommitChanges")!.removeAttribute("disabled");	
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
	} finally {
		await window.refresh();
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
	} finally {
		await window.refresh();
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

window.discardSelectedGitFiles = async function () {
	const targets = getGitSelectionTargets("discard");
	if (targets.length === 0) {
		return;
	}

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
	await runGitAction(targets.map((target) => ({ actionPath: target.filePath, label: target.description })), async (targetPath) => {
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
	} catch (error) {
		const message = toErrorMessage(error);
		if (isNonFastForwardPushError(message)) {
			const shouldPull = window.confirm("Push was rejected because your branch is behind origin. Pull now to integrate remote changes?");
			if (shouldPull) {
				await window.pullGitChanges();
			}
			return;
		}

		throw error;
	} finally {
		await getGitBranches();
		document.getElementById("PushButton")!.removeAttribute("disabled");	
	}
}

window.pruneGitBranches = async function () {
	try {
		document.getElementById("PruneButton")!.setAttribute("disabled", "");
		await window.go.main.App.GitPrune();	
	} finally {
		await window.refresh();
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
	let pullError: unknown;
	try {
		document.getElementById("PullChanges")!.setAttribute("disabled", "");
		await window.go.main.App.PullGitChanges();
	} catch (error) {
		pullError = error;
	} finally {
		await window.refresh();
		document.getElementById("PullChanges")!.removeAttribute("disabled");
	}

	if (!pullError) {
		return;
	}

	const pullErrorMessage = toErrorMessage(pullError);
	if (isMergeConflictError(pullErrorMessage)) {
		alert("Pull reported merge conflicts. They are now shown in the Changes panel, where you can resolve them with 'Use ours' or 'Use theirs'.");
		return;
	}

	throw pullError;
}

import appHtml from './app.html?raw';
import branchPanelHtml from './panels/branchPanel.html?raw';
import commitPanelHtml from './panels/commitPanel.html?raw';

function loadHtml() {
	document.querySelector('#app')!.innerHTML = appHtml;
	document.getElementById('BranchPanel')!.innerHTML = branchPanelHtml;
	document.getElementById('CommitPanel')!.innerHTML = commitPanelHtml;
	syncRecentRepositoriesPanel();
	ensureRecentRepositoriesDropdownListener();
	ensureGitSelectionKeyListener();
	updateSettingsModal();
	updateDiscardModal();
	updateBranchSwitchModal();
	updateBranchDeleteModal();
	window.refresh();
}

function showWelcomeView() {
	document.querySelector('#app')!.innerHTML = renderWelcomeShell();
	ensureModalKeyListener();
}

function syncRecentRepositoriesPanel() {
	const recentRepositoriesPanel = document.getElementById('RecentRepositoriesPanel');
	if (recentRepositoriesPanel) {
		recentRepositoriesPanel.innerHTML = renderRecentRepositoriesHtml();
	}
}

function updateSettingsModal() {
	const modal = document.getElementById("SettingsModal");
	const body = document.getElementById("SettingsModalBody");
	if (!modal || !body) {
		return;
	}

	if (settingsModalOpen) {
		modal.removeAttribute("hidden");
		body.innerHTML = renderSettingsContent();
		focusModalInitialTarget("SettingsModal", "#SettingsCloseButton");
	} else {
		modal.setAttribute("hidden", "");
		body.innerHTML = "";
	}
}

function getRecentRepositories(): RecentRepository[] {
	const storedValue = window.localStorage.getItem(recentRepositoriesStorageKey);
	if (!storedValue) {
		return [];
	}

	try {
		const parsed = JSON.parse(storedValue) as unknown[];
		const items = parsed
			.filter((item): item is RecentRepository => {
				if (!item || typeof item !== "object") {
					return false;
				}

				const candidate = item as Partial<RecentRepository>;
				return typeof candidate.path === "string" && typeof candidate.label === "string" && typeof candidate.lastOpenedAt === "number";
			})
			.map((item) => ({
				path: item.path,
				label: item.label || getRepositoryLabel(item.path),
				lastOpenedAt: item.lastOpenedAt,
			}))
			.sort((left, right) => right.lastOpenedAt - left.lastOpenedAt);

		const seenPaths = new Set<string>();
		return items.filter((item) => {
			if (seenPaths.has(item.path)) {
				return false;
			}
			seenPaths.add(item.path);
			return true;
		});
	} catch {
		return [];
	}
}

function saveRecentRepositories(repositories: RecentRepository[]) {
	const maxRecentRepositories = getMaxRecentRepositories();
	window.localStorage.setItem(recentRepositoriesStorageKey, JSON.stringify(repositories.slice(0, maxRecentRepositories)));
}

function getMaxRecentRepositories(): number {
	const storedValue = window.localStorage.getItem(maxRecentRepositoriesStorageKey);
	if (!storedValue) {
		return defaultMaxRecentRepositories;
	}

	const parsedValue = Number.parseInt(storedValue, 10);
	return normalizeMaxRecentRepositories(parsedValue);
}

function normalizeMaxRecentRepositories(value: number): number {
	if (!Number.isFinite(value)) {
		return defaultMaxRecentRepositories;
	}

	return Math.min(maxMaxRecentRepositories, Math.max(minMaxRecentRepositories, Math.round(value)));
}

function getRepositoryLabel(repoPath: string): string {
	const normalizedPath = repoPath.replace(/\\/g, "/").replace(/\/$/, "");
	const segments = normalizedPath.split("/").filter(Boolean);
	return segments[segments.length - 1] || repoPath;
}

function addRecentRepository(repoPath: string) {
	if (!repoPath) {
		return;
	}

	const nextRepositories = getRecentRepositories().filter((item) => item.path !== repoPath);
	nextRepositories.unshift({
		path: repoPath,
		label: getRepositoryLabel(repoPath),
		lastOpenedAt: Date.now(),
	});
	saveRecentRepositories(nextRepositories);
}

function renderWelcomeShell() {
	const recentRepositoriesHtml = renderRecentRepositoriesHtml();

	return `<section class="welcome-shell">
		<div class="welcome-panel surface-card">
			<p class="eyebrow">Desktop Git Workspace</p>
			<h1>Open a repository to get started</h1>
			<p class="welcome-copy">Track diffs, review branches, select multiple files like VS Code, and commit with a faster local workflow.</p>
			<div class="welcome-actions">
				<button class="button-primary" onclick="pickFolder()">Choose Repository</button>
				<button class="button-secondary" onclick="openSettings()">Settings</button>
			</div>
			<div class="recent-repositories">
				<div class="cluster-title">Recent Repositories</div>
				<div class="recent-repositories-list">
					${recentRepositoriesHtml}
				</div>
			</div>
		</div>
		<div id="SettingsModal" class="modal-backdrop" ${settingsModalOpen ? "" : "hidden"} onclick="if (event.target === this) closeSettings()">
			<div class="modal-card settings-modal-card" role="dialog" aria-modal="true" aria-labelledby="SettingsModalTitle" tabindex="-1" onclick="event.stopPropagation()">
				<div id="SettingsModalBody" class="settings-modal-content">${settingsModalOpen ? renderSettingsContent() : ""}</div>
			</div>
		</div>
	</section>`;
}

function renderSettingsContent() {
	const recentRepositories = getRecentRepositories();
	const maxRecentRepositories = getMaxRecentRepositories();
	const recentRepositoriesHtml = recentRepositories.length > 0
		? recentRepositories.map((repository) => `
			<article class="settings-recent-item">
				<h3>${escapeHtml(repository.label)}</h3>
				<p>${escapeHtml(repository.path)}</p>
				<div class="settings-recent-actions">
					<button type="button" class="button-secondary" onclick="openRecentRepository(${escapeHtml(JSON.stringify(repository.path))})">Open</button>
					<button type="button" class="button-danger" onclick="removeRecentRepository(${escapeHtml(JSON.stringify(repository.path))})">Remove</button>
				</div>
			</article>
		`).join("")
		: `<div class="empty-panel-state">No recent repositories saved yet.</div>`;

	return `<div class="settings-header">
		<div>
			<p class="eyebrow">Preferences</p>
			<h2 id="SettingsModalTitle">Settings</h2>
			<p class="welcome-copy">Tune the Git client behavior for your workflow.</p>
		</div>
		<button id="SettingsCloseButton" type="button" class="button-secondary" onclick="closeSettings()">Close</button>
	</div>

	<div class="settings-grid">
		<div class="settings-card">
			<div class="settings-label">Theme</div>
			<div class="settings-row">
				<button type="button" class="${activeTheme === "aurora" ? "button-primary" : "button-secondary"}" onclick="selectTheme('aurora')">Aurora</button>
				<button type="button" class="${activeTheme === "midnight" ? "button-primary" : "button-secondary"}" onclick="selectTheme('midnight')">Midnight</button>
			</div>
		</div>

		<div class="settings-card">
			<div class="settings-label">Data</div>
			<div class="settings-row">
				<span>${recentRepositories.length} saved recent repos</span>
				<button type="button" class="button-secondary" onclick="clearRecentRepositories()">Clear Recent Repositories</button>
			</div>
			<div class="settings-row">
				<label for="MaxRecentRepositoriesInput">Max stored recent repos</label>
				<input
					id="MaxRecentRepositoriesInput"
					type="number"
					min="${minMaxRecentRepositories}"
					max="${maxMaxRecentRepositories}"
					value="${maxRecentRepositories}"
					onchange="setMaxRecentRepositories(Number(this.value))"
				>
			</div>
		</div>
	</div>

	<div class="settings-card">
		<div class="settings-label">Recent Repositories</div>
		<div class="settings-recent-list">
			${recentRepositoriesHtml}
		</div>
	</div>`;
}

function renderRecentRepositoriesHtml() {
	const recentRepositories = getRecentRepositories();
	const recentRepositoriesHtml = recentRepositories.length > 0
		? recentRepositories.map((repository) => `
			<button type="button" class="recent-repository-item${openedFolder === repository.path ? " recent-repository-item-current" : ""}"${openedFolder === repository.path ? ' aria-current="page" disabled' : ''} onclick="openRecentRepository(${escapeHtml(JSON.stringify(repository.path))})">
				<span class="recent-repository-name">${escapeHtml(repository.label)}</span>
				<span class="recent-repository-path">${escapeHtml(repository.path)}</span>
				${openedFolder === repository.path ? '<span class="recent-repository-current">Currently open</span>' : ''}
			</button>
		`).join("")
		: `<div class="recent-repositories-empty">No recent repositories yet.</div>`;

	return recentRepositoriesHtml;
}

function initializeTheme() {
	const storedTheme = window.localStorage.getItem(themeStorageKey);
	if (storedTheme === "midnight") {
		applyTheme("midnight");
		return;
	}

	applyTheme("aurora");
}

function applyTheme(themeName: ThemeName) {
	activeTheme = themeName;
	document.documentElement.dataset.theme = themeName;
	window.localStorage.setItem(themeStorageKey, themeName);
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error ?? "");
}

function isNonFastForwardPushError(errorMessage: string): boolean {
	const message = errorMessage.toLowerCase();
	return message.includes("non-fast-forward") || message.includes("failed to push some refs");
}

function isMergeConflictError(errorMessage: string): boolean {
	const message = errorMessage.toLowerCase();
	return message.includes("conflict") || message.includes("automatic merge failed") || message.includes("merge conflict");
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
	targets: Array<{ actionPath: string; label?: string }>,
	runner: (targetPath: string) => Promise<void>,
) {
	const actionKeys: string[] = [];
	const actionPaths: string[] = [];

	for (const target of targets) {
		const actionKey = beginGitAction(target.actionPath);
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
	let refreshError: unknown;
	try {
		for (const actionPath of actionPaths) {
			await runner(actionPath);
		}
	} catch (error) {
		actionError = error;
	} finally {
		try {
			await gitDiff();
		} catch (error) {
			refreshError = error;
			console.error("Failed to refresh git diff after git action", error);
		} finally {
			for (const actionKey of actionKeys) {
				endGitAction(actionKey);
			}
		}
	}

	if (actionError) {
		throw actionError;
	}
	if (refreshError) {
		throw refreshError;
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

function ensureRecentRepositoriesDropdownListener() {
	if (recentRepositoriesDropdownListenerBound) {
		return;
	}

	document.addEventListener("click", handleRecentRepositoriesDropdownClick, true);
	document.addEventListener("keydown", handleRecentRepositoriesDropdownKeydown, true);
	recentRepositoriesDropdownListenerBound = true;
}

function handleRecentRepositoriesDropdownClick(event: MouseEvent) {
	const dropdown = getRecentRepositoriesDropdown();
	if (!dropdown || !dropdown.open) {
		return;
	}

	const target = event.target as Node | null;
	if (target && dropdown.contains(target)) {
		return;
	}

	dropdown.open = false;
}

function handleRecentRepositoriesDropdownKeydown(event: KeyboardEvent) {
	if (event.key !== "Escape") {
		return;
	}

	const dropdown = getRecentRepositoriesDropdown();
	if (!dropdown || !dropdown.open || getActiveModal()) {
		return;
	}

	event.preventDefault();
	event.stopImmediatePropagation();
	dropdown.open = false;
	dropdown.querySelector("summary")?.focus({ preventScroll: true });
}

function getRecentRepositoriesDropdown() {
	return document.querySelector(".recent-repositories-dropdown") as HTMLDetailsElement | null;
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
		return;
	}

	if (settingsModalOpen) {
		event.preventDefault();
		event.stopImmediatePropagation();
		window.closeSettings();
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

	if (settingsModalOpen) {
		return document.getElementById("SettingsModal") as HTMLElement | null;
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
	showWelcomeView();
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
		stageSelectedGitFiles: () => Promise<void>;
		unstageSelectedGitFiles: () => Promise<void>;
		discardSelectedGitFiles: () => Promise<void>;
		resolveGitConflict: (filePath: string, strategy: "ours" | "theirs", changeKey?: string) => Promise<void>;
		abortMerge: () => Promise<void>;
		openRecentRepository: (repoPath: string) => Promise<void>;
		openSettings: () => void;
		closeSettings: () => void;
		selectTheme: (themeName: ThemeName) => void;
		clearRecentRepositories: () => void;
		removeRecentRepository: (repoPath: string) => void;
		setMaxRecentRepositories: (value: number) => void;
    }
}
