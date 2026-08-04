import { App, moment, normalizePath, stringifyYaml, TFile } from 'obsidian';
import type TaskNotesViewsPlugin from '../main';
import { loadLiveProjectProgress, ProjectProgress } from '../progress/ProjectProgress';
import { getTaskNotesApi, TaskNotesTask } from '../tasknotes/TaskNotesApi';

const SNAPSHOT_SCHEMA_VERSION = 1;

/** Narrows Obsidian's loosely typed frontmatter cache to safe property access. */
function getFrontmatter(app: App, file: TFile): Record<string, unknown> | undefined {
	const value: unknown = app.metadataCache.getFileCache(file)?.frontmatter;
	return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

interface CycleSnapshotTask {
	task: string;
	pathAtClose: string;
	titleAtClose: string;
	statusAtClose: string;
	scopeAtClose: unknown;
	scheduledAtClose: unknown;
	startedAtClose: unknown;
	dueAtClose: unknown;
	completedAtClose: unknown;
}

/** Captures immutable cycle membership and chart data before rollover mutates task projects. */
export class CycleSnapshotService {
	constructor(private readonly app: App, private readonly plugin: TaskNotesViewsPlugin) {}

	/** Marks a cycle closed and optionally creates its first immutable progress snapshot. */
	async closeCycle(cycle: TFile, captureReason: 'manual-close' | 'automatic-rollover'): Promise<TFile | null> {
		const existingClosedAt = getFrontmatter(this.app, cycle)?.cycleClosedAt;
		const closedAt = typeof existingClosedAt === 'string' ? existingClosedAt : moment().format();
		let snapshot = this.resolveExistingSnapshot(cycle);
		if (this.plugin.settings.snapshotCycleProgressOnClose && !snapshot) {
			snapshot = await this.createSnapshot(cycle, closedAt, captureReason);
		}
		await this.app.fileManager.processFrontMatter(cycle, (frontmatter) => {
			const properties = frontmatter as Record<string, unknown>;
			properties.cycleStatus = 'closed';
			properties.cycleClosedAt = closedAt;
			if (snapshot) properties.cycleSnapshot = this.toWikilink(snapshot);
		});
		return snapshot;
	}

	/** Creates a companion Markdown note containing versioned task facts and precomputed progress points. */
	private async createSnapshot(cycle: TFile, capturedAt: string, captureReason: string): Promise<TFile> {
		const progress = await loadLiveProjectProgress(this.app, cycle, this.plugin.settings);
		if (!progress) throw new Error(`Could not calculate progress for ${cycle.path} before closing it.`);
		const tasks = await this.loadProjectTasks(cycle);
		const path = this.getAvailableSnapshotPath(cycle);
		await this.ensureSnapshotFolder(path);
		const body = this.buildSnapshotBody(cycle, capturedAt, tasks);
		const cycleFrontmatter = getFrontmatter(this.app, cycle);
		const properties: Record<string, unknown> = {
			type: 'cycle-snapshot',
			schemaVersion: SNAPSHOT_SCHEMA_VERSION,
			cycle: this.toWikilink(cycle),
			scheduledStart: cycleFrontmatter?.[this.plugin.settings.projectStartProperty] ?? progress.startDate,
			scheduledEnd: cycleFrontmatter?.[this.plugin.settings.projectEndProperty] ?? progress.endDate,
			capturedAt,
			captureReason,
			tasks: tasks.map((task) => this.snapshotTask(task)),
			progress,
		};
		// Frontmatter must be part of the initial write because Obsidian may not cache a newly created file immediately.
		const content = `---\n${stringifyYaml(properties).trimEnd()}\n---\n\n${body}`;
		return this.app.vault.create(path, content);
	}

	/** Loads the tasks assigned at close through the same public query contract as the graph. */
	private async loadProjectTasks(cycle: TFile): Promise<TaskNotesTask[]> {
		const api = getTaskNotesApi(this.app);
		if (!api) throw new Error('TaskNotes task reads are unavailable.');
		const result = await api.query.tasks({
			where: { field: 'task.projects', op: 'contains', value: this.toWikilink(cycle) },
			scope: { includeArchived: false },
		});
		return result.tasks;
	}

	/** Freezes the task fields that affect membership, labels, scope, and chart dates. */
	private snapshotTask(task: TaskNotesTask): CycleSnapshotTask {
		return {
			task: `[[${task.path.replace(/\.md$/i, '')}]]`,
			pathAtClose: task.path,
			titleAtClose: task.title?.trim() || task.path.replace(/\.md$/i, '').split('/').at(-1) || task.path,
			statusAtClose: task.status,
			scopeAtClose: this.getTaskProperty(task, this.plugin.settings.scopeProperty),
			scheduledAtClose: this.getTaskProperty(task, this.plugin.settings.taskScheduledProperty),
			startedAtClose: this.getTaskProperty(task, this.plugin.settings.taskStartProperty),
			dueAtClose: task.due,
			completedAtClose: task.completedDate,
		};
	}

	/** Reads a normalized core field before falling back to TaskNotes custom properties. */
	private getTaskProperty(task: TaskNotesTask, property: string): unknown {
		return task[property] !== undefined ? task[property] : task.customProperties?.[property];
	}

	/** Writes a readable linked membership list beneath the structured snapshot frontmatter. */
	private buildSnapshotBody(cycle: TFile, capturedAt: string, tasks: TaskNotesTask[]): string {
		const taskRows = tasks.map((task) => {
			const title = task.title?.trim() || task.path.replace(/\.md$/i, '').split('/').at(-1) || task.path;
			return `- [[${task.path.replace(/\.md$/i, '')}|${title}]] — ${task.status}`;
		});
		return `# ${cycle.basename} snapshot\n\nCaptured ${capturedAt}.\n\n## Tasks at close\n\n${taskRows.join('\n') || '_No tasks were assigned at close._'}\n`;
	}

	/** Resolves the linked snapshot already recorded on the cycle, if any. */
	private resolveExistingSnapshot(cycle: TFile): TFile | null {
		const value = getFrontmatter(this.app, cycle)?.cycleSnapshot;
		if (typeof value !== 'string') return null;
		const linkpath = value.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0]?.trim();
		return linkpath ? this.app.metadataCache.getFirstLinkpathDest(linkpath, cycle.path) : null;
	}

	/** Chooses a non-destructive snapshot filename beside the cycle project. */
	private getAvailableSnapshotPath(cycle: TFile): string {
		const parent = cycle.parent?.path;
		const folder = normalizePath(`${parent && parent !== '/' ? `${parent}/` : ''}Cycle snapshots`);
		const base = `${folder}/${cycle.basename} snapshot`;
		let path = `${base}.md`;
		let suffix = 2;
		while (this.app.vault.getAbstractFileByPath(path)) {
			path = `${base} ${suffix}.md`;
			suffix += 1;
		}
		return path;
	}

	/** Creates the snapshot directory when it does not already exist. */
	private async ensureSnapshotFolder(path: string): Promise<void> {
		const folder = path.split('/').slice(0, -1).join('/');
		if (!folder || this.app.vault.getFolderByPath(folder)) return;
		try {
			await this.app.vault.createFolder(folder);
		} catch (error) {
			// A concurrent vault refresh or close command may create the folder after the initial check.
			if (!this.app.vault.getFolderByPath(folder)) throw error;
		}
	}

	/** Converts a Markdown file into a vault-relative wikilink. */
	private toWikilink(file: TFile): string {
		return `[[${file.path.replace(/\.md$/i, '')}]]`;
	}
}

/** Reads and validates the precomputed progress payload linked from a closed cycle. */
export function loadCycleSnapshotProgress(app: App, cycle: TFile): ProjectProgress | null {
	const snapshotValue = getFrontmatter(app, cycle)?.cycleSnapshot;
	if (typeof snapshotValue !== 'string') return null;
	const linkpath = snapshotValue.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0]?.trim();
	const snapshot = linkpath ? app.metadataCache.getFirstLinkpathDest(linkpath, cycle.path) : null;
	if (!snapshot) return null;
	const progress: unknown = getFrontmatter(app, snapshot)?.progress;
	if (!progress || typeof progress !== 'object') return null;
	const candidate = progress as Partial<ProjectProgress>;
	if (typeof candidate.projectName !== 'string' || typeof candidate.startDate !== 'string' ||
		typeof candidate.endDate !== 'string' || typeof candidate.scope !== 'number' || !Array.isArray(candidate.points)) return null;
	return candidate as ProjectProgress;
}
