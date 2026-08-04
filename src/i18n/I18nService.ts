import { Events } from 'obsidian';
import { I18nServiceOptions, InterpolationValues, LocaleChangeEvent, TranslationTree } from './types';

/** Flattens a nested translation tree into dotted lookup keys. */
function flattenTranslations(tree: TranslationTree, prefix = ''): Record<string, string> {
	const entries: Record<string, string> = {};
	for (const [key, value] of Object.entries(tree)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;
		if (typeof value === 'string') entries[fullKey] = value;
		else if (value && typeof value === 'object') Object.assign(entries, flattenTranslations(value, fullKey));
	}
	return entries;
}

/** Replaces named translation placeholders while preserving missing tokens. */
function interpolate(template: string, params?: InterpolationValues): string {
	if (!params) return template;
	return template.replace(/\{(\w+)\}/g, (_match, token: string) =>
		Object.prototype.hasOwnProperty.call(params, token) ? String(params[token]) : `{${token}}`);
}

/** Normalizes a locale such as en-US to its supported language code. */
function normalizeLocale(locale: string): string {
	return locale.toLowerCase().split('-')[0] ?? locale;
}

/** Resolves localized strings with system-locale selection, fallback, caching, and interpolation. */
export class I18nService extends Events {
	private readonly cache: Record<string, Record<string, string>> = {};
	private readonly fallbackLocale: string;
	private currentLocale: string;

	constructor(private readonly options: I18nServiceOptions) {
		super();
		this.fallbackLocale = options.fallbackLocale ?? 'en';
		this.currentLocale = this.resolveLocale(options.initialLocale ?? options.defaultLocale);
	}

	/** Returns the resolved active locale. */
	getCurrentLocale(): string {
		return this.currentLocale;
	}

	/** Changes locale and notifies mounted UI when the resolved locale differs. */
	setLocale(locale: string): void {
		const current = this.resolveLocale(locale);
		if (current === this.currentLocale) return;
		const event: LocaleChangeEvent = { previous: this.currentLocale, current };
		this.currentLocale = current;
		this.trigger('locale-changed', event);
	}

	/** Translates a dotted resource key and interpolates named values. */
	translate(key: string, params?: InterpolationValues): string {
		const locales = [this.currentLocale, this.fallbackLocale, this.options.defaultLocale];
		for (const locale of locales) {
			const value = this.getLocaleMap(locale)[key];
			if (value !== undefined) return interpolate(value, params);
		}
		return key;
	}

	/** Returns and caches the flattened resource for one locale. */
	private getLocaleMap(locale: string): Record<string, string> {
		const normalized = normalizeLocale(locale);
		if (!this.cache[normalized]) {
			const resource = this.options.resources[normalized];
			this.cache[normalized] = resource ? flattenTranslations(resource) : {};
		}
		return this.cache[normalized];
	}

	/** Resolves system and unsupported locale requests to an available resource. */
	private resolveLocale(locale: string): string {
		const requested = locale === 'system' ? this.options.getSystemLocale?.() ?? this.options.defaultLocale : locale;
		const normalized = normalizeLocale(requested);
		if (this.options.resources[normalized]) return normalized;
		if (this.options.resources[this.options.defaultLocale]) return this.options.defaultLocale;
		return Object.keys(this.options.resources)[0] ?? this.fallbackLocale;
	}
}
