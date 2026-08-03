import { MarkdownRenderChild, MarkdownView, Plugin } from 'obsidian';
import { isTaskNotesProject } from '../tasknotes/TaskNotesProjectDetector';
import { CYCLE_PROGRESS_CLASS, createCycleProgressWidget } from './CycleProgressWidget';

/** Connects a reading-mode chart's cleanup to Obsidian's render-child lifecycle. */
class CycleProgressRenderChild extends MarkdownRenderChild {
	constructor(containerEl: HTMLElement, private readonly disposeChart: () => void) {
		super(containerEl);
	}

	/** Releases ECharts before Obsidian discards the rendered section. */
	onunload(): void {
		this.disposeChart();
		this.containerEl.remove();
	}
}

/** Registers reading-mode rendering and cleanup for TaskNotes project notes. */
export function registerCycleProgressReadingView(plugin: Plugin): void {
	plugin.registerMarkdownPostProcessor((_element, context) => {
		const leaf = plugin.app.workspace.getLeavesOfType('markdown').find((candidate) => {
			const candidateView = candidate.view;
			return candidateView instanceof MarkdownView && candidateView.file?.path === context.sourcePath;
		});
		const view = leaf?.view;
		if (!(view instanceof MarkdownView) || !view.file || !isTaskNotesProject(plugin.app, view.file)) return;
		const sizer = view.previewMode.containerEl.querySelector<HTMLElement>('.markdown-preview-sizer');
		if (!sizer || sizer.querySelector(`.${CYCLE_PROGRESS_CLASS}`)) return;

		// Reading mode can process many sections, so the class guard makes the note-level injection idempotent.
		const widget = createCycleProgressWidget(sizer.ownerDocument);
		const metadata = sizer.querySelector('.metadata-container');
		if (metadata) metadata.after(widget.element);
		else sizer.prepend(widget.element);
		context.addChild(new CycleProgressRenderChild(widget.element, () => widget.dispose()));
	});
}
