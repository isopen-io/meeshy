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
 *
 * RENDRE OBSOLÈTE (#14645) est le troisième geste, celui d'un administrateur
 * de la conversation (`DELETE …/obsolete`, #14643) : elle quitte la liste de
 * TOUS, son contenu devient illisible et il est effacé sous 48 h.
 */
export type DepartureKind = 'leave' | 'delete' | 'obsolete';

export type DepartureRequest = {
  readonly conversationId: string;
  readonly kind: DepartureKind;
  /** Vrai depuis le fil : la conversation quittée n'a plus d'écran où rester. */
  readonly returnToList: boolean;
};

/**
 * `requestSender` (#14690) : la passerelle a refusé de rendre obsolète un
 * tête-à-tête — le lecteur y est l'expéditeur d'une demande que l'autre n'a
 * pas acceptée, la seule porte qu'un membre d'une directe ouverte se voit
 * fermer (`DELETE …/obsolete`, 403).
 */
export type DepartureFailure = { readonly kind: DepartureKind; readonly offline: boolean; readonly refusal?: 'requestSender' };

type DepartureState = {
  readonly request: DepartureRequest | null;
  readonly failure: DepartureFailure | null;
  /**
   * LES REFUS RETENUS (#14690) — les conversations où la passerelle a refusé
   * « Rendre obsolète » : la passerelle ne sert pas à l'expéditeur d'une
   * demande qu'elle est en attente, son refus est le seul signal. Le geste ne
   * se repropose plus pour elles, ni au menu, ni au balayage, ni à la fiche,
   * jusqu'au prochain chargement de l'application.
   */
  readonly obsoleteRefused: readonly string[];
};

export const departureStore = createStore<DepartureState>(() => ({ request: null, failure: null, obsoleteRefused: [] }));

export function markObsoleteRefused(conversationId: string): void {
  const { obsoleteRefused } = departureStore.getState();
  if (obsoleteRefused.includes(conversationId)) return;
  departureStore.setState({ obsoleteRefused: [...obsoleteRefused, conversationId] });
}

export function isObsoleteRefused(conversationId: string | undefined): boolean {
  return conversationId !== undefined && departureStore.getState().obsoleteRefused.includes(conversationId);
}

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
