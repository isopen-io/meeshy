'use client';

import { useMemo } from 'react';
import type { Conversation, User, Message } from '@meeshy/shared/types';
import { getLanguageFlag } from '@/utils/language-utils';

export type LanguageStats = {
  language: string;
  flag: string;
  count: number;
  color: string;
};

/**
 * Hook for calculating language statistics from messages and participants
 * Used for sidebar language indicators
 */
export function useConversationStats(
  conversation: Conversation,
  messages: Message[],
  currentUser: User
) {
  // Use primitive dependencies to avoid infinite loops
  const messagesLength = messages?.length || 0;
  const participantsLength = conversation.participants?.length || 0;
  const currentUserId = currentUser?.id || '';

  // Memoize message language statistics
  const messageLanguageStats = useMemo(() => {
    if (!messages || messages.length === 0) return [];

    const messagesPerLanguage: Record<string, number> = {};
    messages.forEach(message => {
      const lang = message.originalLanguage || 'fr';
      messagesPerLanguage[lang] = (messagesPerLanguage[lang] || 0) + 1;
    });

    return Object.entries(messagesPerLanguage)
      .map(([language, count], index) => ({
        language,
        flag: getLanguageFlag(language),
        count,
        color: `hsl(${(index * 137.5) % 360}, 50%, 50%)`
      }))
      .filter(stat => stat.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [messages, messagesLength]);

  // Memoize active language statistics
  const activeLanguageStats = useMemo(() => {
    if (!conversation.participants || conversation.participants.length === 0) return [];

    const userLanguages: { [key: string]: Set<string> } = {};

    conversation.participants.forEach(participant => {
      const participantUser = (participant as any).user;
      const lang = participantUser?.systemLanguage || 'fr';
      if (!userLanguages[lang]) {
        userLanguages[lang] = new Set();
      }
      userLanguages[lang].add(participant.userId);
    });

    return Object.entries(userLanguages)
      .map(([code, users], index) => ({
        language: code,
        flag: getLanguageFlag(code),
        count: users.size,
        color: `hsl(${(index * 137.5) % 360}, 50%, 50%)`
      }))
      .filter(stat => stat.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [conversation.participants, participantsLength]);

  // Memoize active users
  const activeUsers = useMemo(() => {
    if (!conversation.participants || conversation.participants.length === 0) return [];

    const activeParticipants = conversation.participants
      .filter(p => {
        const pUser = (p as any).user;
        return pUser && (pUser.isOnline || p.userId === currentUserId);
      })
      .map(p => (p as any).user)
      .filter(Boolean) as User[];

    // Ensure current user is in the list
    const hasCurrentUser = activeParticipants.find(u => u.id === currentUserId);
    return hasCurrentUser
      ? activeParticipants
      : [currentUser, ...activeParticipants];
  }, [conversation.participants, participantsLength, currentUser, currentUserId]);

  return {
    messageLanguageStats,
    activeLanguageStats,
    activeUsers,
  };
}
