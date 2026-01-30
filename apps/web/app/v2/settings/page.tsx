'use client';

import Link from 'next/link';
import { Button, Card, Badge, LanguageOrb, theme } from '@/components/v2';

export default function V2SettingsPage() {
  return (
    <div className="min-h-screen pb-8" style={{ background: theme.colors.warmCanvas }}>
      {/* Header */}
      <header className="sticky top-0 z-50 px-6 py-4 border-b" style={{ background: `${theme.colors.warmCanvas}ee`, backdropFilter: 'blur(20px)', borderColor: theme.colors.parchment }}>
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Link href="/v2/u">
            <Button variant="ghost" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
          </Link>
          <h1 className="text-xl font-semibold" style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}>
            Paramètres
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Account */}
        <section>
          <h2 className="text-sm font-semibold mb-3 px-1" style={{ color: theme.colors.textMuted }}>COMPTE</h2>
          <Card variant="outlined" hover={false} className="divide-y" style={{ borderColor: theme.colors.parchment }}>
            <button className="w-full p-4 flex items-center justify-between text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${theme.colors.terracotta}15` }}>
                  <svg className="w-5 h-5" style={{ color: theme.colors.terracotta }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium" style={{ color: theme.colors.charcoal }}>Profil</p>
                  <p className="text-sm" style={{ color: theme.colors.textSecondary }}>Photo, nom, bio</p>
                </div>
              </div>
              <svg className="w-5 h-5" style={{ color: theme.colors.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <button className="w-full p-4 flex items-center justify-between text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${theme.colors.deepTeal}15` }}>
                  <svg className="w-5 h-5" style={{ color: theme.colors.deepTeal }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium" style={{ color: theme.colors.charcoal }}>Email</p>
                  <p className="text-sm" style={{ color: theme.colors.textSecondary }}>jean@exemple.com</p>
                </div>
              </div>
              <svg className="w-5 h-5" style={{ color: theme.colors.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <button className="w-full p-4 flex items-center justify-between text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${theme.colors.royalIndigo}15` }}>
                  <svg className="w-5 h-5" style={{ color: theme.colors.royalIndigo }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium" style={{ color: theme.colors.charcoal }}>Mot de passe</p>
                  <p className="text-sm" style={{ color: theme.colors.textSecondary }}>Changer le mot de passe</p>
                </div>
              </div>
              <svg className="w-5 h-5" style={{ color: theme.colors.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </Card>
        </section>

        {/* Language */}
        <section>
          <h2 className="text-sm font-semibold mb-3 px-1" style={{ color: theme.colors.textMuted }}>LANGUE</h2>
          <Card variant="outlined" hover={false} className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-medium" style={{ color: theme.colors.charcoal }}>Langue de traduction</p>
                <p className="text-sm" style={{ color: theme.colors.textSecondary }}>Messages traduits dans cette langue</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: theme.colors.parchment }}>
                <LanguageOrb code="fr" size="sm" pulse={false} className="w-6 h-6 text-sm" />
                <span className="text-sm font-medium">Français</span>
              </div>
            </div>
            <Button variant="outline" size="sm">Changer la langue</Button>
          </Card>
        </section>

        {/* Notifications */}
        <section>
          <h2 className="text-sm font-semibold mb-3 px-1" style={{ color: theme.colors.textMuted }}>NOTIFICATIONS</h2>
          <Card variant="outlined" hover={false} className="divide-y" style={{ borderColor: theme.colors.parchment }}>
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium" style={{ color: theme.colors.charcoal }}>Messages</p>
                <p className="text-sm" style={{ color: theme.colors.textSecondary }}>Nouveaux messages</p>
              </div>
              <input type="checkbox" defaultChecked className="w-5 h-5 rounded" style={{ accentColor: theme.colors.terracotta }} />
            </div>
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium" style={{ color: theme.colors.charcoal }}>Mentions</p>
                <p className="text-sm" style={{ color: theme.colors.textSecondary }}>Quand quelqu'un vous mentionne</p>
              </div>
              <input type="checkbox" defaultChecked className="w-5 h-5 rounded" style={{ accentColor: theme.colors.terracotta }} />
            </div>
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium" style={{ color: theme.colors.charcoal }}>Communautés</p>
                <p className="text-sm" style={{ color: theme.colors.textSecondary }}>Activité des communautés</p>
              </div>
              <input type="checkbox" className="w-5 h-5 rounded" style={{ accentColor: theme.colors.terracotta }} />
            </div>
          </Card>
        </section>

        {/* Appearance */}
        <section>
          <h2 className="text-sm font-semibold mb-3 px-1" style={{ color: theme.colors.textMuted }}>APPARENCE</h2>
          <Card variant="outlined" hover={false} className="p-4">
            <p className="font-medium mb-3" style={{ color: theme.colors.charcoal }}>Thème</p>
            <div className="flex gap-3">
              <button className="flex-1 p-3 rounded-xl border-2 text-center" style={{ borderColor: theme.colors.terracotta, background: `${theme.colors.terracotta}10` }}>
                <span className="text-2xl mb-1 block">☀️</span>
                <span className="text-sm font-medium">Clair</span>
              </button>
              <button className="flex-1 p-3 rounded-xl border-2 text-center" style={{ borderColor: 'transparent', background: theme.colors.parchment }}>
                <span className="text-2xl mb-1 block">🌙</span>
                <span className="text-sm font-medium">Sombre</span>
              </button>
              <button className="flex-1 p-3 rounded-xl border-2 text-center" style={{ borderColor: 'transparent', background: theme.colors.parchment }}>
                <span className="text-2xl mb-1 block">💻</span>
                <span className="text-sm font-medium">Système</span>
              </button>
            </div>
          </Card>
        </section>

        {/* Legal */}
        <section>
          <h2 className="text-sm font-semibold mb-3 px-1" style={{ color: theme.colors.textMuted }}>LÉGAL</h2>
          <Card variant="outlined" hover={false} className="divide-y" style={{ borderColor: theme.colors.parchment }}>
            <Link href="/v2/terms" className="block p-4 flex items-center justify-between">
              <span className="font-medium" style={{ color: theme.colors.charcoal }}>Conditions d'utilisation</span>
              <svg className="w-5 h-5" style={{ color: theme.colors.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link href="/v2/terms" className="block p-4 flex items-center justify-between">
              <span className="font-medium" style={{ color: theme.colors.charcoal }}>Politique de confidentialité</span>
              <svg className="w-5 h-5" style={{ color: theme.colors.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </Card>
        </section>

        {/* Danger Zone */}
        <section>
          <Button variant="ghost" className="w-full" style={{ color: theme.colors.asianRuby }}>
            Supprimer mon compte
          </Button>
        </section>
      </main>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
