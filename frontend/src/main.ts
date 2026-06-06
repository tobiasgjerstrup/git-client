import './style.css';
import './app.css';

import logo from './assets/images/logo-universal.png';
import {Greet} from '../wailsjs/go/main/App';

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
	const output = await window.go.main.App.RunGitStatus(openedFolder);
	document.getElementById("result")!.innerText = output;
}

document.querySelector('#app')!.innerHTML = `
    <img id="logo" class="logo">
      <div class="input-box" id="input">
        <input class="input" id="name" type="text" autocomplete="off" />
        <button class="btn" onclick="greet()">Greet</button>
      </div>
	  <div>
	    <button id="Pick Folder" onclick="pickFolder()">Pick Folder</button>
		<button id="Run Git Status" onclick="runGitStatus()">Run Git Status</button>
		<div class="result" id="result">Please enter your name below 👇</div>
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
