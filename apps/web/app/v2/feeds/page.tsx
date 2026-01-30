'use client';

import Link from 'next/link';
import { Button, Card, Badge, LanguageOrb, theme } from '@/components/v2';

const posts = [
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
  return (
    <div className="min-h-screen" style={{ background: theme.colors.warmCanvas }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 px-6 py-4 border-b"
        style={{ background: `${theme.colors.warmCanvas}ee`, backdropFilter: 'blur(20px)', borderColor: theme.colors.parchment }}
      >
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/v2/landing" className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ background: `linear-gradient(135deg, ${theme.colors.terracotta}, ${theme.colors.deepTeal})` }}
            >
              M
            </div>
            <span className="font-semibold" style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}>
              Découvrir
            </span>
          </Link>
          <div className="flex gap-2">
            <Link href="/v2/notifications">
              <Button variant="ghost" size="sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </Button>
            </Link>
            <Link href="/v2/u">
              <Button variant="ghost" size="sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </Button>
            </Link>
          </div>
        </div>
      </header>

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
              />
              <div className="flex items-center justify-between mt-2">
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm">📷</Button>
                  <Button variant="ghost" size="sm">🎥</Button>
                  <Button variant="ghost" size="sm">📎</Button>
                </div>
                <Button variant="primary" size="sm">Publier</Button>
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
                  <button className="flex items-center gap-2 text-sm" style={{ color: theme.colors.textSecondary }}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                    {post.likes}
                  </button>
                  <button className="flex items-center gap-2 text-sm" style={{ color: theme.colors.textSecondary }}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    {post.comments}
                  </button>
                  <button className="flex items-center gap-2 text-sm" style={{ color: theme.colors.textSecondary }}>
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

      {/* Bottom Nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 border-t py-2 px-6"
        style={{ background: 'white', borderColor: theme.colors.parchment }}
      >
        <div className="max-w-2xl mx-auto flex justify-around">
          <Link href="/v2/feeds">
            <Button variant="ghost" size="sm" style={{ color: theme.colors.terracotta }}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </Button>
          </Link>
          <Link href="/v2/chats">
            <Button variant="ghost" size="sm">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </Button>
          </Link>
          <Link href="/v2/communities">
            <Button variant="ghost" size="sm">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </Button>
          </Link>
          <Link href="/v2/u">
            <Button variant="ghost" size="sm">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </Button>
          </Link>
        </div>
      </nav>

      {/* Fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
