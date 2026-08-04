import { App, PluginSettingTab, Setting, SettingDefinitionItem } from 'obsidian';
import TaskNotesViewsPlugin from './main';

export interface TaskNotesViewsSettings {
	projectStartProperty: string;
	projectEndProperty: string;
	deriveDateRangeFromTasks: boolean;
	scopeProperty: string;
	taskStartProperty: string;
	taskScheduledProperty: string;
	inProgressStatuses: string;
	scopeIsDuration: boolean;
	estimateCapacityFromVelocity: boolean;
	countWeekends: boolean;
}

export const DEFAULT_SETTINGS: TaskNotesViewsSettings = {
	projectStartProperty: 'scheduled',
	projectEndProperty: 'due',
	deriveDateRangeFromTasks: false,
	scopeProperty: 'timeEstimate',
	taskStartProperty: 'startedAt',
	taskScheduledProperty: 'scheduled',
	inProgressStatuses: 'in-progress',
	scopeIsDuration: true,
	estimateCapacityFromVelocity: false,
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
		const t = this.taskNotesViewsPlugin.i18n.translate.bind(this.taskNotesViewsPlugin.i18n);
		return [{
			type: 'group',
			heading: t('settings.heading'),
			items: [
				{
					name: t('settings.projectStartProperty.name'),
					desc: t('settings.projectStartProperty.description'),
					control: { type: 'text', key: 'projectStartProperty', defaultValue: DEFAULT_SETTINGS.projectStartProperty, placeholder: 'scheduled' },
				},
				{
					name: t('settings.projectEndProperty.name'),
					desc: t('settings.projectEndProperty.description'),
					control: { type: 'text', key: 'projectEndProperty', defaultValue: DEFAULT_SETTINGS.projectEndProperty, placeholder: 'due' },
				},
				{
					name: t('settings.deriveDateRangeFromTasks.name'),
					desc: t('settings.deriveDateRangeFromTasks.description'),
					control: { type: 'toggle', key: 'deriveDateRangeFromTasks', defaultValue: DEFAULT_SETTINGS.deriveDateRangeFromTasks },
				},
				{
					name: t('settings.scopeProperty.name'),
					desc: t('settings.scopeProperty.description'),
					control: { type: 'text', key: 'scopeProperty', defaultValue: DEFAULT_SETTINGS.scopeProperty, placeholder: 'timeEstimate' },
				},
				{
					name: t('settings.scopeIsDuration.name'),
					desc: t('settings.scopeIsDuration.description'),
					control: { type: 'toggle', key: 'scopeIsDuration', defaultValue: DEFAULT_SETTINGS.scopeIsDuration },
				},
				{
					name: t('settings.estimateCapacityFromVelocity.name'),
					desc: t('settings.estimateCapacityFromVelocity.description'),
					control: { type: 'toggle', key: 'estimateCapacityFromVelocity', defaultValue: DEFAULT_SETTINGS.estimateCapacityFromVelocity },
				},
				{
					name: t('settings.taskStartProperty.name'),
					desc: t('settings.taskStartProperty.description'),
					control: { type: 'text', key: 'taskStartProperty', defaultValue: DEFAULT_SETTINGS.taskStartProperty, placeholder: 'startedAt' },
				},
				{
					name: t('settings.taskScheduledProperty.name'),
					desc: t('settings.taskScheduledProperty.description'),
					control: { type: 'text', key: 'taskScheduledProperty', defaultValue: DEFAULT_SETTINGS.taskScheduledProperty, placeholder: 'scheduled' },
				},
				{
					name: t('settings.inProgressStatuses.name'),
					desc: t('settings.inProgressStatuses.description'),
					control: { type: 'text', key: 'inProgressStatuses', defaultValue: DEFAULT_SETTINGS.inProgressStatuses, placeholder: 'in-progress' },
				},
				{
					name: t('settings.countWeekends.name'),
					desc: t('settings.countWeekends.description'),
					control: { type: 'toggle', key: 'countWeekends', defaultValue: DEFAULT_SETTINGS.countWeekends },
				},
			],
		}];
	}

	/** Renders the same controls on Obsidian versions that still invoke the legacy settings contract. */
	display(): void {
		const container = this.containerEl;
		const t = this.taskNotesViewsPlugin.i18n.translate.bind(this.taskNotesViewsPlugin.i18n);
		container.empty();
		new Setting(container).setName(t('settings.heading')).setHeading();
		this.addTextSetting(t('settings.projectStartProperty.name'), t('settings.projectStartProperty.description'), 'projectStartProperty', 'scheduled');
		this.addTextSetting(t('settings.projectEndProperty.name'), t('settings.projectEndProperty.description'), 'projectEndProperty', 'due');
		this.addToggleSetting(t('settings.deriveDateRangeFromTasks.name'), t('settings.deriveDateRangeFromTasks.description'), 'deriveDateRangeFromTasks');
		this.addTextSetting(t('settings.scopeProperty.name'), t('settings.scopeProperty.description'), 'scopeProperty', 'timeEstimate');
		this.addToggleSetting(t('settings.scopeIsDuration.name'), t('settings.scopeIsDuration.description'), 'scopeIsDuration');
		this.addToggleSetting(t('settings.estimateCapacityFromVelocity.name'), t('settings.estimateCapacityFromVelocity.description'), 'estimateCapacityFromVelocity');
		this.addTextSetting(t('settings.taskStartProperty.name'), t('settings.taskStartProperty.description'), 'taskStartProperty', 'startedAt');
		this.addTextSetting(t('settings.taskScheduledProperty.name'), t('settings.taskScheduledProperty.description'), 'taskScheduledProperty', 'scheduled');
		this.addTextSetting(t('settings.inProgressStatuses.name'), t('settings.inProgressStatuses.description'), 'inProgressStatuses', 'in-progress');
		this.addToggleSetting(t('settings.countWeekends.name'), t('settings.countWeekends.description'), 'countWeekends');
	}

	/** Adds a persisted text control to the legacy settings renderer. */
	private addTextSetting(name: string, description: string, key: 'projectStartProperty' | 'projectEndProperty' | 'scopeProperty' | 'taskStartProperty' | 'taskScheduledProperty' | 'inProgressStatuses', placeholder: string): void {
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
	private addToggleSetting(name: string, description: string, key: 'deriveDateRangeFromTasks' | 'scopeIsDuration' | 'estimateCapacityFromVelocity' | 'countWeekends'): void {
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
