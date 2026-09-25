import type { QueryClient } from '@tanstack/react-query';

import { POST_CONTENT_MAX_LENGTH } from '@/lib/feed/publication-edit';

import type { DataSource } from './config';
import { findCardPost, mergeServedPost, removeCardPost, replaceCardContent } from './card-caches';
import type { FeedPost } from './feed-pages';
import type { ApiResult, HttpTransport } from './http';
import { outcomeOf } from './outcome';
import { FEED_QUERY_KEY } from './feed';
import { removeStoryFromCaches } from './story-caches';
import { STORIES_QUERY_PREFIX } from './stories';

/**
 * **LES GESTES DE L'AUTEUR SUR SA PUBLICATION** (#7533) — ceux du menu « ⋯ »
 * d'une carte du fil, miroir `FeedViewModel.swift` (`deletePost` :1289,
 * `pinPost` :1387). Les routes vivaient côté passerelle
 * (`DELETE /posts/:id`, `POST /posts/:id/pin`) sans aucun appelant web.
 *
 * La passerelle reste l'AUTORITÉ sur « qui peut » : le client ne montre ces
 * entrées qu'à l'auteur (`postMenuEntries`), mais un 403 reste un refus
 * servi, jamais une décision prise ici.
 */
export type PostActionOutcome = 'done' | 'offline' | 'failed';

export type PostActionDeps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
  readonly queryClient: QueryClient;
};

const outcome = (result: ApiResult<unknown> | null): PostActionOutcome => {
  if (result === null) return 'offline';
  if (result.ok) return 'done';
  return outcomeOf(result) === 'permanent' ? 'failed' : 'offline';
};

const send = (
  deps: PostActionDeps,
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  options?: { readonly body?: Readonly<Record<string, unknown>>; readonly fixture?: unknown },
): Promise<ApiResult<unknown> | null> => {
  if (__FIXTURES__ && deps.source === 'fixtures') return Promise.resolve({ ok: true, data: options?.fixture ?? null });
  return deps.transport.request<unknown>({ method, path, ...(options?.body === undefined ? {} : { body: options.body }) }).catch(() => null);
};

/**
 * SUPPRIMER — OPTIMISTE, comme iOS (`posts.removeAll` puis rollback) : la
 * carte quitte TOUS les écrans qui la montrent (`removeCardPost`, le registre
 * des caisses) avant la réponse. Un échec RELIT les listes plutôt que de
 * reposer un instantané : une liste a pu bouger entre-temps (temps réel,
 * pagination), et une relecture ne ment jamais sur l'ordre.
 *
 * **UNE STORY EST AUSSI UNE PUBLICATION** (#6149) — le listing « Mes stories »
 * appelle ce MÊME geste (`deletePostAction`) plutôt que d'en écrire un second :
 * `removeStoryFromCaches` retire la ligne des DEUX corpus de stories et de sa
 * fiche unitaire (aucun effet sur une carte du Flux, qui n'y figure jamais —
 * la garde « rien à écrire » de `story-caches.ts` s'en assure), et un échec
 * relit `STORIES_QUERY_PREFIX` en plus du Flux : la story revient au listing
 * exactement comme une carte revient au Flux.
 */
const removeEverywhere = (queryClient: QueryClient, postId: string): void => {
  removeCardPost(queryClient, postId);
  removeStoryFromCaches(queryClient, postId);
};

export async function deletePost(params: { readonly postId: string; readonly deps: PostActionDeps }): Promise<PostActionOutcome> {
  const { postId, deps } = params;
  removeEverywhere(deps.queryClient, postId);

  const result = outcome(await send(deps, 'DELETE', `/api/v1/posts/${encodeURIComponent(postId)}`));
  if (result === 'done') {
    /* UNE RELECTURE PENDANT LE VOL (revue-correction #6149) — une autre
       suppression refusée, un `story:viewed`, un retour au premier plan :
       elle a pu rapporter la publication que le serveur n'avait pas encore
       retirée. La confirmation RÉAPPLIQUE le retrait — idempotent, et sans
       effet (garde « rien à écrire ») quand aucune caisse ne l'a rapportée. */
    removeEverywhere(deps.queryClient, postId);
    return result;
  }
  void deps.queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY });
  void deps.queryClient.invalidateQueries({ queryKey: STORIES_QUERY_PREFIX });
  return result;
}

/** ÉPINGLER sur son profil — iOS n'offre que l'épinglage depuis le fil (la
 * carte ne porte pas l'état épinglé), le web fait de même. */
export async function pinPost(params: { readonly postId: string; readonly deps: PostActionDeps }): Promise<PostActionOutcome> {
  return outcome(await send(params.deps, 'POST', `/api/v1/posts/${encodeURIComponent(params.postId)}/pin`));
}

/** UN SEUL VOL D'ÉDITION À LA FOIS, PAR PUBLICATION — miroir `isHeartInFlight`
 * (`FeedPostCard.swift:974`), même garde que `performCommentEdit`
 * (`comment-gestures.ts`) : un second appel pendant le premier croiserait
 * deux `PUT` sur la même publication. */
const editInFlight = new Set<string>();

/**
 * MODIFIER LE TEXTE — OPTIMISTE, retour en arrière EXACT sur refus (#7534),
 * miroir `FeedViewModel.updatePost` (`:1325-1370`) et la route réelle
 * `PUT /api/v1/posts/:postId` (`core.ts:513-661`, corps `UpdatePostSchema`
 * — `{ content }` SEUL, cette tranche ne portant que le texte). Aucun
 * `X-Client-Mutation-Id` : cette route ne passe pas par `withMutationLog`
 * (`core.ts:401` ne l'applique qu'à `POST /posts`).
 *
 * `translations: {}` — LE TEXTE A CHANGÉ, les traductions décrivaient
 * l'ANCIEN contenu (miroir serveur, `PostService.ts` : « Text changed → the
 * existing translations describe the OLD content » — et
 * `FeedViewModel.updatePost:1343-1344`, `optimistic.translations = nil`).
 *
 * **AUCUNE FILE HORS LIGNE** (contrairement à un envoi de message,
 * `send/outbox-store.ts`) : une modification perdue au retour du réseau doit
 * rester VISIBLE et RETENTABLE par l'auteur — la feuille d'édition
 * (`publication-edit-sheet.tsx`) reste ouverte sur `'offline'` et rejoue le
 * MÊME texte via « Réessayer », plutôt qu'une reprise silencieuse en tâche de
 * fond sur un contenu qu'on n'a peut-être plus envie de publier ainsi.
 *
 * SEUL LE FIL GELÉ DES RÉELS (D-66) ÉCHAPPE À L'ÉCRITURE — `replaceCardContent`
 * (le registre, `card-caches.ts`), jamais `updateCardPost` : même périmètre
 * qu'`applyPostUpdated` (`feed-realtime.ts`), qu'iOS ne câble pas non plus sur
 * `postUpdated` pour son pager de Réels.
 */
export async function editPost(params: { readonly postId: string; readonly content: string; readonly deps: PostActionDeps }): Promise<PostActionOutcome> {
  const { postId, deps } = params;
  const content = params.content.trim();
  if (content === '' || content.length > POST_CONTENT_MAX_LENGTH) return 'failed';

  const held = findCardPost(deps.queryClient, postId);
  if (held === undefined) return 'failed';
  /* `UpdatePostSchema` refuse un corps qui ne change RIEN (« Nothing to
     update », miroir `UpdateCommentSchema`) — et un aller-retour qui ne
     change rien n'a de toute façon aucune raison de partir. */
  if (content === (held.content ?? '').trim()) return 'done';

  if (editInFlight.has(postId)) return 'done';
  editInFlight.add(postId);

  try {
    replaceCardContent(deps.queryClient, postId, (post) => ({ ...post, content, translations: {} }));

    const result = await send(deps, 'PUT', `/api/v1/posts/${encodeURIComponent(postId)}`, {
      body: { content },
      fixture: { ...held, content, translations: {} },
    });

    if (result !== null && result.ok) {
      /* Une passerelle qui rend autre chose qu'une publication ne doit pas
         effacer ce qu'on vient d'écrire — même garde que `performCommentEdit`. */
      const served = result.data;
      if (served !== null && typeof served === 'object' && typeof (served as { readonly id?: unknown }).id === 'string') {
        replaceCardContent(deps.queryClient, postId, (post) => mergeServedPost(served as FeedPost, post));
      }
      return 'done';
    }

    /* LE RETOUR EXACT — la carte LUE au départ, jamais une modification
       partielle : entre le tap et le refus, un écho a pu bouger la carte,
       et poser autre chose que l'instantané ferait mentir sur un champ que
       ce geste n'a jamais touché. */
    replaceCardContent(deps.queryClient, postId, () => held);
    return outcome(result);
  } finally {
    editInFlight.delete(postId);
  }
}
