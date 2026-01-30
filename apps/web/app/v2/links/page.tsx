'use client';

import Link from 'next/link';
import { Button, Card, Badge, theme } from '@/components/v2';

const links = [
  { id: 1, name: 'Lien principal', url: 'meeshy.me/l/abc123', clicks: 248, created: '15 Jan 2024', active: true },
  { id: 2, name: 'Campagne LinkedIn', url: 'meeshy.me/l/linkedin2024', clicks: 89, created: '10 Jan 2024', active: true },
  { id: 3, name: 'Bio Instagram', url: 'meeshy.me/l/insta', clicks: 156, created: '5 Jan 2024', active: false },
];

export default function V2LinksPage() {
  return (
    <div className="min-h-screen pb-8" style={{ background: theme.colors.warmCanvas }}>
      {/* Header */}
      <header className="sticky top-0 z-50 px-6 py-4 border-b" style={{ background: `${theme.colors.warmCanvas}ee`, backdropFilter: 'blur(20px)', borderColor: theme.colors.parchment }}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/v2/u">
              <Button variant="ghost" size="sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Button>
            </Link>
            <h1 className="text-xl font-semibold" style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}>
              Liens de partage
            </h1>
          </div>
          <Button variant="primary" size="sm">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Créer
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card variant="gradient" hover={false} className="p-4 text-center">
            <p className="text-3xl font-bold" style={{ color: theme.colors.terracotta }}>493</p>
            <p className="text-sm" style={{ color: theme.colors.textSecondary }}>Clics totaux</p>
          </Card>
          <Card variant="gradient" hover={false} className="p-4 text-center">
            <p className="text-3xl font-bold" style={{ color: theme.colors.deepTeal }}>3</p>
            <p className="text-sm" style={{ color: theme.colors.textSecondary }}>Liens actifs</p>
          </Card>
        </div>

        {/* Links */}
        <section>
          <h2 className="text-sm font-semibold mb-4 px-1" style={{ color: theme.colors.textMuted }}>MES LIENS</h2>
          <div className="space-y-4">
            {links.map((link) => (
              <Card key={link.id} variant="outlined" hover className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold" style={{ color: theme.colors.charcoal }}>{link.name}</h3>
                      {link.active ? (
                        <Badge variant="success" size="sm">Actif</Badge>
                      ) : (
                        <Badge variant="default" size="sm">Inactif</Badge>
                      )}
                    </div>
                    <p className="text-sm font-mono" style={{ color: theme.colors.deepTeal }}>{link.url}</p>
                  </div>
                  <Button variant="ghost" size="sm">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </Button>
                </div>
                <div className="flex items-center gap-6 text-sm" style={{ color: theme.colors.textMuted }}>
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    {link.clicks} clics
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {link.created}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
