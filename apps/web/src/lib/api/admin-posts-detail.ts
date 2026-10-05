import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { excerptOf } from '@/lib/admin/interpret/labels';
import { isRestrictedVisibility } from '@/lib/admin/post-state';

import { asCount, asRecord, asText, type AdminDeps } from './admin';
import { decodeAdminPersonRef, type AdminPersonRef } from './admin-posts';
import type { ApiResult } from './http';

/**
 * **LA FICHE D'UNE PUBLICATION** (#8876) — `GET admin.postsByPostId`, et le
 * geste « Retirer la publication » (`DELETE`, motif demandé).
 *
 * **La réponse est un objet OUVERT** (`additionalProperties: true`) : tout ce
 * que la requête charge part — la position (`geoPoint`), la liste des personnes
 * visées par l'audience (`visibilityUserIds`), la carte de toutes les
 * traductions, les réactions et les vues embarquées, les effets de story, les
 * métadonnées libres (où vivent des jetons de liens de suivi). Le décodeur est
 * donc la SEULE barrière, et il se construit par ce qu'il garde :
 *
 * - l'audience restreinte se dit par sa TAILLE (« visible par 3 personnes »), jamais
 *   par les identifiants des personnes ;
 * - les traductions se COMPTENT (« 2 langues »), leur texte ne se garde pas ;
 * - la position, les métadonnées, les effets, les réactions ne sortent pas ;
 * - le repartage garde son type et son auteur, pas le texte de l'original (dont
 *   la route ne sert pas l'audience).
 *
 * Gardée par `canModerateContent`. Clé sous `['admin', 'posts', …]`.
 */
export type AdminPostMedia = {
  readonly id: string;
  readonly mimeType: string;
  readonly fileUrl: string | null;
  readonly thumbnailUrl: string | null;
  readonly caption: string | null;
  readonly alt: string | null;
  readonly fileSize: number | null;
  readonly durationMs: number | null;
};

export type AdminPostComment = {
  readonly id: string;
  readonly content: string | null;
  readonly author: AdminPersonRef | null;
  readonly createdAt: string | null;
};

export type AdminPostViewer = { readonly user: AdminPersonRef; readonly viewedAt: string | null };

export type AdminPostFiche = {
  readonly id: string;
  readonly type: string | null;
  readonly visibility: string | null;
  readonly restricted: boolean;
  /** La taille de l'audience choisie (`ONLY`, `EXCEPT`) ; `null` pour toute autre audience. */
  readonly audienceCount: number | null;
  readonly content: string | null;
  readonly originalLanguage: string | null;
  readonly translationCount: number;
  readonly isPinned: boolean;
  readonly isEdited: boolean;
  readonly isQuote: boolean;
  readonly moodEmoji: string | null;
  readonly contentEditedAt: string | null;
  readonly expiresAt: string | null;
  readonly deletedAt: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly author: AdminPersonRef | null;
  readonly community: { readonly id: string; readonly identifier: string; readonly name: string; readonly avatar: string | null } | null;
  readonly repostOf: { readonly id: string; readonly type: string | null; readonly author: AdminPersonRef | null } | null;
  readonly counts: {
    readonly likes: number;
    readonly comments: number;
    readonly shares: number;
    readonly views: number;
    readonly bookmarks: number;
    readonly reposts: number;
  };
  readonly commentTotal: number;
  readonly viewerTotal: number;
  readonly media: readonly AdminPostMedia[];
  readonly comments: readonly AdminPostComment[];
  readonly viewers: readonly AdminPostViewer[];
};

export const FICHE_COMMENTS = 10;
export const FICHE_VIEWERS = 12;
const COMMENT_EXCERPT = 300;

const textOrNull = (value: unknown): string | null => {
  const text = asText(value).trim();
  return text === '' ? null : text;
};

const countOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);

const present = <T>(entries: readonly (T | null)[]): readonly T[] => entries.filter((entry): entry is T => entry !== null);

const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

function decodeMedia(raw: unknown): AdminPostMedia | null {
  const media = asRecord(raw);
  if (media === null || typeof media.id !== 'string' || media.id === '') return null;
  return {
    id: media.id,
    mimeType: asText(media.mimeType),
    fileUrl: textOrNull(media.fileUrl),
    thumbnailUrl: textOrNull(media.thumbnailUrl),
    caption: textOrNull(media.caption),
    alt: textOrNull(media.alt),
    fileSize: countOrNull(media.fileSize),
    durationMs: countOrNull(media.duration),
  };
}

function decodeComment(raw: unknown): AdminPostComment | null {
  const comment = asRecord(raw);
  if (comment === null || typeof comment.id !== 'string' || comment.id === '') return null;
  return {
    id: comment.id,
    content: excerptOf(asText(comment.content), COMMENT_EXCERPT),
    author: decodeAdminPersonRef(comment.author),
    createdAt: textOrNull(comment.createdAt),
  };
}

/** Un spectateur sans personne lisible n'est pas « réparé » : il est écarté. */
function decodeViewer(raw: unknown): AdminPostViewer | null {
  const view = asRecord(raw);
  const user = decodeAdminPersonRef(view?.user);
  return view === null || user === null ? null : { user, viewedAt: textOrNull(view.viewedAt) };
}

function decodeCommunity(raw: unknown): AdminPostFiche['community'] {
  const community = asRecord(raw);
  if (community === null || typeof community.id !== 'string' || community.id === '') return null;
  return { id: community.id, identifier: asText(community.identifier), name: asText(community.name), avatar: textOrNull(community.avatar) };
}

function decodeRepostOf(raw: unknown): AdminPostFiche['repostOf'] {
  const original = asRecord(raw);
  if (original === null || typeof original.id !== 'string' || original.id === '') return null;
  return { id: original.id, type: textOrNull(original.type), author: decodeAdminPersonRef(original.author) };
}

const isChosenAudience = (visibility: string | null): boolean => visibility === 'ONLY' || visibility === 'EXCEPT';

export function decodeAdminPostFiche(raw: unknown): AdminPostFiche | null {
  const post = asRecord(raw);
  if (post === null || typeof post.id !== 'string' || post.id === '') return null;

  const visibility = textOrNull(post.visibility);
  const totals = asRecord(post._count);
  const comments = present(listOf(post.comments).map(decodeComment));
  const viewers = present(listOf(post.views).map(decodeViewer));
  const audience = Array.isArray(post.visibilityUserIds) ? post.visibilityUserIds.length : null;

  return {
    id: post.id,
    type: textOrNull(post.type),
    visibility,
    restricted: isRestrictedVisibility(visibility),
    audienceCount: isChosenAudience(visibility) ? audience : null,
    content: textOrNull(post.content),
    originalLanguage: textOrNull(post.originalLanguage),
    translationCount: Object.keys(asRecord(post.translations) ?? {}).length,
    isPinned: post.isPinned === true,
    isEdited: post.isEdited === true,
    isQuote: post.isQuote === true,
    moodEmoji: textOrNull(post.moodEmoji),
    contentEditedAt: textOrNull(post.contentEditedAt),
    expiresAt: textOrNull(post.expiresAt),
    deletedAt: textOrNull(post.deletedAt),
    createdAt: textOrNull(post.createdAt),
    updatedAt: textOrNull(post.updatedAt),
    author: decodeAdminPersonRef(post.author),
    community: decodeCommunity(post.community),
    repostOf: decodeRepostOf(post.repostOf),
    counts: {
      likes: asCount(post.likeCount),
      comments: asCount(post.commentCount),
      shares: asCount(post.shareCount),
      views: asCount(post.viewCount),
      bookmarks: asCount(post.bookmarkCount),
      reposts: asCount(post.repostCount),
    },
    commentTotal: countOrNull(totals?.comments) ?? comments.length,
    viewerTotal: countOrNull(totals?.views) ?? viewers.length,
    media: present(listOf(post.media).map(decodeMedia)),
    comments: comments.slice(0, FICHE_COMMENTS),
    viewers: viewers.slice(0, FICHE_VIEWERS),
  };
}

export const adminPostQueryKey = (postId: string) => ['admin', 'posts', 'fiche', postId] as const;

export async function loadAdminPost(
  params: AdminDeps & { readonly postId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminPostFiche | null>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.postsByPostId(params.postId),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: decodeAdminPostFiche(result.data) };
}

/** Le retrait a eu lieu. Un objet plutôt que `null` : `useAdminAction` rend `null` pour un ÉCHEC, et un succès ne doit pas s'y confondre. */
export type AdminPostRemoval = { readonly removed: true };

/**
 * **RETIRER UNE PUBLICATION** — `DELETE admin.postsByPostId`, un retrait DOUX
 * (`deletedAt`), sans restauration servie. Le motif part dans `reason` — le nom
 * du fil, que la passerelle consigne dans le journal d'audit.
 */
export async function removeAdminPost(
  params: AdminDeps & { readonly postId: string; readonly reason: string },
): Promise<ApiResult<AdminPostRemoval>> {
  const result = await params.transport.request<unknown>({
    method: 'DELETE',
    path: adminEndpoints.postsByPostId(params.postId),
    body: { reason: params.reason },
  });
  if (!result.ok) return result;
  return { ok: true, data: { removed: true } };
}
