'use client';

import { useState, useEffect, useMemo } from 'react';
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
  const [messageLanguageStats, setMessageLanguageStats] = useState<LanguageStats[]>([]);
  const [activeLanguageStats, setActiveLanguageStats] = useState<LanguageStats[]>([]);
  const [activeUsers, setActiveUsers] = useState<User[]>([]);

  useEffect(() => {
    // Calculate message language statistics
    const messagesPerLanguage: Record<string, number> = {};
    messages.forEach(message => {
      const lang = message.originalLanguage || 'fr';
      messagesPerLanguage[lang] = (messagesPerLanguage[lang] || 0) + 1;
    });

    const messageStats: LanguageStats[] = Object.entries(messagesPerLanguage)
      .map(([language, count], index) => ({
        language,
        flag: getLanguageFlag(language),
        count,
        color: `hsl(${(index * 137.5) % 360}, 50%, 50%)`
      }))
      .filter(stat => stat.count > 0)
      .sort((a, b) => b.count - a.count);

    setMessageLanguageStats(messageStats);

    // Calculate participant language statistics
    if (conversation.participants && conversation.participants.length > 0) {
      const userLanguages: { [key: string]: Set<string> } = {};

      conversation.participants.forEach(participant => {
        const participantUser = (participant as any).user;
        const lang = participantUser?.systemLanguage || 'fr';
        if (!userLanguages[lang]) {
          userLanguages[lang] = new Set();
        }
        userLanguages[lang].add(participant.userId);
      });

      const userStats: LanguageStats[] = Object.entries(userLanguages)
        .map(([code, users], index) => ({
          language: code,
          flag: getLanguageFlag(code),
          count: users.size,
          color: `hsl(${(index * 137.5) % 360}, 50%, 50%)`
        }))
        .filter(stat => stat.count > 0)
        .sort((a, b) => b.count - a.count);

      setActiveLanguageStats(userStats);

      // Calculate active users - always include current user
      const activeParticipants = conversation.participants
        .filter(p => {
          const pUser = (p as any).user;
          return pUser && (pUser.isOnline || p.userId === currentUser.id);
        })
        .map(p => (p as any).user)
        .filter(Boolean) as User[];

      // Ensure current user is in the list
      const hasCurrentUser = activeParticipants.find(u => u.id === currentUser.id);
      const finalActiveUsers = hasCurrentUser
        ? activeParticipants
        : [currentUser, ...activeParticipants];

      setActiveUsers(finalActiveUsers);
    }
  }, [conversation.participants, messages, currentUser.id]);

  return {
    messageLanguageStats,
    activeLanguageStats,
    activeUsers,
  };
}
