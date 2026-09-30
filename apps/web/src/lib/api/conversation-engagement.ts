import { createStore, type StoreApi } from 'zustand/vanilla';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import {
  isConversationEngagementSnapshot,
  type ConversationEngagementSnapshot,
} from '@meeshy/shared/types/engagement-scale';

import type { SocketClient } from '@/lib/net/socket';

/**
 * « N (M) 🔥 » — L'ÉTAT D'ENGAGEMENT D'UNE CONVERSATION POUR SON LECTEUR (#8906).
 *
 * DEUX SOURCES, UNE LOI. La liste et le détail servent `viewerEngagement` sur
 * chaque conversation (absent = aucun point encore) ; la passerelle pousse
 * `engagement:conversation-updated` au SEUL lecteur crédité, après chaque geste
 * compté. Le serveur prime : une réaction ou un envoi local n'ajoute RIEN ici
 * avant son événement. Le magasin garde les instantanés reçus en direct, par conversation ;
 * la vue retient le plus RÉCENT des deux (`freshestEngagement`) — jamais un
 * nombre fabriqué ici : multiplicateur et plafonds sont l'affaire du serveur.
 *
 * Toute charge passe la garde partagée (`isConversationEngagementSnapshot`) :
 * une forme inattendue est ignorée ENTIÈRE, jamais peinte à moitié.
 */

export type EngagementState = {
  readonly byConversation: Readonly<Record<string, ConversationEngagementSnapshot>>;
  apply(snapshot: ConversationEngagementSnapshot): void;
  clear(): void;
};

export type EngagementStoreApi = StoreApi<EngagementState>;

/**
 * Le plus récent de deux instantanés d'une même conversation. Les points
 * cumulés ne décroissent jamais et le jour avance : le jour le plus tardif
 * gagne, puis le total le plus haut ; à égalité, le second (le plus neuf reçu).
 */
export function freshestEngagement(
  a: ConversationEngagementSnapshot | undefined,
  b: ConversationEngagementSnapshot | undefined,
): ConversationEngagementSnapshot | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  const dayA = a.day ?? '';
  const dayB = b.day ?? '';
  if (dayA !== dayB) return dayA > dayB ? a : b;
  return a.totalPoints > b.totalPoints ? a : b;
}

export function createEngagementStore(): EngagementStoreApi {
  return createStore<EngagementState>((set) => ({
    byConversation: {},
    apply: (snapshot) =>
      set((state) => {
        const current = state.byConversation[snapshot.conversationId];
        if (freshestEngagement(current, snapshot) !== snapshot) return state;
        return { byConversation: { ...state.byConversation, [snapshot.conversationId]: snapshot } };
      }),
    clear: () => set((state) => (Object.keys(state.byConversation).length === 0 ? state : { byConversation: {} })),
  }));
}

export const engagementStore: EngagementStoreApi = createEngagementStore();

/**
 * L'instantané SERVI sur une conversation de liste ou de détail — validé, ou
 * rien. `viewerEngagement` n'est pas (encore) déclaré par le type partagé
 * `Conversation` : il se lit donc par `in`, en `unknown`, puis passe la garde.
 */
export function servedEngagementOf(conversation: { readonly id: string }): ConversationEngagementSnapshot | undefined {
  if (!('viewerEngagement' in conversation)) return undefined;
  const raw = conversation.viewerEngagement;
  if (!isConversationEngagementSnapshot(raw) || raw.conversationId !== conversation.id) return undefined;
  return raw;
}

/** Ce que la vue affiche : le servi et le reçu en direct, le plus récent des deux. */
export function effectiveEngagementOf(
  state: Pick<EngagementState, 'byConversation'>,
  conversation: { readonly id: string },
): ConversationEngagementSnapshot | undefined {
  return freshestEngagement(servedEngagementOf(conversation), state.byConversation[conversation.id]);
}

/** Branche l'événement serveur sur le magasin ; rend le débranchement. */
export function bindConversationEngagement(params: {
  readonly socket: SocketClient;
  readonly store: EngagementStoreApi;
}): () => void {
  const { socket, store } = params;
  const onUpdated = (payload: unknown): void => {
    if (!isConversationEngagementSnapshot(payload)) return;
    store.getState().apply(payload);
  };
  socket.on(SERVER_EVENTS.ENGAGEMENT_CONVERSATION_UPDATED, onUpdated);
  return () => socket.off(SERVER_EVENTS.ENGAGEMENT_CONVERSATION_UPDATED, onUpdated);
}
