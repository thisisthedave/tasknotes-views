import { generateRecurringInstances } from '@tasknotes/model/recurrence';
import { TaskNotesTask } from '../tasknotes/TaskNotesApi';

export interface ProgressWorkItem {
	name: string;
	scope: number;
	taskPath?: string;
	recurring?: boolean;
	recurrenceDate?: string;
	scheduledDate?: string;
	startedDate?: string;
	completedDate?: string;
}

/** Returns a readable task name when older API data omits the title. */
function getTaskName(task: TaskNotesTask): string {
	return task.title?.trim() || task.path.replace(/\.md$/i, '').split('/').at(-1) || task.path;
}

export interface OccurrenceProjectionOptions {
	scopeProperty: string;
	taskStartProperty: string;
	taskScheduledProperty: string;
	inProgressStatuses: ReadonlySet<string>;
	completedStatuses: ReadonlySet<string>;
	skippedStatuses: ReadonlySet<string>;
}

/** Normalizes a date-only or ISO datetime value to YYYY-MM-DD. */
function normalizeDate(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const dateValue = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(value)?.[1];
	if (!dateValue) return undefined;
	const parsed = new Date(`${dateValue}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dateValue ? dateValue : undefined;
}

/** Reads a core or custom task property. */
function getTaskProperty(task: TaskNotesTask, property: string): unknown {
	const coreValue = task[property];
	return coreValue !== undefined ? coreValue : task.customProperties?.[property];
}

/** Reads a positive numeric scope value from a configured task property. */
function getScope(task: TaskNotesTask, property: string): number {
	const value = getTaskProperty(task, property);
	const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
	return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

/** Reads a configured date or datetime task property. */
function getDate(task: TaskNotesTask, property: string): string | undefined {
	return normalizeDate(getTaskProperty(task, property));
}

/** Normalizes a TaskNotes link or path for recurrence-parent comparison. */
function normalizeReference(reference: string): string {
	let value = reference.trim();
	if (value.startsWith('[[') && value.endsWith(']]')) value = value.slice(2, -2).split('|')[0] ?? value;
	const markdownLink = /^\[[^\]]*\]\((.+)\)$/.exec(value);
	if (markdownLink?.[1]) value = markdownLink[1];
	return value.replace(/^<|>$/g, '').replace(/\.md$/i, '');
}

/** Tests whether a materialized occurrence points to a recurring parent. */
function referencesParent(occurrence: TaskNotesTask, parent: TaskNotesTask): boolean {
	if (!occurrence.recurrence_parent) return false;
	const reference = normalizeReference(occurrence.recurrence_parent);
	const parentPath = parent.path.replace(/\.md$/i, '');
	const parentBasename = parentPath.split('/').at(-1) ?? parentPath;
	return reference === parentPath || reference === parentBasename;
}

/** Converts a non-recurring task into one logical work item. */
function createTaskWorkItem(task: TaskNotesTask, options: OccurrenceProjectionOptions): ProgressWorkItem | null {
	const scope = getScope(task, options.scopeProperty);
	if (scope <= 0 || options.skippedStatuses.has(task.status)) return null;
	const completed = options.completedStatuses.has(task.status);
	const started = options.inProgressStatuses.has(task.status) || completed;
	const completionDate = completed ? getDate(task, 'completedDate') : undefined;
	return {
		name: getTaskName(task),
		scope,
		taskPath: task.path,
		recurring: false,
		scheduledDate: getDate(task, options.taskScheduledProperty),
		startedDate: started ? getDate(task, options.taskStartProperty) ?? completionDate : undefined,
		completedDate: completionDate,
	};
}

/** Expands a recurring parent and overlays matching materialized occurrences without double counting. */
function projectRecurringParent(
	parent: TaskNotesTask,
	allTasks: TaskNotesTask[],
	projectTaskPaths: ReadonlySet<string>,
	startDate: string,
	endDate: string,
	options: OccurrenceProjectionOptions,
): ProgressWorkItem[] {
	const start = new Date(`${startDate}T00:00:00Z`);
	const end = new Date(`${endDate}T23:59:59Z`);
	const occurrenceDates = generateRecurringInstances(parent, start, end).map((date) => date.toISOString().slice(0, 10));
	const materialized = allTasks.filter((task) => task.occurrence_date && referencesParent(task, parent));
	const materializedByDate = new Map(materialized.map((task) => [normalizeDate(task.occurrence_date), task]));
	const completedInstances = new Set((parent.complete_instances ?? []).map(normalizeDate).filter((date): date is string => date !== undefined));
	const skippedInstances = new Set((parent.skipped_instances ?? []).map(normalizeDate).filter((date): date is string => date !== undefined));
	const parentScope = getScope(parent, options.scopeProperty);
	const items: ProgressWorkItem[] = [];

	for (const occurrenceDate of occurrenceDates) {
		const occurrence = materializedByDate.get(occurrenceDate);
		if (occurrence) {
			// A materialized note is authoritative, including removal from this project and estimate/status changes.
			if (!projectTaskPaths.has(occurrence.path) || options.skippedStatuses.has(occurrence.status)) continue;
			const scope = getScope(occurrence, options.scopeProperty);
			if (scope <= 0) continue;
			const completed = options.completedStatuses.has(occurrence.status);
			const started = options.inProgressStatuses.has(occurrence.status) || completed;
			const completionDate = completed ? getDate(occurrence, 'completedDate') ?? occurrenceDate : undefined;
			items.push({
				name: getTaskName(occurrence),
				scope,
				taskPath: occurrence.path,
				recurring: true,
				recurrenceDate: occurrenceDate,
				scheduledDate: getDate(occurrence, options.taskScheduledProperty),
				startedDate: started ? getDate(occurrence, options.taskStartProperty) ?? completionDate : undefined,
				completedDate: completionDate,
			});
			continue;
		}

		if (skippedInstances.has(occurrenceDate) || parentScope <= 0) continue;
		const completed = completedInstances.has(occurrenceDate);
		items.push({
			name: getTaskName(parent),
			scope: parentScope,
			taskPath: parent.path,
			recurring: true,
			recurrenceDate: occurrenceDate,
			scheduledDate: occurrenceDate,
			startedDate: completed ? occurrenceDate : undefined,
			completedDate: completed ? occurrenceDate : undefined,
		});
	}

	for (const completionDate of completedInstances) {
		if (completionDate < startDate || completionDate > endDate || occurrenceDates.includes(completionDate) || parentScope <= 0) continue;
		// TaskNotes can record a recurring completion on a day other than its scheduled recurrence; retain that completed scope in this cycle.
		items.push({
			name: getTaskName(parent),
			scope: parentScope,
			taskPath: parent.path,
			recurring: true,
			recurrenceDate: completionDate,
			scheduledDate: completionDate,
			startedDate: completionDate,
			completedDate: completionDate,
		});
	}
	return items;
}

/** Builds logical project work items, projecting recurrence parents and overlaying materialized notes. */
export function buildProgressWorkItems(
	projectTasks: TaskNotesTask[],
	allTasks: TaskNotesTask[],
	startDate: string,
	endDate: string,
	options: OccurrenceProjectionOptions,
): ProgressWorkItem[] {
	const projectTaskPaths = new Set(projectTasks.map((task) => task.path));
	const items: ProgressWorkItem[] = [];
	for (const task of projectTasks) {
		if (task.recurrence_parent && task.occurrence_date) continue;
		if (task.recurrence) items.push(...projectRecurringParent(task, allTasks, projectTaskPaths, startDate, endDate, options));
		else {
			const item = createTaskWorkItem(task, options);
			if (item) items.push(item);
		}
	}
	return items;
}
