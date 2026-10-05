import { lazy, Suspense, useLayoutEffect } from 'react';
import { useStore } from 'zustand/react';

import { ThreadSkeleton } from '@/components/thread-states';
import { closeConversationPreview, conversationPreviewStore } from '@/lib/notifications/conversation-preview';
import { routeKey, useRoute } from '@/lib/router';

import { loadThreadScreen } from './conversation-preview-chunks';
import { ConversationPreviewSheet } from './conversation-preview-sheet';

/**
 * **L'HÔTE DE L'APERÇU DE CONVERSATION** (#8821) — monté par la coquille tant
 * qu'une conversation est ouverte en aperçu (`conversationPreviewStore`), comme
 * iOS présente la sienne depuis la racine.
 *
 * Il pose LE fil (`routes/thread.tsx`, `preview`) : une seule source pour
 * l'en-tête, la liste, le défilement et le composeur — aucune jumelle qui
 * divergerait. Le fil lit son cache d'abord (`useThreadData`) : une
 * conversation déjà ouverte s'affiche sans squelette.
 *
 * Il se referme quand l'adresse change — « Ouvrir la conversation » mène au
 * fil complet, et l'aperçu laissé ouvert le recouvrirait (même règle que
 * `profile-peek-host.tsx`, en effet de MISE EN PAGE pour ne pas survivre une
 * image).
 */
const LazyThreadScreen = lazy(loadThreadScreen);

export function ConversationPreviewHost() {
  const conversationId = useStore(conversationPreviewStore, (state) => state.conversationId);
  const address = routeKey(useRoute());

  useLayoutEffect(() => closeConversationPreview, [address]);

  if (conversationId === null) return null;
  return (
    <ConversationPreviewSheet key={conversationId} conversationId={conversationId} onClose={closeConversationPreview}>
      <Suspense fallback={<ThreadSkeleton preview />}>
        <LazyThreadScreen preview={{ conversationId }} />
      </Suspense>
    </ConversationPreviewSheet>
  );
}
