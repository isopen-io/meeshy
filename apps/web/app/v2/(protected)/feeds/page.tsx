'use client';

import { useState } from 'react';
import { Button, Card, useToast, PageHeader, PostCard, StoryTray, StatusBar, StoryViewer, StoryComposer, StatusComposer } from '@/components/v2';
import type { StoryItem, StoryData, StatusItem, TranslationItem } from '@/components/v2';

// ─── Mock Data ───────────────────────────────────────────────────────────

interface Post {
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

const USER_LANGUAGE = 'fr';

const initialPosts: Post[] = [
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

const mockStories: StoryItem[] = [
  { id: 's1', author: { name: 'Marie D.' }, hasUnviewed: true, isOwn: true },
  { id: 's2', author: { name: 'Yuki T.' }, hasUnviewed: true, isOwn: false },
  { id: 's3', author: { name: 'Carlos M.' }, hasUnviewed: true, isOwn: false },
  { id: 's4', author: { name: 'Li Wei' }, hasUnviewed: false, isOwn: false },
  { id: 's5', author: { name: 'Sophie M.' }, hasUnviewed: true, isOwn: false },
  { id: 's6', author: { name: 'Ahmed H.' }, hasUnviewed: false, isOwn: false },
];

const mockStoryData: StoryData[] = [
  {
    id: 's1',
    author: { name: 'Marie D.' },
    content: 'Premier jour sur Meeshy !',
    originalLanguage: 'fr',
    translations: [
      { languageCode: 'en', languageName: 'English', content: 'First day on Meeshy!' },
    ],
    storyEffects: { background: 'gradient:#C4704B,#1A6B5A', textStyle: 'bold' as const, textColor: '#ffffff', textPosition: { x: 50, y: 50 } },
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    expiresAt: new Date(Date.now() + 72000000).toISOString(),
    viewCount: 24,
  },
  {
    id: 's2',
    author: { name: 'Yuki T.' },
    content: '\u6771\u4EAC\u306E\u591C\u666F',
    originalLanguage: 'ja',
    translations: [
      { languageCode: 'fr', languageName: 'Francais', content: 'Vue nocturne de Tokyo' },
      { languageCode: 'en', languageName: 'English', content: 'Tokyo night view' },
    ],
    storyEffects: { background: '#2D3748', textStyle: 'neon' as const, textColor: '#00ffcc', textPosition: { x: 50, y: 40 }, stickers: [{ emoji: '\uD83C\uDF03', x: 80, y: 70, scale: 2, rotation: -10 }] },
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    expiresAt: new Date(Date.now() + 68400000).toISOString(),
    viewCount: 56,
  },
  {
    id: 's3',
    author: { name: 'Carlos M.' },
    content: 'Hola desde Barcelona!',
    originalLanguage: 'es',
    translations: [
      { languageCode: 'fr', languageName: 'Francais', content: 'Bonjour depuis Barcelone !' },
    ],
    storyEffects: { background: '#E8C547', textStyle: 'handwriting' as const, textColor: '#2D3748', textPosition: { x: 50, y: 50 } },
    createdAt: new Date(Date.now() - 5400000).toISOString(),
    expiresAt: new Date(Date.now() + 70200000).toISOString(),
    viewCount: 33,
  },
  {
    id: 's4',
    author: { name: 'Li Wei' },
    content: '\u4ECA\u5929\u5B66\u4E60\u4E86\u65B0\u8BCD\u6C47',
    originalLanguage: 'zh',
    translations: [
      { languageCode: 'fr', languageName: 'Francais', content: "Aujourd'hui j'ai appris du nouveau vocabulaire" },
    ],
    storyEffects: { background: '#1A6B5A', textStyle: 'typewriter' as const, textColor: '#ffffff', textPosition: { x: 50, y: 45 } },
    createdAt: new Date(Date.now() - 10800000).toISOString(),
    expiresAt: new Date(Date.now() + 64800000).toISOString(),
    viewCount: 12,
  },
  {
    id: 's5',
    author: { name: 'Sophie M.' },
    content: 'Code & coffee',
    originalLanguage: 'en',
    translations: [
      { languageCode: 'fr', languageName: 'Francais', content: 'Code et caf\u00e9' },
    ],
    storyEffects: { background: 'gradient:#2D3748,#C4704B', textStyle: 'bold' as const, textColor: '#ffffff', textPosition: { x: 50, y: 50 }, stickers: [{ emoji: '\u2615', x: 75, y: 65, scale: 1.5, rotation: 15 }] },
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    expiresAt: new Date(Date.now() + 73800000).toISOString(),
    viewCount: 41,
  },
  {
    id: 's6',
    author: { name: 'Ahmed H.' },
    content: '\u0645\u0631\u062D\u0628\u0627 \u0645\u0646 \u0627\u0644\u0642\u0627\u0647\u0631\u0629',
    originalLanguage: 'ar',
    translations: [
      { languageCode: 'fr', languageName: 'Francais', content: 'Bonjour depuis Le Caire' },
    ],
    storyEffects: { background: '#C4704B', textStyle: 'bold' as const, textColor: '#ffffff', textPosition: { x: 50, y: 50 } },
    createdAt: new Date(Date.now() - 14400000).toISOString(),
    expiresAt: new Date(Date.now() + 61200000).toISOString(),
    viewCount: 8,
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
  const { toast } = useToast();
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [newPostContent, setNewPostContent] = useState('');
  const [likedPosts, setLikedPosts] = useState<Set<number>>(new Set());
  const [userReactions, setUserReactions] = useState<Record<number, string>>({});

  // Story state
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState(0);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);

  // Status state
  const [statusComposerOpen, setStatusComposerOpen] = useState(false);

  const handlePublish = () => {
    if (!newPostContent.trim()) {
      toast({
        title: 'Contenu vide',
        description: '\u00c9crivez quelque chose avant de publier.',
        type: 'error',
      });
      return;
    }

    const newPost: Post = {
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
    toast({
      title: 'Publi\u00e9 !',
      description: 'Votre post a \u00e9t\u00e9 partag\u00e9 avec la communaut\u00e9.',
      type: 'success',
    });
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

  const handleStoryPress = (storyId: string) => {
    const idx = mockStoryData.findIndex((s) => s.id === storyId);
    if (idx >= 0) {
      setStoryViewerIndex(idx);
      setStoryViewerOpen(true);
    }
  };

  const handleStoryPublish = (story: { content?: string; storyEffects: Record<string, unknown>; visibility: string }) => {
    setStoryComposerOpen(false);
    toast({ title: 'Story publi\u00e9e !', description: 'Votre story est visible par vos amis.', type: 'success' });
  };

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
          stories={mockStories}
          onStoryPress={handleStoryPress}
          onAddStory={() => setStoryComposerOpen(true)}
          className="mb-4"
        />

        {/* Status Bar */}
        <StatusBar
          statuses={mockStatuses}
          onStatusPress={handleStatusPress}
          onAddStatus={() => setStatusComposerOpen(true)}
          userLanguage={USER_LANGUAGE}
          className="mb-6"
        />

        {/* New Post Composer */}
        <Card variant="default" hover={false} className="p-4 mb-6">
          <div className="flex gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl bg-[var(--gp-parchment)]">
              \uD83D\uDC64
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
                  <Button variant="ghost" size="sm">\uD83D\uDCF7</Button>
                  <Button variant="ghost" size="sm">\uD83C\uDFA5</Button>
                  <Button variant="ghost" size="sm">\uD83D\uDCCE</Button>
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
              userLanguage={USER_LANGUAGE}
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
      {storyViewerOpen && (
        <StoryViewer
          stories={mockStoryData}
          initialIndex={storyViewerIndex}
          userLanguage={USER_LANGUAGE}
          onClose={() => setStoryViewerOpen(false)}
          onView={(id) => console.log('Viewed story:', id)}
          onReply={(id, text) => {
            toast({ title: 'R\u00e9ponse envoy\u00e9e', description: text, type: 'success' });
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
