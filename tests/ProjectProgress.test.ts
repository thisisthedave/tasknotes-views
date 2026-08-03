import { describe, expect, it } from 'vitest';
import { buildProjectProgress } from '../src/progress/ProjectProgress';

describe('buildProjectProgress', () => {
	it('builds cumulative task progress and pauses ideal work on weekends', () => {
		const progress = buildProjectProgress('Launch', '2026-08-07', '2026-08-11', [
			{ path: 'one.md', status: 'in-progress', scheduled: '2026-08-07', timeEstimate: 60 },
			{ path: 'two.md', status: 'shipped', scheduled: '2026-08-10', completedDate: '2026-08-11', timeEstimate: 30 },
		], new Set(['shipped']));

		expect(progress?.scope).toBe(90);
		expect(progress?.started).toBe(90);
		expect(progress?.completed).toBe(30);
		expect(progress?.points.map((point) => point.ideal)).toEqual([90, 90, 90, 45, 0]);
		expect(progress?.points.map((point) => point.started)).toEqual([60, 60, 60, 90, 90]);
	});

	it('rejects missing or inverted project date ranges', () => {
		expect(buildProjectProgress('No dates', '', '2026-08-11', [], new Set())).toBeNull();
		expect(buildProjectProgress('Backwards', '2026-08-12', '2026-08-11', [], new Set())).toBeNull();
	});

	it('does not burn ideal scope during a weekend-only range', () => {
		const progress = buildProjectProgress('Weekend', '2026-08-08', '2026-08-09', [
			{ path: 'one.md', status: 'open', timeEstimate: 60 },
		], new Set(['done']));
		expect(progress?.points.map((point) => point.ideal)).toEqual([60, 60]);
	});
});
