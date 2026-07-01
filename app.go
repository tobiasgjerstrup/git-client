package main

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"tobiasgitclient/internal/git"
)

type App struct {
	ctx        context.Context
	repoPath   string
	gitService git.GitService
}

func NewApp() *App {
	return &App{
		gitService: git.NewGitService(context.Background(), git.EngineOptions{
			EnableBatchProcess: true,
		}),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) shutdown(ctx context.Context) {
	a.gitService.Close()
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
	return a.gitService.GetStatus(a.repoPath)
}

func (a *App) GitFetch() (string, error) {
	return a.gitService.Fetch(a.repoPath)
}

func (a *App) GitPrune() (string, error) {
	return a.gitService.Prune(a.repoPath)
}

func (a *App) GitDiff() (*git.GitDiffResult, error) {
	return a.gitService.GetDiff(a.repoPath)
}

func (a *App) GitDiffStaged() (*git.GitDiffResult, error) {
	return a.gitService.GetDiffStaged(a.repoPath)
}

func (a *App) GetCommitHistory() (*[]git.Commit, error) {
	return a.gitService.GetCommitHistory(a.repoPath)
}

func (a *App) DiscardGitFile(filePath string) (string, error) {
	return a.gitService.DiscardFile(a.repoPath, filePath)
}

func (a *App) StageGitFile(filePath string) (string, error) {
	return a.gitService.StageFile(a.repoPath, filePath)
}

func (a *App) CommitGitChanges(message string) error {
	return a.gitService.Commit(a.repoPath, message)
}

func (a *App) SwitchGitBranch(branchName string) error {
	return a.gitService.SwitchBranch(a.repoPath, branchName)
}

func (a *App) DeleteGitBranch(branchName string, force bool) error {
	return a.gitService.DeleteBranch(a.repoPath, branchName, force)
}

func (a *App) PushGitChanges() error {
	return a.gitService.Push(a.repoPath)
}

func (a *App) PullGitChanges() error {
	return a.gitService.Pull(a.repoPath)
}

func (a *App) UnstageGitFile(filePath string) (string, error) {
	return a.gitService.UnstageFile(a.repoPath, filePath)
}

func (a *App) GetGitBranches() (*[]git.GitBranch, error) {
	return a.gitService.GetBranches(a.repoPath)
}
