package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"tobiasgitclient/internal/git"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const backendLogEventName = "backend:log"

type backendLogPayload struct {
	Level     string `json:"level"`
	Message   string `json:"message"`
	Timestamp string `json:"timestamp"`
	Source    string `json:"source"`
}

type App struct {
	ctx        context.Context
	repoPath   string
	gitService git.GitService
}

// NewApp constructs the application backend with a configured Git service.
func NewApp() *App {
	return &App{
		gitService: git.NewGitService(context.Background(), git.EngineOptions{
			EnableBatchProcess: true,
		}),
	}
}

// startup initializes the backend and attaches the Git logger to frontend events.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	git.SetLogger(func(level git.LogLevel, message string) {
		a.emitBackendLog(string(level), message)
	})
	a.emitBackendLog("info", "Backend startup complete")
}

// shutdown cleans up backend resources and resets the Git command launcher.
func (a *App) shutdown(ctx context.Context) {
	git.SetLogger(nil)
	a.gitService.Close()
	git.CleanupGitCommand()
}

// PickFolder opens a directory selection dialog and sets the repository path.
func (a *App) PickFolder() string {
	folder, _ := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select a folder",
	})
	if folder != "" {
		a.repoPath = folder
	}
	return folder
}

// SetRepositoryPath updates the currently open repository path.
func (a *App) SetRepositoryPath(path string) {
	a.repoPath = path
}

// SetGitCommand configures the Git executable command.
func (a *App) SetGitCommand(command string) {
	git.SetGitCommand(command)
}

// SetGitRemoteCommand configures the remote Git executable command.
func (a *App) SetGitRemoteCommand(command string) {
	git.SetGitRemoteCommand(command)
}

// SetMaxStageFileSize configures the max allowed staged file size.
func (a *App) SetMaxStageFileSize(size int64) {
	git.SetMaxStageFileSize(size)
}

// RunGitStatus retrieves the current repository status over the active repo path.
func (a *App) RunGitStatus() (*git.GitStatusResult, error) {
	result, err := a.gitService.GetStatus(a.repoPath)
	a.logBackendError("RunGitStatus", err)
	return result, err
}

// GitFetch performs a git fetch against the active repository.
func (a *App) GitFetch() (string, error) {
	result, err := a.gitService.Fetch(a.repoPath)
	a.logBackendError("GitFetch", err)
	return result, err
}

// GitPrune removes stale remote-tracking references in the active repository.
func (a *App) GitPrune() (string, error) {
	result, err := a.gitService.Prune(a.repoPath)
	a.logBackendError("GitPrune", err)
	return result, err
}

// GitDiff returns the unstaged diff for the active repository.
func (a *App) GitDiff() (*git.GitDiffResult, error) {
	result, err := a.gitService.GetDiff(a.repoPath)
	a.logBackendError("GitDiff", err)
	return result, err
}

// GitDiffStaged returns the staged diff for the active repository.
func (a *App) GitDiffStaged() (*git.GitDiffResult, error) {
	result, err := a.gitService.GetDiffStaged(a.repoPath)
	a.logBackendError("GitDiffStaged", err)
	return result, err
}

// GetCommitHistory returns the list of recent commits from the active repository.
func (a *App) GetCommitHistory() (*[]git.Commit, error) {
	result, err := a.gitService.GetCommitHistory(a.repoPath)
	a.logBackendError("GetCommitHistory", err)
	return result, err
}

// DiscardGitFile discards changes for a file in the active repository.
func (a *App) DiscardGitFile(filePath string) (string, error) {
	result, err := a.gitService.DiscardFile(a.repoPath, filePath)
	a.logBackendError("DiscardGitFile", err)
	return result, err
}

// StageGitFile stages a file in the active repository.
func (a *App) StageGitFile(filePath string) (string, error) {
	result, err := a.gitService.StageFile(a.repoPath, filePath)
	a.logBackendError("StageGitFile", err)
	return result, err
}

// ResolveGitConflict resolves a merge conflict for a file using the given strategy.
func (a *App) ResolveGitConflict(filePath string, strategy string) error {
	err := a.gitService.ResolveConflict(a.repoPath, filePath, strategy)
	a.logBackendError("ResolveGitConflict", err)
	return err
}

// AbortMerge aborts an in-progress merge in the active repository.
func (a *App) AbortMerge() error {
	err := a.gitService.AbortMerge(a.repoPath)
	a.logBackendError("AbortMerge", err)
	return err
}

// ContinueMerge continues an in-progress merge in the active repository.
func (a *App) ContinueMerge() error {
	err := a.gitService.ContinueMerge(a.repoPath)
	a.logBackendError("ContinueMerge", err)
	return err
}

// CommitGitChanges creates a commit with the provided message.
func (a *App) CommitGitChanges(message string) error {
	err := a.gitService.Commit(a.repoPath, message)
	a.logBackendError("CommitGitChanges", err)
	return err
}

// SwitchGitBranch checks out the requested branch.
func (a *App) SwitchGitBranch(branchName string) error {
	err := a.gitService.SwitchBranch(a.repoPath, branchName)
	return err
}

// DeleteGitBranch removes a Git branch, optionally forcing deletion.
func (a *App) DeleteGitBranch(branchName string, force bool) error {
	err := a.gitService.DeleteBranch(a.repoPath, branchName, force)
	a.logBackendError("DeleteGitBranch", err)
	return err
}

// ArchiveGitBranch archives a branch locally and optionally deletes it remotely.
func (a *App) ArchiveGitBranch(branchName string, deleteRemote bool) error {
	err := a.gitService.ArchiveBranch(a.repoPath, branchName, deleteRemote)
	a.logBackendError("ArchiveGitBranch", err)
	return err
}

// ArchiveRemoteGitBranch archives a remote branch and optionally removes it.
func (a *App) ArchiveRemoteGitBranch(branchName string, deleteRemote bool) error {
	err := a.gitService.ArchiveRemoteBranch(a.repoPath, branchName, deleteRemote)
	a.logBackendError("ArchiveRemoteGitBranch", err)
	return err
}

// PushGitChanges pushes local commits to the remote repository.
func (a *App) PushGitChanges() error {
	err := a.gitService.Push(a.repoPath)
	return err
}

// PullGitChanges pulls updates from the remote repository.
func (a *App) PullGitChanges() error {
	err := a.gitService.Pull(a.repoPath)
	a.logBackendError("PullGitChanges", err)
	return err
}

// UnstageGitFile unstages a file from the index.
func (a *App) UnstageGitFile(filePath string) (string, error) {
	result, err := a.gitService.UnstageFile(a.repoPath, filePath)
	a.logBackendError("UnstageGitFile", err)
	return result, err
}

// GetGitBranches returns the set of branches visible from the active repository.
func (a *App) GetGitBranches() (*[]git.GitBranch, error) {
	result, err := a.gitService.GetBranches(a.repoPath)
	a.logBackendError("GetGitBranches", err)
	return result, err
}

// logBackendError emits a backend log entry when an operation returns an error.
func (a *App) logBackendError(operation string, err error) {
	if err == nil {
		return
	}

	a.emitBackendLog("error", fmt.Sprintf("%s failed: %v", operation, err))
}

// emitBackendLog sends a structured log event to the frontend.
func (a *App) emitBackendLog(level string, message string) {
	if a.ctx == nil {
		return
	}

	trimmedMessage := strings.TrimSpace(message)
	if trimmedMessage == "" {
		return
	}

	runtime.EventsEmit(a.ctx, backendLogEventName, backendLogPayload{
		Level:     level,
		Message:   trimmedMessage,
		Timestamp: time.Now().Format(time.RFC3339Nano),
		Source:    "backend",
	})
}
