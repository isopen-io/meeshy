import * as z from 'zod/mini';

import type { StarredMessageItem } from '@meeshy/shared/types/message-star';

import { unwrap } from './client';
import type { ApiResult } from './http';
import { STARRED_LIST_QUERY_KEY, type StarredPage } from './starred-messages-cache';
import { starredMessagesPath, starredPaginationOf, type StarredMessagesDeps } from './starred-messages';

/**
 * **LE PORT DE L'ÉCRAN DES MESSAGES FAVORIS** (#7286) — `GET
 * /api/v1/me/starred-messages?limit=&cursor=` (#7377,
 * `services/gateway/src/routes/me/starred-messages.ts`).
 *
 * **LE CURSEUR EST OPAQUE** — keyset `(createdAt, id)` de l'ÉTOILE, transmis
 * tel quel. La liste est ordonnée par date d'ÉTOILE, la plus récente d'abord :
 * un vieux message mis en favori ce matin passe devant.
 *
 * **LE MESSAGE EST SERVI VIVANT** : texte original, langue d'origine et
 * traductions — le Prisme se résout à la LECTURE (`starred-row.ts`), jamais
 * figé à l'étoile comme le faisait le magasin local d'iOS. Une ligne protégée
 * (flouté, chiffré, éphémère vivant) arrive en PLACEHOLDER (`isProtected`,
 * sans texte ni traduction ni pièce) : ce port la passe telle quelle, l'écran
 * n'invente rien.
 *
 * **LE DÉCODEUR EST UNE FRONTIÈRE** (`zod/mini`, comme `blocks.ts`) : une ligne
 * mal formée est écartée, ses voisines servies. Ce module vit dans le chunk de
 * l'écran seul — le fil n'en lit que les ids (`starred-messages.ts`), sans
 * décodeur.
 */

/** `STARRED_MESSAGES_DEFAULT_LIMIT` du contrat, recopié pour la même raison que `STARRED_MEMBERSHIP_PAGE_SIZE` ; le témoin compare. */
export const STARRED_LIST_PAGE_SIZE = 20;

const TranslationWire = z.object({
  id: z.string(),
  messageId: z.string(),
  targetLanguage: z.string(),
  translatedContent: z.string(),
});

const AttachmentWire = z.object({
  id: z.string(),
  mimeType: z.string(),
  fileUrl: z.nullable(z.string()),
  thumbnailUrl: z.nullable(z.string()),
  isMasked: z.boolean(),
});

const ItemWire = z.object({
  id: z.string(),
  starredAt: z.string(),
  message: z.object({
    id: z.string(),
    conversationId: z.string(),
    messageType: z.string(),
    createdAt: z.string(),
    editedAt: z.nullable(z.string()),
    isProtected: z.boolean(),
    content: z.nullable(z.string()),
    originalLanguage: z.nullable(z.string()),
    translations: z.array(TranslationWire),
    attachments: z.array(AttachmentWire),
  }),
  sender: z.nullable(
    z.object({
      id: z.string(),
      userId: z.nullable(z.string()),
      displayName: z.nullable(z.string()),
      avatar: z.nullable(z.string()),
      username: z.nullable(z.string()),
    }),
  ),
  conversation: z.object({
    id: z.string(),
    identifier: z.string(),
    type: z.string(),
    name: z.nullable(z.string()),
    avatar: z.nullable(z.string()),
  }),
});

function decodeStarredItem(raw: unknown): StarredMessageItem | null {
  const parsed = ItemWire.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function loadStarredMessagesPage(
  params: StarredMessagesDeps & { readonly cursor?: string; readonly signal?: AbortSignal },
): Promise<ApiResult<StarredPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureStarredPage } = await import('./fixtures-starred');
    return {
      ok: true,
      data: fixtureStarredPage({ limit: STARRED_LIST_PAGE_SIZE, ...(params.cursor !== undefined ? { cursor: params.cursor } : {}) }),
    };
  }
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: starredMessagesPath({ limit: STARRED_LIST_PAGE_SIZE, cursor: params.cursor }),
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  const items = (Array.isArray(result.data) ? result.data : []).flatMap((raw: unknown) => {
    const item = decodeStarredItem(raw);
    return item === null ? [] : [item];
  });
  return { ok: true, data: { items, pagination: starredPaginationOf(result.pagination, STARRED_LIST_PAGE_SIZE) } };
}

/** Spreadable dans `useInfiniteQuery` — la clé est CELLE que le geste et l'écho écrivent. */
export function starredListInfiniteOptions(deps: StarredMessagesDeps) {
  return {
    queryKey: STARRED_LIST_QUERY_KEY,
    queryFn: async ({ pageParam, signal }: { readonly pageParam?: string | undefined; readonly signal?: AbortSignal }) =>
      unwrap(
        await loadStarredMessagesPage({
          ...deps,
          ...(pageParam !== undefined ? { cursor: pageParam } : {}),
          ...(signal !== undefined ? { signal } : {}),
        }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: StarredPage): string | undefined =>
      last.pagination.hasMore && last.pagination.nextCursor !== null ? last.pagination.nextCursor : undefined,
  };
}
