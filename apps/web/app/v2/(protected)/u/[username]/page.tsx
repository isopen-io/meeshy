'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button, Card, Badge, LanguageOrb, theme, PageHeader } from '@/components/v2';
import { useProfileV2 } from '@/hooks/v2';

function ProfileSkeleton() {
  return (
    <div className="h-full overflow-auto pb-8 bg-[var(--gp-background)] transition-colors duration-300">
      <PageHeader title="Profil" />
      <div className="h-40 animate-pulse bg-[var(--gp-parchment)]" />
      <div className="max-w-2xl mx-auto px-6">
        <div className="relative -mt-16 mb-6">
          <div className="w-32 h-32 rounded-full border-4 border-[var(--gp-surface)] animate-pulse bg-[var(--gp-parchment)]" />
        </div>
        <div className="mb-6 space-y-3">
          <div className="h-8 w-48 rounded animate-pulse bg-[var(--gp-parchment)]" />
          <div className="h-4 w-32 rounded animate-pulse bg-[var(--gp-parchment)]" />
          <div className="h-4 w-full rounded animate-pulse bg-[var(--gp-parchment)]" />
        </div>
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} variant="default" hover={false} className="p-4 animate-pulse">
              <div className="h-8 w-16 mx-auto mb-2 rounded bg-[var(--gp-parchment)]" />
              <div className="h-3 w-20 mx-auto rounded bg-[var(--gp-parchment)]" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toString();
}

export default function UserProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params.username;

  const {
    profile,
    stats,
    isLoading,
    error,
  } = useProfileV2({ userId: username });

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  if (error) {
    return (
      <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors duration-300">
        <PageHeader title="Profil" />
        <div className="flex items-center justify-center py-16">
          <div className="text-center p-4">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-[var(--gp-parchment)]">
              <svg className="w-8 h-8 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <p className="text-[var(--gp-text-secondary)]">Utilisateur introuvable</p>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors duration-300">
        <PageHeader title="Profil" />
        <div className="flex items-center justify-center py-16">
          <p className="text-[var(--gp-text-secondary)]">Profil non trouve</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto pb-8 bg-[var(--gp-background)] transition-colors duration-300">
      <PageHeader title={profile.name || profile.username} />

      {/* Banner */}
      <div
        className="h-40"
        style={{
          background: profile.banner
            ? `url(${profile.banner})`
            : `linear-gradient(135deg, var(--gp-terracotta), var(--gp-deep-teal))`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* Profile Info */}
      <div className="max-w-2xl mx-auto px-6">
        <div className="relative -mt-16 mb-6">
          {profile.avatar ? (
            <img
              src={profile.avatar}
              alt={profile.name}
              className="w-32 h-32 rounded-full border-4 border-[var(--gp-surface)] object-cover"
            />
          ) : (
            <div className="w-32 h-32 rounded-full border-4 border-[var(--gp-surface)] flex items-center justify-center text-5xl font-bold bg-[var(--gp-parchment)] text-[var(--gp-terracotta)]">
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          {profile.isOnline && (
            <div className="absolute bottom-2 right-2 w-6 h-6 rounded-full border-4 border-[var(--gp-surface)] bg-[var(--gp-jade-green)]" />
          )}
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h1
              className="text-2xl font-bold text-[var(--gp-text-primary)]"
              style={{ fontFamily: theme.fonts.display }}
            >
              {profile.name}
            </h1>
            {profile.isPro && <Badge variant="teal">Pro</Badge>}
          </div>
          <p className="mb-2 text-[var(--gp-text-secondary)]">{profile.username}</p>
          {profile.bio && (
            <p className="text-[var(--gp-text-primary)]">{profile.bio}</p>
          )}
          {!profile.isOnline && profile.lastSeen && (
            <p className="text-sm mt-2 text-[var(--gp-text-muted)]">
              {profile.lastSeen}
            </p>
          )}
        </div>

        {/* Languages */}
        {profile.languages.length > 0 && (
          <Card variant="outlined" hover={false} className="p-4 mb-6">
            <h3 className="font-semibold mb-3 text-[var(--gp-text-primary)]">Langues</h3>
            <div className="flex flex-wrap gap-3">
              {profile.languages.map((lang) => (
                <div
                  key={lang.code}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--gp-parchment)]"
                >
                  <LanguageOrb code={lang.code} size="sm" pulse={false} className="w-6 h-6 text-sm" />
                  <span className="text-sm font-medium">{lang.name}</span>
                  <Badge
                    variant={
                      lang.level === 'native' ? 'terracotta' :
                      lang.level === 'fluent' ? 'teal' : 'gold'
                    }
                    size="sm"
                  >
                    {lang.level === 'native' ? 'Natif' :
                     lang.level === 'fluent' ? 'Courant' : 'Apprentissage'}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card variant="default" hover={false} className="p-4 text-center">
              <p className="text-2xl font-bold text-[var(--gp-terracotta)]">
                {formatNumber(stats.conversationsCount)}
              </p>
              <p className="text-sm text-[var(--gp-text-secondary)]">Conversations</p>
            </Card>
            <Card variant="default" hover={false} className="p-4 text-center">
              <p className="text-2xl font-bold text-[var(--gp-deep-teal)]">
                {formatNumber(stats.messagesCount)}
              </p>
              <p className="text-sm text-[var(--gp-text-secondary)]">Messages</p>
            </Card>
            <Card variant="default" hover={false} className="p-4 text-center">
              <p className="text-2xl font-bold text-[var(--gp-gold-accent)]">
                {formatNumber(stats.contactsCount)}
              </p>
              <p className="text-sm text-[var(--gp-text-secondary)]">Contacts</p>
            </Card>
          </div>
        )}

        {/* Message button */}
        <Link href={`/v2/chats?user=${profile.id}`} className="block">
          <Button variant="primary" className="w-full">
            Envoyer un message
          </Button>
        </Link>
      </div>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
