import { useCallback, useSyncExternalStore } from 'react';

import type { DraftStore } from '@/lib/send/draft-store';

/**
 * LE BROUILLON, VU DE LA LIGNE DE LISTE (#7547) — le TEXTE du brouillon de
 * cette conversation, ou `null` quand il n'y a rien à montrer (aucun
 * brouillon, ou un brouillon sans texte : une réponse ou une protection
 * armée ne font pas « Brouillon : … »).
 *
 * `useSyncExternalStore` compare la CHAÎNE rendue : une écriture sur une autre
 * conversation, ou une réécriture du même texte, ne re-rend pas la ligne — la
 * liste entière ne se repeint jamais pour la frappe d'un seul fil.
 */
export function useDraftLine(params: {
  readonly store: DraftStore;
  readonly scope: string;
  readonly conversationId: string;
}): string | null {
  const { store, scope, conversationId } = params;

  const subscribe = useCallback(
    (onChange: () => void) =>
      store.subscribe((touchedScope, touchedConversation) => {
        if (touchedScope === scope && touchedConversation === conversationId) onChange();
      }),
    [store, scope, conversationId],
  );

  const snapshot = useCallback((): string | null => {
    const text = store.getDraft(scope, conversationId)?.text.trim() ?? '';
    return text === '' ? null : text;
  }, [store, scope, conversationId]);

  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
