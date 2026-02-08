'use client';

import Link from 'next/link';
import { Button, Card, Input, LanguageOrb, PageHeader } from '@/components';
import { useContactsV2 } from '@/hooks';

function ContactSkeleton() {
  return (
    <div className="p-4 flex items-center gap-4 animate-pulse">
      <div className="w-12 h-12 rounded-full bg-[var(--gp-parchment)]" />
      <div className="flex-1">
        <div className="h-4 rounded w-32 mb-2 bg-[var(--gp-parchment)]" />
        <div className="h-3 rounded w-24 bg-[var(--gp-parchment)]" />
      </div>
    </div>
  );
}

export default function V2ContactsPage() {
  const {
    contacts,
    onlineContacts,
    offlineContacts,
    searchQuery,
    setSearchQuery,
    isLoading,
    error,
    refreshContacts,
  } = useContactsV2();

  return (
    <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors duration-300">
      <PageHeader
        title="Mes contacts"
        actionButtons={
          <Button variant="ghost" size="sm" onClick={refreshContacts}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </Button>
        }
      >
        <div className="mt-4">
          <Input
            placeholder="Rechercher un contact..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
        </div>
      </PageHeader>

      <main className="max-w-2xl mx-auto px-6 py-6">
        {/* Error state */}
        {error && (
          <div className="p-4 mb-4 rounded-xl" style={{ background: 'color-mix(in srgb, var(--gp-error) 15%, transparent)' }}>
            <p style={{ color: 'var(--gp-error)' }}>{error}</p>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <Card variant="outlined" hover={false} className="divide-y divide-[var(--gp-border)]">
            <ContactSkeleton />
            <ContactSkeleton />
            <ContactSkeleton />
            <ContactSkeleton />
          </Card>
        )}

        {/* Empty state */}
        {!isLoading && contacts.length === 0 && !searchQuery && (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-[var(--gp-parchment)]">
              <svg className="w-8 h-8 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold mb-2 text-[var(--gp-text-primary)]">
              Aucun contact
            </h2>
            <p className="text-[var(--gp-text-secondary)]">
              Commencez a discuter pour ajouter des contacts
            </p>
          </div>
        )}

        {/* No search results */}
        {!isLoading && contacts.length === 0 && searchQuery && (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-[var(--gp-parchment)]">
              <svg className="w-8 h-8 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold mb-2 text-[var(--gp-text-primary)]">
              Aucun resultat
            </h2>
            <p className="text-[var(--gp-text-secondary)]">
              Aucun contact ne correspond a "{searchQuery}"
            </p>
          </div>
        )}

        {/* Online contacts */}
        {!isLoading && onlineContacts.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold mb-3 px-1 text-[var(--gp-text-muted)]">
              EN LIGNE ({onlineContacts.length})
            </h2>
            <Card variant="outlined" hover={false} className="divide-y divide-[var(--gp-border)]">
              {onlineContacts.map((contact) => (
                <div key={contact.id} className="p-4 flex items-center gap-4">
                  <div className="relative">
                    {contact.avatar ? (
                      <img
                        src={contact.avatar}
                        alt={contact.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-semibold bg-[var(--gp-parchment)] text-[var(--gp-terracotta)]">
                        {contact.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <LanguageOrb
                      code={contact.languageCode}
                      size="sm"
                      pulse={false}
                      className="absolute -bottom-1 -right-1 w-5 h-5 text-xs border-2 border-[var(--gp-surface)]"
                    />
                    <div className="absolute top-0 right-0 w-3 h-3 rounded-full border-2 border-[var(--gp-surface)] bg-[var(--gp-jade-green)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-[var(--gp-text-primary)]">{contact.name}</p>
                    <p className="text-sm truncate text-[var(--gp-text-muted)]">{contact.username}</p>
                  </div>
                  <Link href={`/v2/chats?user=${contact.id}`}>
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
        )}

        {/* Offline contacts */}
        {!isLoading && offlineContacts.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-3 px-1 text-[var(--gp-text-muted)]">
              HORS LIGNE ({offlineContacts.length})
            </h2>
            <Card variant="outlined" hover={false} className="divide-y divide-[var(--gp-border)]">
              {offlineContacts.map((contact) => (
                <div key={contact.id} className="p-4 flex items-center gap-4 opacity-70">
                  <div className="relative">
                    {contact.avatar ? (
                      <img
                        src={contact.avatar}
                        alt={contact.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-semibold bg-[var(--gp-parchment)] text-[var(--gp-terracotta)]">
                        {contact.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <LanguageOrb
                      code={contact.languageCode}
                      size="sm"
                      pulse={false}
                      className="absolute -bottom-1 -right-1 w-5 h-5 text-xs border-2 border-[var(--gp-surface)]"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-[var(--gp-text-primary)]">{contact.name}</p>
                    <p className="text-sm truncate text-[var(--gp-text-muted)]">{contact.username}</p>
                    {contact.lastSeen && (
                      <p className="text-xs text-[var(--gp-text-muted)]">{contact.lastSeen}</p>
                    )}
                  </div>
                  <Link href={`/v2/chats?user=${contact.id}`}>
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
        )}
      </main>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
