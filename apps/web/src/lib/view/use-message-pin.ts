import { useCallback } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { performPinGesture, type PinGestureOutcome } from '@/lib/api/pin-message';
import type { Message } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import { isMessagePiecesCatalogLoaded, translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import type { ActionScope } from './message-action-scope';
import { messagePinAction, type MessagePinAction } from './message-actions';

/**
 * **L'ÉPINGLE D'UN MESSAGE DU FIL** (#7558) — ce que « Plus… » offre
 * (`messagePinAction`, la règle du serveur) et le geste (`performPinGesture`,
 * optimiste avec retour arrière). Composé par `useMessageMenu`.
 *
 * L'état se lit sur la RANGÉE servie (`pinnedAt`), que le puits temps réel
 * tient à jour : l'entrée dit « Désépingler » dès qu'un autre participant a
 * épinglé le message, sans rechargement.
 *
 * Rien ne s'offre tant que le catalogue du fil n'est pas chargé : le libellé y
 * vit (`message.pin.*`). L'issue se dit dans la région vivante du fil.
 */
export type MessagePinEntry = { readonly action: MessagePinAction; readonly onToggle: () => void };

type Transport = { readonly request: <T>(request: HttpRequest) => Promise<ApiResult<T>> };

const noticeOf = (action: MessagePinAction, outcome: PinGestureOutcome): string => {
  const language = currentInterfaceLanguage();
  if (outcome === 'offline') return translate(language, 'media.viewer.offline');
  if (action === 'pin') return translateMessagePieces(language, outcome === 'done' ? 'message.pin.done' : 'message.pin.failed');
  return translateMessagePieces(language, outcome === 'done' ? 'message.unpin.done' : 'message.unpin.failed');
};

export function useMessagePin(params: {
  readonly conversationId: string;
  readonly scope: ActionScope;
  readonly announce: (text: string) => void;
  readonly queryClient: QueryClient;
  readonly transport: Transport;
}): (message: Message | undefined) => MessagePinEntry | null {
  const { conversationId, scope, announce, queryClient, transport } = params;
  return useCallback(
    (message: Message | undefined): MessagePinEntry | null => {
      if (message === undefined || !isMessagePiecesCatalogLoaded(currentInterfaceLanguage())) return null;
      const action = messagePinAction(message, scope, { now: Date.now() });
      if (action === null) return null;
      return {
        action,
        onToggle: () => {
          void performPinGesture({ queryClient, conversationId, messageId: message.id, on: action === 'pin', viewerId: scope.viewer.id, transport }).then(
            (outcome) => announce(noticeOf(action, outcome)),
          );
        },
      };
    },
    [conversationId, scope, announce, queryClient, transport],
  );
}
