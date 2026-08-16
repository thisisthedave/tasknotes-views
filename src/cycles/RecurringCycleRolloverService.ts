import { generateRecurringInstances } from '@tasknotes/model/recurrence';
import { App, Modal, Setting, TFile } from 'obsidian';
import type TaskNotesViewsPlugin from '../main';
import { getWritableTaskNotesApi, TaskNotesEventPayload, TaskNotesTask } from '../tasknotes/TaskNotesApi';
import { CycleProjectService } from './CycleProjectService';
import { isDateInCycleRange } from './CycleSchedule';
import { CycleSnapshotService } from './CycleSnapshotService';

type RecurringCycleDecision = 'keep' | 'remove' | 'rollover';

/** Watches recurring completions and gives users control of the parent task after its final cycle occurrence. */
export class RecurringCycleRolloverService {
	private readonly projects: CycleProjectService;
	private readonly snapshots: CycleSnapshotService;

	constructor(private readonly app: App, private readonly plugin: TaskNotesViewsPlugin) {
		this.projects = new CycleProjectService(app, plugin);
		this.snapshots = new CycleSnapshotService(app, plugin);
	}

	/** Handles only newly completed recurring instances that finish a currently assigned cycle window. */
	async handleCompletion(payload: TaskNotesEventPayload): Promise<void> {
		if (!this.plugin.settings.recurringTaskRollover) return;
		const task = payload.after ?? payload.task;
		if (!task?.recurrence) return;
		const occurrenceDate = this.getNewCompletionDate(payload.before, task);
		if (!occurrenceDate) return;
		for (const cycle of this.getAssignedCycles(task, occurrenceDate)) {
			if (!this.isFinalCycleOccurrence(task, cycle, occurrenceDate)) continue;
			const nextOccurrence = this.getNextOccurrence(task, occurrenceDate);
			if (!nextOccurrence) continue;
			const destination = this.projects.getCycleDestinationForDate(nextOccurrence, cycle);
			const decision = await promptForRecurringCycleDecision(this.app, this.plugin, task, cycle, destination.name, destination.file === null);
			if (decision === 'keep') continue;
			// Persist occurrence history before assignment changes so an active graph retains completed work.
			await this.snapshots.snapshotRecurringTaskRemoval(cycle, task);
			if (decision === 'remove') await this.removeFromCycle(task, cycle);
			else await this.moveToCycle(task, cycle, destination.file ?? await this.projects.createCycle({ range: destination.range, cycleNumber: destination.cycleNumber }));
		}
	}

	/** Finds cycle projects linked from the completed parent and containing that occurrence date. */
	private getAssignedCycles(task: TaskNotesTask, occurrenceDate: string): TFile[] {
		return this.projects.listCycleFiles().filter((cycle) => {
			const frontmatter = this.app.metadataCache.getFileCache(cycle)?.frontmatter;
			const startDate = String(frontmatter?.[this.plugin.settings.projectStartProperty] ?? '');
			const endDate = String(frontmatter?.[this.plugin.settings.projectEndProperty] ?? '');
			return /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate) &&
				isDateInCycleRange(occurrenceDate, { startDate, endDate }) && this.referencesCycle(task, cycle);
		});
	}

	/** Determines whether the event added a new instance completion, avoiding prompts after unrelated task edits. */
	private getNewCompletionDate(before: TaskNotesTask | undefined, after: TaskNotesTask): string | null {
		const previous = new Set(before?.complete_instances ?? []);
		return (after.complete_instances ?? []).find((date) => !previous.has(date)) ?? null;
	}

	/** Tests whether the newly completed occurrence is the last recurrence scheduled inside this cycle. */
	private isFinalCycleOccurrence(task: TaskNotesTask, cycle: TFile, occurrenceDate: string): boolean {
		const frontmatter = this.app.metadataCache.getFileCache(cycle)?.frontmatter;
		const startDate = String(frontmatter?.[this.plugin.settings.projectStartProperty] ?? '');
		const endDate = String(frontmatter?.[this.plugin.settings.projectEndProperty] ?? '');
		const occurrences = generateRecurringInstances(task, new Date(`${startDate}T00:00:00Z`), new Date(`${endDate}T23:59:59Z`));
		const finalDate = occurrences.at(-1)?.toISOString().slice(0, 10);
		return Boolean(finalDate && occurrenceDate >= finalDate);
	}

	/** Finds the first recurrence after the completed cycle occurrence within a deliberately generous future horizon. */
	private getNextOccurrence(task: TaskNotesTask, occurrenceDate: string): string | null {
		const start = new Date(`${occurrenceDate}T00:00:00Z`);
		start.setUTCDate(start.getUTCDate() + 1);
		const end = new Date(start);
		end.setUTCFullYear(end.getUTCFullYear() + 10);
		return generateRecurringInstances(task, start, end)[0]?.toISOString().slice(0, 10) ?? null;
	}

	/** Removes one cycle link while preserving every unrelated project relationship. */
	private async removeFromCycle(task: TaskNotesTask, cycle: TFile): Promise<void> {
		const api = getWritableTaskNotesApi(this.app);
		if (!api) throw new Error('TaskNotes task-write support is unavailable.');
		await api.tasks.update(task.path, { projects: (task.projects ?? []).filter((project) => !this.referencesCycleLink(project, task.path, cycle)) });
	}

	/** Replaces one cycle link with the destination without duplicating existing relationships. */
	private async moveToCycle(task: TaskNotesTask, previous: TFile, next: TFile): Promise<void> {
		const api = getWritableTaskNotesApi(this.app);
		if (!api) throw new Error('TaskNotes task-write support is unavailable.');
		const nextLink = `[[${next.path.replace(/\.md$/i, '')}]]`;
		await api.tasks.update(task.path, { projects: [...new Set((task.projects ?? []).map((project) =>
			this.referencesCycleLink(project, task.path, previous) ? nextLink : project))] });
	}

	/** Resolves a task project link against a cycle file. */
	private referencesCycle(task: TaskNotesTask, cycle: TFile): boolean {
		return (task.projects ?? []).some((project) => this.referencesCycleLink(project, task.path, cycle));
	}

	/** Resolves aliases and headings before comparing a link to the exact cycle file. */
	private referencesCycleLink(link: string, sourcePath: string, cycle: TFile): boolean {
		const linkpath = link.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0]?.split('#')[0]?.trim();
		return Boolean(linkpath && this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath)?.path === cycle.path);
	}
}

/** Requests an explicit lifecycle decision and previews whether rollover must create a cycle note. */
function promptForRecurringCycleDecision(app: App, plugin: TaskNotesViewsPlugin, task: TaskNotesTask, cycle: TFile, destinationName: string, createsCycle: boolean): Promise<RecurringCycleDecision> {
	return new Promise((resolve) => new RecurringCycleRolloverModal(app, plugin, task, cycle, destinationName, createsCycle, resolve).open());
}

/** Presents keep, remove, and rollover choices after the final recurring occurrence in a cycle. */
class RecurringCycleRolloverModal extends Modal {
	private decision: RecurringCycleDecision | null = null;

	constructor(app: App, private readonly plugin: TaskNotesViewsPlugin, private readonly task: TaskNotesTask, private readonly cycle: TFile, private readonly destinationName: string, private readonly createsCycle: boolean, private readonly resolve: (decision: RecurringCycleDecision) => void) { super(app); }

	/** Renders the explicit parent-task assignment choices. */
	onOpen(): void {
		const t = this.plugin.i18n.translate.bind(this.plugin.i18n);
		this.setTitle(t('cycles.recurringRollover.title'));
		this.contentEl.createEl('p', { text: t('cycles.recurringRollover.description', { taskName: this.task.title ?? this.task.path, cycleName: this.cycle.basename }) });
		this.contentEl.createEl('p', { text: t('cycles.recurringRollover.destination', { cycleName: this.destinationName, creation: t(this.createsCycle ? 'cycles.recurringRollover.createsCycle' : 'cycles.recurringRollover.existingCycle') }) });
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText(t('cycles.recurringRollover.keep')).onClick(() => this.choose('keep')))
			.addButton((button) => button.setButtonText(t('cycles.recurringRollover.remove')).onClick(() => this.choose('remove')))
			.addButton((button) => button.setButtonText(t('cycles.recurringRollover.rollover')).setCta().onClick(() => this.choose('rollover')));
	}

	/** Treats dismissal as keeping the current assignment. */
	onClose(): void { this.contentEl.empty(); this.resolve(this.decision ?? 'keep'); }

	/** Stores the selected lifecycle action before closing the modal. */
	private choose(decision: RecurringCycleDecision): void { this.decision = decision; this.close(); }
}
