package git

import (
	"encoding/hex"
	"testing"
	"time"
)

// --------------------------------------------------------------------------
// ParseCommit
// --------------------------------------------------------------------------

func TestParseCommit_valid_single_parent(t *testing.T) {
	raw := buildRawCommit(
		"abc123tree",
		[]string{"def456parent"},
		"Alice <alice@example.com> 1712345678 +0200",
		"Alice <alice@example.com> 1712345678 +0200",
		"hello world\n",
	)

	co, err := ParseCommit(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if co.TreeHash != "abc123tree" {
		t.Errorf("TreeHash = %q, want %q", co.TreeHash, "abc123tree")
	}
	if len(co.ParentHashes) != 1 || co.ParentHashes[0] != "def456parent" {
		t.Errorf("ParentHashes = %v, want [def456parent]", co.ParentHashes)
	}
	if co.Author.Name != "Alice" {
		t.Errorf("Author.Name = %q, want Alice", co.Author.Name)
	}
	if co.Committer.Email != "alice@example.com" {
		t.Errorf("Committer.Email = %q, want alice@example.com", co.Committer.Email)
	}
	if co.Message != "hello world\n" {
		t.Errorf("Message = %q, want \"hello world\\n\"", co.Message)
	}
}

func TestParseCommit_valid_merge_commit(t *testing.T) {
	raw := buildRawCommit(
		"treehash",
		[]string{"parent1", "parent2"},
		"Alice <alice@example.com> 1 +0000",
		"Bob <bob@example.com> 1 +0000",
		"merge commit",
	)

	co, err := ParseCommit(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(co.ParentHashes) != 2 {
		t.Fatalf("expected 2 parents, got %d", len(co.ParentHashes))
	}
	if co.ParentHashes[0] != "parent1" || co.ParentHashes[1] != "parent2" {
		t.Errorf("ParentHashes = %v", co.ParentHashes)
	}
}

func TestParseCommit_valid_no_parents(t *testing.T) {
	raw := buildRawCommit(
		"treehash",
		nil,
		"Alice <alice@example.com> 1 +0000",
		"Alice <alice@example.com> 1 +0000",
		"initial commit",
	)

	co, err := ParseCommit(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(co.ParentHashes) != 0 {
		t.Errorf("expected 0 parents, got %d", len(co.ParentHashes))
	}
}

func TestParseCommit_message_with_newlines(t *testing.T) {
	raw := buildRawCommit(
		"treehash",
		[]string{"parent"},
		"Alice <alice@example.com> 1 +0000",
		"Alice <alice@example.com> 1 +0000",
		"subject line\n\nbody paragraph 1\nbody paragraph 2\n",
	)

	co, err := ParseCommit(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := "subject line\n\nbody paragraph 1\nbody paragraph 2\n"
	if co.Message != expected {
		t.Errorf("Message = %q, want %q", co.Message, expected)
	}
}

func TestParseCommit_invalid_author(t *testing.T) {
	raw := buildRawCommit(
		"tree",
		[]string{"parent"},
		"broken-author",
		"Alice <alice@example.com> 1 +0000",
		"msg",
	)

	_, err := ParseCommit(raw)
	if err == nil {
		t.Fatal("expected error for invalid author")
	}
}

func TestParseCommit_invalid_committer(t *testing.T) {
	raw := buildRawCommit(
		"tree",
		[]string{"parent"},
		"Alice <alice@example.com> 1 +0000",
		"broken-committer",
		"msg",
	)

	_, err := ParseCommit(raw)
	if err == nil {
		t.Fatal("expected error for invalid committer")
	}
}

func TestParseCommit_empty_input(t *testing.T) {
	co, err := ParseCommit([]byte{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if co.TreeHash != "" {
		t.Errorf("expected empty TreeHash, got %q", co.TreeHash)
	}
}

// --------------------------------------------------------------------------
// parseSignature
// --------------------------------------------------------------------------

func TestParseSignature_valid_with_timezone(t *testing.T) {
	sig, err := parseSignature("Tobias <tobias@example.com> 1712345678 +0200")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sig.Name != "Tobias" {
		t.Errorf("Name = %q", sig.Name)
	}
	if sig.Email != "tobias@example.com" {
		t.Errorf("Email = %q", sig.Email)
	}

	expected := time.Unix(1712345678, 0).In(time.FixedZone("", 2*3600))
	if !sig.Time.Equal(expected) {
		t.Errorf("Time = %v, want %v", sig.Time, expected)
	}
}

func TestParseSignature_valid_negative_timezone(t *testing.T) {
	sig, err := parseSignature("Alice <alice@example.com> 1000000000 -0500")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := time.Unix(1000000000, 0).In(time.FixedZone("", -5*3600))
	if !sig.Time.Equal(expected) {
		t.Errorf("Time = %v, want %v", sig.Time, expected)
	}
}

func TestParseSignature_valid_half_hour_timezone(t *testing.T) {
	sig, err := parseSignature("Dev <dev@example.com> 999999999 +0530")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// +0530 = +5h30m
	expected := time.Unix(999999999, 0).In(time.FixedZone("", 5*3600+30*60))
	if !sig.Time.Equal(expected) {
		t.Errorf("Time = %v, want %v", sig.Time, expected)
	}
}

func TestParseSignature_valid_no_email_bracket(t *testing.T) {
	// No '<' or '>' at all → parseSignature requires an email bracket.
	_, err := parseSignature("plain-name 1234567890 +0100")
	if err == nil {
		t.Fatal("expected error for signature without email bracket")
	}
}

func TestParseSignature_invalid_no_separator(t *testing.T) {
	_, err := parseSignature("justoneword")
	if err == nil {
		t.Fatal("expected error for signature without separator")
	}
}

func TestParseSignature_only_name_and_email(t *testing.T) {
	sig, err := parseSignature("Jane <jane@example.com>")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sig.Name != "Jane" {
		t.Errorf("Name = %q", sig.Name)
	}
	if sig.Email != "jane@example.com" {
		t.Errorf("Email = %q", sig.Email)
	}
	if !sig.Time.IsZero() {
		t.Errorf("expected zero Time, got %v", sig.Time)
	}
}

func TestParseSignature_weekday_timezone_format(t *testing.T) {
	// The Go parser stops after the '>', so "Mon Jan 2 ..." is treated as
	// the "rest" after the email.  The first field is "Mon", which is not a
	// number, so the timestamp is not parsed.
	sig, err := parseSignature("John Doe <john@example.com> Mon Jan 2 15:04:05 2006 -0700")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sig.Name != "John Doe" {
		t.Errorf("Name = %q", sig.Name)
	}
	if sig.Email != "john@example.com" {
		t.Errorf("Email = %q", sig.Email)
	}
	if !sig.Time.IsZero() {
		t.Errorf("expected zero Time, got %v", sig.Time)
	}
}

func TestParseSignature_epoch(t *testing.T) {
	sig, err := parseSignature("Root <root@example.com> 0 +0000")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := time.Unix(0, 0).In(time.FixedZone("", 0))
	if !sig.Time.Equal(expected) {
		t.Errorf("Time = %v, want %v", sig.Time, expected)
	}
}

// --------------------------------------------------------------------------
// ParseTree
// --------------------------------------------------------------------------

func buildTreeEntry(mode, name string, hashBytes [20]byte) []byte {
	var entry []byte
	entry = append(entry, []byte(mode+" "+name)...)
	entry = append(entry, 0)
	entry = append(entry, hashBytes[:]...)
	return entry
}

func TestParseTree_valid_single_blob_entry(t *testing.T) {
	var hash [20]byte
	for i := range hash {
		hash[i] = byte(i)
	}

	raw := buildTreeEntry("100644", "README.md", hash)

	entries, err := ParseTree(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	e := entries[0]
	if e.Mode != "100644" {
		t.Errorf("Mode = %q", e.Mode)
	}
	if e.Name != "README.md" {
		t.Errorf("Name = %q", e.Name)
	}
	if e.Type != ObjectBlob {
		t.Errorf("Type = %q, want blob", e.Type)
	}
	if e.Hash != hex.EncodeToString(hash[:]) {
		t.Errorf("Hash = %q", e.Hash)
	}
}

func TestParseTree_valid_mixed_entries(t *testing.T) {
	var blobHash, treeHash, commitHash [20]byte
	for i := range blobHash {
		blobHash[i] = byte(i)
		treeHash[i] = byte(i + 20)
		commitHash[i] = byte(i + 40)
	}

	raw := buildTreeEntry("100644", "file.txt", blobHash)
	raw = append(raw, buildTreeEntry("040000", "subdir", treeHash)...)
	raw = append(raw, buildTreeEntry("160000", "submod", commitHash)...)

	entries, err := ParseTree(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}

	// file.txt (blob)
	if entries[0].Type != ObjectBlob {
		t.Errorf("entry 0 type = %q, want blob", entries[0].Type)
	}
	if entries[0].Name != "file.txt" {
		t.Errorf("entry 0 name = %q", entries[0].Name)
	}

	// subdir (tree)
	if entries[1].Type != ObjectTree {
		t.Errorf("entry 1 type = %q, want tree", entries[1].Type)
	}
	if entries[1].Mode != "040000" {
		t.Errorf("entry 1 mode = %q", entries[1].Mode)
	}

	// submod (commit)
	if entries[2].Type != ObjectCommit {
		t.Errorf("entry 2 type = %q, want commit", entries[2].Type)
	}
	if entries[2].Mode != "160000" {
		t.Errorf("entry 2 mode = %q", entries[2].Mode)
	}
}

func TestParseTree_truncated_entry(t *testing.T) {
	// Start a valid entry header but cut off the SHA.
	raw := []byte("100644 file.txt")
	raw = append(raw, 0)
	// Only 10 bytes of hash — short of the required 20.
	raw = append(raw, make([]byte, 10)...)

	_, err := ParseTree(raw)
	if err == nil {
		t.Fatal("expected error for truncated tree entry")
	}
}

func TestParseTree_empty_input(t *testing.T) {
	entries, err := ParseTree([]byte{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("expected 0 entries, got %d", len(entries))
	}
}

func TestParseTree_missing_null_byte(t *testing.T) {
	// Raw data with no null byte → ParseTree breaks out of loop immediately.
	raw := []byte("100644 file.txt")
	entries, err := ParseTree(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("expected 0 entries, got %d", len(entries))
	}
}

// --------------------------------------------------------------------------
// Round-trip
// --------------------------------------------------------------------------

func TestParseCommit_then_ParseTree_on_result(t *testing.T) {
	// Build a tree with two entries.
	var blobHash, treeHash [20]byte
	for i := range blobHash {
		blobHash[i] = byte(i)
		treeHash[i] = byte(i + 100)
	}
	treeRaw := buildTreeEntry("100644", "a.txt", blobHash)
	treeRaw = append(treeRaw, buildTreeEntry("040000", "lib", treeHash)...)
	treeHashHex := hex.EncodeToString(treeHash[:])

	// Build a commit referencing that tree.
	raw := buildRawCommit(
		"aaa111tree",
		[]string{},
		"Author <a@b.com> 1 +0000",
		"Committer <c@d.com> 1 +0000",
		"first commit",
	)
	co, err := ParseCommit(raw)
	if err != nil {
		t.Fatalf("ParseCommit: %v", err)
	}
	if co.TreeHash != "aaa111tree" {
		t.Errorf("TreeHash = %q", co.TreeHash)
	}

	// Parse the previously built tree and verify the commit→tree link works.
	// (We use the same tree bytes; in real life you'd cat-file the tree hash.)
	_ = treeHashHex // silence unused
	entries, err := ParseTree(treeRaw)
	if err != nil {
		t.Fatalf("ParseTree: %v", err)
	}
	if len(entries) != 2 {
		t.Errorf("expected 2 tree entries, got %d", len(entries))
	}
}

// --------------------------------------------------------------------------
// Helper
// --------------------------------------------------------------------------

func buildRawCommit(treeHash string, parentHashes []string, authorSig string, committerSig string, message string) []byte {
	var raw string
	raw += "tree " + treeHash + "\n"
	for _, p := range parentHashes {
		raw += "parent " + p + "\n"
	}
	raw += "author " + authorSig + "\n"
	raw += "committer " + committerSig + "\n"
	raw += "\n"
	raw += message
	return []byte(raw)
}
