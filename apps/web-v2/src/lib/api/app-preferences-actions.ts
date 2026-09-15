import type { QueryClient } from '@tanstack/react-query';

import {
  APP_PREFERENCES_QUERY_KEY,
  patchAppPreferences,
  type AppPreferences,
  type AppPreferencesDeps,
  type PreferencesPatch,
} from './app-preferences';

/**
 * **UN RÉGLAGE SE BASCULE EN OPTIMISTE** (#5563) — CLAUDE.md § Optimistic
 * Updates, motif `profile-actions.ts` : instantané → application locale →
 * réseau → retour arrière. Miroir `UserPreferencesManager.updateNotification`
 * / `updatePrivacy` (iOS).
 *
 * **Le retour arrière ne défait QUE les réglages du geste refusé.** Deux
 * bascules rapprochées partent chacune avec leur instantané : rendre l'objet
 * entier au refus de la première effacerait l'effet optimiste de la seconde.
 *
 * **Hors ligne, rien ne part et rien ne change.** iOS met l'écriture en file ;
 * le web n'a pas de file d'écriture (#6325), et une bascule qui dirait
 * « activé » sans jamais partir serait un contrôle qui ment.
 */

export type PreferenceActionDeps = AppPreferencesDeps & {
  readonly queryClient: QueryClient;
  readonly isOnline: () => boolean;
};

export type PreferenceEditOutcome =
  | { readonly status: 'saved' }
  | { readonly status: 'offline' }
  | { readonly status: 'refused'; readonly error: string };

const KEY = APP_PREFERENCES_QUERY_KEY;

function restoredKeys(snapshot: AppPreferences, patch: PreferencesPatch): PreferencesPatch {
  return Object.fromEntries(Object.keys(patch).map((key) => [key, snapshot[key as keyof AppPreferences]]));
}

/**
 * **La confirmation n'écrit, elle aussi, QUE les réglages du geste** (#6342) —
 * à la valeur que la passerelle a RETENUE. Elle sert la catégorie COMPLÈTE telle
 * qu'elle était quand elle a traité CETTE requête : adopter les voisins
 * laisserait une réponse PÉRIMÉE, revenue après celle d'une bascule voisine,
 * réécrire cette dernière à son ancienne valeur.
 */
function retainedKeys(served: PreferencesPatch, patch: PreferencesPatch): PreferencesPatch {
  return Object.fromEntries(Object.entries(served).filter(([key]) => key in patch));
}

export async function performPreferenceEdit(params: {
  readonly patch: PreferencesPatch;
  readonly deps: PreferenceActionDeps;
}): Promise<PreferenceEditOutcome> {
  const { patch, deps } = params;
  if (!deps.isOnline()) return { status: 'offline' };

  await deps.queryClient.cancelQueries({ queryKey: KEY });
  const snapshot = deps.queryClient.getQueryData<AppPreferences>(KEY);
  if (snapshot !== undefined) deps.queryClient.setQueryData<AppPreferences>(KEY, { ...snapshot, ...patch });

  const result = await patchAppPreferences(deps, patch);
  const current = deps.queryClient.getQueryData<AppPreferences>(KEY);

  if (!result.ok) {
    if (snapshot !== undefined && current !== undefined) {
      deps.queryClient.setQueryData<AppPreferences>(KEY, { ...current, ...restoredKeys(snapshot, patch) });
    }
    return { status: 'refused', error: result.error };
  }

  if (current !== undefined) deps.queryClient.setQueryData<AppPreferences>(KEY, { ...current, ...retainedKeys(result.data, patch) });
  return { status: 'saved' };
}
