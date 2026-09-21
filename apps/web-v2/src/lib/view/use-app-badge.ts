import { useEffect } from 'react';

import type { Conversation } from '@/lib/api/types';
import { useConversationsSnapshot } from '@/lib/api/query';

/**
 * Compte le nombre de conversations non lues
 * D-L1: le badge compte les conversations non lues, hors muettes
 */
export function countUnreadConversations(conversations: readonly Conversation[] | undefined): number {
  if (!conversations) return 0;
  return conversations.filter(c => c.unreadCount && c.unreadCount > 0).length;
}

/**
 * Met a jour le badge de l'icone et le titre du document
 * - navigator.setAppBadge(n) quand n > 0
 * - navigator.clearAppBadge() quand n = 0
 * - document.title prefixe avec (n) quand n > 0
 */
export function updateAppBadge(
  count: number,
  nav?: typeof navigator,
  doc?: Document,
): void {
  const navigator = nav ?? globalThis.navigator;
  const document = doc ?? globalThis.document;

  // Mettre a jour le badge du navigateur
  try {
    if (count > 0) {
      if ('setAppBadge' in navigator) {
        (navigator as any).setAppBadge(count);
      }
    } else {
      if ('clearAppBadge' in navigator) {
        (navigator as any).clearAppBadge();
      }
    }
  } catch (e) {
    // setAppBadge/clearAppBadge ne sont pas supportes sur toutes les plates-formes
  }

  // Mettre a jour le titre du document
  try {
    const currentTitle = document.title;
    const match = currentTitle.match(/^\((\d+)\)\s+/);
    const baseTitle = match ? currentTitle.slice(match[0].length) : currentTitle;

    if (count > 0) {
      document.title = `(${count}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
  } catch (e) {
    // document.title peut ne pas etre modifiable
  }
}

/**
 * Hook pour mettre a jour le badge de l'icone et le titre du document
 * en fonction du nombre de conversations non lues.
 *
 * Derive du cache des conversations et met a jour en temps reel quand
 * le cache change (via conversation:unread-updated ou autre).
 */
export function useAppBadge(): void {
  const conversations = useConversationsSnapshot();

  useEffect(() => {
    const count = countUnreadConversations(conversations);
    updateAppBadge(count);
  }, [conversations]);
}
