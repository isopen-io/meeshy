'use client';

import { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { buildAttachmentUrl } from '@/utils/attachment-url';
import { formatDuration } from '@/utils/audio-formatters';
import { ArrowDownToLine, Download, Repeat2 } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import { Avatar } from './Avatar';
import { LanguageOrb } from './LanguageOrb';
import { TranslationToggle } from './TranslationToggle';
import { CommentList } from './CommentList';
import { PostContentText } from './PostContentText';
import { ReferenceNoteRow } from './ReferenceNoteRow';
import { BackgroundSoundBadge, type BackgroundSoundMeta } from './BackgroundSoundBadge';
import type { TranslationItem } from './TranslationToggle';
import type { Post, PostComment } from '@meeshy/shared/types/post';
import type { BackgroundSoundV3 } from '@meeshy/shared/types/canvas-v3';
import { getLanguageName } from './flags';
import { formatCompactNumber } from '@/utils/format-number';
import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REACTION_EMOJIS = ['❤️', '🔥', '😂', '😮', '😢', '👏'];

function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function postTranslationsToItems(translations: unknown): TranslationItem[] {
  if (!translations || typeof translations !== 'object') return [];
  return Object.entries(translations as Record<string, { text?: string }>)
    .filter(([, v]) => v && typeof v.text === 'string')
    .map(([lang, v]) => ({
      languageCode: lang,
      languageName: lang.toUpperCase(),
      content: v.text!,
    }));
}

const formatCount = formatCompactNumber;

/**
 * Same `<a download>` DOM pattern as the chat lightboxes
 * (ImageLightbox/VideoLightbox `handleDownload`) — a browser-native save,
 * no service call.
 */
function triggerMediaDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function downloadFileName(media: { id: string; mimeType: string; alt?: string | null }): string {
  const ext = media.mimeType.split('/')[1]?.split(';')[0];
  return ext ? `${media.alt || media.id}.${ext}` : media.alt || media.id;
}

type RepostMediaItem = {
  id: string;
  mimeType: string;
  fileUrl: string;
  thumbnailUrl?: string | null;
  alt?: string | null;
  duration?: number | null;
};

/**
 * Nested-card media tile for a repost's original media — image / video /
 * audio, mirroring PostCard's `PostMediaTile` (PostDetail's own top-level
 * media grid predates audio support, so the nested grid needs its own
 * complete tile rather than reusing that incomplete one).
 */
function RepostMediaTile({
  media,
  onDownload,
  downloadLabel,
}: {
  media: RepostMediaItem;
  onDownload?: (media: RepostMediaItem) => void;
  downloadLabel: string;
}) {
  return (
    <div className="group relative rounded-lg overflow-hidden bg-[var(--gp-parchment)] aspect-square">
      {onDownload && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDownload(media);
          }}
          className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          aria-label={downloadLabel}
        >
          <Download className="w-4 h-4" />
        </button>
      )}
      {media.mimeType.startsWith('image/') && (
        <img
          src={buildAttachmentUrl(media.thumbnailUrl ?? media.fileUrl) ?? undefined}
          alt={media.alt ?? ''}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      )}
      {media.mimeType.startsWith('video/') && (
        <video src={buildAttachmentUrl(media.fileUrl) ?? undefined} className="w-full h-full object-cover" muted />
      )}
      {media.mimeType.startsWith('audio/') && (
        <div
          data-testid="post-detail-repost-audio-tile"
          className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-[var(--gp-terracotta)]"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {typeof media.duration === 'number' && (
            <span className="text-xs font-medium text-[var(--gp-text-secondary)]">
              {formatDuration(media.duration)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostDetailProps {
  post: Post;
  comments: PostComment[];
  currentUserId?: string | null;
  currentUser?: { username: string; avatar?: string | null } | null;
  userLanguage?: string;
  /** Prisme ordonné (rangs 1→4) pour l'auto-résolution de `TranslationToggle`. */
  preferredLanguages?: string[];
  /**
   * L'annonce du fond + bouton 🔇 (B3.3-6) — n'existe (n'est rendue) QUE si
   * une piste `sound` v3 existe (B3.5). Mêmes props que `PostCard` (constat 2,
   * F7c) : le détail est la 2e des 3 surfaces requises (carte, détail, plein
   * écran), jamais alimentée avant ce correctif.
   */
  backgroundSound?: BackgroundSoundV3 | null;
  backgroundSoundMeta?: BackgroundSoundMeta;
  /** État muet du lecteur LOCAL que le bouton 🔇 bascule. */
  backgroundSoundMuted?: boolean;
  onToggleBackgroundSoundMute?: () => void;
  isLiked?: boolean;
  isBookmarked?: boolean;
  userReaction?: string;
  likedCommentIds?: Set<string>;
  commentsLoading?: boolean;
  commentsHasMore?: boolean;
  commentsLoadingMore?: boolean;
  onLike?: () => void;
  onUnlike?: () => void;
  onReact?: (emoji: string) => void;
  onBookmark?: () => void;
  onUnbookmark?: () => void;
  onShare?: () => void;
  onRepost?: () => void;
  /**
   * L'ANCRAGE — « garder ça pour de bon » : republier la carte en POST
   * permanent, à côté du repost qui, lui, miroite le format de la source.
   * Jumeau de `StoryViewer.onRepostAsPost`.
   *
   * C'est l'HÔTE qui décide de le câbler ou non : la carte ne sait pas si le
   * miroir mènerait à de l'éphémère sans recours.
   */
  onRepostAsPost?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onReport?: () => void;
  onDownloadMedia?: (mediaId: string) => void;
  /** Media download inside the nested `repostOf` card — targets the ORIGINAL's media. */
  onDownloadRepostMedia?: (mediaId: string) => void;
  /** Tap on the repost banner or nested card — navigates to the ORIGINAL post. */
  onTapRepost?: (repostId: string) => void;
  onTranslate?: () => void;
  onSubmitComment?: (content: string, parentId?: string) => void;
  onLoadMoreComments?: () => void;
  onLikeComment?: (commentId: string) => void;
  onUnlikeComment?: (commentId: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onShowReplies?: (commentId: string) => void;
  /** Commentaire ciblé par une navigation depuis une notification. */
  targetCommentId?: string | null;
  /** Parent top-level quand `targetCommentId` est une réponse (`?parent=`). */
  targetParentCommentId?: string | null;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function PostDetail({
  post,
  comments,
  currentUserId,
  currentUser,
  userLanguage,
  preferredLanguages,
  backgroundSound,
  backgroundSoundMeta,
  backgroundSoundMuted = true,
  onToggleBackgroundSoundMute,
  isLiked = false,
  isBookmarked = false,
  userReaction,
  likedCommentIds,
  commentsLoading = false,
  commentsHasMore = false,
  commentsLoadingMore = false,
  onLike,
  onUnlike,
  onReact,
  onBookmark,
  onUnbookmark,
  onShare,
  onRepost,
  onRepostAsPost,
  onDelete,
  onEdit,
  onReport,
  onDownloadMedia,
  onDownloadRepostMedia,
  onTapRepost,
  onTranslate,
  onSubmitComment,
  onLoadMoreComments,
  onLikeComment,
  onUnlikeComment,
  onDeleteComment,
  onShowReplies,
  targetCommentId,
  targetParentCommentId,
  className,
}: PostDetailProps) {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const { t } = useI18n('components');
  const translationItems = useMemo(() => postTranslationsToItems(post.translations), [post.translations]);

  // Le corps effectivement servi, tenu par la rangée de drapeaux. `null` tant
  // qu'elle n'a rien annoncé : on retombe alors sur le contenu du post, ce qui
  // est exactement l'état d'un post sans traduction.
  const [displayedContent, setDisplayedContent] = useState<string | null>(null);
  const handleDisplayedChange = useCallback(
    (version: { content: string }) => setDisplayedContent(version.content),
    [],
  );
  const isAuthor = currentUserId === post.authorId;
  // Accent du contenu — MÊME graine qu'iOS (`authorAccentColor`, shared) :
  // l'identifiant d'abord. C'est lui qui trace le contour des actions que le
  // lecteur a lui-même faites.
  const postAccent = authorAccentColor(post.authorId, post.author?.displayName ?? post.author?.username ?? '');
  const hasReactions = post.reactionSummary && Object.keys(post.reactionSummary).length > 0;

  const repostOf = post.repostOf;
  const repostTranslationItems = useMemo(() => postTranslationsToItems(repostOf?.translations), [repostOf?.translations]);
  const repostMedia = repostOf?.media;
  const hasRepostMedia = repostMedia && repostMedia.length > 0;
  /**
   * A SIMPLE repost has no engagement of its own worth surfacing — the outer
   * stats bar shows the ORIGINAL's counts instead (product rule 2026-08-11).
   * A QUOTE keeps its own outer counts; the nested row then carries the
   * original's, so the same numbers never render twice on one card.
   */
  const displayLikeCount = repostOf && !post.isQuote ? repostOf.likeCount ?? post.likeCount : post.likeCount;
  const displayCommentCount = repostOf && !post.isQuote ? repostOf.commentCount ?? post.commentCount : post.commentCount;
  const displayViewCount = repostOf && !post.isQuote ? repostOf.viewCount ?? post.viewCount : post.viewCount;

  const handleLikeToggle = useCallback(() => {
    onLike?.();
  }, [onLike]);

  const handleBookmarkToggle = useCallback(() => {
    onBookmark?.();
  }, [onBookmark]);

  const handleTapRepost = useCallback(() => {
    if (repostOf?.id) onTapRepost?.(repostOf.id);
  }, [repostOf?.id, onTapRepost]);

  const repostClickableProps = onTapRepost && repostOf?.id
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick: (e: React.MouseEvent) => { e.stopPropagation(); handleTapRepost(); },
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTapRepost(); }
        },
      }
    : {};

  const handleDownloadRepostMedia = onDownloadRepostMedia
    ? (m: RepostMediaItem) => {
        triggerMediaDownload(buildAttachmentUrl(m.fileUrl) ?? m.fileUrl, downloadFileName(m));
        onDownloadRepostMedia(m.id);
      }
    : undefined;

  return (
    <div className={cn('max-w-2xl mx-auto', className)} data-testid="post-detail">
      {/* Post content */}
      <div className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] overflow-hidden mb-4">
        <div className="p-5">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <Avatar
              name={post.author?.username ?? '?'}
              src={post.author?.avatar ?? undefined}
              size="lg"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--gp-text-primary)]">
                  {post.author?.displayName ?? post.author?.username ?? 'Unknown'}
                </span>
                {post.originalLanguage && (
                  <LanguageOrb code={post.originalLanguage} size="sm" pulse={false} className="w-6 h-6 text-sm" />
                )}
                {post.isPinned && (
                  <span className="text-xs bg-[var(--gp-terracotta)]/10 text-[var(--gp-terracotta)] px-2 py-0.5 rounded-full">
                    Pinned
                  </span>
                )}
              </div>
              <span className="text-sm text-[var(--gp-text-muted)]">{formatTime(post.createdAt)}</span>
            </div>

            {/* Constat 2 (F7c) — l'annonce du fond + bouton 🔇 (B3.3-6), 2e
                des 3 surfaces (B3.6 : carte, détail, plein écran) : n'existe
                que si `backgroundSound` existe (B3.5), sinon rend rien. */}
            <BackgroundSoundBadge
              sound={backgroundSound}
              title={backgroundSoundMeta?.title}
              username={backgroundSoundMeta?.username}
              durationSeconds={backgroundSoundMeta?.durationSeconds}
              muted={backgroundSoundMuted}
              onToggleMute={onToggleBackgroundSoundMute}
              muteLabel={t('mute', 'Mute')}
              unmuteLabel={t('unmute', 'Unmute')}
              className="text-[var(--gp-text-muted)]"
            />

            {isAuthor && (
              <div className="flex gap-1">
                {onEdit && (
                  <button onClick={onEdit} className="p-2 text-[var(--gp-text-muted)] hover:text-[var(--gp-text-primary)]" aria-label="Edit post">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
                {onDelete && (
                  <button onClick={onDelete} className="p-2 text-[var(--gp-text-muted)] hover:text-red-500" aria-label="Delete post">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {!isAuthor && onReport && (
              <div className="flex gap-1">
                <button onClick={onReport} className="p-2 text-[var(--gp-text-muted)] hover:text-red-500" aria-label="Report post">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18M3 4h13l-2 4 2 4H3" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Content */}
          {post.content && (
            <div className="mb-4">
              {translationItems.length > 0 ? (
                <>
                  {/* Le corps passe par `PostContentText` — lui seul sait rendre
                      mentions et références — donc la rangée ne rend PAS le texte
                      et se contente de dire, sous lui, dans quelle langue on lit.
                      Le contenu servi est celui que la rangée annonce : sans ce
                      relais, le drapeau afficherait « Français » au-dessus d'un
                      paragraphe resté en version originale. */}
                  <PostContentText
                    content={displayedContent ?? post.content}
                    references={post.mentions}
                    className="text-[var(--gp-text-primary)]"
                  />
                  <ReferenceNoteRow references={post.mentions ?? []} viewerId={currentUserId ?? undefined} />
                  <TranslationToggle
                    originalContent={post.content}
                    originalLanguage={post.originalLanguage ?? 'unknown'}
                    originalLanguageName={post.originalLanguage ? getLanguageName(post.originalLanguage) : undefined}
                    translations={translationItems}
                    userLanguage={userLanguage}
                    preferredLanguages={preferredLanguages}
                    variant="flags"
                    showContent={false}
                    onDisplayedChange={handleDisplayedChange}
                    className="mt-1.5"
                  />
                </>
              ) : (
                <>
                  <PostContentText content={post.content} references={post.mentions} className="text-[var(--gp-text-primary)]" />
                  <ReferenceNoteRow references={post.mentions ?? []} viewerId={currentUserId ?? undefined} />
                  {onTranslate && post.originalLanguage && post.originalLanguage !== userLanguage && (
                    <button
                      onClick={onTranslate}
                      className="mt-2 text-xs text-[var(--gp-terracotta)] hover:underline"
                    >
                      Translate post
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Media */}
          {post.media && post.media.length > 0 && (
            <div className="mb-4 grid gap-2" style={{ gridTemplateColumns: post.media.length === 1 ? '1fr' : 'repeat(2, 1fr)' }}>
              {post.media.map((m) => (
                <div key={m.id} className="group relative rounded-xl overflow-hidden bg-[var(--gp-parchment)]">
                  {onDownloadMedia && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerMediaDownload(buildAttachmentUrl(m.fileUrl) ?? m.fileUrl, downloadFileName(m));
                        onDownloadMedia(m.id);
                      }}
                      className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                      aria-label="Download"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                  {m.mimeType.startsWith('image/') && (
                    <img src={buildAttachmentUrl(m.fileUrl) ?? undefined} alt={m.alt ?? ''} className="w-full object-cover max-h-96" loading="lazy" />
                  )}
                  {m.mimeType.startsWith('video/') && (
                    <video src={buildAttachmentUrl(m.fileUrl) ?? undefined} controls className="w-full max-h-96" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Repost — banner + nested original card */}
          {repostOf && (
            <div
              data-testid="post-detail-repost-block"
              className={cn(
                'mb-4 rounded-xl border border-[var(--gp-border)] p-4',
                onTapRepost && repostOf.id && 'cursor-pointer',
              )}
              {...repostClickableProps}
            >
              <div className="flex items-center gap-1.5 mb-3 text-xs text-[var(--gp-text-muted)]">
                {/* Constat 17 — B3.2 (« l'icône est le verbe ») n'était appliquée
                    QUE sur la carte (F4) ; le détail affichait toujours l'icône
                    ET le verbe. La phrase complète pour l'accessibilité vit
                    désormais dans ce span visuellement masqué — jamais un
                    `aria-label` sur un `<div>` générique (constat 16). */}
                <span className="sr-only">{t('post.repostedFrom', `Reposted from @${repostOf.author?.username ?? ''}`)}</span>
                <Repeat2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span aria-hidden="true">@{repostOf.author?.username ?? ''}</span>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <Avatar name={repostOf.author?.username ?? '?'} src={repostOf.author?.avatar ?? undefined} size="sm" />
                <span className="text-sm font-medium text-[var(--gp-text-primary)]">
                  {repostOf.author?.displayName ?? repostOf.author?.username ?? '?'}
                </span>
              </div>

              {repostOf.content && (
                repostTranslationItems.length > 0 ? (
                  // `inline` (not `block`) — the `block` variant renders its
                  // own resolved-content paragraph unconditionally regardless
                  // of `showContent`, which would double the text alongside
                  // PostContentText. `inline` is the same combination
                  // CommentItem/StatusBar/StoryViewer already use.
                  // The shield div stops the toggle's own clicks/keydowns
                  // (chip, dropdown rows) from bubbling into the enclosing
                  // repost block's navigation handler — same shape as the
                  // media download button's own stopPropagation.
                  <div
                    className="mb-3"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <TranslationToggle
                      originalContent={repostOf.content}
                      originalLanguage={repostOf.originalLanguage ?? 'unknown'}
                      originalLanguageName={repostOf.originalLanguage ? getLanguageName(repostOf.originalLanguage) : undefined}
                      translations={repostTranslationItems}
                      userLanguage={userLanguage}
                      preferredLanguages={preferredLanguages}
                      variant="inline"
                    />
                  </div>
                ) : (
                  <div className="mb-3">
                    <PostContentText content={repostOf.content} references={repostOf.mentions} className="text-sm text-[var(--gp-text-secondary)]" />
                  </div>
                )
              )}
              {repostOf.content && <ReferenceNoteRow references={repostOf.mentions ?? []} viewerId={currentUserId ?? undefined} />}

              {hasRepostMedia && repostMedia && (
                <div
                  className="mb-3 grid gap-1.5 rounded-lg overflow-hidden"
                  style={{ gridTemplateColumns: repostMedia.length === 1 ? '1fr' : 'repeat(2, 1fr)' }}
                >
                  {repostMedia.slice(0, 4).map((m) => (
                    <RepostMediaTile
                      key={m.id}
                      media={m}
                      downloadLabel={t('post.repostDownload', 'Download original media')}
                      onDownload={handleDownloadRepostMedia}
                    />
                  ))}
                </div>
              )}

              {/*
                A SIMPLE repost's counters now live in the outer stats bar
                (displayLikeCount/displayCommentCount/displayViewCount
                above) — repeating them here would render the same 42/7
                twice on one card. A QUOTE's outer bar shows the quote's OWN
                counts, so the nested row is the only place the original's
                counters surface.
              */}
              {post.isQuote && (
                <div className="flex items-center gap-4 text-xs text-[var(--gp-text-muted)]">
                  <span data-testid="repost-like-count">{formatCount(repostOf.likeCount ?? 0)} likes</span>
                  <span data-testid="repost-comment-count">{formatCount(repostOf.commentCount ?? 0)} comments</span>
                  {typeof repostOf.viewCount === 'number' && (
                    <span data-testid="repost-view-count">{formatCount(repostOf.viewCount)} views</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Reaction summary */}
          {hasReactions && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {Object.entries(post.reactionSummary!).map(([emoji, count]) => (
                <button
                  key={emoji}
                  onClick={() => onReact?.(emoji)}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors',
                    userReaction === emoji
                      ? 'bg-[var(--gp-terracotta)]/15 border border-[var(--gp-terracotta)]/30'
                      : 'bg-[var(--gp-parchment)] border border-transparent',
                  )}
                >
                  <span>{emoji}</span>
                  <span className="text-[var(--gp-text-secondary)]">{count}</span>
                </button>
              ))}
            </div>
          )}

          {/* Stats bar */}
          <div className="flex items-center gap-4 py-2 border-t border-b border-[var(--gp-border)] text-xs text-[var(--gp-text-muted)] mb-3">
            {displayLikeCount > 0 && <span>{formatCount(displayLikeCount)} likes</span>}
            {displayCommentCount > 0 && <span>{formatCount(displayCommentCount)} comments</span>}
            {post.repostCount > 0 && <span>{formatCount(post.repostCount)} reposts</span>}
            {displayViewCount > 0 && <span>{formatCount(displayViewCount)} views</span>}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between relative">
            <div className="relative">
              <button
                onClick={handleLikeToggle}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                  isLiked || userReaction
                    ? 'text-[var(--gp-terracotta)]'
                    : 'text-[var(--gp-text-secondary)] hover:bg-[var(--gp-parchment)]',
                )}
                onContextMenu={(e) => { e.preventDefault(); setShowReactionPicker(!showReactionPicker); }}
                aria-label={isLiked ? 'Unlike' : 'Like'}
              >
                {userReaction ? (
                  <span className="text-lg leading-none">{userReaction}</span>
                ) : (
                  <svg
                    className="w-5 h-5"
                    fill={isLiked ? 'currentColor' : 'none'}
                    stroke={isLiked ? postAccent : 'currentColor'}
                    strokeWidth={isLiked ? 2.5 : 2}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                )}
                Like
              </button>

              {showReactionPicker && (
                <div className="absolute bottom-full left-0 mb-2 z-30 flex items-center gap-1 px-2 py-1.5 rounded-full bg-[var(--gp-surface)] border border-[var(--gp-border)]" style={{ boxShadow: 'var(--gp-shadow-lg)' }}>
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => { onReact?.(emoji); setShowReactionPicker(false); }}
                      className={cn('text-xl p-1 rounded-full transition-transform hover:scale-125', userReaction === emoji && 'bg-[var(--gp-parchment)]')}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={onShare}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--gp-text-secondary)] hover:bg-[var(--gp-parchment)] transition-colors"
              aria-label="Share"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share
            </button>

            {onRepost && (
              <button
                onClick={onRepost}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--gp-text-secondary)] hover:bg-[var(--gp-parchment)] transition-colors"
                aria-label="Repost"
              >
                <Repeat2 className="w-5 h-5" />
                Repost
              </button>
            )}

            {onRepostAsPost && (
              <button
                data-testid="post-detail-repost-as-post"
                onClick={onRepostAsPost}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--gp-text-secondary)] hover:bg-[var(--gp-parchment)] transition-colors"
                aria-label={t('post.repostAsPost', 'Keep on my feed')}
                title={t('post.repostAsPost', 'Keep on my feed')}
              >
                <ArrowDownToLine className="w-5 h-5" />
                {t('post.repostAsPost', 'Keep on my feed')}
              </button>
            )}

            <button
              onClick={handleBookmarkToggle}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                isBookmarked
                  ? 'text-[var(--gp-terracotta)]'
                  : 'text-[var(--gp-text-secondary)] hover:bg-[var(--gp-parchment)]',
              )}
              aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
            >
              <svg
                className="w-5 h-5"
                fill={isBookmarked ? 'currentColor' : 'none'}
                stroke={isBookmarked ? postAccent : 'currentColor'}
                strokeWidth={isBookmarked ? 2.5 : 2}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Comments section */}
      <div className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] overflow-hidden p-5">
        <h3 className="font-semibold text-[var(--gp-text-primary)] mb-4">
          Comments ({formatCount(post.commentCount)})
        </h3>
        <CommentList
          postId={post.id}
          comments={comments}
          currentUserId={currentUserId}
          currentUser={currentUser}
          userLanguage={userLanguage}
          preferredLanguages={preferredLanguages}
          likedCommentIds={likedCommentIds}
          isLoading={commentsLoading}
          hasMore={commentsHasMore}
          onLoadMore={onLoadMoreComments}
          isLoadingMore={commentsLoadingMore}
          onLikeComment={onLikeComment}
          onUnlikeComment={onUnlikeComment}
          onDeleteComment={onDeleteComment}
          onSubmitComment={onSubmitComment}
          onShowReplies={onShowReplies}
          targetCommentId={targetCommentId}
          targetParentCommentId={targetParentCommentId}
        />
      </div>
    </div>
  );
}

PostDetail.displayName = 'PostDetail';
export { PostDetail };
