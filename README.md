# README

## About

This is the official Wails Vanilla-TS template.

You can configure the project by editing `wails.json`. More information about the project settings can be found
here: https://wails.io/docs/reference/project-config

## Live Development

To run in live development mode, run `wails dev` in the project directory. This will run a Vite development
server that will provide very fast hot reload of your frontend changes. If you want to develop in a browser
and have access to your Go methods, there is also a dev server that runs on http://localhost:34115. Connect
to this in your browser, and you can call your Go code from devtools.

## Building

To build a redistributable, production mode package, use `wails build`.

## Linux

The app now uses only cross-platform git process settings in shared code, so the Go backend builds on Linux as well.

To run or build it on Linux:

- Install `git`
- Install the Linux dependencies required by Wails/WebKitGTK: https://wails.io/docs/gettingstarted/installation#linux
- Run `wails dev` for development or `wails build` for a production build
