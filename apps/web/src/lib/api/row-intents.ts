import { conversationStore } from '@/lib/conversation-store';

import { performPreferenceAction } from './conversation-actions';
import type { ConversationBlockIntent } from './conversation-block';
import { apiDeps } from './deps';
import type { FriendActionOutcome } from './friend-actions';
import type { ConversationPreferencePatch } from './preferences';
import { appQueryClient } from './query-client';
import type { Conversation } from './types';

/**
 * LES GESTES DU MENU D'UNE LIGNE, LIÉS AUX INSTANCES PARTAGÉES (#10593) —
 * motif `rowAction` (`query.ts`) : des références de MODULE, stables par
 * construction, que l'écran de la liste appelle sans rien recréer.
 */
const rowDeps = () => ({ ...apiDeps, store: conversationStore, queryClient: appQueryClient });

export function rowPreferenceAction(conversationId: string, patch: ConversationPreferencePatch): void {
  void performPreferenceAction({ conversationId, patch, deps: rowDeps() });
}

/** Le geste de blocage se charge AU GESTE : il emporte le port de l'annuaire
 * et `zod`, que la liste n'a pas à télécharger pour s'afficher. */
export async function rowBlockAction(params: {
  readonly conversation: Conversation;
  readonly viewerId: string;
  readonly intent: ConversationBlockIntent;
}): Promise<FriendActionOutcome> {
  const { viewerId } = params;
  const { performConversationBlock } = await import('./conversation-block');
  return performConversationBlock({
    ...params,
    deps: { ...rowDeps(), isOnline: () => navigator.onLine, viewerId: () => viewerId },
  });
}
