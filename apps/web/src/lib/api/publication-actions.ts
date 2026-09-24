import type { QueryClient } from '@tanstack/react-query';

import type { DataSource } from './config';
import { removeCardPost } from './card-caches';
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

const send = (deps: PostActionDeps, method: 'POST' | 'DELETE', path: string): Promise<ApiResult<unknown> | null> => {
  if (__FIXTURES__ && deps.source === 'fixtures') return Promise.resolve({ ok: true, data: null });
  return deps.transport.request<unknown>({ method, path }).catch(() => null);
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
