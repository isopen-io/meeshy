import type { QueryClient } from '@tanstack/react-query';
import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';

import type { ApiResult, HttpRequest } from './http';
import { findCachedThreadMessage } from './messages';

/**
 * ÉPINGLER / DÉTACHER UN MESSAGE (#7558) — `PUT` / `DELETE` sur
 * `conversations.byIdMessagesByMessageIdPin`, les routes d'iOS
 * (`ConversationViewModel.togglePin`).
 *
 * OPTIMISTE : l'épingle se pose (ou part) avant l'aller-retour, par l'écriture
 * du puits temps réel (`realtime-message-pin.ts`, chargé en `import()` : il vit
 * dans le morceau `realtime`). Un refus ou une coupure REND l'épingle d'avant —
 * mais seulement si la rangée porte encore celle que le geste a posée : un
 * `message:pinned` reçu pendant le vol a dit plus juste que l'instantané.
 *
 * Un transport qui lève est une coupure, jamais une promesse rejetée : le
 * geste part d'un clic, personne n'attend sa promesse pour l'attraper.
 */
export type PinGestureOutcome = 'done' | 'offline' | 'failed';

type Transport = { readonly request: <T>(request: HttpRequest) => Promise<ApiResult<T>> };

export async function performPinGesture(params: {
  readonly queryClient: QueryClient;
  readonly conversationId: string;
  readonly messageId: string;
  readonly on: boolean;
  readonly viewerId: string;
  readonly transport: Transport;
  readonly now?: Date;
}): Promise<PinGestureOutcome> {
  const { queryClient, conversationId, messageId, on, viewerId, transport } = params;
  const { applyMessagePin, pinOf, samePin } = await import('./realtime-message-pin');

  const before = pinOf(findCachedThreadMessage(queryClient, conversationId, messageId));
  const placed = on ? { pinnedAt: params.now ?? new Date(), pinnedBy: viewerId } : null;
  applyMessagePin(queryClient, { conversationId, messageId, pin: placed });

  const result = await transport
    .request<unknown>({ method: on ? 'PUT' : 'DELETE', path: conversationsEndpoints.byIdMessagesByMessageIdPin(conversationId, messageId) })
    .catch(() => null);
  if (result !== null && result.ok) return 'done';

  if (samePin(pinOf(findCachedThreadMessage(queryClient, conversationId, messageId)), placed)) {
    applyMessagePin(queryClient, { conversationId, messageId, pin: before });
  }
  return result === null || result.status === 0 ? 'offline' : 'failed';
}
