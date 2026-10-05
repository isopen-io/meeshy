import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { MessagesPage, MessagesPageParam } from './messages-pages';
import type { Message } from './types';

/**
 * LE CACHE DE L'INDEX D'UNE CONVERSATION, SANS L'INDEX (#8180) — la clé et
 * la réécriture, dans un module SANS dépendance d'exécution : la visionneuse
 * (`viewer-media-actions`, via `attachment-reaction.ts`) y écrit une réaction
 * sans tirer le port de l'écran des médias (`conversation-media-hub.ts`,
 * chargé à la demande — `budgets.json › conversation_media_hub.dynamic_only`).
 *
 * Hors de `['conversations', …]` : ce préfixe porte des conversations et des
 * fils, parcourus comme tels.
 */
export const mediaHubConversationKey = (conversationId: string) => ['conversation-media-hub', conversationId] as const;

/**
 * Le jumeau de `patchThreadMessages` pour l'écran des médias : un geste posé
 * depuis la visionneuse de l'écran (réagir à une pièce) se relit dans l'index
 * d'où elle a été ouverte, sur chaque segment et chaque recherche en cache.
 */
export function patchMediaHubMessages(
  queryClient: QueryClient,
  conversationId: string,
  updater: (messages: readonly Message[]) => readonly Message[],
): void {
  queryClient.setQueriesData<InfiniteData<MessagesPage, MessagesPageParam>>(
    { queryKey: mediaHubConversationKey(conversationId) },
    (data) => {
      if (data === undefined || !Array.isArray(data.pages)) return data;
      return { ...data, pages: data.pages.map((page) => ({ ...page, messages: updater(page.messages) })) };
    },
  );
}
