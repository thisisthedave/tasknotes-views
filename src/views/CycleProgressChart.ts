import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { I18nService } from '../i18n';
import { ProjectProgress } from '../progress/ProjectProgress';

use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

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
	if (!isDuration) return Number.isInteger(value) ? String(value) : value.toFixed(1);
	if (value < 60) return i18n.translate('progress.units.minutes', { value });
	const hours = value / 60;
	return i18n.translate('progress.units.hours', { value: Number.isInteger(hours) ? hours : hours.toFixed(1) });
}

/** Builds the Linear-inspired scope, started, completed, and ideal series. */
export function createCycleProgressOption(progress: ProjectProgress, i18n: I18nService): EChartsCoreOption {
	return {
		animationDuration: 450,
		tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => formatScopeValue(Number(value), progress.scopeIsDuration, i18n) },
		grid: { left: 48, right: 16, top: 18, bottom: 36 },
		xAxis: {
			type: 'category',
			boundaryGap: false,
			data: progress.points.map((point) => point.date),
			axisLabel: { formatter: (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString(i18n.getCurrentLocale(), { month: 'short', day: 'numeric', timeZone: 'UTC' }) },
		},
		yAxis: { type: 'value', min: 0, name: i18n.translate(progress.scopeIsDuration ? 'progress.chart.minutesAxis' : 'progress.chart.scopeAxis') },
		series: [
			{ name: i18n.translate('progress.chart.scopeSeries'), type: 'line', symbol: 'none', lineStyle: { color: '#737373', width: 2 }, data: progress.points.map((point) => point.scope) },
			{ name: i18n.translate('progress.chart.idealSeries'), type: 'line', symbol: 'none', lineStyle: { color: '#8b8bff', type: 'dotted', width: 2 }, data: progress.points.map((point) => point.ideal) },
			{ name: i18n.translate('progress.chart.startedSeries'), type: 'line', symbol: 'none', lineStyle: { color: '#f2c200', width: 2 }, areaStyle: { color: 'rgba(242, 194, 0, 0.12)' }, data: progress.points.map((point) => point.started) },
			{ name: i18n.translate('progress.chart.completedSeries'), type: 'line', symbol: 'none', lineStyle: { color: '#6c6cff', width: 2 }, data: progress.points.map((point) => point.completed) },
		],
	};
}
