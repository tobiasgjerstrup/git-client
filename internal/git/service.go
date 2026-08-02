package git

import "context"

type GitService interface {
	GetStatus(repoPath string) (*GitStatusResult, error)
	GetDiff(repoPath string) (*GitDiffResult, error)
	GetDiffStaged(repoPath string) (*GitDiffResult, error)
	GetCommitHistory(repoPath string) (*[]Commit, error)
	GetBranches(repoPath string) (*[]GitBranch, error)

	StageFile(repoPath, path string) (string, error)
	UnstageFile(repoPath, path string) (string, error)
	DiscardFile(repoPath, path string) (string, error)
	ResolveConflict(repoPath, path, strategy string) error
	AbortMerge(repoPath string) error
	ContinueMerge(repoPath string) error
	Commit(repoPath, message string) error
	SwitchBranch(repoPath, branch string) error
	DeleteBranch(repoPath, branch string, force bool) error
	ArchiveBranch(repoPath, branch string, deleteRemote bool) error
	ArchiveRemoteBranch(repoPath, branch string, deleteRemote bool) error
	Push(repoPath string) error
	Pull(repoPath string) error
	Fetch(repoPath string) (string, error)
	Prune(repoPath string) (string, error)

	GetCommit(repoPath, hash string) (*CommitObject, error)
	GetTree(repoPath, hash string) ([]TreeEntry, error)
	GetFileContent(repoPath, path string) ([]byte, error)

	Close() error
}

var _ GitService = (*GitEngine)(nil)
var _ GitService = (*GitCLI)(nil)

// NewGitService creates a GitService backed by the GitEngine, with optional batching.
func NewGitService(ctx context.Context, opts EngineOptions) GitService {
	return NewGitEngine(ctx, opts)
}

// NewGitServiceCLIOnly creates a GitService that always executes git commands directly.
func NewGitServiceCLIOnly() GitService {
	return &GitCLI{}
}
