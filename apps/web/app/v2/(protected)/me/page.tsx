'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Badge, LanguageOrb, theme, Input, useToast, PageHeader } from '@/components/v2';
import { useProfileV2 } from '@/hooks/v2';
import { useAuth } from '@/hooks/use-auth';

function ProfileSkeleton() {
  return (
    <div className="h-full overflow-auto pb-8 bg-[var(--gp-background)] transition-colors duration-300">
      {/* Header Banner */}
      <div className="h-40 relative animate-pulse bg-[var(--gp-parchment)]" />

      {/* Profile Info skeleton */}
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

// Edit Profile Modal Component
function EditProfileModal({
  isOpen,
  onClose,
  profile,
  onSave,
  isSaving,
}: {
  isOpen: boolean;
  onClose: () => void;
  profile: { name: string; bio?: string };
  onSave: (data: { displayName: string; bio: string }) => Promise<void>;
  isSaving: boolean;
}) {
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio || '');

  const handleSave = async () => {
    await onSave({ displayName: name, bio });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md mx-4 p-6 rounded-2xl shadow-xl"
        style={{ background: 'var(--gp-surface)' }}
      >
        <h2
          className="text-xl font-bold mb-6 text-[var(--gp-text-primary)]"
          style={{ fontFamily: theme.fonts.display }}
        >
          Modifier le profil
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-[var(--gp-text-secondary)]">
              Nom
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Votre nom"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-[var(--gp-text-secondary)]">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Parlez-nous de vous..."
              rows={3}
              className="w-full rounded-xl border bg-[var(--gp-surface)] px-4 py-3 text-base text-[var(--gp-text-primary)] transition-colors duration-300 placeholder:text-[var(--gp-text-muted)] focus:outline-none focus:ring-2 focus:ring-offset-0 border-[var(--gp-border)] focus:border-[var(--gp-deep-teal)] focus:ring-[var(--gp-deep-teal)]/20 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={isSaving}
          >
            Annuler
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
          >
            {isSaving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Logout Confirmation Modal Component
function LogoutConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  isLoggingOut,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoggingOut: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-sm mx-4 p-6 rounded-2xl shadow-xl"
        style={{ background: 'var(--gp-surface)' }}
      >
        <h2
          className="text-xl font-bold mb-2 text-[var(--gp-text-primary)]"
          style={{ fontFamily: theme.fonts.display }}
        >
          Se deconnecter ?
        </h2>
        <p className="mb-6 text-[var(--gp-text-secondary)]">
          Etes-vous sur de vouloir vous deconnecter de votre compte ?
        </p>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={isLoggingOut}
          >
            Annuler
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            style={{ background: theme.colors.asianRuby }}
            onClick={onConfirm}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? 'Deconnexion...' : 'Se deconnecter'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function V2ProfilePage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { addToast } = useToast();
  const {
    profile,
    stats,
    isLoading,
    error,
    isCurrentUser,
    updateProfile,
    isUpdating,
  } = useProfileV2();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      addToast('Deconnexion reussie', 'success');
      router.push('/v2/login');
    } catch (err) {
      addToast('Erreur lors de la deconnexion', 'error');
      setIsLoggingOut(false);
    }
  };

  const handleSaveProfile = async (data: { displayName: string; bio: string }) => {
    try {
      await updateProfile(data);
      addToast('Profil mis a jour avec succes', 'success');
      setIsEditModalOpen(false);
    } catch (err) {
      addToast('Erreur lors de la mise a jour du profil', 'error');
    }
  };

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--gp-background)]">
        <div className="text-center p-4">
          <p style={{ color: 'var(--gp-error)' }}>{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/v2/login')}>
            Retour a la connexion
          </Button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--gp-background)]">
        <div className="text-center p-4">
          <p className="text-[var(--gp-text-secondary)]">Profil non trouve</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/v2/chats')}>
            Retour aux conversations
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto pb-8 bg-[var(--gp-background)] transition-colors duration-300">
      <PageHeader
        title="Mon profil"
        hideProfileButton
        actionButtons={
          isCurrentUser ? (
            <Link href="/v2/settings">
              <Button variant="ghost" size="sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Button>
            </Link>
          ) : undefined
        }
      />

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
          {isCurrentUser && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setIsEditModalOpen(true)}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Modifier le profil
            </Button>
          )}
        </div>

        {/* Languages */}
        {profile.languages.length > 0 && (
          <Card variant="outlined" hover={false} className="p-4 mb-6">
            <h3 className="font-semibold mb-3 text-[var(--gp-text-primary)]">
              {isCurrentUser ? 'Mes langues' : 'Langues'}
            </h3>
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

        {/* Actions */}
        {isCurrentUser && (
          <div className="space-y-3">
            <Link href="/v2/links" className="block">
              <Card variant="outlined" hover className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--gp-terracotta) 15%, transparent)' }}>
                    <svg className="w-5 h-5 text-[var(--gp-terracotta)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <span className="font-medium text-[var(--gp-text-primary)]">Mes liens de partage</span>
                </div>
                <svg className="w-5 h-5 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Card>
            </Link>

            <Link href="/v2/contacts" className="block">
              <Card variant="outlined" hover className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--gp-deep-teal) 15%, transparent)' }}>
                    <svg className="w-5 h-5 text-[var(--gp-deep-teal)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <span className="font-medium text-[var(--gp-text-primary)]">Mes contacts</span>
                </div>
                <svg className="w-5 h-5 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Card>
            </Link>

            <Link href="/v2/notifications" className="block">
              <Card variant="outlined" hover className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--gp-royal-indigo) 15%, transparent)' }}>
                    <svg className="w-5 h-5 text-[var(--gp-royal-indigo)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  </div>
                  <span className="font-medium text-[var(--gp-text-primary)]">Notifications</span>
                </div>
                <svg className="w-5 h-5 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Card>
            </Link>

            <Button
              variant="outline"
              className="w-full text-[var(--gp-asian-ruby)] border-[var(--gp-asian-ruby)]"
              onClick={() => setIsLogoutModalOpen(true)}
            >
              Se deconnecter
            </Button>
          </div>
        )}

        {/* Message button for other users */}
        {!isCurrentUser && (
          <Link href={`/v2/chats?user=${profile.id}`} className="block">
            <Button variant="primary" className="w-full">
              Envoyer un message
            </Button>
          </Link>
        )}
      </div>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Edit Profile Modal */}
      {profile && (
        <EditProfileModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          profile={profile}
          onSave={handleSaveProfile}
          isSaving={isUpdating}
        />
      )}

      {/* Logout Confirmation Modal */}
      <LogoutConfirmModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={handleLogout}
        isLoggingOut={isLoggingOut}
      />
    </div>
  );
}
