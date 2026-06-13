import './style.css';
import './app.css';
import './defaults.css';

import { getGitBranches, getGitCommits, gitDiff, gitFetch, gitStatus} from './git';

export let openedFolder: string | null = null;

window.pickFolder = async function () {
	const folder = await window.go.main.App.PickFolder();
	openedFolder = folder;

	loadHtml();
};

window.stageGitFile = async function (filePath: string) {
	filePath = openedFolder ? `${openedFolder}/${filePath}` : filePath;
	await window.go.main.App.StageGitFile(filePath);
	gitDiff();
	gitStatus();
}

window.unstageGitFile = async function (filePath: string) {
	filePath = openedFolder ? `${openedFolder}/${filePath}` : filePath;
	await window.go.main.App.UnstageGitFile(filePath);
	gitDiff();
	gitStatus();
}

window.commitGitChanges = async function () {
	const messageInput = document.getElementById("commit message") as HTMLInputElement;
	const message = messageInput.value;
	if (!message) {
		alert("Please enter a commit message.");
		return;
	}
	await window.go.main.App.CommitGitChanges(message);
	messageInput.value = "";
	window.refresh();
}

window.switchGitBranch = async function () {
	const branchInput = document.getElementById("branch name") as HTMLInputElement;
	const branchName = branchInput.value;
	if (!branchName) {
		alert("Please enter a branch name");
		return;
	}
	await window.go.main.App.SwitchGitBranch(branchName);
	branchInput.value = "";
	window.refresh();
}

window.refresh = async function () {
	await gitFetch();
	gitStatus();
	getGitCommits();
	getGitBranches();
	gitDiff();
}

window.discardGitFile = async function (filePath: string) {
	filePath = openedFolder ? `${openedFolder}/${filePath}` : filePath;
	await window.go.main.App.DiscardGitFile(filePath);
	gitDiff();
	gitStatus();
}

window.pushGitChanges = async function () {
	await window.go.main.App.PushGitChanges();
	getGitBranches();
}

window.pullGitChanges = async function () {
	await window.go.main.App.PullGitChanges();
	window.refresh();
}

import appHtml from './app.html?raw';
import branchPanelHtml from './panels/branchPanel.html?raw';
import commitPanelHtml from './panels/commitPanel.html?raw';

function loadHtml() {
	document.querySelector('#app')!.innerHTML = appHtml;
	document.getElementById('branchPanel')!.innerHTML = branchPanelHtml;
	document.getElementById('commitPanel')!.innerHTML = commitPanelHtml;
	window.refresh();
}

if (openedFolder) {
	loadHtml();
} else {
	document.querySelector('#app')!.innerHTML = `<div class="welcome">
	<h1>Welcome to Git GUI</h1>
	<p>Please select a folder to get started.</p>
	<button onclick="pickFolder()">Select Folder</button>
</div>`;
}

declare global {
    interface Window {
        greet: () => void;
    }
}
