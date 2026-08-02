import type { ArchiveMethod, ThemeName } from "../../app/main";
import type { RecentRepository } from "../recent/recentRepositories";

type FrontendLogLevel = "debug" | "info" | "warn" | "error";

type ViewRenderContext = {
	recentRepositories: RecentRepository[];
	openedFolder: string | null;
	settingsModalOpen: boolean;
	activeTheme: ThemeName;
	showFrontendConsole: boolean;
	frontendLogMinimumLevel: FrontendLogLevel;
	minMaxRecentRepositories: number;
	maxMaxRecentRepositories: number;
	maxRecentRepositories: number;
	gitCommand: string;
	gitRemoteCommand: string;
	archiveMethod: ArchiveMethod;
	maxStageFileSizeMb: number;
};

/**
 * Generates the welcome-page HTML with repository actions, recent repositories, and an optional settings modal.
 *
 * @param context - The view state used to populate the welcome page and settings modal
 * @returns The rendered welcome-page HTML
 */
export function renderWelcomeShell(context: ViewRenderContext): string {
	const recentRepositoriesHtml = renderRecentRepositoriesHtml(context);

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
		<div id="SettingsModal" class="modal-backdrop" ${context.settingsModalOpen ? "" : "hidden"} onclick="if (event.target === this) closeSettings()">
			<div class="modal-card settings-modal-card" role="dialog" aria-modal="true" aria-labelledby="SettingsModalTitle" tabindex="-1" onclick="event.stopPropagation()">
				<div id="SettingsModalBody" class="settings-modal-content">${context.settingsModalOpen ? renderSettingsContent(context) : ""}</div>
			</div>
		</div>
	</section>`;
}

/**
 * Renders the settings panel with controls for logs, theme, repository storage, branch archiving, Git commands, and recent repositories.
 *
 * @param context - The current settings and repository state used to populate the panel.
 * @returns The settings panel HTML.
 */
export function renderSettingsContent(context: ViewRenderContext): string {
	const recentRepositoriesHtml = context.recentRepositories.length > 0
		? context.recentRepositories.map((repository) => `
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

	<div class="settings-card">
		<div class="settings-label">Logs</div>
		<div class="settings-row">
			<span>Console panel visibility</span>
			<button type="button" class="${context.showFrontendConsole ? "button-primary" : "button-secondary"}" onclick="setFrontendConsoleEnabled(true)">Enabled</button>
			<button type="button" class="${!context.showFrontendConsole ? "button-primary" : "button-secondary"}" onclick="setFrontendConsoleEnabled(false)">Disabled</button>
		</div>
		<div class="settings-row">
			<span>Minimum console log level</span>
			<button type="button" class="${context.frontendLogMinimumLevel === "debug" ? "button-primary" : "button-secondary"}" onclick="setFrontendLogMinimumLevel('debug')">Debug</button>
			<button type="button" class="${context.frontendLogMinimumLevel === "info" ? "button-primary" : "button-secondary"}" onclick="setFrontendLogMinimumLevel('info')">Info</button>
			<button type="button" class="${context.frontendLogMinimumLevel === "warn" ? "button-primary" : "button-secondary"}" onclick="setFrontendLogMinimumLevel('warn')">Warn</button>
			<button type="button" class="${context.frontendLogMinimumLevel === "error" ? "button-primary" : "button-secondary"}" onclick="setFrontendLogMinimumLevel('error')">Error</button>
		</div>
	</div>
	<div class="settings-grid">
		<div class="settings-card">
			<div class="settings-label">Theme</div>
			<div class="settings-row">
				<button type="button" class="${context.activeTheme === "aurora" ? "button-primary" : "button-secondary"}" onclick="selectTheme('aurora')">Aurora</button>
				<button type="button" class="${context.activeTheme === "midnight" ? "button-primary" : "button-secondary"}" onclick="selectTheme('midnight')">Midnight</button>
				<button type="button" class="${context.activeTheme === "purple" ? "button-primary" : "button-secondary"}" onclick="selectTheme('purple')">Purple</button>
			</div>
		</div>

		<div class="settings-card">
			<div class="settings-label">Data</div>
			<div class="settings-row">
				<span>${context.recentRepositories.length} saved recent repos</span>
				<button type="button" class="button-secondary" onclick="clearRecentRepositories()">Clear Recent Repositories</button>
			</div>
			<div class="settings-row">
				<label for="MaxRecentRepositoriesInput">Max stored recent repos</label>
				<input
					id="MaxRecentRepositoriesInput"
					type="number"
					min="${context.minMaxRecentRepositories}"
					max="${context.maxMaxRecentRepositories}"
					value="${context.maxRecentRepositories}"
					onchange="setMaxRecentRepositories(Number(this.value))"
				>
			</div>
		</div>
	</div>

	<div class="settings-card">
		<div class="settings-label">Staging</div>
		<div class="settings-row">
			<label for="MaxStageFileSizeInput">Max stage file size (MB, 0 = disabled)</label>
			<input
				id="MaxStageFileSizeInput"
				type="number"
				min="0"
				step="1"
				value="${context.maxStageFileSizeMb}"
				onchange="setMaxStageFileSize(Number(this.value))"
			>
		</div>
	</div>

	<div class="settings-card">
		<div class="settings-label">Archive Method</div>
		<div class="settings-row">
			<span>Branch archiving behavior</span>
			<button type="button" class="${context.archiveMethod === "none" ? "button-primary" : "button-secondary"}" onclick="setArchiveMethod('none')" title="No archive action will be performed. Clicking the Archive button will show a reminder to configure an archive method.">None</button>
			<button type="button" class="${context.archiveMethod === "folder" ? "button-primary" : "button-secondary"}" onclick="setArchiveMethod('folder')" title="Renames the branch to archive/&lt;branch&gt;, pushes the renamed branch to origin, and deletes the original branch from the remote.">Archive Folder</button>
			<button type="button" class="${context.archiveMethod === "folder-no-delete" ? "button-primary" : "button-secondary"}" onclick="setArchiveMethod('folder-no-delete')" title="Renames the branch to archive/&lt;branch&gt; and pushes the renamed branch to origin, but keeps the original branch on the remote.">Archive Folder Without Deletion</button>
		</div>
	</div>

	<div class="settings-card">
		<div class="settings-label">Git Command (Local)</div>
		<div class="settings-row">
			<label for="GitCommandInput">Custom git executable for status, diff, commit, branch</label>
			<input
				id="GitCommandInput"
				type="text"
				placeholder="git"
				value="${escapeHtml(context.gitCommand)}"
				onchange="setGitCommand(this.value)"
			>
		</div>
	</div>

	<div class="settings-card">
		<div class="settings-label">Git Command (Remote)</div>
		<div class="settings-row">
			<label for="GitRemoteCommandInput">Custom git executable for fetch, pull, push</label>
			<input
				id="GitRemoteCommandInput"
				type="text"
				placeholder="git"
				value="${escapeHtml(context.gitRemoteCommand)}"
				onchange="setGitRemoteCommand(this.value)"
			>
		</div>
	</div>

	<div class="settings-card">
		<div class="settings-label">Recent Repositories</div>
		<div class="settings-recent-list">
			${recentRepositoriesHtml}
		</div>
	</div>`;
}

/**
 * Renders the recent repository list HTML for the settings or welcome view.
 */
export function renderRecentRepositoriesHtml(context: Pick<ViewRenderContext, "recentRepositories" | "openedFolder">): string {
	const recentRepositoriesHtml = context.recentRepositories.length > 0
		? context.recentRepositories.map((repository) => `
			<button type="button" class="recent-repository-item${context.openedFolder === repository.path ? " recent-repository-item-current" : ""}"${context.openedFolder === repository.path ? ' aria-current="page" disabled' : ''} onclick="openRecentRepository(${escapeHtml(JSON.stringify(repository.path))})">
				<span class="recent-repository-name">${escapeHtml(repository.label)}</span>
				<span class="recent-repository-path">${escapeHtml(repository.path)}</span>
				${context.openedFolder === repository.path ? '<span class="recent-repository-current">Currently open</span>' : ''}
			</button>
		`).join("")
		: `<div class="recent-repositories-empty">No recent repositories yet.</div>`;

	return recentRepositoriesHtml;
}

/**
 * Escapes HTML special characters in a string.
 *
 * @param value - The value to escape.
 * @returns The escaped string.
 */
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
