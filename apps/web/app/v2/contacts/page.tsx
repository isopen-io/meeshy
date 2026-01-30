'use client';

import Link from 'next/link';
import { Button, Card, Input, Badge, LanguageOrb, theme } from '@/components/v2';

const contacts = [
  { id: 1, name: 'Yuki Tanaka', username: '@yuki_t', lang: 'ja', online: true },
  { id: 2, name: 'Carlos García', username: '@carlos_g', lang: 'es', online: false },
  { id: 3, name: 'Emma Wilson', username: '@emma_w', lang: 'en', online: true },
  { id: 4, name: 'Ahmed Hassan', username: '@ahmed_h', lang: 'ar', online: false },
  { id: 5, name: 'Li Wei', username: '@li_wei', lang: 'zh', online: true },
  { id: 6, name: 'Sophie Martin', username: '@sophie_m', lang: 'fr', online: false },
];

export default function V2ContactsPage() {
  return (
    <div className="min-h-screen pb-8" style={{ background: theme.colors.warmCanvas }}>
      {/* Header */}
      <header className="sticky top-0 z-50 px-6 py-4 border-b" style={{ background: `${theme.colors.warmCanvas}ee`, backdropFilter: 'blur(20px)', borderColor: theme.colors.parchment }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/v2/u">
              <Button variant="ghost" size="sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Button>
            </Link>
            <h1 className="text-xl font-semibold" style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}>
              Contacts
            </h1>
          </div>
          <Input
            placeholder="Rechercher un contact..."
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-6">
        {/* Online */}
        <section className="mb-6">
          <h2 className="text-sm font-semibold mb-3 px-1" style={{ color: theme.colors.textMuted }}>
            EN LIGNE ({contacts.filter(c => c.online).length})
          </h2>
          <Card variant="outlined" hover={false} className="divide-y" style={{ borderColor: theme.colors.parchment }}>
            {contacts.filter(c => c.online).map((contact) => (
              <div key={contact.id} className="p-4 flex items-center gap-4">
                <div className="relative">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
                    style={{ background: theme.colors.parchment }}
                  >
                    {contact.name[0]}
                  </div>
                  <LanguageOrb
                    code={contact.lang}
                    size="sm"
                    pulse={false}
                    className="absolute -bottom-1 -right-1 w-5 h-5 text-xs border-2 border-white"
                  />
                  <div
                    className="absolute top-0 right-0 w-3 h-3 rounded-full border-2 border-white"
                    style={{ background: theme.colors.jadeGreen }}
                  />
                </div>
                <div className="flex-1">
                  <p className="font-medium" style={{ color: theme.colors.charcoal }}>{contact.name}</p>
                  <p className="text-sm" style={{ color: theme.colors.textMuted }}>{contact.username}</p>
                </div>
                <Link href="/v2/chats">
                  <Button variant="ghost" size="sm">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </Button>
                </Link>
              </div>
            ))}
          </Card>
        </section>

        {/* Offline */}
        <section>
          <h2 className="text-sm font-semibold mb-3 px-1" style={{ color: theme.colors.textMuted }}>
            HORS LIGNE ({contacts.filter(c => !c.online).length})
          </h2>
          <Card variant="outlined" hover={false} className="divide-y" style={{ borderColor: theme.colors.parchment }}>
            {contacts.filter(c => !c.online).map((contact) => (
              <div key={contact.id} className="p-4 flex items-center gap-4 opacity-70">
                <div className="relative">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
                    style={{ background: theme.colors.parchment }}
                  >
                    {contact.name[0]}
                  </div>
                  <LanguageOrb
                    code={contact.lang}
                    size="sm"
                    pulse={false}
                    className="absolute -bottom-1 -right-1 w-5 h-5 text-xs border-2 border-white"
                  />
                </div>
                <div className="flex-1">
                  <p className="font-medium" style={{ color: theme.colors.charcoal }}>{contact.name}</p>
                  <p className="text-sm" style={{ color: theme.colors.textMuted }}>{contact.username}</p>
                </div>
                <Link href="/v2/chats">
                  <Button variant="ghost" size="sm">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </Button>
                </Link>
              </div>
            ))}
          </Card>
        </section>
      </main>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
