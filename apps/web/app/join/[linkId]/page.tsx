'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/hooks/use-auth';
import { useI18n } from '@/hooks/useI18n';
import { useJoinFlow } from '@/hooks/use-join-flow';
import { useLinkValidation, useUsernameValidation } from '@/hooks/use-link-validation';
import { useConversationJoin } from '@/hooks/use-conversation-join';
import {
  JoinHeader,
  JoinInfo,
  JoinActions,
  AnonymousForm,
  JoinError,
  JoinLoading
} from '@/components/join';
import type { User } from '@meeshy/shared/types';

export default function JoinConversationPage() {
  const params = useParams();
  const linkId = params?.linkId as string;
  const { user: currentUser, isChecking, isAnonymous, joinAnonymously: joinAnonymouslyAuth } = useAuth();
  const { t } = useI18n('joinPage');

  const {
    authMode,
    setAuthMode,
    showAnonymousForm,
    setShowAnonymousForm,
    anonymousForm,
    updateAnonymousForm,
    generateUsername
  } = useJoinFlow();

  const {
    conversationLink,
    isLoading,
    linkError
  } = useLinkValidation(linkId);

  const usernameCheckStatus = useUsernameValidation(anonymousForm.username);

  const {
    isJoining,
    joinAnonymously,
    joinAsAuthenticated
  } = useConversationJoin(linkId);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const autoAnonymous = urlParams.get('anonymous');
    if (autoAnonymous === 'true' && !currentUser) {
      setShowAnonymousForm(true);
    }
  }, [currentUser, setShowAnonymousForm]);

  // Attempt to open the native app once per linkId. Re-firing the
  // meeshy:// scheme on every render (auth check completing, window focus
  // events, etc.) bounces the user back into the iOS app every time they
  // return to Safari — an infinite loop when the conversation or share
  // link does not exist and the iOS app has nowhere to land.
  //
  // Three guards stack:
  //   - in-memory ref: blocks repeats within the same component instance
  //   - sessionStorage: survives Safari page reloads triggered by the iOS
  //     app coming to foreground / memory pressure on the tab
  //   - ?noredirect=1 URL flag: stamped into the URL via replaceState so
  //     even a hard reload from history sees the guard, and so the user
  //     can manually retry by clearing the flag from the URL
  const lastRedirectedLinkIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!linkId) return;
    if (lastRedirectedLinkIdRef.current === linkId) return;

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('noredirect') === '1') return;

    const sessionKey = `meeshy:join-redirected:${linkId}`;
    if (sessionStorage.getItem(sessionKey) === '1') return;

    const ua = navigator.userAgent;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
    if (!isMobile) return;

    lastRedirectedLinkIdRef.current = linkId;
    sessionStorage.setItem(sessionKey, '1');
    urlParams.set('noredirect', '1');
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}?${urlParams.toString()}`
    );
    window.location.href = `meeshy://join/${linkId}`;
  }, [linkId]);

  const handleJoinConversation = useCallback(async () => {
    const anonymousSession = typeof window !== 'undefined'
      ? JSON.parse(localStorage.getItem('anonymous_session') || 'null')
      : null;
    const sessionToken = anonymousSession?.token;

    await joinAsAuthenticated(isAnonymous, sessionToken);
  }, [isAnonymous, joinAsAuthenticated]);

  const handleAuthSuccess = useCallback((user: User, token: string) => {
    setAuthMode('welcome');
    setTimeout(() => {
      handleJoinConversation();
    }, 500);
  }, [setAuthMode, handleJoinConversation]);

  const handleJoinAnonymously = useCallback(async () => {
    await joinAnonymously(
      anonymousForm,
      joinAnonymouslyAuth,
      generateUsername,
      conversationLink?.requireNickname,
      conversationLink?.requireEmail,
      conversationLink?.requireBirthday
    );
  }, [
    anonymousForm,
    joinAnonymously,
    joinAnonymouslyAuth,
    generateUsername,
    conversationLink?.requireNickname,
    conversationLink?.requireEmail,
    conversationLink?.requireBirthday
  ]);

  const handleShowAnonymousForm = useCallback(() => {
    setShowAnonymousForm(true);
  }, [setShowAnonymousForm]);

  const handleHideAnonymousForm = useCallback(() => {
    setShowAnonymousForm(false);
  }, [setShowAnonymousForm]);

  if (isLoading || isChecking) {
    return <JoinLoading />;
  }

  if (linkError) {
    return <JoinError error={linkError} />;
  }

  if (!conversationLink) {
    return <JoinError error={t('conversationNotFoundDesc')} />;
  }

  const creatorName = conversationLink.creator
    ? conversationLink.creator.displayName ||
      `${conversationLink.creator.firstName} ${conversationLink.creator.lastName}`.trim() ||
      conversationLink.creator.username
    : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <Header
        mode="landing"
        authMode={authMode}
        onAuthModeChange={setAuthMode}
      />

      <main className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto">
          <Card className="shadow-xl">
            <JoinHeader
              conversationType={conversationLink.conversation?.type}
              conversationTitle={conversationLink.conversation?.title}
              description={conversationLink.description}
              creatorName={creatorName}
            />

            <CardContent className="space-y-6">
              <JoinInfo conversationLink={conversationLink} />

              {!showAnonymousForm ? (
                <JoinActions
                  currentUser={currentUser}
                  isJoining={isJoining}
                  authMode={authMode}
                  requireAccount={conversationLink.requireAccount}
                  onAuthModeChange={setAuthMode}
                  onJoinConversation={handleJoinConversation}
                  onShowAnonymousForm={handleShowAnonymousForm}
                  onAuthSuccess={handleAuthSuccess}
                />
              ) : (
                <AnonymousForm
                  formData={anonymousForm}
                  usernameCheckStatus={usernameCheckStatus}
                  requireNickname={conversationLink.requireNickname}
                  requireEmail={conversationLink.requireEmail}
                  requireBirthday={conversationLink.requireBirthday}
                  isJoining={isJoining}
                  onUpdateForm={updateAnonymousForm}
                  onSubmit={handleJoinAnonymously}
                  onBack={handleHideAnonymousForm}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
