import moment from 'moment';

export { moment };

/** Supplies the path fields cycle tests use while preserving runtime instance checks. */
export class TFile {
	constructor(public path = '') {}

	get basename(): string {
		return this.path.split('/').at(-1)?.replace(/\.md$/i, '') ?? '';
	}
}

/** Provides the slash normalization needed by cycle naming tests. */
export function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\//, '').replace(/\/$/, '');
}
