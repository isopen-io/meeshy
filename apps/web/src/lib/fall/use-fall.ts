import { useQuery, type QueryClient } from '@tanstack/react-query';

import { appQueryClient } from '@/lib/api/query-client';
import { useFallCatalog } from '@/lib/i18n-fall-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useMinuteClock } from '@/lib/phone-call/use-phone-call';

import { FALL_STATES_QUERY_KEY, fallStatesOf, servedFallEntry, type FallEntry, type FallStates } from './fall-live';
import { fallHeadline } from './fall-view';

/**
 * **LA CHUTE DÉTECTÉE D'UNE PERSONNE, PRÊTE À PEINDRE** (#18748, SAN-01) — l'en-tête d'un direct, la fiche et le
 * profil OBSERVENT le cache (`enabled: false` : jamais une requête de leur fait). L'horloge à la minute retire l'état
 * dont `expiresAt` passe pendant qu'il est à l'écran. Le catalogue ne se charge que si une chute est servie.
 */

export function useFallEntry(userId: string | undefined, now: number, client: QueryClient = appQueryClient): FallEntry | null {
  const { data } = useQuery(
    {
      queryKey: FALL_STATES_QUERY_KEY,
      queryFn: (): FallStates => fallStatesOf(client, Date.now()),
      enabled: false,
      select: (states: FallStates) => servedFallEntry(states, userId, now),
    },
    client,
  );
  return data ?? null;
}

/** L'instant présent, avancé chaque minute : de quoi faire tomber un épisode expiré à l'écran. */
export function useFallClock(): number {
  return Math.max(useMinuteClock(), Date.now());
}

/** « Chute détectée à 16:42 », pour la ligne d'en-tête d'un direct ; absente sans chute servie. */
export function useFallHeadline(userId: string | undefined, language: InterfaceLanguage, client: QueryClient = appQueryClient): string | undefined {
  const now = useFallClock();
  const entry = useFallEntry(userId, now, client);
  const ready = useFallCatalog(language, entry !== null);
  return entry === null || !ready ? undefined : fallHeadline(entry, language, { now });
}
