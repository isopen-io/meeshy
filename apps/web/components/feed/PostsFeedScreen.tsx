'use client';

import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useI18n } from '@/hooks/use-i18n';
import { Button, useToast, PostCard, StoryTray, StatusBar, StoryViewer, StoryComposer, StatusComposer } from '@/components/v2';
import type { StoryVisibility } from '@/components/v2';
import { PostComposer } from '@/components/v2/PostComposer';
import { PostEditor } from '@/components/v2/PostEditor';
import { RepostModal } from '@/components/v2/RepostModal';
import { AudioPostComposer } from '@/components/v2/AudioPostComposer';
import { Skeleton } from '@/components/v2/Skeleton';

// Stories
import { useStoriesFeedQuery, useCreateStoryMutation, useDeleteStoryMutation, useRecordStoryViewMutation } from '@/hooks/social/use-stories';
import { useStoriesRealtime } from '@/hooks/social/use-stories-realtime';
import { postToStoryData, groupStoriesByAuthor, groupToStoryItem } from '@/lib/story-transforms';
import { useStoryPreferences } from '@/stores/user-preferences-store';

// Statuses / moods (real API — STATUS posts, real-time via usePostSocketCacheSync)
import { useStatusesFeedQuery, useStatusesList, useCreateStatusMutation } from '@/hooks/social/use-statuses';
import { postToStatusItem } from '@/lib/status-transforms';

// Posts (real API integration — same hooks as v2)
import { useFeedQuery, useFeedPosts, usePrefetchPost } from '@/hooks/queries/use-feed-query';
import { useCreatePostMutation, useLikePostMutation, useUnlikePostMutation, useSharePostMutation, useBookmarkPostMutation, useUnbookmarkPostMutation, useTranslatePostMutation, useDeletePostMutation, usePinPostMutation, useRepostMutation, useUpdatePostMutation } from '@/hooks/queries/use-post-mutations';
import { useCreateCommentMutation } from '@/hooks/queries/use-comment-mutations';
import { usePostSocketCacheSync } from '@/hooks/queries/use-post-socket-cache-sync';
import { usePreferredLanguage } from '@/hooks/use-post-translation';
import { useImpressionTracking } from '@/hooks/use-impression-tracking';

import { useAuthStore } from '@/stores/auth-store';
import { TusUploadService } from '@/services/tusUploadService';
import type { MobileTranscription } from '@/services/posts.service';
import type { Post } from '@meeshy/shared/types/post';
import { classifyRelativeTime } from '@meeshy/shared/utils/relative-time';
import { copyToClipboard } from '@/lib/clipboard';

// ─── Helpers ────────────────────────────────────────────────────────────

type TFunc = (key: string, paramsOrFallback?: Record<string, unknown> | string) => string;

function formatRelativeTime(date: string | Date, t: TFunc): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  // beyondDays: Infinity → always falls in now/minutes/hours/days (no absolute date tail).
  const bucket = classifyRelativeTime(d.getTime(), Date.now(), { beyondDays: Infinity });
  if (bucket.unit === 'now') return t('time.now', 'Just now');
  if (bucket.unit === 'minutes') return t('time.minutes', { count: bucket.value });
  if (bucket.unit === 'hours') return t('time.hours', { count: bucket.value });
  const days = bucket.unit === 'days' ? bucket.value : Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return t('time.days', { count: days });
}

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

// ─── Feed tabs ───────────────────────────────────────────────────────────────

/**
 * Posts ⇆ Reels segmented switcher, rendered at the top of the posts feed so
 * the two `/feed/*` surfaces are mutually discoverable. Uses real links for
 * SEO / middle-click / a11y rather than client-only navigation.
 */
export function FeedTabs({ active }: { active: 'posts' | 'reels' }) {
  const { t } = useI18n('feed');
  const base =
    'flex-1 text-center text-sm font-medium rounded-full px-4 py-2 transition-colors';
  const on = 'bg-[var(--gp-terracotta)] text-white';
  const off = 'text-[var(--gp-text-muted)] hover:text-[var(--gp-text-primary)]';
  return (
    <nav aria-label={t('tabs.label', 'Feed type')} className="mb-6">
      <div className="flex gap-1 rounded-full bg-[var(--gp-surface)] border border-[var(--gp-border)] p-1">
        <Link
          href="/feed/posts"
          aria-current={active === 'posts' ? 'page' : undefined}
          className={`${base} ${active === 'posts' ? on : off}`}
        >
          {t('tabs.posts', 'Posts')}
        </Link>
        <Link
          href="/feed/reels"
          aria-current={active === 'reels' ? 'page' : undefined}
          className={`${base} ${active === 'reels' ? on : off}`}
        >
          {t('tabs.reels', 'Reels')}
        </Link>
      </div>
    </nav>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────

/**
 * PostsFeedScreen — the iOS-parity "posts" feed: a scrolling list of post /
 * reel cards, preceded by the public story tray and the mood/status bar, with
 * inline composers. Mounted at the canonical `/feed/posts` route and the
 * legacy `/feeds` alias.
 *
 * Accessibility: a single `<main>` landmark with a labelled heading, each
 * content zone wrapped in a labelled `<section>`, every post rendered as an
 * `<article>`, and live regions (`aria-live="polite"`) for the "updating" and
 * "new posts" hints.
 */
export function PostsFeedScreen() {
  const router = useRouter();
  const { t } = useI18n('feed');
  const toastCtx = useToast();
  const showToast = useCallback(
    (title: string, type: 'success' | 'error' | 'info', description?: string) =>
      toastCtx.addToast(title || description || '', type),
    [toastCtx],
  );

  // Auth & language
  const currentUser = useAuthStore((s) => s.user);
  const currentUserId = currentUser?.id ?? '';
  const userLanguage = usePreferredLanguage();
  const { preferences: storyPrefs } = useStoryPreferences();

  // ─── Posts ────────────────────────────────────────────────────────────
  const feedQuery = useFeedQuery();
  const posts = useFeedPosts(feedQuery);
  const prefetchPost = usePrefetchPost();

  /**
   * Cache-state classification mirroring iOS' `CacheResult<T>`
   * (.fresh / .stale / .empty). The thresholds are deliberately loose:
   * < 30s = fresh (no UI hint), ≥ 30s = stale (silent revalidate + label),
   * no data = empty (skeleton). Keeping this co-located with the
   * `isFetching` check lets us draw the "Updating…" pill only when the
   * data on screen is genuinely older than the current refetch.
   */
  const cacheState: 'fresh' | 'stale' | 'empty' = useMemo(() => {
    if (!feedQuery.data) return 'empty';
    const ageSec = (Date.now() - feedQuery.dataUpdatedAt) / 1000;
    return ageSec < 30 ? 'fresh' : 'stale';
  }, [feedQuery.data, feedQuery.dataUpdatedAt]);

  usePostSocketCacheSync();

  // Impression reporting: each post card that scrolls into view is recorded
  // once per session and batched to the gateway (source: 'feed').
  const { observe: observeImpression } = useImpressionTracking({ source: 'feed' });

  // Post mutations
  const createPostMutation = useCreatePostMutation();
  const likeMutation = useLikePostMutation();
  const unlikeMutation = useUnlikePostMutation();
  const shareMutation = useSharePostMutation();
  const bookmarkMutation = useBookmarkPostMutation();
  const unbookmarkMutation = useUnbookmarkPostMutation();
  const translateMutation = useTranslatePostMutation();
  const deletePostMutation = useDeletePostMutation();
  const pinPostMutation = usePinPostMutation();
  const repostMutation = useRepostMutation();
  const updatePostMutation = useUpdatePostMutation();

  // Edit + Repost + Audio modals
  const [editingPost, setEditingPost] = useState<{ id: string; content: string; visibility: string } | null>(null);
  const [repostingPost, setRepostingPost] = useState<{ id: string; author?: string; content?: string } | null>(null);
  const [audioComposerOpen, setAudioComposerOpen] = useState(false);

  // New posts banner
  const [newPostsCount, setNewPostsCount] = useState(0);
  const prevPostsLengthRef = useRef(posts.length);

  useEffect(() => {
    if (posts.length > prevPostsLengthRef.current && prevPostsLengthRef.current > 0) {
      setNewPostsCount((c) => c + (posts.length - prevPostsLengthRef.current));
    }
    prevPostsLengthRef.current = posts.length;
  }, [posts.length]);

  // Infinite scroll sentinel
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
          feedQuery.fetchNextPage();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [feedQuery.hasNextPage, feedQuery.isFetchingNextPage, feedQuery.fetchNextPage]);

  // ─── Stories ──────────────────────────────────────────────────────────
  const { data: stories, isLoading: storiesLoading } = useStoriesFeedQuery();
  const createStoryMutation = useCreateStoryMutation();
  const deleteStoryMutation = useDeleteStoryMutation();
  const { recordView } = useRecordStoryViewMutation();
  useStoriesRealtime();

  // Statuses / moods — real STATUS posts. Real-time refresh is handled by
  // usePostSocketCacheSync (mounted below), which invalidates the same key on
  // status:created / updated / deleted / reacted.
  const statusesQuery = useStatusesFeedQuery();
  const statuses = useStatusesList(statusesQuery);
  const createStatusMutation = useCreateStatusMutation();

  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState(0);
  const [activeStoryAuthorId, setActiveStoryAuthorId] = useState<string | null>(null);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const viewedStoryIdsRef = useRef(new Set<string>());

  // One tray bubble per author: collapse each author's stories into a single
  // group, preserving first-appearance order.
  const storyGroups = useMemo(
    () => Array.from(groupStoriesByAuthor(stories ?? []).values()),
    [stories],
  );

  const storyItems = useMemo(
    () => storyGroups.map((group) => groupToStoryItem(group, currentUserId, viewedStoryIdsRef.current)),
    [storyGroups, currentUserId],
  );

  const statusItems = useMemo(
    () => statuses.map((status) => postToStatusItem(status, currentUserId)),
    [statuses, currentUserId],
  );

  // The viewer is scoped to the tapped author's stories only.
  const activeStoryData = useMemo(() => {
    if (!activeStoryAuthorId) return [];
    const group = storyGroups.find((g) => g[0]?.authorId === activeStoryAuthorId);
    return group ? group.map(postToStoryData) : [];
  }, [activeStoryAuthorId, storyGroups]);

  const handleStoryPress = useCallback(
    (groupId: string) => {
      const group = storyGroups.find((g) => g[0]?.authorId === groupId);
      if (!group || group.length === 0) return;
      const firstUnviewed = group.findIndex((p) => !viewedStoryIdsRef.current.has(p.id));
      setActiveStoryAuthorId(groupId);
      setStoryViewerIndex(firstUnviewed >= 0 ? firstUnviewed : 0);
      setStoryViewerOpen(true);
    },
    [storyGroups],
  );

  const handleStoryPublish = useCallback(
    (story: { content?: string; storyEffects: Record<string, unknown>; visibility: StoryVisibility; mediaIds?: string[] }) => {
      setStoryComposerOpen(false);
      createStoryMutation.mutate(
        {
          content: story.content,
          storyEffects: story.storyEffects,
          visibility: story.visibility,
          mediaIds: story.mediaIds,
          originalLanguage: userLanguage,
        },
        {
          onSuccess: () => {
            const mediaCount = story.mediaIds?.length ?? 0;
            const desc = mediaCount > 0
              ? t('toast.storyVisibleFriendsMedia', { count: mediaCount })
              : t('toast.storyVisibleFriends', 'Your story is visible to your friends.');
            showToast(t('toast.storyPublished', 'Story published!'), 'success', desc);
          },
          onError: () => showToast(t('toast.error', 'Error'), 'error', t('toast.storyPublishError', "Couldn't publish the story.")),
        },
      );
    },
    [createStoryMutation, userLanguage, showToast, t],
  );

  const handleStoryView = useCallback(
    (storyId: string) => {
      viewedStoryIdsRef.current.add(storyId);
      recordView(storyId);
    },
    [recordView],
  );

  const handleStoryDelete = useCallback(
    (storyId: string) => {
      deleteStoryMutation.mutate(storyId, {
        onSuccess: () => showToast(t('toast.storyDeleted', 'Story deleted'), 'success'),
        onError: () => showToast(t('toast.error', 'Error'), 'error', t('toast.storyDeleteError', "Couldn't delete the story.")),
      });
    },
    [deleteStoryMutation, showToast, t],
  );

  const handleStoryViewerClose = useCallback(() => {
    setStoryViewerOpen(false);
    setActiveStoryAuthorId(null);
  }, []);
  const handleStoryComposerClose = useCallback(() => setStoryComposerOpen(false), []);

  const createCommentMutation = useCreateCommentMutation();
  const handleStoryReply = useCallback(
    (storyId: string, text: string) => {
      createCommentMutation.mutate(
        { postId: storyId, content: text },
        {
          onSuccess: () => showToast('Réponse envoyée', 'success'),
          onError: () => showToast('Erreur', 'error', 'Impossible d\'envoyer la réponse'),
        }
      );
    },
    [createCommentMutation, showToast],
  );

  // ─── Post handlers ────────────────────────────────────────────────────

  const handlePublish = useCallback(
    (data: { content: string; type: 'POST' | 'STORY' | 'STATUS'; visibility: string }) => {
      createPostMutation.mutate(
        { content: data.content, type: data.type, visibility: data.visibility as 'PUBLIC' | 'FRIENDS' | 'PRIVATE' },
        {
          onSuccess: () => showToast(t('toast.postPublished', 'Published!'), 'success', t('toast.postPublishedDesc', 'Your post has been shared.')),
          onError: () => showToast(t('toast.error', 'Error'), 'error', t('toast.postPublishError', "Couldn't publish the post.")),
        },
      );
    },
    [createPostMutation, showToast, t],
  );

  const handleLike = useCallback(
    (postId: string, isCurrentlyLiked: boolean) => {
      if (isCurrentlyLiked) {
        unlikeMutation.mutate({ postId });
      } else {
        likeMutation.mutate({ postId });
      }
    },
    [likeMutation, unlikeMutation],
  );

  const handleReact = useCallback(
    (postId: string, emoji: string, currentUserReactions: readonly string[]) => {
      if (currentUserReactions.includes(emoji)) {
        unlikeMutation.mutate({ postId, emoji });
      } else {
        likeMutation.mutate({ postId, emoji });
      }
    },
    [likeMutation, unlikeMutation],
  );

  const handleComment = useCallback(
    (postId: string) => {
      const post = posts.find((p) => p.id === postId);
      if (post?.type === 'REEL') {
        router.push(`/reel/${postId}`);
      } else {
        router.push(`/feeds/post/${postId}`);
      }
    },
    [router, posts],
  );

  const handleShare = useCallback(
    async (postId: string) => {
      const post = posts.find((p) => p.id === postId);
      const url =
        post?.type === 'REEL'
          ? `${window.location.origin}/reel/${postId}`
          : `${window.location.origin}/feeds/post/${postId}`;

      const { success } = await copyToClipboard(url);
      if (success) {
        shareMutation.mutate({ postId });
        showToast(t('toast.linkCopied', 'Link copied!'), 'success');
      } else {
        showToast(t('toast.error', 'Error'), 'error', t('toast.linkCopyError', "Couldn't copy the link."));
      }
    },
    [shareMutation, showToast, posts],
  );

  const handleBookmark = useCallback(
    (postId: string, isCurrentlyBookmarked: boolean) => {
      if (isCurrentlyBookmarked) {
        unbookmarkMutation.mutate(postId);
      } else {
        bookmarkMutation.mutate(postId);
      }
    },
    [bookmarkMutation, unbookmarkMutation],
  );

  const handleTranslate = useCallback(
    (postId: string) => translateMutation.mutate({ postId, targetLanguage: userLanguage }),
    [translateMutation, userLanguage],
  );

  const handleDeletePost = useCallback(
    (postId: string) => {
      deletePostMutation.mutate(postId, {
        onSuccess: () => showToast(t('toast.postDeleted', 'Post deleted'), 'success'),
      });
    },
    [deletePostMutation, showToast, t],
  );

  const handlePinPost = useCallback(
    (postId: string, isPinned: boolean) => pinPostMutation.mutate({ postId, pin: !isPinned }),
    [pinPostMutation],
  );

  const handleEditPost = useCallback(
    (postId: string) => {
      const post = posts.find((p) => p.id === postId);
      if (post) setEditingPost({ id: post.id, content: post.content ?? '', visibility: post.visibility });
    },
    [posts],
  );

  const handleSaveEdit = useCallback(
    (data: { content: string; visibility: string }) => {
      if (!editingPost) return;
      updatePostMutation.mutate(
        {
          postId: editingPost.id,
          data: { content: data.content, visibility: data.visibility as 'PUBLIC' | 'FRIENDS' | 'PRIVATE' },
        },
        {
          onSuccess: () => {
            setEditingPost(null);
            showToast(t('toast.postEdited', 'Post edited'), 'success');
          },
          onError: () => showToast(t('toast.error', 'Error'), 'error'),
        },
      );
    },
    [editingPost, updatePostMutation, showToast, t],
  );

  const handleRepostOpen = useCallback(
    (postId: string) => {
      const post = posts.find((p) => p.id === postId);
      if (post) setRepostingPost({ id: post.id, author: post.author?.displayName ?? post.author?.username, content: post.content ?? undefined });
    },
    [posts],
  );

  const handleRepost = useCallback(() => {
    if (!repostingPost) return;
    repostMutation.mutate(
      { postId: repostingPost.id, data: { isQuote: false } },
      {
        onSuccess: () => {
          setRepostingPost(null);
          showToast(t('toast.reposted', 'Reposted!'), 'success');
        },
        onError: () => showToast(t('toast.error', 'Error'), 'error'),
      },
    );
  }, [repostingPost, repostMutation, showToast, t]);

  const handleQuote = useCallback(
    (content: string) => {
      if (!repostingPost) return;
      repostMutation.mutate(
        { postId: repostingPost.id, data: { content, isQuote: true } },
        {
          onSuccess: () => {
            setRepostingPost(null);
            showToast(t('toast.quoted', 'Quoted!'), 'success');
          },
          onError: () => showToast(t('toast.error', 'Error'), 'error'),
        },
      );
    },
    [repostingPost, repostMutation, showToast, t],
  );

  const handleDismissNewPosts = useCallback(() => {
    setNewPostsCount(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleAudioPublish = useCallback(
    async (data: { audioFile: File; transcription: MobileTranscription | null; content?: string }) => {
      try {
        const tusService = new TusUploadService();
        const results = await tusService.uploadFiles([data.audioFile], [{ uploadcontext: 'post' }]);
        const mediaId = results[0]?.id;
        if (!mediaId) throw new Error('Upload failed');

        createPostMutation.mutate(
          {
            content: data.content,
            type: 'POST',
            visibility: 'PUBLIC',
            mediaIds: [mediaId],
            mobileTranscription: data.transcription ?? undefined,
          },
          {
            onSuccess: () => {
              setAudioComposerOpen(false);
              showToast(t('toast.audioPublished', 'Audio post published!'), 'success');
            },
            onError: () => showToast(t('toast.error', 'Error'), 'error', t('toast.publishError', "Couldn't publish.")),
          },
        );
      } catch {
        showToast(t('toast.uploadError', 'Upload error'), 'error', t('toast.uploadErrorDesc', "Couldn't upload the audio."));
      }
    },
    [createPostMutation, showToast, t],
  );

  // ─── Status / mood ────────────────────────────────────────────────────
  const [statusComposerOpen, setStatusComposerOpen] = useState(false);

  const handleStatusPress = useCallback(
    (statusId: string) => showToast(t('toast.status', 'Status'), 'info', t('toast.statusSelected', { id: statusId })),
    [showToast, t],
  );

  const handleStatusPublish = useCallback(
    (status: { moodEmoji: string; content?: string }) => {
      setStatusComposerOpen(false);
      createStatusMutation.mutate(
        { moodEmoji: status.moodEmoji, content: status.content, originalLanguage: userLanguage },
        {
          onSuccess: () =>
            showToast(t('toast.moodPublished', 'Mood published!'), 'success', `${status.moodEmoji} ${status.content || ''}`),
          onError: () => showToast(t('toast.moodPublishError', "Couldn't publish your mood"), 'error'),
        },
      );
    },
    [createStatusMutation, showToast, t, userLanguage],
  );

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <DashboardLayout title={t('title', 'Feed')} className="!max-w-none !px-0">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <h1 className="sr-only">{t('srHeading', 'News feed — posts, reels and stories')}</h1>
        <FeedTabs active="posts" />

        {/* Story Tray */}
        <section aria-label={t('sections.stories', 'Public stories')}>
          <h2 className="sr-only">{t('sections.storiesShort', 'Stories')}</h2>
          <StoryTray
            stories={storyItems}
            onStoryPress={handleStoryPress}
            onAddStory={() => setStoryComposerOpen(true)}
            isLoading={storiesLoading}
            className="mb-4"
          />
        </section>

        {/* Status Bar */}
        <section aria-label={t('sections.moods', 'Moods')}>
          <h2 className="sr-only">{t('sections.moods', 'Moods')}</h2>
          <StatusBar
            statuses={statusItems}
            onStatusPress={handleStatusPress}
            onAddStatus={() => setStatusComposerOpen(true)}
            userLanguage={userLanguage}
            isLoading={statusesQuery.isLoading}
            className="mb-6"
          />
        </section>

        {/* Post Composer */}
        <section aria-label={t('sections.compose', 'Compose a post')}>
          <h2 className="sr-only">{t('sections.compose', 'Compose a post')}</h2>
          <div className="flex gap-3 items-start mb-6">
            <div className="flex-1">
              <PostComposer
                currentUser={currentUser ? { username: currentUser.username, avatar: currentUser.avatar } : null}
                onPublish={handlePublish}
                disabled={createPostMutation.isPending}
              />
            </div>
            <button
              onClick={() => setAudioComposerOpen(true)}
              className="mt-3 flex-shrink-0 w-12 h-12 rounded-full bg-[var(--gp-terracotta)] text-white flex items-center justify-center hover:opacity-90 transition-opacity"
              aria-label={t('audioPostLabel', 'Record an audio post')}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </button>
          </div>
        </section>

        {/* Stale indicator — only when cached data is older than 30s AND a refetch is in flight */}
        <div aria-live="polite" className="sr-only">
          {cacheState === 'stale' && feedQuery.isFetching ? t('updating', 'Updating feed…') : ''}
        </div>
        {cacheState === 'stale' && feedQuery.isFetching && (
          <div className="flex items-center justify-center gap-2 py-1 mb-2 text-xs text-[var(--gp-text-muted)]" data-testid="stale-indicator">
            <div className="w-3 h-3 border border-[var(--gp-text-muted)] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            {t('updatingShort', 'Updating…')}
          </div>
        )}

        {/* Skeletons ONLY on cold cache */}
        {cacheState === 'empty' && feedQuery.isLoading && (
          <div className="space-y-6" aria-hidden="true">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-8 w-48" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {feedQuery.isError && (
          <div className="text-center py-12" role="alert">
            <p className="text-[var(--gp-text-muted)] mb-4">{t('loadError', 'Unable to load feed.')}</p>
            <Button variant="secondary" size="sm" onClick={() => feedQuery.refetch()}>
              {t('retry', 'Retry')}
            </Button>
          </div>
        )}

        {/* New posts banner */}
        {newPostsCount > 0 && (
          <button
            onClick={handleDismissNewPosts}
            className="w-full py-2.5 mb-4 rounded-xl bg-[var(--gp-terracotta)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            data-testid="new-posts-banner"
            aria-live="polite"
          >
            {newPostsCount === 1 ? t('newPostsOne', { count: newPostsCount }) : t('newPostsOther', { count: newPostsCount })}
          </button>
        )}

        {/* Posts */}
        {feedQuery.isSuccess && (
          <section aria-label={t('sections.posts', 'Posts')} className="space-y-6">
            <h2 className="sr-only">{t('sections.posts', 'Posts')}</h2>
            {posts.map((post) => {
              const postReactions = post.currentUserReactions ?? [];
              const isLiked = postReactions.includes('❤️') || (post.isLikedByMe ?? false);
              const isBookmarked = !!post.bookmarkedAt;
              const userReaction = postReactions[0];
              return (
                <article
                  key={post.id}
                  ref={(el) => observeImpression(el, post.id)}
                  onMouseEnter={() => prefetchPost(post.id)}
                >
                  <PostCard
                    author={{
                      name: post.author?.displayName ?? post.author?.username ?? t('unknownAuthor', 'Unknown'),
                      avatar: post.author?.avatar ?? undefined,
                    }}
                    lang={post.originalLanguage ?? 'unknown'}
                    content={post.content ?? ''}
                    translations={postToTranslations(post)}
                    userLanguage={userLanguage}
                    time={formatRelativeTime(post.createdAt, t)}
                    likes={post.likeCount}
                    comments={post.commentCount}
                    isLiked={isLiked}
                    isBookmarked={isBookmarked}
                    isAuthor={post.authorId === currentUserId}
                    isPinned={post.isPinned}
                    reactionSummary={post.reactionSummary ?? undefined}
                    userReaction={userReaction}
                    media={post.media}
                    onLike={() => handleLike(post.id, isLiked)}
                    onReact={(emoji) => handleReact(post.id, emoji, postReactions)}
                    onComment={() => handleComment(post.id)}
                    onShare={() => handleShare(post.id)}
                    onBookmark={() => handleBookmark(post.id, isBookmarked)}
                    onTranslate={() => handleTranslate(post.id)}
                    onRepost={() => handleRepostOpen(post.id)}
                    onEdit={() => handleEditPost(post.id)}
                    onDelete={() => handleDeletePost(post.id)}
                    onPin={() => handlePinPost(post.id, post.isPinned)}
                    onClick={() => {
                      if (post.type === 'REEL') {
                        router.push(`/reel/${post.id}`);
                      } else {
                        router.push(`/feeds/post/${post.id}`);
                      }
                    }}
                  />
                </article>
              );
            })}

            {posts.length === 0 && !feedQuery.isLoading && (
              <div className="text-center py-12">
                <p className="text-[var(--gp-text-muted)]">{t('empty', 'No posts yet. Be the first to share something!')}</p>
              </div>
            )}

            <div ref={loadMoreRef} className="h-10">
              {feedQuery.isFetchingNextPage && (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-2 border-[var(--gp-terracotta)] border-t-transparent rounded-full animate-spin" aria-label={t('loadingMore', 'Loading more posts')} />
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Story Viewer */}
      {storyViewerOpen && activeStoryData.length > 0 && (
        <StoryViewer
          stories={activeStoryData}
          initialIndex={storyViewerIndex}
          userLanguage={userLanguage}
          currentUserId={currentUserId}
          onClose={handleStoryViewerClose}
          onView={handleStoryView}
          onReply={handleStoryReply}
          onDelete={handleStoryDelete}
        />
      )}

      {/* Story Composer */}
      <StoryComposer
        open={storyComposerOpen}
        onClose={handleStoryComposerClose}
        onPublish={handleStoryPublish}
        defaultVisibility={storyPrefs.defaultVisibility}
      />

      {/* Status Composer */}
      <StatusComposer
        open={statusComposerOpen}
        onClose={() => setStatusComposerOpen(false)}
        onPublish={handleStatusPublish}
      />

      {/* Audio Post Composer */}
      <AudioPostComposer
        open={audioComposerOpen}
        currentUser={currentUser ? { username: currentUser.username, avatar: currentUser.avatar } : null}
        onPublish={handleAudioPublish}
        onClose={() => setAudioComposerOpen(false)}
        disabled={createPostMutation.isPending}
      />

      {/* Post Editor */}
      {editingPost && (
        <PostEditor
          open
          initialContent={editingPost.content}
          initialVisibility={editingPost.visibility as 'PUBLIC' | 'FRIENDS' | 'PRIVATE'}
          onSave={handleSaveEdit}
          onClose={() => setEditingPost(null)}
          saving={updatePostMutation.isPending}
        />
      )}

      {/* Repost Modal */}
      {repostingPost && (
        <RepostModal
          open
          originalAuthor={repostingPost.author}
          originalContent={repostingPost.content}
          onRepost={handleRepost}
          onQuote={handleQuote}
          onClose={() => setRepostingPost(null)}
          saving={repostMutation.isPending}
        />
      )}
    </DashboardLayout>
  );
}

export default PostsFeedScreen;
