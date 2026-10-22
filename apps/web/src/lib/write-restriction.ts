import { createStore, type StoreApi } from 'zustand/vanilla';

import type { ViewerWriteRestriction } from '@meeshy/shared/types/conversation';

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
 * Une valeur inconnue ne restreint rien : le serveur refuse de toute façon.
 */
export type WriteRestriction = ViewerWriteRestriction | 'end-to-end-encrypted';

export const GLOBAL_ADULTS_ONLY = 'GLOBAL_ADULTS_ONLY';

/**
 * #11216 — la passerelle refuse tout texte en clair dans une conversation
 * chiffrée de bout en bout (`E2EE_PLAINTEXT_REFUSED`), et le web ne chiffre
 * pas : le composeur s'y efface au lieu d'échouer à chaque envoi. Les modes
 * `server` et `hybrid` restent ouverts — la passerelle y chiffre elle-même.
 */
export const E2EE_PLAINTEXT_REFUSED = 'E2EE_PLAINTEXT_REFUSED';

const isEndToEnd = (conversation: Conversation | undefined): boolean =>
  typeof conversation?.encryptionMode === 'string' && conversation.encryptionMode.toLowerCase() === 'e2ee';

export function servedWriteRestriction(conversation: Conversation | undefined): WriteRestriction | null {
  if (conversation?.viewerWriteRestriction === 'minor-global') return 'minor-global';
  return isEndToEnd(conversation) ? 'end-to-end-encrypted' : null;
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
