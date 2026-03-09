/**
 * useParticipants - Gère le chargement et l'état des participants
 *
 * Suit les Vercel React Best Practices:
 * - async-parallel: chargement parallèle possible
 * - rerender-functional-setstate: mises à jour fonctionnelles
 * - js-index-maps: déduplication avec Map
 *
 * @module hooks/conversations/use-participants
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { conversationsService } from '@/services/conversations.service';
import { useUserStore } from '@/stores/user-store';
import type { Participant } from '@meeshy/shared/types';
import type { ConversationParticipantResponse } from '@/services/conversations/types';
import { MemberRole } from '@meeshy/shared/types';

interface UseParticipantsOptions {
  /**
   * ID de la conversation courante
   */
  conversationId: string | null;
}

interface UseParticipantsReturn {
  /**
   * Liste des participants
   */
  participants: Participant[];

  /**
   * Ref stable vers les participants
   */
  participantsRef: React.RefObject<Participant[]>;

  /**
   * Charge les participants d'une conversation
   */
  loadParticipants: (conversationId: string) => Promise<void>;

  /**
   * Indique si le chargement est en cours
   */
  isLoading: boolean;
}

function mapResponseToParticipant(
  response: ConversationParticipantResponse,
  conversationId: string
): Participant {
  return {
    id: response.participantId || response.id,
    conversationId,
    type: response.type || (response.isAnonymous ? 'anonymous' : 'user'),
    userId: response.userId || undefined,
    displayName: response.displayName || response.username,
    avatar: response.avatar || undefined,
    role: response.conversationRole || MemberRole.MEMBER,
    language: response.systemLanguage || 'fr',
    permissions: {
      canSendMessages: response.canSendMessages ?? true,
      canSendFiles: response.canSendFiles ?? true,
      canSendImages: response.canSendImages ?? true,
      canSendVideos: true,
      canSendAudios: true,
      canSendLocations: true,
      canSendLinks: true,
    },
    isActive: response.isActive,
    isOnline: response.isOnline,
    joinedAt: new Date(response.joinedAt),
    lastActiveAt: response.lastActiveAt ? new Date(response.lastActiveAt) : undefined,
    user: {
      id: response.userId || response.id,
      username: response.username,
      firstName: response.firstName,
      lastName: response.lastName,
      displayName: response.displayName,
      avatar: response.avatar,
      email: response.email,
      isOnline: response.isOnline,
      lastActiveAt: new Date(response.lastActiveAt || Date.now()),
      systemLanguage: response.systemLanguage,
      regionalLanguage: response.regionalLanguage,
      customDestinationLanguage: response.customDestinationLanguage,
      role: response.role,
      isActive: response.isActive,
      createdAt: new Date(response.createdAt || Date.now()),
      updatedAt: new Date(response.updatedAt || Date.now()),
      autoTranslateEnabled: response.autoTranslateEnabled,
      translateToSystemLanguage: true,
      translateToRegionalLanguage: false,
      useCustomDestination: false,
      keepOriginalMessages: true,
      translationQuality: 'medium',
    },
  };
}

/**
 * Hook pour gérer les participants d'une conversation
 */
export function useParticipants({ conversationId }: UseParticipantsOptions): UseParticipantsReturn {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const participantsRef = useRef<Participant[]>([]);
  const userStore = useUserStore();

  // Sync ref avec state
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  /**
   * Charge les participants d'une conversation
   */
  const loadParticipants = useCallback(async (convId: string) => {
    setIsLoading(true);

    try {
      const participantsData = await conversationsService.getAllParticipants(convId);

      const allResponses = [
        ...participantsData.authenticatedParticipants,
        ...participantsData.anonymousParticipants,
      ];

      // Map and deduplicate (authenticated wins if duplicate)
      const participantsMap = new Map<string, Participant>();
      for (const response of allResponses) {
        const participant = mapResponseToParticipant(response, convId);
        const key = participant.userId || participant.id;
        if (!participantsMap.has(key) || !response.isAnonymous) {
          participantsMap.set(key, participant);
        }
      }

      const uniqueParticipants = Array.from(participantsMap.values());

      // Mettre à jour le store global
      const users = uniqueParticipants
        .map(p => p.user)
        .filter((u): u is NonNullable<typeof u> => Boolean(u));

      userStore.setParticipants(users as any[]);
      setParticipants(uniqueParticipants);
    } catch (error) {
      console.error('[useParticipants] ❌ Erreur chargement participants:', error);
      setParticipants([]);
    } finally {
      setIsLoading(false);
    }
  }, [userStore]);

  return {
    participants,
    participantsRef,
    loadParticipants,
    isLoading,
  };
}
