import { apiService } from './api.service';
import { buildApiUrl } from '@/lib/config';
import { getCurrentInterfaceLocale } from '@/stores/language-store';
import type {
  Post,
  PostComment,
  PostType,
  PostVisibility,
  PostView,
} from '@meeshy/shared/types/post';
import type { PostReferenceInput } from '@meeshy/shared/types/post-reference';

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

export interface MobileTranscriptionSegment {
  readonly text: string;
  readonly start?: number;
  readonly end?: number;
  readonly speaker_id?: string;
}

export interface MobileTranscription {
  readonly text: string;
  readonly language: string;
  readonly confidence?: number;
  readonly duration_ms?: number;
  readonly segments?: MobileTranscriptionSegment[];
}

export interface CreatePostRequest {
  readonly type?: PostType;
  readonly visibility?: PostVisibility;
  readonly visibilityUserIds?: string[];
  readonly content?: string;
  readonly communityId?: string;
  readonly storyEffects?: Record<string, unknown>;
  readonly moodEmoji?: string;
  readonly audioUrl?: string;
  readonly audioDuration?: number;
  readonly originalLanguage?: string;
  readonly mediaIds?: string[];
  /**
   * Alt text per media (accessibility, `PostMedia.alt`) — key is one of the
   * ids in `mediaIds` above; the gateway ignores any key absent from it.
   */
  readonly mediaAlt?: Record<string, string>;
  readonly mobileTranscription?: MobileTranscription;
  /** Declared, non-INLINE references only — absent (not `[]`) when not touched (tri-state). */
  readonly mentions?: readonly PostReferenceInput[];
  /**
   * Author opt-in: extract the soundtrack of the post's VIDEOS into the
   * sound library (credited to the author). Governs video demuxing only —
   * audio-only media always feeds the library regardless of this flag.
   */
  readonly allowSoundExtraction?: boolean;
}

export interface UpdatePostRequest {
  readonly content?: string;
  /**
   * Conversion POST↔RÉEL par l'édition — W8. `UpdatePostSchema.type` (gateway)
   * n'accepte que `POST`/`REEL` : l'édition ne convertit jamais vers/depuis
   * STORY ou STATUS, ce rôle appartient au REPOST (loi 5), pas à l'édition.
   * `undefined` = inchangé — l'omettre n'est PAS la même chose que le
   * répéter, exactement comme les autres champs de ce type.
   */
  readonly type?: PostType;
  readonly visibility?: PostVisibility;
  readonly visibilityUserIds?: string[];
  readonly storyEffects?: Record<string, unknown>;
  readonly moodEmoji?: string;
  /** Ids of attached media (PostMedia) to detach during the edit. */
  readonly removeMediaIds?: readonly string[];
  /** Ids of freshly uploaded media (postId=null) to attach during the edit. */
  readonly mediaIds?: readonly string[];
  /**
   * Alt text per media — same contract as `CreatePostRequest.mediaAlt`: key
   * is one of the ids in `mediaIds` above, ignored otherwise. Media already
   * attached to the post cannot be re-tagged through this channel.
   */
  readonly mediaAlt?: Record<string, string>;
  /**
   * Declared, non-INLINE references only — TRI-STATE, exactly like
   * `CreatePostRequest.mentions` above: absent preserves the declared set,
   * `[]` erases it, a populated list replaces it. A composer that doesn't
   * surface a reference picker MUST leave this field untouched — sending `[]`
   * would silently destroy every reference the author declared, on every
   * unrelated edit (caption tweak, visibility change, media removal).
   */
  readonly mentions?: readonly PostReferenceInput[];
  /** Opt-in extraction of the video soundtrack — `undefined` = unchanged. */
  readonly allowSoundExtraction?: boolean;
}

export interface RepostRequest {
  readonly content?: string;
  readonly isQuote?: boolean;
  /**
   * Format du repost — **loi du miroir** (directive produit 2026-08-23).
   *
   * Le format suit celui de la CARTE sur laquelle l'utilisateur a agi ;
   * reposter dans un AUTRE format est le geste d'**ancrage** — « garder ça
   * pour de bon ». Une story repartagée reste éphémère (20 h) ; la reposter en
   * `POST` la rend permanente.
   *
   * Le champ manquait entièrement côté web : tous les sites envoyaient
   * `{ isQuote: false }`, le gateway retombait sur son défaut `?? POST`
   * (`PostService.repostPost`), et **republier une story fabriquait donc un
   * post permanent en silence** — le geste disait « repartager », le résultat
   * disait « ancrer ». Un réel y perdait aussi sa nature et quittait le fil
   * des réels.
   *
   * Le champ est OPTIONNEL au TYPE parce que le gateway garde un filet pour
   * les clients qui l'ignorent — pas parce qu'un site web pourrait s'en
   * passer. Tout site web qui affiche un repost connaît le type de sa carte et
   * DOIT l'envoyer.
   *
   * Le compilateur ne le vérifie pas — mais depuis W8, ce n'est plus « les
   * tests par site d'appel » qui tiennent la loi : `useComposerRepost`
   * (`hooks/composer/useComposerRepost.ts`) est le site UNIQUE qui construit
   * cette charge, et `useComposerRepost.test.ts` est la suite unique qui la
   * tient. Chaque écran (`PostsFeedScreen`, `ReelsFeedScreen`, les pages de
   * détail post/réel/story) résout SON `targetId` — `repostTargetId()` pour
   * les surfaces de carte, `story.id` pour le viewer de story qui en est
   * délibérément exclu (`packages/shared/utils/repost-target.ts`) — puis
   * appelle ce site unique. Un site qui construirait cette charge à la main
   * au lieu d'appeler `useComposerRepost` reviendrait à l'état d'avant W8.
   */
  readonly targetType?: PostType;
}

export interface SharePostOptions {
  readonly platform?: string;
  /**
   * Mints a per-caller tracking link (`meeshy.me/l/<token>`) the gateway can
   * attribute clicks back to, mirroring iOS `POST /posts/:id/share
   * {generateLink:true}`. Reusing an existing link does NOT re-increment
   * `shareCount` — the counter tracks unique sharers, not repeated taps.
   */
  readonly generateLink?: boolean;
}

export interface SharePostResponse {
  readonly shared: boolean;
  readonly shareCount: number;
  readonly shortUrl?: string;
  readonly token?: string;
}

/**
 * Surface a post impression originates from. Mirrors the gateway's accepted
 * `source` enum (`/posts/:postId/impression` + `/posts/impressions/batch`) and
 * iOS `PostService.recordImpression(s)`. `feed` is used for both the posts feed
 * and the reels thread; `detail` additionally bumps `postOpenCount` server-side.
 */
export type ImpressionSource =
  | 'feed'
  | 'profile'
  | 'search'
  | 'shared_link'
  | 'notification'
  | 'detail'
  | 'story'
  | 'status';

/** Max impression OCCURRENCES the gateway accepts per `/posts/impressions/batch`
 * call. Repeated ids are legitimate (one impression per appearance) and each
 * consumes a slot — the gateway groups them and increments by the count. */
const IMPRESSION_BATCH_LIMIT = 50;

/**
 * Surface a media download originates from. Mirrors the gateway's
 * `DOWNLOAD_SURFACES` (`services/gateway/src/routes/posts/types.ts`).
 */
export type DownloadSurface = 'feed' | 'detail' | 'reel';

export interface FeedFilters {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface CursorPaginatedResponse<T> {
  readonly success: boolean;
  readonly data: T[];
  readonly meta: {
    readonly pagination: {
      readonly total: number;
      readonly offset: number;
      readonly limit: number;
      readonly hasMore: boolean;
    };
    readonly nextCursor: string | null;
  };
}

export interface ReelFeedFilters {
  readonly cursor?: string;
  readonly limit?: number;
  /** Seed reel id — anchors the affinity thread when a reel is opened from the feed. */
  readonly seed?: string;
}

// The reels feed mirrors the gateway `sendSuccess()` envelope: the cursor lives
// at the top-level `pagination`, not under `meta` (matches `/posts/feed/reels`).
export interface ReelsFeedResponse {
  readonly success: boolean;
  readonly data: Post[];
  readonly pagination?: {
    readonly limit: number;
    readonly hasMore: boolean;
    readonly nextCursor: string | null;
  };
  readonly meta?: { readonly mentionedUsers?: readonly unknown[] };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildQuery(filters: FeedFilters): string {
  const params = new URLSearchParams();
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// apiService.get<T>() returns ApiResponse<T> = { success, data: T }
// The server response body is at response.data
// For cursor-paginated endpoints, the body IS the CursorPaginatedResponse
function unwrap<T>(response: { data?: T }): T {
  return response.data as T;
}

interface OriginalLanguageCreateInput {
  readonly originalLanguage?: string;
  readonly storyEffects?: Record<string, unknown>;
  readonly content?: string;
}

/**
 * F5 — `originalLanguage` corrigé pour les créations à `storyEffects`
 * (composer story), affiné par F7d (constat 20/21, arbitrage 8, addendum
 * rév. 2) : `PostsFeedScreen.handleStoryPublish` envoyait déjà le champ,
 * mais avec la langue de LECTURE préférée du LECTEUR (`userLanguage`) — un
 * concept différent de la langue du CONTENU publié. Résolu ici depuis la
 * locale d'INTERFACE active de l'AUTEUR (`getCurrentInterfaceLocale` — le
 * mécanisme de langue UI existant du web, PAS `resolveUserLanguage`, qui
 * résout la langue de LECTURE préférée).
 *
 * Elle ne part QUE pour une story SANS texte : dès qu'un `content` est
 * présent, le serveur détecte la langue depuis le texte lui-même
 * (`detectLanguage`), plus fiable qu'une locale d'interface qui peut
 * diverger de la langue effectivement écrite (un francophone d'interface
 * peut écrire en anglais). Un `originalLanguage` déjà fourni par l'appelant
 * (ex. langue détectée par la transcription audio) n'est jamais écrasé.
 * Sans `storyEffects`, ou sans langue connue, le champ reste absent : la
 * détection serveur reste le repli — ne jamais envoyer une langue devinée
 * fausse qui la court-circuiterait.
 *
 * Exportée : `story.service.ts#createStory` est le VRAI point de
 * publication du composer story web (`postsService.createPost` n'a aucun
 * appelant `storyEffects` en production — le composer publie via
 * `PostsFeedScreen.handleStoryPublish` → `useCreateStoryMutation` →
 * `storyService.createStory`) ; les deux funnels partagent ce résolveur
 * unique plutôt que de dupliquer la règle.
 */
export function resolveOriginalLanguageForCreate(data: OriginalLanguageCreateInput): string | undefined {
  if (data.originalLanguage) return data.originalLanguage;
  if (!data.storyEffects) return undefined;
  if (data.content?.trim()) return undefined;
  return getCurrentInterfaceLocale() || undefined;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const postsService = {
  // ── Feed ────────────────────────────────────────────────────────────────

  async getFeed(filters: FeedFilters = {}): Promise<CursorPaginatedResponse<Post>> {
    const response = await apiService.get<CursorPaginatedResponse<Post>>(`/posts/feed${buildQuery(filters)}`);
    return unwrap(response);
  },

  async getPostsByHashtag(tag: string, filters: { cursor?: string; limit?: number } = {}): Promise<CursorPaginatedResponse<Post>> {
    const params = new URLSearchParams();
    if (filters.cursor) params.set('cursor', filters.cursor);
    if (filters.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    const response = await apiService.get<CursorPaginatedResponse<Post>>(`/posts/hashtag/${tag}${qs ? `?${qs}` : ''}`);
    return unwrap(response);
  },

  async getTrendingHashtags(limit: number = 20): Promise<{ tag: string; usageCount: number }[]> {
    const response = await apiService.get<{ success: boolean; data: { tag: string; usageCount: number }[] }>(`/hashtags/trending?limit=${limit}`);
    return unwrap(unwrap(response));
  },

  async getReelsFeed(filters: ReelFeedFilters = {}): Promise<ReelsFeedResponse> {
    const params = new URLSearchParams();
    if (filters.cursor) params.set('cursor', filters.cursor);
    if (filters.limit) params.set('limit', String(filters.limit));
    if (filters.seed) params.set('seed', filters.seed);
    const qs = params.toString();
    const response = await apiService.get<ReelsFeedResponse>(`/posts/feed/reels${qs ? `?${qs}` : ''}`);
    return unwrap(response);
  },

  async getStatuses(filters: FeedFilters = {}): Promise<CursorPaginatedResponse<Post>> {
    const response = await apiService.get<CursorPaginatedResponse<Post>>(`/posts/feed/statuses${buildQuery(filters)}`);
    return unwrap(response);
  },

  async getStatusesDiscover(filters: FeedFilters = {}): Promise<CursorPaginatedResponse<Post>> {
    const response = await apiService.get<CursorPaginatedResponse<Post>>(`/posts/feed/statuses/discover${buildQuery(filters)}`);
    return unwrap(response);
  },

  async getUserPosts(userId: string, filters: FeedFilters = {}): Promise<CursorPaginatedResponse<Post>> {
    const response = await apiService.get<CursorPaginatedResponse<Post>>(`/posts/user/${userId}${buildQuery(filters)}`);
    return unwrap(response);
  },

  async getCommunityPosts(communityId: string, filters: FeedFilters = {}): Promise<CursorPaginatedResponse<Post>> {
    const response = await apiService.get<CursorPaginatedResponse<Post>>(`/posts/community/${communityId}${buildQuery(filters)}`);
    return unwrap(response);
  },

  async getBookmarks(filters: FeedFilters = {}): Promise<CursorPaginatedResponse<Post>> {
    const response = await apiService.get<CursorPaginatedResponse<Post>>(`/posts/bookmarks${buildQuery(filters)}`);
    return unwrap(response);
  },

  // ── Single Post ─────────────────────────────────────────────────────────

  async getPost(postId: string): Promise<{ success: boolean; data: Post }> {
    const response = await apiService.get<{ success: boolean; data: Post }>(`/posts/${postId}`);
    return unwrap(response);
  },

  // ── CRUD ────────────────────────────────────────────────────────────────

  async createPost(data: CreatePostRequest): Promise<{ success: boolean; data: Post }> {
    const originalLanguage = resolveOriginalLanguageForCreate(data);
    const body = originalLanguage ? { ...data, originalLanguage } : data;
    const response = await apiService.post<{ success: boolean; data: Post }>('/posts', body);
    return unwrap(response);
  },

  /**
   * Publie une pièce jointe déjà reçue en conversation, sans la retélécharger :
   * le fichier existe sur le stockage, la passerelle le duplique là-bas.
   *
   * `target` omis laisse la règle partagée choisir d'après le type MIME (image
   * → POST, vidéo/son → REEL). Une STORY se demande explicitement : elle expire.
   */
  async publishAttachment(data: {
    readonly attachmentId: string;
    readonly target?: 'POST' | 'REEL' | 'STORY';
    readonly content?: string;
    readonly visibility?: PostVisibility;
    readonly capturedInApp?: boolean;
  }): Promise<{ success: boolean; data: Post }> {
    const response = await apiService.post<{ success: boolean; data: Post }>('/posts/from-attachment', data);
    return unwrap(response);
  },

  async updatePost(postId: string, data: UpdatePostRequest): Promise<{ success: boolean; data: Post }> {
    const response = await apiService.put<{ success: boolean; data: Post }>(`/posts/${postId}`, data);
    return unwrap(response);
  },

  async deletePost(postId: string): Promise<{ success: boolean; data: { deleted: boolean } }> {
    const response = await apiService.delete<{ success: boolean; data: { deleted: boolean } }>(`/posts/${postId}`);
    return unwrap(response);
  },

  // ── Interactions ────────────────────────────────────────────────────────

  async likePost(postId: string, emoji = '❤️'): Promise<unknown> {
    const response = await apiService.post(`/posts/${postId}/like`, { emoji });
    return unwrap(response);
  },

  async unlikePost(postId: string): Promise<unknown> {
    const response = await apiService.delete(`/posts/${postId}/like`);
    return unwrap(response);
  },

  async bookmarkPost(postId: string): Promise<{ bookmarked: boolean }> {
    const response = await apiService.post<{ bookmarked: boolean }>(`/posts/${postId}/bookmark`);
    return unwrap(response);
  },

  async unbookmarkPost(postId: string): Promise<{ bookmarked: boolean }> {
    const response = await apiService.delete<{ bookmarked: boolean }>(`/posts/${postId}/bookmark`);
    return unwrap(response);
  },

  async repost(postId: string, data: RepostRequest = {}): Promise<{ success: boolean; data: Post }> {
    const response = await apiService.post<{ success: boolean; data: Post }>(`/posts/${postId}/repost`, data);
    return unwrap(response);
  },

  /**
   * `platform` accepts either the legacy bare string (backward-compatible
   * with `useSharePostMutation`) or a {@link SharePostOptions} object to also
   * request a tracking link (`generateLink: true`) — see {@link SharePostResponse}.
   */
  async sharePost(postId: string, platform?: string | SharePostOptions): Promise<SharePostResponse> {
    const options: SharePostOptions = typeof platform === 'string' ? { platform } : (platform ?? {});
    const body: Record<string, unknown> = {};
    if (options.platform) body.platform = options.platform;
    if (options.generateLink) body.generateLink = true;
    const response = await apiService.post<SharePostResponse>(
      `/posts/${postId}/share`,
      Object.keys(body).length > 0 ? body : undefined,
    );
    return unwrap(response);
  },

  async pinPost(postId: string): Promise<{ pinned: boolean }> {
    const response = await apiService.post<{ pinned: boolean }>(`/posts/${postId}/pin`);
    return unwrap(response);
  },

  async unpinPost(postId: string): Promise<{ pinned: boolean }> {
    const response = await apiService.delete<{ pinned: boolean }>(`/posts/${postId}/pin`);
    return unwrap(response);
  },

  async viewPost(postId: string, duration?: number): Promise<{ viewed: boolean }> {
    const response = await apiService.post<{ viewed: boolean }>(
      `/posts/${postId}/view`,
      duration ? { duration } : undefined,
    );
    return unwrap(response);
  },

  async getPostViews(postId: string, limit = 50, offset = 0): Promise<{ items: PostView[]; pagination: { total: number; offset: number; limit: number; hasMore: boolean } }> {
    const response = await apiService.get<{ items: PostView[]; pagination: { total: number; offset: number; limit: number; hasMore: boolean } }>(
      `/posts/${postId}/views?limit=${limit}&offset=${offset}`,
    );
    return unwrap(response);
  },

  // ── Impressions ─────────────────────────────────────────────────────────
  // A lightweight "this post entered the viewport" reach signal feeding
  // `impressionCount`, distinct from `viewPost` (`viewCount`). Mirrors iOS
  // `PostService.recordImpressions` / `recordImpression`. The batch endpoint
  // caps at IMPRESSION_BATCH_LIMIT ids, so longer runs are chunked here.

  async recordImpressions(postIds: readonly string[], source: ImpressionSource = 'feed'): Promise<void> {
    if (postIds.length === 0) return;
    for (let i = 0; i < postIds.length; i += IMPRESSION_BATCH_LIMIT) {
      const chunk = postIds.slice(i, i + IMPRESSION_BATCH_LIMIT);
      await apiService.post('/posts/impressions/batch', { postIds: chunk, source });
    }
  },

  async recordImpression(postId: string, source: ImpressionSource = 'detail'): Promise<void> {
    await apiService.post(`/posts/${postId}/impression`, { source });
  },

  // ── Downloads ────────────────────────────────────────────────────────────
  // Best-effort analytics ping for "Save media" (PostCard/PostDetail/ReelPlayer,
  // lightbox `<a download>` pattern) — never throws, a failed ping must not
  // block the download the browser already triggered.

  async recordMediaDownloads(
    postId: string,
    mediaIds: readonly string[],
    surface: DownloadSurface = 'detail',
  ): Promise<void> {
    if (mediaIds.length === 0) return;
    try {
      await apiService.post(`/posts/${postId}/downloads`, { mediaIds, surface });
    } catch {
      // fire-and-forget : ne jamais bloquer le téléchargement
    }
  },

  // ── Translation ─────────────────────────────────────────────────────────

  async translatePost(postId: string, targetLanguage: string): Promise<{ requested: boolean; targetLanguage: string }> {
    const response = await apiService.post<{ requested: boolean; targetLanguage: string }>(
      `/posts/${postId}/translate`,
      { targetLanguage },
    );
    return unwrap(response);
  },

  // ── Comments ────────────────────────────────────────────────────────────

  async getComments(postId: string, filters: FeedFilters = {}): Promise<CursorPaginatedResponse<PostComment>> {
    const response = await apiService.get<CursorPaginatedResponse<PostComment>>(`/posts/${postId}/comments${buildQuery(filters)}`);
    return unwrap(response);
  },

  async getCommentReplies(postId: string, commentId: string, filters: FeedFilters = {}): Promise<CursorPaginatedResponse<PostComment>> {
    const response = await apiService.get<CursorPaginatedResponse<PostComment>>(`/posts/${postId}/comments/${commentId}/replies${buildQuery(filters)}`);
    return unwrap(response);
  },

  async createComment(postId: string, content: string, parentId?: string): Promise<{ success: boolean; data: PostComment }> {
    const response = await apiService.post<{ success: boolean; data: PostComment }>(
      `/posts/${postId}/comments`,
      parentId ? { content, parentId } : { content },
    );
    return unwrap(response);
  },

  async deleteComment(postId: string, commentId: string): Promise<{ success: boolean; data: { deleted: boolean } }> {
    const response = await apiService.delete<{ success: boolean; data: { deleted: boolean } }>(`/posts/${postId}/comments/${commentId}`);
    return unwrap(response);
  },

  async likeComment(postId: string, commentId: string, emoji = '❤️'): Promise<unknown> {
    const response = await apiService.post(`/posts/${postId}/comments/${commentId}/like`, { emoji });
    return unwrap(response);
  },

  async unlikeComment(postId: string, commentId: string): Promise<unknown> {
    const response = await apiService.delete(`/posts/${postId}/comments/${commentId}/like`);
    return unwrap(response);
  },

};

/**
 * Ping de vue anonyme (fire-and-forget). N'attache PAS de JWT (parcours anonyme) :
 * seul `x-session-token` part comme clé de dédup opaque. Le gateway no-op si un
 * JWT est présent ou si le post n'est pas public. buildApiUrl préfixe /api/v1.
 */
export async function recordAnonymousView(postId: string, sessionKey: string): Promise<void> {
  try {
    await fetch(buildApiUrl(`/posts/${postId}/anonymous-view`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': sessionKey },
    });
  } catch {
    // fire-and-forget : ne jamais bloquer le rendu
  }
}
