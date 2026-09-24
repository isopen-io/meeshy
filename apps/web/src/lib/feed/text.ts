import { buildPostTranslationRecord } from '@meeshy/shared/utils/conversation-helpers';

import { served, type Served } from '@/lib/api/prism';

/**
 * LE TEXTE D'UN POST DU FIL — Prisme + troncature à 20 mots (#5893).
 *
 * Miroir `FeedPostCard.swift:171-176` (`truncatedContent`) : `words.count <=
 * 20` sinon les 20 premiers mots suivis de « ... ». La troncature s'applique
 * au texte RÉSOLU (ce que le lecteur voit), jamais à l'original — sans quoi
 * un post traduit dans une langue plus verbeuse que l'originale tronquerait
 * à un endroit que le lecteur ne peut pas relier au compte de mots affiché.
 */
export function truncateWords(text: string, limit: number): { readonly text: string; readonly truncated: boolean } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= limit) return { text, truncated: false };
  return { text: `${words.slice(0, limit).join(' ')}...`, truncated: true };
}

/** Le compte de mots du texte RÉSOLU — ce que `truncateWords` compare à sa
 * limite, exposé pour que l'appelant décide d'afficher « voir plus » sans
 * retronquer lui-même. */
export function wordCountOf(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export const FEED_TEXT_TRUNCATION_LIMIT = 20;

/**
 * `resolveFeedText` — LE SITE UNIQUE qui compose la descente du Prisme
 * (`served()`, `lib/api/prism.ts` — JAMAIS réécrite ici, D-14) avec le
 * dépouillement `langue → { text, … }` d'UN POST (`buildPostTranslationRecord`,
 * @meeshy/shared), pour le corps d'une carte de `FeedPostCard`. Même
 * dispositif que `resolveStoryCaption` (`lib/stories/caption.ts`) — sans la
 * dérivation de calques, qu'un post n'a pas.
 */
export function resolveFeedText(params: {
  readonly preferredLanguages: readonly string[];
  readonly originalLanguage: string | null | undefined;
  readonly translations: unknown;
  readonly content: string;
}): Served {
  return served({
    preferredLanguages: params.preferredLanguages,
    originalLanguage: params.originalLanguage,
    translations: buildPostTranslationRecord(params.translations),
    original: params.content,
  });
}
