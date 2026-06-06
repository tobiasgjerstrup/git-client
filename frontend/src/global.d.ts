export {};

declare global {
	interface Window {
		go: any;
		pickFolder: () => Promise<void>;
		runGitStatus: () => Promise<void>;
	}
}
