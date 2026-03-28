'use client';

import { AnonymousRedirect } from '@/components/auth/AnonymousRedirect';
import { BubbleStreamPage } from '@/components/common/bubble-stream-page';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Header } from '@/components/layout/Header';
import { LoginForm } from '@/components/auth/login-form';
import { LandingContent } from '@/components/landing/LandingContent';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLandingAuth } from '@/hooks/use-landing-auth';
import { useI18n } from '@/hooks/useI18n';

function LandingPageContent() {
  const { state, authMode, setAuthMode } = useLandingAuth();
  const { t: tCommon } = useI18n('common');
  const { t: tAuth } = useI18n('auth');
  const { locale, setLocale } = useI18n('landing');

  if (state.mode === 'checking') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (state.mode === 'authenticated') {
    return (
      <div className="h-screen overflow-hidden flex flex-col">
        <DashboardLayout
          title={tCommon('navigation.home')}
          className="!bg-none !bg-transparent !max-w-none !px-0 !h-full !overflow-hidden flex-1 min-h-0"
        >
          <BubbleStreamPage
            user={state.user}
            conversationId="meeshy"
            isAnonymousMode={false}
          />
        </DashboardLayout>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Header
          mode="landing"
          authMode={authMode}
          onAuthModeChange={setAuthMode}
          anonymousChatLink={state.anonymousChatLink}
        />

        <LandingContent locale={locale} onLocaleChange={setLocale} />

        <Dialog open={authMode === 'login'} onOpenChange={(open) => setAuthMode(open ? 'login' : 'welcome')}>
          <DialogContent className="max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b shrink-0">
              <DialogHeader>
                <DialogTitle>{tAuth('login.title') || 'Connexion'}</DialogTitle>
                <DialogDescription>
                  {tAuth('login.description') || 'Connectez-vous à votre compte Meeshy'}
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="flex-1 overflow-y-auto px-6 min-h-0 py-4">
              <LoginForm />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

export default function LandingPage() {
  return (
    <AnonymousRedirect redirectToChat={true}>
      <LandingPageContent />
    </AnonymousRedirect>
  );
}
