import { App, TFile } from 'obsidian';
import { getWritableTaskNotesApi, TaskNotesTask } from '../tasknotes/TaskNotesApi';

/** Reassigns eligible TaskNotes work while preserving unrelated project memberships. */
export class CycleRolloverService {
	constructor(private readonly app: App) {}

	/** Moves incomplete, non-skipped tasks from one cycle project to another idempotently. */
	async rollover(previousProject: TFile, newProject: TFile): Promise<number> {
		const api = getWritableTaskNotesApi(this.app);
		if (!api) throw new Error('TaskNotes task-write support is unavailable.');
		const previousLink = this.toProjectLink(previousProject);
		const newLink = this.toProjectLink(newProject);
		const { tasks } = await api.query.tasks({
				where: { field: 'task.projects', op: 'contains', value: previousLink },
				scope: { includeArchived: false },
			});
		const statuses = api.catalog.statuses();
		const excludedStatuses = new Set(statuses.filter((status) => status.isCompleted || status.isSkipped).map((status) => status.value));
		const eligible = tasks.filter((task) => !excludedStatuses.has(task.status));
		let updated = 0;
		for (const task of eligible) {
			const projects = this.replaceProject(task, previousProject, newLink);
			if (!projects) continue;
			await api.tasks.update(task.path, { projects });
			updated += 1;
		}
		return updated;
	}

	/** Converts a project file to TaskNotes' canonical vault-relative wikilink form. */
	private toProjectLink(file: TFile): string {
		return `[[${file.path.replace(/\.md$/i, '')}]]`;
	}

	/** Replaces all aliases of the source project and deduplicates the resulting project list. */
	private replaceProject(task: TaskNotesTask, previousProject: TFile, newLink: string): string[] | null {
		const projects = Array.isArray(task.projects) ? task.projects : [];
		let matched = false;
		const replaced = projects.map((project) => {
			if (!this.referencesProject(project, task.path, previousProject)) return project;
			matched = true;
			return newLink;
		});
		return matched ? [...new Set(replaced)] : null;
	}

	/** Resolves wikilink aliases and headings before comparing project identity. */
	private referencesProject(project: string, sourcePath: string, expected: TFile): boolean {
		const linkpath = project.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0]?.split('#')[0]?.trim();
		if (!linkpath) return false;
		return this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath)?.path === expected.path;
	}
}
