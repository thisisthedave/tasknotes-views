import { LineChart } from 'echarts/charts';
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { I18nService } from '../i18n';
import { ProjectProgress } from '../progress/ProjectProgress';

use([LineChart, GridComponent, MarkLineComponent, TooltipComponent, CanvasRenderer]);

const SERIES_COLORS = {
	scope: '#22b8cf',
	target: '#a3a3a3',
	scheduled: '#737373',
	started: '#f2c200',
	completed: '#6c6cff',
} as const;

/** Truncates a numeric display value to at most one decimal place. */
function truncateOneDecimal(value: number): number {
	return Math.trunc(value * 10) / 10;
}

interface TooltipSeriesParameter {
	axisValue?: string;
	dataIndex?: number;
	marker?: string;
	seriesName?: string;
	value?: unknown;
}

/** Escapes task and series text before returning custom tooltip HTML. */
function escapeHtml(value: string): string {
	return value.replace(/[&<>'"]/g, (character) => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		"'": '&#39;',
		'"': '&quot;',
	}[character] ?? character));
}

/** Builds an axis tooltip that includes task events occurring on the hovered date. */
function formatProgressTooltip(parameters: unknown, progress: ProjectProgress, i18n: I18nService): string {
	if (!Array.isArray(parameters)) return '';
	const series = parameters as TooltipSeriesParameter[];
	const pointIndex = series[0]?.dataIndex;
	const point = pointIndex === undefined ? undefined : progress.points[pointIndex];
	const taskLists = new Map<string, string[]>([
		[i18n.translate('progress.chart.scheduledSeries'), point?.scheduledTasks ?? []],
		[i18n.translate('progress.chart.startedSeries'), point?.startedTasks ?? []],
		[i18n.translate('progress.chart.completedSeries'), point?.completedTasks ?? []],
	]);
	const rows = series.filter((parameter) => typeof parameter.value === 'number').map((parameter) => {
		const name = parameter.seriesName ?? '';
		const value = formatScopeValue(Number(parameter.value), progress.scopeIsDuration, i18n);
		const tasks = [...new Set(taskLists.get(name) ?? [])];
		const taskRows = tasks.map((task) => `<div style="margin-left:18px;color:#888">• ${escapeHtml(task)}</div>`).join('');
		return `<div>${parameter.marker ?? ''}${escapeHtml(name)}<span style="float:right;margin-left:24px;font-weight:600">${escapeHtml(value)}</span></div>${taskRows}`;
	});
	return `<div style="margin-bottom:4px">${escapeHtml(series[0]?.axisValue ?? '')}</div>${rows.join('')}`;
}

/** Returns an actual-progress series that stops after the current reporting date. */
export function getActualSeriesData(progress: ProjectProgress, property: 'started' | 'completed'): Array<number | null> {
	return progress.points.map((point) => point.date <= progress.today ? point[property] : null);
}

/** Owns an ECharts project-progress graph and releases canvas resources on disposal. */
export class CycleProgressChart {
	private readonly chart: ECharts;
	private readonly resizeObserver: ResizeObserver;

	constructor(container: HTMLElement, progress: ProjectProgress, i18n: I18nService) {
		this.chart = init(container);
		this.chart.setOption(createCycleProgressOption(progress, i18n));
		this.resizeObserver = new ResizeObserver(() => this.chart.resize());
		this.resizeObserver.observe(container);
	}

	/** Releases the observer and ECharts instance. */
	dispose(): void {
		this.resizeObserver.disconnect();
		this.chart.dispose();
	}
}

/** Formats scope either as a compact duration or as a unitless number. */
export function formatScopeValue(value: number, isDuration: boolean, i18n: I18nService): string {
	if (!isDuration) return String(truncateOneDecimal(value));
	if (value < 60) return i18n.translate('progress.units.minutes', { value: truncateOneDecimal(value) });
	const hours = value / 60;
	return i18n.translate('progress.units.hours', { value: truncateOneDecimal(hours) });
}

/** Builds the Linear-inspired scope, started, completed, and ideal series. */
export function createCycleProgressOption(progress: ProjectProgress, i18n: I18nService): EChartsCoreOption {
	const todayIsVisible = progress.today >= progress.startDate && progress.today <= progress.endDate;
	const currentDateLine = todayIsVisible ? {
		silent: true,
		symbol: 'none',
		label: { show: false },
		lineStyle: { color: '#8a8a8a', width: 1, type: 'solid' },
		data: [{ xAxis: progress.today }],
	} : undefined;
	return {
		animationDuration: 450,
		tooltip: { trigger: 'axis', formatter: (parameters: unknown) => formatProgressTooltip(parameters, progress, i18n) },
		grid: { left: 48, right: 16, top: 18, bottom: 36 },
		xAxis: {
			type: 'category',
			boundaryGap: false,
			data: progress.points.map((point) => point.date),
			axisLabel: { formatter: (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString(i18n.getCurrentLocale(), { month: 'short', day: 'numeric', timeZone: 'UTC' }) },
		},
		yAxis: { type: 'value', min: 0, name: i18n.translate(progress.scopeIsDuration ? 'progress.chart.minutesAxis' : 'progress.chart.scopeAxis') },
		series: [
			{ name: i18n.translate('progress.chart.scopeSeries'), type: 'line', symbol: 'none', itemStyle: { color: SERIES_COLORS.scope }, lineStyle: { color: SERIES_COLORS.scope, width: 2 }, markLine: currentDateLine, data: progress.points.map((point) => point.scope) },
			{ name: i18n.translate('progress.chart.targetSeries'), type: 'line', symbol: 'none', itemStyle: { color: SERIES_COLORS.target }, lineStyle: { color: SERIES_COLORS.target, type: 'dotted', width: 2 }, data: progress.points.map((point) => point.target) },
			{ name: i18n.translate('progress.chart.scheduledSeries'), type: 'line', symbol: 'none', itemStyle: { color: SERIES_COLORS.scheduled }, lineStyle: { color: SERIES_COLORS.scheduled, type: 'dotted', width: 1 }, data: progress.points.map((point) => point.scheduled) },
			{ name: i18n.translate('progress.chart.startedSeries'), type: 'line', symbol: 'none', connectNulls: false, itemStyle: { color: SERIES_COLORS.started }, lineStyle: { color: SERIES_COLORS.started, width: 2 }, areaStyle: { color: 'rgba(242, 194, 0, 0.12)' }, data: getActualSeriesData(progress, 'started') },
			{ name: i18n.translate('progress.chart.completedSeries'), type: 'line', symbol: 'none', connectNulls: false, itemStyle: { color: SERIES_COLORS.completed }, lineStyle: { color: SERIES_COLORS.completed, width: 2 }, areaStyle: { color: 'rgba(108, 108, 255, 0.2)' }, data: getActualSeriesData(progress, 'completed') },
		],
	};
}
