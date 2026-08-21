import './styles/style.css';
import './styles/app.css';
import './styles/defaults.css';

import { getGitBranches, getGitCommits, gitDiff, gitFetch, toggleArchivedBranches } from '../features/git/git';
import { getFolderActionTargets, toggleGitFolder, expandAllGitFolders, collapseAllGitFolders, setFolderGroupingThresholds } from '../features/git/gitTree';
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
const folderGroupingDirectThresholdStorageKey = "git-client-folder-group-direct-threshold";
const folderGroupingSubtreeThresholdStorageKey = "git-client-folder-group-subtree-threshold";
let activeTheme: ThemeName = "aurora";
let isFrontendConsoleVisible = false;
let gitCommand = "git";
let gitRemoteCommand = "git";
let activeArchiveMethod: ArchiveMethod = "none";
let maxStageFileSizeMb = 0;
let folderGroupingDirectThreshold = 5;
let folderGroupingSubtreeThreshold = 5;

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
initializeFolderGroupingThresholds();
initializeFrontendConsole();

/**
 * Opens a folder picker, remembers the selected repository, and loads the UI for it.
 */
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

/**
 * Opens a repository from the recent list and reloads the workspace view.
 *
 * @param repoPath - The path of the repository to open.
 */
window.openRecentRepository = async function (repoPath: string) {
	await window.go.main.App.SetRepositoryPath(repoPath);
	openedFolder = repoPath;
	addRecentRepository(repoPath);
	settingsModalOpen = false;
	loadHtml();
};

/**
 * Opens the settings modal.
 */
window.openSettings = function () {
	settingsModalOpen = true;
	updateSettingsModal();
}

/**
 * Closes the settings modal.
 */
window.closeSettings = function () {
	settingsModalOpen = false;
	updateSettingsModal();
}

/**
 * Changes the application theme and refreshes dependent UI.
 *
 * @param themeName - The selected theme name.
 */
window.selectTheme = function (themeName: ThemeName) {
	applyTheme(themeName);
	syncRecentRepositoriesPanel();
	updateSettingsModal();
}

/**
 * Clears the list of recent repositories from storage and the UI.
 */
window.clearRecentRepositories = function () {
	clearRecentRepositories();
	syncRecentRepositoriesPanel();
	updateSettingsModal();
}

/**
 * Removes one repository from the recent list and updates the UI.
 *
 * @param repoPath - Path of the repository to remove.
 */
window.removeRecentRepository = function (repoPath: string) {
	removeRecentRepository(repoPath);
	syncRecentRepositoriesPanel();
	updateSettingsModal();
}

/**
 * Sets the maximum number of recent repositories to retain.
 *
 * @param value - The new maximum recent repository count.
 */
window.setMaxRecentRepositories = function (value: number) {
	setMaxRecentRepositoriesLimit(value);
	syncRecentRepositoriesPanel();
	updateSettingsModal();
}

/**
 * Toggles the frontend console visibility setting and updates storage.
 *
 * @param enabled - Whether the frontend console should be visible.
 */
window.setFrontendConsoleEnabled = function (enabled: boolean) {
	isFrontendConsoleVisible = enabled;
	window.localStorage.setItem(consoleVisibilityStorageKey, enabled ? "1" : "0");
	syncFrontendConsoleVisibility();
	updateSettingsModal();
}

/**
 * Sets the minimum displayed log level for the frontend console.
 *
 * @param level - The selected log level.
 */
window.setFrontendLogMinimumLevel = function (level: FrontendLogLevel) {
	setFrontendLogMinimumLevel(level);
	updateSettingsModal();
}

/**
 * Updates the Git executable command in settings and backend state.
 *
 * @param command - The Git command to use.
 */
window.setGitCommand = function (command: string) {
	gitCommand = command || "git";
	window.localStorage.setItem(gitCommandStorageKey, gitCommand);
	window.go.main.App.SetGitCommand(gitCommand);
}

/**
 * Updates the remote Git executable command in settings and backend state.
 *
 * @param command - The remote Git command to use.
 */
window.setGitRemoteCommand = function (command: string) {
	gitRemoteCommand = command || "git";
	window.localStorage.setItem(gitRemoteCommandStorageKey, gitRemoteCommand);
	window.go.main.App.SetGitRemoteCommand(gitRemoteCommand);
}

/**
 * Sets the preferred archive method for branch cleanup.
 *
 * @param method - The archive method to use.
 */
window.setArchiveMethod = function (method: ArchiveMethod) {
	activeArchiveMethod = method;
	window.localStorage.setItem(archiveMethodStorageKey, method);
	updateSettingsModal();
}

/**
 * Updates the maximum stage file size in settings and backend limits.
 *
 * @param mb - Maximum allowed file size in megabytes.
 */
window.setMaxStageFileSize = function (mb: number) {
	maxStageFileSizeMb = normalizeMaxStageFileSizeMb(mb);
	window.localStorage.setItem(maxStageFileSizeStorageKey, String(maxStageFileSizeMb));
	window.go.main.App.SetMaxStageFileSize(Math.round(maxStageFileSizeMb * 1024 * 1024));
	updateSettingsModal();
}

/**
 * Updates the minimum direct-files folder grouping threshold.
 *
 * @param value - Minimum number of files directly inside a directory (0 = never group).
 */
window.setFolderGroupingDirectThreshold = function (value: number) {
	folderGroupingDirectThreshold = normalizeFolderGroupingThreshold(value);
	window.localStorage.setItem(folderGroupingDirectThresholdStorageKey, String(folderGroupingDirectThreshold));
	applyFolderGroupingThresholds();
}

/**
 * Updates the minimum subtree-files folder grouping threshold.
 *
 * @param value - Minimum number of files anywhere inside a directory (0 = never group).
 */
window.setFolderGroupingSubtreeThreshold = function (value: number) {
	folderGroupingSubtreeThreshold = normalizeFolderGroupingThreshold(value);
	window.localStorage.setItem(folderGroupingSubtreeThresholdStorageKey, String(folderGroupingSubtreeThreshold));
	applyFolderGroupingThresholds();
}

/**
 * Applies the current folder grouping thresholds and refreshes the view.
 */
function applyFolderGroupingThresholds() {
	setFolderGroupingThresholds(folderGroupingDirectThreshold, folderGroupingSubtreeThreshold);
	updateSettingsModal();
	if (openedFolder) {
		gitDiff();
	}
}

/**
 * Clears all frontend console logs.
 */
window.clearFrontendLogs = function () {
	clearFrontendLogConsole();
}

/**
 * Toggles the frontend log console display.
 */
window.toggleLogConsole = function () {
	toggleFrontendLogConsole();
}

/**
 * Stages a single file in the repository.
 *
 * @param filePath - The file to stage.
 * @param changeKey - Optional selection key for Git action state.
 */
window.stageGitFile = async function (filePath: string, changeKey?: string) {
	const targets = getActionTargetsOrFallback("stage", filePath, changeKey);
	await runGitAction(targets, async (targetPath) => {
		await window.go.main.App.StageGitFile(targetPath);
	});
}

/**
 * Stages the currently selected Git files.
 */
window.stageSelectedGitFiles = async function () {
	const targets = getGitSelectionTargets("stage");
	if (targets.length === 0) {
		return;
	}

	await runGitAction(targets, async (targetPath) => {
		await window.go.main.App.StageGitFile(targetPath);
	});
}

/**
 * Unstages a single file in the repository.
 *
 * @param filePath - The file to unstage.
 * @param changeKey - Optional selection key for Git action state.
 */
window.unstageGitFile = async function (filePath: string, changeKey?: string) {
	const targets = getActionTargetsOrFallback("unstage", filePath, changeKey);
	await runGitAction(targets, async (targetPath) => {
		await window.go.main.App.UnstageGitFile(targetPath);
	});
}

/**
 * Unstages the currently selected Git files.
 */
window.unstageSelectedGitFiles = async function () {
	const targets = getGitSelectionTargets("unstage");
	if (targets.length === 0) {
		return;
	}

	await runGitAction(targets, async (targetPath) => {
		await window.go.main.App.UnstageGitFile(targetPath);
	});
}

/**
 * Resolves a merge conflict for a file using the specified strategy.
 *
 * @param filePath - The conflicted file path.
 * @param strategy - The conflict resolution strategy to apply.
 * @param changeKey - Optional selection key for Git action state.
 */
window.resolveGitConflict = async function (filePath: string, strategy: "ours" | "theirs", changeKey?: string) {
	const targets = getActionTargetsOrFallback("stage", filePath, changeKey);
	await runGitAction(targets, async (targetPath) => {
		await window.go.main.App.ResolveGitConflict(targetPath, strategy);
	});
}

/**
 * Stages every change inside the given folder.
 *
 * @param folderPath - The full directory path to stage.
 */
window.stageGitFolder = async function (folderPath: string) {
	const targets = getFolderActionTargets(folderPath, "stage");
	if (targets.length === 0) {
		return;
	}

	await runGitAction(targets, async (targetPath) => {
		await window.go.main.App.StageGitFile(targetPath);
	});
}

/**
 * Unstages every staged change inside the given folder.
 *
 * @param folderPath - The full directory path to unstage.
 */
window.unstageGitFolder = async function (folderPath: string) {
	const targets = getFolderActionTargets(folderPath, "unstage");
	if (targets.length === 0) {
		return;
	}

	await runGitAction(targets, async (targetPath) => {
		await window.go.main.App.UnstageGitFile(targetPath);
	});
}

/**
 * Toggles the expanded/collapsed state of a folder in the changes tree.
 *
 * @param folderPath - The full directory path to toggle.
 */
window.toggleGitFolder = function (folderPath: string) {
	toggleGitFolder(folderPath);
}

/**
 * Expands all folders in the changes tree.
 */
window.expandAllGitFolders = function () {
	expandAllGitFolders();
}

/**
 * Collapses all folders in the changes tree.
 */
window.collapseAllGitFolders = function () {
	collapseAllGitFolders();
}

/**
 * Aborts an in-progress merge and refreshes the workspace.
 */
window.abortMerge = async function () {
	await window.go.main.App.AbortMerge();
	await window.refresh();
}

/**
 * Continues an in-progress merge and refreshes the workspace.
 */
window.continueMerge = async function () {
	await window.go.main.App.ContinueMerge();
	await window.refresh();
}

/**
 * Commits staged Git changes with the message entered by the user.
 */
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

/**
 * Switches the current branch to the name entered by the user.
 */
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

/**
 * Prompts the user to confirm switching branches.
 *
 * @param branchName - The branch to switch to.
 * @param isRemote - Whether the branch is remote.
 */
window.promptBranchSwitch = function (branchName: string, isRemote?: boolean) {
	modalManager.openBranchSwitch(branchName, isRemote);
}

/**
 * Confirms a branch switch from the branch switch modal.
 */
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

/**
 * Cancels the branch switch confirmation modal.
 */
window.cancelBranchSwitch = function () {
	modalManager.closeBranchSwitch();
}

/**
 * Prompts the user to confirm deleting a Git branch.
 *
 * @param branchName - The branch to delete.
 * @param forceDelete - If true, forces branch deletion.
 */
window.promptDeleteBranch = function (branchName: string, forceDelete?: boolean) {
	modalManager.openBranchDelete(branchName, forceDelete);
}

/**
 * Confirms and executes deletion of the selected Git branch.
 */
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

/**
 * Cancels the branch delete confirmation modal.
 */
window.cancelDeleteBranch = function () {
	modalManager.closeBranchDelete();
}

/**
 * Prompts the user to archive a branch, either showing info or confirmation depending on settings.
 *
 * @param branchName - The branch to archive.
 * @param isRemote - Whether the branch is remote.
 */
window.promptArchiveBranch = function (branchName: string, isRemote?: boolean) {
	if (activeArchiveMethod === "none") {
		modalManager.openBranchArchiveInfo(branchName);
		return;
	}

	modalManager.openBranchArchiveConfirm(branchName, activeArchiveMethod === "folder", isRemote);
}

/**
 * Confirms and executes branch archiving from the modal state.
 */
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

/**
 * Cancels branch archive modal dialogs.
 */
window.cancelArchiveBranch = function () {
	modalManager.closeBranchArchiveInfo();
	modalManager.closeBranchArchiveConfirm();
}

/**
 * Toggles the branch card context menu dropdown.
 *
 * @param cardEl - The branch card element containing the dropdown.
 */
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

/**
 * Toggles the display of archived branches in the branch list.
 */
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

/**
 * Measures and logs the execution time for an async operation.
 *
 * @param label - The label to use in the log output.
 * @param fn - The async function to execute.
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


/**
 * Opens the discard confirmation modal for a single file.
 *
 * @param filePath - The path of the file to discard.
 * @param description - Optional descriptive label for the file.
 * @param changeKey - Optional selection key for Git action state.
 */
window.discardGitFile = async function (filePath: string, description?: string, changeKey?: string) {
	const targets = getActionTargetsOrFallback("discard", filePath, changeKey, description);
	modalManager.openDiscard(targets.map((target) => ({
		filePath: target.actionPath,
		description: target.label,
	})), isAnyGitActionPending);
}

/**
 * Opens the discard confirmation modal for selected files.
 */
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

/**
 * Opens the discard confirmation modal for every change inside a folder.
 *
 * @param folderPath - The full directory path to discard.
 */
window.discardGitFolder = async function (folderPath: string) {
	const targets = getFolderActionTargets(folderPath, "discard");
	if (targets.length === 0) {
		return;
	}

	modalManager.openDiscard(targets.map((target) => ({
		filePath: target.actionPath,
		description: target.label,
	})), isAnyGitActionPending);
}

/**
 * Confirms and discards the selected files from the modal state.
 */
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

/**
 * Handles file selection clicks in the Git changes view.
 *
 * @param event - The originating mouse event.
 * @param key - The unique change selection key.
 */
window.selectGitChange = function (event: MouseEvent, key: string) {
	handleGitSelectionClick(event, key);
}

/**
 * Cancels the discard confirmation modal without discarding changes.
 */
window.cancelDiscardGitFile = function () {
	modalManager.closeDiscard(isAnyGitActionPending);
}

/**
 * Pushes committed changes and handles common push errors.
 */
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

/**
 * Prunes remote-tracking branches and refreshes the repository state.
 */
window.pruneGitBranches = async function () {
	try {
		document.getElementById("PruneButton")!.setAttribute("disabled", "");
		await window.go.main.App.GitPrune();	
	} finally {
		await window.refresh();
		document.getElementById("PruneButton")!.removeAttribute("disabled");
	}
}

/**
 * Toggles visibility of the diff content for a specific changed file.
 *
 * @param headerEl - The header element that was clicked.
 */
window.toggleDiff = function (headerEl: HTMLElement) {
	const entry = headerEl.closest('.diff-file-entry') as HTMLElement;
	const content = entry.querySelector('.diff-content') as HTMLElement;
	if (content.style.display === "none") {
		content.style.display = "";
	} else {
		content.style.display = "none";
	}
}

/**
 * Pulls changes from the remote repository and handles merge conflict state.
 */
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
 * Loads the main application UI and initializes the workspace view.
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

/**
 * Renders the welcome screen and initializes console and modal event listeners.
 */
function showWelcomeView() {
    document.querySelector('#app')!.innerHTML = renderWelcomeShell(getViewRenderContext());
    modalManager.ensureKeyListener();
    syncFrontendConsoleVisibility();
    renderFrontendLogConsole();
}

/**
 * Re-renders the recent repository list panel.
 */
function syncRecentRepositoriesPanel() {
    const recentRepositoriesPanel = document.getElementById('RecentRepositoriesPanel');
    if (recentRepositoriesPanel) {
        recentRepositoriesPanel.innerHTML = renderRecentRepositoriesHtml(getViewRenderContext());
    }
}

/**
 * Shows or hides the settings modal and updates its content.
 */
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
		folderGroupingDirectThreshold,
		folderGroupingSubtreeThreshold,
	};
}

/**
 * Updates the workspace header display based on the currently opened repository.
 */
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

/**
 * Returns the last path segment for a repository path.
 *
 * @param repoPath - The repository path to extract the name from.
 * @returns The inferred repository folder name.
 */
function getRepositoryName(repoPath: string) {
	const normalizedPath = repoPath.replace(/\\+$/g, "").replace(/\/+$/g, "");
	const segments = normalizedPath.split(/[\\/]/).filter(Boolean);
	return segments[segments.length - 1] ?? repoPath;
}

/**
 * Initializes the UI theme using stored preferences or the default theme.
 */
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

/**
 * Initializes the frontend console visibility flag from local storage.
 */
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

/**
 * Normalizes a maximum staging-file size value to a valid number of megabytes.
 *
 * @param value - The configured maximum staging-file size in megabytes
 * @returns The input value when it is a nonnegative safe integer, or `0` otherwise
 */
function normalizeMaxStageFileSizeMb(value: number): number {
	if (!Number.isSafeInteger(value) || value < 0) {
		return 0;
	}
	return value;
}

/**
 * Initializes the maximum staging-file size from persisted settings.
 *
 * Invalid stored values are reset to zero, and the normalized limit is applied to the backend in bytes.
 */
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
 * Normalizes a folder grouping threshold to a nonnegative safe integer.
 *
 * @param value - The configured threshold value.
 * @returns The value when it is a nonnegative safe integer, or `0` otherwise.
 */
function normalizeFolderGroupingThreshold(value: number): number {
	if (!Number.isSafeInteger(value) || value < 0) {
		return 0;
	}
	return value;
}

/**
 * Initializes the folder grouping thresholds from persisted settings and applies them.
 */
function initializeFolderGroupingThresholds() {
	const storedDirect = window.localStorage.getItem(folderGroupingDirectThresholdStorageKey);
	if (storedDirect !== null) {
		const parsed = Number(storedDirect);
		folderGroupingDirectThreshold = normalizeFolderGroupingThreshold(Number.isSafeInteger(parsed) ? parsed : NaN);
		if (!Number.isSafeInteger(parsed) || parsed < 0) {
			window.localStorage.setItem(folderGroupingDirectThresholdStorageKey, "5");
			folderGroupingDirectThreshold = 5;
		}
	}

	const storedSubtree = window.localStorage.getItem(folderGroupingSubtreeThresholdStorageKey);
	if (storedSubtree !== null) {
		const parsed = Number(storedSubtree);
		folderGroupingSubtreeThreshold = normalizeFolderGroupingThreshold(Number.isSafeInteger(parsed) ? parsed : NaN);
		if (!Number.isSafeInteger(parsed) || parsed < 0) {
			window.localStorage.setItem(folderGroupingSubtreeThresholdStorageKey, "5");
			folderGroupingSubtreeThreshold = 5;
		}
	}

	setFolderGroupingThresholds(folderGroupingDirectThreshold, folderGroupingSubtreeThreshold);
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

/**
 * Applies a UI theme and persists the selection.
 *
 * @param themeName - The theme to apply.
 */
function applyTheme(themeName: ThemeName) {
	activeTheme = themeName;
	document.documentElement.dataset.theme = themeName;
	window.localStorage.setItem(themeStorageKey, themeName);
}

/**
 * Converts an arbitrary error to a string message.
 *
 * @param error - The error to convert.
 * @returns The error message or string representation.
 */
function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error ?? "");
}

/**
 * Identifies Git push errors caused by a non-fast-forward update.
 *
 * @param errorMessage - The error message to inspect
 * @returns `true` if the message indicates a non-fast-forward push failure, `false` otherwise.
 */
function isNonFastForwardPushError(errorMessage: string): boolean {
	const message = errorMessage.toLowerCase();
	return message.includes("non-fast-forward") || message.includes("failed to push some refs");
}

/**
 * Determines whether an error message indicates that GitHub rejected a file for exceeding its size limit.
 *
 * @param errorMessage - The error message to inspect
 * @returns `true` if the message indicates a GitHub large-file rejection, `false` otherwise.
 */
function isLargeFilePushError(errorMessage: string): boolean {
	const message = errorMessage.toLowerCase();
	return message.includes("gh001") && (message.includes("larger than github") || message.includes("exceeds github"));
}

/**
 * Identifies staging errors caused by the configured maximum file-size limit.
 *
 * @param errorMessage - The error message to inspect
 * @returns `true` if the message indicates that a file exceeds the maximum staging size, `false` otherwise.
 */
function isStageFileSizeError(errorMessage: string): boolean {
	return errorMessage.toLowerCase().includes("exceeds max stage file size");
}

/**
 * Identifies whether an error message indicates a merge conflict.
 *
 * @param errorMessage - The error message to inspect
 * @returns `true` if the message indicates a merge conflict, `false` otherwise.
 */
function isMergeConflictError(errorMessage: string): boolean {
	const message = errorMessage.toLowerCase();
	return message.includes("conflict") || message.includes("automatic merge failed") || message.includes("merge conflict");
}

/**
 * Builds Git action targets from the current selection or fallback to a single file.
 */
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

/**
 * Executes Git actions for the eligible targets and refreshes the Git diff afterward.
 *
 * @param targets - Git action targets to process
 * @param runner - Operation to execute for each target path
 * @throws The action error, unless it represents a staging-size limit violation
 * @throws The error encountered while refreshing the Git diff
 */
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
 * @param event - The mouse event used to identify the clicked element.
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
 * @returns The recent repositories dropdown element or null if absent.
 */
function getRecentRepositoriesDropdown() {
	return document.querySelector(".recent-repositories-dropdown") as HTMLDetailsElement | null;
}

/**
 * Focuses the initial target element inside a modal after it is shown.
 *
 * @param modalId - The DOM id of the modal.
 * @param preferredSelector - Optional selector for the preferred focus target.
 */
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

/**
 * Focuses the modal card container if no preferred target is available.
 *
 * @param modal - The modal element whose card should receive focus.
 */
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
		stageGitFolder: (folderPath: string) => Promise<void>;
		unstageGitFolder: (folderPath: string) => Promise<void>;
		discardGitFolder: (folderPath: string) => Promise<void>;
		toggleGitFolder: (folderPath: string) => void;
		expandAllGitFolders: () => void;
		collapseAllGitFolders: () => void;
		setFolderGroupingDirectThreshold: (value: number) => void;
		setFolderGroupingSubtreeThreshold: (value: number) => void;
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
