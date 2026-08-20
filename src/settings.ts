import { App, PluginSettingTab, SettingDefinitionItem } from 'obsidian';
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
	cycleNameFormat: string;
	cycleProjectTemplate: string;
	cycleProjectFolder: string;
	cycleStartDay: CycleStartDay;
	cycleDurationWeeks: number;
	cycleTaskRollover: boolean;
	recurringTaskRollover: boolean;
	snapshotCycleProgressOnClose: boolean;
}

export type CycleStartDay = 'current' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

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
	cycleNameFormat: 'YYYY/YYYY-[Cycle]-{cycle}',
	cycleProjectTemplate: '',
	cycleProjectFolder: '',
	cycleStartDay: 'monday',
	cycleDurationWeeks: 2,
	cycleTaskRollover: false,
	recurringTaskRollover: true,
	snapshotCycleProgressOnClose: true,
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
		}, {
			type: 'group',
			heading: t('settings.cycles.heading'),
			items: [
				{
					name: t('settings.cycles.nameFormat.name'),
					desc: t('settings.cycles.nameFormat.description'),
					control: { type: 'text', key: 'cycleNameFormat', defaultValue: DEFAULT_SETTINGS.cycleNameFormat, placeholder: DEFAULT_SETTINGS.cycleNameFormat },
				},
				{
					name: t('settings.cycles.template.name'),
					desc: t('settings.cycles.template.description'),
					control: { type: 'file', key: 'cycleProjectTemplate', defaultValue: DEFAULT_SETTINGS.cycleProjectTemplate, placeholder: 'Templates/Cycle.md', filter: (file) => file.extension === 'md' },
				},
				{
					name: t('settings.cycles.folder.name'),
					desc: t('settings.cycles.folder.description'),
					control: { type: 'folder', key: 'cycleProjectFolder', defaultValue: DEFAULT_SETTINGS.cycleProjectFolder, placeholder: 'Projects/Cycles', includeRoot: true },
				},
				{
					name: t('settings.cycles.startDay.name'),
					desc: t('settings.cycles.startDay.description'),
					control: { type: 'dropdown', key: 'cycleStartDay', defaultValue: DEFAULT_SETTINGS.cycleStartDay, options: getCycleStartDayOptions() },
				},
				{
					name: t('settings.cycles.duration.name'),
					desc: t('settings.cycles.duration.description'),
					control: { type: 'number', key: 'cycleDurationWeeks', defaultValue: DEFAULT_SETTINGS.cycleDurationWeeks, min: 1, max: 52, step: 1 },
				},
				{
					name: t('settings.cycles.rollover.name'),
					desc: t('settings.cycles.rollover.description'),
					control: { type: 'toggle', key: 'cycleTaskRollover', defaultValue: DEFAULT_SETTINGS.cycleTaskRollover },
				},
				{
					name: t('settings.cycles.recurringRollover.name'),
					desc: t('settings.cycles.recurringRollover.description'),
					control: { type: 'toggle', key: 'recurringTaskRollover', defaultValue: DEFAULT_SETTINGS.recurringTaskRollover },
				},
				{
					name: t('settings.cycles.snapshotOnClose.name'),
					desc: t('settings.cycles.snapshotOnClose.description'),
					control: { type: 'toggle', key: 'snapshotCycleProgressOnClose', defaultValue: DEFAULT_SETTINGS.snapshotCycleProgressOnClose },
				},
			],
		}];
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

/** Returns stable stored weekday identifiers with sentence-case labels for cycle scheduling. */
function getCycleStartDayOptions(): Record<CycleStartDay, string> {
	return {
		current: 'Current day',
		monday: 'Monday',
		tuesday: 'Tuesday',
		wednesday: 'Wednesday',
		thursday: 'Thursday',
		friday: 'Friday',
		saturday: 'Saturday',
		sunday: 'Sunday',
	};
}
