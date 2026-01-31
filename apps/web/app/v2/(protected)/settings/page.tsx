'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Card, LanguageOrb, MessageBubble, theme, useToast, useSplitView } from '@/components/v2';
import { useSettingsV2 } from '@/hooks/v2';

// ============================================================================
// Sample conversations for preview
// ============================================================================

interface PreviewMessage {
  id: string;
  content: string;
  languageCode: string;
  languageName: string;
  sender?: string;
  isSent: boolean;
  translations: Array<{ languageCode: string; languageName: string; content: string }>;
  timestamp: string;
}

const PREVIEW_MESSAGES: PreviewMessage[] = [
  {
    id: '1',
    content: 'Bonjour ! Comment allez-vous aujourd\'hui ?',
    languageCode: 'fr',
    languageName: 'Francais',
    sender: 'Marie',
    isSent: false,
    translations: [
      { languageCode: 'en', languageName: 'English', content: 'Hello! How are you today?' },
      { languageCode: 'es', languageName: 'Espanol', content: 'Hola! Como estas hoy?' },
      { languageCode: 'de', languageName: 'Deutsch', content: 'Hallo! Wie geht es dir heute?' },
      { languageCode: 'ja', languageName: '日本語', content: 'こんにちは！今日はお元気ですか？' },
    ],
    timestamp: '10:30',
  },
  {
    id: '2',
    content: 'Je vais tres bien, merci ! Je travaille sur un projet passionnant.',
    languageCode: 'fr',
    languageName: 'Francais',
    isSent: true,
    translations: [
      { languageCode: 'en', languageName: 'English', content: 'I\'m doing great, thanks! I\'m working on an exciting project.' },
      { languageCode: 'es', languageName: 'Espanol', content: 'Estoy muy bien, gracias! Estoy trabajando en un proyecto emocionante.' },
      { languageCode: 'de', languageName: 'Deutsch', content: 'Mir geht es sehr gut, danke! Ich arbeite an einem spannenden Projekt.' },
      { languageCode: 'ja', languageName: '日本語', content: '元気です、ありがとう！ワクワクするプロジェクトに取り組んでいます。' },
    ],
    timestamp: '10:32',
  },
  {
    id: '3',
    content: 'That sounds amazing! Can you tell me more about it?',
    languageCode: 'en',
    languageName: 'English',
    sender: 'John',
    isSent: false,
    translations: [
      { languageCode: 'fr', languageName: 'Francais', content: 'Ca a l\'air incroyable ! Peux-tu m\'en dire plus ?' },
      { languageCode: 'es', languageName: 'Espanol', content: 'Eso suena increible! Puedes contarme mas?' },
      { languageCode: 'de', languageName: 'Deutsch', content: 'Das klingt toll! Kannst du mir mehr daruber erzahlen?' },
      { languageCode: 'ja', languageName: '日本語', content: 'それは素晴らしいですね！もっと教えてくれますか？' },
    ],
    timestamp: '10:35',
  },
];

function SettingsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-40 rounded-2xl bg-[var(--gp-parchment)]" />
      <div className="h-32 rounded-2xl bg-[var(--gp-parchment)]" />
      <div className="h-48 rounded-2xl bg-[var(--gp-parchment)]" />
    </div>
  );
}

// ============================================================================
// Conversation Preview Component
// ============================================================================

interface ConversationPreviewProps {
  translationLanguageCode?: string;
}

function ConversationPreview({ translationLanguageCode }: ConversationPreviewProps) {
  const [showTranslations, setShowTranslations] = useState(true);

  // Filter translations to show only the user's translation language
  const getFilteredTranslations = (message: PreviewMessage) => {
    if (!translationLanguageCode || translationLanguageCode === message.languageCode) {
      return [];
    }
    return message.translations.filter((t) => t.languageCode === translationLanguageCode);
  };

  return (
    <div className="space-y-3">
      {/* Preview header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--gp-text-secondary)]">
          Apercu avec vos parametres
        </p>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={showTranslations}
            onChange={(e) => setShowTranslations(e.target.checked)}
            className="w-4 h-4 rounded accent-[var(--gp-terracotta)]"
          />
          <span className="text-[var(--gp-text-muted)]">Afficher traductions</span>
        </label>
      </div>

      {/* Preview container */}
      <div className="rounded-xl p-4 space-y-3 border transition-colors bg-[var(--gp-background)] border-[var(--gp-border)]">
        {PREVIEW_MESSAGES.map((message) => {
          const filteredTranslations = showTranslations ? getFilteredTranslations(message) : [];

          return (
            <MessageBubble
              key={message.id}
              isSent={message.isSent}
              languageCode={message.languageCode}
              languageName={message.languageName}
              content={message.content}
              translations={filteredTranslations}
              sender={message.sender}
              timestamp={message.timestamp}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-[var(--gp-text-muted)]">
        <div className="flex items-center gap-1">
          <LanguageOrb code="fr" size="sm" pulse={false} className="w-4 h-4 text-[8px]" />
          <span>Francais</span>
        </div>
        <div className="flex items-center gap-1">
          <LanguageOrb code="en" size="sm" pulse={false} className="w-4 h-4 text-[8px]" />
          <span>English</span>
        </div>
        {translationLanguageCode && !['fr', 'en'].includes(translationLanguageCode) && (
          <div className="flex items-center gap-1">
            <LanguageOrb code={translationLanguageCode} size="sm" pulse={false} className="w-4 h-4 text-[8px]" />
            <span>Votre langue</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function V2SettingsPage() {
  const {
    translationLanguage,
    systemLanguage,
    availableLanguages,
    updateTranslationLanguage,
    updateSystemLanguage,
    notificationSettings,
    updateNotificationSetting,
    isUpdatingNotifications,
    theme: themeSettings,
    setTheme,
    accountSettings,
    updatePassword,
    deleteAccount,
    isLoading,
    isUpdating,
    error,
  } = useSettingsV2();

  const { addToast } = useToast();

  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [languageType, setLanguageType] = useState<'translation' | 'system'>('translation');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    new: '',
    confirm: '',
  });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const handleLanguageSelect = async (code: string) => {
    try {
      if (languageType === 'translation') {
        await updateTranslationLanguage(code);
        addToast('Langue de traduction mise a jour', 'success');
      } else {
        await updateSystemLanguage(code);
        addToast('Langue de l\'interface mise a jour', 'success');
      }
      setShowLanguageModal(false);
    } catch {
      addToast('Erreur lors du changement de langue', 'error');
    }
  };

  const handlePasswordSubmit = async () => {
    setPasswordError(null);

    if (passwordForm.new !== passwordForm.confirm) {
      setPasswordError('Les mots de passe ne correspondent pas');
      return;
    }

    if (passwordForm.new.length < 8) {
      setPasswordError('Le mot de passe doit contenir au moins 8 caracteres');
      return;
    }

    try {
      await updatePassword(passwordForm.current, passwordForm.new);
      setShowPasswordModal(false);
      setPasswordForm({ current: '', new: '', confirm: '' });
      addToast('Mot de passe modifie avec succes', 'success');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors du changement de mot de passe';
      setPasswordError(errorMessage);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      await deleteAccount();
      addToast('Compte supprime', 'success');
      window.location.href = '/v2/login';
    } catch {
      addToast('Erreur lors de la suppression du compte', 'error');
      setIsDeletingAccount(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleThemeChange = (mode: 'light' | 'dark' | 'system') => {
    setTheme(mode);
    const themeNames = { light: 'clair', dark: 'sombre', system: 'systeme' };
    addToast(`Theme ${themeNames[mode]} active`, 'success');
  };

  const handleNotificationChange = async (key: keyof typeof notificationSettings, value: boolean) => {
    try {
      await updateNotificationSetting(key, value);
      addToast(value ? 'Notification activee' : 'Notification desactivee', 'success');
    } catch {
      addToast('Erreur lors de la modification des notifications', 'error');
    }
  };

  // Split view context for mobile back button
  const { goBackToList, isMobile, showRightPanel } = useSplitView();

  // Mobile back button component
  const MobileBackButton = () => {
    if (!isMobile || !showRightPanel) return null;
    return (
      <Button variant="ghost" size="sm" onClick={goBackToList}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </Button>
    );
  };

  if (isLoading) {
    return (
      <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors duration-300">
        <header className="sticky top-0 z-50 px-6 py-4 border-b border-[var(--gp-border)] bg-[var(--gp-surface)]/95 backdrop-blur-xl transition-colors duration-300">
          <div className="max-w-2xl mx-auto flex items-center gap-4">
            <MobileBackButton />
            <h1 className="text-xl font-semibold text-[var(--gp-text-primary)]" style={{ fontFamily: theme.fonts.display }}>
              Parametres
            </h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-6 py-8">
          <SettingsSkeleton />
        </main>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors duration-300">
      {/* Header */}
      <header className="sticky top-0 z-50 px-6 py-4 border-b border-[var(--gp-border)] bg-[var(--gp-surface)]/95 backdrop-blur-xl transition-colors duration-300">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <MobileBackButton />
          <h1 className="text-xl font-semibold text-[var(--gp-text-primary)]" style={{ fontFamily: theme.fonts.display }}>
            Parametres
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Error */}
        {error && (
          <div className="p-4 rounded-xl" style={{ background: 'color-mix(in srgb, var(--gp-error) 15%, transparent)' }}>
            <p style={{ color: 'var(--gp-error)' }}>{error}</p>
          </div>
        )}

        {/* Account */}
        <section>
          <h2 className="text-sm font-semibold mb-3 px-1 text-[var(--gp-text-muted)]">COMPTE</h2>
          <Card variant="outlined" hover={false} className="divide-y divide-[var(--gp-border)]">
            <Link href="/v2/me" className="w-full p-4 flex items-center justify-between text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--gp-terracotta) 15%, transparent)' }}>
                  <svg className="w-5 h-5 text-[var(--gp-terracotta)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-[var(--gp-text-primary)]">Profil</p>
                  <p className="text-sm text-[var(--gp-text-secondary)]">Photo, nom, bio</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <div className="w-full p-4 flex items-center justify-between text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--gp-deep-teal) 15%, transparent)' }}>
                  <svg className="w-5 h-5 text-[var(--gp-deep-teal)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-[var(--gp-text-primary)]">Email</p>
                  <p className="text-sm text-[var(--gp-text-secondary)]">
                    {accountSettings.email}
                    {accountSettings.emailVerified && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--gp-success) 20%, transparent)', color: 'var(--gp-success)' }}>
                        Verifie
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <button
              className="w-full p-4 flex items-center justify-between text-left"
              onClick={() => setShowPasswordModal(true)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--gp-royal-indigo) 15%, transparent)' }}>
                  <svg className="w-5 h-5 text-[var(--gp-royal-indigo)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-[var(--gp-text-primary)]">Mot de passe</p>
                  <p className="text-sm text-[var(--gp-text-secondary)]">Changer le mot de passe</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </Card>
        </section>

        {/* Language */}
        <section>
          <h2 className="text-sm font-semibold mb-3 px-1 text-[var(--gp-text-muted)]">LANGUE</h2>
          <Card variant="outlined" hover={false} className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-[var(--gp-text-primary)]">Langue de traduction</p>
                <p className="text-sm text-[var(--gp-text-secondary)]">Messages traduits dans cette langue</p>
              </div>
              <button
                onClick={() => {
                  setLanguageType('translation');
                  setShowLanguageModal(true);
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl transition-colors hover:opacity-80 bg-[var(--gp-parchment)]"
              >
                {translationLanguage && (
                  <>
                    <LanguageOrb code={translationLanguage.code} size="sm" pulse={false} className="w-6 h-6 text-sm" />
                    <span className="text-sm font-medium text-[var(--gp-text-primary)]">{translationLanguage.name}</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[var(--gp-border)]">
              <div>
                <p className="font-medium text-[var(--gp-text-primary)]">Langue de l&apos;interface</p>
                <p className="text-sm text-[var(--gp-text-secondary)]">Langue des menus et boutons</p>
              </div>
              <button
                onClick={() => {
                  setLanguageType('system');
                  setShowLanguageModal(true);
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl transition-colors hover:opacity-80 bg-[var(--gp-parchment)]"
              >
                {systemLanguage && (
                  <>
                    <LanguageOrb code={systemLanguage.code} size="sm" pulse={false} className="w-6 h-6 text-sm" />
                    <span className="text-sm font-medium text-[var(--gp-text-primary)]">{systemLanguage.name}</span>
                  </>
                )}
              </button>
            </div>
          </Card>
        </section>

        {/* Conversation Preview */}
        <section>
          <h2 className="text-sm font-semibold mb-3 px-1 text-[var(--gp-text-muted)]">APERCU DES CONVERSATIONS</h2>
          <Card variant="outlined" hover={false} className="p-4">
            <ConversationPreview translationLanguageCode={translationLanguage?.code} />
          </Card>
        </section>

        {/* Notifications */}
        <section>
          <h2 className="text-sm font-semibold mb-3 px-1 text-[var(--gp-text-muted)]">NOTIFICATIONS</h2>
          <Card variant="outlined" hover={false} className="divide-y divide-[var(--gp-border)]">
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-[var(--gp-text-primary)]">Messages</p>
                <p className="text-sm text-[var(--gp-text-secondary)]">Nouveaux messages</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificationSettings.messages}
                  onChange={(e) => handleNotificationChange('messages', e.target.checked)}
                  disabled={isUpdatingNotifications}
                  className="sr-only peer"
                />
                <div
                  className="w-11 h-6 rounded-full peer transition-colors duration-200"
                  style={{
                    background: notificationSettings.messages ? 'var(--gp-terracotta)' : 'var(--gp-parchment)',
                  }}
                >
                  <div
                    className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                    style={{
                      transform: notificationSettings.messages ? 'translateX(20px)' : 'translateX(0)',
                    }}
                  />
                </div>
              </label>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-[var(--gp-text-primary)]">Mentions</p>
                <p className="text-sm text-[var(--gp-text-secondary)]">Quand quelqu&apos;un vous mentionne</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificationSettings.mentions}
                  onChange={(e) => handleNotificationChange('mentions', e.target.checked)}
                  disabled={isUpdatingNotifications}
                  className="sr-only peer"
                />
                <div
                  className="w-11 h-6 rounded-full peer transition-colors duration-200"
                  style={{
                    background: notificationSettings.mentions ? 'var(--gp-terracotta)' : 'var(--gp-parchment)',
                  }}
                >
                  <div
                    className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                    style={{
                      transform: notificationSettings.mentions ? 'translateX(20px)' : 'translateX(0)',
                    }}
                  />
                </div>
              </label>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-[var(--gp-text-primary)]">Communautes</p>
                <p className="text-sm text-[var(--gp-text-secondary)]">Activite des communautes</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificationSettings.communities}
                  onChange={(e) => handleNotificationChange('communities', e.target.checked)}
                  disabled={isUpdatingNotifications}
                  className="sr-only peer"
                />
                <div
                  className="w-11 h-6 rounded-full peer transition-colors duration-200"
                  style={{
                    background: notificationSettings.communities ? 'var(--gp-terracotta)' : 'var(--gp-parchment)',
                  }}
                >
                  <div
                    className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                    style={{
                      transform: notificationSettings.communities ? 'translateX(20px)' : 'translateX(0)',
                    }}
                  />
                </div>
              </label>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-[var(--gp-text-primary)]">Appels</p>
                <p className="text-sm text-[var(--gp-text-secondary)]">Appels entrants</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificationSettings.calls}
                  onChange={(e) => handleNotificationChange('calls', e.target.checked)}
                  disabled={isUpdatingNotifications}
                  className="sr-only peer"
                />
                <div
                  className="w-11 h-6 rounded-full peer transition-colors duration-200"
                  style={{
                    background: notificationSettings.calls ? 'var(--gp-terracotta)' : 'var(--gp-parchment)',
                  }}
                >
                  <div
                    className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                    style={{
                      transform: notificationSettings.calls ? 'translateX(20px)' : 'translateX(0)',
                    }}
                  />
                </div>
              </label>
            </div>
          </Card>
        </section>

        {/* Appearance */}
        <section>
          <h2 className="text-sm font-semibold mb-3 px-1 text-[var(--gp-text-muted)]">APPARENCE</h2>
          <Card variant="outlined" hover={false} className="p-4">
            <p className="font-medium mb-3 text-[var(--gp-text-primary)]">Theme</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleThemeChange('light')}
                className="flex-1 p-3 rounded-xl border-2 text-center transition-all hover:scale-105 active:scale-95"
                style={{
                  borderColor: themeSettings.mode === 'light' ? 'var(--gp-terracotta)' : 'transparent',
                  background: themeSettings.mode === 'light' ? 'color-mix(in srgb, var(--gp-terracotta) 10%, transparent)' : 'var(--gp-parchment)'
                }}
              >
                <span className="text-2xl mb-1 block">☀️</span>
                <span className="text-sm font-medium text-[var(--gp-text-primary)]">Clair</span>
              </button>
              <button
                onClick={() => handleThemeChange('dark')}
                className="flex-1 p-3 rounded-xl border-2 text-center transition-all hover:scale-105 active:scale-95"
                style={{
                  borderColor: themeSettings.mode === 'dark' ? 'var(--gp-terracotta)' : 'transparent',
                  background: themeSettings.mode === 'dark' ? 'color-mix(in srgb, var(--gp-terracotta) 10%, transparent)' : 'var(--gp-parchment)'
                }}
              >
                <span className="text-2xl mb-1 block">🌙</span>
                <span className="text-sm font-medium text-[var(--gp-text-primary)]">Sombre</span>
              </button>
              <button
                onClick={() => handleThemeChange('system')}
                className="flex-1 p-3 rounded-xl border-2 text-center transition-all hover:scale-105 active:scale-95"
                style={{
                  borderColor: themeSettings.mode === 'system' ? 'var(--gp-terracotta)' : 'transparent',
                  background: themeSettings.mode === 'system' ? 'color-mix(in srgb, var(--gp-terracotta) 10%, transparent)' : 'var(--gp-parchment)'
                }}
              >
                <span className="text-2xl mb-1 block">💻</span>
                <span className="text-sm font-medium text-[var(--gp-text-primary)]">Systeme</span>
              </button>
            </div>
          </Card>
        </section>

        {/* Legal */}
        <section>
          <h2 className="text-sm font-semibold mb-3 px-1 text-[var(--gp-text-muted)]">LEGAL</h2>
          <Card variant="outlined" hover={false} className="divide-y divide-[var(--gp-border)]">
            <Link href="/v2/terms" className="block p-4 flex items-center justify-between">
              <span className="font-medium text-[var(--gp-text-primary)]">Conditions d&apos;utilisation</span>
              <svg className="w-5 h-5 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link href="/v2/privacy-policy" className="block p-4 flex items-center justify-between">
              <span className="font-medium text-[var(--gp-text-primary)]">Politique de confidentialite</span>
              <svg className="w-5 h-5 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </Card>
        </section>

        {/* Danger Zone */}
        <section>
          <Button
            variant="ghost"
            className="w-full text-[var(--gp-asian-ruby)]"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Supprimer mon compte
          </Button>
        </section>
      </main>

      {/* Language Modal */}
      {showLanguageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card variant="elevated" hover={false} className="w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-[var(--gp-border)] flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--gp-text-primary)]">
                {languageType === 'translation' ? 'Langue de traduction' : "Langue de l'interface"}
              </h2>
              <button onClick={() => setShowLanguageModal(false)}>
                <svg className="w-6 h-6 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {availableLanguages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageSelect(lang.code)}
                  className="w-full p-4 flex items-center gap-3 border-b border-[var(--gp-border)] transition-colors hover:bg-[var(--gp-hover)]"
                >
                  <LanguageOrb code={lang.code} size="md" pulse={false} className="w-10 h-10" />
                  <span className="font-medium text-[var(--gp-text-primary)]">{lang.name}</span>
                  {lang.flag && <span className="ml-auto text-xl">{lang.flag}</span>}
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card variant="elevated" hover={false} className="w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4 text-[var(--gp-text-primary)]">
              Changer le mot de passe
            </h2>

            {passwordError && (
              <div className="p-3 rounded-xl mb-4" style={{ background: 'color-mix(in srgb, var(--gp-error) 15%, transparent)' }}>
                <p className="text-sm" style={{ color: 'var(--gp-error)' }}>{passwordError}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-[var(--gp-text-secondary)]">
                  Mot de passe actuel
                </label>
                <input
                  type="password"
                  value={passwordForm.current}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--gp-border)] bg-[var(--gp-surface)] text-[var(--gp-text-primary)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-[var(--gp-text-secondary)]">
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  value={passwordForm.new}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, new: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--gp-border)] bg-[var(--gp-surface)] text-[var(--gp-text-primary)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-[var(--gp-text-secondary)]">
                  Confirmer le mot de passe
                </label>
                <input
                  type="password"
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--gp-border)] bg-[var(--gp-surface)] text-[var(--gp-text-primary)]"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowPasswordModal(false)}>
                Annuler
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handlePasswordSubmit}
                isLoading={isUpdating}
              >
                Enregistrer
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card variant="elevated" hover={false} className="w-full max-w-md p-6">
            <div className="text-center">
              <div
                className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'color-mix(in srgb, var(--gp-error) 15%, transparent)' }}
              >
                <svg className="w-8 h-8" style={{ color: 'var(--gp-error)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold mb-2 text-[var(--gp-text-primary)]">
                Supprimer votre compte ?
              </h2>
              <p className="text-sm mb-6 text-[var(--gp-text-secondary)]">
                Cette action est irreversible. Toutes vos donnees seront supprimees definitivement.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeletingAccount}
              >
                Annuler
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                style={{ background: 'var(--gp-error)' }}
                onClick={handleDeleteAccount}
                isLoading={isDeletingAccount}
              >
                Supprimer
              </Button>
            </div>
          </Card>
        </div>
      )}

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
