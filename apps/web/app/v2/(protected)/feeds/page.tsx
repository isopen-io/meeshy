'use client';

import { useState, useMemo, useCallback } from 'react';
import { Button, Card, useToast, PageHeader, PostCard, StoryTray, StatusBar, StoryViewer, StoryComposer, StatusComposer } from '@/components/v2';
import type { StatusItem, TranslationItem } from '@/components/v2';
import { useStoriesFeedQuery, useCreateStoryMutation, useDeleteStoryMutation, useRecordStoryViewMutation } from '@/hooks/social/use-stories';
import { useStoriesRealtime } from '@/hooks/social/use-stories-realtime';
import { postToStoryItem, postToStoryData } from '@/lib/story-transforms';
import { useAuthStore } from '@/stores/auth-store';
import { useLanguageStore } from '@/stores/language-store';
import { useStoryPreferences } from '@/stores/user-preferences-store';

// ─── Mock Data (Posts & Statuses - to be replaced in future phases) ──────

interface FeedPost {
  id: number;
  author: string;
  avatar: string;
  lang: string;
  content: string;
  translations: TranslationItem[];
  likes: number;
  comments: number;
  time: string;
  reactionSummary?: Record<string, number>;
}

const initialPosts: FeedPost[] = [
  {
    id: 1,
    author: 'Marie Dubois',
    avatar: '\uD83D\uDC69',
    lang: 'fr',
    content: "Aujourd'hui j'ai d\u00e9couvert Meeshy et c'est incroyable ! Je peux enfin discuter avec mes amis japonais sans barri\u00e8re linguistique \uD83C\uDF89",
    translations: [
      { languageCode: 'en', languageName: 'English', content: "Today I discovered Meeshy and it's amazing! I can finally chat with my Japanese friends without language barriers \uD83C\uDF89" },
      { languageCode: 'ja', languageName: 'Nihongo', content: '\u4ECA\u65E5Meeshy\u3092\u767A\u898B\u3057\u3066\u3001\u3059\u3054\u3044\u3067\u3059\uFF01\u65E5\u672C\u306E\u53CB\u9054\u3068\u8A00\u8449\u306E\u58C1\u306A\u304F\u8A71\u305B\u308B\u3088\u3046\u306B\u306A\u308A\u307E\u3057\u305F \uD83C\uDF89' },
    ],
    likes: 42,
    comments: 8,
    time: 'Il y a 2h',
    reactionSummary: { '\u2764\uFE0F': 28, '\uD83D\uDD25': 10, '\uD83D\uDC4F': 4 },
  },
  {
    id: 2,
    author: '\u7530\u4E2D \u512A\u5B50',
    avatar: '\uD83D\uDC67',
    lang: 'ja',
    content: '\u65B0\u3057\u3044\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u306E\u30A2\u30A4\u30C7\u30A2\u3092\u5171\u6709\u3057\u305F\u3044\u3067\u3059\u3002\u8AB0\u304B\u8208\u5473\u304C\u3042\u308A\u307E\u3059\u304B\uFF1F',
    translations: [
      { languageCode: 'fr', languageName: 'Francais', content: "Je voudrais partager une id\u00e9e de nouveau projet. Quelqu'un est int\u00e9ress\u00e9 ?" },
      { languageCode: 'en', languageName: 'English', content: "I'd like to share a new project idea. Anyone interested?" },
    ],
    likes: 28,
    comments: 15,
    time: 'Il y a 4h',
    reactionSummary: { '\u2764\uFE0F': 15, '\uD83D\uDE2E': 8, '\uD83D\uDD25': 5 },
  },
  {
    id: 3,
    author: 'Carlos Mendez',
    avatar: '\uD83D\uDC68',
    lang: 'es',
    content: '\u00A1La traducci\u00F3n en tiempo real es incre\u00EDble! Nunca pens\u00E9 que podr\u00EDa comunicarme tan f\u00E1cilmente con personas de todo el mundo.',
    translations: [
      { languageCode: 'fr', languageName: 'Francais', content: "La traduction en temps r\u00e9el est incroyable ! Je n'aurais jamais pens\u00e9 pouvoir communiquer aussi facilement avec des gens du monde entier." },
      { languageCode: 'en', languageName: 'English', content: "Real-time translation is incredible! I never thought I could communicate so easily with people from all over the world." },
    ],
    likes: 56,
    comments: 12,
    time: 'Il y a 6h',
    reactionSummary: { '\uD83D\uDD25': 30, '\uD83D\uDC4F': 15, '\uD83D\uDE02': 11 },
  },
];

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
  const toastCtx = useToast();
  const toast = (opts: { title?: string; description?: string; type?: string }) =>
    toastCtx.addToast(opts.title || opts.description || '', opts.type as 'success' | 'error' | 'info');

  // Auth & language
  const currentUser = useAuthStore(s => s.user);
  const currentUserId = currentUser?.id ?? '';
  const userLanguage = useLanguageStore(s => s.userLanguageConfig.systemLanguage);
  const { preferences: storyPrefs } = useStoryPreferences();

  // ─── Stories (real data) ──────────────────────────────────────────────
  const { data: stories, isLoading: storiesLoading } = useStoriesFeedQuery();
  const createStoryMutation = useCreateStoryMutation();
  const deleteStoryMutation = useDeleteStoryMutation();
  const { recordView } = useRecordStoryViewMutation();
  useStoriesRealtime();

  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState(0);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [viewedStoryIds] = useState(() => new Set<string>());

  const storyItems = useMemo(
    () => (stories ?? []).map(s => postToStoryItem(s, currentUserId, viewedStoryIds)),
    [stories, currentUserId, viewedStoryIds]
  );

  const storyDataList = useMemo(
    () => (stories ?? []).map(postToStoryData),
    [stories]
  );

  const handleStoryPress = useCallback((storyId: string) => {
    const idx = storyDataList.findIndex(s => s.id === storyId);
    if (idx >= 0) {
      setStoryViewerIndex(idx);
      setStoryViewerOpen(true);
    }
  }, [storyDataList]);

  const handleStoryPublish = useCallback((story: { content?: string; storyEffects: Record<string, unknown>; visibility: string; mediaIds?: string[] }) => {
    setStoryComposerOpen(false);
    createStoryMutation.mutate({
      content: story.content,
      storyEffects: story.storyEffects,
      visibility: story.visibility as 'PUBLIC' | 'FRIENDS' | 'PRIVATE',
      mediaIds: story.mediaIds,
      originalLanguage: userLanguage,
    }, {
      onSuccess: () => {
        const mediaCount = story.mediaIds?.length ?? 0;
        const desc = mediaCount > 0
          ? `Votre story est visible par vos amis (${mediaCount} media).`
          : 'Votre story est visible par vos amis.';
        toast({ title: 'Story publi\u00e9e !', description: desc, type: 'success' });
      },
      onError: () => {
        toast({ title: 'Erreur', description: 'Impossible de publier la story.', type: 'error' });
      },
    });
  }, [createStoryMutation, userLanguage, toast]);

  const handleStoryView = useCallback((storyId: string) => {
    viewedStoryIds.add(storyId);
    recordView(storyId);
  }, [viewedStoryIds, recordView]);

  const handleStoryDelete = useCallback((storyId: string) => {
    deleteStoryMutation.mutate(storyId, {
      onSuccess: () => {
        toast({ title: 'Story supprim\u00e9e', type: 'success' });
      },
      onError: () => {
        toast({ title: 'Erreur', description: 'Impossible de supprimer la story.', type: 'error' });
      },
    });
  }, [deleteStoryMutation, toast]);

  // ─── Posts (mock - to be replaced later) ──────────────────────────────
  const [posts, setPosts] = useState<FeedPost[]>(initialPosts);
  const [newPostContent, setNewPostContent] = useState('');
  const [likedPosts, setLikedPosts] = useState<Set<number>>(new Set());
  const [userReactions, setUserReactions] = useState<Record<number, string>>({});

  const handlePublish = () => {
    if (!newPostContent.trim()) {
      toast({ title: 'Contenu vide', description: '\u00c9crivez quelque chose avant de publier.', type: 'error' });
      return;
    }

    const newPost: FeedPost = {
      id: Date.now(),
      author: 'Vous',
      avatar: '\uD83D\uDC64',
      lang: 'fr',
      content: newPostContent.trim(),
      translations: [],
      likes: 0,
      comments: 0,
      time: "\u00c0 l'instant",
    };

    setPosts([newPost, ...posts]);
    setNewPostContent('');
    toast({ title: 'Publi\u00e9 !', description: 'Votre post a \u00e9t\u00e9 partag\u00e9 avec la communaut\u00e9.', type: 'success' });
  };

  const handleLike = (postId: number) => {
    const isLiked = likedPosts.has(postId);
    setLikedPosts((prev) => {
      const newSet = new Set(prev);
      if (isLiked) newSet.delete(postId);
      else newSet.add(postId);
      return newSet;
    });
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? { ...post, likes: isLiked ? post.likes - 1 : post.likes + 1 }
          : post
      )
    );
  };

  const handleReact = (postId: number, emoji: string) => {
    setUserReactions((prev) => {
      if (prev[postId] === emoji) {
        const next = { ...prev };
        delete next[postId];
        return next;
      }
      return { ...prev, [postId]: emoji };
    });
  };

  const handleComment = () => {
    toast({ title: 'Bient\u00f4t disponible', description: 'Les commentaires arrivent bient\u00f4t.', type: 'info' });
  };

  const handleShare = async (postId: number) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/v2/feeds/post/${postId}`);
      toast({ title: 'Lien copi\u00e9 !', description: 'Le lien du post est dans le presse-papiers.', type: 'success' });
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de copier le lien.', type: 'error' });
    }
  };

  // ─── Status (mock - to be replaced later) ─────────────────────────────
  const [statusComposerOpen, setStatusComposerOpen] = useState(false);

  const handleStatusPress = (statusId: string) => {
    toast({ title: 'Status', description: `Status ${statusId} s\u00e9lectionn\u00e9`, type: 'info' });
  };

  const handleStatusPublish = (status: { moodEmoji: string; content?: string }) => {
    setStatusComposerOpen(false);
    toast({ title: 'Mood publi\u00e9 !', description: `${status.moodEmoji} ${status.content || ''}`, type: 'success' });
  };

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
                <Button variant="primary" size="sm" onClick={handlePublish}>Publier</Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Posts */}
        <div className="space-y-6">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              author={{ name: post.author, emoji: post.avatar }}
              lang={post.lang}
              content={post.content}
              translations={post.translations}
              userLanguage={userLanguage}
              time={post.time}
              likes={likedPosts.has(post.id) ? post.likes + 1 : post.likes}
              comments={post.comments}
              isLiked={likedPosts.has(post.id)}
              reactionSummary={post.reactionSummary}
              userReaction={userReactions[post.id]}
              onLike={() => handleLike(post.id)}
              onReact={(emoji) => handleReact(post.id, emoji)}
              onComment={handleComment}
              onShare={() => handleShare(post.id)}
            />
          ))}
        </div>
      </main>

      {/* Story Viewer */}
      {storyViewerOpen && storyDataList.length > 0 && (
        <StoryViewer
          stories={storyDataList}
          initialIndex={storyViewerIndex}
          userLanguage={userLanguage}
          currentUserId={currentUserId}
          onClose={() => setStoryViewerOpen(false)}
          onView={handleStoryView}
          onReply={(id, text) => {
            toast({ title: 'R\u00e9ponse envoy\u00e9e', description: text, type: 'success' });
          }}
          onDelete={handleStoryDelete}
        />
      )}

      {/* Story Composer */}
      <StoryComposer
        open={storyComposerOpen}
        onClose={() => setStoryComposerOpen(false)}
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
