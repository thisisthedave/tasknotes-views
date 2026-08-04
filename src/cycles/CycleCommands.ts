import { moment, Notice, TFile } from 'obsidian';
import TaskNotesViewsPlugin from '../main';
import { isTaskNotesProject } from '../tasknotes/TaskNotesProjectDetector';
import { getCycleNumber, withCycleNumber } from './CycleNaming';
import { CycleProjectService } from './CycleProjectService';
import { CycleRolloverService } from './CycleRolloverService';
import { CycleSnapshotService } from './CycleSnapshotService';
import { getNextCycleDateRange } from './CycleSchedule';
import { chooseProject, ProjectSuggestion } from './ProjectSuggestModal';

/** Registers user-invoked cycle creation and close commands. */
export function registerCycleCommands(plugin: TaskNotesViewsPlugin): void {
	const projects = new CycleProjectService(plugin.app, plugin);
	const rollover = new CycleRolloverService(plugin.app);
	const snapshots = new CycleSnapshotService(plugin.app, plugin);

	plugin.addCommand({
		id: 'create-cycle',
		name: 'Create cycle',
		callback: async () => {
			try {
				const inferred = projects.inferNextCycle();
				const created = await projects.createCycle(inferred);
				let moved = 0;
				if (plugin.settings.cycleTaskRollover && inferred.previousProject) {
					await snapshots.closeCycle(inferred.previousProject, 'automatic-rollover');
					moved = await rollover.rollover(inferred.previousProject, created);
				}
				new Notice(moved > 0 ? `Created ${created.basename} and rolled over ${moved} tasks.` : `Created ${created.basename}.`);
			} catch (error) {
				console.error('[TaskNotes Views] Could not create cycle', error);
				new Notice('Could not create cycle. Check the console for details.');
			}
		},
	});

	plugin.addCommand({
		id: 'rollover-cycle-tasks',
		name: 'Close cycle',
		callback: async () => {
			try {
				await runCloseCycleCommand(plugin, projects, rollover, snapshots);
			} catch (error) {
				console.error('[TaskNotes Views] Could not close cycle', error);
				new Notice('Could not close cycle. Check the console for details.');
			}
		},
	});
}

/** Runs the two-project close flow, snapshots history, and moves eligible work forward. */
async function runCloseCycleCommand(
	plugin: TaskNotesViewsPlugin,
	projects: CycleProjectService,
	rollover: CycleRolloverService,
	snapshots: CycleSnapshotService,
): Promise<void> {
	const inferred = projects.inferNextCycle();
	const active = plugin.app.workspace.getActiveFile();
	const activeRole = getActiveProjectRole(plugin, active);
	const previousFromActiveNext = activeRole === 'next' ? getFile(plugin, inferAdjacentPath(active, -1) ?? '') : null;
	const previousGuess = activeRole === 'previous' ? active : previousFromActiveNext ?? inferred.previousProject;
	const nextPathGuess = inferAdjacentPath(activeRole === 'previous' ? active : inferred.previousProject, 1) ??
		projects.getCyclePath(inferred.range, inferred.cycleNumber);
	const nextGuess = activeRole === 'next' ? active : getFile(plugin, nextPathGuess);
	const cyclePaths = new Set(projects.listCycleFiles().map((file) => file.path));
	const projectFiles = plugin.app.vault.getMarkdownFiles().filter((file) =>
		cyclePaths.has(file.path) || isTaskNotesProject(plugin.app, file));

	const previous = await chooseProject(
		plugin.app,
		orderedSuggestions(projectFiles, previousGuess),
		previousGuess ? `Previous cycle (suggested: ${previousGuess.path})` : 'Select previous cycle',
	);
	if (!previous?.file) return;

	const prospectivePath = nextGuess?.path ?? nextPathGuess;
	const nextItems = orderedSuggestions(projectFiles, nextGuess);
	if (!nextGuess) nextItems.unshift({ label: prospectivePath, file: null, createPath: prospectivePath });
	const next = await chooseProject(
		plugin.app,
		nextItems,
		`New cycle (suggested: ${prospectivePath})`,
	);
	if (!next) return;

	const newProject = next.file ?? await createAdjacentCycle(plugin, projects, previous.file, next.createPath ?? prospectivePath);
	await snapshots.closeCycle(previous.file, 'manual-close');
	const count = await rollover.rollover(previous.file, newProject);
	new Notice(`Closed ${previous.file.basename} and rolled over ${count} task${count === 1 ? '' : 's'} to ${newProject.basename}.`);
}

/** Classifies the active project using its configured end date and the local calendar day. */
function getActiveProjectRole(plugin: TaskNotesViewsPlugin, file: TFile | null): 'previous' | 'next' | null {
	if (!file || !isTaskNotesProject(plugin.app, file)) return null;
	const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	const endDate = String(frontmatter?.[plugin.settings.projectEndProperty] ?? '');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return null;
	return endDate < moment().format('YYYY-MM-DD') ? 'previous' : 'next';
}

/** Places the inferred project first while retaining fuzzy access to every known project. */
function orderedSuggestions(files: TFile[], suggested: TFile | null): ProjectSuggestion[] {
	const ordered = suggested ? [suggested, ...files.filter((file) => file.path !== suggested.path)] : files;
	return ordered.map((file) => ({ label: file.path, file }));
}

/** Infers an adjacent cycle filename using the required final -N sequence convention. */
function inferAdjacentPath(file: TFile | null, offset: number): string | null {
	const current = file ? getCycleNumber(file.path) : null;
	return file && current ? withCycleNumber(file.path, current + offset) : null;
}

/** Resolves a prospective Markdown path without accepting folders or other file types. */
function getFile(plugin: TaskNotesViewsPlugin, path: string): TFile | null {
	const file = plugin.app.vault.getAbstractFileByPath(path.endsWith('.md') ? path : `${path}.md`);
	return file instanceof TFile ? file : null;
}

/** Creates a requested adjacent destination with dates following the selected previous cycle. */
async function createAdjacentCycle(
	plugin: TaskNotesViewsPlugin,
	projects: CycleProjectService,
	previous: TFile,
	requestedPath: string,
): Promise<TFile> {
	const frontmatter = plugin.app.metadataCache.getFileCache(previous)?.frontmatter;
	const startDate = String(frontmatter?.[plugin.settings.projectStartProperty] ?? '');
	const endDate = String(frontmatter?.[plugin.settings.projectEndProperty] ?? '');
	const number = getCycleNumber(requestedPath) ?? projects.inferNextCycle().cycleNumber;
	const range = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate)
		? getNextCycleDateRange({ startDate, endDate }, plugin.settings.cycleDurationWeeks)
		: projects.inferNextCycle().range;
	// Creation is deliberately non-recursive: this command owns the one explicit rollover operation.
	return projects.createCycle({ range, cycleNumber: number });
}
