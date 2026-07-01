type GitActionKind = "stage" | "unstage" | "discard";

const pendingActions = new Set<string>();

function buildActionKey(action: GitActionKind, filePath: string): string {
	return `${action}:${filePath}`;
}

export function beginGitAction(action: GitActionKind, filePath: string): string | null {
	const actionKey = buildActionKey(action, filePath);
	if (pendingActions.has(actionKey)) {
		return null;
	}

	pendingActions.add(actionKey);
	syncGitActionButtons();
	return actionKey;
}

export function endGitAction(actionKey: string): void {
	pendingActions.delete(actionKey);
	syncGitActionButtons();
}

export function isGitActionPending(action: GitActionKind, filePath: string): boolean {
	return pendingActions.has(buildActionKey(action, filePath));
}

export function getGitActionButtonAttrs(action: GitActionKind, filePath: string): string {
	const actionKey = buildActionKey(action, filePath);
	const disabled = pendingActions.has(actionKey) ? " disabled" : "";
	return `data-git-action-key="${escapeAttribute(actionKey)}"${disabled}`;
}

function syncGitActionButtons(): void {
	const buttons = document.querySelectorAll<HTMLButtonElement>("[data-git-action-key]");
	buttons.forEach((button) => {
		const actionKey = button.dataset.gitActionKey;
		if (!actionKey) {
			return;
		}

		button.disabled = pendingActions.has(actionKey);
	});
}

function escapeAttribute(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}
