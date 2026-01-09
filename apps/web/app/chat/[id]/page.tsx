'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LinkConversationService, LinkConversationData } from '@/services/link-conversation.service';
import { BubbleStreamPage } from '@/components/common/bubble-stream-page';
import { useAuth } from '@/hooks/use-auth';
import { Header } from '@/components/layout/Header';
import { AccessDenied } from '@/components/ui/access-denied';
import { useI18n } from '@/hooks/useI18n';
import { authManager } from '@/services/auth-manager.service';

// Utiliser directement le type importé
type ConversationData = LinkConversationData;

export default function ChatLinkPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string; // Peut être linkId OU conversationShareLinkId
  const { user } = useAuth();
  const { t } = useI18n('chat');

  const [conversationData, setConversationData] = useState<ConversationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadConversation = async () => {
      try {
        setIsLoading(true);
        
        // Récupérer les tokens d'authentification via authManager (source unique)
        const anonymousSession = authManager.getAnonymousSession();
        const sessionToken = anonymousSession?.token;
        const authToken = authManager.getAuthToken();
        
        
        // id peut être un linkId ou un conversationShareLinkId
        const data = await LinkConversationService.getConversationData(id, {
          sessionToken: sessionToken || undefined,
          authToken: authToken || undefined
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

  // Redirection en cas d'erreur
  useEffect(() => {
    if (error && !isLoading) {
      // Vérifier si l'id ressemble à un lien d'invitation (commence par "mshy_")
      if (id && id.startsWith('mshy_')) {
        // Rediriger vers /join/{id} pour permettre à l'utilisateur de rejoindre
        router.push(`/join/${id}`);
      } else {
        // Sinon, rediriger vers l'accueil
        router.push('/');
      }
    }
  }, [error, isLoading, id, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    // La redirection se fait via useEffect, afficher un spinner pendant la redirection
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
        <p className="text-gray-600">Redirection en cours...</p>
      </div>
    );
  }

  if (!conversationData || !conversationData.currentUser) {
    // Déclencher une erreur pour activer la redirection
    if (!error) {
      setError(t('errors.unableToLoadConversation'));
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
        <p className="text-gray-600">Redirection en cours...</p>
      </div>
    );
  }

  const isAnonymous = conversationData.userType === 'anonymous';
  const conversationId = conversationData.conversation.id;

  return (
    <>
      <Header 
        mode="chat"
        conversationTitle={conversationData.conversation.title}
        shareLink={conversationData.link.linkId ? `${window.location.origin}/join/${conversationData.link.linkId}` : undefined}
      />
      
      <BubbleStreamPage 
        user={{
          ...conversationData.currentUser,
          email: '',
          role: 'USER' as const,
          permissions: {
            canAccessAdmin: false,
            canManageUsers: false,
            canManageGroups: false,
            canManageConversations: false,
            canViewAnalytics: false,
            canModerateContent: false,
            canViewAuditLogs: false,
            canManageNotifications: false,
            canManageTranslations: false,
            ...(conversationData.currentUser?.permissions || {})
          },
          systemLanguage: conversationData.currentUser?.language || 'fr',
          regionalLanguage: conversationData.currentUser?.language || 'fr',
          autoTranslateEnabled: true,
          translateToSystemLanguage: true,
          translateToRegionalLanguage: false,
          useCustomDestination: false,
          isOnline: true,
          lastActiveAt: new Date(),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }}
        conversationId={conversationId}
        isAnonymousMode={isAnonymous}
        linkId={id} // Passer l'id (peut être linkId ou conversationShareLinkId)
        initialParticipants={[
          // Ajouter l'utilisateur anonyme actuel en premier s'il est anonyme
          ...(isAnonymous && conversationData.currentUser ? [{
            id: conversationData.currentUser.id,
            username: conversationData.currentUser.username,
            firstName: conversationData.currentUser.firstName,
            lastName: conversationData.currentUser.lastName,
            displayName: conversationData.currentUser.displayName || conversationData.currentUser.username,
            email: '',
            avatar: '',
            role: 'USER' as const,
            permissions: {
              canAccessAdmin: false,
              canManageUsers: false,
              canManageGroups: false,
              canManageConversations: false,
              canViewAnalytics: false,
              canModerateContent: false,
              canViewAuditLogs: false,
              canManageNotifications: false,
              canManageTranslations: false,
            },
            systemLanguage: conversationData.currentUser.language || 'fr',
            regionalLanguage: conversationData.currentUser.language || 'fr',
            autoTranslateEnabled: true,
            translateToSystemLanguage: true,
            translateToRegionalLanguage: false,
            useCustomDestination: false,
            isOnline: true,
            lastActiveAt: new Date(),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          }] : []),
          ...conversationData.members.map(member => ({
            id: member.user.id,
            username: member.user.username,
            firstName: member.user.firstName,
            lastName: member.user.lastName,
            displayName: member.user.displayName,
            email: '',
            avatar: member.user.avatar,
            role: 'USER' as const,
            permissions: {
              canAccessAdmin: false,
              canManageUsers: false,
              canManageGroups: false,
              canManageConversations: false,
              canViewAnalytics: false,
              canModerateContent: false,
              canViewAuditLogs: false,
              canManageNotifications: false,
              canManageTranslations: false,
            },
            systemLanguage: 'fr',
            regionalLanguage: 'fr',
            autoTranslateEnabled: true,
            translateToSystemLanguage: true,
            translateToRegionalLanguage: false,
            useCustomDestination: false,
            isOnline: member.user.isOnline,
            lastActiveAt: new Date(member.user.lastActiveAt),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          })),
          // Ajouter les autres participants anonymes (en évitant de dupliquer l'utilisateur actuel)
          ...conversationData.anonymousParticipants
            .filter(participant => !isAnonymous || participant.id !== conversationData.currentUser?.id)
            .map(participant => ({
            id: participant.id,
            username: participant.username,
            firstName: participant.firstName,
            lastName: participant.lastName,
            displayName: participant.username,
            email: '',
            avatar: '',
            role: 'USER' as const,
            permissions: {
              canAccessAdmin: false,
              canManageUsers: false,
              canManageGroups: false,
              canManageConversations: false,
              canViewAnalytics: false,
              canModerateContent: false,
              canViewAuditLogs: false,
              canManageNotifications: false,
              canManageTranslations: false,
            },
            systemLanguage: participant.language || 'fr',
            regionalLanguage: participant.language || 'fr',
            autoTranslateEnabled: true,
            translateToSystemLanguage: true,
            translateToRegionalLanguage: false,
            useCustomDestination: false,
            isOnline: participant.isOnline,
            lastActiveAt: new Date(participant.lastActiveAt),
            isActive: true,
            createdAt: new Date(participant.joinedAt),
            updatedAt: new Date(participant.lastActiveAt)
          }))
        ]}
      />
    </>
  );
}