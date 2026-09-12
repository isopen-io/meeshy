import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DU RAIL DE STORIES** (#6080) — motif EXISTANT `loadConversations`
 * (`conversations.ts:33-41`) : `source` résolue ICI, jamais dans le hook ni
 * dans l'écran, et les fixtures passent par le MÊME chemin.
 *
 * `GET /api/v1/posts/feed/stories?projection=tray`
 * (`services/gateway/src/routes/posts/feed.ts:422-448`, authentification
 * REQUISE — 401 `UNAUTHORIZED` sans session). La projection `tray` est une
 * whitelist stricte côté serveur (`:437`) : toute autre valeur est ignorée et
 * sert la charge complète, d'où l'envoi de la chaîne exacte.
 *
 * Ce que le serveur renvoie est un POST par story (`trayStorySelect`,
 * `postIncludes.ts:275-296`), pas un auteur : `{ id, type, createdAt,
 * expiresAt, viewCount, author, media, repostOf }`. **Le groupement par auteur
 * est un travail de VUE** — un rail montre un cercle par auteur, jamais un par
 * story —, et il vit dans `lib/view/story-tray.ts` avec sa règle de tri.
 *
 * `limit` est plafonné à 50 côté serveur (`validatePagination`, `:448`) : le
 * demander plus haut ne sert à rien, et le demander plus bas priverait le rail
 * d'auteurs sans que rien ne le dise.
 */
export const STORY_TRAY_QUERY_KEY = ['stories', 'tray'] as const;

/** Un média de story, réduit à ce que le rail PEINT. */
export type StoryTrayMedia = {
  readonly id: string;
  readonly url?: string;
  readonly thumbnailUrl?: string;
  readonly mimeType?: string;
};

/** L'auteur, tel que `storyAuthorSelect` le sert. */
export type StoryTrayAuthor = {
  readonly id: string;
  readonly username?: string;
  readonly displayName?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly avatar?: string;
};

/** Une story du plateau — la forme EXACTE de `trayStorySelect`, rien de plus. */
export type StoryTrayPost = {
  readonly id: string;
  readonly type: string;
  readonly createdAt: string | Date;
  readonly expiresAt?: string | Date;
  readonly viewCount?: number;
  readonly author?: StoryTrayAuthor;
  readonly media?: readonly StoryTrayMedia[];
};

export type StoriesDeps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
};

export async function loadStoryTray(
  params: StoriesDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<readonly StoryTrayPost[]>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { STORY_TRAY } = await import('./fixtures-stories');
    return { ok: true, data: STORY_TRAY };
  }
  return params.transport.request<readonly StoryTrayPost[]>({
    method: 'GET',
    path: '/api/v1/posts/feed/stories?projection=tray&limit=50',
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
}

export function storyTrayQueryOptions(deps: StoriesDeps) {
  return {
    queryKey: STORY_TRAY_QUERY_KEY,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      loadStoryTray({ ...deps, signal }).then(unwrap),
  };
}
