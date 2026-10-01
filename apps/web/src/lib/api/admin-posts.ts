import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { excerptOf } from '@/lib/admin/interpret/labels';
import type { PostListState } from '@/lib/admin/post-list';
import { isRestrictedVisibility } from '@/lib/admin/post-state';

import { asCount, asRecord, asText, type AdminDeps } from './admin';
import { adminPageOf, type AdminPage } from './admin-page';
import type { ApiResult } from './http';

/**
 * **LES PUBLICATIONS VUES PAR L'ADMINISTRATION** (#8876) — publications,
 * stories, reels et statuts d'un seul tenant.
 *
 * - `GET admin.posts` — la liste. La pagination est À CÔTÉ de `data`
 *   (`sendPaginatedSuccess`) : `adminPageOf(…, { kind: 'top' })`.
 * - `GET admin.postsStats` — les chiffres d'une période (`today | week | month`).
 *
 * Gardées par `canModerateContent` côté passerelle.
 *
 * **Ce que ce décodeur garde, et ce qu'il ne garde pas.** Champ par champ, sans
 * étalement : la passerelle sert pour l'inspection bien plus que l'écran ne
 * montre (traductions, position, réactions…). Et surtout **le texte d'une
 * publication à audience restreinte (`PRIVATE`, `ONLY`, `EXCEPT`) n'entre PAS
 * dans la ligne de liste** : cette liste mêle les publications de toute la
 * plateforme, et un texte que le décodeur ne garde pas ne peut ni s'afficher, ni
 * rester dans la mémoire de la page. La fiche, elle, le lit — pour qui modère.
 *
 * Les clés vivent sous `['admin', 'posts', …]` : jamais persistées sur le
 * disque (`estClefNonPersistable`).
 */
export type AdminPersonRef = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
};

const textOrNull = (value: unknown): string | null => {
  const text = asText(value).trim();
  return text === '' ? null : text;
};

/** La forme `A` que la passerelle sert pour une personne : nom, pseudo, photo — jamais de présence ni de coordonnées. */
export function decodeAdminPersonRef(raw: unknown): AdminPersonRef | null {
  const person = asRecord(raw);
  if (person === null || typeof person.id !== 'string' || person.id === '') return null;
  return {
    id: person.id,
    username: asText(person.username),
    displayName: textOrNull(person.displayName),
    avatar: textOrNull(person.avatar),
  };
}

export type AdminPostRow = {
  readonly id: string;
  readonly type: string | null;
  readonly visibility: string | null;
  /** Audience choisie pour une poignée de personnes : le texte n'est pas gardé. */
  readonly restricted: boolean;
  /** ≤ 120 caractères ; `null` pour une audience restreinte, ou sans texte. */
  readonly excerpt: string | null;
  readonly mediaCount: number;
  /** L'humeur d'un statut (un emoji) : du contenu, donc gardée au même régime que le texte. */
  readonly moodEmoji: string | null;
  readonly isPinned: boolean;
  readonly deletedAt: string | null;
  readonly expiresAt: string | null;
  readonly likeCount: number;
  readonly commentCount: number;
  readonly viewCount: number;
  readonly createdAt: string | null;
  readonly author: AdminPersonRef | null;
};

const LIST_EXCERPT = 120;

export function decodeAdminPostRow(raw: unknown): AdminPostRow | null {
  const post = asRecord(raw);
  if (post === null || typeof post.id !== 'string' || post.id === '') return null;

  const visibility = textOrNull(post.visibility);
  const restricted = isRestrictedVisibility(visibility);
  return {
    id: post.id,
    type: textOrNull(post.type),
    visibility,
    restricted,
    excerpt: restricted ? null : excerptOf(asText(post.content), LIST_EXCERPT),
    mediaCount: Array.isArray(post.media) ? post.media.length : 0,
    moodEmoji: restricted ? null : textOrNull(post.moodEmoji),
    isPinned: post.isPinned === true,
    deletedAt: textOrNull(post.deletedAt),
    expiresAt: textOrNull(post.expiresAt),
    likeCount: asCount(post.likeCount),
    commentCount: asCount(post.commentCount),
    viewCount: asCount(post.viewCount),
    createdAt: textOrNull(post.createdAt),
    author: decodeAdminPersonRef(post.author),
  };
}

export type AdminPostsStats = {
  readonly total: number;
  readonly deleted: number;
  readonly byType: readonly { readonly type: string; readonly count: number }[];
  readonly topAuthors: readonly { readonly author: AdminPersonRef; readonly postCount: number }[];
  readonly trending: readonly {
    readonly id: string;
    readonly type: string | null;
    readonly likeCount: number;
    readonly commentCount: number;
    readonly author: AdminPersonRef | null;
  }[];
};

const EMPTY_STATS: AdminPostsStats = { total: 0, deleted: 0, byType: [], topAuthors: [], trending: [] };

function decodeTopAuthor(raw: unknown): AdminPostsStats['topAuthors'][number] | null {
  const entry = asRecord(raw);
  const author = decodeAdminPersonRef(entry?.author);
  return entry === null || author === null ? null : { author, postCount: asCount(entry.postCount) };
}

/**
 * Les tendances gardent leur ENGAGEMENT, jamais leur texte : la route les
 * sélectionne sans leur visibilité, donc rien ici ne dit si le texte d'une
 * tendance est celui d'une audience restreinte.
 */
function decodeTrending(raw: unknown): AdminPostsStats['trending'][number] | null {
  const post = asRecord(raw);
  if (post === null || typeof post.id !== 'string' || post.id === '') return null;
  return {
    id: post.id,
    type: textOrNull(post.type),
    likeCount: asCount(post.likeCount),
    commentCount: asCount(post.commentCount),
    author: decodeAdminPersonRef(post.author),
  };
}

const present = <T>(entries: readonly (T | null)[]): readonly T[] => entries.filter((entry): entry is T => entry !== null);

export function decodeAdminPostsStats(raw: unknown): AdminPostsStats {
  const stats = asRecord(raw);
  if (stats === null) return EMPTY_STATS;

  const byType = Object.entries(asRecord(stats.byType) ?? {})
    .map(([type, count]) => ({ type, count: asCount(count) }))
    .sort((left, right) => right.count - left.count);

  return {
    total: asCount(stats.total),
    deleted: asCount(stats.deleted),
    byType,
    topAuthors: present(Array.isArray(stats.topAuthors) ? stats.topAuthors.map(decodeTopAuthor) : []),
    trending: present(Array.isArray(stats.trending) ? stats.trending.map(decodeTrending) : []),
  };
}

export const adminPostsQueryKey = (address: string) => ['admin', 'posts', 'list', address] as const;

export const adminPostsStatsQueryKey = (period: string | undefined) => ['admin', 'posts', 'stats', period ?? 'all'] as const;

/** Les filtres posés partent tels quels ; la liste blanche est celle de `POST_LIST_SPEC`, appliquée à l'adresse. */
function listQuery(state: PostListState): string {
  const query = new URLSearchParams({
    offset: String(state.offset),
    limit: String(state.limit),
    ...(state.q === '' ? {} : { search: state.q }),
    ...state.filters,
    ...state.ids,
  });
  return query.toString();
}

export async function loadAdminPosts(
  params: AdminDeps & { readonly state: PostListState; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminPage<AdminPostRow>>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.posts}?${listQuery(params.state)}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  return adminPageOf(result, decodeAdminPostRow, { kind: 'top' });
}

export async function loadAdminPostsStats(
  params: AdminDeps & { readonly period?: string | undefined; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminPostsStats>> {
  const query = params.period === undefined || params.period === '' ? '' : `?${new URLSearchParams({ period: params.period }).toString()}`;
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.postsStats}${query}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: decodeAdminPostsStats(result.data) };
}
