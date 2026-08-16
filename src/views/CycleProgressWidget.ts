import { moment, TFile } from 'obsidian';
import type TaskNotesViewsPlugin from '../main';
import { loadCycleSnapshotProgress, loadCycleSnapshotRecurringCompletions } from '../cycles/CycleSnapshotService';
import { loadLiveProjectProgress, mergeCycleSnapshotRecurringProgress, ProjectProgress } from '../progress/ProjectProgress';
import { getTaskNotesApi } from '../tasknotes/TaskNotesApi';
import { CycleProgressChart, formatScopeValue } from './CycleProgressChart';

export const CYCLE_PROGRESS_CLASS = 'tasknotes-views-cycle-progress';
let capacityTooltipSequence = 0;

/** Adds one Linear-style metric to the chart summary. */
function renderMetric(container: HTMLElement, label: string, value: number, total: number, modifier: string, isDuration: boolean, showPercent: boolean, plugin: TaskNotesViewsPlugin): void {
	const metric = container.createDiv({ cls: `tasknotes-views-cycle-progress__metric is-${modifier}` });
	metric.createDiv({ cls: 'tasknotes-views-cycle-progress__metric-label', text: label });
	const valueElement = metric.createDiv({ cls: 'tasknotes-views-cycle-progress__metric-value' });
	valueElement.createSpan({ text: formatScopeValue(value, isDuration, plugin.i18n) });
	if (showPercent) valueElement.createSpan({ cls: 'tasknotes-views-cycle-progress__percent', text: ` · ${total > 0 ? Math.round(value / total * 100) : 0}%` });
}

/** Renders scope alone or alongside velocity-derived capacity and utilization. */
function renderScopeMetric(container: HTMLElement, progress: ProjectProgress, plugin: TaskNotesViewsPlugin): void {
	const estimatedCapacity = progress.estimatedCapacity;
	const capacityAvailable = typeof estimatedCapacity === 'number';
	const metric = container.createDiv({ cls: 'tasknotes-views-cycle-progress__metric is-scope' });
	const label = metric.createDiv({
		cls: 'tasknotes-views-cycle-progress__metric-label',
		text: plugin.i18n.translate(capacityAvailable ? 'progress.metrics.scopeCapacity' : 'progress.metrics.scope'),
	});
	const calculation = progress.capacityCalculation;
	if (capacityAvailable && calculation) {
		// The heading is the least intrusive place to expose how historical velocity was scaled into capacity.
		const summary = plugin.i18n.translate('progress.capacityCalculation', {
			completionCount: calculation.completionCount,
			historyStart: calculation.historyStart,
			historyEnd: calculation.historyEnd,
			weeklyVelocity: formatScopeValue(calculation.weeklyVelocity, progress.scopeIsDuration, plugin.i18n),
			projectDays: calculation.projectDays,
			daysPerWeek: calculation.daysPerWeek,
			capacity: formatScopeValue(calculation.capacity, progress.scopeIsDuration, plugin.i18n),
		});
		const tooltipId = `tasknotes-views-capacity-tooltip-${capacityTooltipSequence += 1}`;
		label.addClass('has-capacity-tooltip');
		label.setAttribute('tabindex', '0');
		label.setAttribute('aria-describedby', tooltipId);
		label.setAttribute('title', summary);
		metric.createDiv({
			cls: 'tasknotes-views-cycle-progress__capacity-tooltip',
			attr: { id: tooltipId, role: 'tooltip' },
			text: summary,
		});
	}
	const valueElement = metric.createDiv({ cls: 'tasknotes-views-cycle-progress__metric-value' });
	const scope = formatScopeValue(progress.scope, progress.scopeIsDuration, plugin.i18n);
	if (!capacityAvailable) {
		valueElement.setText(scope);
	} else if (typeof estimatedCapacity === 'number') {
		const capacity = formatScopeValue(estimatedCapacity, progress.scopeIsDuration, plugin.i18n);
		const utilization = estimatedCapacity > 0 ? Math.round(progress.scope / estimatedCapacity * 100) : 0;
		valueElement.setText(`${scope} / ${capacity} (${utilization}%)`);
	}
}

/** Renders loaded project progress into an existing widget shell. */
function renderProgress(element: HTMLElement, progress: ProjectProgress, plugin: TaskNotesViewsPlugin): CycleProgressChart {
	element.empty();
	const heading = element.createDiv({ cls: 'tasknotes-views-cycle-progress__heading' });
	const headingTitle = heading.createDiv({ cls: 'tasknotes-views-cycle-progress__heading-title' });
	headingTitle.createEl('h3', { text: plugin.i18n.translate('progress.title', { projectName: progress.projectName }) });
	if (progress.estimatedCapacity === null) {
		// A failed estimate remains visually equivalent to disabled capacity while explaining why it was omitted.
		headingTitle.createDiv({
			cls: 'tasknotes-views-cycle-progress__capacity-notice',
			text: plugin.i18n.translate('progress.insufficientCapacityData'),
		});
	}
	heading.createSpan({ text: plugin.i18n.translate('progress.dateRange', { startDate: progress.startDate, endDate: progress.endDate }) });
	const metrics = element.createDiv({ cls: 'tasknotes-views-cycle-progress__metrics' });
	renderScopeMetric(metrics, progress, plugin);
	renderMetric(metrics, plugin.i18n.translate('progress.metrics.scheduled'), progress.scheduled, progress.scope, 'scheduled', progress.scopeIsDuration, true, plugin);
	renderMetric(metrics, plugin.i18n.translate('progress.metrics.started'), progress.started, progress.scope, 'started', progress.scopeIsDuration, true, plugin);
	renderMetric(metrics, plugin.i18n.translate('progress.metrics.completed'), progress.completed, progress.scope, 'completed', progress.scopeIsDuration, true, plugin);
	const chartElement = element.createDiv({ cls: 'tasknotes-views-cycle-progress__chart' });
	return new CycleProgressChart(chartElement, progress, plugin.i18n);
}

/** Creates an asynchronously populated project progress widget with explicit cleanup. */
export function createCycleProgressWidget(plugin: TaskNotesViewsPlugin, file: TFile, document: Document): { element: HTMLElement; dispose(): void } {
	// A document-owned fragment lets Obsidian's helper create a detached element for the correct window.
	const element = document.createDocumentFragment().createEl('section');
	element.className = CYCLE_PROGRESS_CLASS;
	element.setAttribute('contenteditable', 'false');
	element.createDiv({ cls: 'tasknotes-views-cycle-progress__loading', text: plugin.i18n.translate('progress.loading') });
	let chart: CycleProgressChart | null = null;
	let disposed = false;
	let refreshTimer: number | null = null;
	const api = getTaskNotesApi(plugin.app);

	/** Reloads indexed project tasks and replaces the rendered chart atomically. */
	const refresh = async (): Promise<void> => {
		try {
			const snapshotProgress = loadCycleSnapshotProgress(plugin.app, file);
			const today = moment().format('YYYY-MM-DD');
			// Closed windows stay immutable; an active window combines removed parent history with live assignments.
			const useSnapshot = snapshotProgress && (today < snapshotProgress.startDate || today > snapshotProgress.endDate);
			const liveProgress = useSnapshot ? null : await loadLiveProjectProgress(plugin.app, file, plugin.settings);
			const progress = useSnapshot ? snapshotProgress : liveProgress && mergeCycleSnapshotRecurringProgress(
				liveProgress,
				loadCycleSnapshotRecurringCompletions(plugin.app, file),
				plugin.settings.countWeekends,
			);
			if (disposed) return;
			chart?.dispose();
			chart = null;
			if (!progress) {
				element.empty();
				element.createDiv({
					cls: 'tasknotes-views-cycle-progress__empty',
					text: plugin.i18n.translate('progress.missingDates', {
						startProperty: plugin.settings.projectStartProperty,
						endProperty: plugin.settings.projectEndProperty,
					}),
				});
				return;
			}
			chart = renderProgress(element, progress, plugin);
		} catch (error) {
			console.error('[TaskNotes Views] Could not load project progress', {
				projectPath: file.path,
				error,
			});
			if (!disposed) element.setText(plugin.i18n.translate('progress.loadError'));
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
	const localeRef = plugin.i18n.on('locale-changed', scheduleRefresh);
	void refresh();

	return {
		element,
		dispose: () => {
			disposed = true;
			if (refreshTimer !== null) window.clearTimeout(refreshTimer);
			for (const ref of eventRefs) api?.events?.off(ref);
			plugin.offSettingsChanged(settingsRef);
			plugin.i18n.offref(localeRef);
			chart?.dispose();
		},
	};
}
