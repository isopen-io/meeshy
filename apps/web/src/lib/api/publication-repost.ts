import type { QueryClient } from '@tanstack/react-query';

import type { PostVisibility } from '@meeshy/shared/types/post';
import { isRepostVisibilityAllowed } from '@meeshy/shared/utils/repost-audience';
import { repostTargetId } from '@meeshy/shared/utils/repost-target';

import { markReposted, unmarkReposted } from '@/lib/feed/interactions';

import { findCardPost, updateCardPost } from './card-caches';
import { newClientMessageId } from './client-message-id';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';
import { outcomeOf } from './outcome';

/**
 * LE PORT DU REPARTAGE (#6484) — miroir de `ReelsViewModel.repost` (iOS) et
 * de `RepostPublisher` : `POST /api/v1/posts/:id/repost`
 * (`services/gateway/src/routes/posts/interactions.ts:819-984`), un repost
 * SIMPLE (`isQuote: false`, sans `content`) que l'écran d'aujourd'hui n'offre
 * qu'ainsi — les Réels comme le rail iOS (commentaire `:85-88` :
 * « append-only — `participated` reste vrai une fois posé »).
 *
 * **LE REPOST N'EST PAS UN GESTE RÉVERSIBLE, ET SA GRAMMAIRE D'ISSUE EN
 * DÉCOULE.** `performPostGesture` (aimer, enregistrer) garde son optimiste
 * posé sur une panne PASSAGÈRE : rejouer un cœur ou un signet ne change rien
 * pour le lecteur qui l'a déjà vu bouger. Un repost, lui, est une CRÉATION —
 * le laisser affirmer « repartagé » sans que la passerelle l'ait confirmé
 * serait mentir sur un fait qui n'existe nulle part ailleurs que dans ce
 * cache. Toute issue NON confirmée (réseau, 5xx, 429…) défait donc
 * l'optimiste, contrairement au geste symétrique d'« aimer ».
 *
 * **LA CIBLE GRIMPE, LE FORMAT RESTE CELUI DE LA CARTE** (`repostTargetId`,
 * `@meeshy/shared/utils/repost-target`, D-14) : reposter un repost vise la
 * RACINE de la chaîne, jamais une coquille encastrée qui n'a ni contenu ni
 * média propres.
 *
 * **LA LOI D'AUDIENCE PARTAGÉE** (`isRepostVisibilityAllowed`,
 * `@meeshy/shared/utils/repost-audience`, D-100) — même audience ou plus
 * restreinte, jamais plus large. Un repost SIMPLE (sans `intent.visibility`)
 * n'envoie aucune visibilité : la passerelle hérite alors de l'original
 * (`PostService.repostPost`), donc rien à refuser localement. Le paramètre
 * existe déjà pour le jour où un sélecteur d'audience s'ajoute au
 * composeur — une SEAM, jamais câblée par le rail des Réels aujourd'hui.
 */
export type RepostDeps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
  readonly queryClient: QueryClient;
};

export type RepostIntent = { readonly visibility?: PostVisibility };

/** UNE UNION LITTÉRALE, jamais le catalogue entier — même raison que
 * `PostGestureMessageKey` (`feed-gestures.ts`). */
type RepostFailureMessageKey =
  | 'feed.post.repost.offline'
  | 'feed.post.repost.audience'
  | 'feed.post.repost.error'
  | 'feed.post.repost.unconfirmed';

export type RepostResult =
  | { readonly ok: true; readonly notice?: 'feed.post.repost.success' | 'feed.post.repost.already' }
  | { readonly ok: false; readonly message: RepostFailureMessageKey; readonly issue: 'refused' | 'unconfirmed' };

const inFlight = new Set<string>();

/** Même dérivation que `feed-gestures.ts#newClientMutationId` — LOCALE à ce
 * port (chaque port de geste porte la sienne, motif déjà posé trois fois
 * dans ce dépôt : `feed-gestures.ts`, `comment-gestures.ts`,
 * `story-reactions.ts`), parce que le module partagé importe `crypto`
 * (Node) et ne peut pas entrer dans le bundle navigateur. */
const newClientMutationId = (): string => newClientMessageId().replace(/^cid_/, 'cmid_');

const isReaderOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

function sendRepost(
  deps: RepostDeps,
  params: { readonly targetId: string; readonly targetType: string; readonly visibility?: PostVisibility },
): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    return Promise.resolve({ ok: true, status: 201, data: { id: `repost-${params.targetId}`, repostOfId: params.targetId } });
  }
  return deps.transport.request<unknown>({
    method: 'POST',
    path: `/api/v1/posts/${encodeURIComponent(params.targetId)}/repost`,
    body: {
      targetType: params.targetType,
      isQuote: false,
      ...(params.visibility === undefined ? {} : { visibility: params.visibility }),
    },
    headers: { 'X-Client-Mutation-Id': newClientMutationId() },
  });
}

export async function performRepost(params: {
  readonly postId: string;
  readonly deps: RepostDeps;
  readonly intent?: RepostIntent;
}): Promise<RepostResult> {
  const { postId, deps } = params;
  const known = findCardPost(deps.queryClient, postId);
  if (known?.isRepostedByMe === true) return { ok: true, notice: 'feed.post.repost.already' };
  if (isReaderOffline()) return { ok: false, message: 'feed.post.repost.offline', issue: 'refused' };

  const originalVisibility: PostVisibility = known?.visibility ?? 'PUBLIC';
  const requestedVisibility = params.intent?.visibility;
  if (requestedVisibility !== undefined && !isRepostVisibilityAllowed(originalVisibility, requestedVisibility)) {
    return { ok: false, message: 'feed.post.repost.audience', issue: 'refused' };
  }

  const flightKey = `repost:${postId}`;
  if (inFlight.has(flightKey)) return { ok: true };

  const target = known === undefined ? postId : repostTargetId(known);
  const targetType = known?.type ?? 'POST';

  updateCardPost(deps.queryClient, postId, markReposted);
  inFlight.add(flightKey);
  try {
    const result = await sendRepost(deps, {
      targetId: target,
      targetType,
      ...(requestedVisibility === undefined ? {} : { visibility: requestedVisibility }),
    }).catch(() => null);

    if (result === null) {
      updateCardPost(deps.queryClient, postId, unmarkReposted);
      return { ok: false, message: 'feed.post.repost.unconfirmed', issue: 'unconfirmed' };
    }
    if (result.ok) return { ok: true, notice: 'feed.post.repost.success' };
    // MUTATION_IN_FLIGHT (409) / MUTATION_RESULT_GONE (410) : la mutation a eu
    // lieu, ou est en train d'avoir lieu, côté serveur — l'optimiste RESTE.
    if (result.status === 409 || result.status === 410) return { ok: true };

    updateCardPost(deps.queryClient, postId, unmarkReposted);
    return outcomeOf(result) === 'permanent'
      ? { ok: false, message: 'feed.post.repost.error', issue: 'refused' }
      : { ok: false, message: 'feed.post.repost.unconfirmed', issue: 'unconfirmed' };
  } finally {
    inFlight.delete(flightKey);
  }
}
