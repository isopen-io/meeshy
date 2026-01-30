'use client';

import Link from 'next/link';
import { Button, Card, Badge, LanguageOrb, theme } from '@/components/v2';

const notifications = [
  { id: 1, type: 'message', user: 'Yuki Tanaka', avatar: '👧', lang: 'ja', content: 'vous a envoyé un message', time: 'Il y a 5 min', unread: true },
  { id: 2, type: 'like', user: 'Carlos García', avatar: '👨', lang: 'es', content: 'a aimé votre publication', time: 'Il y a 1h', unread: true },
  { id: 3, type: 'follow', user: 'Emma Wilson', avatar: '👩', lang: 'en', content: 'a commencé à vous suivre', time: 'Il y a 2h', unread: false },
  { id: 4, type: 'mention', user: 'Ahmed Hassan', avatar: '🧔', lang: 'ar', content: 'vous a mentionné dans un commentaire', time: 'Il y a 3h', unread: false },
  { id: 5, type: 'community', user: 'Tech Polyglots', avatar: '💻', lang: 'en', content: 'Nouveau post dans votre communauté', time: 'Hier', unread: false },
];

export default function V2NotificationsPage() {
  return (
    <div className="min-h-screen pb-20" style={{ background: theme.colors.warmCanvas }}>
      {/* Header */}
      <header className="sticky top-0 z-50 px-6 py-4 border-b" style={{ background: `${theme.colors.warmCanvas}ee`, backdropFilter: 'blur(20px)', borderColor: theme.colors.parchment }}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold" style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}>
            Notifications
          </h1>
          <Button variant="ghost" size="sm">
            Tout marquer comme lu
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto">
        {notifications.map((notif) => (
          <div
            key={notif.id}
            className={`p-4 border-b flex items-start gap-4 ${notif.unread ? 'bg-[#E76F51]/5' : ''}`}
            style={{ borderColor: theme.colors.parchment }}
          >
            <div className="relative">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
                style={{ background: theme.colors.parchment }}
              >
                {notif.avatar}
              </div>
              <LanguageOrb
                code={notif.lang}
                size="sm"
                pulse={false}
                className="absolute -bottom-1 -right-1 w-5 h-5 text-xs border-2 border-white"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p style={{ color: theme.colors.textPrimary }}>
                <span className="font-semibold">{notif.user}</span>{' '}
                <span style={{ color: theme.colors.textSecondary }}>{notif.content}</span>
              </p>
              <p className="text-sm mt-1" style={{ color: theme.colors.textMuted }}>{notif.time}</p>
            </div>
            {notif.unread && (
              <div className="w-3 h-3 rounded-full" style={{ background: theme.colors.terracotta }} />
            )}
          </div>
        ))}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 border-t py-2 px-6" style={{ background: 'white', borderColor: theme.colors.parchment }}>
        <div className="max-w-2xl mx-auto flex justify-around">
          <Link href="/v2/feeds"><Button variant="ghost" size="sm"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg></Button></Link>
          <Link href="/v2/chats"><Button variant="ghost" size="sm"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg></Button></Link>
          <Link href="/v2/communities"><Button variant="ghost" size="sm"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg></Button></Link>
          <Link href="/v2/u"><Button variant="ghost" size="sm"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></Button></Link>
        </div>
      </nav>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
