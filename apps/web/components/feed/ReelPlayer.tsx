'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Post, PostMedia } from '@meeshy/shared/types/post';
import type { PostReference } from '@meeshy/shared/types/post-reference';
import { useI18n } from '@/hooks/use-i18n';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/utils/initials';
import { PostContentText } from '@/components/v2/PostContentText';
import {
  X,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  ChevronUp,
  ChevronDown,
  Volume2,
  VolumeX,
  Play,
  Flag,
  Repeat2,
  Download,
} from 'lucide-react';
import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';

// ─── Helpers ───────────────────────────────────────────────────────────────

function authorName(post: Post): string {
  return post.author?.displayName ?? post.author?.username ?? 'Meeshy';
}

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

/**
 * Prisme Linguistique pick: prefer a translation matching `userLanguage`,
 * otherwise the original content. Never falls back to an arbitrary language.
 */
function resolveCaption(post: Pick<Post, 'content' | 'translations'>, userLanguage?: string): string {
  const original = post.content ?? '';
  if (!userLanguage || !post.translations || typeof post.translations !== 'object') return original;
  const entry = (post.translations as Record<string, { text?: string }>)[userLanguage];
  return entry?.text ?? original;
}

/**
 * Repost-aware caption: the reposter's own content wins when present (a
 * quote repost always sets it) — otherwise the original's, resolved through
 * the same Prisme mechanism. A plain repost carries no content of its own,
 * so it naturally falls through to the original.
 */
function resolveDisplayCaption(post: Post, userLanguage?: string): string {
  const own = resolveCaption(post, userLanguage);
  if (own) return own;
  return post.repostOf ? resolveCaption(post.repostOf, userLanguage) : own;
}

/**
 * References follow the SAME own-vs-repostOf source as
 * {@link resolveDisplayCaption} — a repost's caption comes from `repostOf`,
 * so its `@handle`s must be validated against `repostOf.mentions`, never the
 * reposter's own (empty) list.
 */
function resolveDisplayReferences(post: Post, userLanguage?: string): readonly PostReference[] | undefined {
  if (resolveCaption(post, userLanguage)) return post.mentions;
  return post.repostOf ? post.repostOf.mentions : post.mentions;
}

/**
 * A reposted REEL carries no media of its own — the gateway only snapshots
 * ephemeral types (STORY/STATUS) into `repostOf`, a REEL repost stays a bare
 * pointer. Falls back to the original's media, mirroring iOS
 * `primaryReelDisplayMedia` (ReelFeedCard.swift:118-145).
 *
 * `ownerId` is the id of whichever post the returned media rows actually
 * belong to server-side (`PostMedia.postId`) — the gateway's download
 * endpoint filters `postMedia.findMany({ id in [...], postId })`, so any
 * caller crediting a download MUST use this id, never the displayed reel's
 * id, or the original's media rows never match and the ping silently
 * records zero. Media and owner are resolved together so they can never
 * diverge.
 */
function resolveReelMedia(post: Post): { media: readonly PostMedia[]; ownerId: string } {
  if (post.media && post.media.length > 0) return { media: post.media, ownerId: post.id };
  if (post.repostOf?.media && post.repostOf.media.length > 0) {
    return { media: post.repostOf.media, ownerId: post.repostOf.id ?? post.id };
  }
  return { media: post.media ?? [], ownerId: post.id };
}

/** Displayed counters mirror the original's when it's a repost (Task 2 parity). */
function displayCount(post: Post, key: 'likeCount' | 'commentCount'): number {
  return post.repostOf?.[key] ?? post[key];
}

function repostAuthorHandle(original: Partial<Post>): string {
  return original.author?.username ?? original.author?.displayName ?? '';
}

// ─── Action rail button ──────────────────────────────────────────────────

interface RailButtonProps {
  label: string;
  count?: number;
  active?: boolean;
  activeColor?: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}

function RailButton({
  label,
  count,
  active,
  activeColor,
  onClick,
  children,
}: RailButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className="flex flex-col items-center gap-1 text-white group"
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm transition-all group-active:scale-90 group-hover:bg-black/50"
        style={active && activeColor ? { color: activeColor } : undefined}
      >
        {children}
      </span>
      {typeof count === 'number' && <span className="text-xs font-medium tabular-nums drop-shadow-sm">{count}</span>}
    </button>
  );
}

// ─── Player ────────────────────────────────────────────────────────────────

export interface ReelPlayerProps {
  reel: Post;
  index: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  isLiked: boolean;
  isBookmarked: boolean;
  userLanguage?: string;
  /** When true the player fills its (relatively-positioned) parent instead of the viewport. */
  embedded?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onBookmark: () => void;
  onReport?: () => void;
  onRepost?: () => void;
  /** `owningPostId` is the post the downloaded media actually belongs to
   *  server-side — the displayed reel's id for its own media, the
   *  original's id when the media was resolved from `repostOf`. */
  onDownload?: (mediaId: string, owningPostId: string) => void;
}

/**
 * Full-screen immersive reel. Renders a single reel (the parent remounts it via
 * a `key` on reel id so each video autoplays cleanly). Navigation: Arrow
 * Up/Down/Left/Right keys, mouse wheel, and on-screen chevrons all advance to
 * the adjacent reel; Escape closes. Tap toggles play/pause; a dedicated control
 * toggles sound (videos start muted to satisfy autoplay policies).
 */
export function ReelPlayer({
  reel,
  index,
  total,
  hasPrev,
  hasNext,
  isLiked,
  isBookmarked,
  userLanguage,
  embedded = false,
  onPrev,
  onNext,
  onClose,
  onLike,
  onComment,
  onShare,
  onBookmark,
  onReport,
  onRepost,
  onDownload,
}: ReelPlayerProps) {
  const { t } = useI18n('reel');
  // Accent du réel — MÊME graine qu'iOS (`authorAccentColor`, shared) :
  // l'identifiant d'auteur d'abord, son nom en repli.
  const reelAccent = authorAccentColor(reel.authorId, reel.author?.displayName ?? reel.author?.username ?? '');

  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);

  const { media: reelMedia, ownerId: reelMediaOwnerId } = resolveReelMedia(reel);
  const video = reelMedia.find((m) => m.mimeType.startsWith('video/'));
  const image = reelMedia.find((m) => m.mimeType.startsWith('image/'));
  const downloadTarget = video ?? image;
  const name = authorName(reel);
  const caption = resolveDisplayCaption(reel, userLanguage);
  const captionReferences = resolveDisplayReferences(reel, userLanguage);

  const goNext = useCallback(() => {
    if (hasNext) onNext();
  }, [hasNext, onNext]);
  const goPrev = useCallback(() => {
    if (hasPrev) onPrev();
  }, [hasPrev, onPrev]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          goPrev();
          break;
        case 'Escape':
          onClose();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, onClose]);

  // Wheel / trackpad navigation (debounced via a moving lock)
  const wheelLock = useRef(false);
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (wheelLock.current || Math.abs(e.deltaY) < 24) return;
      wheelLock.current = true;
      if (e.deltaY > 0) goNext();
      else goPrev();
      setTimeout(() => {
        wheelLock.current = false;
      }, 500);
    },
    [goNext, goPrev]
  );

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPaused(false);
    } else {
      el.pause();
      setPaused(true);
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (videoRef.current) videoRef.current.muted = next;
      return next;
    });
  }, []);

  return (
    <section
      className={`${
        embedded ? 'absolute inset-0' : 'fixed inset-0 z-50'
      } flex items-center justify-center bg-black select-none`}
      aria-label={t('player.position', { current: index + 1, total })}
      onWheel={onWheel}
    >
      <h1 className="sr-only">{t('player.byAuthor', { name })}</h1>

      {/* Media stage (9:16) */}
      <div className="relative h-full w-full max-w-[min(100vw,calc(100vh*9/16))]">
        {video ? (
          <>
            <video
              ref={videoRef}
              src={video.fileUrl}
              poster={video.thumbnailUrl ?? undefined}
              className="h-full w-full object-contain bg-black"
              autoPlay
              loop
              playsInline
              muted={muted}
              onClick={togglePlay}
              aria-label={video.alt ?? t('player.byAuthor', { name })}
            />
            {paused && (
              <button
                type="button"
                onClick={togglePlay}
                aria-label={t('player.play', 'Play')}
                className="absolute inset-0 flex items-center justify-center"
              >
                <Play className="h-16 w-16 text-white/90 drop-shadow-lg" fill="currentColor" />
              </button>
            )}
          </>
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.fileUrl}
            alt={image.alt ?? t('player.byAuthor', { name })}
            className="h-full w-full object-contain bg-black"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-700 to-purple-800 p-8 text-center text-2xl font-semibold text-white">
            {caption || name}
          </div>
        )}

        {/* Top bar */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label={t('player.close', 'Close')}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/50 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          {/* Navigation arrows (replace the i/N counter) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
              disabled={!hasPrev}
              aria-label={t('player.previous', 'Previous reel')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-all disabled:opacity-30 hover:bg-black/50"
            >
              <ChevronUp className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goNext(); }}
              disabled={!hasNext}
              aria-label={t('player.next', 'Next reel')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-all disabled:opacity-30 hover:bg-black/50"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>
          {video ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleMute(); }}
              aria-label={muted ? t('player.unmute', 'Unmute') : t('player.mute', 'Mute')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/50 transition-colors"
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
          ) : (
            <span className="h-10 w-10" aria-hidden="true" />
          )}
        </div>

        {/* Action rail */}
        <div className="absolute bottom-28 right-3 flex flex-col items-center gap-5 z-10">
          <RailButton label={t('player.like', 'Like')} count={displayCount(reel, 'likeCount')} active={isLiked} activeColor="#fb7185" onClick={(e) => { e.stopPropagation(); onLike(); }}>
            {/* Le contour passe à l'accent du réel quand c'est le lecteur qui a
                liké : la teinte seule ne distingue pas « aimé » de « aimé PAR
                MOI ». Même règle, même graine qu'iOS. */}
            <Heart
              className="h-6 w-6"
              fill={isLiked ? 'currentColor' : 'none'}
              stroke={isLiked ? reelAccent : 'currentColor'}
              strokeWidth={isLiked ? 2.5 : 2}
            />
          </RailButton>
          <RailButton label={t('player.comment', 'Comment')} count={displayCount(reel, 'commentCount')} onClick={(e) => { e.stopPropagation(); onComment(); }}>
            <MessageCircle className="h-6 w-6" />
          </RailButton>
          <RailButton label={t('player.share', 'Share')} onClick={(e) => { e.stopPropagation(); onShare(); }}>
            <Share2 className="h-6 w-6" />
          </RailButton>
          <RailButton label={t('player.save', 'Save')} active={isBookmarked} activeColor="#fbbf24" onClick={(e) => { e.stopPropagation(); onBookmark(); }}>
            <Bookmark
              className="h-6 w-6"
              fill={isBookmarked ? 'currentColor' : 'none'}
              stroke={isBookmarked ? reelAccent : 'currentColor'}
              strokeWidth={isBookmarked ? 2.5 : 2}
            />
          </RailButton>
          {onRepost && (
            <RailButton label={t('player.repost', 'Repost')} onClick={(e) => { e.stopPropagation(); onRepost(); }}>
              <Repeat2 className="h-6 w-6" />
            </RailButton>
          )}
          {onDownload && downloadTarget && (
            <RailButton
              label={t('player.download', 'Download')}
              onClick={(e) => {
                e.stopPropagation();
                triggerMediaDownload(downloadTarget.fileUrl, downloadFileName(downloadTarget));
                onDownload(downloadTarget.id, reelMediaOwnerId);
              }}
            >
              <Download className="h-6 w-6" />
            </RailButton>
          )}
          {onReport && (
            <RailButton label={t('player.report', 'Report')} onClick={(e) => { e.stopPropagation(); onReport(); }}>
              <Flag className="h-6 w-6" />
            </RailButton>
          )}
        </div>

        {/* Author + caption */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pb-8 pr-20 text-white z-10">
          {reel.repostOf && (
            <Link
              href={`/reel/${reel.repostOf.id}`}
              onClick={(e) => e.stopPropagation()}
              className="mb-2 inline-flex w-fit items-center gap-1.5 text-xs font-medium text-white/70 transition-colors hover:text-white"
            >
              {/* Constat 17 — B3.2 (« l'icône est le verbe ») n'était appliquée
                  QUE sur la carte (F4) ; le lecteur de reel affichait toujours
                  l'icône ET le verbe — 3e des 3 surfaces web de republication
                  restée incohérente. Le lien reste nommé pour l'accessibilité
                  par ce span visuellement masqué (l'icône et le handle visible
                  sont `aria-hidden`). */}
              <span className="sr-only">{t('player.repostedFrom', 'Reposted from')} @{repostAuthorHandle(reel.repostOf)}</span>
              <Repeat2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span aria-hidden="true">@{repostAuthorHandle(reel.repostOf)}</span>
            </Link>
          )}
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 ring-2 ring-white/50">
              {reel.author?.avatar ? <AvatarImage src={reel.author.avatar} alt="" /> : null}
              <AvatarFallback className="bg-indigo-600">{getInitials(name)}</AvatarFallback>
            </Avatar>
            <span className="font-semibold text-lg drop-shadow-sm">{name}</span>
          </div>
          {caption && <PostContentText content={caption} references={captionReferences} className="mt-3 line-clamp-3 text-sm text-white/90 leading-relaxed drop-shadow-sm" />}
        </div>

      </div>
    </section>
  );
}

export default ReelPlayer;
