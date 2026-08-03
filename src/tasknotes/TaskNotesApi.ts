import { App, EventRef } from 'obsidian';

export interface TaskNotesStatus {
	value: string;
	isCompleted: boolean;
}

export interface TaskNotesTask {
	path: string;
	status: string;
	scheduled?: string;
	completedDate?: string;
	timeEstimate?: number;
}

interface TaskNotesApiShape {
	apiVersion: number;
	hasCapability(capability: string): boolean;
	catalog: { statuses(): TaskNotesStatus[] };
	query: {
		tasks(query: {
			where: { field: 'task.projects'; op: 'contains'; value: string };
			scope: { includeArchived: false };
		}): Promise<{ tasks: TaskNotesTask[] }>;
	};
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
	if (!api || api.apiVersion !== 1 || !api.hasCapability('query.tasks') || !api.hasCapability('catalog.read')) return null;
	return api;
}
