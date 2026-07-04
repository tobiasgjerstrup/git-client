package git

import (
	"fmt"
	"testing"
)

// --------------------------------------------------------------------------
// parsePorcelainV2FileLine
// --------------------------------------------------------------------------

func TestParsePorcelainV2FileLine_ordinary_changed(t *testing.T) {
	line := "1 MM N... 0000 0000 100644 0000000000000000000000000000000000000000 0000000000000000000000000000000000000000 file.txt"
	result, ok := parsePorcelainV2FileLine(line)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if result != "MM file.txt" {
		t.Errorf("got %q, want \"MM file.txt\"", result)
	}
}

func TestParsePorcelainV2FileLine_renamed(t *testing.T) {
	// Path contains a tab that separates the new path from the old path.
	line := "2 RM N... 0000 0000 100644 0000000000000000000000000000000000000000 0000000000000000000000000000000000000000 R100 new.txt\told.txt"
	result, ok := parsePorcelainV2FileLine(line)
	if !ok {
		t.Fatal("expected ok=true")
	}
	// The format for renamed is "xy path" (without origPath in the returned string).
	if result != "RM new.txt" {
		t.Errorf("got %q, want \"RM new.txt\"", result)
	}
}

func TestParsePorcelainV2FileLine_unmerged(t *testing.T) {
	line := "u UU N... 1 2 3 100644 0000000000000000000000000000000000000000 0000000000000000000000000000000000000000 0000000000000000000000000000000000000000 conflict.txt"
	result, ok := parsePorcelainV2FileLine(line)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if result != "UU conflict.txt" {
		t.Errorf("got %q, want \"UU conflict.txt\"", result)
	}
}

func TestParsePorcelainV2FileLine_untracked(t *testing.T) {
	result, ok := parsePorcelainV2FileLine("? newfile.txt")
	if !ok {
		t.Fatal("expected ok=true")
	}
	if result != "?? newfile.txt" {
		t.Errorf("got %q, want \"?? newfile.txt\"", result)
	}
}

func TestParsePorcelainV2FileLine_ignored(t *testing.T) {
	result, ok := parsePorcelainV2FileLine("! ignored-file.log")
	if !ok {
		t.Fatal("expected ok=true")
	}
	if result != "!! ignored-file.log" {
		t.Errorf("got %q, want \"!! ignored-file.log\"", result)
	}
}

func TestParsePorcelainV2FileLine_branch_header(t *testing.T) {
	_, ok := parsePorcelainV2FileLine("# branch.head main")
	if ok {
		t.Fatal("expected ok=false for branch header")
	}
}

func TestParsePorcelainV2FileLine_empty_line(t *testing.T) {
	_, ok := parsePorcelainV2FileLine("")
	if ok {
		t.Fatal("expected ok=false for empty line")
	}
}

func TestParsePorcelainV2FileLine_malformed_ordinary(t *testing.T) {
	_, ok := parsePorcelainV2FileLine("1 XY")
	if ok {
		t.Fatal("expected ok=false for malformed ordinary line")
	}
}

func TestParsePorcelainV2FileLine_malformed_renamed(t *testing.T) {
	_, ok := parsePorcelainV2FileLine("2 R")
	if ok {
		t.Fatal("expected ok=false for malformed renamed line")
	}
}

func TestParsePorcelainV2FileLine_malformed_unmerged(t *testing.T) {
	_, ok := parsePorcelainV2FileLine("u U")
	if ok {
		t.Fatal("expected ok=false for malformed unmerged line")
	}
}

// --------------------------------------------------------------------------
// parseDiffOutput
// --------------------------------------------------------------------------

func TestParseDiffOutput_single_file(t *testing.T) {
	diff := `diff --git a/file.txt b/file.txt
index 0000000..1111111 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
 unchanged line
-removed line
+added line
 unchanged line
`

	result, err := parseDiffOutput(diff)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Files) != 1 {
		t.Fatalf("expected 1 file, got %d", len(result.Files))
	}
	f := result.Files[0]
	if f.Path != "file.txt" {
		t.Errorf("Path = %q", f.Path)
	}
	if f.LinesAdded != 1 {
		t.Errorf("LinesAdded = %d, want 1", f.LinesAdded)
	}
	if f.LinesRemoved != 1 {
		t.Errorf("LinesRemoved = %d, want 1", f.LinesRemoved)
	}
}

func TestParseDiffOutput_multiple_files(t *testing.T) {
	diff := `diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
+first add

diff --git a/b.txt b/b.txt
--- a/b.txt
+++ b/b.txt
-first remove
-second remove
`

	result, err := parseDiffOutput(diff)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Files) != 2 {
		t.Fatalf("expected 2 files, got %d", len(result.Files))
	}
	if result.Files[0].Path != "a.txt" {
		t.Errorf("file 0 Path = %q", result.Files[0].Path)
	}
	if result.Files[0].LinesAdded != 1 || result.Files[0].LinesRemoved != 0 {
		t.Errorf("file 0: added=%d removed=%d", result.Files[0].LinesAdded, result.Files[0].LinesRemoved)
	}
	if result.Files[1].Path != "b.txt" {
		t.Errorf("file 1 Path = %q", result.Files[1].Path)
	}
	if result.Files[1].LinesAdded != 0 || result.Files[1].LinesRemoved != 2 {
		t.Errorf("file 1: added=%d removed=%d", result.Files[1].LinesAdded, result.Files[1].LinesRemoved)
	}
}

func TestParseDiffOutput_no_changes(t *testing.T) {
	result, err := parseDiffOutput("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Files) != 0 {
		t.Errorf("expected 0 files, got %d", len(result.Files))
	}
}

func TestParseDiffOutput_empty_line_between_hunks(t *testing.T) {
	diff := fmt.Sprintf("diff --git a/x b/x\n--- a/x\n+++ b/x\n+line1\n\n+line2\n")
	result, err := parseDiffOutput(diff)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Files) != 1 {
		t.Fatalf("expected 1 file, got %d", len(result.Files))
	}
	// Blank lines are skipped (don't count as + or -).
	if result.Files[0].LinesAdded != 2 {
		t.Errorf("LinesAdded = %d, want 2", result.Files[0].LinesAdded)
	}
}

func TestParseDiffOutput_count_skips_header_lines(t *testing.T) {
	diff := `diff --git a/f b/f
--- a/f
+++ b/f
@@ -1,1 +1,1 @@
 content
`

	result, err := parseDiffOutput(diff)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Files) != 1 {
		t.Fatalf("expected 1 file, got %d", len(result.Files))
	}
	// Neither +++/--- nor lines starting with @@ or space count as added/removed.
	if result.Files[0].LinesAdded != 0 || result.Files[0].LinesRemoved != 0 {
		t.Errorf("LinesAdded=%d LinesRemoved=%d", result.Files[0].LinesAdded, result.Files[0].LinesRemoved)
	}
}

// --------------------------------------------------------------------------
// splitGitActionPaths
// --------------------------------------------------------------------------

func TestSplitGitActionPaths_single_path(t *testing.T) {
	paths := splitGitActionPaths("file.txt")
	if len(paths) != 1 || paths[0] != "file.txt" {
		t.Errorf("got %v, want [file.txt]", paths)
	}
}

func TestSplitGitActionPaths_rename_pair(t *testing.T) {
	paths := splitGitActionPaths("old.txt\tnew.txt")
	if len(paths) != 2 || paths[0] != "old.txt" || paths[1] != "new.txt" {
		t.Errorf("got %v, want [old.txt new.txt]", paths)
	}
}

func TestSplitGitActionPaths_three_targets(t *testing.T) {
	paths := splitGitActionPaths("a\tb\tc")
	if len(paths) != 3 {
		t.Fatalf("expected 3 paths, got %d: %v", len(paths), paths)
	}
	if paths[0] != "a" || paths[1] != "b" || paths[2] != "c" {
		t.Errorf("got %v", paths)
	}
}

func TestSplitGitActionPaths_empty_string(t *testing.T) {
	paths := splitGitActionPaths("")
	if len(paths) != 1 || paths[0] != "" {
		t.Errorf("got %v, want [\"\"]", paths)
	}
}

func TestSplitGitActionPaths_only_tabs(t *testing.T) {
	paths := splitGitActionPaths("\t\t")
	if len(paths) != 1 || paths[0] != "\t\t" {
		t.Errorf("got %v, want [\"\\t\\t\"]", paths)
	}
}

func TestSplitGitActionPaths_leading_and_trailing_whitespace(t *testing.T) {
	paths := splitGitActionPaths("  a\t  b  ")
	if len(paths) != 2 || paths[0] != "a" || paths[1] != "b" {
		t.Errorf("got %v, want [a b]", paths)
	}
}

// --------------------------------------------------------------------------
// isMissingBranchSwitchError
// --------------------------------------------------------------------------

func TestIsMissingBranchSwitchError_positive_cases(t *testing.T) {
	cases := []string{
		"invalid reference: refs/heads/nonexistent",
		"branch 'feat' not found.",
		"unknown revision or path not in the working tree.",
		"could not resolve",
		"cannot find branch",
	}
	for _, msg := range cases {
		if !isMissingBranchSwitchError(fmt.Errorf("%s", msg)) {
			t.Errorf("expected true for %q", msg)
		}
	}
}

func TestIsMissingBranchSwitchError_negative_case(t *testing.T) {
	err := fmt.Errorf("error: Your local changes to the following files would be overwritten by checkout")
	if isMissingBranchSwitchError(err) {
		t.Fatal("expected false for checkout-overwrite error")
	}
}

func TestIsMissingBranchSwitchError_nil_error(t *testing.T) {
	if isMissingBranchSwitchError(nil) {
		t.Fatal("expected false for nil error")
	}
}
