import { CycleProgressChart } from './CycleProgressChart';

export const CYCLE_PROGRESS_CLASS = 'tasknotes-views-cycle-progress';

/** Creates the project progress widget and returns an explicit cleanup callback. */
export function createCycleProgressWidget(document: Document): { element: HTMLElement; dispose(): void } {
	const element = document.createElement('section');
	element.className = CYCLE_PROGRESS_CLASS;
	element.setAttribute('contenteditable', 'false');
	const heading = element.createDiv({ cls: 'tasknotes-views-cycle-progress__heading' });
	heading.createEl('h3', { text: 'Moon cheese launch' });
	heading.createSpan({ text: 'Cycle progress · definitely real data' });
	const chartElement = element.createDiv({ cls: 'tasknotes-views-cycle-progress__chart' });

	// ECharts needs a mounted, explicitly sized host; the widget stylesheet supplies its stable height.
	const chart = new CycleProgressChart(chartElement);
	return { element, dispose: () => chart.dispose() };
}
