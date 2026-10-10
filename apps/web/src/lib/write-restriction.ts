import { createStore, type StoreApi } from 'zustand/vanilla';

import type { Conversation } from '@/lib/api/types';
import type { OutboxState } from '@/lib/send/outbox-store';

/**
 * **LA RESTRICTION D'ÉCRITURE DU LECTEUR** (#9928, contrat #9927) — la
 * passerelle la CALCULE depuis l'âge déclaré et la sert sur chaque
 * conversation (`viewerWriteRestriction: 'minor-global' | null`) : de 13 à
 * 17 ans, Meeshy Global se lit sans s'écrire. Le client ne compare aucune
 * date ; il lit ce qui est servi, et apprend d'un refus `GLOBAL_ADULTS_ONLY`
 * ce qu'un cache périmé ne disait pas encore.
 *
 * `Conversation` (partagé) ne déclare pas encore le champ — le lot passerelle
 * porte le type —, d'où la lecture par `in` : aucune assertion, et une valeur
 * inconnue ne restreint rien (le serveur refuse de toute façon).
 */
export type WriteRestriction = 'minor-global';

export const GLOBAL_ADULTS_ONLY = 'GLOBAL_ADULTS_ONLY';

export function servedWriteRestriction(conversation: Conversation | undefined): WriteRestriction | null {
  if (conversation === undefined || !('viewerWriteRestriction' in conversation)) return null;
  return conversation.viewerWriteRestriction === 'minor-global' ? 'minor-global' : null;
}

/** Les conversations qu'un refus a fermées pendant CETTE session — mémoire seule. */
export type WriteRestrictionState = {
  readonly learned: Readonly<Record<string, WriteRestriction>>;
  learn(conversationId: string): void;
};

export const createWriteRestrictionStore = (): StoreApi<WriteRestrictionState> =>
  createStore<WriteRestrictionState>((set) => ({
    learned: {},
    learn: (conversationId) =>
      set((state) =>
        state.learned[conversationId] === 'minor-global' ? state : { learned: { ...state.learned, [conversationId]: 'minor-global' } },
      ),
  }));

export const writeRestrictionStore = createWriteRestrictionStore();

export function writeRestrictionOf(
  conversation: Conversation | undefined,
  learned: WriteRestrictionState['learned'],
): WriteRestriction | null {
  const served = servedWriteRestriction(conversation);
  if (served !== null || conversation === undefined) return served;
  return learned[conversation.id] ?? null;
}

/**
 * Retire de l'outbox les envois que Global a refusés à un mineur — sans les
 * compter confirmés : la bulle optimiste quitte le fil, et son « Réessayer »
 * avec elle, qui ne pourrait que se faire refuser encore. Rend leur nombre.
 */
export function dropGlobalRefusals(outbox: StoreApi<OutboxState>, conversationId: string): number {
  const refused = (outbox.getState().entries[conversationId] ?? []).filter((entry) => entry.lastError?.code === GLOBAL_ADULTS_ONLY);
  refused.forEach((entry) => outbox.getState().discard(conversationId, entry.message.clientMessageId));
  return refused.length;
}
