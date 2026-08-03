import { App, TFile } from 'obsidian';
import { getTaskNotesApi, TaskNotesTask } from '../tasknotes/TaskNotesApi';

export interface ProjectProgressPoint {
	date: string;
	ideal: number;
	scope: number;
	started: number;
	completed: number;
}

export interface ProjectProgress {
	projectName: string;
	startDate: string;
	endDate: string;
	scope: number;
	started: number;
	completed: number;
	points: ProjectProgressPoint[];
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

/** Calculates the linearly declining ideal work remaining, pausing on weekends. */
function idealBurndown(dates: Date[], scope: number): number[] {
	const weekdayIndexes = dates.map((date, index) => isWeekday(date) ? index : -1).filter((index) => index >= 0);
	if (weekdayIndexes.length === 0) return dates.map(() => scope);
	if (weekdayIndexes.length === 1) {
		const onlyWeekday = weekdayIndexes[0] ?? 0;
		return dates.map((_date, index) => index < onlyWeekday ? scope : 0);
	}
	const first = weekdayIndexes[0] ?? 0;
	const last = weekdayIndexes[weekdayIndexes.length - 1] ?? dates.length - 1;
	let elapsed = 0;
	return dates.map((_date, index) => {
		if (index <= first) return scope;
		if (isWeekday(dates[index] as Date)) elapsed += 1;
		return index >= last ? 0 : Math.max(0, scope * (1 - elapsed / (weekdayIndexes.length - 1)));
	});
}

/** Computes cumulative started and completed estimates for one project date range. */
export function buildProjectProgress(
	projectName: string,
	startDate: string,
	endDate: string,
	tasks: TaskNotesTask[],
	completedStatuses: Set<string>,
): ProjectProgress | null {
	const start = parseDate(startDate);
	const end = parseDate(endDate);
	if (!start || !end || end < start) return null;
	const dates = enumerateDates(start, end);
	const estimatedTasks = tasks.filter((task) => Number.isFinite(task.timeEstimate) && (task.timeEstimate ?? 0) > 0);
	const scope = estimatedTasks.reduce((sum, task) => sum + (task.timeEstimate ?? 0), 0);
	const isCompleted = (task: TaskNotesTask) => completedStatuses.has(task.status);
	const isStarted = (task: TaskNotesTask) => task.status === 'in-progress' || isCompleted(task);
	const ideal = idealBurndown(dates, scope);

	// Status history is not public, so scheduled/completed dates anchor cumulative state changes on the timeline.
	const points = dates.map((date, index) => {
		const current = formatDate(date);
		const started = estimatedTasks.filter(isStarted).reduce((sum, task) => {
			const startedDate = clampDate(task.scheduled ?? task.completedDate, startDate, endDate);
			return startedDate <= current ? sum + (task.timeEstimate ?? 0) : sum;
		}, 0);
		const completed = estimatedTasks.filter(isCompleted).reduce((sum, task) => {
			const completedDate = clampDate(task.completedDate, startDate, endDate);
			return completedDate <= current ? sum + (task.timeEstimate ?? 0) : sum;
		}, 0);
		return { date: current, ideal: ideal[index] ?? 0, scope, started, completed };
	});
	return { projectName, startDate, endDate, scope, started: points.at(-1)?.started ?? 0, completed: points.at(-1)?.completed ?? 0, points };
}

/** Loads project dates and matching project tasks through Obsidian and TaskNotes' public query API. */
export async function loadProjectProgress(app: App, file: TFile): Promise<ProjectProgress | null> {
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	const startDate = typeof frontmatter?.scheduled === 'string' ? frontmatter.scheduled : '';
	const endDate = typeof frontmatter?.due === 'string' ? frontmatter.due : '';
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
	const completedStatuses = new Set(api.catalog.statuses().filter((status) => status.isCompleted).map((status) => status.value));
	return buildProjectProgress(file.basename, startDate, endDate, result.tasks, completedStatuses);
}
