import { describe, it, expect, beforeEach, vi } from "vitest";
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
  RecentRepository,
} from "./recentRepositories";

const STORAGE_KEY = "git-client-recent-repositories";
const MAX_KEY = "git-client-max-recent-repositories";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
});

describe("getRecentRepositories", () => {
  it("returns an empty array when nothing is stored", () => {
    // Fill in
  });

  it("parses a valid stored array", () => {
    // Fill in
  });

  it("sorts entries by lastOpenedAt descending (most recent first)", () => {
    // Fill in
  });

  it("deduplicates entries by path, keeping the first occurrence", () => {
    // Fill in
  });

  it("returns an empty array when stored JSON is malformed", () => {
    // Fill in: localStorage.setItem(STORAGE_KEY, "not json")
  });

  it("filters out entries missing required fields", () => {
    // Fill in: array with some items missing 'path', 'label', or 'lastOpenedAt'
  });
});

describe("saveRecentRepositories", () => {
  it("persists the array as JSON", () => {
    // Fill in
  });

  it("truncates the list to the configured max", () => {
    // Fill in
  });
});

describe("addRecentRepository", () => {
  it("inserts a new entry at the front", () => {
    // Fill in
  });

  it("moves an existing entry to the front instead of duplicating", () => {
    // Fill in
  });

  it("is a no-op for an empty path", () => {
    // Fill in
  });

  it("derives the label from the last segment of the path", () => {
    // Fill in: "/home/user/projects/my-repo" → label "my-repo"
  });
});

describe("removeRecentRepository", () => {
  it("removes an entry by path", () => {
    // Fill in
  });

  it("is a no-op when the path is not found", () => {
    // Fill in
  });
});

describe("clearRecentRepositories", () => {
  it("clears all stored entries", () => {
    // Fill in
  });
});

describe("getMaxRecentRepositories", () => {
  it("returns the default when nothing is stored", () => {
    // Fill in
  });

  it("returns the stored value", () => {
    // Fill in
  });

  it("returns the default when the stored value is not a number", () => {
    // Fill in
  });
});

describe("setMaxRecentRepositoriesLimit", () => {
  it("returns the normalised value", () => {
    // Fill in
  });

  it("clamps below the minimum", () => {
    // Fill in: value = 0 → clamped to MIN_MAX_RECENT_REPOSITORIES (1)
  });

  it("clamps above the maximum", () => {
    // Fill in: value = 200 → clamped to MAX_MAX_RECENT_REPOSITORIES (99)
  });

  it("rounds non-integer values", () => {
    // Fill in: 3.7 → 4
  });

  it("falls back to default for non-finite values (NaN, Infinity)", () => {
    // Fill in
  });

  it("trims the existing list when the new limit is lower", () => {
    // Fill in
  });
});
