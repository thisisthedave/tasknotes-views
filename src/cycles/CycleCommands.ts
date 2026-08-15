import { App, Modal, moment as obsidianMoment, Notice, Setting, TFile } from 'obsidian';
import type Moment from 'moment';
import TaskNotesViewsPlugin from '../main';
import type { Translate } from '../i18n';
import { isTaskNotesProject } from '../tasknotes/TaskNotesProjectDetector';
import { getCycleNumber, withCycleNumber } from './CycleNaming';
import { CycleProjectService } from './CycleProjectService';
import { CycleRolloverService } from './CycleRolloverService';
import { CycleSnapshotService } from './CycleSnapshotService';
import { CycleDateRange, getCycleDateRange, getNextCycleDateRange } from './CycleSchedule';
import { chooseProject, ProjectSuggestion } from './ProjectSuggestModal';

// Obsidian exposes Moment at runtime; this explicit type preserves the safe API boundary for ESLint.
const moment: typeof Moment = obsidianMoment;

/** Registers user-invoked cycle creation and close commands. */
export function registerCycleCommands(plugin: TaskNotesViewsPlugin): void {
	const translate = plugin.i18n.translate.bind(plugin.i18n);
	const projects = new CycleProjectService(plugin.app, plugin);
	const rollover = new CycleRolloverService(plugin.app);
	const snapshots = new CycleSnapshotService(plugin.app, plugin);

	plugin.addCommand({
		id: 'create-cycle',
		name: translate('cycles.commands.create'),
		callback: async () => {
			try {
				const inferred = projects.inferNextCycle();
				const created = await projects.createCycle(inferred);
				let moved = 0;
				if (plugin.settings.cycleTaskRollover && inferred.previousProject &&
					await promptToConfirmRollover(plugin, inferred.previousProject, created)) {
					await snapshots.closeCycle(inferred.previousProject, 'automatic-rollover');
					moved = await rollover.rollover(inferred.previousProject, created);
				}
				new Notice(moved > 0
					? translate('cycles.notices.createdAndRolledOver', { cycleName: created.basename, count: moved, taskLabel: translate('cycles.notices.tasks') })
					: translate('cycles.notices.created', { cycleName: created.basename }));
			} catch (error) {
				console.error('[TaskNotes Views] Could not create cycle', error);
				new Notice(translate('cycles.notices.createError'));
			}
		},
	});

	plugin.addCommand({
		id: 'open-cycle-note',
		name: translate('cycles.commands.open'),
		callback: async () => {
			try {
				const today = moment().format('YYYY-MM-DD');
				const range = getCycleDateRange(
					today,
					plugin.settings.cycleStartDay,
					plugin.settings.cycleDurationWeeks,
				);
				const existing = projects.findCycleContainingDate(today);
				if (existing) {
					await plugin.app.workspace.getLeaf(false).openFile(existing);
					return;
				}

				// The confirmation makes note creation explicit while keeping the command a one-step open for existing cycles.
				if (await promptToCreateCycle(plugin.app, range, translate)) await projects.createCycle({ range });
			} catch (error) {
				console.error('[TaskNotes Views] Could not open cycle note', error);
				new Notice(translate('cycles.notices.openError'));
			}
		},
	});

	plugin.addCommand({
		id: 'rollover-cycle-tasks',
		name: translate('cycles.commands.close'),
		callback: async () => {
			try {
				await runCloseCycleCommand(plugin, projects, rollover, snapshots);
			} catch (error) {
				console.error('[TaskNotes Views] Could not close cycle', error);
				new Notice(translate('cycles.notices.closeError'));
			}
		},
	});
}

/** Prompts for consent before moving incomplete tasks to a newly created cycle. */
function promptToConfirmRollover(plugin: TaskNotesViewsPlugin, previous: TFile, next: TFile): Promise<boolean> {
	return new Promise((resolve) => new CycleRolloverConfirmModal(plugin.app, plugin.i18n.translate.bind(plugin.i18n), previous, next, resolve).open());
}

/** Collects explicit rollover consent without treating a dismissed prompt as approval. */
class CycleRolloverConfirmModal extends Modal {
	private decision: boolean | null = null;

	constructor(
		app: App,
		private readonly translate: Translate,
		private readonly previous: TFile,
		private readonly next: TFile,
		private readonly resolve: (decision: boolean) => void,
	) {
		super(app);
	}

	/** Renders the task-move confirmation after the destination cycle has been created. */
	onOpen(): void {
		this.setTitle(this.translate('cycles.rolloverConfirm.title'));
		this.contentEl.createEl('p', { text: this.translate('cycles.rolloverConfirm.description', {
			previous: this.previous.basename,
			next: this.next.basename,
		}) });
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText(this.translate('cycles.rolloverConfirm.cancel')).onClick(() => this.choose(false)))
			.addButton((button) => button.setButtonText(this.translate('cycles.rolloverConfirm.confirm')).setCta().onClick(() => this.choose(true)));
	}

	/** Resolves the pending prompt when Obsidian closes it by any interaction. */
	onClose(): void {
		this.contentEl.empty();
		this.resolve(this.decision ?? false);
	}

	/** Records the explicit button choice before closing the modal. */
	private choose(decision: boolean): void {
		this.decision = decision;
		this.close();
	}
}

/** Prompts the user before creating the cycle note that is scheduled for today. */
function promptToCreateCycle(app: App, range: CycleDateRange, translate: Translate): Promise<boolean> {
	return new Promise((resolve) => new CycleCreateConfirmModal(app, range, translate, resolve).open());
}

/** Collects a creation decision without treating a dismissed confirmation as approval. */
class CycleCreateConfirmModal extends Modal {
	private decision: boolean | null = null;

	constructor(
		app: App,
		private readonly range: CycleDateRange,
		private readonly translate: Translate,
		private readonly resolve: (decision: boolean) => void,
	) {
		super(app);
	}

	/** Renders the creation prompt for the date range that has no existing cycle note. */
	onOpen(): void {
		this.setTitle(this.translate('cycles.createConfirm.title'));
		this.contentEl.createEl('p', { text: this.translate('cycles.createConfirm.description', {
			startDate: this.range.startDate,
			endDate: this.range.endDate,
		}) });
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText(this.translate('cycles.createConfirm.cancel')).onClick(() => this.choose(false)))
			.addButton((button) => button.setButtonText(this.translate('cycles.createConfirm.confirm')).setCta().onClick(() => this.choose(true)));
	}

	/** Resolves the pending prompt when Obsidian closes it by any interaction. */
	onClose(): void {
		this.contentEl.empty();
		this.resolve(this.decision ?? false);
	}

	/** Records the explicit button choice before closing the modal. */
	private choose(decision: boolean): void {
		this.decision = decision;
		this.close();
	}
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
		previousGuess
			? plugin.i18n.translate('cycles.projectPicker.previousSuggested', { path: previousGuess.path })
			: plugin.i18n.translate('cycles.projectPicker.previous'),
		plugin.i18n.translate.bind(plugin.i18n),
	);
	if (!previous?.file) return;

	const prospectivePath = nextGuess?.path ?? nextPathGuess;
	const nextItems = orderedSuggestions(projectFiles, nextGuess);
	if (!nextGuess) nextItems.unshift({ label: prospectivePath, file: null, createPath: prospectivePath });
	const next = await chooseProject(
		plugin.app,
		nextItems,
		plugin.i18n.translate('cycles.projectPicker.nextSuggested', { path: prospectivePath }),
		plugin.i18n.translate.bind(plugin.i18n),
	);
	if (!next) return;

	const newProject = next.file ?? await createAdjacentCycle(plugin, projects, previous.file, next.createPath ?? prospectivePath);
	await snapshots.closeCycle(previous.file, 'manual-close');
	const count = await rollover.rollover(previous.file, newProject);
	new Notice(plugin.i18n.translate('cycles.notices.closedAndRolledOver', {
		previousName: previous.file.basename,
		count,
		taskLabel: plugin.i18n.translate(count === 1 ? 'cycles.notices.task' : 'cycles.notices.tasks'),
		nextName: newProject.basename,
	}));
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
