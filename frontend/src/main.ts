import './style.css';
import './app.css';

import logo from './assets/images/logo-universal.png';
import {Greet} from '../wailsjs/go/main/App';
import { generateGitStatusHtml, GitStatusOutput} from './git';

// Setup the greet function
window.greet = function () {
    // Get name
    let name = nameElement!.value;

    // Check if the input is empty
    if (name === "") return;

    // Call App.Greet(name)
    try {
        Greet(name)
            .then((result) => {
                // Update result with data back from App.Greet()
                resultElement!.innerText = result;
            })
            .catch((err) => {
                console.error(err);
            });
    } catch (err: unknown) {
        console.error(err);
    }
};

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

document.querySelector('#app')!.innerHTML = `
    <img id="logo" class="logo">
	  <div>
		<input id="commit message" placeholder="Enter commit message">
		<button id="Commit Changes" onclick="commitGitChanges()">Commit Changes</button>
		<button id="Push Changes" onclick="pushGitChanges()">Push Changes</button>
		<button id="Pull Changes" onclick="pullGitChanges()">Pull Changes</button>
	    <button id="Pick Folder" onclick="pickFolder()">Pick Folder</button>
		<button id="Run Git Status" onclick="runGitStatus()">Run Git Status</button>
		<div class="result" id="result"></div>
	  </div>
    </div>
`;
(document.getElementById('logo') as HTMLImageElement).src = logo;

let nameElement = (document.getElementById("name") as HTMLInputElement);
nameElement.focus();
let resultElement = document.getElementById("result");


declare global {
    interface Window {
        greet: () => void;
    }
}
