export type RecentRepository = {
	path: string;
	label: string;
	lastOpenedAt: number;
};

const recentRepositoriesStorageKey = "git-client-recent-repositories";
const maxRecentRepositoriesStorageKey = "git-client-max-recent-repositories";

export const DEFAULT_MAX_RECENT_REPOSITORIES = 6;
export const MIN_MAX_RECENT_REPOSITORIES = 1;
export const MAX_MAX_RECENT_REPOSITORIES = 99;

/**
 * Retrieves the current list of saved recent repositories.
 *
 * @returns The recent repository list stored in local storage.
 */
export function getRecentRepositories(): RecentRepository[] {
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

/**
 * Saves the recent repository list to local storage.
 *
 * @param repositories - The repositories to persist.
 */
export function saveRecentRepositories(repositories: RecentRepository[]) {
    const maxRecentRepositories = getMaxRecentRepositories();
    window.localStorage.setItem(recentRepositoriesStorageKey, JSON.stringify(repositories.slice(0, maxRecentRepositories)));
}

/**
 * Returns the maximum number of recent repositories to store.
 *
 * @returns The configured maximum recent repository count.
 */
export function getMaxRecentRepositories(): number {
    const storedValue = window.localStorage.getItem(maxRecentRepositoriesStorageKey);
    if (!storedValue) {
        return DEFAULT_MAX_RECENT_REPOSITORIES;
    }

	const parsedValue = Number.parseInt(storedValue, 10);
	return normalizeMaxRecentRepositories(parsedValue);
}

/**
 * Normalizes and saves the max recent repositories limit.
 *
 * @param value - The requested maximum repository count.
 * @returns The normalized limit persisted to storage.
 */
export function setMaxRecentRepositoriesLimit(value: number): number {
    const normalizedValue = normalizeMaxRecentRepositories(value);
    window.localStorage.setItem(maxRecentRepositoriesStorageKey, String(normalizedValue));
    // Re-save to enforce the new cap immediately.
    saveRecentRepositories(getRecentRepositories());
    return normalizedValue;
}

/**
 * Clears all stored recent repositories.
 */
export function clearRecentRepositories() {
    saveRecentRepositories([]);
}

/**
 * Removes a repository from the recent list.
 *
 * @param repoPath - The repository path to remove.
 */
export function removeRecentRepository(repoPath: string) {
    const nextRepositories = getRecentRepositories().filter((item) => item.path !== repoPath);
    saveRecentRepositories(nextRepositories);
}

/**
 * Adds a repository to the top of the recent list.
 *
 * @param repoPath - The repository path to add.
 */
export function addRecentRepository(repoPath: string) {
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

/**
 * Ensures the max recent repository limit falls within allowed bounds.
 *
 * @param value - The requested maximum count.
 * @returns The normalized limit.
 */
function normalizeMaxRecentRepositories(value: number): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_MAX_RECENT_REPOSITORIES;
    }

    return Math.min(MAX_MAX_RECENT_REPOSITORIES, Math.max(MIN_MAX_RECENT_REPOSITORIES, Math.round(value)));
}

/**
 * Derives a display label from a repository path.
 *
 * @param repoPath - The repository path to label.
 * @returns The final repository label.
 */
function getRepositoryLabel(repoPath: string): string {
    const normalizedPath = repoPath.replace(/\\/g, "/").replace(/\/$/, "");
    const segments = normalizedPath.split("/").filter(Boolean);
    return segments[segments.length - 1] || repoPath;
}
