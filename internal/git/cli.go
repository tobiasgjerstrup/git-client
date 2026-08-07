package git

// GitCLI implements GitService by executing the git CLI directly for every operation.
type GitCLI struct{}

// GetStatus returns the repository status using git status information.
func (c *GitCLI) GetStatus(repoPath string) (*GitStatusResult, error) {
	return GitStatus(repoPath)
}

// GetDiff returns the repository diff for unstaged changes.
func (c *GitCLI) GetDiff(repoPath string) (*GitDiffResult, error) {
	return GitDiff(repoPath)
}

// GetDiffStaged returns the repository diff for staged changes.
func (c *GitCLI) GetDiffStaged(repoPath string) (*GitDiffResult, error) {
	return GitDiffStaged(repoPath)
}

// GetCommitHistory returns the recent commit history for the repository.
func (c *GitCLI) GetCommitHistory(repoPath string) (*[]Commit, error) {
	return GetCommitHistory(repoPath)
}

// GetBranches returns local and remote branch metadata.
func (c *GitCLI) GetBranches(repoPath string) (*[]GitBranch, error) {
	return GetGitBranches(repoPath)
}

// StageFile stages the specified path in the current repository.
func (c *GitCLI) StageFile(repoPath, path string) (string, error) {
	return StageGitFile(repoPath, path)
}

// UnstageFile removes the specified path from the staging index.
func (c *GitCLI) UnstageFile(repoPath, path string) (string, error) {
	return UnstageGitFile(repoPath, path)
}

// DiscardFile discards local changes for the specified path.
func (c *GitCLI) DiscardFile(repoPath, path string) (string, error) {
	return DiscardGitFile(repoPath, path)
}

// ResolveConflict resolves a merge conflict using the specified strategy.
func (c *GitCLI) ResolveConflict(repoPath, path, strategy string) error {
	return ResolveGitConflict(repoPath, path, strategy)
}

// AbortMerge aborts an in-progress merge operation.
func (c *GitCLI) AbortMerge(repoPath string) error {
	return AbortGitMerge(repoPath)
}

// ContinueMerge completes a merge after conflicts have been resolved.
func (c *GitCLI) ContinueMerge(repoPath string) error {
	return ContinueGitMerge(repoPath)
}

// Commit creates a new commit with the provided message.
func (c *GitCLI) Commit(repoPath, message string) error {
	return CommitGitChanges(repoPath, message)
}

// SwitchBranch checks out the requested branch.
func (c *GitCLI) SwitchBranch(repoPath, branch string) error {
	return SwitchGitBranch(repoPath, branch)
}

// DeleteBranch removes the given branch, optionally forcing deletion.
func (c *GitCLI) DeleteBranch(repoPath, branch string, force bool) error {
	return DeleteGitBranch(repoPath, branch, force)
}

// ArchiveBranch renames and archives the given branch locally and remotely.
func (c *GitCLI) ArchiveBranch(repoPath, branch string, deleteRemote bool) error {
	return ArchiveGitBranch(repoPath, branch, deleteRemote)
}

// ArchiveRemoteBranch archives a remote branch and optionally deletes the original remote branch.
func (c *GitCLI) ArchiveRemoteBranch(repoPath, branch string, deleteRemote bool) error {
	return ArchiveRemoteGitBranch(repoPath, branch, deleteRemote)
}

// Push sends local commits to the configured remote.
func (c *GitCLI) Push(repoPath string) error {
	return PushGitChanges(repoPath)
}

// Pull fetches and merges remote changes into the current branch.
func (c *GitCLI) Pull(repoPath string) error {
	return PullGitChanges(repoPath)
}

// Fetch runs git fetch to update remote references.
func (c *GitCLI) Fetch(repoPath string) (string, error) {
	return GitFetch(repoPath)
}

// Prune runs git fetch --prune to remove stale remote-tracking branches.
func (c *GitCLI) Prune(repoPath string) (string, error) {
	return GitPrune(repoPath)
}

// GetCommit returns the parsed commit object for a specific hash.
func (c *GitCLI) GetCommit(repoPath, hash string) (*CommitObject, error) {
	raw, err := runGitForRepo(repoPath, "cat-file", "commit", hash)
	if err != nil {
		return nil, err
	}
	co, err := ParseCommit([]byte(raw))
	if err != nil {
		return nil, err
	}
	co.Hash = hash
	return co, nil
}

// GetTree returns the tree entries for the specified tree hash.
func (c *GitCLI) GetTree(repoPath, hash string) ([]TreeEntry, error) {
	raw, err := runGitForRepo(repoPath, "cat-file", "tree", hash)
	if err != nil {
		return nil, err
	}
	return ParseTree([]byte(raw))
}

// GetFileContent returns the blob content for a given repository path.
func (c *GitCLI) GetFileContent(repoPath, path string) ([]byte, error) {
	out, err := runGitForRepo(repoPath, "cat-file", "blob", "HEAD:"+path)
	if err != nil {
		return nil, err
	}
	return []byte(out), nil
}

// Close satisfies the GitService interface; no cleanup is required for GitCLI.
func (c *GitCLI) Close() error {
	return nil
}
