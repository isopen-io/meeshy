'use client';

import { useEffect } from 'react';
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
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const autoAnonymous = urlParams.get('anonymous');

      if (autoAnonymous === 'true' && !currentUser) {
        setShowAnonymousForm(true);
      }
    }
  }, [currentUser, setShowAnonymousForm]);

  const handleAuthSuccess = (user: User, token: string) => {
    setAuthMode('welcome');
    setTimeout(() => {
      handleJoinConversation();
    }, 500);
  };

  const handleJoinAnonymously = async () => {
    await joinAnonymously(
      anonymousForm,
      joinAnonymouslyAuth,
      generateUsername,
      conversationLink?.requireNickname,
      conversationLink?.requireEmail,
      conversationLink?.requireBirthday
    );
  };

  const handleJoinConversation = async () => {
    const anonymousSession = typeof window !== 'undefined'
      ? JSON.parse(localStorage.getItem('anonymous_session') || 'null')
      : null;
    const sessionToken = anonymousSession?.token;

    await joinAsAuthenticated(isAnonymous, sessionToken);
  };

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
                  onShowAnonymousForm={() => setShowAnonymousForm(true)}
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
                  onBack={() => setShowAnonymousForm(false)}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
