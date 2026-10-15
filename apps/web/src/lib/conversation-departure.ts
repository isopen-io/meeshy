import { createStore } from 'zustand/vanilla';

import type { Conversation } from './api/types';

/**
 * **QUITTER OU SUPPRIMER UNE CONVERSATION** (#7285, #7837) — la DEMANDE en
 * cours et l'ÉCHEC à dire, tenus hors de tout écran : le menu d'une ligne et
 * la feuille de détails demandent, l'hôte de la coquille
 * (`components/conversation-departure-host.tsx`, chargé à la demande)
 * confirme, agit et dit l'issue — une seule confirmation montée, même quand
 * la liste et le fil sont côte à côte.
 *
 * Les deux gestes ne se valent pas, comme sur iOS : QUITTER se rejoue (on
 * peut être réinvité, l'historique reste lisible — `POST …/leave`) ;
 * SUPPRIMER POUR MOI retire la conversation de sa liste
 * (`DELETE …/delete-for-me`). D'où deux confirmations distinctes.
 */
export type DepartureKind = 'leave' | 'delete';

export type DepartureRequest = {
  readonly conversationId: string;
  readonly kind: DepartureKind;
  /** Vrai depuis le fil : la conversation quittée n'a plus d'écran où rester. */
  readonly returnToList: boolean;
};

export type DepartureFailure = { readonly kind: DepartureKind; readonly offline: boolean };

type DepartureState = {
  readonly request: DepartureRequest | null;
  readonly failure: DepartureFailure | null;
};

export const departureStore = createStore<DepartureState>(() => ({ request: null, failure: null }));

export function requestDeparture(request: DepartureRequest): void {
  departureStore.setState({ request, failure: null });
}

export function cancelDeparture(): void {
  departureStore.setState({ request: null });
}

export function failDeparture(failure: DepartureFailure): void {
  departureStore.setState({ failure });
}

export function dismissDepartureFailure(): void {
  departureStore.setState({ failure: null });
}

/**
 * LES GESTES OFFERTS — la loi de `ConversationPreferencesTab.swift` : « Quitter
 * le groupe » hors conversation directe (un direct n'a personne à qui
 * survivre), « Supprimer pour moi » partout. Le créateur part aussi : la
 * passerelle désigne son héritier (`creatorSuccession.ts`, #4058).
 */
export function departureKindsOf(conversation: Pick<Conversation, 'type'>): readonly DepartureKind[] {
  return conversation.type === 'direct' ? ['delete'] : ['leave', 'delete'];
}
