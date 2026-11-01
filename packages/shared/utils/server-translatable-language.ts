/**
 * La passerelle peut-elle demander cette langue au translator ? Vrai si et
 * seulement si NLLB-200 la connaît, c'est-à-dire si `LANGUAGE_MAPPINGS`
 * (`services/translator/src/config/settings.py`) lui donne un code. Les deux
 * ensembles sont tenus ÉGAUX, dans les deux sens, par
 * `__tests__/server-translatable-language.test.ts`.
 *
 * Deux sources composent l'ensemble : `supportsTranslation` du catalogue, et
 * les langues que NLLB-200 sert sans être offertes au choix du produit
 * (`ts`, `bem`, `tn`, `st`, `nso`). Leur lecteur y arrive par la locale de
 * son appareil (`tn-ZA` → `tn`) et recevait ses traductions avant ce filtre ;
 * les entrer au catalogue les ferait apparaître dans chaque sélecteur de
 * langue, ce qui est une décision produit, pas un correctif.
 *
 * Une langue offerte mais intraduisible (`byv`, `bas`, `dua`, `ewo`, `fan`,
 * `ksf`, `nnh` — #3659) ne se pousse jamais : son lecteur reçoit l'original
 * (règle 1 du Prisme). Incident prod 2026-11-01 : chaque message vers un
 * lecteur `byv` coûtait cinq pushes et un `translation:failed`.
 */
import { SUPPORTED_LANGUAGES } from './languages.js';

const NLLB_SERVED_OUTSIDE_CATALOGUE = ['ts', 'bem', 'tn', 'st', 'nso'] as const;

const SERVER_TRANSLATABLE: ReadonlySet<string> = new Set([
  ...SUPPORTED_LANGUAGES.filter((lang) => lang.supportsTranslation).map((lang) => lang.code),
  ...NLLB_SERVED_OUTSIDE_CATALOGUE,
]);

export function isServerTranslatableLanguage(code: string | null | undefined): boolean {
  return !!code && SERVER_TRANSLATABLE.has(code.toLowerCase().trim());
}
