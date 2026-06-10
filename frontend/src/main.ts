import './style.css';
import './app.css';

import { escapeHtml, generateGitStatusHtml, GitCommit, GitDiffOutput, GitStatusOutput} from './git';

let openedFolder: string | null = null;

window.pickFolder = async function () {
	const folder = await window.go.main.App.PickFolder();
	document.getElementById("result")!.innerText = folder ?? "No folder selected";
	openedFolder = folder;
};

window.runGitStatus = async function () {
	const output = await window.go.main.App.RunGitStatus(openedFolder) as GitStatusOutput;
	const resultHtml = generateGitStatusHtml(output);	
	document.getElementById("result")!.innerHTML = resultHtml;
	document.getElementById("branchName")!.innerText = `Current Branch: ${output.branchName}`;
}

window.stageGitFile = async function (filePath: string) {
	filePath = openedFolder ? `${openedFolder}/${filePath}` : filePath;
	await window.go.main.App.StageGitFile(filePath);
	await window.runGitStatus();
}

window.unstageGitFile = async function (filePath: string) {
	filePath = openedFolder ? `${openedFolder}/${filePath}` : filePath;
	console.log(`Unstaging file: ${filePath}`);
	await window.go.main.App.UnstageGitFile(filePath);
	await window.runGitStatus();
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
	await window.runGitStatus();
}

window.pushGitChanges = async function () {
	await window.go.main.App.PushGitChanges();
	await window.runGitStatus();
}

window.pullGitChanges = async function () {
	await window.go.main.App.PullGitChanges();
	await window.runGitStatus();
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
	await window.runGitStatus();
}

window.gitDiff = async function () {
	const output = await window.go.main.App.GitDiff() as GitDiffOutput;

	for (const file of output.files) {
		const newDiff: string[] = [];
		for (let line of file.diff.split("\n")) {
			if (line.startsWith("+") && !line.startsWith("+++ b/" + file.path)) {
				newDiff.push(`<span class="addedLine">${escapeHtml(line)}</span>`);
			} else if (line.startsWith("-") && !line.startsWith("--- a/" + file.path)) {
				newDiff.push(`<span class="removedLine">${escapeHtml(line)}</span>`);
			} else {
				newDiff.push(`<span class="unchangedLine">${escapeHtml(line)}</span>`);
			}
		}
		file.diff = newDiff.join("\n");
	}

	const changes = output.files.map(file => `<h3>${escapeHtml(file.path)}</h3><pre class="changedLinesContainer">${file.diff}</pre><p>Lines Added: ${file.linesAdded}, Lines Removed: ${file.linesRemoved}</p>`).join("");
	document.getElementById("changes")!.innerHTML = changes;
	console.log("Git diff output:", output);
}

window.getCommitHistory = async function () {
	const output = await window.go.main.App.GetCommitHistory() as GitCommit[];
	const commitsHtml = output.map(commit => `<p>${commit.date} - ${escapeHtml(commit.author)} - ${escapeHtml(commit.message)}</p>`).join("");
	document.getElementById("gitCommits")!.innerHTML = commitsHtml;
}

window.discardGitFile = async function (filePath: string) {
	filePath = openedFolder ? `${openedFolder}/${filePath}` : filePath;
	await window.go.main.App.DiscardGitFile(filePath);
	await window.runGitStatus();
}

import appHtml from './app.html?raw';
document.querySelector('#app')!.innerHTML = appHtml;

declare global {
    interface Window {
        greet: () => void;
    }
}
