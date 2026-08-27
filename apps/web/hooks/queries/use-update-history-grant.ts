'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '@/services/api.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { ParticipantProfile } from './use-participant-profile';

type UpdateHistoryGrantResponse = {
  readonly participantId: string;
  readonly conversationId: string;
  readonly historyVisibleFrom: string | null;
};

/**
 * Poser ou retirer l'octroi d'historique par DATE sur un participant.
 *
 * Distinct de `useUpdateParticipantRights` : ce levier vaut pour TOUT
 * participant (inscrit compris), pas seulement les visiteurs sans compte, et
 * sa permission d'écriture est plus étroite côté gateway (admin/creator, pas
 * modérateur) — `profile.canGrantHistory` en est la réponse sûre, le conteneur
 * ne branche ce callback que si elle vaut `true`.
 *
 * Écriture optimiste : le contrôle doit répondre au doigt, pas au réseau. En
 * cas d'échec, l'instantané pris avant l'écriture est reposé.
 */
export function useUpdateHistoryGrant(
  conversationId: string | null,
  participantId: string | null
) {
  const queryClient = useQueryClient();
  const key = queryKeys.conversations.participantProfile(
    conversationId ?? '',
    participantId ?? ''
  );

  return useMutation({
    mutationFn: async (historyVisibleFrom: string | null): Promise<UpdateHistoryGrantResponse> => {
      const response = await apiService.patch<UpdateHistoryGrantResponse>(
        `/conversations/${conversationId}/participants/${participantId}/rights`,
        { historyVisibleFrom }
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'history grant update failed');
      }
      return response.data;
    },

    onMutate: async (historyVisibleFrom) => {
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<ParticipantProfile>(key);

      queryClient.setQueryData<ParticipantProfile>(key, (current) =>
        current ? { ...current, historyVisibleFrom } : current
      );

      return { snapshot };
    },

    onError: (_error, _historyVisibleFrom, context) => {
      if (context?.snapshot) queryClient.setQueryData(key, context.snapshot);
    },

    // Le serveur rend l'état RÉSOLU. On l'écrit plutôt que d'invalider : la
    // réponse est déjà la vérité.
    onSuccess: (data) => {
      queryClient.setQueryData<ParticipantProfile>(key, (current) =>
        current ? { ...current, historyVisibleFrom: data.historyVisibleFrom } : current
      );
    },
  });
}
