package git

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"
)

type EngineOptions struct {
	MaxObjectSize      int64
	EnableBatchProcess bool
	RequestTimeout     time.Duration
}

type GitEngine struct {
	cli  *GitCLI
	opts EngineOptions

	mu     sync.Mutex
	bp     *BatchProcess
	bpRepo string
	ctx    context.Context
	cancel context.CancelFunc
}

// NewGitEngine creates a GitEngine that can optionally use a background batch process for Git object retrieval.
func NewGitEngine(parentCtx context.Context, opts EngineOptions) *GitEngine {
	if opts.MaxObjectSize <= 0 {
		opts.MaxObjectSize = defaultMaxObjectSize
	}
	if opts.RequestTimeout <= 0 {
		opts.RequestTimeout = 10 * time.Second
	}
	if !opts.EnableBatchProcess {
		opts.EnableBatchProcess = true
	}

	ctx, cancel := context.WithCancel(parentCtx)

	return &GitEngine{
		cli:    &GitCLI{},
		opts:   opts,
		ctx:    ctx,
		cancel: cancel,
	}
}

// acquireBatch returns a healthy batch process for the repository, or nil if batching is disabled or unavailable.
func (e *GitEngine) acquireBatch(repoPath string) *BatchProcess {
	if !e.opts.EnableBatchProcess || repoPath == "" {
		return nil
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	if e.bp != nil && e.bp.IsHealthy() && e.bpRepo == repoPath {
		return e.bp
	}

	if e.bp != nil {
		e.bp.Close()
		e.bp = nil
		e.bpRepo = ""
	}

	bp := NewBatchProcess(e.opts.MaxObjectSize)
	if err := bp.Start(e.ctx, repoPath); err != nil {
		Warnf("Failed to start batch process: %v", err)
		return nil
	}

	e.bp = bp
	e.bpRepo = repoPath
	return bp
}

// GetStatus returns the current repository status using the underlying Git CLI.
func (e *GitEngine) GetStatus(repoPath string) (*GitStatusResult, error) {
	return e.cli.GetStatus(repoPath)
}

// GetDiff returns the unstaged diff using the underlying Git CLI.
func (e *GitEngine) GetDiff(repoPath string) (*GitDiffResult, error) {
	return e.cli.GetDiff(repoPath)
}

// GetDiffStaged returns the staged diff using the underlying Git CLI.
func (e *GitEngine) GetDiffStaged(repoPath string) (*GitDiffResult, error) {
	return e.cli.GetDiffStaged(repoPath)
}

// GetCommitHistory returns recent commit metadata, using the batch process when available.
func (e *GitEngine) GetCommitHistory(repoPath string) (*[]Commit, error) {
	bp := e.acquireBatch(repoPath)

	if bp == nil {
		return e.cli.GetCommitHistory(repoPath)
	}

	out, err := e.cliRun(repoPath, "log", "--max-count=100", "--pretty=format:%H")
	if err != nil {
		Warnf("Error getting git log hashes: %v, falling back to CLI", err)
		return e.cli.GetCommitHistory(repoPath)
	}

	lines := strings.Split(strings.TrimSpace(out), "\n")
	commits := make([]Commit, 0, len(lines))

	for _, hash := range lines {
		hash = strings.TrimSpace(hash)
		if hash == "" {
			continue
		}

		co, err := e.requestCommit(bp, hash)
		if err != nil {
			Warnf("Error getting commit %s: %v", hash, err)
			continue
		}

		msg := co.Message
		if idx := strings.IndexByte(msg, '\n'); idx >= 0 {
			msg = msg[:idx]
		}

		commits = append(commits, Commit{
			Hash:    hash,
			Author:  co.Author.Name,
			Date:    co.Author.Time.Format("Mon Jan 2 15:04:05 2006 -0700"),
			Message: msg,
		})
	}

	return &commits, nil
}

// GetBranches returns branch metadata using the underlying Git CLI.
func (e *GitEngine) GetBranches(repoPath string) (*[]GitBranch, error) {
	return e.cli.GetBranches(repoPath)
}

// StageFile stages a file through the underlying Git CLI.
func (e *GitEngine) StageFile(repoPath, path string) (string, error) {
	return e.cli.StageFile(repoPath, path)
}

// UnstageFile removes a file from the staging index through the underlying Git CLI.
func (e *GitEngine) UnstageFile(repoPath, path string) (string, error) {
	return e.cli.UnstageFile(repoPath, path)
}

// DiscardFile discards local changes for a file through the underlying Git CLI.
func (e *GitEngine) DiscardFile(repoPath, path string) (string, error) {
	return e.cli.DiscardFile(repoPath, path)
}

// ResolveConflict processes a merge conflict resolution request through the underlying Git CLI.
func (e *GitEngine) ResolveConflict(repoPath, path, strategy string) error {
	return e.cli.ResolveConflict(repoPath, path, strategy)
}

// AbortMerge aborts an in-progress merge through the underlying Git CLI.
func (e *GitEngine) AbortMerge(repoPath string) error {
	return e.cli.AbortMerge(repoPath)
}

// ContinueMerge completes a merge through the underlying Git CLI.
func (e *GitEngine) ContinueMerge(repoPath string) error {
	return e.cli.ContinueMerge(repoPath)
}

// Commit creates a commit through the underlying Git CLI.
func (e *GitEngine) Commit(repoPath, message string) error {
	return e.cli.Commit(repoPath, message)
}

// SwitchBranch checks out the requested branch through the underlying Git CLI.
func (e *GitEngine) SwitchBranch(repoPath, branch string) error {
	return e.cli.SwitchBranch(repoPath, branch)
}

// DeleteBranch removes the requested branch through the underlying Git CLI.
func (e *GitEngine) DeleteBranch(repoPath, branch string, force bool) error {
	return e.cli.DeleteBranch(repoPath, branch, force)
}

// ArchiveBranch archives the requested branch through the underlying Git CLI.
func (e *GitEngine) ArchiveBranch(repoPath, branch string, deleteRemote bool) error {
	return e.cli.ArchiveBranch(repoPath, branch, deleteRemote)
}

// ArchiveRemoteBranch archives a remote branch through the underlying Git CLI.
func (e *GitEngine) ArchiveRemoteBranch(repoPath, branch string, deleteRemote bool) error {
	return e.cli.ArchiveRemoteBranch(repoPath, branch, deleteRemote)
}

// Push sends commits to the configured remote through the underlying Git CLI.
func (e *GitEngine) Push(repoPath string) error {
	return e.cli.Push(repoPath)
}

// Pull fetches and merges from the configured remote through the underlying Git CLI.
func (e *GitEngine) Pull(repoPath string) error {
	return e.cli.Pull(repoPath)
}

// Fetch updates remote references through the underlying Git CLI.
func (e *GitEngine) Fetch(repoPath string) (string, error) {
	return e.cli.Fetch(repoPath)
}

// Prune removes stale remote-tracking branches through the underlying Git CLI.
func (e *GitEngine) Prune(repoPath string) (string, error) {
	return e.cli.Prune(repoPath)
}

// GetCommit retrieves a commit object by hash, using the batch process when available.
func (e *GitEngine) GetCommit(repoPath, hash string) (*CommitObject, error) {
	bp := e.acquireBatch(repoPath)
	if bp == nil {
		return e.cli.GetCommit(repoPath, hash)
	}

	co, err := e.requestCommit(bp, hash)
	if err != nil {
		return e.cli.GetCommit(repoPath, hash)
	}
	return co, nil
}

// requestCommit fetches a commit object from the batch process and parses it.
func (e *GitEngine) requestCommit(bp *BatchProcess, hash string) (*CommitObject, error) {
	ctx, cancel := context.WithTimeout(e.ctx, e.opts.RequestTimeout)
	defer cancel()

	obj, err := bp.Request(ctx, hash)
	if err != nil {
		return nil, err
	}
	if obj.Type != ObjectCommit {
		return nil, fmt.Errorf("object %s is a %s, not a commit", hash, obj.Type)
	}

	co, err := ParseCommit(obj.Raw)
	if err != nil {
		return nil, err
	}
	co.Hash = hash
	return co, nil
}

// GetTree returns the blob entries of a tree object, using the batch process when available.
func (e *GitEngine) GetTree(repoPath, hash string) ([]TreeEntry, error) {
	bp := e.acquireBatch(repoPath)
	if bp == nil {
		return e.cli.GetTree(repoPath, hash)
	}

	ctx, cancel := context.WithTimeout(e.ctx, e.opts.RequestTimeout)
	defer cancel()

	obj, err := bp.Request(ctx, hash)
	if err != nil {
		return e.cli.GetTree(repoPath, hash)
	}
	if obj.Type != ObjectTree {
		return nil, fmt.Errorf("object %s is a %s, not a tree", hash, obj.Type)
	}

	return ParseTree(obj.Raw)
}

// GetFileContent returns the raw blob content of a file at HEAD, using the batch process when available.
func (e *GitEngine) GetFileContent(repoPath, path string) ([]byte, error) {
	bp := e.acquireBatch(repoPath)
	if bp == nil {
		return e.cli.GetFileContent(repoPath, path)
	}

	ctx, cancel := context.WithTimeout(e.ctx, e.opts.RequestTimeout)
	defer cancel()

	spec := "HEAD:" + path
	obj, err := bp.Request(ctx, spec)
	if err != nil {
		return e.cli.GetFileContent(repoPath, path)
	}
	if obj.Type != ObjectBlob {
		return nil, fmt.Errorf("path %s is a %s, not a blob", path, obj.Type)
	}

	return obj.Raw, nil
}

// cliRun executes a local git command in the specified repository, returning output or an error.
func (e *GitEngine) cliRun(repoPath string, args ...string) (string, error) {
	if repoPath == "" {
		return "", fmt.Errorf("no repository selected")
	}
	return runGitForRepo(repoPath, args...)
}

// Close shuts down the Git engine and any active batch process.
func (e *GitEngine) Close() error {
	e.cancel()

	e.mu.Lock()
	bp := e.bp
	e.bp = nil
	e.bpRepo = ""
	e.mu.Unlock()

	if bp != nil {
		return bp.Close()
	}
	return nil
}
