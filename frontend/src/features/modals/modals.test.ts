import { describe, it, expect, beforeEach } from "vitest";
import { ModalManager } from "./modals";

// Your app.html defines modals with these ids:
//   #DiscardModal          – <div id="DiscardModal" hidden>
//   #BranchSwitchModal     – <div id="BranchSwitchModal" hidden>
//   #BranchDeleteModal     – <div id="BranchDeleteModal" hidden>
//   #SettingsModal         – <div id="SettingsModal" hidden>
//
// This test file sets up the DOM with the elements the ModalManager expects.
// If the actual markup changes, update the fixtures below.

function setupModalDOM() {
  document.body.innerHTML = `
    <div id="DiscardModal" hidden>
      <div class="modal-card" tabindex="-1">
        <div id="DiscardModalDescription"></div>
        <button id="ConfirmDiscardButton">Discard</button>
      </div>
    </div>
    <div id="BranchSwitchModal" hidden>
      <div class="modal-card" tabindex="-1">
        <h2 id="BranchSwitchModalTitle"></h2>
        <p id="BranchSwitchModalCopy"></p>
        <p id="BranchSwitchModalDescription"></p>
        <button id="ConfirmBranchSwitchButton">Switch</button>
      </div>
    </div>
    <div id="BranchDeleteModal" hidden>
      <div class="modal-card" tabindex="-1">
        <h2 id="BranchDeleteModalTitle"></h2>
        <p id="BranchDeleteModalCopy"></p>
        <p id="BranchDeleteModalDescription"></p>
        <button id="ConfirmDeleteBranchButton">Delete</button>
      </div>
    </div>
    <div id="SettingsModal" hidden></div>
  `;
}

function noopPending(_path: string): boolean {
  return false;
}

function makeManager() {
  return new ModalManager({
    isSettingsModalOpen: () => false,
    closeSettingsModal: () => {},
  });
}

beforeEach(() => {
  setupModalDOM();
});

// --------------------------------------------------------------------------
// Lifecycle
// --------------------------------------------------------------------------

describe("constructor / ensureKeyListener", () => {
  it("registers a keydown listener", () => {
    // Fill in
  });

  it("does not register a second listener on repeated calls", () => {
    // Fill in
  });
});

// --------------------------------------------------------------------------
// Discard modal
// --------------------------------------------------------------------------

describe("discard modal", () => {
  it("shows the modal with a single item description", () => {
    // Fill in
  });

  it("shows the modal with multiple items", () => {
    // Fill in
  });

  it("hides the modal on closeDiscard", () => {
    // Fill in
  });

  it("disables the confirm button when any item has a pending git action", () => {
    // Fill in: pass isAnyGitActionPending that returns true for one item.
  });

  it("closes on Escape key", () => {
    // Fill in
  });
});

// --------------------------------------------------------------------------
// Branch switch modal
// --------------------------------------------------------------------------

describe("branch switch modal", () => {
  it("shows local branch switch content", () => {
    // Fill in: openBranchSwitch("main") — isRemote === false.
  });

  it("shows remote → local creation content", () => {
    // Fill in: openBranchSwitch("origin/feat", true).
  });

  it("hides the modal on closeBranchSwitch", () => {
    // Fill in
  });

  it("closes on Escape key", () => {
    // Fill in
  });
});

// --------------------------------------------------------------------------
// Branch delete modal
// --------------------------------------------------------------------------

describe("branch delete modal", () => {
  it("shows normal delete content", () => {
    // Fill in: openBranchDelete("old-branch").
  });

  it("shows force-delete content", () => {
    // Fill in: openBranchDelete("unsynced", true).
  });

  it("hides the modal on closeBranchDelete", () => {
    // Fill in
  });

  it("closes on Escape key", () => {
    // Fill in
  });
});

// --------------------------------------------------------------------------
// hasActiveModal
// --------------------------------------------------------------------------

describe("hasActiveModal", () => {
  it("returns false when nothing is open", () => {
    // Fill in
  });

  it("returns true when a discard modal is open", () => {
    // Fill in
  });

  it("returns true when a branch switch modal is open", () => {
    // Fill in
  });

  it("returns true when a branch delete modal is open", () => {
    // Fill in
  });

  it("returns true when settings modal is open", () => {
    // Fill in: need to instantiate manager with { isSettingsModalOpen: () => true, ... }
  });
});

// --------------------------------------------------------------------------
// toLocalBranchName (private — test via ModalManager)
// --------------------------------------------------------------------------

describe("branch name transformation", () => {
  it("strips 'origin/' prefix from remote branch names", () => {
    // Fill in: openBranchSwitch("origin/feat", true), then inspect state.
  });

  it("handles a branch name without a slash", () => {
    // Fill in
  });

  it("handles a branch name ending with a slash", () => {
    // Fill in: "origin/" -> stays "origin/"
  });
});

// --------------------------------------------------------------------------
// formatDiscardDescription (private — test via ModalManager)
// --------------------------------------------------------------------------

describe("discard description format", () => {
  it("formats a single item without bullet points", () => {
    // Fill in: inspect DOM after openDiscard with 1 item.
  });

  it("formats multiple items with bullet points", () => {
    // Fill in: inspect DOM after openDiscard with 3 items.
  });
});
