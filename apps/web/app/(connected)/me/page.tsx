'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { OnlineIndicator } from '@/components/ui/online-indicator';
// Modal building blocks reused from the v2 design system.
import {
  useToast,
  Dialog,
  DialogBody,
  DialogFooter,
  Input,
  Textarea,
  Label,
  LanguageOrb,
} from '@/components/v2';
import { useProfileV2 } from '@/hooks/v2';
import { useAuth } from '@/hooks/use-auth';
import { useI18n } from '@/hooks/use-i18n';
import {
  Pencil,
  Settings,
  Link2,
  Users,
  Bell,
  LogOut,
  ChevronRight,
  MessageSquare,
} from 'lucide-react';

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatNumber(num: number): string {
  return num >= 1000 ? (num / 1000).toFixed(1) + 'k' : num.toString();
}

function getInitials(name: string): string {
  const parts = name.replace(/^@/, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

// ─── Modals ────────────────────────────────────────────────────────────────

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
  const { t } = useI18n('settings');

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogBody>
        <h2 className="text-xl font-bold mb-6 text-[var(--gp-text-primary)]">{t('v2me.editProfile', 'Edit profile')}</h2>
        <div className="space-y-4">
          <div>
            <Label className="mb-2">{t('v2me.nameLabel', 'Name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('v2me.namePlaceholder', 'Your name')} />
          </div>
          <div>
            <Label className="mb-2">{t('v2me.bioLabel', 'Bio')}</Label>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder={t('v2me.bioPlaceholder', 'Tell us about yourself...')} rows={3} />
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" className="flex-1" onClick={onClose} disabled={isSaving}>
          {t('v2me.cancel', 'Cancel')}
        </Button>
        <Button
          className="flex-1"
          onClick={() => onSave({ displayName: name, bio })}
          disabled={isSaving || !name.trim()}
        >
          {isSaving ? t('v2me.saving', 'Saving...') : t('v2me.save', 'Save')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

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
  const { t } = useI18n('settings');

  return (
    <Dialog open={isOpen} onClose={onClose} className="max-w-sm">
      <DialogBody>
        <h2 className="text-xl font-bold mb-2 text-[var(--gp-text-primary)]">{t('v2me.logoutTitle', 'Log out?')}</h2>
        <p className="text-[var(--gp-text-secondary)]">
          {t('v2me.logoutConfirmMessage', 'Are you sure you want to log out of your account?')}
        </p>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" className="flex-1" onClick={onClose} disabled={isLoggingOut}>
          {t('v2me.cancel', 'Cancel')}
        </Button>
        <Button variant="destructive" className="flex-1" onClick={onConfirm} disabled={isLoggingOut}>
          {isLoggingOut ? t('v2me.loggingOut', 'Logging out...') : t('v2me.logout', 'Log out')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── Quick-link card ─────────────────────────────────────────────────────────

function QuickLink({ href, icon: Icon, label, tint }: { href: string; icon: React.ElementType; label: string; tint: string }) {
  return (
    <Link href={href} className="block">
      <Card className="border-2 hover:shadow-md transition-shadow">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tint}`}>
              <Icon className="w-5 h-5" />
            </div>
            <span className="font-medium text-foreground">{label}</span>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}

// ─── Shell (links dashboard-v1 chrome) ──────────────────────────────────────
// Module-scoped so it keeps a stable component identity across renders (an
// inline component would remount its subtree, dropping modal input focus).

function ProfileShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n('settings');
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-950 dark:to-gray-900 flex flex-col">
      <DashboardLayout title={t('v2me.myProfile', 'My profile')} hideSearch className="!bg-none !bg-transparent !h-auto !max-w-none !px-0">
        <div className="w-full max-w-3xl mx-auto px-4 md:px-8 py-8 space-y-8">{children}</div>
      </DashboardLayout>
      <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] mt-16">
        <Footer />
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { addToast } = useToast();
  const { profile, stats, isLoading, error, isCurrentUser, updateProfile, isUpdating } = useProfileV2();
  const { t } = useI18n('settings');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      addToast(t('v2me.logoutSuccess'), 'success');
      router.push('/login');
    } catch {
      addToast(t('v2me.logoutError'), 'error');
      setIsLoggingOut(false);
    }
  };

  const handleSaveProfile = async (data: { displayName: string; bio: string }) => {
    try {
      await updateProfile(data);
      addToast(t('v2me.profileUpdated'), 'success');
      setIsEditModalOpen(false);
    } catch {
      addToast(t('v2me.profileUpdateError'), 'error');
    }
  };

  if (isLoading) {
    return (
      <ProfileShell>
        <div className="h-56 rounded-3xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      </ProfileShell>
    );
  }

  if (error || !profile) {
    return (
      <ProfileShell>
        <Card className="border-2">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-rose-600 dark:text-rose-400 mb-4">{error || t('v2me.profileNotFound', 'Profile not found')}</p>
            <Button variant="outline" onClick={() => router.push('/conversations')}>
              {t('v2me.backToConversations', 'Back to conversations')}
            </Button>
          </CardContent>
        </Card>
      </ProfileShell>
    );
  }

  return (
    <ProfileShell>
      {/* Hero banner with avatar */}
      <header className="relative overflow-hidden rounded-3xl shadow-2xl bg-white dark:bg-gray-950">
        <div
          className="h-40 md:h-52"
          style={{
            background: profile.banner
              ? `url(${profile.banner}) center/cover`
              : 'linear-gradient(135deg, #2563eb, #7c3aed)',
          }}
        />
        <div className="px-6 pb-6">
          <div className="relative -mt-14 mb-4 flex items-end justify-between">
            <div className="relative">
              <Avatar className="h-28 w-28 border-4 border-white dark:border-gray-950 shadow-lg">
                {profile.avatar ? <AvatarImage src={profile.avatar} alt="" /> : null}
                <AvatarFallback className="text-2xl bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                  {getInitials(profile.name)}
                </AvatarFallback>
              </Avatar>
              <span className="absolute bottom-2 right-2">
                <OnlineIndicator isOnline={profile.isOnline} size="lg" />
              </span>
            </div>
            {isCurrentUser && (
              <Button variant="outline" size="sm" onClick={() => setIsEditModalOpen(true)}>
                <Pencil className="w-4 h-4 mr-2" />
                {t('v2me.editProfile')}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">{profile.name}</h1>
            {profile.isPro && <Badge>Pro</Badge>}
          </div>
          <p className="text-muted-foreground">{profile.username}</p>
          {profile.bio && <p className="mt-2 text-foreground">{profile.bio}</p>}
          {!profile.isOnline && profile.lastSeen && (
            <p className="text-sm mt-2 text-muted-foreground">{profile.lastSeen}</p>
          )}
        </div>
      </header>

      {/* Stats */}
      {stats && (
        <section aria-label={t('v2me.statsLabel', 'Statistics')} className="grid grid-cols-3 gap-4">
          <Card className="border-2">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatNumber(stats.conversationsCount)}</p>
              <p className="text-sm text-muted-foreground">{t('v2me.conversations', 'Conversations')}</p>
            </CardContent>
          </Card>
          <Card className="border-2">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatNumber(stats.messagesCount)}</p>
              <p className="text-sm text-muted-foreground">{t('v2me.messages', 'Messages')}</p>
            </CardContent>
          </Card>
          <Card className="border-2">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{formatNumber(stats.contactsCount)}</p>
              <p className="text-sm text-muted-foreground">{t('v2me.contacts', 'Contacts')}</p>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Languages */}
      {profile.languages.length > 0 && (
        <section aria-label={isCurrentUser ? t('v2me.myLanguages', 'My languages') : t('v2me.languages', 'Languages')}>
          <Card className="border-2">
            <CardContent className="p-4">
              <h2 className="font-semibold mb-3 text-foreground">{isCurrentUser ? t('v2me.myLanguages', 'My languages') : t('v2me.languages', 'Languages')}</h2>
              <div className="flex flex-wrap gap-3">
                {profile.languages.map((lang) => (
                  <div key={lang.code} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-900">
                    <LanguageOrb code={lang.code} size="sm" pulse={false} className="w-6 h-6 text-sm" />
                    <span className="text-sm font-medium text-foreground">{lang.name}</span>
                    <Badge variant={lang.level === 'native' ? 'default' : 'secondary'}>
                      {lang.level === 'native' ? t('v2me.levelNative', 'Native') : lang.level === 'fluent' ? t('v2me.levelFluent', 'Fluent') : t('v2me.levelLearning', 'Learning')}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Owner actions */}
      {isCurrentUser ? (
        <section aria-label={t('v2me.shortcuts', 'Shortcuts')} className="space-y-3">
          <QuickLink href="/links" icon={Link2} label={t('v2me.myShareLinks', 'My share links')} tint="bg-blue-500/15 text-blue-600 dark:text-blue-400" />
          <QuickLink href="/contacts" icon={Users} label={t('v2me.myContacts', 'My contacts')} tint="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" />
          <QuickLink href="/notifications" icon={Bell} label={t('v2me.notifications', 'Notifications')} tint="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" />
          <QuickLink href="/settings" icon={Settings} label={t('title', 'Settings')} tint="bg-gray-500/15 text-gray-600 dark:text-gray-400" />
          <Button
            variant="outline"
            className="w-full text-rose-600 border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            onClick={() => setIsLogoutModalOpen(true)}
          >
            <LogOut className="w-4 h-4 mr-2" />
            {t('v2me.logout', 'Log out')}
          </Button>
        </section>
      ) : (
        <Link href={`/conversations?user=${profile.id}`} className="block">
          <Button className="w-full">
            <MessageSquare className="w-4 h-4 mr-2" />
            {t('v2me.sendMessage', 'Send a message')}
          </Button>
        </Link>
      )}

      {/* Modals */}
      <EditProfileModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        profile={profile}
        onSave={handleSaveProfile}
        isSaving={isUpdating}
      />
      <LogoutConfirmModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={handleLogout}
        isLoggingOut={isLoggingOut}
      />
    </ProfileShell>
  );
}
