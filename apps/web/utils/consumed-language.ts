/**
 * Quelle version linguistique un lecteur a RÉELLEMENT sous les yeux.
 *
 * ## Pourquoi ce n'est pas simplement « sa langue préférée »
 *
 * Meeshy affiche le même message dans autant de langues qu'il y a de lecteurs,
 * mais une traduction n'existe pas toujours. Quand elle manque, c'est
 * l'ORIGINAL qui s'affiche : déclarer que le message a été lu dans la langue
 * préférée mentirait précisément là où l'auteur a besoin de savoir — « m'a-t-on
 * lu dans ma langue, ou traduit ? ».
 *
 * ## La règle suit celle du TEXTE
 *
 * Même ordre, même repli, même interdit que `resolveUserLanguage` côté shared :
 * jamais de repli sur une traduction tierce. L'absence de traduction dans une
 * langue préférée signifie que le contenu y est déjà, ou qu'aucune traduction
 * n'a été produite ; servir une langue sans rapport serait pire que l'original.
 *
 * Toute divergence entre cette résolution et celle du texte produirait une
 * statistique fausse — d'où le miroir strict.
 *
 * Miroir Swift : `ConsumedLanguageResolver.swift` (SDK) — mêmes cas de test.
 * @see docs/superpowers/specs/2026-07-24-media-views-enrichment-design.md
 */

import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';

export type ConsumedLanguageInput = {
  /** Langue de rédaction du contenu. */
  readonly originalLanguage?: string | null;
  /** Langues pour lesquelles une traduction existe. */
  readonly availableTranslations?: readonly string[] | null;
  /** Préférences du lecteur, DANS L'ORDRE. */
  readonly preferredLanguages?: readonly string[] | null;
  /**
   * Version explicitement ouverte par le lecteur, qui prime sur ses
   * préférences — il a vu celle-là.
   */
  readonly manualSelection?: string | null;
};

/**
 * @returns le code de la version affichée, `null` s'il est impossible de le
 * déterminer. Mieux vaut ne rien rapporter qu'inventer une langue.
 */
export function resolveConsumedLanguage({
  originalLanguage,
  availableTranslations,
  preferredLanguages,
  manualSelection,
}: ConsumedLanguageInput): string | null {
  const original = normalizeLanguageCode(originalLanguage) ?? null;

  const translations = new Set<string>();
  for (const candidate of availableTranslations ?? []) {
    const normalized = normalizeLanguageCode(candidate);
    if (normalized) translations.add(normalized);
  }

  // Une bascule explicite l'emporte : le lecteur a choisi cette version. Encore
  // faut-il qu'elle existe — un code périmé ne doit pas être pris pour argent
  // comptant.
  const manual = normalizeLanguageCode(manualSelection);
  if (manual && (manual === original || translations.has(manual))) {
    return manual;
  }

  for (const candidate of preferredLanguages ?? []) {
    const normalized = normalizeLanguageCode(candidate);
    if (!normalized) continue;
    // Le contenu est déjà dans cette langue : c'est l'original qui s'affiche,
    // aucune traduction n'entre en jeu.
    if (normalized === original) return original;
    if (translations.has(normalized)) return normalized;
  }

  // Aucune préférence servie : le lecteur voit l'original. `null` quand même
  // celui-ci est inconnu — rien de fiable à déclarer.
  return original;
}

/**
 * Répartit un lot de messages entre la langue DOMINANTE et ses exceptions —
 * exactement la forme qu'attend le corps de `mark-read`.
 *
 * Sur une conversation lue d'une traite, la table d'exceptions est vide ou
 * presque : inutile de transporter une langue par message.
 */
export function splitConsumedLanguages(
  resolvedByMessageId: ReadonlyMap<string, string | null>
): { language?: string; messageLanguages?: Record<string, string> } {
  const counts = new Map<string, number>();
  for (const language of resolvedByMessageId.values()) {
    if (!language) continue;
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  if (counts.size === 0) return {};

  // À égalité, le code alphabétiquement premier : deux exécutions sur les mêmes
  // données doivent produire le même corps de requête.
  const [dominant] = Array.from(counts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )[0];

  const messageLanguages: Record<string, string> = {};
  for (const [messageId, language] of resolvedByMessageId) {
    if (!language || language === dominant) continue;
    messageLanguages[messageId] = language;
  }

  return Object.keys(messageLanguages).length > 0
    ? { language: dominant, messageLanguages }
    : { language: dominant };
}
