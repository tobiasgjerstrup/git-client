import { describe, it, expect, beforeEach } from "vitest";
import {
  beginGitAction,
  endGitAction,
  isAnyGitActionPending,
  getGitActionButtonAttrs,
} from "./gitActionState";

// The module uses module-level state; vitest gives each describe block a
// fresh module graph, so state is automatically reset per-test.

describe("beginGitAction", () => {
  it("registers a new action and returns a key", () => {
    // Fill in
  });

  it("returns null when an action is already pending for the same file path", () => {
    // Fill in
  });

  it("allows concurrent actions on different file paths", () => {
    // Fill in
  });
});

describe("endGitAction", () => {
  it("removes a pending action by its key", () => {
    // Fill in
  });

  it("is safe to call with an unknown key (no-op)", () => {
    // Fill in
  });
});

describe("isAnyGitActionPending", () => {
  it("returns false when nothing is pending", () => {
    // Fill in
  });

  it("returns true while an action is pending", () => {
    // Fill in
  });

  it("returns false after the action has ended", () => {
    // Fill in
  });
});

describe("getGitActionButtonAttrs", () => {
  it("includes disabled attribute when an action is pending", () => {
    // Fill in
  });

  it("does not include disabled when no action is pending", () => {
    // Fill in
  });

  it("escapes special HTML characters in the action key", () => {
    // Fill in: &, ", <, >
  });
});
