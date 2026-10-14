import type { QueryClient } from '@tanstack/react-query';
import type { MessagePinnedEventData, MessageUnpinnedEventData } from '@meeshy/shared/types/socketio-events/message';

import { patchThreadMessages } from './messages';
import type { Message } from './types';

/**
 * LES PUITS DE `message:pinned` ET `message:unpinned` (#7558) — la passerelle
 * les diffuse à la salle de la conversation (`broadcastMessageMutation`,
 * `services/gateway/src/routes/conversations/messages-pin.ts`). La rangée du
 * fil prend ou perd son épingle, et le badge (`badgesOf`) suit sans
 * rechargement. Miroir iOS : `messagePersistence.updatePinned`.
 *
 * La MÊME écriture sert le geste local (`pin-message.ts`, qui la charge en
 * `import()` : ce module vit dans le morceau `realtime`, que le fil n'importe
 * jamais statiquement) — une épingle posée ici ou reçue d'ailleurs a une seule
 * forme dans le cache.
 *
 * L'épingle ABSENTE est une clé absente, jamais `null` : c'est la forme que
 * le décodeur sert (`dateFieldOf`, `decode.ts`) et que `badgesOf` lit.
 *
 * Aucune fuite inter-conversation : seule la rangée de la conversation que la
 * charge NOMME est touchée. Rejouée, l'écriture ne change rien — même
 * référence, aucun rendu.
 */
export type MessagePin = { readonly pinnedAt: Date; readonly pinnedBy: string } | null;

const isRecord = (payload: unknown): payload is Record<string, unknown> => typeof payload === 'object' && payload !== null;

export function isMessageUnpinnedEvent(payload: unknown): payload is MessageUnpinnedEventData {
  return isRecord(payload) && typeof payload.messageId === 'string' && typeof payload.conversationId === 'string';
}

export function isMessagePinnedEvent(payload: unknown): payload is MessagePinnedEventData {
  return (
    isMessageUnpinnedEvent(payload) &&
    isRecord(payload) &&
    typeof payload.pinnedBy === 'string' &&
    typeof payload.pinnedAt === 'string' &&
    !Number.isNaN(new Date(payload.pinnedAt).getTime())
  );
}

export const pinOf = (message: Pick<Message, 'pinnedAt' | 'pinnedBy'> | undefined): MessagePin =>
  message?.pinnedAt == null ? null : { pinnedAt: new Date(message.pinnedAt), pinnedBy: message.pinnedBy ?? '' };

export const samePin = (a: MessagePin, b: MessagePin): boolean =>
  a === null || b === null ? a === b : a.pinnedAt.getTime() === b.pinnedAt.getTime() && a.pinnedBy === b.pinnedBy;

const withPin = (message: Message, pin: MessagePin): Message => {
  if (samePin(pinOf(message), pin)) return message;
  if (pin === null) {
    const { pinnedAt: _pinnedAt, pinnedBy: _pinnedBy, ...rest } = message;
    return rest;
  }
  return { ...message, pinnedAt: pin.pinnedAt, pinnedBy: pin.pinnedBy };
};

export function applyMessagePin(
  queryClient: QueryClient,
  data: { readonly conversationId: string; readonly messageId: string; readonly pin: MessagePin },
): void {
  patchThreadMessages(queryClient, data.conversationId, (messages) =>
    messages.some((m) => m.id === data.messageId && m.conversationId === data.conversationId)
      ? messages.map((m) => (m.id === data.messageId && m.conversationId === data.conversationId ? withPin(m, data.pin) : m))
      : messages,
  );
}

export function applyMessagePinnedEvent(queryClient: QueryClient, data: MessagePinnedEventData): void {
  applyMessagePin(queryClient, {
    conversationId: data.conversationId,
    messageId: data.messageId,
    pin: { pinnedAt: new Date(data.pinnedAt), pinnedBy: data.pinnedBy },
  });
}

export function applyMessageUnpinnedEvent(queryClient: QueryClient, data: MessageUnpinnedEventData): void {
  applyMessagePin(queryClient, { conversationId: data.conversationId, messageId: data.messageId, pin: null });
}
