import { App, TFile } from 'obsidian';
import { TaskNotesViewsSettings } from '../settings';
import { getTaskNotesApi, TaskNotesTask } from '../tasknotes/TaskNotesApi';

export interface ProjectProgressPoint {
	date: string;
	target: number;
	scope: number;
	scheduled: number;
	started: number;
	completed: number;
}

export interface ProjectProgress {
	projectName: string;
	startDate: string;
	endDate: string;
	scope: number;
	scheduled: number;
	started: number;
	completed: number;
	scopeIsDuration: boolean;
	points: ProjectProgressPoint[];
}

export interface ProjectProgressOptions {
	scopeProperty: string;
	taskStartProperty: string;
	taskScheduledProperty: string;
	inProgressStatuses: string[];
	scopeIsDuration: boolean;
	countWeekends: boolean;
}

/** Parses a YYYY-MM-DD value as a stable UTC calendar date. */
function parseDate(value: unknown): Date | null {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const date = new Date(`${value}T00:00:00Z`);
	return Number.isNaN(date.getTime()) ? null : date;
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

/** Reads a core or custom TaskNotes property without assuming its storage location. */
function getTaskProperty(task: TaskNotesTask, property: string): unknown {
	const coreValue = task[property];
	return coreValue !== undefined ? coreValue : task.customProperties?.[property];
}

/** Converts a configured task property into a positive numeric scope contribution. */
function getTaskScope(task: TaskNotesTask, property: string): number {
	const value = getTaskProperty(task, property);
	const numericValue = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
	return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

/** Reads a configured task property when it contains a valid calendar date. */
function getTaskDate(task: TaskNotesTask, property: string): string | undefined {
	const value = getTaskProperty(task, property);
	return parseDate(value) ? value as string : undefined;
}

/** Reads a string property from project frontmatter. */
function getProjectProperty(frontmatter: Record<string, unknown> | undefined, property: string): string {
	const value = frontmatter?.[property];
	return typeof value === 'string' ? value : '';
}

/** Computes cumulative started and completed estimates for one project date range. */
export function buildProjectProgress(
	projectName: string,
	startDate: string,
	endDate: string,
	tasks: TaskNotesTask[],
	completedStatuses: Set<string>,
	options: ProjectProgressOptions,
): ProjectProgress | null {
	const start = parseDate(startDate);
	const end = parseDate(endDate);
	if (!start || !end || end < start) return null;
	const dates = enumerateDates(start, end);
	const estimatedTasks = tasks.map((task) => ({ task, scope: getTaskScope(task, options.scopeProperty) })).filter((entry) => entry.scope > 0);
	const scope = estimatedTasks.reduce((sum, entry) => sum + entry.scope, 0);
	const isCompleted = (task: TaskNotesTask) => completedStatuses.has(task.status);
	const inProgressStatuses = new Set(options.inProgressStatuses);
	const isStarted = (task: TaskNotesTask) => inProgressStatuses.has(task.status) || isCompleted(task);
	const target = targetProgress(dates, scope, options.countWeekends);

	// Status history is not public, so scheduled/completed dates anchor cumulative state changes on the timeline.
	const points = dates.map((date, index) => {
		const current = formatDate(date);
		const scheduled = estimatedTasks.reduce((sum, entry) => {
			const scheduledDate = getTaskDate(entry.task, options.taskScheduledProperty);
			return scheduledDate && clampDate(scheduledDate, startDate, endDate) <= current ? sum + entry.scope : sum;
		}, 0);
		const started = estimatedTasks.filter(({ task }) => isStarted(task)).reduce((sum, entry) => {
			const startedDate = clampDate(getTaskDate(entry.task, options.taskStartProperty) ?? entry.task.scheduled ?? entry.task.completedDate, startDate, endDate);
			return startedDate <= current ? sum + entry.scope : sum;
		}, 0);
		const completed = estimatedTasks.filter(({ task }) => isCompleted(task)).reduce((sum, entry) => {
			const completedDate = clampDate(entry.task.completedDate, startDate, endDate);
			return completedDate <= current ? sum + entry.scope : sum;
		}, 0);
		return { date: current, target: target[index] ?? 0, scope, scheduled, started, completed };
	});
	return { projectName, startDate, endDate, scope, scheduled: points.at(-1)?.scheduled ?? 0, started: points.at(-1)?.started ?? 0, completed: points.at(-1)?.completed ?? 0, scopeIsDuration: options.scopeIsDuration, points };
}

/** Loads project dates and matching project tasks through Obsidian and TaskNotes' public query API. */
export async function loadProjectProgress(app: App, file: TFile, settings: TaskNotesViewsSettings): Promise<ProjectProgress | null> {
	const cachedFrontmatter: unknown = app.metadataCache.getFileCache(file)?.frontmatter;
	const frontmatter = cachedFrontmatter && typeof cachedFrontmatter === 'object' ? cachedFrontmatter as Record<string, unknown> : undefined;
	const api = getTaskNotesApi(app);
	if (!api) return null;
	const projectPath = file.path.replace(/\.md$/i, '');
	const result = await api.query.tasks({
		where: {
			field: 'task.projects',
			op: 'contains',
			value: `[[${projectPath}]]`,
		},
		scope: {
			includeArchived: false,
		},
	});
	const projectStart = getProjectProperty(frontmatter, settings.projectStartProperty);
	const projectEnd = getProjectProperty(frontmatter, settings.projectEndProperty);
	const scheduledDates = result.tasks.map((task) => task.scheduled).filter((date): date is string => parseDate(date) !== null).sort();
	const dueDates = result.tasks.map((task) => task.due).filter((date): date is string => parseDate(date) !== null).sort();
	const startDate = settings.deriveDateRangeFromTasks && scheduledDates.length > 0 ? scheduledDates[0] as string : projectStart;
	const endDate = settings.deriveDateRangeFromTasks && dueDates.length > 0 ? dueDates.at(-1) as string : projectEnd;
	const completedStatuses = new Set(api.catalog.statuses().filter((status) => status.isCompleted).map((status) => status.value));
	return buildProjectProgress(file.basename, startDate, endDate, result.tasks, completedStatuses, {
		scopeProperty: settings.scopeProperty,
		taskStartProperty: settings.taskStartProperty,
		taskScheduledProperty: settings.taskScheduledProperty,
		inProgressStatuses: settings.inProgressStatuses.split(',').map((status) => status.trim()).filter(Boolean),
		scopeIsDuration: settings.scopeIsDuration,
		countWeekends: settings.countWeekends,
	});
}
