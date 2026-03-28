'use client';

import { useCallback, useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, useToast, PageHeader, PostCard, StoryTray, StatusBar, StoryViewer, StoryComposer, StatusComposer } from '@/components/v2';
import type { StoryItem, StoryData, StatusItem } from '@/components/v2';
import { useFeedQuery, useFeedPosts, usePrefetchPost } from '@/hooks/queries/use-feed-query';
import { useStoriesQuery, useStatusesQuery } from '@/hooks/queries/use-feed-variants';
import { useCreatePostMutation, useLikePostMutation, useUnlikePostMutation, useSharePostMutation } from '@/hooks/queries/use-post-mutations';
import { usePostSocketCacheSync } from '@/hooks/queries/use-post-socket-cache-sync';
import { usePreferredLanguage } from '@/hooks/use-post-translation';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/v2/Skeleton';
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

function postToStoryItem(post: Post): StoryItem {
  return {
    id: post.id,
    author: { name: post.author?.displayName ?? post.author?.username ?? 'Unknown' },
    hasUnviewed: true,
    isOwn: false,
  };
}

function postToStoryData(post: Post): StoryData {
  return {
    id: post.id,
    author: { name: post.author?.displayName ?? post.author?.username ?? 'Unknown' },
    content: post.content ?? '',
    originalLanguage: post.originalLanguage ?? 'unknown',
    translations: postToTranslations(post),
    storyEffects: (post.storyEffects as Record<string, unknown>) ?? { background: '#2D3748', textStyle: 'bold' as const, textColor: '#ffffff', textPosition: { x: 50, y: 50 } },
    createdAt: typeof post.createdAt === 'string' ? post.createdAt : post.createdAt.toISOString(),
    expiresAt: post.expiresAt ? (typeof post.expiresAt === 'string' ? post.expiresAt : post.expiresAt.toISOString()) : new Date(Date.now() + 72000000).toISOString(),
    viewCount: post.viewCount,
  };
}

function postToStatusItem(post: Post): StatusItem {
  return {
    id: post.id,
    author: { name: post.author?.displayName ?? post.author?.username ?? 'Unknown' },
    moodEmoji: post.moodEmoji ?? '💭',
    content: post.content ?? undefined,
    originalLanguage: post.originalLanguage ?? 'unknown',
    translations: postToTranslations(post),
    expiresAt: post.expiresAt ? (typeof post.expiresAt === 'string' ? post.expiresAt : post.expiresAt.toISOString()) : new Date(Date.now() + 3600000).toISOString(),
    isOwn: false,
  };
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function V2FeedsPage() {
  const router = useRouter();
  const toastCtx = useToast();
  const toast = (opts: { title?: string; description?: string; type?: 'success' | 'error' | 'info' }) =>
    toastCtx.addToast(opts.title || opts.description || '', opts.type);

  const currentUser = useAuthStore((s) => s.user);
  const userLanguage = usePreferredLanguage();

  // ─── Data hooks ──────────────────────────────────────────────────────
  const feedQuery = useFeedQuery();
  const posts = useFeedPosts(feedQuery);
  const storiesQuery = useStoriesQuery();
  const statusesQuery = useStatusesQuery();
  const prefetchPost = usePrefetchPost();

  // Socket.IO → React Query cache sync
  usePostSocketCacheSync();

  // ─── Mutations ───────────────────────────────────────────────────────
  const createPostMutation = useCreatePostMutation();
  const likeMutation = useLikePostMutation();
  const unlikeMutation = useUnlikePostMutation();
  const shareMutation = useSharePostMutation();

  // ─── Local state ─────────────────────────────────────────────────────
  const [newPostContent, setNewPostContent] = useState('');
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [userReactions, setUserReactions] = useState<Record<string, string>>({});
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState(0);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [statusComposerOpen, setStatusComposerOpen] = useState(false);

  // ─── Infinite scroll ─────────────────────────────────────────────────
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

  // ─── Handlers ────────────────────────────────────────────────────────

  const handlePublish = useCallback(() => {
    if (!newPostContent.trim()) {
      toast({ title: 'Contenu vide', description: 'Écrivez quelque chose avant de publier.', type: 'error' });
      return;
    }
    createPostMutation.mutate(
      { content: newPostContent.trim(), type: 'POST', visibility: 'PUBLIC' },
      {
        onSuccess: () => {
          setNewPostContent('');
          toast({ title: 'Publié !', description: 'Votre post a été partagé.', type: 'success' });
        },
        onError: () => {
          toast({ title: 'Erreur', description: 'Impossible de publier le post.', type: 'error' });
        },
      },
    );
  }, [newPostContent, createPostMutation, toast]);

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
      toast({ title: 'Lien copié !', type: 'success' });
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de copier le lien.', type: 'error' });
    }
  }, [shareMutation, toast]);

  // ─── Story / Status data mapping ────────────────────────────────────
  const storyItems: StoryItem[] = (storiesQuery.data ?? []).map(postToStoryItem);
  const storyDataList: StoryData[] = (storiesQuery.data ?? []).map(postToStoryData);
  const statusItems: StatusItem[] = statusesQuery.data
    ? statusesQuery.data.pages.flatMap((p) => p.data).map(postToStatusItem)
    : [];

  const handleStoryPress = useCallback((storyId: string) => {
    const idx = storyDataList.findIndex((s) => s.id === storyId);
    if (idx >= 0) {
      setStoryViewerIndex(idx);
      setStoryViewerOpen(true);
    }
  }, [storyDataList]);

  const handleStoryPublish = useCallback((story: { content?: string; storyEffects: Record<string, unknown>; visibility: string; mediaIds?: string[] }) => {
    setStoryComposerOpen(false);
    createPostMutation.mutate({ content: story.content, type: 'STORY', visibility: 'FRIENDS', storyEffects: story.storyEffects });
    toast({ title: 'Story publiée !', type: 'success' });
  }, [createPostMutation, toast]);

  const handleStatusPress = useCallback((statusId: string) => {
    toast({ title: 'Status', description: `Status ${statusId} sélectionné`, type: 'info' });
  }, [toast]);

  const handleStatusPublish = useCallback((status: { moodEmoji: string; content?: string }) => {
    setStatusComposerOpen(false);
    createPostMutation.mutate({ content: status.content, type: 'STATUS', visibility: 'FRIENDS', moodEmoji: status.moodEmoji });
    toast({ title: 'Mood publié !', description: `${status.moodEmoji} ${status.content || ''}`, type: 'success' });
  }, [createPostMutation, toast]);

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors duration-300">
      <PageHeader title="Découvrir Meeshy" />

      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* Story Tray */}
        <StoryTray
          stories={storyItems}
          onStoryPress={handleStoryPress}
          onAddStory={() => setStoryComposerOpen(true)}
          className="mb-4"
        />

        {/* Status Bar */}
        <StatusBar
          statuses={statusItems}
          onStatusPress={handleStatusPress}
          onAddStatus={() => setStatusComposerOpen(true)}
          userLanguage={userLanguage}
          className="mb-6"
        />

        {/* New Post Composer */}
        <Card variant="default" hover={false} className="p-4 mb-6">
          <div className="flex gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl bg-[var(--gp-parchment)]">
              👤
            </div>
            <div className="flex-1">
              <textarea
                placeholder="Partagez quelque chose avec la communauté..."
                className="w-full resize-none border-0 bg-transparent text-base outline-none text-[var(--gp-text-primary)]"
                rows={2}
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
              />
              <div className="flex items-center justify-between mt-2">
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm">📷</Button>
                  <Button variant="ghost" size="sm">🎥</Button>
                  <Button variant="ghost" size="sm">📎</Button>
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
          onClose={() => setStoryViewerOpen(false)}
          onView={(id) => console.log('Viewed story:', id)}
          onReply={(id, text) => {
            toast({ title: 'Réponse envoyée', description: text, type: 'success' });
          }}
        />
      )}

      {/* Story Composer */}
      <StoryComposer
        open={storyComposerOpen}
        onClose={() => setStoryComposerOpen(false)}
        onPublish={handleStoryPublish}
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
