/**
 * Language flag and name helpers for the v2 surface.
 *
 * Thin adapters over the shared language SSOT (`packages/shared/utils/languages.ts`)
 * so the chat bubbles, orbs, media cards and post/status headers render the exact
 * same flag and native name as the rest of the app. Identifiers are resolved
 * through `normalizeLanguageCode` first (BCP-47 `fr-FR`, ISO 639-2/3 `swe`/`ger`,
 * supported 3-letter codes `bas`) before the SSOT lookup.
 *
 * This replaces a local 21-language `FLAG_MAP` / romanized-ASCII `LANGUAGE_NAMES`
 * that had diverged from the SSOT: 40+ supported languages fell back to the globe
 * on every bubble/card, and native names were accent-stripped (`Español` ->
 * `Espanol`, `日本語` -> `Nihongo`). `getLanguageInfo` covers 60+ languages and
 * returns a synthetic `flag: '🌐'` entry for unsupported codes, so the globe
 * fallback survives exactly where it should.
 */
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
import { getLanguageInfo } from '@meeshy/shared/utils/languages';

const GLOBE = '\u{1F310}';

export function getFlag(code: string | undefined | null): string {
  const normalized = normalizeLanguageCode(code);
  if (!normalized) return GLOBE;
  return getLanguageInfo(normalized).flag;
}

export function getLanguageName(code: string | undefined | null): string {
  const normalized = normalizeLanguageCode(code);
  if (!normalized) return code ? code.toUpperCase() : 'Unknown';
  const info = getLanguageInfo(normalized);
  return info.nativeName ?? info.name;
}
