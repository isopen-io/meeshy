import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { performStarGesture, starredMembershipQueryOptions, type StarGestureResult } from '@/lib/api/starred-messages';
import { starredStateOf } from '@/lib/api/starred-messages-cache';
import type { Message } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { messageStarAction, starrableOf, type MessageStarAction } from './message-actions';

/**
 * **LE FAVORI D'UN MESSAGE DU FIL** (#7378) — l'état CONNU et le geste, pour la
 * feuille « Plus… » (`message-detail-sheet.tsx`).
 *
 * L'état vient de l'ensemble des favoris du lecteur (`starred-messages.ts`),
 * lu dès l'ouverture du fil — pas à l'ouverture de « Plus… » : le lecteur doit
 * trouver l'entrée déjà juste, sans attente. Cache d'abord : un ensemble déjà
 * lu (persisté) sert tout de suite, la relecture est silencieuse.
 *
 * `enabled` est FAUX pour un lecteur sans compte (invité d'un lien, visiteur) :
 * les trois routes du favori refusent un contexte sans compte (décision
 * serveur), l'ensemble reste donc inconnu et l'entrée n'apparaît pas.
 *
 * L'ISSUE S'ANNONCE (la région vivante du fil, visible ET lue) : c'est le
 * retour du geste, là où iOS joue un retour haptique `success`.
 */
export type MessageStarEntry = { readonly action: MessageStarAction; readonly onToggle: () => void };

/** Liée au cache PARTAGÉ — celui que le fil, l'écran des favoris et l'écho lisent. */
export function starMessageAction(
  message: Pick<Message, 'id' | 'conversationId'>,
  on: boolean,
): Promise<StarGestureResult> {
  return performStarGesture({
    message: { id: message.id, conversationId: message.conversationId },
    on,
    deps: { ...apiDeps, queryClient: appQueryClient },
  });
}

export function useMessageStar(params: {
  readonly enabled: boolean;
  readonly announce: (text: string) => void;
}): (message: Message | undefined) => MessageStarEntry | null {
  const { enabled, announce } = params;
  const membership = useQuery({ ...starredMembershipQueryOptions(apiDeps), enabled });

  return useCallback(
    (message: Message | undefined): MessageStarEntry | null => {
      if (message === undefined) return null;
      const action = messageStarAction({
        starred: starredStateOf(membership.data, message.id),
        starrable: starrableOf(message, { now: Date.now() }),
      });
      if (action === null) return null;
      return {
        action,
        onToggle: () => {
          void starMessageAction(message, action === 'star').then((result) => {
            if (result.message !== undefined) announce(translate(currentInterfaceLanguage(), result.message));
          });
        },
      };
    },
    [membership.data, announce],
  );
}
