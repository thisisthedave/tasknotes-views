import { Extension } from '@codemirror/state';
import { EditorView, PluginValue, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { editorInfoField, EventRef, TFile } from 'obsidian';
import type TaskNotesViewsPlugin from '../main';
import { getTaskNotesApi } from '../tasknotes/TaskNotesApi';
import { isTaskNotesProject } from '../tasknotes/TaskNotesProjectDetector';
import { CYCLE_PROGRESS_CLASS, createCycleProgressWidget } from './CycleProgressWidget';

/** Injects and maintains one cycle-progress widget in a live-preview editor. */
class CycleProgressEditorPlugin implements PluginValue {
	private file: TFile | null = null;
	private widget: ReturnType<typeof createCycleProgressWidget> | null = null;
	private readonly taskNotesEventRefs: EventRef[] = [];
	private detectionTimer: number | null = null;

	constructor(private view: EditorView, private readonly plugin: TaskNotesViewsPlugin) {
		const api = getTaskNotesApi(plugin.app);
		if (api?.events) {
			// A task assignment can turn an already-open plain note into a project without changing its editor document.
			this.taskNotesEventRefs.push(
				api.events.on('task.updated', () => this.scheduleProjectDetection()),
				api.events.on('settings.changed', () => this.scheduleProjectDetection()),
			);
		}
		this.refresh();
	}

	/** Re-evaluates the project note when the editor file or document changes. */
	update(update: ViewUpdate): void {
		this.view = update.view;
		const file = this.getFile();
		if (file !== this.file || update.docChanged) this.refresh();
	}

	/** Removes injected DOM and chart resources when CodeMirror destroys the extension. */
	destroy(): void {
		if (this.detectionTimer !== null) window.clearTimeout(this.detectionTimer);
		const api = getTaskNotesApi(this.plugin.app);
		for (const ref of this.taskNotesEventRefs) api?.events?.off(ref);
		this.removeWidget();
	}

	/** Debounces TaskNotes index updates before rechecking whether this editor now represents a project. */
	private scheduleProjectDetection(): void {
		if (this.widget || this.detectionTimer !== null) return;
		this.detectionTimer = window.setTimeout(() => {
			this.detectionTimer = null;
			this.refresh();
		}, 100);
	}

	/** Reads the file bound to this specific editor instance. */
	private getFile(): TFile | null {
		const file = this.view.state.field(editorInfoField, false)?.file;
		return file instanceof TFile ? file : null;
	}

	/** Synchronizes the widget with the current note's project status. */
	private refresh(): void {
		this.file = this.getFile();
		this.removeWidget();
		if (!this.file || !isTaskNotesProject(this.plugin.app, this.file)) return;
		const sizer = this.view.dom.closest('.markdown-source-view')?.querySelector<HTMLElement>('.cm-sizer');
		if (!sizer || sizer.querySelector(`.${CYCLE_PROGRESS_CLASS}`)) return;
		this.widget = createCycleProgressWidget(this.plugin, this.file, sizer.ownerDocument);
		const metadata = sizer.querySelector('.metadata-container');
		if (metadata) metadata.after(this.widget.element);
		else sizer.prepend(this.widget.element);
	}

	/** Disposes the active chart before removing its host element. */
	private removeWidget(): void {
		this.widget?.dispose();
		this.widget?.element.remove();
		this.widget = null;
	}
}

/** Creates the CodeMirror extension used for live-preview project notes. */
export function createCycleProgressExtension(plugin: TaskNotesViewsPlugin): Extension {
	return ViewPlugin.define((view) => new CycleProgressEditorPlugin(view, plugin));
}
