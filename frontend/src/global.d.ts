export {};

declare global {
	interface Window {
		go: any;
		pickFolder: () => Promise<void>;
		openRecentRepository: (repoPath: string) => Promise<void>;
		openSettings: () => void;
		closeSettings: () => void;
		selectTheme: (themeName: "aurora" | "midnight") => void;
		clearRecentRepositories: () => void;
		removeRecentRepository: (repoPath: string) => void;
		setMaxRecentRepositories: (value: number) => void;
		stageGitFile: (filePath: string, changeKey?: string) => Promise<void>;
		unstageGitFile: (filePath: string, changeKey?: string) => Promise<void>;
		resolveGitConflict: (filePath: string, strategy: "ours" | "theirs", changeKey?: string) => Promise<void>;
		abortMerge: () => Promise<void>;
		continueMerge: () => Promise<void>;
		pruneGitBranches: () => Promise<void>;
		pushGitChanges: () => Promise<void>;
		pullGitChanges: () => Promise<void>;
		commitGitChanges: (message: string) => Promise<void>;
		switchGitBranch: (branchName: string) => Promise<void>;
		discardGitFile: (filePath: string, description?: string, changeKey?: string) => Promise<void>;
		confirmDiscardGitFile: () => Promise<void>;
		cancelDiscardGitFile: () => void;
		promptBranchSwitch: (branchName: string, isRemote?: boolean) => void;
		confirmBranchSwitch: () => Promise<void>;
		cancelBranchSwitch: () => void;
		promptDeleteBranch: (branchName: string, forceDelete?: boolean) => void;
		confirmDeleteBranch: () => Promise<void>;
		cancelDeleteBranch: () => void;
		selectGitChange: (event: MouseEvent, key: string) => void;
		refresh(): Promise<void>;
		toggleDiff: (el: HTMLElement) => void;
	}
}
