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
 * - la position et les métadonnées ne sortent pas ; les réactions sortent par
 *   leur RÉSUMÉ (emoji → nombre), jamais par le détail de qui a réagi ;
 * - les effets de story sortent par ce qu'un modérateur doit voir — le LIEN
 *   (adresse, titre, domaine), le nombre d'autocollants, le style (texte,
 *   filtre, disposition) — jamais le blob de scène ;
 * - la piste audio d'un statut (`audioUrl`, `audioDuration`), la transcription
 *   d'un média, les compteurs d'audience (impressions, ouvertures, vues
 *   qualifiées, lectures, téléchargements), la durée de chaque vue et les
 *   compteurs de chaque commentaire sont gardés (audit 2026-10-04 : servis,
 *   jamais affichés) ;
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
  /** La transcription du média (audio, vidéo) — son TEXTE et sa langue, rien d'autre. */
  readonly transcription: { readonly text: string; readonly language: string | null } | null;
};

export type AdminPostComment = {
  readonly id: string;
  readonly content: string | null;
  readonly author: AdminPersonRef | null;
  readonly createdAt: string | null;
  readonly likeCount: number;
  readonly replyCount: number;
  readonly isEdited: boolean;
};

/** `durationMs` : le temps passé sur la publication (ms), `null` s'il n'est pas mesuré. */
export type AdminPostViewer = { readonly user: AdminPersonRef; readonly viewedAt: string | null; readonly durationMs: number | null };

/** Ce qu'une story porte et qu'un modérateur doit voir — jamais le blob de scène. */
export type AdminPostStory = {
  readonly linkUrl: string | null;
  readonly linkTitle: string | null;
  readonly linkDomain: string | null;
  readonly stickerCount: number;
  readonly textStyle: string | null;
  readonly filter: string | null;
  readonly layout: string | null;
  readonly sceneCount: number;
};

/** Les compteurs d'audience que la fiche servait sans écran (audit 2026-10-04). */
export type AdminPostMetrics = {
  readonly impressions: number;
  readonly opens: number;
  readonly qualifiedViews: number;
  readonly plays: number;
  readonly downloads: number;
};

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
  /** La piste audio d'un statut ; `null` sans piste. */
  readonly audio: { readonly url: string; readonly durationMs: number | null } | null;
  /** `null` : pas d'effets de story servis. */
  readonly story: AdminPostStory | null;
  /** Les réactions par emoji, du plus fréquent au plus rare, et leur total servi. */
  readonly reactionTally: { readonly total: number; readonly byEmoji: readonly { readonly emoji: string; readonly count: number }[] };
  readonly metrics: AdminPostMetrics;
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
    transcription: decodeTranscription(media.transcription),
  };
}

function decodeTranscription(raw: unknown): AdminPostMedia['transcription'] {
  const transcription = asRecord(raw);
  const text = textOrNull(transcription?.text);
  return text === null ? null : { text, language: textOrNull(transcription?.language) };
}

/** Le domaine d'une adresse, lu par `URL` — une adresse illisible n'a pas de domaine. */
function domainOf(url: string | null): string | null {
  if (url === null) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

/**
 * Les effets d'une story, réduits à ce qui se modère. Deux formes cohabitent :
 * l'ancienne (`linkUrl`, `stickers[]`, `textStyle`, `filter`) et le document de
 * scènes v3 (`scenes[].objects[]` de genre `sticker`, `layout`). Les deux se
 * lisent ; rien d'autre ne sort.
 */
function decodeStory(raw: unknown): AdminPostStory | null {
  const effects = asRecord(raw);
  if (effects === null) return null;
  const preview = asRecord(effects.linkPreview);
  const linkUrl = textOrNull(effects.linkUrl);
  const scenes = listOf(effects.scenes).map(asRecord).filter((scene): scene is Readonly<Record<string, unknown>> => scene !== null);
  const sceneStickers = scenes.reduce((sum, scene) => sum + listOf(scene.objects).filter((object) => asRecord(object)?.kind === 'sticker').length, 0);
  return {
    linkUrl,
    linkTitle: textOrNull(preview?.title),
    linkDomain: textOrNull(preview?.domain) ?? domainOf(linkUrl),
    stickerCount: listOf(effects.stickers).length + sceneStickers,
    textStyle: textOrNull(effects.textStyle),
    filter: textOrNull(effects.filter),
    layout: textOrNull(effects.layout),
    sceneCount: scenes.length,
  };
}

function decodeReactionTally(summary: unknown, total: unknown): AdminPostFiche['reactionTally'] {
  const byEmoji = Object.entries(asRecord(summary) ?? {})
    .map(([emoji, count]) => ({ emoji, count: asCount(count) }))
    .filter((entry) => entry.emoji.trim() !== '' && entry.count > 0)
    .sort((left, right) => right.count - left.count);
  const summed = byEmoji.reduce((sum, entry) => sum + entry.count, 0);
  return { total: countOrNull(total) ?? summed, byEmoji };
}

function decodeAudio(url: unknown, duration: unknown): AdminPostFiche['audio'] {
  const src = textOrNull(url);
  return src === null ? null : { url: src, durationMs: countOrNull(duration) };
}

function decodeComment(raw: unknown): AdminPostComment | null {
  const comment = asRecord(raw);
  if (comment === null || typeof comment.id !== 'string' || comment.id === '') return null;
  return {
    id: comment.id,
    content: excerptOf(asText(comment.content), COMMENT_EXCERPT),
    author: decodeAdminPersonRef(comment.author),
    createdAt: textOrNull(comment.createdAt),
    likeCount: asCount(comment.likeCount),
    replyCount: asCount(comment.replyCount),
    isEdited: comment.isEdited === true,
  };
}

/** Un spectateur sans personne lisible n'est pas « réparé » : il est écarté. */
function decodeViewer(raw: unknown): AdminPostViewer | null {
  const view = asRecord(raw);
  const user = decodeAdminPersonRef(view?.user);
  return view === null || user === null ? null : { user, viewedAt: textOrNull(view.viewedAt), durationMs: countOrNull(view.duration) };
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
    audio: decodeAudio(post.audioUrl, post.audioDuration),
    story: decodeStory(post.storyEffects),
    reactionTally: decodeReactionTally(post.reactionSummary, post.reactionCount),
    metrics: {
      impressions: asCount(post.impressionCount),
      opens: asCount(post.postOpenCount),
      qualifiedViews: asCount(post.qualifiedViewCount),
      plays: asCount(post.playCount),
      downloads: asCount(post.downloadCount),
    },
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
 * Un motif ABSENT (`null`/`undefined`) part sans `reason` : la passerelle l'admet du seul rang souverain (spec 2026-10-04 § 4) et refuse les autres.
 */
export async function removeAdminPost(
  params: AdminDeps & { readonly postId: string; readonly reason?: string | null },
): Promise<ApiResult<AdminPostRemoval>> {
  const result = await params.transport.request<unknown>({
    method: 'DELETE',
    path: adminEndpoints.postsByPostId(params.postId),
    body: params.reason === null || params.reason === undefined ? {} : { reason: params.reason },
  });
  if (!result.ok) return result;
  return { ok: true, data: { removed: true } };
}
