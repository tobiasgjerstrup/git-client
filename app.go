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

func NewApp() *App {
	return &App{
		gitService: git.NewGitService(context.Background(), git.EngineOptions{
			EnableBatchProcess: true,
		}),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	git.SetLogger(func(level git.LogLevel, message string) {
		a.emitBackendLog(string(level), message)
	})
	a.emitBackendLog("info", "Backend startup complete")
}

func (a *App) shutdown(ctx context.Context) {
	git.SetLogger(nil)
	a.gitService.Close()
	git.CleanupGitCommand()
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

func (a *App) SetRepositoryPath(path string) {
	a.repoPath = path
}

func (a *App) SetGitCommand(command string) {
	git.SetGitCommand(command)
}

func (a *App) RunGitStatus() (*git.GitStatusResult, error) {
	result, err := a.gitService.GetStatus(a.repoPath)
	a.logBackendError("RunGitStatus", err)
	return result, err
}

func (a *App) GitFetch() (string, error) {
	result, err := a.gitService.Fetch(a.repoPath)
	a.logBackendError("GitFetch", err)
	return result, err
}

func (a *App) GitPrune() (string, error) {
	result, err := a.gitService.Prune(a.repoPath)
	a.logBackendError("GitPrune", err)
	return result, err
}

func (a *App) GitDiff() (*git.GitDiffResult, error) {
	result, err := a.gitService.GetDiff(a.repoPath)
	a.logBackendError("GitDiff", err)
	return result, err
}

func (a *App) GitDiffStaged() (*git.GitDiffResult, error) {
	result, err := a.gitService.GetDiffStaged(a.repoPath)
	a.logBackendError("GitDiffStaged", err)
	return result, err
}

func (a *App) GetCommitHistory() (*[]git.Commit, error) {
	result, err := a.gitService.GetCommitHistory(a.repoPath)
	a.logBackendError("GetCommitHistory", err)
	return result, err
}

func (a *App) DiscardGitFile(filePath string) (string, error) {
	result, err := a.gitService.DiscardFile(a.repoPath, filePath)
	a.logBackendError("DiscardGitFile", err)
	return result, err
}

func (a *App) StageGitFile(filePath string) (string, error) {
	result, err := a.gitService.StageFile(a.repoPath, filePath)
	a.logBackendError("StageGitFile", err)
	return result, err
}

func (a *App) ResolveGitConflict(filePath string, strategy string) error {
	err := a.gitService.ResolveConflict(a.repoPath, filePath, strategy)
	a.logBackendError("ResolveGitConflict", err)
	return err
}

func (a *App) AbortMerge() error {
	err := a.gitService.AbortMerge(a.repoPath)
	a.logBackendError("AbortMerge", err)
	return err
}

func (a *App) ContinueMerge() error {
	err := a.gitService.ContinueMerge(a.repoPath)
	a.logBackendError("ContinueMerge", err)
	return err
}

func (a *App) CommitGitChanges(message string) error {
	err := a.gitService.Commit(a.repoPath, message)
	a.logBackendError("CommitGitChanges", err)
	return err
}

func (a *App) SwitchGitBranch(branchName string) error {
	err := a.gitService.SwitchBranch(a.repoPath, branchName)
	return err
}

func (a *App) DeleteGitBranch(branchName string, force bool) error {
	err := a.gitService.DeleteBranch(a.repoPath, branchName, force)
	a.logBackendError("DeleteGitBranch", err)
	return err
}

func (a *App) PushGitChanges() error {
	err := a.gitService.Push(a.repoPath)
	return err
}

func (a *App) PullGitChanges() error {
	err := a.gitService.Pull(a.repoPath)
	a.logBackendError("PullGitChanges", err)
	return err
}

func (a *App) UnstageGitFile(filePath string) (string, error) {
	result, err := a.gitService.UnstageFile(a.repoPath, filePath)
	a.logBackendError("UnstageGitFile", err)
	return result, err
}

func (a *App) GetGitBranches() (*[]git.GitBranch, error) {
	result, err := a.gitService.GetBranches(a.repoPath)
	a.logBackendError("GetGitBranches", err)
	return result, err
}

func (a *App) logBackendError(operation string, err error) {
	if err == nil {
		return
	}

	a.emitBackendLog("error", fmt.Sprintf("%s failed: %v", operation, err))
}

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
