import { MarkdownRenderChild, MarkdownView } from 'obsidian';
import type TaskNotesViewsPlugin from '../main';
import { getTaskNotesApi } from '../tasknotes/TaskNotesApi';
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
export function registerCycleProgressReadingView(plugin: TaskNotesViewsPlugin): void {
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
		const widget = createCycleProgressWidget(plugin, view.file, sizer.ownerDocument);
		const metadata = sizer.querySelector('.metadata-container');
		if (metadata) metadata.after(widget.element);
		else sizer.prepend(widget.element);
		context.addChild(new CycleProgressRenderChild(widget.element, () => widget.dispose()));
	});

	const api = getTaskNotesApi(plugin.app);
	let detectionTimer: number | null = null;
	/** Re-runs reading-mode post-processors when a task assignment makes an open note a project. */
	const scheduleProjectDetection = (): void => {
		if (detectionTimer !== null) window.clearTimeout(detectionTimer);
		detectionTimer = window.setTimeout(() => {
			detectionTimer = null;
			for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
				const view = leaf.view;
				if (!(view instanceof MarkdownView) || !view.file || !isTaskNotesProject(plugin.app, view.file)) continue;
				const sizer = view.previewMode.containerEl.querySelector<HTMLElement>('.markdown-preview-sizer');
				if (sizer && !sizer.querySelector(`.${CYCLE_PROGRESS_CLASS}`)) view.previewMode.rerender(true);
			}
		}, 100);
	};
	const eventRefs = api?.events ? [
		api.events.on('task.updated', scheduleProjectDetection),
		api.events.on('settings.changed', scheduleProjectDetection),
	] : [];
	plugin.register(() => {
		if (detectionTimer !== null) window.clearTimeout(detectionTimer);
		for (const ref of eventRefs) api?.events?.off(ref);
	});
}
