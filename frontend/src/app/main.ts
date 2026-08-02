import './styles/style.css';
import './styles/app.css';
import './styles/defaults.css';

import { getGitBranches, getGitCommits, gitDiff, gitFetch, toggleArchivedBranches } from '../features/git/git';
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

export type ThemeName = "aurora" | "midnight" | "purple";
export type ArchiveMethod = "none" | "folder" | "folder-no-delete";
type FrontendLogLevel = "debug" | "info" | "warn" | "error";

const themeStorageKey = "git-client-theme";
const consoleVisibilityStorageKey = "git-client-console-visible";
const gitCommandStorageKey = "git-client-git-command";
const gitRemoteCommandStorageKey = "git-client-git-remote-command";
const archiveMethodStorageKey = "git-client-archive-method";
const maxStageFileSizeStorageKey = "git-client-max-stage-file-size";
let activeTheme: ThemeName = "aurora";
let isFrontendConsoleVisible = false;
let gitCommand = "git";
let gitRemoteCommand = "git";
let activeArchiveMethod: ArchiveMethod = "none";
let maxStageFileSizeMb = 0;

let settingsModalOpen = false;
let gitSelectionKeyListenerBound = false;
let dropdownListenerBound = false;

const modalManager = new ModalManager({
	isSettingsModalOpen: () => settingsModalOpen,
	closeSettingsModal: () => window.closeSettings(),
});

initializeTheme();
initializeConsoleVisibility();
initializeGitCommand();
initializeArchiveMethod();
initializeMaxStageFileSize();
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

window.setGitCommand = function (command: string) {
	gitCommand = command || "git";
	window.localStorage.setItem(gitCommandStorageKey, gitCommand);
	window.go.main.App.SetGitCommand(gitCommand);
}

window.setGitRemoteCommand = function (command: string) {
	gitRemoteCommand = command || "git";
	window.localStorage.setItem(gitRemoteCommandStorageKey, gitRemoteCommand);
	window.go.main.App.SetGitRemoteCommand(gitRemoteCommand);
}

window.setArchiveMethod = function (method: ArchiveMethod) {
	activeArchiveMethod = method;
	window.localStorage.setItem(archiveMethodStorageKey, method);
	updateSettingsModal();
}

window.setMaxStageFileSize = function (mb: number) {
	maxStageFileSizeMb = normalizeMaxStageFileSizeMb(mb);
	window.localStorage.setItem(maxStageFileSizeStorageKey, String(maxStageFileSizeMb));
	window.go.main.App.SetMaxStageFileSize(Math.round(maxStageFileSizeMb * 1024 * 1024));
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

window.promptArchiveBranch = function (branchName: string, isRemote?: boolean) {
	if (activeArchiveMethod === "none") {
		modalManager.openBranchArchiveInfo(branchName);
		return;
	}

	modalManager.openBranchArchiveConfirm(branchName, activeArchiveMethod === "folder", isRemote);
}

window.confirmArchiveBranch = async function () {
	const state = modalManager.getBranchArchiveConfirmModalState();
	if (!state) {
		return;
	}

	const { branchName, deleteRemote, remote } = state;
	modalManager.closeBranchArchiveConfirm();

	if (remote) {
		await window.go.main.App.ArchiveRemoteGitBranch(branchName, deleteRemote);
	} else {
		await window.go.main.App.ArchiveGitBranch(branchName, deleteRemote);
	}
	await window.refresh();
}

window.cancelArchiveBranch = function () {
	modalManager.closeBranchArchiveInfo();
	modalManager.closeBranchArchiveConfirm();
}

window.toggleBranchContextMenu = function (cardEl: HTMLElement) {
	const clickedDropdown = cardEl.querySelector('.branch-menu-dropdown') as HTMLDetailsElement | null;
	const openDropdowns = document.querySelectorAll<HTMLDetailsElement>(".branch-menu-dropdown[open]");
	for (const dropdown of openDropdowns) {
		if (dropdown !== clickedDropdown) {
			dropdown.open = false;
		}
	}
	if (clickedDropdown) {
		clickedDropdown.open = !clickedDropdown.open;
	}
}

window.toggleArchivedBranches = toggleArchivedBranches;

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
		if (isLargeFilePushError(message)) {
			window.alert("Push rejected: Some files exceed GitHub's file size limits.\n\nFiles larger than 100 MB are not allowed. Files over 50 MB trigger warnings.\n\nConsider Git LFS or reduce file sizes.");
			return;
		}
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

/**
 * Loads the application interface and synchronizes its initial workspace state.
 */
function loadHtml() {
	document.querySelector('#app')!.innerHTML = appHtml;
	document.getElementById('BranchPanel')!.innerHTML = branchPanelHtml;
	document.getElementById('CommitPanel')!.innerHTML = commitPanelHtml;
	updateWorkspaceHeader();
	syncRecentRepositoriesPanel();
	ensureDropdownListeners();
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

/**
 * Builds the state required to render the application views.
 *
 * @returns The current repository, workspace, settings, logging, Git, and archive configuration.
 */
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
		gitCommand,
		gitRemoteCommand,
		archiveMethod: activeArchiveMethod,
		maxStageFileSizeMb,
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
	} else if (storedTheme === "purple") {
		applyTheme("purple");
		return;
	}

	applyTheme("aurora");
}

function initializeConsoleVisibility() {
	isFrontendConsoleVisible = window.localStorage.getItem(consoleVisibilityStorageKey) === "1";
}

/**
 * Loads persisted Git command settings and applies them to the backend.
 */
function initializeGitCommand() {
	const stored = window.localStorage.getItem(gitCommandStorageKey);
	if (stored) {
		gitCommand = stored;
	}
	window.go.main.App.SetGitCommand(gitCommand);

	const storedRemote = window.localStorage.getItem(gitRemoteCommandStorageKey);
	if (storedRemote) {
		gitRemoteCommand = storedRemote;
	}
	window.go.main.App.SetGitRemoteCommand(gitRemoteCommand);
}

/**
 * Loads the persisted branch archive method into the active archive configuration.
 */
function initializeArchiveMethod() {
	const stored = window.localStorage.getItem(archiveMethodStorageKey);
	if (stored === "folder" || stored === "folder-no-delete" || stored === "none") {
		activeArchiveMethod = stored;
	}
}

function normalizeMaxStageFileSizeMb(value: number): number {
	if (!Number.isSafeInteger(value) || value < 0) {
		return 0;
	}
	return value;
}

function initializeMaxStageFileSize() {
	const stored = window.localStorage.getItem(maxStageFileSizeStorageKey);
	if (stored) {
		const parsed = Number(stored);
		maxStageFileSizeMb = normalizeMaxStageFileSizeMb(Number.isSafeInteger(parsed) ? parsed : NaN);
		if (!Number.isSafeInteger(parsed) || parsed < 0) {
			window.localStorage.setItem(maxStageFileSizeStorageKey, "0");
		}
		window.go.main.App.SetMaxStageFileSize(Math.round(maxStageFileSizeMb * 1024 * 1024));
	}
}

/**
 * Updates the log console panel visibility to match the current frontend console setting.
 */
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

function isLargeFilePushError(errorMessage: string): boolean {
	const message = errorMessage.toLowerCase();
	return message.includes("gh001") && (message.includes("larger than github") || message.includes("exceeds github"));
}

function isStageFileSizeError(errorMessage: string): boolean {
	return errorMessage.toLowerCase().includes("exceeds max stage file size");
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
		const message = toErrorMessage(actionError);
		if (isStageFileSizeError(message)) {
			window.alert(message + "\n\nYou can adjust or disable this limit in the Staging section of Settings.");
			return;
		}
		throw actionError;
	}
	if (refreshError) {
		throw refreshError;
	}
}

/**
 * Ensures the Git selection keyboard listener is registered once.
 */
function ensureGitSelectionKeyListener() {
	if (gitSelectionKeyListenerBound) {
		return;
	}

	document.addEventListener("keydown", handleGitSelectionKeydown);
	gitSelectionKeyListenerBound = true;
}
/**
 * Installs the document listeners used to close open dropdowns when needed.
 */
function ensureDropdownListeners() {
	if (dropdownListenerBound) {
		return;
	}

	document.addEventListener("click", handleDropdownClickOutside, true);
	document.addEventListener("keydown", handleDropdownKeydown, true);
	dropdownListenerBound = true;
}

/**
 * Closes open repository and branch dropdowns when a click occurs outside them.
 *
 * @param event - The mouse event used to identify the clicked element
 */
function handleDropdownClickOutside(event: MouseEvent) {
	const target = event.target as Node | null;

	const reposDropdown = getRecentRepositoriesDropdown();
	if (reposDropdown && reposDropdown.open && target && !reposDropdown.contains(target)) {
		reposDropdown.open = false;
	}

	const openBranchDropdowns = document.querySelectorAll<HTMLDetailsElement>(".branch-menu-dropdown[open]");
	for (const dropdown of openBranchDropdowns) {
		if (target && !dropdown.contains(target)) {
			dropdown.open = false;
		}
	}
}

/**
 * Closes the open repository or branch dropdown when the Escape key is pressed.
 *
 * @param event - The keyboard event to handle
 */
function handleDropdownKeydown(event: KeyboardEvent) {
	if (event.key !== "Escape") {
		return;
	}

	const reposDropdown = getRecentRepositoriesDropdown();
	if (reposDropdown && reposDropdown.open && !modalManager.hasActiveModal()) {
		event.preventDefault();
		event.stopImmediatePropagation();
		reposDropdown.open = false;
		reposDropdown.querySelector("summary")?.focus({ preventScroll: true });
		return;
	}

	const openBranchDropdown = document.querySelector<HTMLDetailsElement>(".branch-menu-dropdown[open]");
	if (openBranchDropdown && !modalManager.hasActiveModal()) {
		event.preventDefault();
		event.stopImmediatePropagation();
		openBranchDropdown.open = false;
		openBranchDropdown.querySelector("summary")?.focus({ preventScroll: true });
	}
}

/**
 * Retrieves the recent repositories dropdown element.
 *
 * @returns The recent repositories dropdown, or `null` if it is not present.
 */
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
		promptArchiveBranch: (branchName: string, isRemote?: boolean) => void;
		confirmArchiveBranch: () => Promise<void>;
		cancelArchiveBranch: () => void;
		toggleBranchContextMenu: (cardEl: HTMLElement) => void;
		toggleArchivedBranches: () => void;
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
		setGitCommand: (command: string) => void;
		setGitRemoteCommand: (command: string) => void;
		setArchiveMethod: (method: ArchiveMethod) => void;
		setMaxStageFileSize: (mb: number) => void;
		clearFrontendLogs: () => void;
		toggleLogConsole: () => void;
    }
}
