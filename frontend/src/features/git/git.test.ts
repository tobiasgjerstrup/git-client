import { describe, it, expect } from "vitest";
import { parseGitStatusLine, isStagedFromXYStatus, hasUnstagedFromXYStatus, escapeHtml } from "./git";

// Note: parseGitStatusLine, isStagedFromXYStatus, and hasUnstagedFromXYStatus
// are currently private (not exported from git.ts).  Before writing your test
// bodies, add the 'export' keyword to each function in git.ts.
//
// e.g.  export function parseGitStatusLine(...) { ... }

// --------------------------------------------------------------------------
// parseGitStatusLine
// --------------------------------------------------------------------------

describe("parseGitStatusLine", () => {
  describe("porcelain v2 ordinary changed (1 ...)", () => {
    it("parses a modified staged+unstaged entry", () => {
      // Fill in: "1 MM N... 0000 0000 100644 <sha><sha><sha> file.txt"
    });

    it("parses an added entry", () => {
      // Fill in: "1 A. N... ..."
    });

    it("parses a deleted entry", () => {
      // Fill in: "1 .D N... ..."
    });
  });

  describe("porcelain v2 renamed/copied (2 ...)", () => {
    it("parses a renamed file with origPath", () => {
      // Fill in: "2 RM N... ... ... R100 new.txt\told.txt"
    });

    it("parses a renamed file without tab separator", () => {
      // Fill in: no \t in path portion.
    });
  });

  describe("porcelain v2 unmerged (u ...)", () => {
    it("parses a merge conflict (UU)", () => {
      // Fill in
    });
  });

  describe("porcelain v2 untracked (? ...)", () => {
    it("parses an untracked file", () => {
      // Fill in: "? newfile.txt"
    });
  });

  describe("porcelain v2 ignored (! ...)", () => {
    it("parses an ignored file", () => {
      // Fill in: "! ignored.log"
    });
  });

  describe("porcelain v1 fallback", () => {
    it("parses v1 ordinary changed: 'M  file.txt'", () => {
      // Fill in: "M  file.txt" (two chars, space, path)
    });

    it("parses v1 untracked: '?? file.txt'", () => {
      // Fill in
    });

    it("parses v1 ignored: '!! file.txt'", () => {
      // Fill in
    });

    it("parses v1 unmerged code", () => {
      // Fill in: e.g. "AA file.txt"
    });
  });

  describe("non-status lines", () => {
    it("returns null for a branch header line", () => {
      // Fill in: "# branch.head main"
    });

    it("returns null for an empty string", () => {
      // Fill in
    });

    it("returns null for a string that is too short", () => {
      // Fill in: "ab" (length < 3)
    });
  });
});

// --------------------------------------------------------------------------
// isStagedFromXYStatus
// --------------------------------------------------------------------------

describe("isStagedFromXYStatus", () => {
  it("returns true for 'M.'", () => { /* Fill in */ });
  it("returns true for 'MM'", () => { /* Fill in */ });
  it("returns true for 'A.'", () => { /* Fill in */ });
  it("returns true for 'D.'", () => { /* Fill in */ });
  it("returns false for '.M'", () => { /* Fill in */ });
  it("returns false for '??'", () => { /* Fill in */ });
  it("returns false for '!!'", () => { /* Fill in */ });
  it("returns false for '  ' (spaces)", () => { /* Fill in */ });
});

// --------------------------------------------------------------------------
// hasUnstagedFromXYStatus
// --------------------------------------------------------------------------

describe("hasUnstagedFromXYStatus", () => {
  it("returns true for '.M'", () => { /* Fill in */ });
  it("returns true for 'MM'", () => { /* Fill in */ });
  it("returns false for 'M.'", () => { /* Fill in */ });
  it("returns false for '..'", () => { /* Fill in */ });
  it("returns false for '  ' (spaces)", () => { /* Fill in */ });
});

// --------------------------------------------------------------------------
// escapeHtml
// --------------------------------------------------------------------------

describe("escapeHtml", () => {
  it("escapes & as &amp;", () => { /* Fill in */ });
  it("escapes < as &lt;", () => { /* Fill in */ });
  it("escapes > as &gt;", () => { /* Fill in */ });
  it("escapes \" as &quot;", () => { /* Fill in */ });
  it("escapes ' as &#39;", () => { /* Fill in */ });
  it("returns the same string when nothing needs escaping", () => { /* Fill in */ });
  it("handles an empty string", () => { /* Fill in */ });
});
