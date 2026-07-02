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

type ModalManagerOptions = {
	isSettingsModalOpen: () => boolean;
	closeSettingsModal: () => void;
};

export class ModalManager {
	private discardModalState: DiscardModalState = null;
	private branchSwitchModalState: BranchSwitchModalState = null;
	private branchDeleteModalState: BranchDeleteModalState = null;
	private modalKeyListenerBound = false;

	constructor(private readonly options: ModalManagerOptions) {}

	ensureKeyListener() {
		if (this.modalKeyListenerBound) {
			return;
		}

		document.addEventListener("keydown", this.handleModalKeydown);
		this.modalKeyListenerBound = true;
	}

	refreshModals(isAnyGitActionPending: (filePath: string) => boolean) {
		this.updateDiscardModal(isAnyGitActionPending);
		this.updateBranchSwitchModal();
		this.updateBranchDeleteModal();
	}

	hasActiveModal() {
		return !!this.getActiveModal();
	}

	getDiscardModalState() {
		return this.discardModalState;
	}

	openDiscard(items: { filePath: string; description: string }[], isAnyGitActionPending: (filePath: string) => boolean) {
		this.discardModalState = { items };
		this.updateDiscardModal(isAnyGitActionPending);
	}

	closeDiscard(isAnyGitActionPending: (filePath: string) => boolean) {
		this.discardModalState = null;
		this.updateDiscardModal(isAnyGitActionPending);
	}

	getBranchSwitchModalState() {
		return this.branchSwitchModalState;
	}

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

	closeBranchSwitch() {
		this.branchSwitchModalState = null;
		this.updateBranchSwitchModal();
	}

	getBranchDeleteModalState() {
		return this.branchDeleteModalState;
	}

	openBranchDelete(branchName: string, forceDelete?: boolean) {
		this.branchDeleteModalState = {
			branchName,
			forceDelete: !!forceDelete,
		};
		this.updateBranchDeleteModal();
	}

	closeBranchDelete() {
		this.branchDeleteModalState = null;
		this.updateBranchDeleteModal();
	}

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

		if (this.options.isSettingsModalOpen()) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.options.closeSettingsModal();
		}
	}

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

		if (this.options.isSettingsModalOpen()) {
			return document.getElementById("SettingsModal") as HTMLElement | null;
		}

		return null;
	}

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

function toLocalBranchName(remoteBranchName: string) {
	const slashIndex = remoteBranchName.indexOf("/");
	if (slashIndex < 0 || slashIndex === remoteBranchName.length - 1) {
		return remoteBranchName;
	}

	return remoteBranchName.slice(slashIndex + 1);
}

function formatDiscardDescription(items: { filePath: string; description: string }[]): string {
	if (items.length === 1) {
		return items[0].description;
	}

	return `${items.length} selected items:\n${items.map((item) => `- ${item.description}`).join("\n")}`;
}
