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
	try {
		document.getElementById("CommitChanges")!.setAttribute("disabled", "");
		const messageInput = document.getElementById("CommitMessage") as HTMLInputElement;
		const message = messageInput.value;
		if (!message) {
			alert("Please enter a commit message.");
			document.getElementById("CommitChanges")!.removeAttribute("disabled");
			return;
		}
		await window.go.main.App.CommitGitChanges(message);
		messageInput.value = "";
	} finally {
		document.getElementById("CommitChanges")!.removeAttribute("disabled");
		window.refresh();
	}
}

window.switchGitBranch = async function () {
	try {
		document.getElementById("SwitchBranch")!.setAttribute("disabled", "");
		const branchInput = document.getElementById("BranchNameInput") as HTMLInputElement;
		const branchName = branchInput.value;
		if (!branchName) {
			alert("Please enter a branch name");
			document.getElementById("SwitchBranch")!.removeAttribute("disabled");
			return;
		}
		await window.go.main.App.SwitchGitBranch(branchName);
		branchInput.value = "";
		window.refresh();
	} finally {
		document.getElementById("SwitchBranch")!.removeAttribute("disabled");
	}
}

window.refresh = async function () {
	try {
		document.getElementById("Refresh")!.setAttribute("disabled", "");
		await gitFetch();
		await Promise.allSettled([
			gitStatus(),
			getGitCommits(),
			getGitBranches(),
			gitDiff(),
		]);
	} finally {
		document.getElementById("Refresh")!.removeAttribute("disabled");
	}
}

window.discardGitFile = async function (filePath: string) {
	filePath = openedFolder ? `${openedFolder}/${filePath}` : filePath;
	await window.go.main.App.DiscardGitFile(filePath);
	gitDiff();
	gitStatus();
}

window.pushGitChanges = async function () {
	try {
		document.getElementById("PushButton")!.setAttribute("disabled", "");
		await window.go.main.App.PushGitChanges();
		getGitBranches();
	} finally {
		document.getElementById("PushButton")!.removeAttribute("disabled");
	}
}

window.pullGitChanges = async function () {
	try {
		document.getElementById("PullChanges")!.setAttribute("disabled", "");
		await window.go.main.App.PullGitChanges();
		window.refresh();
	} finally {
		document.getElementById("PullChanges")!.removeAttribute("disabled");
	}
}

import appHtml from './app.html?raw';
import branchPanelHtml from './panels/branchPanel.html?raw';
import commitPanelHtml from './panels/commitPanel.html?raw';

function loadHtml() {
	document.querySelector('#app')!.innerHTML = appHtml;
	document.getElementById('BranchPanel')!.innerHTML = branchPanelHtml;
	document.getElementById('CommitPanel')!.innerHTML = commitPanelHtml;
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
