'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Card, LanguageOrb, MessageBubble, useToast, PageHeader, Switch, Dialog, DialogHeader, DialogBody, DialogFooter, Input, Label, Skeleton } from '@/components/v2';
import { useSettingsV2 } from '@/hooks/v2';
import { useI18n } from '@/hooks/use-i18n';

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
    <div className="space-y-6">
      <Skeleton variant="rectangular" className="h-40" />
      <Skeleton variant="rectangular" className="h-32" />
      <Skeleton variant="rectangular" className="h-48" />
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
  const { t } = useI18n('settings');
  const [showTranslations, setShowTranslations] = useState(true);

  // Filter translations to show only the user's translation language
  const getFilteredTranslations = (message: PreviewMessage) => {
    if (!translationLanguageCode || translationLanguageCode === message.languageCode) {
      return [];
    }
    return message.translations.filter((tr) => tr.languageCode === translationLanguageCode);
  };

  return (
    <div className="space-y-3">
      {/* Preview header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--gp-text-secondary)]">
          {t('v2settings.previewWithSettings')}
        </p>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={showTranslations}
            onChange={(e) => setShowTranslations(e.target.checked)}
            className="w-4 h-4 rounded accent-[var(--gp-terracotta)]"
          />
          <span className="text-[var(--gp-text-muted)]">{t('v2settings.showTranslations')}</span>
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
            <span>{t('v2settings.yourLanguage')}</span>
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
  const { t } = useI18n('settings');

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
        addToast(t('v2settings.translationLangUpdated'), 'success');
      } else {
        await updateSystemLanguage(code);
        addToast(t('v2settings.uiLangUpdated'), 'success');
      }
      setShowLanguageModal(false);
    } catch {
      addToast(t('v2settings.uiLangUpdated'), 'error');
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
      addToast(t('v2settings.passwordChanged'), 'success');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('v2settings.passwordChangeError');
      setPasswordError(errorMessage);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      await deleteAccount();
      addToast(t('v2settings.accountDeleted'), 'success');
      window.location.href = '/v2/login';
    } catch {
      addToast(t('v2settings.accountDeleteError'), 'error');
      setIsDeletingAccount(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleThemeChange = (mode: 'light' | 'dark' | 'system') => {
    setTheme(mode);
    const themeToastKeys = { light: 'v2settings.themeLight', dark: 'v2settings.themeDark', system: 'v2settings.themeSystem' } as const;
    addToast(t(themeToastKeys[mode]), 'success');
  };

  const handleNotificationChange = async (key: keyof typeof notificationSettings, value: boolean) => {
    try {
      await updateNotificationSetting(key, value);
      addToast(value ? t('v2settings.notificationEnabled') : t('v2settings.notificationDisabled'), 'success');
    } catch {
      addToast(t('v2settings.notificationUpdateError'), 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors duration-300">
        <PageHeader title={t('v2settings.pageTitle')} />
        <main className="max-w-2xl mx-auto px-6 py-8">
          <SettingsSkeleton />
        </main>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors duration-300">
      <PageHeader title={t('v2settings.pageTitle')} />

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Error */}
        {error && (
          <div className="p-4 rounded-xl" style={{ background: 'color-mix(in srgb, var(--gp-error) 15%, transparent)' }}>
            <p style={{ color: 'var(--gp-error)' }}>{error}</p>
          </div>
        )}

        {/* Account */}
        <section>
          <h2 className="text-sm font-semibold mb-3 px-1 text-[var(--gp-text-muted)]">{t('v2settings.accountSection')}</h2>
          <Card variant="outlined" hover={false} className="divide-y divide-[var(--gp-border)]">
            <Link href="/v2/me" className="w-full p-4 flex items-center justify-between text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--gp-terracotta) 15%, transparent)' }}>
                  <svg className="w-5 h-5 text-[var(--gp-terracotta)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-[var(--gp-text-primary)]">{t('v2settings.profile')}</p>
                  <p className="text-sm text-[var(--gp-text-secondary)]">{t('v2settings.profileSubtitle')}</p>
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
                  <p className="font-medium text-[var(--gp-text-primary)]">{t('v2settings.email')}</p>
                  <p className="text-sm text-[var(--gp-text-secondary)]">
                    {accountSettings.email}
                    {accountSettings.emailVerified && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--gp-success) 20%, transparent)', color: 'var(--gp-success)' }}>
                        {t('v2settings.emailVerified')}
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
                  <p className="font-medium text-[var(--gp-text-primary)]">{t('v2settings.password')}</p>
                  <p className="text-sm text-[var(--gp-text-secondary)]">{t('v2settings.passwordSubtitle')}</p>
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
          <h2 className="text-sm font-semibold mb-3 px-1 text-[var(--gp-text-muted)]">{t('v2settings.languageSection')}</h2>
          <Card variant="outlined" hover={false} className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-[var(--gp-text-primary)]">{t('v2settings.translationLanguage')}</p>
                <p className="text-sm text-[var(--gp-text-secondary)]">{t('v2settings.translationLanguageSubtitle')}</p>
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
                <p className="font-medium text-[var(--gp-text-primary)]">{t('v2settings.interfaceLanguage')}</p>
                <p className="text-sm text-[var(--gp-text-secondary)]">{t('v2settings.interfaceLanguageSubtitle')}</p>
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
          <h2 className="text-sm font-semibold mb-3 px-1 text-[var(--gp-text-muted)]">{t('v2settings.previewSection')}</h2>
          <Card variant="outlined" hover={false} className="p-4">
            <ConversationPreview translationLanguageCode={translationLanguage?.code} />
          </Card>
        </section>

        {/* Notifications */}
        <section>
          <h2 className="text-sm font-semibold mb-3 px-1 text-[var(--gp-text-muted)]">{t('v2settings.notificationsSection')}</h2>
          <Card variant="outlined" hover={false} className="divide-y divide-[var(--gp-border)]">
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-[var(--gp-text-primary)]">{t('v2settings.notifMessages')}</p>
                <p className="text-sm text-[var(--gp-text-secondary)]">{t('v2settings.notifMessagesSubtitle')}</p>
              </div>
              <Switch
                checked={notificationSettings.messages}
                onCheckedChange={(v) => handleNotificationChange('messages', v)}
                disabled={isUpdatingNotifications}
                aria-label={t('v2settings.notifMessagesAria')}
              />
            </div>
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-[var(--gp-text-primary)]">{t('v2settings.notifMentions')}</p>
                <p className="text-sm text-[var(--gp-text-secondary)]">{t('v2settings.notifMentionsSubtitle')}</p>
              </div>
              <Switch
                checked={notificationSettings.mentions}
                onCheckedChange={(v) => handleNotificationChange('mentions', v)}
                disabled={isUpdatingNotifications}
                aria-label={t('v2settings.notifMentionsAria')}
              />
            </div>
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-[var(--gp-text-primary)]">{t('v2settings.notifCommunities')}</p>
                <p className="text-sm text-[var(--gp-text-secondary)]">{t('v2settings.notifCommunitiesSubtitle')}</p>
              </div>
              <Switch
                checked={notificationSettings.communities}
                onCheckedChange={(v) => handleNotificationChange('communities', v)}
                disabled={isUpdatingNotifications}
                aria-label={t('v2settings.notifCommunitiesAria')}
              />
            </div>
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-[var(--gp-text-primary)]">{t('v2settings.notifCalls')}</p>
                <p className="text-sm text-[var(--gp-text-secondary)]">{t('v2settings.notifCallsSubtitle')}</p>
              </div>
              <Switch
                checked={notificationSettings.calls}
                onCheckedChange={(v) => handleNotificationChange('calls', v)}
                disabled={isUpdatingNotifications}
                aria-label={t('v2settings.notifCallsAria')}
              />
            </div>
          </Card>
        </section>

        {/* Appearance */}
        <section>
          <h2 className="text-sm font-semibold mb-3 px-1 text-[var(--gp-text-muted)]">{t('v2settings.appearanceSection')}</h2>
          <Card variant="outlined" hover={false} className="p-4">
            <p className="font-medium mb-3 text-[var(--gp-text-primary)]">{t('v2settings.theme')}</p>
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
                <span className="text-sm font-medium text-[var(--gp-text-primary)]">{t('v2settings.themeLightLabel')}</span>
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
                <span className="text-sm font-medium text-[var(--gp-text-primary)]">{t('v2settings.themeDarkLabel')}</span>
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
                <span className="text-sm font-medium text-[var(--gp-text-primary)]">{t('v2settings.themeSystemLabel')}</span>
              </button>
            </div>
          </Card>
        </section>

        {/* Legal */}
        <section>
          <h2 className="text-sm font-semibold mb-3 px-1 text-[var(--gp-text-muted)]">{t('v2settings.legalSection')}</h2>
          <Card variant="outlined" hover={false} className="divide-y divide-[var(--gp-border)]">
            <Link href="/v2/terms" className="block p-4 flex items-center justify-between">
              <span className="font-medium text-[var(--gp-text-primary)]">{t('v2settings.terms')}</span>
              <svg className="w-5 h-5 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link href="/v2/privacy-policy" className="block p-4 flex items-center justify-between">
              <span className="font-medium text-[var(--gp-text-primary)]">{t('v2settings.privacyPolicy')}</span>
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
            {t('v2settings.deleteAccount')}
          </Button>
        </section>
      </main>

      {/* Language Modal */}
      <Dialog open={showLanguageModal} onClose={() => setShowLanguageModal(false)} className="max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--gp-text-primary)]">
            {languageType === 'translation' ? t('v2settings.translationLanguage') : t('v2settings.interfaceLanguage')}
          </h2>
          <button onClick={() => setShowLanguageModal(false)} aria-label={t('v2settings.close')}>
            <svg className="w-6 h-6 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </DialogHeader>
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
      </Dialog>

      {/* Password Modal */}
      <Dialog open={showPasswordModal} onClose={() => setShowPasswordModal(false)}>
        <DialogBody>
          <h2 className="text-lg font-semibold mb-4 text-[var(--gp-text-primary)]">
            {t('v2settings.passwordModalTitle')}
          </h2>

          {passwordError && (
            <div className="p-3 rounded-xl mb-4" style={{ background: 'color-mix(in srgb, var(--gp-error) 15%, transparent)' }}>
              <p className="text-sm" style={{ color: 'var(--gp-error)' }}>{passwordError}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <Label className="mb-1">{t('v2settings.currentPassword')}</Label>
              <Input
                type="password"
                value={passwordForm.current}
                onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
              />
            </div>
            <div>
              <Label className="mb-1">{t('v2settings.newPassword')}</Label>
              <Input
                type="password"
                value={passwordForm.new}
                onChange={(e) => setPasswordForm((p) => ({ ...p, new: e.target.value }))}
              />
            </div>
            <div>
              <Label className="mb-1">{t('v2settings.confirmPassword')}</Label>
              <Input
                type="password"
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" className="flex-1" onClick={() => setShowPasswordModal(false)}>
            {t('v2settings.cancel')}
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={handlePasswordSubmit}
            isLoading={isUpdating}
          >
            {t('v2settings.save')}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
        <DialogBody className="text-center">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--gp-error) 15%, transparent)' }}
          >
            <svg className="w-8 h-8" style={{ color: 'var(--gp-error)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2 text-[var(--gp-text-primary)]">
            {t('v2settings.deleteAccountTitle')}
          </h2>
          <p className="text-sm mb-6 text-[var(--gp-text-secondary)]">
            {t('v2settings.deleteWarning')}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setShowDeleteConfirm(false)}
            disabled={isDeletingAccount}
          >
            {t('v2settings.cancel')}
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            style={{ background: 'var(--gp-error)' }}
            onClick={handleDeleteAccount}
            isLoading={isDeletingAccount}
          >
            {t('v2settings.delete')}
          </Button>
        </DialogFooter>
      </Dialog>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
