import { moment as obsidianMoment, normalizePath } from 'obsidian';
import type Moment from 'moment';

// Obsidian exposes Moment at runtime; this explicit type preserves the safe API boundary for ESLint.
const moment: typeof Moment = obsidianMoment;

const COUNTER_SENTINEL = '__TASKNOTES_VIEWS_CYCLE__';

/** Renders Moment-compatible date tokens plus the plugin's unambiguous {cycle} sequence token. */
export function renderCycleRelativePath(format: string, startDate: string, cycleNumber: number): string {
	const withSentinel = format.replaceAll('{cycle}', `[${COUNTER_SENTINEL}]`);
	const rendered = moment(startDate, 'YYYY-MM-DD', true).format(withSentinel);
	return normalizePath(rendered.replaceAll(COUNTER_SENTINEL, String(cycleNumber)));
}

/** Extracts the final numeric cycle suffix used to infer adjacent cycle names. */
export function getCycleNumber(path: string): number | null {
	const match = path.replace(/\.md$/i, '').match(/-(\d+)$/);
	if (!match?.[1]) return null;
	const value = Number.parseInt(match[1], 10);
	return Number.isFinite(value) && value > 0 ? value : null;
}

/** Replaces a cycle's final numeric suffix while preserving the rest of its path. */
export function withCycleNumber(path: string, cycleNumber: number): string | null {
	if (cycleNumber < 1 || !/-(\d+)(?:\.md)?$/i.test(path)) return null;
	return path.replace(/-(\d+)(?=\.md$|$)/i, `-${cycleNumber}`);
}
