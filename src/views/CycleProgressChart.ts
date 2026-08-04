import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { ProjectProgress } from '../progress/ProjectProgress';

use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

/** Owns an ECharts project-progress graph and releases canvas resources on disposal. */
export class CycleProgressChart {
	private readonly chart: ECharts;
	private readonly resizeObserver: ResizeObserver;

	constructor(container: HTMLElement, progress: ProjectProgress) {
		this.chart = init(container);
		this.chart.setOption(createCycleProgressOption(progress));
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
export function formatScopeValue(value: number, isDuration: boolean): string {
	if (!isDuration) return Number.isInteger(value) ? String(value) : value.toFixed(1);
	if (value < 60) return `${value}m`;
	const hours = value / 60;
	return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

/** Builds the Linear-inspired scope, started, completed, and ideal series. */
export function createCycleProgressOption(progress: ProjectProgress): EChartsCoreOption {
	return {
		animationDuration: 450,
		tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => formatScopeValue(Number(value), progress.scopeIsDuration) },
		grid: { left: 48, right: 16, top: 18, bottom: 36 },
		xAxis: {
			type: 'category',
			boundaryGap: false,
			data: progress.points.map((point) => point.date),
			axisLabel: { formatter: (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) },
		},
		yAxis: { type: 'value', min: 0, name: progress.scopeIsDuration ? 'Minutes' : 'Scope' },
		series: [
			{ name: 'Scope', type: 'line', symbol: 'none', lineStyle: { color: '#737373', width: 2 }, data: progress.points.map((point) => point.scope) },
			{ name: 'Ideal burndown', type: 'line', symbol: 'none', lineStyle: { color: '#8b8bff', type: 'dotted', width: 2 }, data: progress.points.map((point) => point.ideal) },
			{ name: 'Started', type: 'line', symbol: 'none', lineStyle: { color: '#f2c200', width: 2 }, areaStyle: { color: 'rgba(242, 194, 0, 0.12)' }, data: progress.points.map((point) => point.started) },
			{ name: 'Completed', type: 'line', symbol: 'none', lineStyle: { color: '#6c6cff', width: 2 }, data: progress.points.map((point) => point.completed) },
		],
	};
}
