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
import type { ThreadMember, UserRoleEnum } from '@meeshy/shared/types';

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
  participants: ThreadMember[];

  /**
   * Ref stable vers les participants
   */
  participantsRef: React.RefObject<ThreadMember[]>;

  /**
   * Charge les participants d'une conversation
   */
  loadParticipants: (conversationId: string) => Promise<void>;

  /**
   * Indique si le chargement est en cours
   */
  isLoading: boolean;
}

/**
 * Hook pour gérer les participants d'une conversation
 */
export function useParticipants({ conversationId }: UseParticipantsOptions): UseParticipantsReturn {
  const [participants, setParticipants] = useState<ThreadMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const participantsRef = useRef<ThreadMember[]>([]);
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

      // Mapper les participants authentifiés
      const authenticatedMembers: ThreadMember[] = participantsData.authenticatedParticipants.map(user => ({
        id: user.id,
        conversationId: convId,
        userId: user.id,
        user,
        role: user.role as UserRoleEnum,
        joinedAt: new Date(),
        isActive: true,
        isAnonymous: false,
      }));

      // Mapper les participants anonymes
      const anonymousMembers: ThreadMember[] = participantsData.anonymousParticipants.map(participant => ({
        id: participant.id,
        conversationId: convId,
        userId: participant.id,
        user: {
          ...participant,
          displayName: participant.username,
          email: '',
          phoneNumber: '',
          isOnline: false,
          lastActiveAt: new Date(),
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          role: 'USER' as const,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          autoTranslateEnabled: true,
          translateToSystemLanguage: true,
          translateToRegionalLanguage: false,
          useCustomDestination: false,
          keepOriginalMessages: true,
          translationQuality: 'medium',
        },
        role: 'MEMBER' as UserRoleEnum,
        joinedAt: new Date(),
        isActive: true,
        isAnonymous: true,
      }));

      // Déduplication avec Map (js-index-maps)
      // Priorité aux participants authentifiés
      const participantsMap = new Map<string, ThreadMember>();

      // D'abord les anonymes
      for (const p of anonymousMembers) {
        participantsMap.set(p.userId, p);
      }

      // Puis les authentifiés (écrasent les anonymes si même ID)
      for (const p of authenticatedMembers) {
        participantsMap.set(p.userId, p);
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
