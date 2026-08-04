import { App, FuzzySuggestModal, TFile } from 'obsidian';

export interface ProjectSuggestion {
	label: string;
	file: TFile | null;
	createPath?: string;
}

/** Presents project files with a suggested choice first and supports one prospective cycle path. */
export class ProjectSuggestModal extends FuzzySuggestModal<ProjectSuggestion> {
	private settled = false;

	constructor(
		app: App,
		private readonly items: ProjectSuggestion[],
		placeholder: string,
		private readonly resolveSelection: (selection: ProjectSuggestion | null) => void,
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	/** Returns the ordered project choices supplied by command inference. */
	getItems(): ProjectSuggestion[] {
		return this.items;
	}

	/** Displays a vault path and clearly marks a note that will be created. */
	getItemText(item: ProjectSuggestion): string {
		return item.file ? item.label : `${item.label} (create)`;
	}

	/** Resolves the command's pending selection exactly once. */
	onChooseItem(item: ProjectSuggestion): void {
		this.settle(item);
	}

	/** Treats dismissal as cancellation rather than leaving a pending command promise. */
	onClose(): void {
		super.onClose();
		// Obsidian closes SuggestModal before calling onChooseItem, so cancellation must wait for that callback.
		queueMicrotask(() => this.settle(null));
	}

	/** Resolves selection or cancellation once, regardless of Obsidian's modal callback order. */
	private settle(selection: ProjectSuggestion | null): void {
		if (this.settled) return;
		this.settled = true;
		this.resolveSelection(selection);
	}
}

/** Opens a fuzzy project selector and resolves when the user chooses or dismisses it. */
export function chooseProject(app: App, items: ProjectSuggestion[], placeholder: string): Promise<ProjectSuggestion | null> {
	return new Promise((resolve) => {
		const modal = new ProjectSuggestModal(app, items, placeholder, resolve);
		modal.open();
	});
}
