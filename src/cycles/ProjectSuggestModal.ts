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
		this.settled = true;
		this.resolveSelection(item);
	}

	/** Treats dismissal as cancellation rather than leaving a pending command promise. */
	onClose(): void {
		super.onClose();
		if (!this.settled) this.resolveSelection(null);
	}
}

/** Opens a fuzzy project selector and resolves when the user chooses or dismisses it. */
export function chooseProject(app: App, items: ProjectSuggestion[], placeholder: string): Promise<ProjectSuggestion | null> {
	return new Promise((resolve) => new ProjectSuggestModal(app, items, placeholder, resolve).open());
}

