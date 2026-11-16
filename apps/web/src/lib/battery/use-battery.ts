import { useQuery, type QueryClient } from '@tanstack/react-query';

import { appQueryClient } from '@/lib/api/query-client';
import { useBatteryCatalog } from '@/lib/i18n-battery-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { BATTERY_STATES_QUERY_KEY, batteryStatesOf, servedBatteryEntry, type BatteryEntry, type BatteryStates } from './battery-live';
import { batteryBadgeOf, type BatteryBadge } from './battery-view';

/**
 * **LA BATTERIE D'UNE PERSONNE, PRÊTE À PEINDRE** (#14147) — l'en-tête d'un direct, la ligne de la liste, la fiche
 * et le profil OBSERVENT le cache (`enabled: false` : jamais une requête de leur fait), et ne se repeignent que
 * quand l'état de LEUR personne change. Le catalogue de la batterie ne se charge que si un épisode est servi : une
 * liste sans épisode n'en paie rien.
 */

export function useBatteryEntry(userId: string | undefined, client: QueryClient = appQueryClient): BatteryEntry | null {
  const { data } = useQuery(
    {
      queryKey: BATTERY_STATES_QUERY_KEY,
      queryFn: (): BatteryStates => batteryStatesOf(client, Date.now()),
      enabled: false,
      select: (states: BatteryStates) => servedBatteryEntry(states, userId, Date.now()),
    },
    client,
  );
  return data ?? null;
}

export function useBatteryBadge(userId: string | undefined, language: InterfaceLanguage, client: QueryClient = appQueryClient): BatteryBadge | undefined {
  const entry = useBatteryEntry(userId, client);
  const ready = useBatteryCatalog(language, entry !== null);
  return entry === null || !ready ? undefined : batteryBadgeOf(entry, language);
}
