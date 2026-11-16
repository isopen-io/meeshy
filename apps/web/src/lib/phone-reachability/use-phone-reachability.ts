import { useQuery, type QueryClient } from '@tanstack/react-query';

import { appQueryClient } from '@/lib/api/query-client';
import { usePhoneReachabilityCatalog } from '@/lib/i18n-phone-reachability-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import {
  PHONE_REACHABILITY_STATES_QUERY_KEY,
  phoneReachabilityStatesOf,
  servedPhoneReachabilityEntry,
  type PhoneReachabilityEntry,
  type PhoneReachabilityStates,
} from './phone-reachability-live';
import { phoneUnreachableBadgeOf, type PhoneUnreachableBadge } from './phone-reachability-view';

/**
 * **LE TÉLÉPHONE INJOIGNABLE D'UNE PERSONNE, PRÊT À PEINDRE** (#18737, TEL-01) — l'en-tête d'un direct, la ligne de
 * la liste, la fiche et le profil OBSERVENT le cache (`enabled: false` : jamais une requête de leur fait), et ne se
 * repeignent que quand l'état de LEUR personne change. Le catalogue ne se charge que si un état est servi.
 */

export function usePhoneReachabilityEntry(userId: string | undefined, client: QueryClient = appQueryClient): PhoneReachabilityEntry | null {
  const { data } = useQuery(
    {
      queryKey: PHONE_REACHABILITY_STATES_QUERY_KEY,
      queryFn: (): PhoneReachabilityStates => phoneReachabilityStatesOf(client, Date.now()),
      enabled: false,
      select: (states: PhoneReachabilityStates) => servedPhoneReachabilityEntry(states, userId, Date.now()),
    },
    client,
  );
  return data ?? null;
}

export function usePhoneUnreachableBadge(userId: string | undefined, language: InterfaceLanguage, client: QueryClient = appQueryClient): PhoneUnreachableBadge | undefined {
  const entry = usePhoneReachabilityEntry(userId, client);
  const ready = usePhoneReachabilityCatalog(language, entry !== null);
  return entry === null || !ready ? undefined : phoneUnreachableBadgeOf(entry, language, { now: Date.now() });
}
