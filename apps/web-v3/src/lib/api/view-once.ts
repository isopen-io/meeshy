import type { Message } from './types';
import type { Transport } from '../net/transport';

/**
 * LE PORT SERVEUR DE LA CONSOMMATION D'UNE VUE UNIQUE (D-10, D-23, #5676).
 *
 * Route RÉELLE, lue et citée — aucune n'est inventée :
 *   `POST /api/v1/conversations/:id/messages/:messageId/consume`, SANS
 *   corps, `preValidation: [requiredAuth]`
 *   (`services/gateway/src/routes/conversations/messages-view-once.ts:34-73`).
 *   200 `{ success: true, data: { messageId, viewOnceCount, maxViewOnceCount,
 *   isFullyConsumed } }` (`:50-62`, `:172`).
 *
 * Le CÂBLAGE réseau réel (transport authentifié) appartient au lot `staging`
 * (#5493, seconde moitié) — ce fichier écrit la FORME de l'appel et le
 * RÉDUCTEUR pur qu'il branchera, même partition que `reading-mode/sync.ts`
 * pour D-10. `applyConsumption` sert AUSSI l'événement pair `message:consumed`
 * (mêmes champs, `MessageConsumedEventData`,
 * `packages/shared/types/socketio-events/message.ts:124-131`) : un seul
 * réducteur pour la réponse REST et l'événement socket.
 */
export type ViewOnceConsumption = {
  readonly messageId: string;
  readonly viewOnceCount: number;
  readonly maxViewOnceCount: number;
  readonly isFullyConsumed: boolean;
};

/** Compose la requête EXACTE de la route (`messages-view-once.ts:34-73`) : POST, sans corps. */
export function consumeViewOnce(
  transport: Transport,
  ids: { readonly conversationId: string; readonly messageId: string },
): Promise<unknown> {
  return transport({
    method: 'POST',
    path: `/api/v1/conversations/${ids.conversationId}/messages/${ids.messageId}/consume`,
  });
}

/**
 * Applique la consommation au fil — IMMUABLE : seul le message concerné
 * change de référence, les autres restent `toBe`-identiques (zéro re-rendu
 * inutile, la promesse `memo` de `focal-row.tsx`/`FocalRow`).
 */
export function applyConsumption(
  messages: readonly Message[],
  event: Pick<ViewOnceConsumption, 'messageId' | 'viewOnceCount'>,
): readonly Message[] {
  return messages.map((message) =>
    message.id === event.messageId ? { ...message, viewOnceCount: event.viewOnceCount } : message,
  );
}
