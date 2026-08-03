import { Extension } from '@codemirror/state';
import { EditorView, PluginValue, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { editorInfoField, Plugin, TFile } from 'obsidian';
import { isTaskNotesProject } from '../tasknotes/TaskNotesProjectDetector';
import { CYCLE_PROGRESS_CLASS, createCycleProgressWidget } from './CycleProgressWidget';

/** Injects and maintains one cycle-progress widget in a live-preview editor. */
class CycleProgressEditorPlugin implements PluginValue {
	private file: TFile | null = null;
	private widget: ReturnType<typeof createCycleProgressWidget> | null = null;

	constructor(private view: EditorView, private readonly plugin: Plugin) {
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
		this.removeWidget();
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
		this.widget = createCycleProgressWidget(sizer.ownerDocument);
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
export function createCycleProgressExtension(plugin: Plugin): Extension {
	return ViewPlugin.define((view) => new CycleProgressEditorPlugin(view, plugin));
}
