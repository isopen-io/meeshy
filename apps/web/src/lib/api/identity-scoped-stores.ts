import type { StoreApi } from 'zustand/vanilla';

import type { ConversationStoreState } from '../conversation-store';
import type { OutboxState } from '../send/outbox-store';

import { sessionIdentityKey, type SessionStoreApi } from './session';
import type { TypingState } from './typing-store';
import type { EngagementState } from './conversation-engagement';

/**
 * LES MAGASINS EN MÉMOIRE QUI APPARTIENNENT À UNE IDENTITÉ (#8674).
 *
 * Le cache de requêtes est vidé et rangé au changement de compte
 * (`query-client.ts`) ; trois magasins vivaient À CÔTÉ de lui, indexés par
 * conversation et jamais par lecteur :
 *  - l'OUTBOX — les envois d'A en attente ou en échec, avec leur texte : sous
 *    B, dans une conversation qu'ils partagent, ils s'affichaient comme des
 *    bulles de B, et « Réessayer » les aurait PUBLIÉS au nom de B ;
 *  - les OVERRIDES de rangée — épingles, sourdines, archives et non-lus
 *    optimistes d'A, appliqués aux rangées de B ;
 *  - la FRAPPE en cours, reçue sur la connexion d'A ;
 *  - les POINTS d'engagement d'A par conversation (#8906), qui sont À LUI.
 * Ils se vident dès que l'identité change, dans la même notification
 * synchrone que le cache : aucun écran de B ne les voit.
 */
export type IdentityScopedStores = {
  readonly session: SessionStoreApi;
  readonly outbox: StoreApi<OutboxState>;
  readonly conversations: StoreApi<ConversationStoreState>;
  readonly typing: StoreApi<TypingState>;
  readonly engagement?: StoreApi<EngagementState>;
};

export function resetIdentityScopedStores({ outbox, conversations, typing, engagement }: Omit<IdentityScopedStores, 'session'>): void {
  outbox.setState({ entries: {}, confirmed: {} });
  conversations.setState({ overrides: {} });
  typing.setState({ byConversation: {} });
  engagement?.getState().clear();
}

export function watchIdentityScopedStores(stores: IdentityScopedStores): () => void {
  let last = sessionIdentityKey(stores.session.getState().session);
  return stores.session.subscribe((state) => {
    const identity = sessionIdentityKey(state.session);
    if (identity === last) return;
    last = identity;
    resetIdentityScopedStores(stores);
  });
}
