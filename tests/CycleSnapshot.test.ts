import type { App, TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { getCompletedRecurringInstances, loadCycleSnapshotProgress } from '../src/cycles/CycleSnapshotService';
import type { ProjectProgress } from '../src/progress/ProjectProgress';

/** Creates the narrow metadata-cache behavior needed to exercise snapshot lookup. */
function createSnapshotApp(progress: unknown): App {
	const cycle = { path: 'Cycles/Cycle 1.md' } as TFile;
	const snapshot = { path: 'Cycles/Cycle snapshots/Cycle 1 snapshot.md' } as TFile;
	return {
		metadataCache: {
			getFileCache: (file: TFile) => file.path === cycle.path
				? { frontmatter: { cycleSnapshot: '[[Cycles/Cycle snapshots/Cycle 1 snapshot]]' } }
				: { frontmatter: { progress } },
			getFirstLinkpathDest: () => snapshot,
		},
	} as unknown as App;
}

describe('loadCycleSnapshotProgress', () => {
	it('returns valid immutable progress linked from a cycle note', () => {
		const progress: ProjectProgress = {
			projectName: 'Cycle 1',
			startDate: '2026-08-03',
			endDate: '2026-08-16',
			scope: 10,
			scheduled: 10,
			started: 5,
			completed: 2,
			today: '2026-08-17',
			scopeIsDuration: false,
			points: [],
		};
		const cycle = { path: 'Cycles/Cycle 1.md' } as TFile;
		expect(loadCycleSnapshotProgress(createSnapshotApp(progress), cycle)).toEqual(progress);
	});

	it('rejects malformed snapshot progress', () => {
		const cycle = { path: 'Cycles/Cycle 1.md' } as TFile;
		expect(loadCycleSnapshotProgress(createSnapshotApp({ scope: 'ten' }), cycle)).toBeNull();
	});
});

describe('getCompletedRecurringInstances', () => {
	it('preserves virtual and materialized recurring completion provenance', () => {
		const progress: ProjectProgress = {
			projectName: 'Cycle 1', startDate: '2026-08-03', endDate: '2026-08-16', scope: 10,
			scheduled: 10, started: 10, completed: 10, today: '2026-08-17', scopeIsDuration: false, points: [],
			workItems: [{
				name: 'Weekly review', scope: 10, taskPath: 'Tasks/Weekly review.md', recurring: true,
				recurrenceDate: '2026-08-10', completedDate: '2026-08-11',
			}, { name: 'Ordinary task', scope: 2, taskPath: 'Tasks/Ordinary.md', completedDate: '2026-08-11' }],
		};
		expect(getCompletedRecurringInstances(progress)).toEqual([{
			task: '[[Tasks/Weekly review]]',
			pathAtClose: 'Tasks/Weekly review.md',
			titleAtClose: 'Weekly review',
			occurrenceDate: '2026-08-10',
			completedDate: '2026-08-11',
			scopeAtClose: 10,
		}]);
	});
});
