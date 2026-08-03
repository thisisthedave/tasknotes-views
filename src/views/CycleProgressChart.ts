import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

/** Owns an ECharts cycle-progress demo and releases canvas/window resources on disposal. */
export class CycleProgressChart {
	private readonly chart: ECharts;
	private readonly resizeObserver: ResizeObserver;

	constructor(container: HTMLElement) {
		this.chart = init(container);
		this.chart.setOption(createSillyCycleOption());
		this.resizeObserver = new ResizeObserver(() => this.chart.resize());
		this.resizeObserver.observe(container);
	}

	/** Releases the observer and ECharts instance. */
	dispose(): void {
		this.resizeObserver.disconnect();
		this.chart.dispose();
	}
}

/** Builds dummy burndown-like data for the fictional Moon Cheese Launch cycle. */
export function createSillyCycleOption(): EChartsCoreOption {
	return {
		animationDuration: 450,
		color: ['#8b5cf6', '#22c55e', '#94a3b8'],
		legend: { top: 0, textStyle: { color: '#888' } },
		tooltip: { trigger: 'axis' },
		grid: { left: 42, right: 18, top: 44, bottom: 30 },
		xAxis: { type: 'category', boundaryGap: false, data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
		yAxis: { type: 'value', name: 'Cheese points', min: 0, max: 42 },
		series: [
			{ name: 'Ideal rind-down', type: 'line', symbol: 'none', lineStyle: { type: 'dashed' }, data: [42, 35, 28, 21, 14, 7, 0] },
			{ name: 'Cheese remaining', type: 'line', smooth: 0.25, data: [42, 39, 33, 34, 22, 13, 5] },
			{ name: 'Moon mice discovered', type: 'line', smooth: 0.25, data: [2, 4, 9, 12, 18, 27, 38] },
		],
	};
}
