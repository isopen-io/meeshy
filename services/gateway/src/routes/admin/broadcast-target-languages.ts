import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';

/**
 * Canonical NLLB target-language list for an admin broadcast.
 *
 * `POST /admin/broadcasts/:id/preview` derives its recipient languages from a
 * Prisma `groupBy(['systemLanguage'])`. That grouping collapses on the RAW
 * column value, and `User.systemLanguage` is persisted verbatim
 * (`z.string().optional()`, no write-time normalization) — so region/script
 * subtags and mixed case produced by web (`Accept-Language`) and iOS
 * (`Locale.current`), such as `en-US`, `pt-BR`, `FR`, `fr_FR`, reach this
 * aggregate intact and as DISTINCT buckets. Fed to the translator as-is, three
 * defects follow — the same class `PostService.audienceLanguages` fixes for
 * story translation:
 *
 *   (a) a region-tagged form of the source (`en-US` when the broadcast source
 *       is `en`) escapes the service's `l !== sourceLanguage` filter and
 *       becomes a target NLLB does not recognize;
 *   (b) `fr` / `fr-FR` / `FR` count as three distinct targets — three identical
 *       NLLB jobs and three persisted translation keys for one real language;
 *   (c) the persisted `AdminBroadcast.targetLanguages` carries the variants
 *       instead of the real languages.
 *
 * Each recipient code is canonicalized through the shared SSOT
 * {@link normalizeLanguageForDedup} (case-folded AND region-stripped); the
 * canonicalized broadcast source language is dropped (a source is never a
 * target — `BroadcastTranslationService.translateContent` also filters it, now
 * on the canonical value); and the result is deduplicated preserving first-seen
 * order. There is no cap: a broadcast translates to every language its audience
 * actually reads.
 */
export function broadcastTargetLanguages(
  recipientLanguages: ReadonlyArray<string | null | undefined>,
  sourceLanguage: string,
): string[] {
  const canonicalSource = normalizeLanguageForDedup(sourceLanguage);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of recipientLanguages) {
    if (!raw) continue;
    const canonical = normalizeLanguageForDedup(raw);
    if (!canonical || canonical === canonicalSource || seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}
