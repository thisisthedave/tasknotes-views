import { App, EventRef } from 'obsidian';

export interface TaskNotesStatus {
	value: string;
	isCompleted: boolean;
	isSkipped?: boolean;
}

export interface TaskNotesSettingsSnapshot {
	tasksFolder?: string;
}

export interface TaskNotesTask {
	[key: string]: unknown;
	path: string;
	title?: string;
	status: string;
	scheduled?: string;
	completedDate?: string;
	timeEstimate?: number;
	due?: string;
	projects?: string[];
	recurrence?: string;
	recurrence_parent?: string;
	occurrence_date?: string;
	complete_instances?: string[];
	skipped_instances?: string[];
	dateCreated?: string;
	customProperties?: Record<string, unknown>;
}

interface TaskNotesApiShape {
	apiVersion: number;
	hasCapability(capability: string): boolean;
	catalog: { statuses(): TaskNotesStatus[] };
	query: {
		tasks(query: {
			where: { field: 'task.projects'; op: 'contains'; value: string };
			scope?: { includeArchived: boolean };
		}): Promise<{ tasks: TaskNotesTask[] }>;
	};
	tasks: {
		list(): Promise<TaskNotesTask[]>;
		update(path: string, patch: Partial<TaskNotesTask>): Promise<TaskNotesTask>;
	};
	settings?: { snapshot(): TaskNotesSettingsSnapshot };
	events?: {
		on(event: 'task.updated' | 'settings.changed', handler: () => void): EventRef;
		off(ref: EventRef): void;
	};
}

interface TaskNotesPluginShape {
	api?: TaskNotesApiShape;
}

/** Resolves the supported public TaskNotes API needed by progress views. */
export function getTaskNotesApi(app: App): TaskNotesApiShape | null {
	const plugins = (app as App & { plugins?: { getPlugin(id: string): unknown } }).plugins;
	const plugin = plugins?.getPlugin('tasknotes');
	if (!plugin || typeof plugin !== 'object') return null;
	const api = (plugin as TaskNotesPluginShape).api;
	if (!api || api.apiVersion !== 1 || !api.hasCapability('query.tasks') || !api.hasCapability('tasks.read') || !api.hasCapability('catalog.read')) return null;
	return api;
}

/** Resolves TaskNotes API v1 with task-write support for cycle rollover operations. */
export function getWritableTaskNotesApi(app: App): TaskNotesApiShape | null {
	const api = getTaskNotesApi(app);
	return api?.hasCapability('tasks.write') ? api : null;
}
