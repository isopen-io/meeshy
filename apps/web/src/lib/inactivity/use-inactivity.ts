import { useQuery, type QueryClient } from '@tanstack/react-query';

import { appQueryClient } from '@/lib/api/query-client';
import { useInactivityCatalog } from '@/lib/i18n-inactivity-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { INACTIVITY_STATES_QUERY_KEY, inactivityStatesOf, servedInactivityEntry, type InactivityEntry, type InactivityStates } from './inactivity-live';
import { inactivityHeadline } from './inactivity-view';

/**
 * **L'ALERTE D'INACTIVITÉ D'UNE PERSONNE, PRÊTE À PEINDRE** (#18738, TEL-02) — l'en-tête d'un direct, la fiche et le
 * profil OBSERVENT le cache (`enabled: false` : jamais une requête de leur fait), et ne se repeignent que quand
 * l'état de LEUR personne change. Le catalogue ne se charge que si une alerte est servie.
 */

export function useInactivityEntry(userId: string | undefined, client: QueryClient = appQueryClient): InactivityEntry | null {
  const { data } = useQuery(
    {
      queryKey: INACTIVITY_STATES_QUERY_KEY,
      queryFn: (): InactivityStates => inactivityStatesOf(client, Date.now()),
      enabled: false,
      select: (states: InactivityStates) => servedInactivityEntry(states, userId, Date.now()),
    },
    client,
  );
  return data ?? null;
}

/** « Aucune activité depuis 08:00 », pour la ligne d'en-tête d'un direct ; absente sans alerte servie. */
export function useInactivityHeadline(userId: string | undefined, language: InterfaceLanguage, client: QueryClient = appQueryClient): string | undefined {
  const entry = useInactivityEntry(userId, client);
  const ready = useInactivityCatalog(language, entry !== null);
  return entry === null || !ready ? undefined : inactivityHeadline(entry, language, { now: Date.now() });
}
