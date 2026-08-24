'use client';

import { useCallback, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PostCard } from '@/components/v2/PostCard';
import { useToast } from '@/components/v2';
import { useI18n } from '@/hooks/use-i18n';
import { usePreferredLanguage, usePreferredLanguages } from '@/hooks/use-post-translation';
import { postBackgroundSound } from '@/lib/story-transforms';
import {
  useHashtagFeedQuery,
  useFeedPosts,
  useTrendingHashtagsQuery,
} from '@/hooks/queries/use-feed-query';
import { reportService } from '@/services/report.service';
import { useAuthStore } from '@/stores/auth-store';
import type { Post } from '@meeshy/shared/types/post';
import { classifyRelativeTime } from '@meeshy/shared/utils/relative-time';

type TFunc = (key: string, paramsOrFallback?: Record<string, unknown> | string) => string;

function authorName(post: Post): string {
  return post.author?.displayName ?? post.author?.username ?? 'Meeshy';
}

/**
 * Prisme Linguistique pick: prefer a translation matching `userLanguage`,
 * otherwise the original content — handled by PostCard's own TranslationToggle.
 */
function postToTranslations(post: Post) {
  if (!post.translations || typeof post.translations !== 'object') return [];
  return Object.entries(post.translations as Record<string, { text?: string }>)
    .filter(([, v]) => v && typeof v.text === 'string')
    .map(([lang, v]) => ({
      languageCode: lang,
      languageName: lang.toUpperCase(),
      content: v.text!,
    }));
}

/**
 * Un reel s'ouvre dans le lecteur immersif, un post dans le fil de détail —
 * même règle que `PostsFeedScreen` (`components/feed/PostsFeedScreen.tsx`), qui
 * est l'autre surface mixant les deux types.
 */
function postHref(post: Pick<Post, 'id' | 'type'>): string {
  return post.type === 'REEL' ? `/reel/${post.id}` : `/feeds/post/${post.id}`;
}

function formatRelativeTime(date: string | Date, t: TFunc): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const bucket = classifyRelativeTime(d.getTime(), Date.now(), { beyondDays: Infinity });
  if (bucket.unit === 'now') return t('time.now', 'Just now');
  if (bucket.unit === 'minutes') return t('time.minutes', { count: bucket.value });
  if (bucket.unit === 'hours') return t('time.hours', { count: bucket.value });
  const days = bucket.unit === 'days' ? bucket.value : Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return t('time.days', { count: days });
}

/**
 * Résultats de recherche par hashtag (`/hashtag/:tag`) — posts publics/communauté
 * contenant le hashtag, plus une liste de hashtags tendance pour l'exploration.
 */
export default function HashtagPage() {
  const params = useParams<{ tag: string }>();
  const tag = decodeURIComponent(params?.tag ?? '');
  const router = useRouter();
  const { t } = useI18n('feed');
  const userLanguage = usePreferredLanguage();
  const preferredLanguages = usePreferredLanguages();
  const toastCtx = useToast();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const feedQuery = useHashtagFeedQuery(tag);
  const posts = useFeedPosts(feedQuery);
  const trendingQuery = useTrendingHashtagsQuery();
  const trending = trendingQuery.data ?? [];

  // Constat 2 (F7c) — état muet du lecteur LOCAL du badge B3.3-6, par post
  // (la carte ne possède aucun lecteur : ce bouton reste cosmétique tant que
  // la résolution d'URL de son web n'existe pas — dette explicite, plan F3).
  // Démarre MUTED, comme `StoryViewer` (`isBackgroundSoundMuted`).
  const [unmutedBackgroundSoundPostIds, setUnmutedBackgroundSoundPostIds] = useState<Set<string>>(new Set());
  const toggleBackgroundSoundMute = useCallback((postId: string) => {
    setUnmutedBackgroundSoundPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }, []);

  const handleReportPost = useCallback(
    (postId: string) => {
      if (!window.confirm(t('post.reportConfirm', 'Report this post?'))) return;
      reportService
        .reportPost(postId, 'inappropriate', '')
        .then(() => toastCtx.addToast(t('toast.postReported', 'Post reported'), 'success'))
        .catch(() => toastCtx.addToast(t('toast.reportError', "Couldn't report the post."), 'error'));
    },
    [t, toastCtx],
  );

  return (
    <DashboardLayout title={`#${tag}`} hideSearch>
      {trending.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-sm font-medium text-[var(--gp-text-muted)]">
            {t('hashtag.trending', 'Trending')}
          </span>
          {trending.map((h) => (
            <Link
              key={h.tag}
              href={`/hashtag/${h.tag}`}
              className="text-sm text-[var(--gp-terracotta)] font-semibold hover:underline"
            >
              #{h.tag}
            </Link>
          ))}
        </div>
      )}

      {!feedQuery.isLoading && posts.length === 0 ? (
        <div className="py-10 text-center text-sm text-[var(--gp-text-muted)]">
          {t('hashtag.empty', 'No posts with this hashtag yet')}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post) => {
            const { sound: backgroundSound, meta: backgroundSoundMeta } = postBackgroundSound(post);
            return (
              <PostCard
                key={post.id}
                author={{ name: authorName(post), avatar: post.author?.avatar ?? undefined }}
                lang={post.originalLanguage ?? 'fr'}
                content={post.content ?? ''}
                translations={postToTranslations(post)}
                userLanguage={userLanguage}
                preferredLanguages={preferredLanguages}
                time={formatRelativeTime(post.createdAt, t)}
                likes={post.likeCount}
                comments={post.commentCount}
                isAuthor={post.authorId === currentUserId}
                media={post.media}
                mentions={post.mentions}
                viewerId={currentUserId}
                repostOf={post.repostOf}
                isQuote={post.isQuote}
                backgroundSound={backgroundSound}
                backgroundSoundMeta={backgroundSoundMeta}
                backgroundSoundMuted={!unmutedBackgroundSoundPostIds.has(post.id)}
                onToggleBackgroundSoundMute={() => toggleBackgroundSoundMute(post.id)}
                onReport={() => handleReportPost(post.id)}
                onTapRepost={(repostId) =>
                  router.push(postHref({ id: repostId, type: post.repostOf?.type ?? 'POST' }))
                }
                onClick={() => router.push(postHref(post))}
              />
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
