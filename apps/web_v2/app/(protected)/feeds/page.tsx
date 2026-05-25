'use client';

import { useState } from 'react';
import { Button, Card, Badge, LanguageOrb, theme, useToast, PageHeader } from '@/components';

interface Post {
  id: number;
  author: string;
  avatar: string;
  lang: string;
  content: string;
  translation: string;
  likes: number;
  comments: number;
  time: string;
}

const initialPosts: Post[] = [
  {
    id: 1,
    author: 'Marie Dubois',
    avatar: '👩',
    lang: 'fr',
    content: "Aujourd'hui j'ai découvert Meeshy et c'est incroyable ! Je peux enfin discuter avec mes amis japonais sans barrière linguistique 🎉",
    translation: "Today I discovered Meeshy and it's amazing! I can finally chat with my Japanese friends without language barriers 🎉",
    likes: 42,
    comments: 8,
    time: 'Il y a 2h',
  },
  {
    id: 2,
    author: '田中 優子',
    avatar: '👧',
    lang: 'ja',
    content: '新しいプロジェクトのアイデアを共有したいです。誰か興味がありますか？',
    translation: "Je voudrais partager une idée de nouveau projet. Quelqu'un est intéressé ?",
    likes: 28,
    comments: 15,
    time: 'Il y a 4h',
  },
  {
    id: 3,
    author: 'Carlos Mendez',
    avatar: '👨',
    lang: 'es',
    content: '¡La traducción en tiempo real es increíble! Nunca pensé que podría comunicarme tan fácilmente con personas de todo el mundo.',
    translation: "La traduction en temps réel est incroyable ! Je n'aurais jamais pensé pouvoir communiquer aussi facilement avec des gens du monde entier.",
    likes: 56,
    comments: 12,
    time: 'Il y a 6h',
  },
];

export default function V2FeedsPage() {
  const { toast } = useToast();
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [newPostContent, setNewPostContent] = useState('');
  const [likedPosts, setLikedPosts] = useState<Set<number>>(new Set());

  const handlePublish = () => {
    if (!newPostContent.trim()) {
      toast({
        title: 'Contenu vide',
        description: 'Veuillez écrire quelque chose avant de publier.',
        type: 'error',
      });
      return;
    }

    const newPost: Post = {
      id: Date.now(),
      author: 'Vous',
      avatar: '👤',
      lang: 'fr',
      content: newPostContent.trim(),
      translation: newPostContent.trim(),
      likes: 0,
      comments: 0,
      time: "À l'instant",
    };

    setPosts([newPost, ...posts]);
    setNewPostContent('');
    toast({
      title: 'Publié !',
      description: 'Votre post a été partagé avec la communauté.',
      type: 'success',
    });
  };

  const handleLike = (postId: number) => {
    const isLiked = likedPosts.has(postId);

    setLikedPosts((prev) => {
      const newSet = new Set(prev);
      if (isLiked) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });

    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? { ...post, likes: isLiked ? post.likes - 1 : post.likes + 1 }
          : post
      )
    );

    toast({
      title: isLiked ? 'Like retiré' : 'Aimé !',
      description: isLiked ? 'Vous avez retiré votre like.' : 'Vous avez aimé ce post.',
      type: 'info',
    });
  };

  const handleComment = () => {
    toast({
      title: 'Fonctionnalité à venir',
      description: 'Les commentaires seront bientôt disponibles.',
      type: 'info',
    });
  };

  const handleShare = async (postId: number) => {
    const postUrl = `${window.location.origin}/feeds/post/${postId}`;

    try {
      await navigator.clipboard.writeText(postUrl);
      toast({
        title: 'Lien copié !',
        description: 'Le lien du post a été copié dans le presse-papiers.',
        type: 'success',
      });
    } catch {
      toast({
        title: 'Erreur',
        description: 'Impossible de copier le lien.',
        type: 'error',
      });
    }
  };

  return (
    <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors duration-300">
      <PageHeader title="Découvrir Meeshy" />

      {/* Content */}
      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* New Post */}
        <Card variant="default" hover={false} className="p-4 mb-6">
          <div className="flex gap-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
              style={{ background: theme.colors.parchment }}
            >
              👤
            </div>
            <div className="flex-1">
              <textarea
                placeholder="Partagez quelque chose avec la communauté..."
                className="w-full resize-none border-0 bg-transparent text-base outline-none"
                rows={2}
                style={{ color: theme.colors.textPrimary }}
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
              />
              <div className="flex items-center justify-between mt-2">
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm">📷</Button>
                  <Button variant="ghost" size="sm">🎥</Button>
                  <Button variant="ghost" size="sm">📎</Button>
                </div>
                <Button variant="primary" size="sm" onClick={handlePublish}>Publier</Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Posts */}
        <div className="space-y-6">
          {posts.map((post) => (
            <Card key={post.id} variant="default" hover={false} className="overflow-hidden">
              <div className="p-4">
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
                    style={{ background: theme.colors.parchment }}
                  >
                    {post.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold" style={{ color: theme.colors.charcoal }}>
                        {post.author}
                      </span>
                      <LanguageOrb code={post.lang} size="sm" pulse={false} className="w-6 h-6 text-sm" />
                    </div>
                    <span className="text-sm" style={{ color: theme.colors.textMuted }}>{post.time}</span>
                  </div>
                </div>

                {/* Content */}
                <p className="mb-3" style={{ color: theme.colors.textPrimary }}>{post.content}</p>

                {/* Translation */}
                <div
                  className="p-3 rounded-xl mb-4"
                  style={{ background: theme.colors.parchment }}
                >
                  <div className="flex items-center gap-1 text-xs mb-1" style={{ color: theme.colors.textMuted }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                    </svg>
                    Traduit automatiquement
                  </div>
                  <p className="text-sm italic" style={{ color: theme.colors.textSecondary }}>
                    {post.translation}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-6">
                  <button
                    className="flex items-center gap-2 text-sm transition-colors"
                    style={{ color: likedPosts.has(post.id) ? theme.colors.terracotta : theme.colors.textSecondary }}
                    onClick={() => handleLike(post.id)}
                  >
                    <svg
                      className="w-5 h-5"
                      fill={likedPosts.has(post.id) ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                    {post.likes}
                  </button>
                  <button
                    className="flex items-center gap-2 text-sm"
                    style={{ color: theme.colors.textSecondary }}
                    onClick={handleComment}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    {post.comments}
                  </button>
                  <button
                    className="flex items-center gap-2 text-sm"
                    style={{ color: theme.colors.textSecondary }}
                    onClick={() => handleShare(post.id)}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    Partager
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </main>

      {/* Fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
