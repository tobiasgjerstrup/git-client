type DiscardModalState = {
	items: { filePath: string; description: string }[];
} | null;

type BranchSwitchModalState = {
	displayBranchName: string;
	targetBranchName: string;
	createLocal: boolean;
} | null;

type BranchDeleteModalState = {
	branchName: string;
	forceDelete: boolean;
} | null;

type BranchArchiveInfoModalState = {
	branchName: string;
} | null;

type BranchArchiveConfirmModalState = {
	branchName: string;
	archiveName: string;
	deleteRemote: boolean;
	remote: boolean;
} | null;

type ModalManagerOptions = {
	isSettingsModalOpen: () => boolean;
	closeSettingsModal: () => void;
};

export class ModalManager {
	private discardModalState: DiscardModalState = null;
	private branchSwitchModalState: BranchSwitchModalState = null;
	private branchDeleteModalState: BranchDeleteModalState = null;
	private branchArchiveInfoModalState: BranchArchiveInfoModalState = null;
	private branchArchiveConfirmModalState: BranchArchiveConfirmModalState = null;
	private modalKeyListenerBound = false;

	constructor(private readonly options: ModalManagerOptions) {}

	/**
	 * Ensures the modal keyboard listener is attached exactly once.
	 */
	ensureKeyListener() {
		if (this.modalKeyListenerBound) {
			return;
		}

		document.addEventListener("keydown", this.handleModalKeydown);
		this.modalKeyListenerBound = true;
	}

	/**
	 * Refreshes the current modal visibility and content state.
	 *
	 * @param isAnyGitActionPending - Function to decide whether discard actions should be disabled.
	 */
	refreshModals(isAnyGitActionPending: (filePath: string) => boolean) {
		this.updateDiscardModal(isAnyGitActionPending);
		this.updateBranchSwitchModal();
		this.updateBranchDeleteModal();
		this.updateBranchArchiveInfoModal();
		this.updateBranchArchiveConfirmModal();
	}

	/**
	 * Returns whether any modal is currently active.
	 */
	hasActiveModal() {
		return !!this.getActiveModal();
	}

	/**
	 * Retrieves the current discard modal state.
	 */
	getDiscardModalState() {
		return this.discardModalState;
	}

	/**
	 * Opens the discard confirmation modal for the given items.
	 *
	 * @param items - The list of files and descriptions to discard.
	 * @param isAnyGitActionPending - Function used to disable the confirm button when needed.
	 */
	openDiscard(items: { filePath: string; description: string }[], isAnyGitActionPending: (filePath: string) => boolean) {
		this.discardModalState = { items };
		this.updateDiscardModal(isAnyGitActionPending);
	}

	/**
	 * Closes the discard confirmation modal.
	 *
	 * @param isAnyGitActionPending - Function used to reset confirm button state.
	 */
	closeDiscard(isAnyGitActionPending: (filePath: string) => boolean) {
		this.discardModalState = null;
		this.updateDiscardModal(isAnyGitActionPending);
	}

	/**
	 * Retrieves the current branch switch modal state.
	 */
	getBranchSwitchModalState() {
		return this.branchSwitchModalState;
	}

	/**
	 * Opens the branch switch confirmation modal.
	 *
	 * @param branchName - The branch to switch to.
	 * @param isRemote - Whether the branch is a remote branch.
	 */
	openBranchSwitch(branchName: string, isRemote?: boolean) {
		this.branchSwitchModalState = isRemote
			? {
				displayBranchName: branchName,
				targetBranchName: toLocalBranchName(branchName),
				createLocal: true,
			}
			: {
				displayBranchName: branchName,
				targetBranchName: branchName,
				createLocal: false,
			};
		this.updateBranchSwitchModal();
	}

	/**
	 * Closes the branch switch modal.
	 */
	closeBranchSwitch() {
		this.branchSwitchModalState = null;
		this.updateBranchSwitchModal();
	}

	/**
	 * Retrieves the current branch delete modal state.
	 */
	getBranchDeleteModalState() {
		return this.branchDeleteModalState;
	}

	/**
	 * Opens the branch delete confirmation modal.
	 *
	 * @param branchName - The branch to delete.
	 * @param forceDelete - Whether deletion should be forced.
	 */
	openBranchDelete(branchName: string, forceDelete?: boolean) {
		this.branchDeleteModalState = {
			branchName,
			forceDelete: !!forceDelete,
		};
		this.updateBranchDeleteModal();
	}

	/**
	 * Closes the branch delete confirmation modal.
	 */
	closeBranchDelete() {
		this.branchDeleteModalState = null;
		this.updateBranchDeleteModal();
	}

	/**
	 * Retrieves the current branch archive info modal state.
	 */
	getBranchArchiveInfoModalState() {
		return this.branchArchiveInfoModalState;
	}

	openBranchArchiveInfo(branchName: string) {
		this.branchArchiveInfoModalState = { branchName };
		this.updateBranchArchiveInfoModal();
	}

	/**
	 * Closes the branch archive info modal.
	 */
	closeBranchArchiveInfo() {
		this.branchArchiveInfoModalState = null;
		this.updateBranchArchiveInfoModal();
	}

	/**
	 * Retrieves the current branch archive confirm modal state.
	 */
	getBranchArchiveConfirmModalState() {
		return this.branchArchiveConfirmModalState;
	}

	/**
	 * Opens the branch archive confirmation modal.
	 *
	 * @param branchName - The branch to archive.
	 * @param deleteRemote - Whether to delete the original branch after archiving.
	 * @param remote - Whether the target branch is remote.
	 */
	openBranchArchiveConfirm(branchName: string, deleteRemote: boolean, remote?: boolean) {
		this.branchArchiveConfirmModalState = {
			branchName,
			archiveName: remote ? "archive/" + toLocalBranchName(branchName) : "archive/" + branchName,
			deleteRemote,
			remote: !!remote,
		};
		this.updateBranchArchiveConfirmModal();
	}

	/**
	 * Closes the branch archive confirmation modal.
	 */
	closeBranchArchiveConfirm() {
		this.branchArchiveConfirmModalState = null;
		this.updateBranchArchiveConfirmModal();
	}

	/**
	 * Updates discard modal visibility and button state.
	 *
	 * @param isAnyGitActionPending - Function to determine whether discard is allowed.
	 */
	private updateDiscardModal(isAnyGitActionPending: (filePath: string) => boolean) {
		const modal = document.getElementById("DiscardModal");
		if (!modal) {
			return;
		}

		const descriptionEl = document.getElementById("DiscardModalDescription");
		const confirmButton = document.getElementById("ConfirmDiscardButton") as HTMLButtonElement | null;
		if (this.discardModalState) {
			modal.removeAttribute("hidden");
			descriptionEl!.textContent = formatDiscardDescription(this.discardModalState.items);
			if (confirmButton) {
				confirmButton.disabled = this.discardModalState.items.some((item) => isAnyGitActionPending(item.filePath));
			}
			this.focusModalInitialTarget("DiscardModal");
		} else {
			modal.setAttribute("hidden", "");
			if (descriptionEl) {
				descriptionEl.textContent = "";
			}
			if (confirmButton) {
				confirmButton.disabled = false;
			}
		}
	}

	/**
	 * Updates the branch switch modal contents and visibility.
	 */
	private updateBranchSwitchModal() {
		const modal = document.getElementById("BranchSwitchModal");
		if (!modal) {
			return;
		}

		const titleEl = document.getElementById("BranchSwitchModalTitle");
		const copyEl = document.getElementById("BranchSwitchModalCopy");
		const descriptionEl = document.getElementById("BranchSwitchModalDescription");
		const confirmButton = document.getElementById("ConfirmBranchSwitchButton") as HTMLButtonElement | null;
		if (this.branchSwitchModalState) {
			modal.removeAttribute("hidden");
			if (titleEl) {
				titleEl.textContent = this.branchSwitchModalState.createLocal ? "Create local branch and switch?" : "Switch branch?";
			}
			if (copyEl) {
				copyEl.textContent = this.branchSwitchModalState.createLocal
					? "This will create a local branch from the selected remote branch and check it out in your current repository."
					: "This will check out the selected branch in your current repository.";
			}
			if (descriptionEl) {
				descriptionEl.textContent = this.branchSwitchModalState.createLocal
					? `${this.branchSwitchModalState.displayBranchName} -> ${this.branchSwitchModalState.targetBranchName}`
					: this.branchSwitchModalState.displayBranchName;
			}
			if (confirmButton) {
				confirmButton.disabled = false;
				confirmButton.textContent = this.branchSwitchModalState.createLocal ? "Create local and switch" : "Switch branch";
			}
			this.focusModalInitialTarget("BranchSwitchModal", "#ConfirmBranchSwitchButton");
		} else {
			modal.setAttribute("hidden", "");
			if (titleEl) {
				titleEl.textContent = "Switch branch?";
			}
			if (copyEl) {
				copyEl.textContent = "This will check out the selected branch in your current repository.";
			}
			if (descriptionEl) {
				descriptionEl.textContent = "";
			}
			if (confirmButton) {
				confirmButton.disabled = false;
				confirmButton.textContent = "Switch branch";
			}
		}
	}

	/**
	 * Updates the branch delete modal contents and visibility.
	 */
	private updateBranchDeleteModal() {
		const modal = document.getElementById("BranchDeleteModal");
		if (!modal) {
			return;
		}

		const titleEl = document.getElementById("BranchDeleteModalTitle");
		const copyEl = document.getElementById("BranchDeleteModalCopy");
		const descriptionEl = document.getElementById("BranchDeleteModalDescription");
		const confirmButton = document.getElementById("ConfirmDeleteBranchButton") as HTMLButtonElement | null;
		if (this.branchDeleteModalState) {
			modal.removeAttribute("hidden");
			if (titleEl) {
				titleEl.textContent = this.branchDeleteModalState.forceDelete ? "Force delete unsynced local branch?" : "Delete local branch?";
			}
			if (copyEl) {
				copyEl.textContent = this.branchDeleteModalState.forceDelete
					? "This branch is not synced with its remote counterpart. Deleting it will force-remove the local branch even if it contains work not present on origin."
					: "This will delete the selected local branch from your repository.";
			}
			if (descriptionEl) {
				descriptionEl.textContent = this.branchDeleteModalState.branchName;
			}
			if (confirmButton) {
				confirmButton.disabled = false;
				confirmButton.textContent = this.branchDeleteModalState.forceDelete ? "Force delete branch" : "Delete branch";
			}
			this.focusModalInitialTarget("BranchDeleteModal");
		} else {
			modal.setAttribute("hidden", "");
			if (titleEl) {
				titleEl.textContent = "Delete local branch?";
			}
			if (copyEl) {
				copyEl.textContent = "This will delete the selected local branch from your repository.";
			}
			if (descriptionEl) {
				descriptionEl.textContent = "";
			}
			if (confirmButton) {
				confirmButton.disabled = false;
				confirmButton.textContent = "Delete branch";
			}
		}
	}

	/**
	 * Updates the branch archive info modal visibility.
	 */
	private updateBranchArchiveInfoModal() {
		const modal = document.getElementById("BranchArchiveInfoModal");
		if (!modal) {
			return;
		}

		if (this.branchArchiveInfoModalState) {
			modal.removeAttribute("hidden");
			this.focusModalInitialTarget("BranchArchiveInfoModal", "#BranchArchiveInfoSettingsButton");
		} else {
			modal.setAttribute("hidden", "");
		}
	}

	/**
	 * Updates the branch archive confirmation modal visibility and content.
	 */
	private updateBranchArchiveConfirmModal() {
		const modal = document.getElementById("BranchArchiveModal");
		if (!modal) {
			return;
		}

		const copyEl = document.getElementById("BranchArchiveModalCopy");
		const descriptionEl = document.getElementById("BranchArchiveModalDescription");
		const confirmButton = document.getElementById("ConfirmArchiveBranchButton") as HTMLButtonElement | null;
		if (this.branchArchiveConfirmModalState) {
			modal.removeAttribute("hidden");
			if (copyEl) {
				const state = this.branchArchiveConfirmModalState;
				if (state.remote) {
					copyEl.textContent = state.deleteRemote
						? `This will push "${state.archiveName}" to origin from "${state.branchName}" and delete "${state.branchName}" from the remote.`
						: `This will push "${state.archiveName}" to origin from "${state.branchName}". The original remote branch will remain.`;
				} else {
					copyEl.textContent = state.deleteRemote
						? `This will rename "${state.branchName}" to "${state.archiveName}", push the archived branch to origin, and delete "${state.branchName}" from the remote.`
						: `This will rename "${state.branchName}" to "${state.archiveName}" and push the archived branch to origin. The original branch will remain on the remote.`;
				}
			}
			if (descriptionEl) {
				descriptionEl.textContent = `${this.branchArchiveConfirmModalState.branchName} -> ${this.branchArchiveConfirmModalState.archiveName}`;
			}
			if (confirmButton) {
				confirmButton.disabled = false;
			}
			this.focusModalInitialTarget("BranchArchiveModal", "#ConfirmArchiveBranchButton");
		} else {
			modal.setAttribute("hidden", "");
			if (copyEl) {
				copyEl.textContent = "";
			}
			if (descriptionEl) {
				descriptionEl.textContent = "";
			}
			if (confirmButton) {
				confirmButton.disabled = false;
			}
		}
	}

	/**
	 * Handles keyboard navigation and Escape behavior for open modals.
	 */
	private handleModalKeydown = (event: KeyboardEvent) => {
		const activeModal = this.getActiveModal();
		if (!activeModal) {
			return;
		}

		if (event.key !== "Escape") {
			if (event.key !== "Tab") {
				return;
			}

			const focusableElements = this.getModalFocusableElements(activeModal);
			if (focusableElements.length === 0) {
				this.focusModalCard(activeModal);
				event.preventDefault();
				return;
			}

			const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
			if (currentIndex === -1) {
				focusableElements[event.shiftKey ? focusableElements.length - 1 : 0].focus({ preventScroll: true });
				event.preventDefault();
				return;
			}

			if (event.shiftKey && currentIndex === 0) {
				focusableElements[focusableElements.length - 1].focus({ preventScroll: true });
				event.preventDefault();
				return;
			}

			if (!event.shiftKey && currentIndex === focusableElements.length - 1) {
				focusableElements[0].focus({ preventScroll: true });
				event.preventDefault();
			}
			return;
		}

		if (this.discardModalState) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.discardModalState = null;
			this.updateDiscardModal(() => false);
			return;
		}

		if (this.branchSwitchModalState) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.closeBranchSwitch();
			return;
		}

		if (this.branchDeleteModalState) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.closeBranchDelete();
			return;
		}

		if (this.branchArchiveInfoModalState) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.closeBranchArchiveInfo();
			return;
		}

		if (this.branchArchiveConfirmModalState) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.closeBranchArchiveConfirm();
			return;
		}

		if (this.options.isSettingsModalOpen()) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.options.closeSettingsModal();
		}
	}

	/**
	 * Returns the currently active modal element, if any.
	 */
	private getActiveModal() {
		if (this.discardModalState) {
			return document.getElementById("DiscardModal") as HTMLElement | null;
		}

		if (this.branchSwitchModalState) {
			return document.getElementById("BranchSwitchModal") as HTMLElement | null;
		}

		if (this.branchDeleteModalState) {
			return document.getElementById("BranchDeleteModal") as HTMLElement | null;
		}

		if (this.branchArchiveInfoModalState) {
			return document.getElementById("BranchArchiveInfoModal") as HTMLElement | null;
		}

		if (this.branchArchiveConfirmModalState) {
			return document.getElementById("BranchArchiveModal") as HTMLElement | null;
		}

		if (this.options.isSettingsModalOpen()) {
			return document.getElementById("SettingsModal") as HTMLElement | null;
		}

		return null;
	}

	/**
	 * Focuses the initial interactive element when a modal becomes visible.
	 *
	 * @param modalId - The DOM id of the modal.
	 * @param preferredSelector - Optional selector for the preferred initial focus target.
	 */
	private focusModalInitialTarget(modalId: string, preferredSelector?: string) {
		requestAnimationFrame(() => {
			const modal = document.getElementById(modalId);
			if (!modal || modal.hasAttribute("hidden")) {
				return;
			}

			const preferredTarget = preferredSelector ? modal.querySelector(preferredSelector) as HTMLElement | null : null;
			if (preferredTarget) {
				preferredTarget.focus({ preventScroll: true });
				return;
			}

			this.focusModalCard(modal);
		});
	}

	private focusModalCard(modal: HTMLElement) {
		const modalCard = modal.querySelector(".modal-card") as HTMLElement | null;
		modalCard?.focus({ preventScroll: true });
	}

	/**
	 * Returns focusable elements within a modal so keyboard focus can be managed.
	 *
	 * @param modal - The modal element to search.
	 * @returns The focusable elements inside the modal.
	 */
	private getModalFocusableElements(modal: HTMLElement) {
		return Array.from(modal.querySelectorAll<HTMLElement>([
			"button:not([disabled])",
			"[href]",
			"input:not([disabled])",
			"select:not([disabled])",
			"textarea:not([disabled])",
			"[tabindex]:not([tabindex='-1'])",
		].join(",")));
	}
}

/**
 * Converts a remote branch ref into a local branch name.
 *
 * @param remoteBranchName - The branch name with optional remote prefix.
 * @returns The local branch name without the remote prefix.
 */
function toLocalBranchName(remoteBranchName: string) {
	const slashIndex = remoteBranchName.indexOf("/");
	if (slashIndex < 0 || slashIndex === remoteBranchName.length - 1) {
		return remoteBranchName;
	}

	return remoteBranchName.slice(slashIndex + 1);
}

/**
 * Formats a discard confirmation description for one or multiple files.
 *
 * @param items - The items being discarded.
 * @returns The formatted description text.
 */
function formatDiscardDescription(items: { filePath: string; description: string }[]): string {
	if (items.length === 1) {
		return items[0].description;
	}

	return `${items.length} selected items:\n${items.map((item) => `- ${item.description}`).join("\n")}`;
}
