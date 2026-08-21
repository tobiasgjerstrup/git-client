import type { GitSelectionAction } from './gitSelectionState';

export type GitTreeLeaf = {
	path: string;
	actionPath: string;
	label: string;
	supportedActions: GitSelectionAction[];
	renderFile: (displayPath: string) => string;
};

export type GitTreeFileNode = {
	type: "file";
	name: string;
	path: string;
	leaf: GitTreeLeaf;
};

export type GitTreeFolderNode = {
	type: "folder";
	name: string;
	path: string;
	children: GitTreeNode[];
};

export type GitTreeNode = GitTreeFileNode | GitTreeFolderNode;

type FolderCounts = {
	direct: number;
	subtree: number;
};

const DEFAULT_FOLDER_GROUPING_THRESHOLD = 5;

let renderedTree: GitTreeNode[] = [];
const expandedFolders = new Set<string>();
let allFolderPaths = new Set<string>();
let folderGroupingDirectThreshold = DEFAULT_FOLDER_GROUPING_THRESHOLD;
let folderGroupingSubtreeThreshold = DEFAULT_FOLDER_GROUPING_THRESHOLD;

/**
 * Configures the folder-grouping thresholds used when building the changes tree.
 *
 * @param direct - Minimum number of files directly inside a directory.
 * @param subtree - Minimum number of files anywhere inside a directory.
 */
export function setFolderGroupingThresholds(direct: number, subtree: number): void {
	folderGroupingDirectThreshold = direct;
	folderGroupingSubtreeThreshold = subtree;
}

/**
 * Returns the current minimum direct-files threshold for folder grouping.
 */
export function getFolderGroupingDirectThreshold(): number {
	return folderGroupingDirectThreshold;
}

/**
 * Returns the current minimum subtree-files threshold for folder grouping.
 */
export function getFolderGroupingSubtreeThreshold(): number {
	return folderGroupingSubtreeThreshold;
}

/**
 * Builds a nested folder tree from a flat list of Git change leaves.
 *
 * A directory is kept as a folder when it has at least `directThreshold` files
 * directly inside it, or at least `subtreeThreshold` files anywhere inside it.
 * A threshold of zero disables that condition; when both thresholds are zero no
 * folders are created and every leaf is rendered flat.
 *
 * @param leaves - The flat change entries to nest by directory.
 * @param directThreshold - Minimum direct files that keep a folder.
 * @param subtreeThreshold - Minimum subtree files that keep a folder.
 * @returns The root tree nodes, folders first and sorted alphabetically.
 */
export function buildGitChangeTree(
	leaves: GitTreeLeaf[],
	directThreshold = Number.POSITIVE_INFINITY,
	subtreeThreshold = Number.POSITIVE_INFINITY,
): GitTreeNode[] {
	if (directThreshold === 0 && subtreeThreshold === 0) {
		return leaves.map((leaf) => ({
			type: "file",
			name: baseName(leaf.path),
			path: leaf.path,
			leaf,
		}));
	}

	const root: GitTreeNode[] = [];
	for (const leaf of leaves) {
		const segments = leaf.path.split("/").filter((segment) => segment.length > 0);
		insertLeaf(root, segments, leaf, 0);
	}
	sortNodes(root);

	if (directThreshold === Number.POSITIVE_INFINITY || subtreeThreshold === Number.POSITIVE_INFINITY) {
		return root;
	}

	const counts = new Map<string, FolderCounts>();
	for (const node of root) {
		collectFolderCounts(node, counts);
	}
	return pruneFolders(root, directThreshold, subtreeThreshold, counts);
}

/**
 * Returns the last path segment of a file path.
 */
function baseName(path: string): string {
	const segments = path.split("/").filter((segment) => segment.length > 0);
	return segments[segments.length - 1] ?? path;
}

/**
 * Inserts a leaf into the tree at the correct nested position.
 */
function insertLeaf(nodes: GitTreeNode[], segments: string[], leaf: GitTreeLeaf, index: number): void {
	const name = segments[index];
	const isLast = index === segments.length - 1;
	if (isLast) {
		nodes.push({ type: "file", name, path: leaf.path, leaf });
		return;
	}

	const folderPath = segments.slice(0, index + 1).join("/");
	let folder = nodes.find((node): node is GitTreeFolderNode => node.type === "folder" && node.name === name);
	if (!folder) {
		folder = { type: "folder", name, path: folderPath, children: [] };
		nodes.push(folder);
	}
	insertLeaf(folder.children, segments, leaf, index + 1);
}

/**
 * Sorts tree nodes so folders come before files, each alphabetically.
 */
function sortNodes(nodes: GitTreeNode[]): void {
	nodes.sort((a, b) => {
		if (a.type !== b.type) {
			return a.type === "folder" ? -1 : 1;
		}
		return a.name.localeCompare(b.name);
	});
	for (const node of nodes) {
		if (node.type === "folder") {
			sortNodes(node.children);
		}
	}
}

/**
 * Records the direct and subtree distinct-file counts for every folder in the tree.
 *
 * @returns The set of distinct file paths found beneath the given node.
 */
function collectFolderCounts(node: GitTreeNode, counts: Map<string, FolderCounts>): Set<string> {
	if (node.type === "file") {
		return new Set([node.leaf.path]);
	}

	const subtree = new Set<string>();
	const direct = new Set<string>();
	for (const child of node.children) {
		if (child.type === "file") {
			direct.add(child.leaf.path);
			subtree.add(child.leaf.path);
		} else {
			const childPaths = collectFolderCounts(child, counts);
			for (const path of childPaths) {
				subtree.add(path);
			}
		}
	}
	counts.set(node.path, { direct: direct.size, subtree: subtree.size });
	return subtree;
}

/**
 * Removes folders that fail to meet the grouping thresholds, promoting their children up.
 */
function pruneFolders(
	nodes: GitTreeNode[],
	directThreshold: number,
	subtreeThreshold: number,
	counts: Map<string, FolderCounts>,
): GitTreeNode[] {
	const result: GitTreeNode[] = [];
	for (const node of nodes) {
		if (node.type === "file") {
			result.push(node);
			continue;
		}

		const count = counts.get(node.path) ?? { direct: 0, subtree: 0 };
		if (meetsThreshold(directThreshold, count.direct) || meetsThreshold(subtreeThreshold, count.subtree)) {
			result.push({
				...node,
				children: pruneFolders(node.children, directThreshold, subtreeThreshold, counts),
			});
		} else {
			result.push(...pruneFolders(node.children, directThreshold, subtreeThreshold, counts));
		}
	}
	return result;
}

/**
 * Returns whether a file count satisfies a grouping threshold.
 *
 * @param threshold - The configured threshold (zero disables the condition).
 * @param count - The number of files to check.
 * @returns True when the count meets the threshold.
 */
function meetsThreshold(threshold: number, count: number): boolean {
	if (threshold === Number.POSITIVE_INFINITY) {
		return true;
	}
	return threshold > 0 && count >= threshold;
}

/**
 * Updates the currently rendered tree and prunes stale expand state.
 *
 * @param nodes - The root tree nodes rendered in the Git changes view.
 */
export function setRenderedGitTree(nodes: GitTreeNode[]): void {
	renderedTree = nodes;

	const paths = new Set<string>();
	collectFolderPaths(nodes, paths);
	allFolderPaths = paths;

	for (const path of Array.from(expandedFolders)) {
		if (!paths.has(path)) {
			expandedFolders.delete(path);
		}
	}
}

function collectFolderPaths(nodes: GitTreeNode[], paths: Set<string>): void {
	for (const node of nodes) {
		if (node.type === "folder") {
			paths.add(node.path);
			collectFolderPaths(node.children, paths);
		}
	}
}

/**
 * Returns whether a folder is currently expanded.
 *
 * @param path - The full directory path.
 */
export function isGitFolderExpanded(path: string): boolean {
	return expandedFolders.has(path);
}

/**
 * Toggles a folder's expanded/collapsed state and updates the DOM in place.
 *
 * @param path - The full directory path.
 */
export function toggleGitFolder(path: string): void {
	if (expandedFolders.has(path)) {
		expandedFolders.delete(path);
	} else {
		expandedFolders.add(path);
	}
	syncFolders();
}

/**
 * Expands all folders in the current tree.
 */
export function expandAllGitFolders(): void {
	for (const path of allFolderPaths) {
		expandedFolders.add(path);
	}
	syncFolders();
}

/**
 * Collapses all folders in the current tree.
 */
export function collapseAllGitFolders(): void {
	expandedFolders.clear();
	syncFolders();
}

/**
 * Synchronizes chevron and child visibility with the expanded state.
 */
function syncFolders(): void {
	document.querySelectorAll<HTMLElement>(".git-folder").forEach((element) => {
		const path = element.dataset.folderPath;
		if (!path) {
			return;
		}

		const expanded = expandedFolders.has(path);

		const chevron = element.querySelector<HTMLElement>(".git-folder-chevron");
		if (chevron) {
			chevron.textContent = expanded ? "▾" : "▸";
		}

		const children = element.querySelector<HTMLElement>(":scope > .git-folder-children");
		if (children) {
			children.style.display = expanded ? "" : "none";
		}
	});
}

/**
 * Collects the action targets for a whole-folder operation.
 *
 * @param folderPath - The full directory path of the folder.
 * @param action - The action to gather eligible targets for.
 * @returns Deduplicated leaf targets supporting the action.
 */
export function getFolderActionTargets(folderPath: string, action: GitSelectionAction): { actionPath: string; label: string }[] {
	const folder = findFolder(renderedTree, folderPath);
	if (!folder) {
		return [];
	}

	const targets: { actionPath: string; label: string }[] = [];
	const seen = new Set<string>();
	collectActionTargets(folder, action, targets, seen);
	return targets;
}

function findFolder(nodes: GitTreeNode[], path: string): GitTreeFolderNode | null {
	for (const node of nodes) {
		if (node.type === "folder") {
			if (node.path === path) {
				return node;
			}
			const found = findFolder(node.children, path);
			if (found) {
				return found;
			}
		}
	}
	return null;
}

function collectActionTargets(
	node: GitTreeNode,
	action: GitSelectionAction,
	targets: { actionPath: string; label: string }[],
	seen: Set<string>,
): void {
	if (node.type === "file") {
		if (node.leaf.supportedActions.includes(action) && !seen.has(node.leaf.actionPath)) {
			seen.add(node.leaf.actionPath);
			targets.push({ actionPath: node.leaf.actionPath, label: node.leaf.label });
		}
		return;
	}

	for (const child of node.children) {
		collectActionTargets(child, action, targets, seen);
	}
}
