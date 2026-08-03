import { Plugin } from 'obsidian';
import { createCycleProgressExtension } from './views/CycleProgressEditor';
import { registerCycleProgressReadingView } from './views/CycleProgressReading';

/** Registers TaskNotes project progress views and owns their lifecycle. */
export default class TaskNotesViewsPlugin extends Plugin {
	onload(): void {
		this.registerEditorExtension(createCycleProgressExtension(this));
		registerCycleProgressReadingView(this);
	}
}
