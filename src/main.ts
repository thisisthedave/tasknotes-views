import { Events, EventRef, getLanguage, Plugin } from 'obsidian';
import { createI18nService } from './i18n';
import { DEFAULT_SETTINGS, TaskNotesViewsSettings, TaskNotesViewsSettingTab } from './settings';
import { createCycleProgressExtension } from './views/CycleProgressEditor';
import { registerCycleProgressReadingView } from './views/CycleProgressReading';

/** Registers TaskNotes project progress views and owns settings and lifecycle events. */
export default class TaskNotesViewsPlugin extends Plugin {
	settings: TaskNotesViewsSettings = { ...DEFAULT_SETTINGS };
	readonly i18n = createI18nService({ initialLocale: 'system', getSystemLocale: () => getLanguage() });
	private readonly settingsEvents = new Events();

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new TaskNotesViewsSettingTab(this.app, this));
		this.registerEditorExtension(createCycleProgressExtension(this));
		registerCycleProgressReadingView(this);
	}

	/** Loads persisted values over safe defaults. */
	private async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<TaskNotesViewsSettings>);
	}

	/** Persists settings and tells mounted charts to reload. */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.settingsEvents.trigger('changed');
	}

	/** Subscribes a mounted chart to plugin setting changes. */
	onSettingsChanged(callback: () => void): EventRef {
		return this.settingsEvents.on('changed', callback);
	}

	/** Removes a chart's plugin-settings subscription. */
	offSettingsChanged(ref: EventRef): void {
		this.settingsEvents.offref(ref);
	}
}
