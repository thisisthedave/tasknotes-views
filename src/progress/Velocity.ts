import { TaskNotesTask } from '../tasknotes/TaskNotesApi';
import { buildProgressWorkItems, OccurrenceProjectionOptions } from './OccurrenceProjection';

const HISTORY_WEEKS = 6;
const MINIMUM_HISTORY_WEEKS = 3;
const MINIMUM_COMPLETIONS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Describes the inputs needed to estimate a project's capacity from recent completed work. */
export interface CapacityEstimateOptions extends OccurrenceProjectionOptions {
	countWeekends: boolean;
}

export interface CapacityCalculation {
	capacity: number;
	weeklyVelocity: number;
	projectDays: number;
	daysPerWeek: number;
	historyStart: string;
	historyEnd: string;
	completionCount: number;
}

/** Formats a UTC date as a stable date-only value. */
function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/** Counts the work days represented by an inclusive project reporting range. */
function countProjectDays(start: Date, end: Date, countWeekends: boolean): number {
	let days = 0;
	for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
		const weekday = cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6;
		if (countWeekends || weekday) days += 1;
	}
	return days;
}

/** Estimates capacity from six prior weekly completion buckets, favoring more recent weeks with linear weights. */
export function calculateProjectCapacity(
	allTasks: TaskNotesTask[],
	projectStartDate: string,
	projectEndDate: string,
	options: CapacityEstimateOptions,
): CapacityCalculation | null {
	const projectStart = new Date(`${projectStartDate}T00:00:00Z`);
	const projectEnd = new Date(`${projectEndDate}T00:00:00Z`);
	if (Number.isNaN(projectStart.getTime()) || Number.isNaN(projectEnd.getTime()) || projectEnd < projectStart) return null;

	const historyEnd = new Date(projectStart.getTime() - DAY_MS);
	const historyStart = new Date(historyEnd.getTime() - (HISTORY_WEEKS * 7 - 1) * DAY_MS);
	const workItems = buildProgressWorkItems(allTasks, allTasks, formatDate(historyStart), formatDate(historyEnd), options)
		.filter((item) => item.completedDate && item.completedDate >= formatDate(historyStart) && item.completedDate <= formatDate(historyEnd));
	const earliestCompletion = workItems.map((item) => item.completedDate as string).sort()[0];
	const observableDays = earliestCompletion ? Math.floor((historyEnd.getTime() - new Date(`${earliestCompletion}T00:00:00Z`).getTime()) / DAY_MS) + 1 : 0;
	if (workItems.length < MINIMUM_COMPLETIONS || observableDays < MINIMUM_HISTORY_WEEKS * 7) return null;

	const weeklyScope = Array.from({ length: HISTORY_WEEKS }, () => 0);
	for (const item of workItems) {
		const daysFromStart = Math.floor((new Date(`${item.completedDate as string}T00:00:00Z`).getTime() - historyStart.getTime()) / DAY_MS);
		const weekIndex = Math.min(HISTORY_WEEKS - 1, Math.max(0, Math.floor(daysFromStart / 7)));
		weeklyScope[weekIndex] = (weeklyScope[weekIndex] ?? 0) + item.scope;
	}

	// Linear documents recency weighting but not its coefficients; increasing 1..6 weights provide a transparent approximation.
	const weights = weeklyScope.map((_scope, index) => index + 1);
	const weeklyVelocity = weeklyScope.reduce((sum, scope, index) => sum + scope * (weights[index] ?? 0), 0)
		/ weights.reduce((sum, weight) => sum + weight, 0);
	const projectDays = countProjectDays(projectStart, projectEnd, options.countWeekends);
	const daysPerWeek = options.countWeekends ? 7 : 5;
	return {
		capacity: weeklyVelocity * projectDays / daysPerWeek,
		weeklyVelocity,
		projectDays,
		daysPerWeek,
		historyStart: formatDate(historyStart),
		historyEnd: formatDate(historyEnd),
		completionCount: workItems.length,
	};
}

/** Returns only the capacity value for callers that do not need calculation provenance. */
export function estimateProjectCapacity(
	allTasks: TaskNotesTask[],
	projectStartDate: string,
	projectEndDate: string,
	options: CapacityEstimateOptions,
): number | null {
	return calculateProjectCapacity(allTasks, projectStartDate, projectEndDate, options)?.capacity ?? null;
}
