'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '@/services/api.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import type {
  ParticipantProfile,
  ParticipantEntryCapabilities,
} from './use-participant-profile';

type RightName = keyof ParticipantEntryCapabilities;

type UpdateRightsResponse = {
  readonly participantId: string;
  readonly conversationId: string;
  readonly rights: ParticipantEntryCapabilities;
};

/**
 * Accorder ou retirer un droit à un visiteur sans compte.
 *
 * N'envoie QUE le droit basculé : la surcharge est un delta côté serveur, et
 * lui poster les huit droits gèlerait les sept autres à leur valeur du moment —
 * ils cesseraient de suivre les conditions du join.
 *
 * L'écriture est optimiste : l'interrupteur doit répondre au doigt, pas au
 * réseau. En cas d'échec, l'instantané pris avant l'écriture est reposé — sans
 * lui, un refus du serveur laisserait à l'écran un droit que personne n'a.
 */
export function useUpdateParticipantRights(
  conversationId: string | null,
  participantId: string | null
) {
  const queryClient = useQueryClient();
  const key = queryKeys.conversations.participantProfile(
    conversationId ?? '',
    participantId ?? ''
  );

  return useMutation({
    mutationFn: async (patch: Partial<Record<RightName, boolean>>): Promise<UpdateRightsResponse> => {
      const response = await apiService.patch<UpdateRightsResponse>(
        `/conversations/${conversationId}/participants/${participantId}/rights`,
        patch
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'rights update failed');
      }
      return response.data;
    },

    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<ParticipantProfile>(key);

      queryClient.setQueryData<ParticipantProfile>(key, (current) =>
        current?.entryCapabilities
          ? { ...current, entryCapabilities: { ...current.entryCapabilities, ...patch } }
          : current
      );

      return { snapshot };
    },

    onError: (_error, _patch, context) => {
      if (context?.snapshot) queryClient.setQueryData(key, context.snapshot);
    },

    // Le serveur rend l'état RÉSOLU. On l'écrit plutôt que d'invalider : la
    // réponse est déjà la vérité, et une invalidation rejouerait la requête pour
    // apprendre ce qu'on vient de recevoir.
    onSuccess: (data) => {
      queryClient.setQueryData<ParticipantProfile>(key, (current) =>
        current ? { ...current, entryCapabilities: data.rights } : current
      );
    },
  });
}
