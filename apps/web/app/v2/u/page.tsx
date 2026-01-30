'use client';

import Link from 'next/link';
import { Button, Card, Badge, LanguageOrb, theme } from '@/components/v2';

export default function V2ProfilePage() {
  return (
    <div className="min-h-screen pb-20" style={{ background: theme.colors.warmCanvas }}>
      {/* Header Banner */}
      <div
        className="h-40 relative"
        style={{ background: `linear-gradient(135deg, ${theme.colors.terracotta}, ${theme.colors.deepTeal})` }}
      >
        <Link
          href="/v2/settings"
          className="absolute top-4 right-4 p-2 rounded-full bg-white/20 backdrop-blur-sm"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>
      </div>

      {/* Profile Info */}
      <div className="max-w-2xl mx-auto px-6">
        <div className="relative -mt-16 mb-6">
          <div
            className="w-32 h-32 rounded-full border-4 border-white flex items-center justify-center text-5xl"
            style={{ background: theme.colors.parchment }}
          >
            👤
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
            >
              Jean Dupont
            </h1>
            <Badge variant="teal">Pro</Badge>
          </div>
          <p className="mb-2" style={{ color: theme.colors.textSecondary }}>@jeandupont</p>
          <p style={{ color: theme.colors.textPrimary }}>
            Passionné de langues et de voyages. J'adore découvrir de nouvelles cultures ! 🌍
          </p>
        </div>

        {/* Languages */}
        <Card variant="outlined" hover={false} className="p-4 mb-6">
          <h3 className="font-semibold mb-3" style={{ color: theme.colors.charcoal }}>Mes langues</h3>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: theme.colors.parchment }}>
              <LanguageOrb code="fr" size="sm" pulse={false} className="w-6 h-6 text-sm" />
              <span className="text-sm font-medium">Français</span>
              <Badge variant="terracotta" size="sm">Natif</Badge>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: theme.colors.parchment }}>
              <LanguageOrb code="en" size="sm" pulse={false} className="w-6 h-6 text-sm" />
              <span className="text-sm font-medium">English</span>
              <Badge variant="teal" size="sm">Fluent</Badge>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: theme.colors.parchment }}>
              <LanguageOrb code="es" size="sm" pulse={false} className="w-6 h-6 text-sm" />
              <span className="text-sm font-medium">Español</span>
              <Badge variant="gold" size="sm">Learning</Badge>
            </div>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card variant="default" hover={false} className="p-4 text-center">
            <p className="text-2xl font-bold" style={{ color: theme.colors.terracotta }}>248</p>
            <p className="text-sm" style={{ color: theme.colors.textSecondary }}>Conversations</p>
          </Card>
          <Card variant="default" hover={false} className="p-4 text-center">
            <p className="text-2xl font-bold" style={{ color: theme.colors.deepTeal }}>1.2k</p>
            <p className="text-sm" style={{ color: theme.colors.textSecondary }}>Messages</p>
          </Card>
          <Card variant="default" hover={false} className="p-4 text-center">
            <p className="text-2xl font-bold" style={{ color: theme.colors.goldAccent }}>42</p>
            <p className="text-sm" style={{ color: theme.colors.textSecondary }}>Contacts</p>
          </Card>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Link href="/v2/links" className="block">
            <Card variant="outlined" hover className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${theme.colors.terracotta}15` }}>
                  <svg className="w-5 h-5" style={{ color: theme.colors.terracotta }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <span className="font-medium" style={{ color: theme.colors.charcoal }}>Mes liens de partage</span>
              </div>
              <svg className="w-5 h-5" style={{ color: theme.colors.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Card>
          </Link>

          <Link href="/v2/contacts" className="block">
            <Card variant="outlined" hover className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${theme.colors.deepTeal}15` }}>
                  <svg className="w-5 h-5" style={{ color: theme.colors.deepTeal }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <span className="font-medium" style={{ color: theme.colors.charcoal }}>Mes contacts</span>
              </div>
              <svg className="w-5 h-5" style={{ color: theme.colors.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Card>
          </Link>

          <Button variant="outline" className="w-full" style={{ color: theme.colors.asianRuby, borderColor: theme.colors.asianRuby }}>
            Se déconnecter
          </Button>
        </div>
      </div>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 border-t py-2 px-6" style={{ background: 'white', borderColor: theme.colors.parchment }}>
        <div className="max-w-2xl mx-auto flex justify-around">
          <Link href="/v2/feeds"><Button variant="ghost" size="sm"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg></Button></Link>
          <Link href="/v2/chats"><Button variant="ghost" size="sm"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg></Button></Link>
          <Link href="/v2/communities"><Button variant="ghost" size="sm"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg></Button></Link>
          <Link href="/v2/u"><Button variant="ghost" size="sm" style={{ color: theme.colors.terracotta }}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></Button></Link>
        </div>
      </nav>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
