import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getRecentRepositories,
    saveRecentRepositories,
    addRecentRepository,
    removeRecentRepository,
    clearRecentRepositories,
    getMaxRecentRepositories,
    setMaxRecentRepositoriesLimit,
    DEFAULT_MAX_RECENT_REPOSITORIES,
    MIN_MAX_RECENT_REPOSITORIES,
    MAX_MAX_RECENT_REPOSITORIES,
} from './recentRepositories';

const STORAGE_KEY = 'git-client-recent-repositories';

function stored() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
}

beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
});

describe('getRecentRepositories', () => {
    it('returns an empty array when nothing is stored', () => {
        expect(getRecentRepositories()).toEqual([]);
    });

    it('parses a valid stored array', () => {
        saveRecentRepositories([
            { path: '/a', label: 'A', lastOpenedAt: 100 },
            { path: '/b', label: 'B', lastOpenedAt: 200 },
        ]);
        const repos = getRecentRepositories();
        expect(repos).toHaveLength(2);
        expect(repos[0].path).toBe('/b'); // most recent first
        expect(repos[1].path).toBe('/a');
    });

    it('sorts entries by lastOpenedAt descending', () => {
        saveRecentRepositories([
            { path: '/old', label: 'Old', lastOpenedAt: 1 },
            { path: '/new', label: 'New', lastOpenedAt: 999 },
            { path: '/mid', label: 'Mid', lastOpenedAt: 500 },
        ]);
        expect(getRecentRepositories().map((r) => r.path)).toEqual(['/new', '/mid', '/old']);
    });

    it('deduplicates entries by path, keeping the first occurrence', () => {
        saveRecentRepositories([
            { path: '/a', label: 'A1', lastOpenedAt: 200 },
            { path: '/a', label: 'A2', lastOpenedAt: 100 },
            { path: '/b', label: 'B', lastOpenedAt: 50 },
        ]);
        const repos = getRecentRepositories();
        expect(repos.map((r) => r.path)).toEqual(['/a', '/b']);
    });

    it('returns an empty array when stored JSON is malformed', () => {
        localStorage.setItem(STORAGE_KEY, 'not valid json!!');
        expect(getRecentRepositories()).toEqual([]);
    });

    it('filters out items missing required fields', () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify([
                { path: '/a' }, // missing label, lastOpenedAt
                { path: '/b', label: 'B' }, // missing lastOpenedAt
                { label: 'C', lastOpenedAt: 1 }, // missing path
                { path: '/d', label: 'D', lastOpenedAt: 1 }, // valid
                'not an object',
                null,
            ]),
        );
        const repos = getRecentRepositories();
        expect(repos).toHaveLength(1);
        expect(repos[0].path).toBe('/d');
    });
});

describe('saveRecentRepositories', () => {
    it('persists the array as JSON', () => {
        saveRecentRepositories([{ path: '/a', label: 'A', lastOpenedAt: 42 }]);
        expect(stored()).toEqual([{ path: '/a', label: 'A', lastOpenedAt: 42 }]);
    });

    it('truncates the list to the configured max', () => {
        setMaxRecentRepositoriesLimit(2);
        saveRecentRepositories([
            { path: '/a', label: 'A', lastOpenedAt: 300 },
            { path: '/b', label: 'B', lastOpenedAt: 200 },
            { path: '/c', label: 'C', lastOpenedAt: 100 },
        ]);
        expect(stored()).toHaveLength(2);
    });
});

describe('addRecentRepository', () => {
    it('inserts a new entry at the front', () => {
        saveRecentRepositories([{ path: '/a', label: 'A', lastOpenedAt: 1 }]);
        addRecentRepository('/b');
        const repos = getRecentRepositories();
        expect(repos[0].path).toBe('/b');
        expect(repos[0].lastOpenedAt).toBe(Date.now());
    });

    it('moves an existing entry to the front instead of duplicating', () => {
        saveRecentRepositories([
            { path: '/a', label: 'A', lastOpenedAt: 1 },
            { path: '/b', label: 'B', lastOpenedAt: 2 },
        ]);
        addRecentRepository('/a');
        const repos = getRecentRepositories();
        expect(repos.map((r) => r.path)).toEqual(['/a', '/b']);
        expect(repos).toHaveLength(2);
    });

    it('is a no-op for an empty path', () => {
        saveRecentRepositories([{ path: '/a', label: 'A', lastOpenedAt: 1 }]);
        addRecentRepository('');
        expect(getRecentRepositories()).toHaveLength(1);
    });

    it('derives the label from the last segment of the path', () => {
        addRecentRepository('C:/projects/my-repo');
        expect(getRecentRepositories()[0].label).toBe('my-repo');
    });

    it('handles a path with trailing slash', () => {
        addRecentRepository('/home/user/repo/');
        expect(getRecentRepositories()[0].label).toBe('repo');
    });
});

describe('removeRecentRepository', () => {
    it('removes an entry by path', () => {
        saveRecentRepositories([
            { path: '/a', label: 'A', lastOpenedAt: 1 },
            { path: '/b', label: 'B', lastOpenedAt: 2 },
        ]);
        removeRecentRepository('/a');
        expect(getRecentRepositories().map((r) => r.path)).toEqual(['/b']);
    });

    it('is a no-op when the path is not found', () => {
        saveRecentRepositories([{ path: '/a', label: 'A', lastOpenedAt: 1 }]);
        removeRecentRepository('/nope');
        expect(getRecentRepositories()).toHaveLength(1);
    });
});

describe('clearRecentRepositories', () => {
    it('clears all stored entries', () => {
        saveRecentRepositories([{ path: '/a', label: 'A', lastOpenedAt: 1 }]);
        clearRecentRepositories();
        expect(getRecentRepositories()).toEqual([]);
    });
});

describe('getMaxRecentRepositories', () => {
    it('returns the default when nothing is stored', () => {
        expect(getMaxRecentRepositories()).toBe(DEFAULT_MAX_RECENT_REPOSITORIES);
    });

    it('returns the stored value', () => {
        localStorage.setItem('git-client-max-recent-repositories', '10');
        expect(getMaxRecentRepositories()).toBe(10);
    });

    it('returns the default when the stored value is not a number', () => {
        localStorage.setItem('git-client-max-recent-repositories', 'abc');
        expect(getMaxRecentRepositories()).toBe(DEFAULT_MAX_RECENT_REPOSITORIES);
    });
});

describe('setMaxRecentRepositoriesLimit', () => {
    it('returns the normalised value', () => {
        expect(setMaxRecentRepositoriesLimit(10)).toBe(10);
    });

    it('clamps below the minimum', () => {
        expect(setMaxRecentRepositoriesLimit(0)).toBe(MIN_MAX_RECENT_REPOSITORIES);
        expect(setMaxRecentRepositoriesLimit(-5)).toBe(MIN_MAX_RECENT_REPOSITORIES);
    });

    it('clamps above the maximum', () => {
        expect(setMaxRecentRepositoriesLimit(200)).toBe(MAX_MAX_RECENT_REPOSITORIES);
    });

    it('rounds non-integer values', () => {
        expect(setMaxRecentRepositoriesLimit(3.2)).toBe(3);
        expect(setMaxRecentRepositoriesLimit(3.7)).toBe(4);
    });

    it('falls back to default for NaN', () => {
        expect(setMaxRecentRepositoriesLimit(NaN)).toBe(DEFAULT_MAX_RECENT_REPOSITORIES);
    });

    it('falls back to default for Infinity', () => {
        expect(setMaxRecentRepositoriesLimit(Infinity)).toBe(DEFAULT_MAX_RECENT_REPOSITORIES);
    });

    it('trims the existing list when the new limit is lower', () => {
        saveRecentRepositories([
            { path: '/a', label: 'A', lastOpenedAt: 3 },
            { path: '/b', label: 'B', lastOpenedAt: 2 },
            { path: '/c', label: 'C', lastOpenedAt: 1 },
        ]);
        setMaxRecentRepositoriesLimit(2);
        expect(getRecentRepositories()).toHaveLength(2);
    });
});
