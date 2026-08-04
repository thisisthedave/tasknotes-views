import { moment } from 'obsidian';
import { CycleStartDay } from '../settings';

const WEEKDAY_INDEX: Record<Exclude<CycleStartDay, 'current'>, number> = {
	sunday: 0,
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6,
};

export interface CycleDateRange {
	startDate: string;
	endDate: string;
}

/** Resolves the cycle containing today, with an inclusive end date. */
export function getCycleDateRange(today: string, startDay: CycleStartDay, durationWeeks: number): CycleDateRange {
	const start = moment(today, 'YYYY-MM-DD', true).startOf('day');
	if (startDay !== 'current') {
		const daysSinceStart = (start.day() - WEEKDAY_INDEX[startDay] + 7) % 7;
		start.subtract(daysSinceStart, 'days');
	}
	const safeWeeks = Math.max(1, Math.floor(durationWeeks));
	return {
		startDate: start.format('YYYY-MM-DD'),
		endDate: start.clone().add(safeWeeks, 'weeks').subtract(1, 'day').format('YYYY-MM-DD'),
	};
}

/** Advances a cycle range by one configured duration without introducing date gaps. */
export function getNextCycleDateRange(range: CycleDateRange, durationWeeks: number): CycleDateRange {
	const start = moment(range.endDate, 'YYYY-MM-DD', true).add(1, 'day');
	const safeWeeks = Math.max(1, Math.floor(durationWeeks));
	return {
		startDate: start.format('YYYY-MM-DD'),
		endDate: start.clone().add(safeWeeks, 'weeks').subtract(1, 'day').format('YYYY-MM-DD'),
	};
}

