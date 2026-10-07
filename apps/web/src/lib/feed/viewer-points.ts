import { replaceEqualDeep } from '@tanstack/react-query';

import { keptViewerPoints, type KnownViewerPoints } from '@meeshy/shared/types/engagement-scale';

import type { FeedPost } from '@/lib/api/feed-pages';

/**
 * CE QU'UN POST A RAPPORTÉ AU LECTEUR (#9570, contrat passerelle #9569, règle
 * des reprises #9584) — `viewerPoints`, servi sur les LECTURES à un lecteur
 * connecté et poussé par `engagement:post-updated`. La valeur est ABSOLUE et
 * peut BAISSER : retirer une réaction, un commentaire ou une publication
 * reprend ses points (décision porteur 2026-10-07).
 *
 * Ce que le client garde est la loi partagée `keptViewerPoints`, jamais
 * réécrite ici :
 * - une ANNONCE (porte `at`, l'instant serveur) s'applique si elle est plus
 *   récente que la dernière appliquée, qu'elle monte ou qu'elle baisse ;
 * - une LECTURE (fil, fiche) s'applique telle quelle et garde l'instant de la
 *   dernière annonce, pour qu'une annonce plus ancienne arrivée ensuite ne la
 *   défasse pas ;
 * - un champ ABSENT (réponse d'écriture, ancien serveur, cumul en échec) ne
 *   change rien — jamais zéro.
 *
 * L'instant de la dernière annonce voyage avec la carte, dans le cache de
 * requêtes (`FeedPost.viewerPointsAt`, jamais servi). Un changement de compte
 * vide ce cache (`query-client.ts`, D-6) : ce que le client sait repart de rien.
 */

/** Ce que la passerelle sert sous `viewerPoints` : un entier ≥ 0, ou rien. */
export const servedViewerPoints = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;

const instantOf = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null);

/** Ce que la carte sait : la valeur et l'instant de la dernière annonce appliquée. */
const knownOf = (post: FeedPost): KnownViewerPoints | undefined => {
  const viewerPoints = servedViewerPoints(post.viewerPoints);
  return viewerPoints === undefined ? undefined : { viewerPoints, at: instantOf(post.viewerPointsAt) };
};

/** La carte portant ce qui est GARDÉ — la même référence quand rien ne change. */
const carrying = (post: FeedPost, kept: KnownViewerPoints | undefined): FeedPost => {
  if (kept === undefined) return post;
  if (post.viewerPoints === kept.viewerPoints && instantOf(post.viewerPointsAt) === kept.at) return post;
  return { ...post, viewerPoints: kept.viewerPoints, viewerPointsAt: kept.at };
};

/** Une ANNONCE `engagement:post-updated` posée sur la carte. */
export function withAnnouncedViewerPoints(post: FeedPost, announced: { readonly viewerPoints: number; readonly at: number }): FeedPost {
  return carrying(post, keptViewerPoints(knownOf(post), announced));
}

/**
 * Une carte SERVIE (lecture, réponse d'écriture, diffusion) posée sur celle que
 * l'écran tenait : sa valeur s'applique comme une lecture, son absence laisse
 * celle d'avant, et l'instant de la dernière annonce reste.
 */
export function servedOverHeld(incoming: FeedPost, held: FeedPost): FeedPost {
  const served = servedViewerPoints(incoming.viewerPoints);
  return carrying(incoming, keptViewerPoints(knownOf(held), served === undefined ? {} : { viewerPoints: served }));
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

const heldCards = (previous: unknown): ReadonlyMap<string, FeedPost> =>
  new Map(cardsOf(previous).flatMap((card): [string, FeedPost][] => (isCard(card) && knownOf(card) !== undefined ? [[card.id, card]] : [])));

/**
 * LA LECTURE PASSE PAR LA MÊME LOI — le `structuralSharing` des caisses qui
 * peignent une carte (le Flux, les Réels, les enregistrées, un hashtag, un
 * profil, la fiche). Une page servie SANS le champ (cumul en échec) ne fait
 * pas disparaître la marque ; une page qui le porte s'applique en gardant
 * l'instant de la dernière annonce. Puis le partage structurel de TanStack
 * (`replaceEqualDeep`), inchangé : une relecture identique rend la donnée
 * PRÉCÉDENTE.
 *
 * TanStack passe AUSSI par ici pour les écritures du client (`setQueryData`,
 * l'annonce posée par `publication-engagement.ts`). Une carte qui porte déjà
 * `viewerPointsAt` en vient : la passerelle ne le sert jamais. Elle a donc
 * déjà traversé la loi et passe telle quelle — la relire comme une lecture
 * effacerait l'instant de l'annonce qu'elle vient de recevoir.
 */
export function holdViewerPoints(previous: unknown, next: unknown): unknown {
  const held = heldCards(previous);
  if (held.size === 0) return replaceEqualDeep(previous, next);
  const hold = (card: unknown): unknown => {
    if (!isCard(card) || instantOf(card.viewerPointsAt) !== null) return card;
    const before = held.get(card.id);
    return before === undefined ? card : servedOverHeld(card, before);
  };
  const pages = pagesOf(next);
  const kept = pages === undefined ? hold(next) : { ...(next as object), pages: pages.map((page) => ({ ...page, posts: page.posts.map(hold) })) };
  return replaceEqualDeep(previous, kept);
}
