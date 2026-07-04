import { describe, it, expect, beforeEach } from 'vitest';
import { beginGitAction, endGitAction, isAnyGitActionPending, getGitActionButtonAttrs } from './gitActionState';

function drainActions(paths: string[]) {
    for (const p of paths) {
        if (isAnyGitActionPending(p)) {
            // endGitAction accepts any string; pass the path as the key.
            endGitAction(p);
        }
    }
}

const testPaths = ['src/foo.ts', 'a.ts', 'b.ts', 'src/bar.ts', 'x.ts', 'clean.ts', 'a"b&c<d>e'];

beforeEach(() => {
    drainActions(testPaths);
});

describe('beginGitAction', () => {
    it('registers a new action and returns a key', () => {
        const key = beginGitAction('src/foo.ts');
        expect(key).toBe('src/foo.ts');
        expect(isAnyGitActionPending('src/foo.ts')).toBe(true);
    });

    it('returns null when an action is already pending for the same file path', () => {
        beginGitAction('src/foo.ts');
        const second = beginGitAction('src/foo.ts');
        expect(second).toBeNull();
    });

    it('allows concurrent actions on different file paths', () => {
        beginGitAction('a.ts');
        const key = beginGitAction('b.ts');
        expect(key).toBe('b.ts');
        expect(isAnyGitActionPending('a.ts')).toBe(true);
        expect(isAnyGitActionPending('b.ts')).toBe(true);
    });
});

describe('endGitAction', () => {
    it('removes a pending action by its key', () => {
        const key = beginGitAction('src/bar.ts');
        endGitAction(key);
        expect(isAnyGitActionPending('src/bar.ts')).toBe(false);
    });

    it('is safe to call with an unknown key (no-op)', () => {
        expect(() => endGitAction('nonexistent')).not.toThrow();
    });
});

describe('isAnyGitActionPending', () => {
    it('returns false when nothing is pending', () => {
        expect(isAnyGitActionPending('x.ts')).toBe(false);
    });

    it('returns true while an action is pending', () => {
        beginGitAction('x.ts');
        expect(isAnyGitActionPending('x.ts')).toBe(true);
    });

    it('returns false after the action has ended', () => {
        const key = beginGitAction('x.ts');
        endGitAction(key);
        expect(isAnyGitActionPending('x.ts')).toBe(false);
    });
});

describe('getGitActionButtonAttrs', () => {
    it('includes disabled attribute when an action is pending', () => {
        beginGitAction('a.ts');
        const attrs = getGitActionButtonAttrs('a.ts');
        expect(attrs).toContain(' disabled');
    });

    it('does not include disabled when no action is pending', () => {
        const attrs = getGitActionButtonAttrs('clean.ts');
        expect(attrs).not.toContain(' disabled');
    });

    it('escapes special HTML characters in the action key', () => {
        const attrs = getGitActionButtonAttrs('a"b&c<d>e');
        expect(attrs).toContain('a&quot;b&amp;c&lt;d&gt;e');
    });
});
