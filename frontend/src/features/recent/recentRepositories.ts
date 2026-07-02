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

export function saveRecentRepositories(repositories: RecentRepository[]) {
	const maxRecentRepositories = getMaxRecentRepositories();
	window.localStorage.setItem(recentRepositoriesStorageKey, JSON.stringify(repositories.slice(0, maxRecentRepositories)));
}

export function getMaxRecentRepositories(): number {
	const storedValue = window.localStorage.getItem(maxRecentRepositoriesStorageKey);
	if (!storedValue) {
		return DEFAULT_MAX_RECENT_REPOSITORIES;
	}

	const parsedValue = Number.parseInt(storedValue, 10);
	return normalizeMaxRecentRepositories(parsedValue);
}

export function setMaxRecentRepositoriesLimit(value: number): number {
	const normalizedValue = normalizeMaxRecentRepositories(value);
	window.localStorage.setItem(maxRecentRepositoriesStorageKey, String(normalizedValue));
	// Re-save to enforce the new cap immediately.
	saveRecentRepositories(getRecentRepositories());
	return normalizedValue;
}

export function clearRecentRepositories() {
	saveRecentRepositories([]);
}

export function removeRecentRepository(repoPath: string) {
	const nextRepositories = getRecentRepositories().filter((item) => item.path !== repoPath);
	saveRecentRepositories(nextRepositories);
}

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

function normalizeMaxRecentRepositories(value: number): number {
	if (!Number.isFinite(value)) {
		return DEFAULT_MAX_RECENT_REPOSITORIES;
	}

	return Math.min(MAX_MAX_RECENT_REPOSITORIES, Math.max(MIN_MAX_RECENT_REPOSITORIES, Math.round(value)));
}

function getRepositoryLabel(repoPath: string): string {
	const normalizedPath = repoPath.replace(/\\/g, "/").replace(/\/$/, "");
	const segments = normalizedPath.split("/").filter(Boolean);
	return segments[segments.length - 1] || repoPath;
}
