import { describe, expect, it } from 'vitest';
import { buildProjectProgress } from '../src/progress/ProjectProgress';
import { getActualSeriesData } from '../src/views/CycleProgressChart';

const DEFAULT_OPTIONS = {
	scopeProperty: 'timeEstimate',
	taskStartProperty: 'startedAt',
	taskScheduledProperty: 'scheduled',
	inProgressStatuses: ['in-progress'],
	scopeIsDuration: true,
	countWeekends: false,
	today: '2026-08-04',
};

describe('buildProjectProgress', () => {
	it('builds cumulative task progress and pauses target progress on weekends', () => {
		const progress = buildProjectProgress('Launch', '2026-08-07', '2026-08-11', [
			{ path: 'one.md', status: 'in-progress', scheduled: '2026-08-07', timeEstimate: 60, customProperties: { startedAt: '2026-08-07' } },
			{ path: 'two.md', status: 'shipped', scheduled: '2026-08-10', completedDate: '2026-08-11', timeEstimate: 30 },
		], new Set(['shipped']), DEFAULT_OPTIONS);

		expect(progress?.scope).toBe(90);
		expect(progress?.scheduled).toBe(90);
		expect(progress?.started).toBe(90);
		expect(progress?.completed).toBe(30);
		expect(progress?.points.map((point) => point.target)).toEqual([0, 0, 0, 45, 90]);
		expect(progress?.points.map((point) => point.scheduled)).toEqual([60, 60, 60, 90, 90]);
		expect(progress?.points.map((point) => point.started)).toEqual([60, 60, 60, 60, 90]);
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
			customProperties: { points: 5, startedAt: '2026-08-09T15:09:55.802Z' },
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

	it('uses an ISO startedAt datetime instead of falling back to scheduled', () => {
		const progress = buildProjectProgress('Cycle', '2026-08-01', '2026-08-05', [{
			path: 'cauldron.md',
			title: 'Polish the sentient cauldron',
			status: 'in-progress',
			scheduled: '2026-08-02',
			timeEstimate: 15,
			customProperties: { startedAt: '2026-08-04T15:09:55.802Z' },
		}], new Set(['done']), DEFAULT_OPTIONS);
		expect(progress?.points.map((point) => point.started)).toEqual([0, 0, 0, 15, 15]);
		expect(progress?.points.find((point) => point.date === '2026-08-04')?.startedTasks).toEqual([
			{ name: 'Polish the sentient cauldron', scope: 15 },
		]);
	});

	it('does not use scheduled or project start when a started task has no actual date', () => {
		const progress = buildProjectProgress('Cycle', '2026-08-01', '2026-08-05', [{
			path: 'undated.md',
			status: 'in-progress',
			scheduled: '2026-08-02',
			timeEstimate: 15,
		}], new Set(['done']), DEFAULT_OPTIONS);
		expect(progress?.points.map((point) => point.started)).toEqual([0, 0, 0, 0, 0]);
	});

	it('terminates actual progress series after today', () => {
		const progress = buildProjectProgress('Cycle', '2026-08-01', '2026-08-05', [{
			path: 'started.md',
			status: 'in-progress',
			timeEstimate: 10,
			customProperties: { startedAt: '2026-08-03' },
		}], new Set(['done']), DEFAULT_OPTIONS);
		expect(progress && getActualSeriesData(progress, 'started')).toEqual([0, 0, 10, 10, null]);
	});

	it('projects virtual recurring occurrences and excludes skipped dates from scope', () => {
		const parent = {
			path: 'Tasks/cauldron.md',
			status: 'open',
			recurrence: 'DTSTART:20260802;FREQ=WEEKLY;INTERVAL=1;BYDAY=SU',
			scheduled: '2026-08-30',
			timeEstimate: 15,
			complete_instances: ['2026-08-02'],
			skipped_instances: ['2026-08-09'],
		};
		const progress = buildProjectProgress('Cycle', '2026-08-01', '2026-08-09', [parent], new Set(['done']), DEFAULT_OPTIONS);
		expect(progress?.scope).toBe(15);
		expect(progress?.scheduled).toBe(15);
		expect(progress?.started).toBe(15);
		expect(progress?.completed).toBe(15);
	});

	it('uses materialized estimates and suppresses projections moved to another project', () => {
		const parent = {
			path: 'Tasks/cauldron.md',
			status: 'open',
			recurrence: 'DTSTART:20260802;FREQ=WEEKLY;INTERVAL=1;BYDAY=SU',
			scheduled: '2026-08-30',
			timeEstimate: 10,
			complete_instances: ['2026-08-02'],
			skipped_instances: [],
		};
		const completedOccurrence = {
			path: 'Tasks/cauldron-2026-08-02.md',
			status: 'done',
			recurrence_parent: '[[cauldron]]',
			occurrence_date: '2026-08-02',
			scheduled: '2026-08-02',
			completedDate: '2026-08-03',
			timeEstimate: 20,
		};
		const reassignedOccurrence = {
			path: 'Tasks/cauldron-2026-08-09.md',
			status: 'open',
			recurrence_parent: '[[Tasks/cauldron]]',
			occurrence_date: '2026-08-09',
			scheduled: '2026-08-09',
			timeEstimate: 30,
		};
		const projectTasks = [parent, completedOccurrence];
		const allTasks = [parent, completedOccurrence, reassignedOccurrence];
		const progress = buildProjectProgress(
			'Cycle',
			'2026-08-01',
			'2026-08-09',
			projectTasks,
			new Set(['done']),
			DEFAULT_OPTIONS,
			allTasks,
		);
		expect(progress?.scope).toBe(20);
		expect(progress?.scheduled).toBe(20);
		expect(progress?.started).toBe(20);
		expect(progress?.completed).toBe(20);
		expect(progress?.points.find((point) => point.date === '2026-08-02')?.completed).toBe(0);
		expect(progress?.points.find((point) => point.date === '2026-08-03')?.completed).toBe(20);
	});

	it('excludes materialized occurrences whose status is configured as skipped', () => {
		const parent = {
			path: 'Tasks/cauldron.md',
			status: 'open',
			recurrence: 'DTSTART:20260802;FREQ=WEEKLY;BYDAY=SU',
			timeEstimate: 10,
		};
		const skippedOccurrence = {
			path: 'Tasks/cauldron-2026-08-02.md',
			status: 'skipped',
			recurrence_parent: '[[cauldron]]',
			occurrence_date: '2026-08-02',
			timeEstimate: 50,
		};
		const progress = buildProjectProgress(
			'Cycle',
			'2026-08-01',
			'2026-08-02',
			[parent, skippedOccurrence],
			new Set(['done']),
			DEFAULT_OPTIONS,
			[parent, skippedOccurrence],
			new Set(['skipped']),
		);
		expect(progress?.scope).toBe(0);
		expect(progress?.started).toBe(0);
		expect(progress?.completed).toBe(0);
	});
});
