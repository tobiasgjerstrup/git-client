import './styles/style.css';
import './styles/app.css';
import './styles/defaults.css';

import { getGitBranches, getGitCommits, gitDiff, gitFetch } from '../features/git/git';
import { beginGitAction, endGitAction, isAnyGitActionPending } from '../features/git/gitActionState';
import { getGitSelectionTargets, handleGitSelectionClick, handleGitSelectionKeydown, type GitSelectionAction } from '../features/git/gitSelectionState';
import {
	addRecentRepository,
	clearRecentRepositories,
	getMaxRecentRepositories,
	getRecentRepositories,
	removeRecentRepository,
	setMaxRecentRepositoriesLimit,
	MIN_MAX_RECENT_REPOSITORIES,
	MAX_MAX_RECENT_REPOSITORIES,
} from '../features/recent/recentRepositories';
import {
	renderRecentRepositoriesHtml,
	renderSettingsContent,
	renderWelcomeShell,
} from '../features/settings/settingsViews';
import { ModalManager } from '../features/modals/modals';
import {
	clearFrontendLogConsole,
	getFrontendLogMinimumLevel,
	initializeFrontendConsole,
	renderFrontendLogConsole,
	setFrontendLogMinimumLevel,
	toggleFrontendLogConsole,
} from '../features/logs/frontendConsole';

export let openedFolder: string | null = null;

type ThemeName = "aurora" | "midnight";
type FrontendLogLevel = "debug" | "info" | "warn" | "error";

const themeStorageKey = "git-client-theme";
const consoleVisibilityStorageKey = "git-client-console-visible";
let activeTheme: ThemeName = "aurora";
let isFrontendConsoleVisible = false;

let settingsModalOpen = false;
let gitSelectionKeyListenerBound = false;
let recentRepositoriesDropdownListenerBound = false;

const modalManager = new ModalManager({
	isSettingsModalOpen: () => settingsModalOpen,
	closeSettingsModal: () => window.closeSettings(),
});

initializeTheme();
initializeConsoleVisibility();
initializeFrontendConsole();

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
	clearRecentRepositories();
	syncRecentRepositoriesPanel();
	updateSettingsModal();
}

window.removeRecentRepository = function (repoPath: string) {
	removeRecentRepository(repoPath);
	syncRecentRepositoriesPanel();
	updateSettingsModal();
}

window.setMaxRecentRepositories = function (value: number) {
	setMaxRecentRepositoriesLimit(value);
	syncRecentRepositoriesPanel();
	updateSettingsModal();
}

window.setFrontendConsoleEnabled = function (enabled: boolean) {
	isFrontendConsoleVisible = enabled;
	window.localStorage.setItem(consoleVisibilityStorageKey, enabled ? "1" : "0");
	syncFrontendConsoleVisibility();
	updateSettingsModal();
}

window.setFrontendLogMinimumLevel = function (level: FrontendLogLevel) {
	setFrontendLogMinimumLevel(level);
	updateSettingsModal();
}

window.clearFrontendLogs = function () {
	clearFrontendLogConsole();
}

window.toggleLogConsole = function () {
	toggleFrontendLogConsole();
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
	modalManager.openBranchSwitch(branchName, isRemote);
}

window.confirmBranchSwitch = async function () {
	const branchSwitchModalState = modalManager.getBranchSwitchModalState();
	if (!branchSwitchModalState) {
		return;
	}

	const { targetBranchName } = branchSwitchModalState;
	modalManager.closeBranchSwitch();

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
	modalManager.closeBranchSwitch();
}

window.promptDeleteBranch = function (branchName: string, forceDelete?: boolean) {
	modalManager.openBranchDelete(branchName, forceDelete);
}

window.confirmDeleteBranch = async function () {
	const branchDeleteModalState = modalManager.getBranchDeleteModalState();
	if (!branchDeleteModalState) {
		return;
	}

	const { branchName, forceDelete } = branchDeleteModalState;
	modalManager.closeBranchDelete();

	try {
		await window.go.main.App.DeleteGitBranch(branchName, forceDelete);
		await window.refresh();
	} catch (error) {
		throw error;
	}
	}

window.cancelDeleteBranch = function () {
	modalManager.closeBranchDelete();
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
		console.info(`${label} took ${(end - start).toFixed(2)} ms`);
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
	modalManager.openDiscard(targets.map((target) => ({
		filePath: target.actionPath,
		description: target.label,
	})), isAnyGitActionPending);
}

window.discardSelectedGitFiles = async function () {
	const targets = getGitSelectionTargets("discard");
	if (targets.length === 0) {
		return;
	}

	modalManager.openDiscard(targets.map((target) => ({
		filePath: target.actionPath,
		description: target.label,
	})), isAnyGitActionPending);
}

window.confirmDiscardGitFile = async function () {
	const discardModalState = modalManager.getDiscardModalState();
	if (!discardModalState) {
		return;
	}

	const targets = discardModalState.items;
	modalManager.closeDiscard(isAnyGitActionPending);
	await runGitAction(targets.map((target) => ({ actionPath: target.filePath, label: target.description })), async (targetPath) => {
		await window.go.main.App.DiscardGitFile(targetPath);
	});
}

window.selectGitChange = function (event: MouseEvent, key: string) {
	handleGitSelectionClick(event, key);
}

window.cancelDiscardGitFile = function () {
	modalManager.closeDiscard(isAnyGitActionPending);
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

import appHtml from '../app.html?raw';
import branchPanelHtml from '../panels/branchPanel.html?raw';
import commitPanelHtml from '../panels/commitPanel.html?raw';

function loadHtml() {
	document.querySelector('#app')!.innerHTML = appHtml;
	document.getElementById('BranchPanel')!.innerHTML = branchPanelHtml;
	document.getElementById('CommitPanel')!.innerHTML = commitPanelHtml;
	updateWorkspaceHeader();
	syncRecentRepositoriesPanel();
	ensureRecentRepositoriesDropdownListener();
	modalManager.ensureKeyListener();
	ensureGitSelectionKeyListener();
	updateSettingsModal();
	modalManager.refreshModals(isAnyGitActionPending);
	syncFrontendConsoleVisibility();
	renderFrontendLogConsole();
	window.refresh();
}

function showWelcomeView() {
	document.querySelector('#app')!.innerHTML = renderWelcomeShell(getViewRenderContext());
	modalManager.ensureKeyListener();
	syncFrontendConsoleVisibility();
	renderFrontendLogConsole();
}

function syncRecentRepositoriesPanel() {
	const recentRepositoriesPanel = document.getElementById('RecentRepositoriesPanel');
	if (recentRepositoriesPanel) {
		recentRepositoriesPanel.innerHTML = renderRecentRepositoriesHtml(getViewRenderContext());
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
		body.innerHTML = renderSettingsContent(getViewRenderContext());
		focusModalInitialTarget("SettingsModal", "#SettingsCloseButton");
	} else {
		modal.setAttribute("hidden", "");
		body.innerHTML = "";
	}
}

function getViewRenderContext() {
	const recentRepositories = getRecentRepositories();
	return {
		recentRepositories,
		openedFolder,
		settingsModalOpen,
		activeTheme,
		showFrontendConsole: isFrontendConsoleVisible,
		frontendLogMinimumLevel: getFrontendLogMinimumLevel(),
		minMaxRecentRepositories: MIN_MAX_RECENT_REPOSITORIES,
		maxMaxRecentRepositories: MAX_MAX_RECENT_REPOSITORIES,
		maxRecentRepositories: getMaxRecentRepositories(),
	};
}

function updateWorkspaceHeader() {
	const title = document.getElementById("WorkspaceTitle");
	const workspacePath = document.getElementById("WorkspacePath");
	if (!title || !workspacePath) {
		return;
	}

	if (!openedFolder) {
		title.textContent = "Git Client";
		workspacePath.textContent = "";
		workspacePath.title = "";
		workspacePath.setAttribute("hidden", "");
		return;
	}

	title.textContent = getRepositoryName(openedFolder);
	workspacePath.textContent = openedFolder;
	workspacePath.title = openedFolder;
	workspacePath.removeAttribute("hidden");
}

function getRepositoryName(repoPath: string) {
	const normalizedPath = repoPath.replace(/\\+$/g, "").replace(/\/+$/g, "");
	const segments = normalizedPath.split(/[\\/]/).filter(Boolean);
	return segments[segments.length - 1] ?? repoPath;
}

function initializeTheme() {
	const storedTheme = window.localStorage.getItem(themeStorageKey);
	if (storedTheme === "midnight") {
		applyTheme("midnight");
		return;
	}

	applyTheme("aurora");
}

function initializeConsoleVisibility() {
	isFrontendConsoleVisible = window.localStorage.getItem(consoleVisibilityStorageKey) === "1";
}

function syncFrontendConsoleVisibility() {
	const panel = document.getElementById("LogConsolePanel");
	if (!panel) {
		return;
	}

	if (isFrontendConsoleVisible) {
		panel.removeAttribute("hidden");
		return;
	}

	panel.setAttribute("hidden", "");
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

function ensureGitSelectionKeyListener() {
	if (gitSelectionKeyListenerBound) {
		return;
	}

	document.addEventListener("keydown", handleGitSelectionKeydown);
	gitSelectionKeyListenerBound = true;
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
	if (!dropdown || !dropdown.open || modalManager.hasActiveModal()) {
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
		setFrontendConsoleEnabled: (enabled: boolean) => void;
		setFrontendLogMinimumLevel: (level: FrontendLogLevel) => void;
		clearFrontendLogs: () => void;
		toggleLogConsole: () => void;
    }
}
