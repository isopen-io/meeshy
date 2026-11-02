/**
 * LE COMPTE DE NON-LUS SOUS LA FENÊTRE (#5774, travail 3/3) — miroir
 * `MessageListViewController.pendingUnreadCount` (:67, :2060-2075,
 * :710-717) : un message qui ENTRE dans le fil pendant que le lecteur n'est
 * PAS près du bas compte, SAUF s'il vient du lecteur lui-même (envoi propre
 * depuis l'historique). Le premier chargement (le SEED) ne compte jamais —
 * c'est un fil qui s'ouvre, pas un fil qui reçoit.
 *
 * Réducteur PUR, comme `scene/activity.ts` : cet écran lit le CACHE
 * (`threadData.messages`), jamais le transport — que l'entrée vienne d'un
 * re-fetch HTTP ou (demain, #5494) d'un `message:new` socket ne change rien
 * à cette loi.
 */

import { messageProtection } from '@meeshy/shared/utils/message-protection';

import type { Message } from '@/lib/api/types';
import { protectionOf } from '@/lib/reading-mode/protection';
import { endToEndSealed } from '@/lib/view/end-to-end-sealed';

export type UnreadBelowMessage = {
  readonly id: string;
  readonly senderId: string;
};

export type UnreadBelowState = {
  readonly count: number;
  readonly lastUnreadId: string | null;
  /** Les identifiants déjà vus — un même id revu (re-fetch identique) ne recompte jamais. */
  readonly seenIds: ReadonlySet<string>;
};

export const initialUnreadBelowState = (): UnreadBelowState => ({
  count: 0,
  lastUnreadId: null,
  seenIds: new Set(),
});

export type UnreadBelowEvent =
  | { readonly type: 'messages'; readonly messages: readonly UnreadBelowMessage[]; readonly viewerId: string; readonly nearBottom: boolean }
  | { readonly type: 'near-bottom' }
  | { readonly type: 'reset' };

export function reduceUnreadBelow(state: UnreadBelowState, event: UnreadBelowEvent): UnreadBelowState {
  switch (event.type) {
    case 'near-bottom':
    case 'reset':
      return state.count === 0 && state.lastUnreadId === null ? state : { ...state, count: 0, lastUnreadId: null };

    case 'messages': {
      const isFirstSnapshot = state.seenIds.size === 0;
      const newOnes = event.messages.filter((m) => !state.seenIds.has(m.id));
      const nextSeen = newOnes.length === 0 ? state.seenIds : new Set([...state.seenIds, ...newOnes.map((m) => m.id)]);

      if (isFirstSnapshot || newOnes.length === 0) {
        return nextSeen === state.seenIds ? state : { ...state, seenIds: nextSeen };
      }

      if (event.nearBottom) {
        return { count: 0, lastUnreadId: null, seenIds: nextSeen };
      }

      const fromOthers = newOnes.filter((m) => m.senderId !== event.viewerId);
      if (fromOthers.length === 0) return { ...state, seenIds: nextSeen };

      const mostRecent = fromOthers[fromOthers.length - 1];
      return {
        count: state.count + fromOthers.length,
        lastUnreadId: mostRecent?.id ?? state.lastUnreadId,
        seenIds: nextSeen,
      };
    }
  }
}

/**
 * LE TEXTE DU BOUTON « REVENIR EN BAS » (#12983, #12993) — le texte servi par
 * le Prisme, sauf pour un message dont la bulle ne montre pas le texte :
 * - scellé de bout en bout : le web n'en tient que le littéral `[Encrypted]`
 *   (même loi que le fil, `endToEndSealed`) ;
 * - protégé : la passerelle sert aux membres le texte d'une vue unique ou
 *   d'un message flouté pour que le client le VOILE. Le bouton se tait dès
 *   que `protectionOf` (la loi que la bulle consomme) n'est pas `standard`,
 *   ou que les drapeaux d'effet déclarent une vue unique ou un flou
 *   (`messageProtection`, fail-closed sur une charge qui ne pose que
 *   `effectFlags`).
 */
export type UnreadPreviewMessage = Pick<
  Message,
  'isEncrypted' | 'encryptionMode' | 'deletedAt' | 'isViewOnce' | 'viewOnceCount' | 'isBlurred' | 'expiresAt' | 'effectFlags'
> & { readonly ephemeralDuration?: number };

export function unreadPreviewText(
  message: UnreadPreviewMessage | undefined,
  servedText: string | undefined,
  now: number,
): string | null {
  if (message === undefined || endToEndSealed(message)) return null;
  if (protectionOf(message, now) !== 'standard') return null;
  const declared = messageProtection(message);
  if (declared.viewOnce || declared.blurred) return null;
  return servedText ?? null;
}
