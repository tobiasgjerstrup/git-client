const pendingActions = new Set<string>();

/**
 * Builds a stable action key for a file path.
 *
 * @param filePath - The file path to track.
 * @returns A string key used to identify pending file actions.
 */
function buildActionKey(filePath: string): string {
    return filePath;
}

/**
 * Begins tracking a Git action for the given file.
 *
 * @param filePath - The path of the file being modified.
 * @returns The action key when started, or null if the action is already pending.
 */
export function beginGitAction(filePath: string): string | null {
    const actionKey = buildActionKey(filePath);
    if (pendingActions.has(actionKey)) {
        return null;
    }

    pendingActions.add(actionKey);
    syncGitActionButtons();
    return actionKey;
}

/**
 * Marks a Git action as completed by removing it from the pending set.
 *
 * @param actionKey - The key identifying the completed action.
 */
export function endGitAction(actionKey: string): void {
    pendingActions.delete(actionKey);
    syncGitActionButtons();
}

/**
 * Checks whether any Git action is currently pending for a file path.
 *
 * @param filePath - The file path to test.
 * @returns True when an action on the file is pending.
 */
export function isAnyGitActionPending(filePath: string): boolean {
    return pendingActions.has(buildActionKey(filePath));
}

/**
 * Returns serialized button attributes for pending Git action state.
 *
 * @param filePath - The file path associated with the button.
 * @returns HTML attribute text for the button element.
 */
export function getGitActionButtonAttrs(filePath: string): string {
    const actionKey = buildActionKey(filePath);
    const disabled = pendingActions.has(actionKey) ? " disabled" : "";
    return `data-git-action-key="${escapeAttribute(actionKey)}"${disabled}`;
}

/**
 * Synchronizes button disabled state for pending Git actions.
 */
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

/**
 * Escapes a string for safe inclusion in an HTML attribute.
 *
 * @param value - The attribute value to escape.
 * @returns The escaped string.
 */
function escapeAttribute(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
