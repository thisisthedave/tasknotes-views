import { describe, expect, it } from 'vitest';
import { getCycleNumber, renderCycleRelativePath, withCycleNumber } from '../src/cycles/CycleNaming';
import { getCycleDateRange, getNextCycleDateRange } from '../src/cycles/CycleSchedule';

describe('cycle schedule', () => {
	it('anchors a two-week cycle to Monday with an inclusive Sunday end', () => {
		expect(getCycleDateRange('2026-08-04', 'monday', 2)).toEqual({
			startDate: '2026-08-03',
			endDate: '2026-08-16',
		});
	});

	it('uses today for an ad hoc cycle and advances without a gap', () => {
		const current = getCycleDateRange('2026-08-04', 'current', 2);
		expect(current).toEqual({ startDate: '2026-08-04', endDate: '2026-08-17' });
		expect(getNextCycleDateRange(current, 2)).toEqual({
			startDate: '2026-08-18',
			endDate: '2026-08-31',
		});
	});
});

describe('cycle naming', () => {
	it('combines Moment syntax with the annual cycle counter token', () => {
		expect(renderCycleRelativePath('YYYY/YYYY-[Cycle]-{cycle}', '2026-08-03', 7))
			.toBe('2026/2026-Cycle-7');
	});

	it('reads and changes only a final numeric cycle suffix', () => {
		expect(getCycleNumber('Cycles/2026-Cycle-12.md')).toBe(12);
		expect(withCycleNumber('Cycles/2026-Cycle-12.md', 13)).toBe('Cycles/2026-Cycle-13.md');
		expect(getCycleNumber('Cycles/2026-Cycle.md')).toBeNull();
		expect(withCycleNumber('Cycles/2026-Cycle.md', 2)).toBeNull();
	});
});

