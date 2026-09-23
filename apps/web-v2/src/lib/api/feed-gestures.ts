import type { QueryClient } from '@tanstack/react-query';

import { bookmarkSlotOf, withBookmark, withoutBookmark, type BookmarkSlot } from '@/lib/feed/bookmark-membership';
import { togglePost, withServedCount, type PostToggleKind } from '@/lib/feed/interactions';

import { BOOKMARKS_QUERY_KEY } from './bookmarked-posts';
import { findCardPost, invalidateCardPost, updateCardPost, writeCardCache } from './card-caches';
import { newClientMessageId } from './client-message-id';
import type { DataSource } from './config';
import type { FeedInfiniteData, FeedPost } from './feed-pages';
import type { ApiResult, HttpTransport } from './http';
import { outcomeOf } from './outcome';

/**
 * LE PORT DES GESTES D'UNE PUBLICATION (#6278) — aimer et enregistrer, le
 * SITE UNIQUE que la carte du fil appelle : plan → optimiste → appel → issue,
 * même forme que `performReaction` (`reactions.ts`).
 *
 * - AIMER : `POST|DELETE /api/v1/posts/:postId/like`
 *   (`services/gateway/src/routes/posts/interactions.ts:86,265`), sans corps —
 *   la passerelle pose « ❤️ » par défaut. Idempotent par
 *   `X-Client-Mutation-Id` (`middleware/clientMutationId.ts`, `cmid_<uuid>`) :
 *   un rejeu ne diffuse ni ne notifie deux fois (#6293).
 * - ENREGISTRER : `POST|DELETE /api/v1/posts/:postId/bookmark`
 *   (`bookmarks.ts:32,90`), qui rend le `bookmarkCount` ABSOLU.
 *
 * **LES CAISSES QU'IL ÉCRIT NE SONT PAS NOMMÉES ICI** (#7341) : le registre
 * `card-caches.ts` les tient — le Flux, les Réels, les enregistrées, la page
 * d'un hashtag, les publications d'un profil, la fiche. Ce fichier en a
 * RECOPIÉ la liste jusqu'à #7341, et la recopie ne connaissait ni le hashtag
 * ni le profil : le cœur y partait au serveur et la carte ne bougeait pas.
 *
 * **LE CORPUS DES ENREGISTRÉES EST AUSSI UNE APPARTENANCE** (#7286). Pour
 * AIMER, sa carte bascule comme toutes les autres. Pour ENREGISTRER, `setOn`
 * gouverne EN PLUS sa composition par `bookmark-membership.ts` : retirer ÔTE
 * la ligne, et le retour en arrière lui REND SA PLACE — la `BookmarkSlot` est
 * relevée AVANT l'écriture optimiste, par ligne et jamais par instantané de
 * la liste (deux gestes concurrents sur deux publications s'annuleraient
 * l'un l'autre).
 *
 * LES ISSUES :
 * - succès : l'optimiste reflète déjà la réalité ; un compte servi le remplace.
 * - panne passagère (réseau, 5xx, 408/425/429 — `outcomeOf`) : l'optimiste
 *   RESTE, ANNONCÉ. Aucune promesse de rejeu : la file de reprise est #5868.
 * - 409 sur « aimer » : le lecteur a déjà réagi d'un autre emoji ailleurs, le
 *   cache était périmé — l'optimiste est défait et le fil INVALIDÉ, sans
 *   annoncer un échec que le lecteur n'a pas commis.
 * - tout autre refus (404 hors audience, 401…) : l'optimiste est défait,
 *   l'échec annoncé avec le libellé d'iOS.
 *
 * UN GESTE À LA FOIS PAR PUBLICATION ET PAR SENS — miroir `isHeartInFlight`
 * (`FeedPostCard.swift:974`) : un second tap pendant l'appel enverrait un
 * `DELETE` qui croiserait le `POST` encore en route.
 */
export type PostGestureDeps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
  readonly queryClient: QueryClient;
};

/**
 * `notice`/`message` portent une CLÉ DE CATALOGUE, jamais un texte déjà
 * traduit (#6488) — cette couche n'a pas la langue d'interface, seul l'hôte
 * qui annonce (`usePostGesture`) l'a. Même patron que `INVITE_FEEDBACK`
 * (`routes/discover-parts.tsx`).
 *
 * UNE UNION LITTÉRALE, jamais `InterfaceCatalogKey` (le catalogue entier) :
 * `translate()` distribue ses paramètres sur CHAQUE clé du type qu'on lui
 * passe, et exigerait un troisième argument dès que le type couvre ne
 * serait-ce qu'UNE clé paramétrée du catalogue, même si ces trois-ci n'en
 * portent aucun.
 */
type PostGestureMessageKey = 'feed.like.error' | 'post.bookmark.error' | 'feed.gesture.pending';

export type PostGestureResult =
  | { readonly ok: true; readonly notice?: PostGestureMessageKey }
  | { readonly ok: false; readonly message: PostGestureMessageKey };

/** `feed.like.error` et `post.bookmark.error` (`Localizable.xcstrings`). */
export const LIKE_FAILED_MESSAGE: PostGestureMessageKey = 'feed.like.error';
export const BOOKMARK_FAILED_MESSAGE: PostGestureMessageKey = 'post.bookmark.error';
export const GESTURE_PENDING_MESSAGE: PostGestureMessageKey = 'feed.gesture.pending';

const inFlight = new Set<string>();

const newClientMutationId = (): string => newClientMessageId().replace(/^cid_/, 'cmid_');

const isOn = (post: FeedPost | undefined, kind: PostToggleKind): boolean =>
  kind === 'like' ? post?.isLikedByMe === true : post?.isBookmarkedByMe === true;

function sendGesture(
  deps: PostGestureDeps,
  gesture: { readonly postId: string; readonly kind: PostToggleKind; readonly on: boolean },
): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    return Promise.resolve({ ok: true, data: gesture.kind === 'like' ? { liked: gesture.on } : { bookmarked: gesture.on } });
  }
  return deps.transport.request<unknown>({
    method: gesture.on ? 'POST' : 'DELETE',
    path: `/api/v1/posts/${encodeURIComponent(gesture.postId)}/${gesture.kind}`,
    headers: { 'X-Client-Mutation-Id': newClientMutationId() },
  });
}

const servedBookmarkCount = (data: unknown): number | undefined => {
  const count = (data as { readonly bookmarkCount?: unknown } | null)?.bookmarkCount;
  return typeof count === 'number' && Number.isFinite(count) ? count : undefined;
};

export async function performPostGesture(params: {
  readonly postId: string;
  readonly kind: PostToggleKind;
  readonly deps: PostGestureDeps;
}): Promise<PostGestureResult> {
  const { postId, kind, deps } = params;
  const flightKey = `${kind}:${postId}`;
  if (inFlight.has(flightKey)) return { ok: true };

  /* L'ÉTAT « AVANT » SE LIT LÀ OÙ LA CARTE EST PEINTE (`findCardPost`) — sur
     N'IMPORTE QUEL écran qui la montre, la fiche en dernier. Une publication
     peut n'être QUE sur l'écran où le geste a lieu : enregistrée il y a trois
     jours (#7286), trouvée sous un hashtag ou sur un profil (#7341). N'y lire
     qu'une caisse déduisait « pas aimée » et envoyait un `POST` (ajouter) sur
     le geste qui voulait RETIRER. */
  const known = findCardPost(deps.queryClient, postId);
  const on = !isOn(known, kind);
  /* LA PLACE DE LA LIGNE DANS LE CORPUS ENREGISTRÉ, relevée AVANT l'optimiste :
     après, la ligne n'y est plus. Absente du corpus (on enregistre depuis le
     Flux), la place est la TÊTE — un enregistrement neuf est le plus récent —,
     et la ligne posée est la carte DÉJÀ basculée : même signet, même compteur
     que celle du Flux, jamais deux chiffres pour une publication. */
  const slot: BookmarkSlot | null =
    kind !== 'bookmark'
      ? null
      : (bookmarkSlotOf(deps.queryClient.getQueryData<FeedInfiniteData>(BOOKMARKS_QUERY_KEY), postId) ??
        (known === undefined ? null : { post: togglePost(known, { postId, kind, on: true }), page: 0, index: 0 }));
  /* CHAQUE CAISSE QUI MONTRE LA CARTE BASCULE, UNE FOIS — puis, pour
     ENREGISTRER, le corpus des enregistrées change d'APPARTENANCE. */
  const setOn = (value: boolean) => {
    const change = { postId, kind, on: value };
    updateCardPost(deps.queryClient, postId, (post) => togglePost(post, change));
    if (kind !== 'bookmark') return;
    writeCardCache<FeedInfiniteData>(deps.queryClient, BOOKMARKS_QUERY_KEY, (data) => {
      if (!value) return withoutBookmark(data, postId);
      return slot === null ? data : withBookmark(data, slot);
    });
  };

  setOn(on);
  inFlight.add(flightKey);
  try {
    const result = await sendGesture(deps, { postId, kind, on }).catch(() => null);
    if (result === null) return { ok: true, notice: GESTURE_PENDING_MESSAGE };

    if (result.ok) {
      const count = kind === 'bookmark' ? servedBookmarkCount(result.data) : undefined;
      if (count !== undefined) {
        const served = { postId, kind, count };
        updateCardPost(deps.queryClient, postId, (post) => withServedCount(post, served));
      }
      return { ok: true };
    }

    if (outcomeOf(result) !== 'permanent') return { ok: true, notice: GESTURE_PENDING_MESSAGE };

    setOn(!on);
    if (kind === 'like' && result.status === 409) {
      invalidateCardPost(deps.queryClient, postId);
      return { ok: true };
    }
    return { ok: false, message: kind === 'like' ? LIKE_FAILED_MESSAGE : BOOKMARK_FAILED_MESSAGE };
  } finally {
    inFlight.delete(flightKey);
  }
}
