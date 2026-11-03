import * as messagesEndpoints from '@meeshy/shared/api/endpoints/messages';
import * as postsEndpoints from '@meeshy/shared/api/endpoints/posts';
import type { MessageSearchHit } from '@meeshy/shared/types/global-search';

import type { DataSource } from './config';
import { CANVAS_CAPS_HEADERS, type FeedPost } from './feed-pages';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LES PORTS DE LA RECHERCHE GÉNÉRALE** (#14619, #14620) — le contrat posté
 * sur les deux issues, servi par `services/gateway/src/routes/search/global-search.ts`.
 *
 * `GET /messages/search` cherche dans TOUTES les conversations du lecteur, et
 * la passerelle y porte seule les lois de lecture : membre actif, jamais une
 * conversation chiffrée de bout en bout, jamais une vue unique, un éphémère ou
 * un supprimé, historique effacé respecté. Le texte `content` est DÉJÀ celui
 * du Prisme du lecteur (`servedLanguage` le nomme, `null` ⇒ l'original) : ce
 * client le peint, il ne le résout pas.
 *
 * `GET /posts/search` sert la forme des listes du fil, sous la loi d'audience
 * du fil (`buildFeedVisibilityFilter`) ; son texte se résout chez le client
 * par la famille posts du Prisme (`resolveFeedText`).
 *
 * **LE CURSEUR EST OPAQUE** — rendu tel quel. Une page peut être COURTE avec
 * `hasMore: true` (la passerelle borne sa fenêtre de balayage) : seule
 * l'annonce de la passerelle arrête la pagination, jamais la longueur.
 */

export type GlobalSearchDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const GLOBAL_SEARCH_LIMIT = 20;
export const GLOBAL_SEARCH_MIN_QUERY = 2;
export const GLOBAL_SEARCH_DEBOUNCE_MS = 300;

export type { MessageSearchHit };

export type MessageSearchResults = { readonly hits: readonly MessageSearchHit[]; readonly nextCursor: string | null };
export type PostSearchResults = { readonly posts: readonly FeedPost[]; readonly nextCursor: string | null };

type Pagination = { readonly hasMore?: boolean; readonly nextCursor?: string | null };

type SearchParams = GlobalSearchDeps & {
  readonly query: string;
  readonly cursor?: string | null;
  readonly signal?: AbortSignal;
};

export const searchableQuery = (raw: string): string | null => {
  const query = raw.trim();
  return query.length >= GLOBAL_SEARCH_MIN_QUERY ? query : null;
};

export const globalSearchKey = (scope: 'messages' | 'posts', query: string) =>
  ['global-search', scope, query.trim().toLocaleLowerCase()] as const;

const nextCursorOf = (pagination: unknown): string | null => {
  const raw = pagination as Pagination | undefined;
  return raw?.hasMore === true && typeof raw.nextCursor === 'string' && raw.nextCursor.length > 0 ? raw.nextCursor : null;
};

const searchString = (entries: Record<string, string | null | undefined>): string =>
  new URLSearchParams(
    Object.entries(entries).flatMap(([key, value]) => (value === null || value === undefined ? [] : [[key, value]])),
  ).toString();

const isHit = (raw: unknown): raw is MessageSearchHit => {
  const row = raw as Partial<MessageSearchHit> | null;
  return typeof row?.id === 'string' && typeof row.conversationId === 'string' && typeof row.content === 'string';
};

const isPost = (raw: unknown): raw is FeedPost => {
  const row = raw as Partial<FeedPost> | null;
  return typeof row?.id === 'string' && typeof row.type === 'string';
};

export async function searchEverywhereMessages(params: SearchParams): Promise<ApiResult<MessageSearchResults>> {
  if (__FIXTURES__ && params.source === 'fixtures') return { ok: true, data: { hits: [], nextCursor: null } };
  const result = await params.transport.request<readonly unknown[]>({
    method: 'GET',
    path: `${messagesEndpoints.search}?${searchString({ q: params.query.trim(), limit: String(GLOBAL_SEARCH_LIMIT), cursor: params.cursor })}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  const rows = Array.isArray(result.data) ? result.data : [];
  return { ...result, data: { hits: rows.filter(isHit), nextCursor: nextCursorOf(result.pagination) } };
}

export async function searchEverywherePosts(params: SearchParams): Promise<ApiResult<PostSearchResults>> {
  if (__FIXTURES__ && params.source === 'fixtures') return { ok: true, data: { posts: [], nextCursor: null } };
  const result = await params.transport.request<readonly unknown[]>({
    method: 'GET',
    path: `${postsEndpoints.search}?${searchString({ q: params.query.trim(), limit: String(GLOBAL_SEARCH_LIMIT), cursor: params.cursor, types: 'POST,REEL,STORY' })}`,
    headers: CANVAS_CAPS_HEADERS,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  const rows = Array.isArray(result.data) ? result.data : [];
  return { ...result, data: { posts: rows.filter(isPost), nextCursor: nextCursorOf(result.pagination) } };
}

export type PostSearchTarget = { readonly to: 'post' | 'reel' | 'story'; readonly params: { readonly post: string } };

export const postSearchTarget = (post: Pick<FeedPost, 'id' | 'type'>): PostSearchTarget => {
  const to = post.type === 'REEL' ? 'reel' : post.type === 'STORY' ? 'story' : 'post';
  return { to, params: { post: post.id } };
};
