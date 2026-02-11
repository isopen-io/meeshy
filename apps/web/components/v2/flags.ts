/**
 * Language flag mappings and utilities.
 * Extracted from MessageBubble for reuse across TranslationToggle, PostCard, etc.
 */

export const FLAG_MAP: Record<string, string> = {
  fr: '\u{1F1EB}\u{1F1F7}',
  en: '\u{1F1EC}\u{1F1E7}',
  es: '\u{1F1EA}\u{1F1F8}',
  zh: '\u{1F1E8}\u{1F1F3}',
  ja: '\u{1F1EF}\u{1F1F5}',
  ar: '\u{1F1F8}\u{1F1E6}',
  de: '\u{1F1E9}\u{1F1EA}',
  pt: '\u{1F1E7}\u{1F1F7}',
  ko: '\u{1F1F0}\u{1F1F7}',
  it: '\u{1F1EE}\u{1F1F9}',
  ru: '\u{1F1F7}\u{1F1FA}',
  hi: '\u{1F1EE}\u{1F1F3}',
  nl: '\u{1F1F3}\u{1F1F1}',
  pl: '\u{1F1F5}\u{1F1F1}',
  tr: '\u{1F1F9}\u{1F1F7}',
  vi: '\u{1F1FB}\u{1F1F3}',
  th: '\u{1F1F9}\u{1F1ED}',
  id: '\u{1F1EE}\u{1F1E9}',
  sv: '\u{1F1F8}\u{1F1EA}',
  uk: '\u{1F1FA}\u{1F1E6}',
};

export const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'Francais',
  en: 'English',
  es: 'Espanol',
  zh: 'Zhongwen',
  ja: 'Nihongo',
  ar: 'Arabiya',
  de: 'Deutsch',
  pt: 'Portugues',
  ko: 'Hangugeo',
  it: 'Italiano',
  ru: 'Russkiy',
  hi: 'Hindi',
  nl: 'Nederlands',
  pl: 'Polski',
  tr: 'Turkce',
  vi: 'Tieng Viet',
  th: 'Thai',
  id: 'Bahasa',
  sv: 'Svenska',
  uk: 'Ukrainska',
};

export function getFlag(code: string | undefined | null): string {
  if (!code) return '\u{1F310}';
  const normalized = code.toLowerCase().slice(0, 2);
  return FLAG_MAP[normalized] || '\u{1F310}';
}

export function getLanguageName(code: string | undefined | null): string {
  if (!code) return 'Unknown';
  const normalized = code.toLowerCase().slice(0, 2);
  return LANGUAGE_NAMES[normalized] || code.toUpperCase();
}
