import { App, PluginSettingTab, Setting, SettingDefinitionItem } from 'obsidian';
import TaskNotesViewsPlugin from './main';

export interface TaskNotesViewsSettings {
	projectStartProperty: string;
	projectEndProperty: string;
	deriveDateRangeFromTasks: boolean;
	scopeProperty: string;
	taskStartProperty: string;
	inProgressStatuses: string;
	scopeIsDuration: boolean;
	countWeekends: boolean;
}

export const DEFAULT_SETTINGS: TaskNotesViewsSettings = {
	projectStartProperty: 'scheduled',
	projectEndProperty: 'due',
	deriveDateRangeFromTasks: false,
	scopeProperty: 'timeEstimate',
	taskStartProperty: 'startedAt',
	inProgressStatuses: 'in-progress',
	scopeIsDuration: true,
	countWeekends: false,
};

type SettingsKey = keyof TaskNotesViewsSettings;

/** Exposes searchable declarative settings for project progress charts. */
export class TaskNotesViewsSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly taskNotesViewsPlugin: TaskNotesViewsPlugin) {
		super(app, taskNotesViewsPlugin);
	}

	/** Returns Obsidian 1.13 searchable setting definitions. */
	getSettingDefinitions(): SettingDefinitionItem<SettingsKey>[] {
		return [{
			type: 'group',
			heading: 'Project progress',
			items: [
				{
					name: 'Project start property',
					desc: 'Frontmatter property containing the project start date.',
					control: { type: 'text', key: 'projectStartProperty', defaultValue: DEFAULT_SETTINGS.projectStartProperty, placeholder: 'scheduled' },
				},
				{
					name: 'Project end property',
					desc: 'Frontmatter property containing the project end date.',
					control: { type: 'text', key: 'projectEndProperty', defaultValue: DEFAULT_SETTINGS.projectEndProperty, placeholder: 'due' },
				},
				{
					name: 'Derive date range from tasks',
					desc: 'Use the earliest task start and latest task due date when both are available.',
					control: { type: 'toggle', key: 'deriveDateRangeFromTasks', defaultValue: DEFAULT_SETTINGS.deriveDateRangeFromTasks },
				},
				{
					name: 'Scope property',
					desc: 'Task property containing each task’s contribution to project scope, such as timeEstimate or points.',
					control: { type: 'text', key: 'scopeProperty', defaultValue: DEFAULT_SETTINGS.scopeProperty, placeholder: 'timeEstimate' },
				},
				{
					name: 'Scope is a duration',
					desc: 'Format scope as minutes and hours. Disable for unitless values such as story points.',
					control: { type: 'toggle', key: 'scopeIsDuration', defaultValue: DEFAULT_SETTINGS.scopeIsDuration },
				},
				{
					name: 'Task started property',
					desc: 'Task date property recording when progress began. Falls back to scheduled, completedDate, then the project start.',
					control: { type: 'text', key: 'taskStartProperty', defaultValue: DEFAULT_SETTINGS.taskStartProperty, placeholder: 'startedAt' },
				},
				{
					name: 'In-progress statuses',
					desc: 'Comma-separated status values that count toward started scope. Completed statuses are always included.',
					control: { type: 'text', key: 'inProgressStatuses', defaultValue: DEFAULT_SETTINGS.inProgressStatuses, placeholder: 'in-progress' },
				},
				{
					name: 'Count weekends',
					desc: 'Let the ideal burndown decline on Saturday and Sunday.',
					control: { type: 'toggle', key: 'countWeekends', defaultValue: DEFAULT_SETTINGS.countWeekends },
				},
			],
		}];
	}

	/** Renders the same controls on Obsidian versions that still invoke the legacy settings contract. */
	display(): void {
		const container = this.containerEl;
		container.empty();
		new Setting(container).setName('Project progress').setHeading();
		this.addTextSetting('Project start property', 'Frontmatter property containing the project start date.', 'projectStartProperty', 'scheduled');
		this.addTextSetting('Project end property', 'Frontmatter property containing the project end date.', 'projectEndProperty', 'due');
		this.addToggleSetting('Derive date range from tasks', 'Use the earliest task start and latest task due date when both are available.', 'deriveDateRangeFromTasks');
		this.addTextSetting('Scope property', 'Task property containing each task’s contribution to project scope, such as timeEstimate or points.', 'scopeProperty', 'timeEstimate');
		this.addToggleSetting('Scope is a duration', 'Format scope as minutes and hours. Disable for unitless values such as story points.', 'scopeIsDuration');
		this.addTextSetting('Task started property', 'Task date property recording when progress began. Falls back to scheduled, completedDate, then the project start.', 'taskStartProperty', 'startedAt');
		this.addTextSetting('In-progress statuses', 'Comma-separated status values that count toward started scope. Completed statuses are always included.', 'inProgressStatuses', 'in-progress');
		this.addToggleSetting('Count weekends', 'Let the ideal burndown decline on Saturday and Sunday.', 'countWeekends');
	}

	/** Adds a persisted text control to the legacy settings renderer. */
	private addTextSetting(name: string, description: string, key: 'projectStartProperty' | 'projectEndProperty' | 'scopeProperty' | 'taskStartProperty' | 'inProgressStatuses', placeholder: string): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(description)
			.addText((text) => text
				.setPlaceholder(placeholder)
				.setValue(this.taskNotesViewsPlugin.settings[key])
				.onChange(async (value) => {
					this.taskNotesViewsPlugin.settings[key] = value;
					await this.taskNotesViewsPlugin.saveSettings();
				}));
	}

	/** Adds a persisted toggle control to the legacy settings renderer. */
	private addToggleSetting(name: string, description: string, key: 'deriveDateRangeFromTasks' | 'scopeIsDuration' | 'countWeekends'): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(description)
			.addToggle((toggle) => toggle
				.setValue(this.taskNotesViewsPlugin.settings[key])
				.onChange(async (value) => {
					this.taskNotesViewsPlugin.settings[key] = value;
					await this.taskNotesViewsPlugin.saveSettings();
				}));
	}

	/** Reads a declarative control value from the plugin settings object. */
	getControlValue(key: string): unknown {
		return this.taskNotesViewsPlugin.settings[key as SettingsKey];
	}

	/** Validates, persists, and broadcasts a declarative control change. */
	async setControlValue(key: string, value: unknown): Promise<void> {
		if (!(key in DEFAULT_SETTINGS)) return;
		const settingKey = key as SettingsKey;
		const defaultValue = DEFAULT_SETTINGS[settingKey];
		if (typeof value !== typeof defaultValue) return;
		this.taskNotesViewsPlugin.settings = { ...this.taskNotesViewsPlugin.settings, [settingKey]: value };
		await this.taskNotesViewsPlugin.saveSettings();
	}
}
