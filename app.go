package main

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"tobiasgitclient/internal/git"
)

// App struct
type App struct {
	ctx      context.Context
	repoPath string
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) PickFolder() string {
	folder, _ := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select a folder",
	})
	if folder != "" {
		a.repoPath = folder
	}
	return folder
}

func (a *App) RunGitStatus() (*git.GitStatusResult, error) {
	return git.GitStatus(a.repoPath)
}

func (a *App) GitFetch() (string, error) {
	return git.GitFetch(a.repoPath)
}

func (a *App) GitDiff() (*git.GitDiffResult, error) {
	return git.GitDiff(a.repoPath)
}

func (a *App) GetCommitHistory() (*[]git.Commit, error) {
	return git.GetCommitHistory(a.repoPath)
}

func (a *App) DiscardGitFile(filePath string) (string, error) {
	return git.DiscardGitFile(a.repoPath, filePath)
}

func (a *App) StageGitFile(filePath string) (string, error) {
	return git.StageGitFile(a.repoPath, filePath)
}

func (a *App) CommitGitChanges(message string) error {
	return git.CommitGitChanges(a.repoPath, message)
}

func (a *App) SwitchGitBranch(branchName string) error {
	return git.SwitchGitBranch(a.repoPath, branchName)
}

func (a *App) PushGitChanges() error {
	return git.PushGitChanges(a.repoPath)
}

func (a *App) PullGitChanges() error {
	return git.PullGitChanges(a.repoPath)
}

func (a *App) UnstageGitFile(filePath string) (string, error) {
	return git.UnstageGitFile(a.repoPath, filePath)
}

func (a *App) GetGitBranches() (*[]git.GitBranch, error) {
	return git.GetGitBranches(a.repoPath)
}
