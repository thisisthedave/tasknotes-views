import type { App, TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { loadCycleSnapshotProgress } from '../src/cycles/CycleSnapshotService';
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
