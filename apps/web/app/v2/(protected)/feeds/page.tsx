'use client';

import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, useToast, PageHeader, PostCard, StoryTray, StatusBar, StoryViewer, StoryComposer, StatusComposer } from '@/components/v2';
import type { StatusItem, StoryVisibility } from '@/components/v2';
import { Skeleton } from '@/components/v2/Skeleton';

// Stories (dedicated hooks from stories feature)
import { useStoriesFeedQuery, useCreateStoryMutation, useDeleteStoryMutation, useRecordStoryViewMutation } from '@/hooks/social/use-stories';
import { useStoriesRealtime } from '@/hooks/social/use-stories-realtime';
import { postToStoryItem, postToStoryData } from '@/lib/story-transforms';
import { useStoryPreferences } from '@/stores/user-preferences-store';

// Posts (real API integration)
import { useFeedQuery, useFeedPosts, usePrefetchPost } from '@/hooks/queries/use-feed-query';
import { useCreatePostMutation, useLikePostMutation, useUnlikePostMutation, useSharePostMutation } from '@/hooks/queries/use-post-mutations';
import { usePostSocketCacheSync } from '@/hooks/queries/use-post-socket-cache-sync';
import { usePreferredLanguage } from '@/hooks/use-post-translation';

import { useAuthStore } from '@/stores/auth-store';
import type { Post } from '@meeshy/shared/types/post';

// ─── Helpers ────────────────────────────────────────────────────────────

function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days}j`;
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

// ─── Mock Data (Statuses - to be replaced in future phase) ──────────────

const mockStatuses: StatusItem[] = [
  {
    id: 'st1', author: { name: 'Marie D.' }, moodEmoji: '\uD83C\uDF89', content: 'Trop contente !',
    originalLanguage: 'fr',
    translations: [{ languageCode: 'en', languageName: 'English', content: 'So happy!' }],
    expiresAt: new Date(Date.now() + 2400000).toISOString(), isOwn: true,
  },
  {
    id: 'st2', author: { name: 'Yuki T.' }, moodEmoji: '\u2615', content: '\u30B3\u30FC\u30D2\u30FC\u30BF\u30A4\u30E0',
    originalLanguage: 'ja',
    translations: [{ languageCode: 'fr', languageName: 'Francais', content: "C'est l'heure du caf\u00e9" }],
    expiresAt: new Date(Date.now() + 1800000).toISOString(), isOwn: false,
  },
  {
    id: 'st3', author: { name: 'Carlos M.' }, moodEmoji: '\uD83D\uDD25', content: 'En mode focus',
    originalLanguage: 'fr', expiresAt: new Date(Date.now() + 3000000).toISOString(), isOwn: false,
  },
  {
    id: 'st4', author: { name: 'Li Wei' }, moodEmoji: '\uD83D\uDCDA',
    originalLanguage: 'zh',
    translations: [{ languageCode: 'fr', languageName: 'Francais', content: 'En train de lire' }],
    expiresAt: new Date(Date.now() + 1200000).toISOString(), isOwn: false,
  },
  {
    id: 'st5', author: { name: 'Sophie M.' }, moodEmoji: '\uD83C\uDFB5', content: 'Coding with music',
    originalLanguage: 'en',
    translations: [{ languageCode: 'fr', languageName: 'Francais', content: 'Je code en musique' }],
    expiresAt: new Date(Date.now() + 2000000).toISOString(), isOwn: false,
  },
];

// ─── Page ────────────────────────────────────────────────────────────────

export default function V2FeedsPage() {
  const router = useRouter();
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

  // ─── Posts (real data) ────────────────────────────────────────────────
  const feedQuery = useFeedQuery();
  const posts = useFeedPosts(feedQuery);
  const prefetchPost = usePrefetchPost();

  // Socket.IO → React Query cache sync for posts
  usePostSocketCacheSync();

  // Post mutations
  const createPostMutation = useCreatePostMutation();
  const likeMutation = useLikePostMutation();
  const unlikeMutation = useUnlikePostMutation();
  const shareMutation = useSharePostMutation();

  // Local state for post interactions
  const [newPostContent, setNewPostContent] = useState('');
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [userReactions, setUserReactions] = useState<Record<string, string>>({});

  // Infinite scroll
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

  // ─── Stories (real data) ──────────────────────────────────────────────
  const { data: stories, isLoading: storiesLoading } = useStoriesFeedQuery();
  const createStoryMutation = useCreateStoryMutation();
  const deleteStoryMutation = useDeleteStoryMutation();
  const { recordView } = useRecordStoryViewMutation();
  useStoriesRealtime();

  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState(0);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const viewedStoryIdsRef = useRef(new Set<string>());

  const storyItems = useMemo(
    () => (stories ?? []).map(s => postToStoryItem(s, currentUserId, viewedStoryIdsRef.current)),
    [stories, currentUserId],
  );

  const storyDataList = useMemo(
    () => (stories ?? []).map(postToStoryData),
    [stories],
  );

  const handleStoryPress = useCallback((storyId: string) => {
    const idx = storyDataList.findIndex(s => s.id === storyId);
    if (idx >= 0) {
      setStoryViewerIndex(idx);
      setStoryViewerOpen(true);
    }
  }, [storyDataList]);

  const handleStoryPublish = useCallback((story: { content?: string; storyEffects: Record<string, unknown>; visibility: StoryVisibility; mediaIds?: string[] }) => {
    setStoryComposerOpen(false);
    createStoryMutation.mutate({
      content: story.content,
      storyEffects: story.storyEffects,
      visibility: story.visibility,
      mediaIds: story.mediaIds,
      originalLanguage: userLanguage,
    }, {
      onSuccess: () => {
        const mediaCount = story.mediaIds?.length ?? 0;
        const desc = mediaCount > 0
          ? `Votre story est visible par vos amis (${mediaCount} media).`
          : 'Votre story est visible par vos amis.';
        showToast('Story publi\u00e9e !', 'success', desc);
      },
      onError: () => {
        showToast('Erreur', 'error', 'Impossible de publier la story.');
      },
    });
  }, [createStoryMutation, userLanguage, showToast]);

  const handleStoryView = useCallback((storyId: string) => {
    viewedStoryIdsRef.current.add(storyId);
    recordView(storyId);
  }, [recordView]);

  const handleStoryDelete = useCallback((storyId: string) => {
    deleteStoryMutation.mutate(storyId, {
      onSuccess: () => showToast('Story supprim\u00e9e', 'success'),
      onError: () => showToast('Erreur', 'error', 'Impossible de supprimer la story.'),
    });
  }, [deleteStoryMutation, showToast]);

  const handleStoryViewerClose = useCallback(() => setStoryViewerOpen(false), []);
  const handleStoryComposerClose = useCallback(() => setStoryComposerOpen(false), []);
  const handleStoryReply = useCallback((_id: string, text: string) => {
    showToast('R\u00e9ponse envoy\u00e9e', 'success', text);
  }, [showToast]);

  // ─── Post handlers ────────────────────────────────────────────────────

  const handlePublish = useCallback(() => {
    if (!newPostContent.trim()) {
      showToast('Contenu vide', 'error', '\u00c9crivez quelque chose avant de publier.');
      return;
    }
    createPostMutation.mutate(
      { content: newPostContent.trim(), type: 'POST', visibility: 'PUBLIC' },
      {
        onSuccess: () => {
          setNewPostContent('');
          showToast('Publi\u00e9 !', 'success', 'Votre post a \u00e9t\u00e9 partag\u00e9.');
        },
        onError: () => {
          showToast('Erreur', 'error', 'Impossible de publier le post.');
        },
      },
    );
  }, [newPostContent, createPostMutation, showToast]);

  const handleLike = useCallback((postId: string) => {
    const isLiked = likedPosts.has(postId);
    setLikedPosts((prev) => {
      const next = new Set(prev);
      if (isLiked) next.delete(postId);
      else next.add(postId);
      return next;
    });

    if (isLiked) {
      unlikeMutation.mutate(postId);
    } else {
      likeMutation.mutate({ postId });
    }
  }, [likedPosts, likeMutation, unlikeMutation]);

  const handleReact = useCallback((postId: string, emoji: string) => {
    setUserReactions((prev) => {
      if (prev[postId] === emoji) {
        const next = { ...prev };
        delete next[postId];
        return next;
      }
      return { ...prev, [postId]: emoji };
    });
    likeMutation.mutate({ postId, emoji });
  }, [likeMutation]);

  const handleComment = useCallback((postId: string) => {
    router.push(`/v2/feeds/post/${postId}`);
  }, [router]);

  const handleShare = useCallback(async (postId: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/v2/feeds/post/${postId}`);
      shareMutation.mutate({ postId });
      showToast('Lien copi\u00e9 !', 'success');
    } catch {
      showToast('Erreur', 'error', 'Impossible de copier le lien.');
    }
  }, [shareMutation, showToast]);

  // ─── Status handlers (mock) ───────────────────────────────────────────
  const [statusComposerOpen, setStatusComposerOpen] = useState(false);

  const handleStatusPress = useCallback((statusId: string) => {
    showToast('Status', 'info', `Status ${statusId} s\u00e9lectionn\u00e9`);
  }, [showToast]);

  const handleStatusPublish = useCallback((status: { moodEmoji: string; content?: string }) => {
    setStatusComposerOpen(false);
    showToast('Mood publi\u00e9 !', 'success', `${status.moodEmoji} ${status.content || ''}`);
  }, [showToast]);

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors duration-300">
      <PageHeader title="D\u00e9couvrir Meeshy" />

      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* Story Tray */}
        <StoryTray
          stories={storyItems}
          onStoryPress={handleStoryPress}
          onAddStory={() => setStoryComposerOpen(true)}
          isLoading={storiesLoading}
          className="mb-4"
        />

        {/* Status Bar */}
        <StatusBar
          statuses={mockStatuses}
          onStatusPress={handleStatusPress}
          onAddStatus={() => setStatusComposerOpen(true)}
          userLanguage={userLanguage}
          className="mb-6"
        />

        {/* New Post Composer */}
        <Card variant="default" hover={false} className="p-4 mb-6">
          <div className="flex gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl bg-[var(--gp-parchment)]">
              {'\uD83D\uDC64'}
            </div>
            <div className="flex-1">
              <textarea
                placeholder="Partagez quelque chose avec la communaut\u00e9..."
                className="w-full resize-none border-0 bg-transparent text-base outline-none text-[var(--gp-text-primary)]"
                rows={2}
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
              />
              <div className="flex items-center justify-between mt-2">
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm">{'\uD83D\uDCF7'}</Button>
                  <Button variant="ghost" size="sm">{'\uD83C\uDFA5'}</Button>
                  <Button variant="ghost" size="sm">{'\uD83D\uDCCE'}</Button>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePublish}
                  disabled={createPostMutation.isPending}
                >
                  {createPostMutation.isPending ? 'Publication...' : 'Publier'}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Feed loading state */}
        {feedQuery.isLoading && (
          <div className="space-y-6">
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

        {/* Feed error */}
        {feedQuery.isError && (
          <div className="text-center py-12">
            <p className="text-[var(--gp-text-muted)] mb-4">Unable to load feed.</p>
            <Button variant="secondary" size="sm" onClick={() => feedQuery.refetch()}>
              Retry
            </Button>
          </div>
        )}

        {/* Posts */}
        {feedQuery.isSuccess && (
          <div className="space-y-6">
            {posts.map((post) => (
              <div
                key={post.id}
                onMouseEnter={() => prefetchPost(post.id)}
              >
                <PostCard
                  author={{
                    name: post.author?.displayName ?? post.author?.username ?? 'Unknown',
                    avatar: post.author?.avatar ?? undefined,
                  }}
                  lang={post.originalLanguage ?? 'unknown'}
                  content={post.content ?? ''}
                  translations={postToTranslations(post)}
                  userLanguage={userLanguage}
                  time={formatRelativeTime(post.createdAt)}
                  likes={post.likeCount}
                  comments={post.commentCount}
                  isLiked={likedPosts.has(post.id)}
                  reactionSummary={post.reactionSummary ?? undefined}
                  userReaction={userReactions[post.id]}
                  onLike={() => handleLike(post.id)}
                  onReact={(emoji) => handleReact(post.id, emoji)}
                  onComment={() => handleComment(post.id)}
                  onShare={() => handleShare(post.id)}
                />
              </div>
            ))}

            {/* Empty state */}
            {posts.length === 0 && !feedQuery.isLoading && (
              <div className="text-center py-12">
                <p className="text-[var(--gp-text-muted)]">No posts yet. Be the first to share something!</p>
              </div>
            )}

            {/* Infinite scroll sentinel */}
            <div ref={loadMoreRef} className="h-10">
              {feedQuery.isFetchingNextPage && (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-2 border-[var(--gp-terracotta)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Story Viewer */}
      {storyViewerOpen && storyDataList.length > 0 && (
        <StoryViewer
          stories={storyDataList}
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
    </div>
  );
}
