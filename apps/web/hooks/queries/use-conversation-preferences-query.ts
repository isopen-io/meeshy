'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { userPreferencesService } from '@/services/user-preferences.service';
import type { UserConversationPreferences, UserConversationCategory } from '@meeshy/shared/types/user-preferences';

export function useConversationPreferencesQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.preferences.conversations(),
    queryFn: () => userPreferencesService.getAllPreferences(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCategoriesQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.preferences.categories(),
    queryFn: () => userPreferencesService.getCategories(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePreferencesMap(enabled = true) {
  const { data: preferences } = useConversationPreferencesQuery(enabled);

  const map = new Map<string, UserConversationPreferences>();
  if (preferences) {
    for (const pref of preferences) {
      map.set(pref.conversationId, pref);
    }
  }

  return map;
}

function useOptimisticPreferenceMutation<TVariables>(
  mutationFn: (vars: TVariables) => Promise<UserConversationPreferences>,
  getOptimisticUpdate: (vars: TVariables, current: UserConversationPreferences[]) => UserConversationPreferences[],
  getConversationId: (vars: TVariables) => string,
) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.preferences.conversations();

  return useMutation({
    mutationFn,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<UserConversationPreferences[]>(queryKey);
      if (previous) {
        queryClient.setQueryData(queryKey, getOptimisticUpdate(vars, previous));
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({
        queryKey: queryKeys.preferences.conversation(getConversationId(vars)),
      });
    },
  });
}

type ToggleVars = { conversationId: string; value: boolean };

export function useTogglePinMutation() {
  return useOptimisticPreferenceMutation<ToggleVars>(
    ({ conversationId, value }) => userPreferencesService.togglePin(conversationId, value),
    ({ conversationId, value }, current) =>
      current.map(p =>
        p.conversationId === conversationId ? { ...p, isPinned: value } : p
      ),
    (vars) => vars.conversationId,
  );
}

export function useToggleMuteMutation() {
  return useOptimisticPreferenceMutation<ToggleVars>(
    ({ conversationId, value }) => userPreferencesService.toggleMute(conversationId, value),
    ({ conversationId, value }, current) =>
      current.map(p =>
        p.conversationId === conversationId ? { ...p, isMuted: value } : p
      ),
    (vars) => vars.conversationId,
  );
}

export function useToggleArchiveMutation() {
  return useOptimisticPreferenceMutation<ToggleVars>(
    ({ conversationId, value }) => userPreferencesService.toggleArchive(conversationId, value),
    ({ conversationId, value }, current) =>
      current.map(p =>
        p.conversationId === conversationId ? { ...p, isArchived: value } : p
      ),
    (vars) => vars.conversationId,
  );
}

type ReactionVars = { conversationId: string; reaction: string | null };

export function useSetReactionMutation() {
  return useOptimisticPreferenceMutation<ReactionVars>(
    ({ conversationId, reaction }) => userPreferencesService.updateReaction(conversationId, reaction),
    ({ conversationId, reaction }, current) =>
      current.map(p =>
        p.conversationId === conversationId ? { ...p, reaction: reaction || undefined } : p
      ),
    (vars) => vars.conversationId,
  );
}
