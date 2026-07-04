package git

import (
	"os"
	"os/exec"
	"path/filepath"
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

	// Bare-minimum git identity so commits work in CI / ephemeral envs.
	git("init")
	git("config", "user.email", "test@git-client.local")
	git("config", "user.name", "Test Runner")

	// Seed with a file so the repo is never in an unborn-HEAD state.
	seed := filepath.Join(dir, "README.md")
	if err := os.WriteFile(seed, []byte("# test repo\n"), 0644); err != nil {
		t.Fatalf("write seed file: %v", err)
	}
	git("add", "README.md")
	git("commit", "-m", "initial commit")

	return dir, cleanup
}

// --------------------------------------------------------------------------
// GitStatus
// --------------------------------------------------------------------------

func TestGitStatus_clean_working_tree(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Fill in: assert branch name matches, files is empty.
	_ = repo
}

func TestGitStatus_untracked_file(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Fill in: create a new file, status should show "??" entry.
	_ = repo
}

func TestGitStatus_modified_tracked_file(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Fill in: modify README.md, status should show modified entry.
	_ = repo
}

func TestGitStatus_merge_in_progress(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Fill in: start a merge that conflicts, verify MergeInProgress == true.
	_ = repo
}

// --------------------------------------------------------------------------
// GitDiff
// --------------------------------------------------------------------------

func TestGitDiff_no_changes(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Fill in: empty diff on clean repo.
	_ = repo
}

func TestGitDiff_modified_file(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Fill in: modify tracked file, verify diff lines, added/removed counts.
	_ = repo
}

// --------------------------------------------------------------------------
// GitDiffStaged
// --------------------------------------------------------------------------

func TestGitDiffStaged_staged_change(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Fill in: modify, add, then diff --cached, verify staged diff.
	_ = repo
}

// --------------------------------------------------------------------------
// StageGitFile / UnstageGitFile
// --------------------------------------------------------------------------

func TestStage_and_Unstage_file(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Fill in: create new file, stage, verify status, unstage, verify again.
	_ = repo
}

// --------------------------------------------------------------------------
// CommitGitChanges
// --------------------------------------------------------------------------

func TestCommitGitChanges_create_commit(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Fill in: stage a change, commit, verify commit history includes it.
	_ = repo
}

func TestCommitGitChanges_nothing_to_commit(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Fill in: commit with no staged changes, expect error.
	_ = repo
}

// --------------------------------------------------------------------------
// DiscardGitFile
// --------------------------------------------------------------------------

func TestDiscardGitFile_modified_file(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Fill in: modify file, discard, verify file content is back to HEAD.
	_ = repo
}

func TestDiscardGitFile_untracked_file(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Fill in: new untracked file, discard removes it from disk.
	_ = repo
}

// --------------------------------------------------------------------------
// GetCommitHistory
// --------------------------------------------------------------------------

func TestGetCommitHistory_returns_commits(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Fill in: at least 1 commit exists, verify hash/author/date/message.
	_ = repo
}

// --------------------------------------------------------------------------
// SwitchGitBranch / DeleteGitBranch / GetGitBranches
// --------------------------------------------------------------------------

func TestGitBranch_create_switch_and_delete(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Fill in: create branch, switch, verify current, delete old branch (not current), switch back.
	_ = repo
}

func TestDeleteGitBranch_current_branch_error(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Fill in: attempt to delete currently checked-out branch → error.
	_ = repo
}

// --------------------------------------------------------------------------
// Parse functions integration: using real git cat-file output
// --------------------------------------------------------------------------

func TestRealCommit_roundtrip_through_ParseCommit(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Fill in: get HEAD hash, run git cat-file commit <hash>, parse the raw bytes with ParseCommit.
	_ = repo
}

func TestRealTree_roundtrip_through_ParseTree(t *testing.T) {
	repo, cleanup := setupTestRepo(t)
	defer cleanup()

	// Fill in: get tree hash from HEAD commit, run git cat-file tree <hash>, parse with ParseTree.
	_ = repo
}
