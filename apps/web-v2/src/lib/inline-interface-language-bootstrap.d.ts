export declare const INTERFACE_LANGUAGE_KEY: string;
export declare const SUPPORTED_INTERFACE_LANGUAGES: readonly ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'];
export declare const DEFAULT_INTERFACE_LANGUAGE: 'fr';
export declare const INLINE_INTERFACE_LANGUAGE_BOOTSTRAP: string;
export declare function resolveInterfaceLanguageCode(stored: string | null, languages: readonly string[]): string;
