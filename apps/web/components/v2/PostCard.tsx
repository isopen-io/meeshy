'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { buildAttachmentUrl } from '@/utils/attachment-url';
import { formatDuration } from '@/utils/audio-formatters';
import { useI18n } from '@/hooks/use-i18n';
import { Avatar } from './Avatar';
import { LanguageOrb } from './LanguageOrb';
import { TranslationToggle } from './TranslationToggle';
import type { TranslationItem } from './TranslationToggle';
import { getLanguageName } from './flags';
import { PostContentText } from './PostContentText';
import { ReferenceNoteRow } from './ReferenceNoteRow';
import { BackgroundSoundBadge, type BackgroundSoundMeta } from './BackgroundSoundBadge';
import type { Post } from '@meeshy/shared/types/post';
import type { PostReference } from '@meeshy/shared/types/post-reference';
import type { BackgroundSoundV3 } from '@meeshy/shared/types/canvas-v3';
import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';

type PostCardMedia = {
  id: string;
  mimeType: string;
  fileUrl: string;
  thumbnailUrl?: string | null;
  alt?: string | null;
  duration?: number | null;
};

export interface PostCardProps {
  author: { name: string; avatar?: string; emoji?: string };
  /** Identifiant de l'auteur — sème l'accent du contenu (`authorAccentColor`).
   *  Absent, l'accent retombe sur le nom, au risque de diverger d'iOS qui, lui,
   *  sème sur l'identifiant. */
  authorId?: string;
  lang: string;
  content: string;
  translations?: TranslationItem[];
  userLanguage?: string;
  /** Prisme ordonné (rangs 1→4) pour l'auto-résolution de `TranslationToggle`. */
  preferredLanguages?: string[];
  time: string;
  likes: number;
  comments: number;
  isLiked?: boolean;
  isBookmarked?: boolean;
  isAuthor?: boolean;
  isPinned?: boolean;
  reactionSummary?: Record<string, number>;
  userReaction?: string;
  media?: readonly PostCardMedia[];
  /** References the server validated for `content` — only these `@handle`s become links. */
  mentions?: readonly PostReference[];
  /** Signed-in viewer's id — resolves the personal "you're referenced" marker for a SILENT reference. */
  viewerId?: string;
  /** Original post being reposted — renders the `↻ @handle` attribution + nested card. */
  repostOf?: Post['repostOf'];
  /** True for a quote-repost (reposter added their own comment). Drives which counters show where. */
  isQuote?: boolean;
  /**
   * L'annonce du fond + bouton 🔇 (B3.3-6) — n'existe (n'est rendue) QUE si
   * une piste `sound` v3 existe (B3.5). `undefined`/`null` ⇒ rien dans la
   * rangée auteur, comportement actuel inchangé.
   */
  backgroundSound?: BackgroundSoundV3 | null;
  backgroundSoundMeta?: BackgroundSoundMeta;
  /** État muet du lecteur LOCAL que le bouton 🔇 bascule. */
  backgroundSoundMuted?: boolean;
  onToggleBackgroundSoundMute?: () => void;
  onLike?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  onReact?: (emoji: string) => void;
  onBookmark?: () => void;
  onRepost?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onPin?: () => void;
  onReport?: () => void;
  onTranslate?: () => void;
  onDownloadMedia?: (mediaId: string) => void;
  /** Media download inside the nested `repostOf` card — targets the ORIGINAL's media. */
  onDownloadRepostMedia?: (mediaId: string) => void;
  /** Tap on the repost banner or nested card — navigates to the ORIGINAL post. */
  onTapRepost?: (repostId: string) => void;
  onClick?: () => void;
  className?: string;
}

const REACTION_EMOJIS = ['\u2764\uFE0F', '\uD83D\uDD25', '\uD83D\uDE02', '\uD83D\uDE2E', '\uD83D\uDE22', '\uD83D\uDC4F'];

/**
 * Same `<a download>` DOM pattern as the chat lightboxes
 * (ImageLightbox/VideoLightbox `handleDownload`) \u2014 a browser-native save,
 * no service call. `onDownloadMedia` (if provided) fires the best-effort
 * analytics ping owned by the parent screen (which knows the postId).
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

/**
 * Same shape as `postToTranslations` (PostsFeedScreen/hashtag page host
 * helpers) applied to `repostOf.translations` — the Prisme resolution for
 * the nested card reuses the exact same `TranslationToggle` mechanism as the
 * outer post, never `translations.first`.
 */
function repostTranslationItems(translations: unknown): TranslationItem[] {
  if (!translations || typeof translations !== 'object') return [];
  return Object.entries(translations as Record<string, { text?: string }>)
    .filter(([, v]) => v && typeof v.text === 'string')
    .map(([lang, v]) => ({ languageCode: lang, languageName: lang.toUpperCase(), content: v.text! }));
}

/**
 * Single tile renderer shared by the outer media grid and the nested
 * `repostOf` grid (image / video / audio, optional download button) — kept
 * as one implementation so the two never drift.
 */
function PostMediaTile({
  media,
  index,
  onDownload,
  downloadLabel,
  t,
  testIdPrefix = 'post-card',
}: {
  media: PostCardMedia;
  index: number;
  onDownload?: (media: PostCardMedia) => void;
  downloadLabel: string;
  t: (key: string, paramsOrFallback?: Record<string, unknown> | string) => string;
  testIdPrefix?: string;
}) {
  return (
    <div className="group relative bg-[var(--gp-parchment)] aspect-square overflow-hidden">
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
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
      )}
      {media.mimeType.startsWith('image/') && (
        <img
          src={buildAttachmentUrl(media.thumbnailUrl ?? media.fileUrl) ?? undefined}
          alt={media.alt ?? t('post.imageAlt', { index: String(index + 1) })}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      )}
      {media.mimeType.startsWith('video/') && (
        <video src={buildAttachmentUrl(media.fileUrl) ?? undefined} className="w-full h-full object-cover" muted />
      )}
      {media.mimeType.startsWith('audio/') && (
        <div
          data-testid={`${testIdPrefix}-audio-tile`}
          className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-[var(--gp-terracotta)]"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {typeof media.duration === 'number' && (
            <span className="text-xs font-medium text-[var(--gp-text-secondary)]">
              {formatDuration(Math.round(media.duration / 1000))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PostCard({
  author,
  lang,
  content,
  translations,
  userLanguage,
  preferredLanguages,
  time,
  likes,
  comments,
  authorId,
  isLiked = false,
  isBookmarked = false,
  isAuthor = false,
  isPinned = false,
  reactionSummary,
  userReaction,
  media,
  mentions,
  viewerId,
  repostOf,
  isQuote = false,
  backgroundSound,
  backgroundSoundMeta,
  backgroundSoundMuted = true,
  onToggleBackgroundSoundMute,
  onLike,
  onComment,
  onShare,
  onReact,
  onBookmark,
  onRepost,
  onEdit,
  onDelete,
  onPin,
  onReport,
  onTranslate,
  onDownloadMedia,
  onDownloadRepostMedia,
  onTapRepost,
  onClick,
  className,
}: PostCardProps) {
  const { t } = useI18n('components');
  // Accent du contenu — MÊME graine qu'iOS (`authorAccentColor`, shared) :
  // l'identifiant d'abord, le nom en repli. Deux appareils peignent ainsi le
  // même post de la même couleur.
  const postAccent = authorAccentColor(authorId, author.name);

  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const heartSpring = reduceMotion
    ? {}
    : { type: 'spring' as const, stiffness: 400, damping: 15 };

  useEffect(() => {
    if (!showReactionPicker && !showContextMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowReactionPicker(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowContextMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showReactionPicker, showContextMenu]);

  const handleLikePointerDown = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      setShowReactionPicker(true);
    }, 500);
  }, []);

  const handleLikePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleReact = useCallback((emoji: string) => {
    onReact?.(emoji);
    setShowReactionPicker(false);
  }, [onReact]);

  const handleCardKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  }, [onClick]);

  const clickableProps = onClick
    ? { role: 'button' as const, tabIndex: 0, onClick, onKeyDown: handleCardKeyDown }
    : {};

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

  const repostTranslations = useMemo(() => repostTranslationItems(repostOf?.translations), [repostOf?.translations]);
  const repostMedia = repostOf?.media;
  const hasRepostMedia = repostMedia && repostMedia.length > 0;
  /**
   * A SIMPLE repost has no engagement of its own worth surfacing — the outer
   * action bar shows the ORIGINAL's counts instead (product rule 2026-08-11).
   * A QUOTE keeps its own outer counts; the nested row then carries the
   * original's, so the same numbers never render twice on one card.
   */
  const displayLikes = repostOf && !isQuote ? repostOf.likeCount ?? likes : likes;
  const displayComments = repostOf && !isQuote ? repostOf.commentCount ?? comments : comments;
  const handleDownloadRepostMedia = onDownloadRepostMedia
    ? (m: PostCardMedia) => {
        triggerMediaDownload(buildAttachmentUrl(m.fileUrl) ?? m.fileUrl, downloadFileName(m));
        onDownloadRepostMedia(m.id);
      }
    : undefined;

  const hasTranslations = translations && translations.length > 0;

  /// Cycle 123 — le corps effectivement servi, tenu par la puce de langue.
  ///
  /// La variante `block` est montée `showContent={false}` (le corps a besoin de
  /// `PostContentText` pour ses mentions et références, que la puce ne rend
  /// pas), et l'hôte rendait `content` — l'ORIGINAL — inconditionnellement.
  /// Deux conséquences : la zone « traductions disponibles » annonçait une
  /// langue résolue jamais servie, et cliquer une traduction n'y changeait
  /// RIEN — le contrôle était inerte. Même relais que `PostDetail`.
  /// `null` tant que la puce n'a rien annoncé : on retombe sur `content`, ce
  /// qui est exactement l'état d'un post sans traduction.
  const [displayedContent, setDisplayedContent] = useState<string | null>(null);
  const handleDisplayedChange = useCallback(
    (version: { content: string }) => setDisplayedContent(version.content),
    [],
  );

  const hasReactions = reactionSummary && Object.keys(reactionSummary).length > 0;
  const hasMedia = media && media.length > 0;

  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] overflow-hidden transition-colors duration-300',
        className,
      )}
    >
      <div className="p-4">
        {/* Pinned badge */}
        {isPinned && (
          <div className="flex items-center gap-1.5 mb-2 text-xs text-[var(--gp-terracotta)]">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
            </svg>
            {t('post.pinned')}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          {author.avatar ? (
            <Avatar src={author.avatar} name={author.name} size="md" />
          ) : (
            <Avatar name={author.emoji || author.name} size="md" />
          )}
          <div className="flex-1 cursor-pointer" {...clickableProps}>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--gp-text-primary)]">
                {author.name}
              </span>
              <LanguageOrb code={lang} size="sm" pulse={false} className="w-6 h-6 text-sm" />
            </div>
            <span className="text-sm text-[var(--gp-text-muted)]">{time}</span>
          </div>

          {/* F3 — l'annonce du fond + bouton 🔇 (B3.3-6), rangée auteur :
              n'existe que si `backgroundSound` existe (B3.5), sinon rend rien. */}
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

          {/* Context menu: author gets Edit/Pin/Delete, non-author gets Report */}
          {(isAuthor || onReport) && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowContextMenu(!showContextMenu)}
                className="p-1.5 rounded-lg text-[var(--gp-text-muted)] hover:bg-[var(--gp-parchment)] transition-colors"
                aria-label={t('post.menu')}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                </svg>
              </button>

              {showContextMenu && (
                <div className="absolute right-0 top-full mt-1 bg-[var(--gp-surface)] border border-[var(--gp-border)] rounded-xl shadow-lg z-20 min-w-[140px] py-1">
                  {isAuthor && onEdit && (
                    <button
                      onClick={() => { onEdit(); setShowContextMenu(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--gp-text-primary)] hover:bg-[var(--gp-parchment)] transition-colors"
                    >
                      {t('post.edit')}
                    </button>
                  )}
                  {isAuthor && onPin && (
                    <button
                      onClick={() => { onPin(); setShowContextMenu(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--gp-text-primary)] hover:bg-[var(--gp-parchment)] transition-colors"
                    >
                      {isPinned ? t('post.unpin') : t('post.pin')}
                    </button>
                  )}
                  {isAuthor && onDelete && (
                    <button
                      onClick={() => { onDelete(); setShowContextMenu(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--gp-error)] hover:bg-[var(--gp-parchment)] transition-colors"
                    >
                      {t('post.delete')}
                    </button>
                  )}
                  {!isAuthor && onReport && (
                    <button
                      onClick={() => { onReport(); setShowContextMenu(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--gp-error)] hover:bg-[var(--gp-parchment)] transition-colors"
                    >
                      {t('post.report', 'Report')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content with TranslationToggle */}
        <div className="cursor-pointer" {...clickableProps}>
          {hasTranslations ? (
            <div className="mb-3">
              <TranslationToggle
                originalContent={content}
                originalLanguage={lang}
                originalLanguageName={getLanguageName(lang)}
                translations={translations}
                userLanguage={userLanguage}
                preferredLanguages={preferredLanguages}
                variant="block"
                showContent={false}
                onDisplayedChange={handleDisplayedChange}
              />
              <PostContentText content={displayedContent ?? content} references={mentions} className="text-[var(--gp-text-primary)]" />
              <ReferenceNoteRow references={mentions ?? []} viewerId={viewerId} />
            </div>
          ) : (
            <div className="mb-3">
              <PostContentText content={content} references={mentions} className="text-[var(--gp-text-primary)]" />
              <ReferenceNoteRow references={mentions ?? []} viewerId={viewerId} />
              {onTranslate && lang !== userLanguage && (
                <button
                  onClick={(e) => { e.stopPropagation(); onTranslate(); }}
                  className="mt-1 text-xs text-[var(--gp-terracotta)] hover:underline"
                  aria-label={t('post.translatePost')}
                >
                  {t('post.translate')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Media grid */}
        {hasMedia && (
          <div
            className="mb-3 grid gap-1.5 rounded-xl overflow-hidden"
            style={{ gridTemplateColumns: media.length === 1 ? '1fr' : 'repeat(2, 1fr)' }}
          >
            {media.slice(0, 4).map((m, i) => (
              <PostMediaTile
                key={m.id}
                media={m}
                index={i}
                downloadLabel={t('post.download', 'Download')}
                t={t}
                onDownload={
                  onDownloadMedia
                    ? (mm) => {
                        triggerMediaDownload(buildAttachmentUrl(mm.fileUrl) ?? mm.fileUrl, downloadFileName(mm));
                        onDownloadMedia(mm.id);
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}

        {/* Repost — banner + nested original card */}
        {repostOf && (
          <div
            data-testid="post-card-repost-block"
            className={cn(
              'mb-3 rounded-xl border border-[var(--gp-border)] p-3',
              onTapRepost && repostOf.id && 'cursor-pointer',
            )}
            {...repostClickableProps}
          >
            <div className="flex items-center gap-1.5 mb-2 text-xs text-[var(--gp-text-muted)]">
              {/* Constat 16 — un `<div>` sans `role` porte le rôle `generic`,
                  qui INTERDIT le nommage par `aria-label` (ARIA in HTML AAM) :
                  le lecteur d'écran ignorait l'attribut et lisait le contenu
                  `aria-hidden` juste en dessous, donc rien. La phrase complète
                  vit ici dans un span visuellement masqué mais présent dans
                  l'arbre d'accessibilité. */}
              <span className="sr-only">{t('post.repostedFrom', `Reposted from @${repostOf.author?.username ?? ''}`)}</span>
              <span aria-hidden="true" className="shrink-0">↻</span>
              <span aria-hidden="true">@{repostOf.author?.username ?? ''}</span>
            </div>

            <div className="flex items-center gap-2 mb-1.5">
              <Avatar name={repostOf.author?.username ?? '?'} src={repostOf.author?.avatar ?? undefined} size="sm" />
              <span className="text-sm font-medium text-[var(--gp-text-primary)]">
                {repostOf.author?.displayName ?? repostOf.author?.username ?? '?'}
              </span>
            </div>

            {repostOf.content && (
              repostTranslations.length > 0 ? (
                // `inline` (not `block`) — the `block` variant renders its own
                // resolved-content paragraph unconditionally regardless of
                // `showContent`, which would double the text alongside
                // PostContentText below. `inline` respects `showContent` and
                // is the same combination CommentItem/StatusBar/StoryViewer
                // already use for single-render translated text.
                // The shield div stops the toggle's own clicks/keydowns
                // (chip, dropdown rows) from bubbling into the enclosing
                // repost block's navigation handler — same shape as the
                // media download button's own stopPropagation.
                <div
                  className="mb-2"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <TranslationToggle
                    originalContent={repostOf.content}
                    originalLanguage={repostOf.originalLanguage ?? 'unknown'}
                    originalLanguageName={repostOf.originalLanguage ? getLanguageName(repostOf.originalLanguage) : undefined}
                    translations={repostTranslations}
                    userLanguage={userLanguage}
                    preferredLanguages={preferredLanguages}
                    variant="inline"
                  />
                </div>
              ) : (
                <div className="mb-2">
                  <PostContentText content={repostOf.content} references={repostOf.mentions} className="text-sm text-[var(--gp-text-secondary)]" />
                </div>
              )
            )}
            {repostOf.content && <ReferenceNoteRow references={repostOf.mentions ?? []} viewerId={viewerId} />}

            {hasRepostMedia && repostMedia && (
              <div
                className="mb-2 grid gap-1 rounded-lg overflow-hidden"
                style={{ gridTemplateColumns: repostMedia.length === 1 ? '1fr' : 'repeat(2, 1fr)' }}
              >
                {repostMedia.slice(0, 4).map((m, i) => (
                  <PostMediaTile
                    key={m.id}
                    media={m}
                    index={i}
                    downloadLabel={t('post.repostDownload', 'Download original media')}
                    t={t}
                    testIdPrefix="post-card-repost"
                    onDownload={handleDownloadRepostMedia}
                  />
                ))}
              </div>
            )}

            {/*
              A SIMPLE repost's counters now live in the outer action bar
              (displayLikes/displayComments above) — repeating them here
              would render the same 42/7 twice on one card. A QUOTE's outer
              bar shows the quote's OWN counts, so the nested row is the
              only place the original's counters surface.
            */}
            {isQuote && (
              <div className="flex items-center gap-3 text-xs text-[var(--gp-text-muted)]">
                <span className="inline-flex items-center gap-1" data-testid="repost-like-count">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  {repostOf.likeCount ?? 0}
                </span>
                <span className="inline-flex items-center gap-1" data-testid="repost-comment-count">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {repostOf.commentCount ?? 0}
                </span>
                {typeof repostOf.viewCount === 'number' && (
                  <span className="inline-flex items-center gap-1" data-testid="repost-view-count">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {repostOf.viewCount}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Reaction summary badges */}
        {hasReactions && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {Object.entries(reactionSummary).map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={() => onReact?.(emoji)}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors duration-300',
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

        {/* Actions — le contour d'une action ACTIVE passe à l'accent du
            contenu : c'est lui, et non la teinte, qui dit « c'est moi qui l'ai
            fait ». En SVG le trait est natif (`fill` = teinte sémantique,
            `stroke` = trace du lecteur), là où iOS superpose deux glyphes. */}
        <div className="flex items-center gap-4">
          <div className="relative" ref={pickerRef}>
            <button
              className="flex items-center gap-2 text-sm transition-colors duration-300 min-w-[44px] min-h-[44px] px-2 -mx-2"
              style={{ color: isLiked || userReaction ? 'var(--gp-terracotta)' : 'var(--gp-text-secondary)' }}
              onClick={onLike}
              onPointerDown={handleLikePointerDown}
              onPointerUp={handleLikePointerUp}
              onPointerLeave={handleLikePointerUp}
              aria-label={isLiked ? t('post.unlike') : t('post.like')}
              aria-pressed={isLiked}
            >
              {userReaction ? (
                <motion.span
                  key={userReaction}
                  className="text-lg leading-none"
                  initial={reduceMotion ? false : { scale: 0.7 }}
                  animate={{ scale: 1 }}
                  transition={heartSpring}
                >
                  {userReaction}
                </motion.span>
              ) : (
                <motion.svg
                  key={isLiked ? 'liked' : 'unliked'}
                  className="w-5 h-5"
                  fill={isLiked ? 'currentColor' : 'none'}
                  stroke={isLiked ? postAccent : 'currentColor'}
                  strokeWidth={isLiked ? 2.5 : 2}
                  viewBox="0 0 24 24"
                  initial={reduceMotion ? false : { scale: 0.7 }}
                  animate={{ scale: 1 }}
                  transition={heartSpring}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </motion.svg>
              )}
              {displayLikes}
            </button>

            {showReactionPicker && (
              <div
                className="absolute bottom-full left-0 mb-2 z-30 flex items-center gap-1 px-2 py-1.5 rounded-full transition-colors duration-300"
                style={{ background: 'var(--gp-surface)', border: '1px solid var(--gp-border)', boxShadow: 'var(--gp-shadow-lg)' }}
              >
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReact(emoji)}
                    className={cn('text-xl p-1 rounded-full transition-transform duration-150 hover:scale-125', userReaction === emoji && 'bg-[var(--gp-parchment)]')}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className="flex items-center gap-2 text-sm text-[var(--gp-text-secondary)] transition-colors duration-300"
            onClick={onComment}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {displayComments}
          </button>

          {onRepost && (
            <button
              className="flex items-center gap-2 text-sm text-[var(--gp-text-secondary)] transition-colors duration-300"
              onClick={onRepost}
              aria-label={t('post.repost')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}

          <button
            className="flex items-center gap-2 text-sm text-[var(--gp-text-secondary)] transition-colors duration-300"
            onClick={onShare}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>

          {/* Bookmark */}
          {onBookmark && (
            <button
              className={cn(
                'flex items-center gap-1 text-sm transition-colors duration-300 ml-auto',
                isBookmarked ? 'text-[var(--gp-terracotta)]' : 'text-[var(--gp-text-secondary)]',
              )}
              onClick={onBookmark}
              aria-label={isBookmarked ? t('post.removeBookmark') : t('post.bookmark')}
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
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

PostCard.displayName = 'PostCard';

export { PostCard };
