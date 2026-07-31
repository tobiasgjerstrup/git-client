package git

type GitCLI struct{}

func (c *GitCLI) GetStatus(repoPath string) (*GitStatusResult, error) {
	return GitStatus(repoPath)
}

func (c *GitCLI) GetDiff(repoPath string) (*GitDiffResult, error) {
	return GitDiff(repoPath)
}

func (c *GitCLI) GetDiffStaged(repoPath string) (*GitDiffResult, error) {
	return GitDiffStaged(repoPath)
}

func (c *GitCLI) GetCommitHistory(repoPath string) (*[]Commit, error) {
	return GetCommitHistory(repoPath)
}

func (c *GitCLI) GetBranches(repoPath string) (*[]GitBranch, error) {
	return GetGitBranches(repoPath)
}

func (c *GitCLI) StageFile(repoPath, path string) (string, error) {
	return StageGitFile(repoPath, path)
}

func (c *GitCLI) UnstageFile(repoPath, path string) (string, error) {
	return UnstageGitFile(repoPath, path)
}

func (c *GitCLI) DiscardFile(repoPath, path string) (string, error) {
	return DiscardGitFile(repoPath, path)
}

func (c *GitCLI) ResolveConflict(repoPath, path, strategy string) error {
	return ResolveGitConflict(repoPath, path, strategy)
}

func (c *GitCLI) AbortMerge(repoPath string) error {
	return AbortGitMerge(repoPath)
}

func (c *GitCLI) ContinueMerge(repoPath string) error {
	return ContinueGitMerge(repoPath)
}

func (c *GitCLI) Commit(repoPath, message string) error {
	return CommitGitChanges(repoPath, message)
}

func (c *GitCLI) SwitchBranch(repoPath, branch string) error {
	return SwitchGitBranch(repoPath, branch)
}

func (c *GitCLI) DeleteBranch(repoPath, branch string, force bool) error {
	return DeleteGitBranch(repoPath, branch, force)
}

func (c *GitCLI) ArchiveBranch(repoPath, branch string, deleteRemote bool) error {
	return ArchiveGitBranch(repoPath, branch, deleteRemote)
}

func (c *GitCLI) Push(repoPath string) error {
	return PushGitChanges(repoPath)
}

func (c *GitCLI) Pull(repoPath string) error {
	return PullGitChanges(repoPath)
}

func (c *GitCLI) Fetch(repoPath string) (string, error) {
	return GitFetch(repoPath)
}

func (c *GitCLI) Prune(repoPath string) (string, error) {
	return GitPrune(repoPath)
}

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

func (c *GitCLI) GetTree(repoPath, hash string) ([]TreeEntry, error) {
	raw, err := runGitForRepo(repoPath, "cat-file", "tree", hash)
	if err != nil {
		return nil, err
	}
	return ParseTree([]byte(raw))
}

func (c *GitCLI) GetFileContent(repoPath, path string) ([]byte, error) {
	out, err := runGitForRepo(repoPath, "cat-file", "blob", "HEAD:"+path)
	if err != nil {
		return nil, err
	}
	return []byte(out), nil
}

func (c *GitCLI) Close() error {
	return nil
}
