/**
 * Language flag mappings and utilities.
 * Extracted from MessageBubble for reuse across TranslationToggle, PostCard, etc.
 *
 * Language identifiers are resolved through the shared `normalizeLanguageCode`
 * SSOT rather than a blind `slice(0, 2)`: BCP-47 locales (`fr-FR`), ISO 639-2/3
 * codes (`swe`, `spa`, `jpn`) and 639-2/B bibliographic variants (`ger`, `dut`)
 * all map to their supported ISO 639-1 code before lookup. This closes the
 * silent-collision class the truncation created (`swe` -> `sw`, `spa` -> `sp`)
 * and keeps the badges consistent with the rest of the codebase.
 */
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';

const GLOBE = '\u{1F310}';

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
  no: '\u{1F1F3}\u{1F1F4}',
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
  no: 'Norsk',
};

export function getFlag(code: string | undefined | null): string {
  const normalized = normalizeLanguageCode(code);
  if (!normalized) return GLOBE;
  return FLAG_MAP[normalized] || GLOBE;
}

export function getLanguageName(code: string | undefined | null): string {
  const normalized = normalizeLanguageCode(code);
  if (!normalized) return code ? code.toUpperCase() : 'Unknown';
  return LANGUAGE_NAMES[normalized] || normalized.toUpperCase();
}
