import { App, moment as obsidianMoment, normalizePath, TFile } from 'obsidian';
import type Moment from 'moment';
import TaskNotesViewsPlugin from '../main';
import { getTaskNotesApi } from '../tasknotes/TaskNotesApi';
import { getCycleNumber, renderCycleRelativePath } from './CycleNaming';
import { CycleDateRange, getCycleDateRange, getNextCycleDateRange, isDateInCycleRange } from './CycleSchedule';

// Obsidian exposes Moment at runtime; this explicit type preserves the safe API boundary for ESLint.
const moment: typeof Moment = obsidianMoment;

interface TemplaterPluginShape {
	templater?: { overwrite_file_commands(file: TFile): Promise<void> };
}

export interface CreateCycleOptions {
	range?: CycleDateRange;
	cycleNumber?: number;
}

/** Owns cycle path inference and note creation while keeping command orchestration small. */
export class CycleProjectService {
	constructor(private readonly app: App, private readonly plugin: TaskNotesViewsPlugin) {}

	/** Returns the explicit cycle folder or inherits TaskNotes' public default task folder snapshot. */
	getCycleFolder(): string {
		const configured = this.plugin.settings.cycleProjectFolder.trim();
		if (configured) return normalizePath(configured);
		const api = getTaskNotesApi(this.app);
		const inherited = api?.hasCapability('settings.snapshot') ? api.settings?.snapshot().tasksFolder?.trim() : '';
		return inherited ? normalizePath(inherited) : '';
	}

	/** Lists cycle-like Markdown files under the configured root. */
	listCycleFiles(): TFile[] {
		const folder = this.getCycleFolder();
		return this.app.vault.getMarkdownFiles().filter((file) =>
			(!folder || file.path.startsWith(`${folder}/`)) && getCycleNumber(file.path) !== null);
	}

	/** Finds the existing cycle whose configured project dates inclusively contain an ISO calendar date. */
	findCycleContainingDate(date: string): TFile | null {
		return this.listCycleFiles().find((file) => {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			const startDate = String(frontmatter?.[this.plugin.settings.projectStartProperty] ?? '');
			const endDate = String(frontmatter?.[this.plugin.settings.projectEndProperty] ?? '');
			return /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate) &&
				isDateInCycleRange(date, { startDate, endDate });
		}) ?? null;
	}

	/** Infers the next scheduled range and annual counter from existing cycle metadata. */
	inferNextCycle(today = moment().format('YYYY-MM-DD')): { range: CycleDateRange; cycleNumber: number; previousProject: TFile | null } {
		const baseRange = getCycleDateRange(today, this.plugin.settings.cycleStartDay, this.plugin.settings.cycleDurationWeeks);
		const datedCycles = this.listCycleFiles().map((file) => {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			const startDate = String(frontmatter?.[this.plugin.settings.projectStartProperty] ?? '');
			const endDate = String(frontmatter?.[this.plugin.settings.projectEndProperty] ?? '');
			return { file, startDate, endDate, cycleNumber: getCycleNumber(file.path) ?? 0 };
		}).filter((cycle) => /^\d{4}-\d{2}-\d{2}$/.test(cycle.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(cycle.endDate))
			.sort((left, right) => left.startDate.localeCompare(right.startDate));
		const latest = datedCycles.at(-1);
		const range = latest && latest.startDate >= baseRange.startDate
			? getNextCycleDateRange({ startDate: latest.startDate, endDate: latest.endDate }, this.plugin.settings.cycleDurationWeeks)
			: baseRange;
		const sameYear = latest?.startDate.slice(0, 4) === range.startDate.slice(0, 4);
		return { range, cycleNumber: sameYear ? (latest?.cycleNumber ?? 0) + 1 : 1, previousProject: latest?.file ?? null };
	}

	/** Builds the vault-relative Markdown path for a scheduled cycle. */
	getCyclePath(range: CycleDateRange, cycleNumber: number): string {
		const relative = renderCycleRelativePath(this.plugin.settings.cycleNameFormat, range.startDate, cycleNumber).replace(/\.md$/i, '');
		const folder = this.getCycleFolder();
		return normalizePath(`${folder ? `${folder}/` : ''}${relative}.md`);
	}

	/** Creates a cycle note, optionally runs Templater, and authoritatively stamps its project dates. */
	async createCycle(options: CreateCycleOptions = {}): Promise<TFile> {
		const inferred = this.inferNextCycle();
		const range = options.range ?? inferred.range;
		const cycleNumber = options.cycleNumber ?? inferred.cycleNumber;
		const path = this.getCyclePath(range, cycleNumber);
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) return existing;

		await this.ensureParentFolders(path);
		const templateContent = await this.readTemplateForTemplater();
		const file = await this.app.vault.create(path, templateContent);
		if (templateContent) await this.runTemplater(file);

		// Cycle dates are stamped after template expansion so a template cannot silently override the schedule.
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			const properties = frontmatter as Record<string, unknown>;
			properties[this.plugin.settings.projectStartProperty] = range.startDate;
			properties[this.plugin.settings.projectEndProperty] = range.endDate;
		});
		await this.app.workspace.getLeaf(false).openFile(file);
		return file;
	}

	/** Creates every missing directory segment for a prospective cycle note. */
	private async ensureParentFolders(path: string): Promise<void> {
		const segments = path.split('/').slice(0, -1);
		for (let index = 1; index <= segments.length; index += 1) {
			const folder = segments.slice(0, index).join('/');
			if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
		}
	}

	/** Reads the configured template only when Templater can actually process it. */
	private async readTemplateForTemplater(): Promise<string> {
		const path = normalizePath(this.plugin.settings.cycleProjectTemplate.trim());
		if (!path || !this.getTemplater()) return '';
		const file = this.app.vault.getAbstractFileByPath(path.endsWith('.md') ? path : `${path}.md`);
		return file instanceof TFile ? this.app.vault.read(file) : '';
	}

	/** Applies Templater's guarded cross-plugin file processor when installed. */
	private async runTemplater(file: TFile): Promise<void> {
		await this.getTemplater()?.templater?.overwrite_file_commands(file);
	}

	/** Resolves Templater without making it a required dependency. */
	private getTemplater(): TemplaterPluginShape | null {
		const plugins = (this.app as App & { plugins?: { getPlugin(id: string): unknown } }).plugins;
		const candidate = plugins?.getPlugin('templater-obsidian');
		if (!candidate || typeof candidate !== 'object') return null;
		const templater = (candidate as TemplaterPluginShape).templater;
		return typeof templater?.overwrite_file_commands === 'function' ? candidate : null;
	}
}
