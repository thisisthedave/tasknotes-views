import moment from 'moment';

export { moment };

/** Provides the slash normalization needed by cycle naming tests. */
export function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\//, '').replace(/\/$/, '');
}
