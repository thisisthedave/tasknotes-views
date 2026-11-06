import { describe, expect, it } from 'vitest';
import { getCycleNumber, renderCycleRelativePath, withCycleNumber } from '../src/cycles/CycleNaming';
import { CycleProjectService } from '../src/cycles/CycleProjectService';
import { getCycleDateRange, getNextCycleDateRange, isDateInCycleRange } from '../src/cycles/CycleSchedule';
import { TFile } from 'obsidian';
import type { App } from 'obsidian';

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

	it('includes dates within stored cycle boundaries without requiring a predicted range match', () => {
		const storedRange = { startDate: '2026-08-01', endDate: '2026-08-20' };
		expect(isDateInCycleRange('2026-08-10', storedRange)).toBe(true);
		expect(isDateInCycleRange('2026-07-31', storedRange)).toBe(false);
		expect(isDateInCycleRange('2026-08-21', storedRange)).toBe(false);
	});
});

/** Builds the minimal metadata-backed cycle service needed to test date inference. */
function createCycleService(cycles: Array<{ path: string; startDate: string; endDate: string }>, cycleNameFormat = 'YYYY-[Cycle]-{cycle}', cycleProjectFolder = ''): CycleProjectService {
	const files = cycles.map((cycle) => Object.assign(new TFile(), { path: cycle.path }));
	const metadata = new Map(cycles.map((cycle) => [cycle.path, {
		frontmatter: { scheduled: cycle.startDate, due: cycle.endDate },
	}]));
	const app = {
		vault: {
			getMarkdownFiles: () => files,
			getAbstractFileByPath: (path: string) => files.find((file) => file.path === path) ?? null,
		},
		metadataCache: { getFileCache: (file: TFile) => metadata.get(file.path) },
	} as unknown as App;
	const plugin = {
		settings: {
			cycleProjectFolder, projectStartProperty: 'scheduled', projectEndProperty: 'due',
			cycleStartDay: 'monday', cycleDurationWeeks: 2, cycleNameFormat,
		},
	} as unknown as ConstructorParameters<typeof CycleProjectService>[1];
	return new CycleProjectService(app, plugin);
}

describe('cycle project inference', () => {
	it('opens the configured weekly note before an overlapping old cycle', () => {
		const service = createCycleService([
			{ path: 'journal/2026-Cycle-7.md', startDate: '2026-11-02', endDate: '2026-11-08' },
			{ path: 'journal/2026-Week-45.md', startDate: '', endDate: '' },
		], 'YYYY-[Week]-WW', 'journal');
		expect(service.findCycleNoteForDate('2026-11-06', getCycleDateRange('2026-11-06', 'monday', 1))?.path)
			.toBe('journal/2026-Week-45.md');
	});
	it('starts after the cycle containing today instead of the current week boundary', () => {
		const inferred = createCycleService([{
			path: 'Cycles/2026-Cycle-4.md', startDate: '2026-08-03', endDate: '2026-08-16',
		}]).inferNextCycle('2026-08-12');
		expect(inferred.range).toEqual({ startDate: '2026-08-17', endDate: '2026-08-30' });
		expect(inferred.previousProject?.path).toBe('Cycles/2026-Cycle-4.md');
	});

	it('advances beyond consecutive future ranges that would occupy the new start date', () => {
		const inferred = createCycleService([
			{ path: 'Cycles/2026-Cycle-4.md', startDate: '2026-08-03', endDate: '2026-08-16' },
			{ path: 'Cycles/2026-Cycle-5.md', startDate: '2026-08-17', endDate: '2026-08-30' },
			{ path: 'Cycles/2026-Cycle-6.md', startDate: '2026-08-31', endDate: '2026-09-13' },
		]).inferNextCycle('2026-08-12');
		expect(inferred.range).toEqual({ startDate: '2026-09-14', endDate: '2026-09-27' });
		expect(inferred.cycleNumber).toBe(7);
		expect(inferred.previousProject?.path).toBe('Cycles/2026-Cycle-6.md');
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
