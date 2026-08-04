import { App, TFile } from 'obsidian';
import { TaskNotesViewsSettings } from '../settings';
import { getTaskNotesApi, TaskNotesTask } from '../tasknotes/TaskNotesApi';
import { buildProgressWorkItems, ProgressWorkItem } from './OccurrenceProjection';
import { calculateProjectCapacity, CapacityCalculation } from './Velocity';

export interface ProjectProgressPoint {
	date: string;
	target: number;
	scope: number;
	scheduled: number;
	started: number;
	completed: number;
	scheduledTasks: ProjectProgressTask[];
	startedTasks: ProjectProgressTask[];
	completedTasks: ProjectProgressTask[];
}

export interface ProjectProgressTask {
	name: string;
	scope: number;
}

export interface ProjectProgress {
	projectName: string;
	startDate: string;
	endDate: string;
	scope: number;
	scheduled: number;
	started: number;
	completed: number;
	today: string;
	scopeIsDuration: boolean;
	estimatedCapacity?: number | null;
	capacityCalculation?: CapacityCalculation | null;
	workItems?: ProgressWorkItem[];
	points: ProjectProgressPoint[];
}

export interface ProjectProgressOptions {
	scopeProperty: string;
	taskStartProperty: string;
	taskScheduledProperty: string;
	inProgressStatuses: string[];
	scopeIsDuration: boolean;
	countWeekends: boolean;
	today?: string;
}

/** Normalizes a date-only or ISO datetime value to its YYYY-MM-DD calendar component. */
function normalizeDate(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const dateValue = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(value)?.[1];
	if (!dateValue) return null;
	const date = new Date(`${dateValue}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateValue ? dateValue : null;
}

/** Parses a date-only or ISO datetime value as a stable UTC calendar date. */
function parseDate(value: unknown): Date | null {
	const normalized = normalizeDate(value);
	return normalized ? new Date(`${normalized}T00:00:00Z`) : null;
}

/** Formats a UTC calendar date without timezone drift. */
function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/** Produces every calendar day in an inclusive project date range. */
function enumerateDates(start: Date, end: Date): Date[] {
	const dates: Date[] = [];
	for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
		dates.push(new Date(cursor));
	}
	return dates;
}

/** Returns true for Monday through Friday in UTC calendar terms. */
function isWeekday(date: Date): boolean {
	const day = date.getUTCDay();
	return day !== 0 && day !== 6;
}

/** Clamps a task event date into the visible project range. */
function clampDate(value: string | undefined, start: string, end: string): string {
	if (!value || value < start) return start;
	return value > end ? end : value;
}

/** Calculates linearly increasing target progress, pausing on weekends. */
function targetProgress(dates: Date[], scope: number, countWeekends: boolean): number[] {
	const weekdayIndexes = dates.map((date, index) => countWeekends || isWeekday(date) ? index : -1).filter((index) => index >= 0);
	if (weekdayIndexes.length === 0) return dates.map(() => 0);
	if (weekdayIndexes.length === 1) {
		const onlyWeekday = weekdayIndexes[0] ?? 0;
		return dates.map((_date, index) => index < onlyWeekday ? 0 : scope);
	}
	const first = weekdayIndexes[0] ?? 0;
	const last = weekdayIndexes[weekdayIndexes.length - 1] ?? dates.length - 1;
	let elapsed = 0;
	return dates.map((_date, index) => {
		if (index <= first) return 0;
		if (countWeekends || isWeekday(dates[index] as Date)) elapsed += 1;
		return index >= last ? scope : Math.min(scope, scope * elapsed / (weekdayIndexes.length - 1));
	});
}

/** Reads and normalizes a date property from project frontmatter. */
function getProjectDate(frontmatter: Record<string, unknown> | undefined, property: string): string {
	return normalizeDate(frontmatter?.[property]) ?? '';
}

/** Reads a built-in or custom TaskNotes property without giving custom data precedence over API-normalized fields. */
function getTaskProperty(task: TaskNotesTask, property: string): unknown {
	return task[property] !== undefined ? task[property] : task.customProperties?.[property];
}

/** Resolves each project boundary from frontmatter, using task dates only when derivation is enabled and that boundary is absent. */
export function resolveProjectDateRange(
	projectStart: string,
	projectEnd: string,
	tasks: TaskNotesTask[],
	deriveDateRangeFromTasks: boolean,
	taskStartProperty = 'startedAt',
	taskScheduledProperty = 'scheduled',
): { startDate: string; endDate: string } {
	const scheduledDates = tasks.map((task) => normalizeDate(getTaskProperty(task, taskScheduledProperty))).filter((date): date is string => date !== null);
	const startedDates = tasks.map((task) => normalizeDate(getTaskProperty(task, taskStartProperty))).filter((date): date is string => date !== null);
	const possibleStartDates = [...scheduledDates, ...startedDates].sort();
	const dueDates = tasks.map((task) => normalizeDate(task.due)).filter((date): date is string => date !== null).sort();

	// Project properties express an explicit reporting window; derivation only repairs a missing boundary.
	const derivedStart = deriveDateRangeFromTasks ? possibleStartDates[0] ?? '' : '';
	const derivedEnd = deriveDateRangeFromTasks ? dueDates.at(-1) ?? '' : '';
	return {
		startDate: projectStart || derivedStart,
		endDate: projectEnd || derivedEnd,
	};
}

/** Computes cumulative started and completed estimates for one project date range. */
export function buildProjectProgress(
	projectName: string,
	startDate: string,
	endDate: string,
	tasks: TaskNotesTask[],
	completedStatuses: Set<string>,
	options: ProjectProgressOptions,
	allTasks: TaskNotesTask[] = tasks,
	skippedStatuses: Set<string> = new Set(),
): ProjectProgress | null {
	const start = parseDate(startDate);
	const end = parseDate(endDate);
	if (!start || !end || end < start) return null;
	const dates = enumerateDates(start, end);
	const inProgressStatuses = new Set(options.inProgressStatuses);
	const workItems = buildProgressWorkItems(tasks, allTasks, startDate, endDate, {
		scopeProperty: options.scopeProperty,
		taskStartProperty: options.taskStartProperty,
		taskScheduledProperty: options.taskScheduledProperty,
		inProgressStatuses,
		completedStatuses,
		skippedStatuses,
	});
	const scope = workItems.reduce((sum, item) => sum + item.scope, 0);
	const target = targetProgress(dates, scope, options.countWeekends);
	const today = normalizeDate(options.today) ?? formatDate(new Date());

	// Status history is not public, so scheduled/completed dates anchor cumulative state changes on the timeline.
	const points = dates.map((date, index) => {
		const current = formatDate(date);
		const scheduled = workItems.reduce((sum, item) => {
			return item.scheduledDate && clampDate(item.scheduledDate, startDate, endDate) <= current ? sum + item.scope : sum;
		}, 0);
		const started = workItems.reduce((sum, item) => {
			return item.startedDate && clampDate(item.startedDate, startDate, endDate) <= current ? sum + item.scope : sum;
		}, 0);
		const completed = workItems.reduce((sum, item) => {
			return item.completedDate && clampDate(item.completedDate, startDate, endDate) <= current ? sum + item.scope : sum;
		}, 0);
		const scheduledTasks = workItems.filter((item) => item.scheduledDate && clampDate(item.scheduledDate, startDate, endDate) === current).map((item) => ({ name: item.name, scope: item.scope }));
		const startedTasks = workItems.filter((item) => item.startedDate && clampDate(item.startedDate, startDate, endDate) === current).map((item) => ({ name: item.name, scope: item.scope }));
		const completedTasks = workItems.filter((item) => item.completedDate && clampDate(item.completedDate, startDate, endDate) === current).map((item) => ({ name: item.name, scope: item.scope }));
		return { date: current, target: target[index] ?? 0, scope, scheduled, started, completed, scheduledTasks, startedTasks, completedTasks };
	});
	return { projectName, startDate, endDate, scope, scheduled: points.at(-1)?.scheduled ?? 0, started: points.at(-1)?.started ?? 0, completed: points.at(-1)?.completed ?? 0, today, scopeIsDuration: options.scopeIsDuration, workItems, points };
}

/** Loads project dates and matching project tasks through Obsidian and TaskNotes' public query API. */
export async function loadLiveProjectProgress(app: App, file: TFile, settings: TaskNotesViewsSettings): Promise<ProjectProgress | null> {
	const cachedFrontmatter: unknown = app.metadataCache.getFileCache(file)?.frontmatter;
	const frontmatter = cachedFrontmatter && typeof cachedFrontmatter === 'object' ? cachedFrontmatter as Record<string, unknown> : undefined;
	const api = getTaskNotesApi(app);
	if (!api) return null;
	const projectPath = file.path.replace(/\.md$/i, '');
	const [result, allTasks] = await Promise.all([api.query.tasks({
		where: {
			field: 'task.projects',
			op: 'contains',
			value: `[[${projectPath}]]`,
		},
		scope: {
			includeArchived: false,
		},
	}), api.tasks.list()]);
	const projectStart = getProjectDate(frontmatter, settings.projectStartProperty);
	const projectEnd = getProjectDate(frontmatter, settings.projectEndProperty);
	const { startDate, endDate } = resolveProjectDateRange(
		projectStart,
		projectEnd,
		result.tasks,
		settings.deriveDateRangeFromTasks,
		settings.taskStartProperty,
		settings.taskScheduledProperty,
	);
	const statuses = api.catalog.statuses();
	const completedStatuses = new Set(statuses.filter((status) => status.isCompleted).map((status) => status.value));
	const skippedStatuses = new Set(statuses.filter((status) => status.isSkipped).map((status) => status.value));
	const progress = buildProjectProgress(file.basename, startDate, endDate, result.tasks, completedStatuses, {
		scopeProperty: settings.scopeProperty,
		taskStartProperty: settings.taskStartProperty,
		taskScheduledProperty: settings.taskScheduledProperty,
		inProgressStatuses: settings.inProgressStatuses.split(',').map((status) => status.trim()).filter(Boolean),
		scopeIsDuration: settings.scopeIsDuration,
		countWeekends: settings.countWeekends,
	}, allTasks, skippedStatuses);
	if (progress && settings.estimateCapacityFromVelocity) {
		// Capacity is based on vault-wide completed work before this reporting window, not the project's own planned scope.
		const calculation = calculateProjectCapacity(allTasks, startDate, endDate, {
			scopeProperty: settings.scopeProperty,
			taskStartProperty: settings.taskStartProperty,
			taskScheduledProperty: settings.taskScheduledProperty,
			inProgressStatuses: new Set(settings.inProgressStatuses.split(',').map((status) => status.trim()).filter(Boolean)),
			completedStatuses,
			skippedStatuses,
			countWeekends: settings.countWeekends,
		});
		progress.capacityCalculation = calculation;
		progress.estimatedCapacity = calculation?.capacity ?? null;
	}
	return progress;
}
