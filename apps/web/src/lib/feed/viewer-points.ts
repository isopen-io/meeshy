import { replaceEqualDeep } from '@tanstack/react-query';

import { keptViewerPoints } from '@meeshy/shared/types/engagement-scale';

import type { FeedPost } from '@/lib/api/feed-pages';

/**
 * CE QU'UN POST A RAPPORTÉ AU LECTEUR (#9570, contrat passerelle #9569) —
 * `viewerPoints`, servi sur les LECTURES à un lecteur connecté et poussé par
 * `engagement:post-updated`. La valeur est ABSOLUE et MONOTONE : entre ce que
 * le client sait et ce qu'il reçoit, il garde la plus grande — la loi
 * `keptViewerPoints` du paquet partagé, jamais réécrite ici. Absent veut dire
 * « garde ce que tu sais » (réponse d'écriture, ancien serveur, cumul en
 * échec), jamais zéro. Un changement de compte vide le cache de requêtes
 * (`query-client.ts`, D-6) : ce que le client sait repart de rien.
 */

/** Ce que la passerelle sert sous `viewerPoints` : un entier ≥ 0, ou rien. */
export const servedViewerPoints = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;

/** La carte avec la valeur GARDÉE — la même référence quand rien ne change. */
export function withKeptViewerPoints(post: FeedPost, received: number | undefined): FeedPost {
  const known = servedViewerPoints(post.viewerPoints);
  const kept = keptViewerPoints(known, received);
  return kept === undefined || kept === known ? post : { ...post, viewerPoints: kept };
}

type CardPage = { readonly posts: readonly unknown[] };

const isCard = (value: unknown): value is FeedPost =>
  typeof value === 'object' && value !== null && typeof (value as { readonly id?: unknown }).id === 'string';

const pagesOf = (value: unknown): readonly CardPage[] | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const pages: unknown = (value as { readonly pages?: unknown }).pages;
  if (!Array.isArray(pages)) return undefined;
  return pages.every((page: unknown) => typeof page === 'object' && page !== null && Array.isArray((page as { readonly posts?: unknown }).posts))
    ? (pages as readonly CardPage[])
    : undefined;
};

const cardsOf = (value: unknown): readonly unknown[] => pagesOf(value)?.flatMap((page) => page.posts) ?? (isCard(value) ? [value] : []);

const knownPoints = (previous: unknown): ReadonlyMap<string, number> =>
  new Map(
    cardsOf(previous).flatMap((card): [string, number][] => {
      if (!isCard(card)) return [];
      const points = servedViewerPoints(card.viewerPoints);
      return points === undefined ? [] : [[card.id, points]];
    }),
  );

/**
 * LA LECTURE GARDE AUSSI LA PLUS GRANDE — le `structuralSharing` des caisses
 * qui peignent une carte (le Flux, les Réels, les enregistrées, un hashtag, un
 * profil, la fiche). Une page de fil partie AVANT un geste et rendue APRÈS son
 * annonce porte une valeur plus ancienne ; une page servie sans le champ (cumul
 * en échec) n'en porte aucune : ni l'une ni l'autre ne fait reculer la carte.
 * Puis le partage structurel de TanStack (`replaceEqualDeep`), inchangé : une
 * relecture identique rend la donnée PRÉCÉDENTE.
 */
export function holdViewerPoints(previous: unknown, next: unknown): unknown {
  const known = knownPoints(previous);
  if (known.size === 0) return replaceEqualDeep(previous, next);
  const hold = (card: unknown): unknown => (isCard(card) ? withKeptViewerPoints(card, known.get(card.id)) : card);
  const pages = pagesOf(next);
  const held = pages === undefined ? hold(next) : { ...(next as object), pages: pages.map((page) => ({ ...page, posts: page.posts.map(hold) })) };
  return replaceEqualDeep(previous, held);
}
