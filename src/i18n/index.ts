import { I18nService } from './I18nService';
import { en } from './resources/en';
import { InterpolationValues, LeafPaths, TranslationResources } from './types';

export const translationResources = { en } satisfies TranslationResources;
export type TranslationKey = LeafPaths<typeof en>;
export type { InterpolationValues } from './types';

/** Creates the plugin localization service with English as its authoritative fallback. */
export function createI18nService(options?: { initialLocale?: string; getSystemLocale?: () => string }): I18nService {
	return new I18nService({
		resources: translationResources,
		defaultLocale: 'en',
		fallbackLocale: 'en',
		...options,
	});
}

/** Typed translation function signature shared by UI modules. */
export type Translate = (key: TranslationKey, params?: InterpolationValues) => string;
export { I18nService };
