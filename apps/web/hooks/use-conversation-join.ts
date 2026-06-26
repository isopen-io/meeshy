'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { buildApiUrl } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';
import { logger } from '@/utils/logger';
import type { AnonymousFormData } from './use-join-flow';

export function useConversationJoin(linkId: string) {
  const router = useRouter();
  const [isJoining, setIsJoining] = useState(false);

  const joinAnonymously = useCallback(async (
    formData: AnonymousFormData,
    onSuccess: (participant: any, sessionToken: string, conversationShareLinkId: string) => void,
    generateUsername: (firstName: string, lastName: string) => string,
    requireNickname?: boolean,
    requireEmail?: boolean,
    requireBirthday?: boolean
  ) => {
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      toast.error('Le prénom et le nom sont requis');
      return;
    }

    if (requireNickname && !formData.username.trim()) {
      toast.error('Le pseudo est requis');
      return;
    }

    if (requireEmail && !formData.email.trim()) {
      toast.error("L'email est requis");
      return;
    }

    if (requireBirthday && !formData.birthday.trim()) {
      toast.error('La date de naissance est requise');
      return;
    }

    setIsJoining(true);
    try {
      const response = await fetch(`${buildApiUrl('/anonymous/join')}/${linkId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          username: formData.username.trim() || generateUsername(formData.firstName, formData.lastName),
          email: formData.email.trim() || undefined,
          birthday: formData.birthday ? new Date(formData.birthday).toISOString() : undefined,
          language: formData.language,
          deviceFingerprint: navigator.userAgent
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        onSuccess(result.data.participant, result.data.sessionToken, result.data.conversationShareLinkId || linkId);

        localStorage.setItem('anonymous_current_link_id', linkId);

        toast.success(`Bienvenue ${result.data.participant.username} !`);

        window.location.href = `/chat/${linkId}`;
      } else {
        toast.error(result.message || 'Erreur lors de la connexion');

        if (response.status === 409 && result.suggestedNickname) {
          toast.info(`Pseudo suggéré: ${result.suggestedNickname}`);
        }
        return result.suggestedNickname;
      }
    } catch (error) {
      logger.error('[useConversationJoin]', 'Erreur connexion anonyme', { error });
      toast.error('Erreur de connexion');
    } finally {
      setIsJoining(false);
    }
  }, [linkId]);

  const joinAsAuthenticated = useCallback(async (
    isAnonymous: boolean,
    sessionToken: string | null
  ) => {
    setIsJoining(true);

    try {
      const authToken = authManager.getAuthToken();

      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      if (sessionToken) {
        headers['x-session-token'] = sessionToken;
      }

      if (isAnonymous && sessionToken) {
        router.push(`/chat/${linkId}`);
        return;
      }

      if (authToken) {
        logger.info('[useConversationJoin]', 'Envoi requête POST à', { data: `${buildApiUrl('/conversations/join')}/${linkId}` });

        const response = await fetch(`${buildApiUrl('/conversations/join')}/${linkId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        });

        logger.info('[useConversationJoin]', 'Statut réponse', { data: response.status });

        if (response.ok) {
          const result = await response.json();
          logger.info('[useConversationJoin]', 'Réponse complète du backend', { data: result });
          logger.info('[useConversationJoin]', 'result.data', { data: result.data });
          logger.info('[useConversationJoin]', 'result.data?.conversationId', { data: result.data?.conversationId });

          if (!result.data?.conversationId) {
            logger.error('[useConversationJoin]', 'conversationId manquant dans la réponse', { error: result });
            toast.error('Erreur: ID de conversation manquant');
            return;
          }

          toast.success('Redirection...');
          logger.info('[useConversationJoin]', 'Redirection vers', { data: `/conversations/${result.data.conversationId}` });
          router.push(`/conversations/${result.data.conversationId}`);
        } else {
          const error = await response.json();
          logger.error('[useConversationJoin]', 'Erreur POST /conversations/join', { error: { status: response.status, ...error } });
          toast.error(error.message || 'Erreur lors de la connexion');
        }
      }
    } catch (error) {
      logger.error('[useConversationJoin]', 'Erreur jointure', { error });
      toast.error('Erreur de connexion');
    } finally {
      setIsJoining(false);
    }
  }, [linkId, router]);

  return {
    isJoining,
    joinAnonymously,
    joinAsAuthenticated
  };
}
