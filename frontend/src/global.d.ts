export {};

declare global {
	interface Window {
		go: any;
		pickFolder: () => Promise<void>;
		stageGitFile: (filePath: string, changeKey?: string) => Promise<void>;
		unstageGitFile: (filePath: string, changeKey?: string) => Promise<void>;
		pushGitChanges: () => Promise<void>;
		pullGitChanges: () => Promise<void>;
		commitGitChanges: (message: string) => Promise<void>;
		switchGitBranch: (branchName: string) => Promise<void>;
		discardGitFile: (filePath: string, description?: string, changeKey?: string) => Promise<void>;
		confirmDiscardGitFile: () => Promise<void>;
		cancelDiscardGitFile: () => void;
		selectGitChange: (event: MouseEvent, key: string) => void;
		refresh(): Promise<void>;
		toggleDiff: (el: HTMLElement) => void;
	}
}
