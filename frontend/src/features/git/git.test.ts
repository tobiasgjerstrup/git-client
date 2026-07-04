import { describe, it, expect } from 'vitest';
import { parseGitStatusLine, isStagedFromXYStatus, hasUnstagedFromXYStatus, escapeHtml } from './git';

// Note: parseGitStatusLine, isStagedFromXYStatus, and hasUnstagedFromXYStatus
// are currently private (not exported from git.ts).  Before writing your test
// bodies, add the 'export' keyword to each function in git.ts.
//
// e.g.  export function parseGitStatusLine(...) { ... }

// --------------------------------------------------------------------------
// parseGitStatusLine
// --------------------------------------------------------------------------

describe('parseGitStatusLine', () => {
    describe('porcelain v2 ordinary changed (1 ...)', () => {
        it('parses a modified staged+unstaged entry', () => {
            if (!parseGitStatusLine('1 MM N... 0000 0000 100644 <sha><sha><sha> file.txt')) {
                throw new Error('parseGitStatusLine failed to parse a modified staged+unstaged entry');
            }
        });

        it('parses an added entry', () => {
            if (!parseGitStatusLine('1 A. N... 0000 0000 100644 <sha><sha><sha> newfile.txt')) {
                throw new Error('parseGitStatusLine failed to parse an added entry');
            }
        });

        it('parses a deleted entry', () => {
            if (!parseGitStatusLine('1 D. N... 0000 0000 100644 <sha><sha><sha> deletedfile.txt')) {
                throw new Error('parseGitStatusLine failed to parse a deleted entry');
            }
        });
    });

    describe('porcelain v2 renamed/copied (2 ...)', () => {
        it('parses a renamed file with origPath', () => {
            if (!parseGitStatusLine('2 RM N... 0000 0000 100644 <sha><sha><sha> new.txt\told.txt')) {
                throw new Error('parseGitStatusLine failed to parse a renamed file with origPath');
            }
        });

        it('parses a renamed file without tab separator', () => {
            if (!parseGitStatusLine('2 RM N... 0000 0000 100644 <sha><sha><sha> new.txt')) {
                throw new Error('parseGitStatusLine failed to parse a renamed file without tab separator');
            }
        });
    });

    describe('porcelain v2 unmerged (u ...)', () => {
        it('parses a merge conflict (UU)', () => {
            if (!parseGitStatusLine('u UU N... 0000 0000 100644 <sha><sha><sha> conflicted.txt')) {
                throw new Error('parseGitStatusLine failed to parse a merge conflict (UU)');
            }
        });
    });

    describe('porcelain v2 untracked (? ...)', () => {
        it('parses an untracked file', () => {
            if (!parseGitStatusLine('? newfile.txt')) {
                throw new Error('parseGitStatusLine failed to parse an untracked file');
            }
        });
    });

    describe('porcelain v2 ignored (! ...)', () => {
        it('parses an ignored file', () => {
            if (!parseGitStatusLine('! ignored.log')) {
                throw new Error('parseGitStatusLine failed to parse an ignored file');
            }
        });
    });

    describe('porcelain v1 fallback', () => {
        it("parses v1 ordinary changed: 'M  file.txt'", () => {
            if (!parseGitStatusLine('M  file.txt')) {
                throw new Error('parseGitStatusLine failed to parse a v1 ordinary changed entry');
            }
        });

        it("parses v1 untracked: '?? file.txt'", () => {
            if (!parseGitStatusLine('?? file.txt')) {
                throw new Error('parseGitStatusLine failed to parse a v1 untracked entry');
            }
        });

        it("parses v1 ignored: '!! file.txt'", () => {
            if (!parseGitStatusLine('!! file.txt')) {
                throw new Error('parseGitStatusLine failed to parse a v1 ignored entry');
            }
        });

        it('parses v1 unmerged code', () => {
            if (!parseGitStatusLine('UU file.txt')) {
                throw new Error('parseGitStatusLine failed to parse a v1 unmerged entry');
            }
        });
    });

    describe('non-status lines', () => {
        it('returns null for a branch header line', () => {
            if (parseGitStatusLine('# branch.head main') !== null) {
                throw new Error('parseGitStatusLine incorrectly parsed a branch header line');
            }
        });

        it('returns null for an empty string', () => {
            if (parseGitStatusLine('') !== null) {
                throw new Error('parseGitStatusLine incorrectly parsed an empty string');
            }
        });

        it('returns null for a string that is too short', () => {
            if (parseGitStatusLine('ab') !== null) {
                throw new Error('parseGitStatusLine incorrectly parsed a string that is too short');
            }
        });
    });
});

// --------------------------------------------------------------------------
// isStagedFromXYStatus
// --------------------------------------------------------------------------

describe('isStagedFromXYStatus', () => {
    it("returns true for 'M.'", () => {
        if (!isStagedFromXYStatus('M.')) {
            throw new Error("isStagedFromXYStatus failed for 'M.'");
        }
    });
    it("returns true for 'MM'", () => {
        if (!isStagedFromXYStatus('MM')) {
            throw new Error("isStagedFromXYStatus failed for 'MM'");
        }
    });
    it("returns true for 'A.'", () => {
        if (!isStagedFromXYStatus('A.')) {
            throw new Error("isStagedFromXYStatus failed for 'A.'");
        }
    });
    it("returns true for 'D.'", () => {
        if (!isStagedFromXYStatus('D.')) {
            throw new Error("isStagedFromXYStatus failed for 'D.'");
        }
    });
    it("returns false for '.M'", () => {
        if (isStagedFromXYStatus('.M')) {
            throw new Error("isStagedFromXYStatus incorrectly returned true for '.M'");
        }
    });
    it("returns false for '??'", () => {
        if (isStagedFromXYStatus('??')) {
            throw new Error("isStagedFromXYStatus incorrectly returned true for '??'");
        }
    });
    it("returns false for '!!'", () => {
        if (isStagedFromXYStatus('!!')) {
            throw new Error("isStagedFromXYStatus incorrectly returned true for '!!'");
        }
    });
    it("returns false for '  ' (spaces)", () => {
        if (isStagedFromXYStatus('  ')) {
            throw new Error("isStagedFromXYStatus incorrectly returned true for '  '");
        }
    });
});

// --------------------------------------------------------------------------
// hasUnstagedFromXYStatus
// --------------------------------------------------------------------------

describe('hasUnstagedFromXYStatus', () => {
    it("returns true for '.M'", () => {
        if (!hasUnstagedFromXYStatus('.M')) {
            throw new Error("hasUnstagedFromXYStatus failed for '.M'");
        }
    });
    it("returns true for 'MM'", () => {
        if (!hasUnstagedFromXYStatus('MM')) {
            throw new Error("hasUnstagedFromXYStatus failed for 'MM'");
        }
    });
    it("returns false for 'M.'", () => {
        if (hasUnstagedFromXYStatus('M.')) {
            throw new Error("hasUnstagedFromXYStatus incorrectly returned true for 'M.'");
        }
    });
    it("returns false for '..'", () => {
        if (hasUnstagedFromXYStatus('..')) {
            throw new Error("hasUnstagedFromXYStatus incorrectly returned true for '..'");
        }
    });
    it("returns false for '  ' (spaces)", () => {
        if (hasUnstagedFromXYStatus('  ')) {
            throw new Error("hasUnstagedFromXYStatus incorrectly returned true for '  '");
        }
    });
});

// --------------------------------------------------------------------------
// escapeHtml
// --------------------------------------------------------------------------

// might be a little overkill, but im gonna be sad if this one day breaks
describe('escapeHtml', () => {
    it('escapes & as &amp;', () => {
        if (escapeHtml('&') !== '&amp;') {
            throw new Error('escapeHtml failed to escape &');
        }
    });
    it('escapes < as &lt;', () => {
        if (escapeHtml('<') !== '&lt;') {
            throw new Error('escapeHtml failed to escape <');
        }
    });
    it('escapes > as &gt;', () => {
        if (escapeHtml('>') !== '&gt;') {
            throw new Error('escapeHtml failed to escape >');
        }
    });
    it('escapes " as &quot;', () => {
        if (escapeHtml('"') !== '&quot;') {
            throw new Error('escapeHtml failed to escape "');
        }
    });
    it("escapes ' as &#39;", () => {
        if (escapeHtml("'") !== '&#39;') {
            throw new Error("escapeHtml failed to escape '");
        }
    });
    it('returns the same string when nothing needs escaping', () => {
        if (escapeHtml('Hello, World!') !== 'Hello, World!') {
            throw new Error("escapeHtml incorrectly modified a string that didn't need escaping");
        }
    });
    it('handles an empty string', () => {
        if (escapeHtml('') !== '') {
            throw new Error('escapeHtml failed to handle an empty string');
        }
    });
});
