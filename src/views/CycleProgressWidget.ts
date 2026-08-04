import { TFile } from 'obsidian';
import type TaskNotesViewsPlugin from '../main';
import { loadProjectProgress, ProjectProgress } from '../progress/ProjectProgress';
import { getTaskNotesApi } from '../tasknotes/TaskNotesApi';
import { CycleProgressChart, formatScopeValue } from './CycleProgressChart';

export const CYCLE_PROGRESS_CLASS = 'tasknotes-views-cycle-progress';

/** Adds one Linear-style metric to the chart summary. */
function renderMetric(container: HTMLElement, label: string, value: number, total: number, modifier: string, isDuration: boolean): void {
	const metric = container.createDiv({ cls: `tasknotes-views-cycle-progress__metric is-${modifier}` });
	metric.createDiv({ cls: 'tasknotes-views-cycle-progress__metric-label', text: label });
	const valueElement = metric.createDiv({ cls: 'tasknotes-views-cycle-progress__metric-value' });
	valueElement.createSpan({ text: formatScopeValue(value, isDuration) });
	if (label !== 'Scope') valueElement.createSpan({ cls: 'tasknotes-views-cycle-progress__percent', text: ` · ${total > 0 ? Math.round(value / total * 100) : 0}%` });
}

/** Renders loaded project progress into an existing widget shell. */
function renderProgress(element: HTMLElement, progress: ProjectProgress): CycleProgressChart {
	element.empty();
	const heading = element.createDiv({ cls: 'tasknotes-views-cycle-progress__heading' });
	heading.createEl('h3', { text: `${progress.projectName} Progress` });
	heading.createSpan({ text: `${progress.startDate} – ${progress.endDate}` });
	const metrics = element.createDiv({ cls: 'tasknotes-views-cycle-progress__metrics' });
	renderMetric(metrics, 'Scope', progress.scope, progress.scope, 'scope', progress.scopeIsDuration);
	renderMetric(metrics, 'Started', progress.started, progress.scope, 'started', progress.scopeIsDuration);
	renderMetric(metrics, 'Completed', progress.completed, progress.scope, 'completed', progress.scopeIsDuration);
	const chartElement = element.createDiv({ cls: 'tasknotes-views-cycle-progress__chart' });
	return new CycleProgressChart(chartElement, progress);
}

/** Creates an asynchronously populated project progress widget with explicit cleanup. */
export function createCycleProgressWidget(plugin: TaskNotesViewsPlugin, file: TFile, document: Document): { element: HTMLElement; dispose(): void } {
	const element = document.createElement('section');
	element.className = CYCLE_PROGRESS_CLASS;
	element.setAttribute('contenteditable', 'false');
	element.createDiv({ cls: 'tasknotes-views-cycle-progress__loading', text: 'Loading project progress…' });
	let chart: CycleProgressChart | null = null;
	let disposed = false;
	let refreshTimer: number | null = null;
	const api = getTaskNotesApi(plugin.app);

	/** Reloads indexed project tasks and replaces the rendered chart atomically. */
	const refresh = async (): Promise<void> => {
		try {
			const progress = await loadProjectProgress(plugin.app, file, plugin.settings);
			if (disposed) return;
			chart?.dispose();
			chart = null;
			if (!progress) {
				element.empty();
				element.createDiv({ cls: 'tasknotes-views-cycle-progress__empty', text: 'Add valid scheduled and due dates to show project progress.' });
				return;
			}
			chart = renderProgress(element, progress);
		} catch (error) {
			console.error('[TaskNotes Views] Could not load project progress', {
				projectPath: file.path,
				error,
			});
			if (!disposed) element.setText('Could not load project progress.');
		}
	};
	/** Coalesces bursts of TaskNotes events into one indexed reload. */
	const scheduleRefresh = (): void => {
		if (refreshTimer !== null) window.clearTimeout(refreshTimer);
		refreshTimer = window.setTimeout(() => {
			refreshTimer = null;
			void refresh();
		}, 100);
	};

	// TaskNotes owns project query semantics; event-driven reloads keep the chart current without vault scans.
	const eventRefs = api?.events ? [
		api.events.on('task.updated', scheduleRefresh),
		api.events.on('settings.changed', scheduleRefresh),
	] : [];
	const settingsRef = plugin.onSettingsChanged(scheduleRefresh);
	void refresh();

	return {
		element,
		dispose: () => {
			disposed = true;
			if (refreshTimer !== null) window.clearTimeout(refreshTimer);
			for (const ref of eventRefs) api?.events?.off(ref);
			plugin.offSettingsChanged(settingsRef);
			chart?.dispose();
		},
	};
}
