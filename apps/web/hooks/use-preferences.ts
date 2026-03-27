'use client';

/**
 * Hook de gestion des préférences utilisateur avec React Query
 *
 * Features:
 * - SWR-like avec déduplication automatique via React Query
 * - Optimistic updates pour UX réactive
 * - Gestion des erreurs 403 CONSENT_REQUIRED
 * - Support PATCH (partiel) et PUT (complet)
 * - TypeScript strict avec types inférés
 * - i18n pour tous les messages d'erreur
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '@/services/api.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import { broadcastPreferenceUpdate } from '@/lib/settings-sync';
import {
  isConsentRequiredError,
  isPreferenceErrorResponse,
} from '@/types/preferences';
import type {
  PreferenceCategory,
  PreferenceDataType,
  PreferenceResponse,
  UsePreferencesOptions,
  UsePreferencesResult,
  ConsentViolation,
} from '@/types/preferences';

const STALE_TIME = 5 * 60 * 1000;

function getPreferenceQueryKey(category: PreferenceCategory): readonly string[] {
  return queryKeys.preferences.category(category);
}

/**
 * Vérifie si une erreur est une erreur de consentement (403)
 */
function checkConsentError(error: unknown): ConsentViolation[] | null {
  if (!error) return null;

  // Vérifier si c'est une erreur API avec status 403
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as any).status === 403
  ) {
    // Essayer d'extraire les violations du corps de l'erreur
    const errorBody = (error as any).body || (error as any).data || error;

    if (isConsentRequiredError(errorBody)) {
      return errorBody.violations;
    }
  }

  return null;
}

// ===== HOOK PRINCIPAL =====

/**
 * Hook pour gérer les préférences utilisateur avec React Query
 *
 * @param category - Catégorie de préférences à gérer
 * @param options - Options de configuration
 *
 * @example
 * ```tsx
 * // Utilisation basique
 * const { data, updatePreferences, isLoading } = usePreferences('privacy');
 *
 * // Avec gestion du consentement
 * const { data, updatePreferences, consentViolations } = usePreferences('translation', {
 *   onConsentRequired: (violations) => {
 *     // Afficher le dialogue de consentement
 *     showConsentDialog(violations);
 *   }
 * });
 *
 * // Mise à jour partielle
 * await updatePreferences({ transcriptionEnabled: true });
 * ```
 */
export function usePreferences<C extends PreferenceCategory>(
  category: C,
  options: UsePreferencesOptions = {}
): UsePreferencesResult<PreferenceDataType<C>> {
  const {
    enabled = true,
    onError,
    onSuccess,
    onConsentRequired,
    revalidateInterval = 0,
  } = options;

  const queryClient = useQueryClient();
  const queryKey = useMemo(() => getPreferenceQueryKey(category), [category]);

  // État local pour les violations de consentement
  const [consentViolations, setConsentViolations] = useState<ConsentViolation[] | null>(null);

  // ===== QUERY (GET) =====

  const {
    data,
    error,
    isLoading,
    refetch: refetchQuery,
  } = useQuery<PreferenceDataType<C>, Error>({
    queryKey,
    queryFn: async () => {
      try {
        const response = await apiService.get<PreferenceResponse<PreferenceDataType<C>>>(
          `/api/v1/me/preferences/${category}`
        );

        // Gérer les erreurs de réponse
        if (isPreferenceErrorResponse(response.data)) {
          throw new Error(response.data.message || response.data.error);
        }

        if (!response.data?.success || !response.data?.data) {
          throw new Error('Invalid response format');
        }

        // Réinitialiser les violations en cas de succès
        setConsentViolations(null);

        return response.data.data;
      } catch (err) {
        // Vérifier si c'est une erreur de consentement
        const violations = checkConsentError(err);
        if (violations) {
          setConsentViolations(violations);
          onConsentRequired?.(violations);
        }
        throw err;
      }
    },
    enabled,
    staleTime: STALE_TIME,
    refetchInterval: revalidateInterval > 0 ? revalidateInterval : false,
    retry: (failureCount, error: any) => {
      // Ne pas retry sur les erreurs 403 (consentement requis)
      if (error?.status === 403) return false;
      // Retry 2 fois max pour les autres erreurs
      return failureCount < 2;
    },
  });

  // Callback d'erreur
  useEffect(() => {
    if (error) {
      onError?.(error);
    }
  }, [error, onError]);

  // ===== MUTATION (PATCH - Mise à jour partielle) =====

  const updateMutation = useMutation<
    PreferenceDataType<C>,
    Error,
    Partial<PreferenceDataType<C>>
  >({
    mutationFn: async (updates) => {
      const response = await apiService.patch<PreferenceResponse<PreferenceDataType<C>>>(
        `/api/v1/me/preferences/${category}`,
        updates
      );

      if (isPreferenceErrorResponse(response.data)) {
        // Vérifier si c'est une erreur de consentement
        if (response.data.violations) {
          setConsentViolations(response.data.violations);
          onConsentRequired?.(response.data.violations);
        }
        throw new Error(response.data.message || response.data.error);
      }

      if (!response.data?.success || !response.data?.data) {
        throw new Error('Invalid response format');
      }

      return response.data.data;
    },
    onMutate: async (updates) => {
      // Annuler les queries en cours pour éviter les conflits
      await queryClient.cancelQueries({ queryKey });

      // Sauvegarder l'état précédent pour rollback
      const previousData = queryClient.getQueryData<PreferenceDataType<C>>(queryKey);

      // Optimistic update
      if (previousData) {
        queryClient.setQueryData<PreferenceDataType<C>>(queryKey, {
          ...previousData,
          ...updates,
        });
      }

      return { previousData } as { previousData: PreferenceDataType<C> | undefined };
    },
    onError: (err: Error, variables: Partial<PreferenceDataType<C>>, _onMutateResult: unknown, context: unknown) => {
      const ctx = context as { previousData?: PreferenceDataType<C> } | undefined;
      // Rollback en cas d'erreur
      if (ctx?.previousData) {
        queryClient.setQueryData(queryKey, ctx.previousData);
      }

      // Vérifier si c'est une erreur de consentement
      const violations = checkConsentError(err);
      if (violations) {
        setConsentViolations(violations);
        onConsentRequired?.(violations);
      }

      onError?.(err);
    },
    onSuccess: (newData) => {
      queryClient.setQueryData(queryKey, newData);
      setConsentViolations(null);
      broadcastPreferenceUpdate(category);
      onSuccess?.(newData);
    },
  });

  // ===== MUTATION (PUT - Remplacement complet) =====

  const replaceMutation = useMutation<
    PreferenceDataType<C>,
    Error,
    PreferenceDataType<C>
  >({
    mutationFn: async (newData) => {
      const response = await apiService.put<PreferenceResponse<PreferenceDataType<C>>>(
        `/api/v1/me/preferences/${category}`,
        newData
      );

      if (isPreferenceErrorResponse(response.data)) {
        if (response.data.violations) {
          setConsentViolations(response.data.violations);
          onConsentRequired?.(response.data.violations);
        }
        throw new Error(response.data.message || response.data.error);
      }

      if (!response.data?.success || !response.data?.data) {
        throw new Error('Invalid response format');
      }

      return response.data.data;
    },
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<PreferenceDataType<C>>(queryKey);

      // Optimistic update avec remplacement complet
      queryClient.setQueryData<PreferenceDataType<C>>(queryKey, newData);

      return { previousData } as { previousData: PreferenceDataType<C> | undefined };
    },
    onError: (err: Error, variables: PreferenceDataType<C>, _onMutateResult: unknown, context: unknown) => {
      const ctx = context as { previousData?: PreferenceDataType<C> } | undefined;
      if (ctx?.previousData) {
        queryClient.setQueryData(queryKey, ctx.previousData);
      }

      const violations = checkConsentError(err);
      if (violations) {
        setConsentViolations(violations);
        onConsentRequired?.(violations);
      }

      onError?.(err);
    },
    onSuccess: (newData) => {
      queryClient.setQueryData(queryKey, newData);
      setConsentViolations(null);
      broadcastPreferenceUpdate(category);
      onSuccess?.(newData);
    },
  });

  // ===== CALLBACKS PUBLICS =====

  const updatePreferences = useCallback(
    async (updates: Partial<PreferenceDataType<C>>): Promise<PreferenceDataType<C>> => {
      return updateMutation.mutateAsync(updates);
    },
    [updateMutation]
  );

  const replacePreferences = useCallback(
    async (newData: PreferenceDataType<C>): Promise<PreferenceDataType<C>> => {
      return replaceMutation.mutateAsync(newData);
    },
    [replaceMutation]
  );

  const refetch = useCallback(async () => {
    await refetchQuery();
  }, [refetchQuery]);

  // ===== RETOUR =====

  return {
    data,
    isLoading,
    error: error || null,
    isUpdating: updateMutation.isPending || replaceMutation.isPending,
    updatePreferences,
    replacePreferences,
    refetch,
    consentViolations,
  };
}

// ===== EXPORTS =====

export type { UsePreferencesOptions, UsePreferencesResult };
export { getPreferenceQueryKey };
