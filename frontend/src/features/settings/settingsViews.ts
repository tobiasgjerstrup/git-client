import type { RecentRepository } from "../recent/recentRepositories";

type ThemeName = "aurora" | "midnight" | "purple";
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
};

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
		<div class="settings-label">Recent Repositories</div>
		<div class="settings-recent-list">
			${recentRepositoriesHtml}
		</div>
	</div>`;
}

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

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
