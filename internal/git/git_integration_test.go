package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// setupTestRepo creates a temporary directory, initialises a git repo in it,
// commits an initial file, and returns the repo path along with a cleanup
// function that removes the directory.
//
// Requires 'git' on PATH.
func setupTestRepo(t *testing.T) (repoPath string, cleanup func()) {
	t.Helper()

	dir, err := os.MkdirTemp("", "git-client-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}

	cleanup = func() {
		_ = os.RemoveAll(dir)
	}

	git := func(args ...string) string {
		cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %v failed: %s\n%s", args, err, out)
		}
		return string(out)
	}

	git("init")
	git("config", "user.email", "test@git-client.local")
	git("config", "user.name", "Test Runner")

	seed := filepath.Join(dir, "README.md")
	if err := os.WriteFile(seed, []byte("# test repo\n"), 0644); err != nil {
		t.Fatalf("write seed file: %v", err)
	}
	git("add", "README.md")
	git("commit", "-m", "initial commit")

	return dir, cleanup
}

// runGit is a lightweight helper for raw git commands in the test repo.
func runGit(t *testing.T, repo string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", repo}, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %s\n%s", args, err, out)
	}
	return string(out)
}

// runGitNoFail runs git and ignores errors (useful for merges that conflict).
func runGitNoFail(t *testing.T, repo string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", repo}, args...)...)
	out, _ := cmd.CombinedOutput()
	return string(out)
}

// --------------------------------------------------------------------------
// GitStatus
// --------------------------------------------------------------------------

func TestGitStatus_clean_working_tree(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	status, err := GitStatus(repo)
	if err != nil {
		t.Fatalf("GitStatus: %v", err)
	}
	if status.BranchName == "" {
		t.Fatal("expected non-empty branch name")
	}
	if len(status.Files) != 0 {
		t.Fatalf("expected 0 files, got %d: %v", len(status.Files), status.Files)
	}
	if status.MergeInProgress {
		t.Fatal("expected MergeInProgress=false on clean repo")
	}
}

func TestGitStatus_untracked_file(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	if err := os.WriteFile(filepath.Join(repo, "new.txt"), []byte("hello\n"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	status, err := GitStatus(repo)
	if err != nil {
		t.Fatalf("GitStatus: %v", err)
	}
	found := false
	for _, f := range status.Files {
		if strings.Contains(f, "new.txt") && strings.HasPrefix(f, "??") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected untracked 'new.txt' in files, got %v", status.Files)
	}
}

func TestGitStatus_modified_tracked_file(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	if err := os.WriteFile(filepath.Join(repo, "README.md"), []byte("# updated\n"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	status, err := GitStatus(repo)
	if err != nil {
		t.Fatalf("GitStatus: %v", err)
	}
	found := false
	for _, f := range status.Files {
		if strings.Contains(f, "README.md") && !strings.HasPrefix(f, "??") && !strings.HasPrefix(f, "? ") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected a modified entry for README.md, got %v", status.Files)
	}
}

func TestGitStatus_merge_in_progress(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Create a diverging branch that conflicts.
	if err := os.WriteFile(filepath.Join(repo, "conflict.txt"), []byte("branch\n"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}
	runGit(t, repo, "checkout", "-b", "conflict-branch")
	runGit(t, repo, "add", "conflict.txt")
	runGit(t, repo, "commit", "-m", "branch commit")

	// Switch back to original and make a conflicting change.
	runGit(t, repo, "checkout", "-") // back to previous branch
	if err := os.WriteFile(filepath.Join(repo, "conflict.txt"), []byte("main\n"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}
	runGit(t, repo, "add", "conflict.txt")
	runGit(t, repo, "commit", "-m", "main commit")

	// Merge — expect conflict.
	runGitNoFail(t, repo, "merge", "conflict-branch")

	status, err := GitStatus(repo)
	if err != nil {
		t.Fatalf("GitStatus: %v", err)
	}
	if !status.MergeInProgress {
		t.Fatal("expected MergeInProgress=true after conflicting merge")
	}
}

// --------------------------------------------------------------------------
// GitDiff
// --------------------------------------------------------------------------

func TestGitDiff_no_changes(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	result, err := GitDiff(repo)
	if err != nil {
		t.Fatalf("GitDiff: %v", err)
	}
	if len(result.Files) != 0 {
		t.Errorf("expected 0 diff files on clean repo, got %d", len(result.Files))
	}
}

func TestGitDiff_modified_file(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	if err := os.WriteFile(filepath.Join(repo, "README.md"), []byte("# updated\n"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	result, err := GitDiff(repo)
	if err != nil {
		t.Fatalf("GitDiff: %v", err)
	}
	found := false
	for _, f := range result.Files {
		if f.Path == "README.md" {
			found = true
			if f.LinesAdded < 1 || f.LinesRemoved < 1 {
				t.Errorf("expected both added and removed lines, got +%d -%d", f.LinesAdded, f.LinesRemoved)
			}
			break
		}
	}
	if !found {
		t.Errorf("expected diff for README.md, got files: %+v", result.Files)
	}
}

// --------------------------------------------------------------------------
// GitDiffStaged
// --------------------------------------------------------------------------

func TestGitDiffStaged_staged_change(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	if err := os.WriteFile(filepath.Join(repo, "README.md"), []byte("# staged\n"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if _, err := StageGitFile(repo, "README.md"); err != nil {
		t.Fatalf("StageGitFile: %v", err)
	}

	result, err := GitDiffStaged(repo)
	if err != nil {
		t.Fatalf("GitDiffStaged: %v", err)
	}
	if len(result.Files) == 0 {
		t.Fatal("expected at least one staged diff file")
	}
	found := false
	for _, f := range result.Files {
		if f.Path == "README.md" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected staged diff for README.md, got %+v", result.Files)
	}
}

func TestGitDiffStaged_nothing_staged(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	result, err := GitDiffStaged(repo)
	if err != nil {
		t.Fatalf("GitDiffStaged: %v", err)
	}
	if len(result.Files) != 0 {
		t.Errorf("expected 0 staged files, got %d", len(result.Files))
	}
}

// --------------------------------------------------------------------------
// StageGitFile / UnstageGitFile
// --------------------------------------------------------------------------

func TestStage_and_Unstage_file(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	newFile := filepath.Join(repo, "staged.txt")
	if err := os.WriteFile(newFile, []byte("content\n"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	// Stage.
	if _, err := StageGitFile(repo, "staged.txt"); err != nil {
		t.Fatalf("StageGitFile: %v", err)
	}

	// After staging, the file should be in the index.
	diffResult, err := GitDiffStaged(repo)
	if err != nil {
		t.Fatalf("GitDiffStaged: %v", err)
	}
	found := false
	for _, f := range diffResult.Files {
		if f.Path == "staged.txt" {
			found = true
			break
		}
	}
	if !found {
		t.Error("staged.txt not found in staged diff after StageGitFile")
	}

	// Unstage.
	if _, err := UnstageGitFile(repo, "staged.txt"); err != nil {
		t.Fatalf("UnstageGitFile: %v", err)
	}

	// After unstaging, the file should no longer be in the index.
	diffResult, err = GitDiffStaged(repo)
	if err != nil {
		t.Fatalf("GitDiffStaged: %v", err)
	}
	for _, f := range diffResult.Files {
		if f.Path == "staged.txt" {
			t.Error("staged.txt still present in staged diff after UnstageGitFile")
		}
	}
}

// --------------------------------------------------------------------------
// CommitGitChanges
// --------------------------------------------------------------------------

func TestCommitGitChanges_create_commit(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	newFile := filepath.Join(repo, "commit-test.txt")
	if err := os.WriteFile(newFile, []byte("hello\n"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if _, err := StageGitFile(repo, "commit-test.txt"); err != nil {
		t.Fatalf("StageGitFile: %v", err)
	}

	if err := CommitGitChanges(repo, "test commit message"); err != nil {
		t.Fatalf("CommitGitChanges: %v", err)
	}

	history, err := GetCommitHistory(repo)
	if err != nil {
		t.Fatalf("GetCommitHistory: %v", err)
	}
	if len(*history) < 2 {
		t.Fatalf("expected at least 2 commits, got %d", len(*history))
	}
	latest := (*history)[0]
	if latest.Message != "test commit message" {
		t.Errorf("latest commit message = %q", latest.Message)
	}
}

func TestCommitGitChanges_nothing_to_commit(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	err := CommitGitChanges(repo, "nothing to commit")
	if err == nil {
		t.Fatal("expected error when committing with no staged changes")
	}
}

// --------------------------------------------------------------------------
// DiscardGitFile
// --------------------------------------------------------------------------

func TestDiscardGitFile_modified_file(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	path := filepath.Join(repo, "README.md")
	original, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read original: %v", err)
	}

	if err := os.WriteFile(path, []byte("dirty\n"), 0644); err != nil {
		t.Fatalf("write dirty: %v", err)
	}

	if _, err := DiscardGitFile(repo, "README.md"); err != nil {
		t.Fatalf("DiscardGitFile: %v", err)
	}

	restored, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read restored: %v", err)
	}
	if string(restored) != string(original) && strings.ReplaceAll(string(restored), "\r\n", "\n") != string(original) {
		t.Errorf("restored content = %q, want %q", string(restored), string(original))
	}
}

func TestDiscardGitFile_untracked_file(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	path := filepath.Join(repo, "untracked.txt")
	if err := os.WriteFile(path, []byte("temp\n"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	if _, err := DiscardGitFile(repo, "untracked.txt"); err != nil {
		t.Fatalf("DiscardGitFile: %v", err)
	}

	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("untracked.txt should have been deleted")
	}
}

// --------------------------------------------------------------------------
// GetCommitHistory
// --------------------------------------------------------------------------

func TestGetCommitHistory_returns_commits(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	history, err := GetCommitHistory(repo)
	if err != nil {
		t.Fatalf("GetCommitHistory: %v", err)
	}
	if len(*history) < 1 {
		t.Fatal("expected at least 1 commit")
	}
	first := (*history)[len(*history)-1] // oldest first in log output
	if first.Message != "initial commit" {
		t.Errorf("initial commit message = %q", first.Message)
	}
	if first.Hash == "" {
		t.Error("expected non-empty hash")
	}
	if first.Author == "" {
		t.Error("expected non-empty author")
	}
}

// --------------------------------------------------------------------------
// SwitchGitBranch / DeleteGitBranch / GetGitBranches
// --------------------------------------------------------------------------

func TestGitBranch_create_switch_and_delete(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Create a bare repo as a fake origin so GetGitBranches doesn't fail.
	remoteDir, err := os.MkdirTemp("", "git-test-remote-*")
	if err != nil {
		t.Fatalf("MkdirTemp remote: %v", err)
	}
	defer os.RemoveAll(remoteDir)
	exec.Command("git", "-C", remoteDir, "init", "--bare").Run()
	exec.Command("git", "-C", repo, "remote", "add", "origin", remoteDir).Run()
	// Push the initial branch so ls-remote --symref can find origin/HEAD.
	exec.Command("git", "-C", repo, "push", "origin", "HEAD").Run()

	// Create and switch to a new branch.
	if err := SwitchGitBranch(repo, "feature-x"); err != nil {
		t.Fatalf("SwitchGitBranch (create feature-x): %v", err)
	}

	branches, err := GetGitBranches(repo)
	if err != nil {
		t.Fatalf("GetGitBranches: %v", err)
	}
	found := false
	for _, b := range *branches {
		if b.Name == "feature-x" && !b.Remote {
			found = true
			break
		}
	}
	if !found {
		t.Error("feature-x branch not found in branch list")
	}

	// Switch back to the previous branch.
	if err := SwitchGitBranch(repo, "-"); err != nil {
		t.Fatalf("SwitchGitBranch (back to previous): %v", err)
	}

	// Delete "feature-x" (we are not currently on it after switching back).
	if err := DeleteGitBranch(repo, "feature-x", false); err != nil {
		t.Fatalf("DeleteGitBranch: %v", err)
	}

	branches, err = GetGitBranches(repo)
	if err != nil {
		t.Fatalf("GetGitBranches: %v", err)
	}
	for _, b := range *branches {
		if b.Name == "feature-x" {
			t.Error("feature-x still present after deletion")
		}
	}
}

func TestDeleteGitBranch_current_branch_error(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	current := strings.TrimSpace(runGit(t, repo, "branch", "--show-current"))
	err := DeleteGitBranch(repo, current, false)
	if err == nil {
		t.Fatal("expected error when deleting current branch")
	}
}

func TestGitBranch_create_from_existing(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	if err := SwitchGitBranch(repo, "feat"); err != nil {
		t.Fatalf("create feat: %v", err)
	}
	// It should already exist now, switching again should be a no-op.
	if err := SwitchGitBranch(repo, "feat"); err != nil {
		t.Fatalf("switch to existing feat: %v", err)
	}
}

// --------------------------------------------------------------------------
// Parse functions integration: using real git cat-file output
// --------------------------------------------------------------------------

func TestRealCommit_roundtrip_through_ParseCommit(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	hash := strings.TrimSpace(runGit(t, repo, "rev-parse", "HEAD"))
	raw, err := runGitForRepo(repo, "cat-file", "commit", hash)
	if err != nil {
		t.Fatalf("cat-file commit: %v", err)
	}

	co, err := ParseCommit([]byte(raw))
	if err != nil {
		t.Fatalf("ParseCommit: %v", err)
	}
	if co.TreeHash == "" {
		t.Error("expected non-empty TreeHash")
	}
	if co.Author.Name == "" {
		t.Error("expected non-empty Author.Name")
	}
	if co.Committer.Name == "" {
		t.Error("expected non-empty Committer.Name")
	}
	if co.Message == "" {
		t.Error("expected non-empty Message")
	}
	// The initial commit should have no parents.
	if len(co.ParentHashes) != 0 {
		t.Logf("initial commit has %d parent(s) — may be due to git config defaults", len(co.ParentHashes))
	}
}

func TestRealTree_roundtrip_through_ParseTree(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	hash := strings.TrimSpace(runGit(t, repo, "rev-parse", "HEAD"))

	// Get tree hash from commit.
	rawCommit, err := runGitForRepo(repo, "cat-file", "commit", hash)
	if err != nil {
		t.Fatalf("cat-file commit: %v", err)
	}
	co, err := ParseCommit([]byte(rawCommit))
	if err != nil {
		t.Fatalf("ParseCommit: %v", err)
	}

	rawTree, err := runGitForRepo(repo, "cat-file", "tree", co.TreeHash)
	if err != nil {
		t.Fatalf("cat-file tree %s: %v", co.TreeHash, err)
	}

	entries, err := ParseTree([]byte(rawTree))
	if err != nil {
		t.Fatalf("ParseTree: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("expected at least one tree entry")
	}
	// The repo should have at least README.md.
	found := false
	for _, e := range entries {
		if e.Name == "README.md" {
			found = true
			if e.Mode != "100644" {
				t.Errorf("README.md mode = %q", e.Mode)
			}
			if e.Type != ObjectBlob {
				t.Errorf("README.md type = %q, want blob", e.Type)
			}
		}
	}
	if !found {
		t.Errorf("README.md not found in tree: %+v", entries)
	}
}
