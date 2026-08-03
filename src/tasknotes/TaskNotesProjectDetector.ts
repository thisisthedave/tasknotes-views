import { App, CachedMetadata, parseFrontMatterTags, TFile } from 'obsidian';

interface ProjectAutosuggestSettings {
	requiredTags?: string[];
	propertyKey?: string;
	propertyValue?: string;
}

interface TaskNotesPluginShape {
	dependencyCache?: { isFileUsedAsProject(path: string): boolean };
	settings?: { projectAutosuggest?: ProjectAutosuggestSettings };
}

/** Returns the enabled TaskNotes plugin through the narrow internal surface needed for project detection. */
function getTaskNotesPlugin(app: App): TaskNotesPluginShape | null {
	const plugins = (app as App & { plugins?: { getPlugin(id: string): unknown } }).plugins;
	const plugin = plugins?.getPlugin('tasknotes');
	return plugin && typeof plugin === 'object' ? plugin : null;
}

/** Normalizes native and frontmatter tags into TaskNotes-compatible tag names without leading hashes. */
function collectTags(metadata: CachedMetadata | null): string[] {
	const tags = new Set<string>();
	for (const entry of metadata?.tags ?? []) tags.add(entry.tag.replace(/^#/, ''));
	for (const tag of parseFrontMatterTags(metadata?.frontmatter) ?? []) tags.add(tag.replace(/^#/, ''));
	return [...tags];
}

/** Tests a tag against TaskNotes' hierarchical tag convention. */
function matchesHierarchicalTag(tag: string, pattern: string): boolean {
	const normalizedTag = tag.replace(/^#/, '').toLowerCase();
	const normalizedPattern = pattern.replace(/^#/, '').toLowerCase();
	return normalizedTag === normalizedPattern || normalizedTag.startsWith(`${normalizedPattern}/`);
}

/** Applies TaskNotes' positive and negative project autosuggest tag markers. */
function matchesRequiredTags(tags: string[], conditions: string[]): boolean {
	const exclusions = conditions.filter((tag) => tag.startsWith('-')).map((tag) => tag.slice(1));
	if (exclusions.some((pattern) => tags.some((tag) => matchesHierarchicalTag(tag, pattern)))) return false;
	const inclusions = conditions.filter((tag) => !tag.startsWith('-'));
	return inclusions.length > 0 && inclusions.some((pattern) => tags.some((tag) => matchesHierarchicalTag(tag, pattern)));
}

/** Applies TaskNotes' configured project property marker to cached frontmatter. */
function matchesProperty(frontmatter: Record<string, unknown> | undefined, settings: ProjectAutosuggestSettings): boolean {
	const key = settings.propertyKey?.trim();
	if (!key || !frontmatter || !(key in frontmatter)) return false;
	const actual = frontmatter[key];
	const expected = settings.propertyValue?.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean) ?? [];
	if (expected.length === 0) return actual !== null && actual !== undefined;
	const values = Array.isArray(actual) ? actual : [actual];
	return values.some((value) => expected.includes(String(value).trim().toLowerCase()));
}

/** Detects project notes using the same project index and autosuggest markers as TaskNotes relationships. */
export function isTaskNotesProject(app: App, file: TFile): boolean {
	const taskNotes = getTaskNotesPlugin(app);
	if (!taskNotes) return false;

	// This is the detection fulcrum: prefer TaskNotes' canonical relationship index, then mirror its configured marker fallback.
	if (taskNotes.dependencyCache?.isFileUsedAsProject(file.path)) return true;
	const autosuggest = taskNotes.settings?.projectAutosuggest;
	if (!autosuggest) return false;
	const metadata = app.metadataCache.getFileCache(file);
	return matchesRequiredTags(collectTags(metadata), autosuggest.requiredTags ?? []) ||
		matchesProperty(metadata?.frontmatter, autosuggest);
}
