/**
 * La passerelle peut-elle demander cette langue au translator ? Vrai si et
 * seulement si NLLB-200 la connaît : `supportsTranslation` du catalogue, tenu
 * égal à `LANGUAGE_MAPPINGS` (`services/translator/src/config/settings.py`) par
 * `__tests__/server-translatable-language.test.ts`.
 *
 * Une langue offerte mais intraduisible (`byv`, `bas`, `dua`, `ewo`, `fan`,
 * `ksf`, `nnh` — #3659) ne se pousse jamais : son lecteur reçoit l'original
 * (règle 1 du Prisme). Incident prod 2026-11-01 : chaque message vers un
 * lecteur `byv` coûtait cinq pushes et un `translation:failed`.
 */
import { SUPPORTED_LANGUAGES } from './languages.js';

const SERVER_TRANSLATABLE: ReadonlySet<string> = new Set(
  SUPPORTED_LANGUAGES.filter((lang) => lang.supportsTranslation).map((lang) => lang.code)
);

export function isServerTranslatableLanguage(code: string | null | undefined): boolean {
  return !!code && SERVER_TRANSLATABLE.has(code.toLowerCase().trim());
}
