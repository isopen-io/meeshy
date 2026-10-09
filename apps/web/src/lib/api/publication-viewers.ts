import * as postsEndpoints from '@meeshy/shared/api/endpoints/posts';
import type { PostViewerRow, PostViewersPage } from '@meeshy/shared/types/publication-viewers';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **QUI A VU MA STORY** (#7116) — `GET posts.byPostIdInteractions`
 * (`services/gateway/src/routes/posts/interactions.ts:669-701`,
 * `preValidation: [requiredAuth]`, auteur SEUL — `getPostInteractions`,
 * `PostService.ts:2181-2226`, jette `FORBIDDEN` pour tout autre lecteur).
 *
 * C'est la route que le lecteur iOS appelle (`StoryInteractionService.swift:125-147`),
 * pas `GET /posts/:id/views` (qui sert la ligne `postView` brute, sans les
 * réactions) : la même forme ENRICHIE, ici comme là-bas.
 *
 * Chaque ligne porte aussi, depuis #9727, ce que la personne a fait sur ce
 * contenu (réactions, partages, republications, commentaires, réponses,
 * favori) — champs OPTIONNELS, absents quand ils valent zéro
 * (`@meeshy/shared/types/publication-viewers`). Story, post et réel : une
 * seule route, une seule forme. `engagement: 'unavailable'` dit que la
 * passerelle n'a pas pu établir ce détail : les lignes partent alors sans
 * aucun champ d'engagement, ce qui ne veut PAS dire que personne n'a rien fait.
 */
export type { PostViewerRow };

export type PostInteractionsPayload = {
  readonly viewers: readonly PostViewerRow[];
  readonly engagement?: PostViewersPage['engagement'];
  readonly pagination: { readonly total: number; readonly offset: number; readonly limit: number; readonly hasMore: boolean };
};

export type StoryViewersDeps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
};

export async function fetchStoryViewers(
  params: StoryViewersDeps & { readonly postId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<PostInteractionsPayload>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixturePostInteractions } = await import('./fixtures-viewers');
    const result = fixturePostInteractions(params.postId);
    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        error: result.status === 403 ? 'Only the author can view interactions' : 'Post not found',
        code: result.status === 403 ? 'FORBIDDEN' : 'POST_NOT_FOUND',
      };
    }
    return {
      ok: true,
      data: {
        viewers: result.viewers,
        ...(result.engagement !== undefined ? { engagement: result.engagement } : {}),
        pagination: { total: result.viewers.length, offset: 0, limit: 50, hasMore: false },
      },
    };
  }
  const result = await params.transport.request<PostViewersPage>({
    method: 'GET',
    path: postsEndpoints.byPostIdInteractions(params.postId),
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      viewers: result.data.viewers,
      ...(result.data.engagement !== undefined ? { engagement: result.data.engagement } : {}),
      pagination: result.pagination ?? { total: result.data.viewers.length, offset: 0, limit: 50, hasMore: false },
    },
  };
}

export const storyViewersQueryKey = (postId: string) => ['stories', 'viewers', postId] as const;

export function storyViewersQueryOptions(deps: StoryViewersDeps & { readonly postId: string }) {
  return {
    queryKey: storyViewersQueryKey(deps.postId),
    queryFn: ({ signal }: { readonly signal: AbortSignal }) => fetchStoryViewers({ ...deps, signal }).then(unwrap),
  };
}
