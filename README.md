# Tobias Git Client

A desktop Git client built with Wails (Go backend + TypeScript frontend).

This app is focused on fast local repository workflows:

- inspect staged and unstaged changes
- stage, unstage, and discard files
- run batch actions on multiple selected files
- view commit history
- switch/create/delete branches
- fetch, pull, push, and prune
- use swappable UI themes

## Tech Stack

- Go (backend)
- Wails v2 (desktop shell + bindings)
- TypeScript + Vite (frontend)
- Native Git CLI for repository operations

## Prerequisites

- Go 1.23+
- Node.js + npm
- Wails CLI (`wails`)
- Git installed and available on PATH

Wails install docs:
httpa://wails.io/docs/gettingstarted/installation

## Project Structure

- [app.go](app.go): Wails-bound application methods (folder picker + Git actions)
- [main.go](main.go): Wails app bootstrap and runtime config
- [internal/git](internal/git): Git service, CLI operations, parsing, and engine
- [frontend/src](frontend/src): UI, interaction logic, and styling
- [wails.json](wails.json): Wails project config

## Getting Started

1. Install frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

2. Start development mode:

```bash
wails dev
```

This starts the desktop app with live frontend reload.

## Build

Build a production desktop package:

```bash
wails build
```

Output artifacts are generated under [build](build).

## Usage Flow

1. Open the app.
2. Click Open Repository and select a Git repository folder.
3. Use the Changes panel for stage/unstage/discard actions.
4. Use Ctrl/Cmd + click or Shift + click to select multiple files, then run bulk actions.
5. Use top action controls for refresh/fetch/prune/pull/push/commit.
6. Manage branches from the Branches panel.

## Notes

- The app executes Git operations against the selected repository path.
- Selection-based actions are path-aware and support multi-file operations.
- Theme choice is persisted in local browser storage used by the frontend runtime.

## Linux

The backend uses cross-platform process configuration and builds on Linux.

In addition to the prerequisites above, install required Wails/WebKitGTK Linux packages:
https://wails.io/docs/gettingstarted/installation#linux

Then run:

```bash
wails dev
```

or

```bash
wails build
```
