'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LinkConversationService, type LinkConversationData } from '@/services/link-conversation.service';
import { BubbleStreamPage } from '@/components/common/bubble-stream-page';
import { Header } from '@/components/layout/Header';
import { useI18n } from '@/hooks/useI18n';
import { authManager } from '@/services/auth-manager.service';
import { mapCurrentUserToUser, mapParticipantsFromLinkData, getAnonymousPermissionHints } from '@/utils/participant-mapper';
import { useAnonymousSession } from '@/hooks/use-anonymous-session';

export default function ChatLinkPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { t } = useI18n('chat');

  const [conversationData, setConversationData] = useState<LinkConversationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAnonymous = conversationData?.userType === 'anonymous';
  useAnonymousSession({ enabled: !!isAnonymous, linkId: id });

  useEffect(() => {
    const loadConversation = async () => {
      try {
        setIsLoading(true);

        const anonymousSession = authManager.getAnonymousSession();
        const sessionToken = anonymousSession?.token;
        const authToken = authManager.getAuthToken();

        const data = await LinkConversationService.getConversationData(id, {
          sessionToken: sessionToken || undefined,
          authToken: authToken || undefined,
        });

        if (!data) {
          setError(t('errors.invalidLink'));
          return;
        }

        if (!data.link.isActive) {
          setError(t('errors.linkNoLongerActive'));
          return;
        }

        if (data.link.expiresAt && new Date(data.link.expiresAt) < new Date()) {
          setError(t('errors.linkExpired'));
          return;
        }

        setConversationData(data);
      } catch (err) {
        console.error('Failed to load conversation:', err);
        setError(t('errors.loadError'));
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      loadConversation();
    }
  }, [id, t]);

  useEffect(() => {
    if (!error || isLoading) return;
    if (typeof window === 'undefined') return;

    if (!id || !id.startsWith('mshy_')) {
      router.push('/');
      return;
    }

    // /chat/[id] failure used to unconditionally bounce to /join/[id].
    // When the link is also dead on /join/[id] AND the iOS scheme handler
    // takes over, the user lives in a triangle: Safari /chat → Safari
    // /join → meeshy:// (iOS app shows error) → user dismisses → Safari
    // reloads /join → /chat link re-tapped → infinite. Guard the bounce
    // with a one-shot sessionStorage flag keyed by id so a second
    // landing on /chat/[id] for the same id renders the inline error
    // instead of re-firing the redirect.
    const sessionKey = `meeshy:chat-bounced:${id}`;
    if (sessionStorage.getItem(sessionKey) === '1') return;

    sessionStorage.setItem(sessionKey, '1');
    router.push(`/join/${id}`);
  }, [error, isLoading, id, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500" />
        <p className="text-gray-600">{t('redirecting') || 'Redirection en cours...'}</p>
      </div>
    );
  }

  if (!conversationData || !conversationData.currentUser) {
    if (!error) {
      setError(t('errors.unableToLoadConversation'));
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500" />
        <p className="text-gray-600">{t('redirecting') || 'Redirection en cours...'}</p>
      </div>
    );
  }

  const conversationId = conversationData.conversation.id;

  return (
    <>
      <Header
        mode="chat"
        conversationTitle={conversationData.conversation.title}
        shareLink={
          conversationData.link.linkId
            ? `${window.location.origin}/join/${conversationData.link.linkId}`
            : undefined
        }
      />

      <BubbleStreamPage
        user={mapCurrentUserToUser(conversationData.currentUser)}
        conversationId={conversationId}
        isAnonymousMode={isAnonymous}
        linkId={id}
        initialParticipants={mapParticipantsFromLinkData(conversationData, isAnonymous)}
        anonymousPermissionHints={isAnonymous ? getAnonymousPermissionHints(conversationData.link) : undefined}
      />
    </>
  );
}
