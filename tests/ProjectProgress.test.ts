import { describe, expect, it } from 'vitest';
import { buildProjectProgress } from '../src/progress/ProjectProgress';

const DEFAULT_OPTIONS = {
	scopeProperty: 'timeEstimate',
	taskStartProperty: 'startedAt',
	taskScheduledProperty: 'scheduled',
	inProgressStatuses: ['in-progress'],
	scopeIsDuration: true,
	countWeekends: false,
};

describe('buildProjectProgress', () => {
	it('builds cumulative task progress and pauses target progress on weekends', () => {
		const progress = buildProjectProgress('Launch', '2026-08-07', '2026-08-11', [
			{ path: 'one.md', status: 'in-progress', scheduled: '2026-08-07', timeEstimate: 60 },
			{ path: 'two.md', status: 'shipped', scheduled: '2026-08-10', completedDate: '2026-08-11', timeEstimate: 30 },
		], new Set(['shipped']), DEFAULT_OPTIONS);

		expect(progress?.scope).toBe(90);
		expect(progress?.scheduled).toBe(90);
		expect(progress?.started).toBe(90);
		expect(progress?.completed).toBe(30);
		expect(progress?.points.map((point) => point.target)).toEqual([0, 0, 0, 45, 90]);
		expect(progress?.points.map((point) => point.scheduled)).toEqual([60, 60, 60, 90, 90]);
		expect(progress?.points.map((point) => point.started)).toEqual([60, 60, 60, 90, 90]);
	});

	it('rejects missing or inverted project date ranges', () => {
		expect(buildProjectProgress('No dates', '', '2026-08-11', [], new Set(), DEFAULT_OPTIONS)).toBeNull();
		expect(buildProjectProgress('Backwards', '2026-08-12', '2026-08-11', [], new Set(), DEFAULT_OPTIONS)).toBeNull();
	});

	it('does not advance target scope during a weekend-only range', () => {
		const progress = buildProjectProgress('Weekend', '2026-08-08', '2026-08-09', [
			{ path: 'one.md', status: 'open', timeEstimate: 60 },
		], new Set(['done']), DEFAULT_OPTIONS);
		expect(progress?.points.map((point) => point.target)).toEqual([0, 0]);
	});

	it('uses custom scope and started-date properties and can count weekends', () => {
		const progress = buildProjectProgress('Cycle', '2026-08-08', '2026-08-10', [{
			path: 'story.md',
			status: 'active',
			customProperties: { points: 5, startedAt: '2026-08-09' },
		}], new Set(['done']), {
			...DEFAULT_OPTIONS,
			scopeProperty: 'points',
			inProgressStatuses: ['active'],
			scopeIsDuration: false,
			countWeekends: true,
		});
		expect(progress?.scope).toBe(5);
		expect(progress?.scopeIsDuration).toBe(false);
		expect(progress?.points.map((point) => point.started)).toEqual([0, 5, 5]);
		expect(progress?.points.map((point) => point.target)).toEqual([0, 2.5, 5]);
	});
});
