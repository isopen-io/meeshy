'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ParticipantRightsUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { ParticipantProfile } from './use-participant-profile';

/**
 * Tient à jour les droits d'un visiteur quand un hôte les modifie.
 *
 * Deux lecteurs, et c'est pourquoi l'écoute existe : l'hôte qui n'a pas fait le
 * changement — sa fiche ouverte afficherait encore l'ancien état — et surtout le
 * VISITEUR lui-même, seul que la décision contraint. Le gateway émet vers la
 * room de conversation ET vers la room personnelle du participant, précisément
 * pour l'atteindre.
 *
 * L'événement porte les droits RÉSOLUS : on les écrit tels quels. Recomposer
 * `rights ?? permissions` ici tiendrait un second énoncé d'une règle qui n'en a
 * qu'un, `resolveParticipantRights` côté gateway.
 *
 * On ÉCRIT plutôt qu'on n'invalide : la charge utile est déjà la vérité, et une
 * invalidation rejouerait la requête pour apprendre ce qu'on vient de recevoir.
 */
export function useParticipantRightsSync(conversationId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!conversationId) return;

    const handleRightsUpdated = (data: ParticipantRightsUpdatedEventData) => {
      if (data.conversationId !== conversationId) return;

      queryClient.setQueryData<ParticipantProfile>(
        queryKeys.conversations.participantProfile(conversationId, data.participantId),
        (current) =>
          current
            ? {
                ...current,
                entryCapabilities: data.rights,
                // Présent seulement quand CE changement portait sur l'octroi
                // d'historique — absent (`undefined`) sur un basculement de
                // capacité ordinaire, qu'il ne faut alors pas écraser.
                ...(data.historyVisibleFrom !== undefined
                  ? { historyVisibleFrom: data.historyVisibleFrom }
                  : {}),
              }
            : current
      );
    };

    const socket = meeshySocketIOService.getSocket();
    socket?.on(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, handleRightsUpdated);

    return () => {
      socket?.off(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, handleRightsUpdated);
    };
  }, [conversationId, queryClient]);
}
