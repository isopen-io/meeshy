import type { QueryClient } from '@tanstack/react-query';

import type { DataSource } from './config';
import { removeCardPost } from './card-caches';
import type { ApiResult, HttpTransport } from './http';
import { outcomeOf } from './outcome';
import { FEED_QUERY_KEY } from './feed';

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
 */
export async function deletePost(params: { readonly postId: string; readonly deps: PostActionDeps }): Promise<PostActionOutcome> {
  const { postId, deps } = params;
  removeCardPost(deps.queryClient, postId);

  const result = outcome(await send(deps, 'DELETE', `/api/v1/posts/${encodeURIComponent(postId)}`));
  if (result !== 'done') void deps.queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY });
  return result;
}

/** ÉPINGLER sur son profil — iOS n'offre que l'épinglage depuis le fil (la
 * carte ne porte pas l'état épinglé), le web fait de même. */
export async function pinPost(params: { readonly postId: string; readonly deps: PostActionDeps }): Promise<PostActionOutcome> {
  return outcome(await send(params.deps, 'POST', `/api/v1/posts/${encodeURIComponent(params.postId)}/pin`));
}
