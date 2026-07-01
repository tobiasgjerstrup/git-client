export type GitSelectionAction = "stage" | "unstage" | "discard";

export type GitSelectionEntry = {
	key: string;
	actionPath: string;
	label: string;
	supportedActions: GitSelectionAction[];
};

const renderedEntries: GitSelectionEntry[] = [];
const selectedKeys = new Set<string>();
let anchorKey: string | null = null;

export function setRenderedGitEntries(entries: GitSelectionEntry[]): void {
	renderedEntries.splice(0, renderedEntries.length, ...entries);

	const visibleKeys = new Set(entries.map((entry) => entry.key));
	for (const key of Array.from(selectedKeys)) {
		if (!visibleKeys.has(key)) {
			selectedKeys.delete(key);
		}
	}

	if (anchorKey && !visibleKeys.has(anchorKey)) {
		anchorKey = null;
	}

	syncSelectedEntries();
}

export function handleGitSelectionClick(event: MouseEvent, key: string): void {
	const target = event.target as HTMLElement | null;
	if (target?.closest("button") || target?.closest(".diff-content")) {
		return;
	}

	const entryIndex = renderedEntries.findIndex((entry) => entry.key === key);
	if (entryIndex < 0) {
		return;
	}

	const useRangeSelection = event.shiftKey && anchorKey !== null;
	const useToggleSelection = event.ctrlKey || event.metaKey;
	const isAlreadySelected = selectedKeys.has(key);

	if (useRangeSelection) {
		const anchorIndex = renderedEntries.findIndex((entry) => entry.key === anchorKey);
		if (anchorIndex >= 0) {
			const [start, end] = anchorIndex < entryIndex ? [anchorIndex, entryIndex] : [entryIndex, anchorIndex];
			if (!useToggleSelection) {
				selectedKeys.clear();
			}
			for (let index = start; index <= end; index++) {
				selectedKeys.add(renderedEntries[index].key);
			}
		} else {
			selectedKeys.clear();
			selectedKeys.add(key);
		}
	} else if (useToggleSelection) {
		if (selectedKeys.has(key)) {
			selectedKeys.delete(key);
		} else {
			selectedKeys.add(key);
		}
	} else if (isAlreadySelected) {
		selectedKeys.delete(key);
	} else {
		selectedKeys.clear();
		selectedKeys.add(key);
	}

	if (selectedKeys.size === 0) {
		anchorKey = null;
	} else if (!useToggleSelection || selectedKeys.has(key)) {
		anchorKey = key;
	}
	syncSelectedEntries();
}

export function getGitSelectionTargets(action: GitSelectionAction, clickedKey?: string): GitSelectionEntry[] {
	if (clickedKey === undefined) {
		return getSelectedActionTargets(action);
	}

	const clickedEntry = clickedKey
		? renderedEntries.find((entry) => entry.key === clickedKey)
		: undefined;
	if (!clickedEntry || !clickedEntry.supportedActions.includes(action)) {
		return [];
	}

	const selectedIncludesClicked = selectedKeys.has(clickedEntry.key);
	const candidates = selectedIncludesClicked
		? renderedEntries.filter((entry) => selectedKeys.has(entry.key) && entry.supportedActions.includes(action))
		: [clickedEntry];

	const seenPaths = new Set<string>();
	const targets: GitSelectionEntry[] = [];
	for (const entry of candidates) {
		if (seenPaths.has(entry.actionPath)) {
			continue;
		}
		seenPaths.add(entry.actionPath);
		targets.push(entry);
	}

	return targets;
}

function getSelectedActionTargets(action: GitSelectionAction): GitSelectionEntry[] {
	const candidates = renderedEntries.filter((entry) => selectedKeys.has(entry.key) && entry.supportedActions.includes(action));
	const seenPaths = new Set<string>();
	const targets: GitSelectionEntry[] = [];

	for (const entry of candidates) {
		if (seenPaths.has(entry.actionPath)) {
			continue;
		}
		seenPaths.add(entry.actionPath);
		targets.push(entry);
	}

	return targets;
}

export function handleGitSelectionKeydown(event: KeyboardEvent): void {
	const target = event.target as HTMLElement | null;
	if (target?.closest("input, textarea, [contenteditable='true']")) {
		return;
	}

	if (event.key === "Escape") {
		if (selectedKeys.size === 0) {
			return;
		}

		event.preventDefault();
		clearGitSelection();
		return;
	}

	if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) {
		return;
	}

	if (event.key.toLowerCase() !== "a") {
		return;
	}

	event.preventDefault();
	selectedKeys.clear();
	for (const entry of renderedEntries) {
		selectedKeys.add(entry.key);
	}

	anchorKey = renderedEntries.length > 0 ? renderedEntries[0].key : null;
	syncSelectedEntries();
}

function clearGitSelection(): void {
	selectedKeys.clear();
	anchorKey = null;
	syncSelectedEntries();
}

function syncSelectedEntries(): void {
	const rows = document.querySelectorAll<HTMLElement>("[data-change-key]");
	rows.forEach((row) => {
		const key = row.dataset.changeKey;
		if (!key) {
			return;
		}

		row.classList.toggle("selected", selectedKeys.has(key));
	});

	syncSelectionActionBar();
}

function syncSelectionActionBar(): void {
	const selectionActions = document.getElementById("SelectionActions");
	if (!selectionActions) {
		return;
	}

	const hasSelection = selectedKeys.size > 0;
	selectionActions.hidden = !hasSelection;

	const selectionSummary = document.getElementById("SelectionActionsSummary");
	if (selectionSummary) {
		selectionSummary.textContent = hasSelection ? `${selectedKeys.size} selected` : "";
	}

	const stageButton = document.getElementById("StageSelectedButton") as HTMLButtonElement | null;
	if (stageButton) {
		stageButton.disabled = getSelectedActionTargets("stage").length === 0;
	}

	const unstageButton = document.getElementById("UnstageSelectedButton") as HTMLButtonElement | null;
	if (unstageButton) {
		unstageButton.disabled = getSelectedActionTargets("unstage").length === 0;
	}

	const discardButton = document.getElementById("DiscardSelectedButton") as HTMLButtonElement | null;
	if (discardButton) {
		discardButton.disabled = getSelectedActionTargets("discard").length === 0;
	}
}
