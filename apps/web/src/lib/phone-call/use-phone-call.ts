import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { PhoneCallState } from '@meeshy/shared/types/phone-call';

import { appQueryClient } from '@/lib/api/query-client';
import { usePhoneCallCatalog } from '@/lib/i18n-phone-call-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { PHONE_CALL_STATES_QUERY_KEY, phoneCallStatesOf, servedPhoneCallState, type PhoneCallStates } from './phone-call-live';
import { phoneCallHeadline } from './phone-call-view';

/**
 * **« EN APPEL » D'UNE PERSONNE, PRÊT À PEINDRE** (#18753, ACT-01) — l'en-tête d'un direct, la fiche et le profil
 * OBSERVENT le cache (`enabled: false` : jamais une requête de leur fait). Une horloge à la minute fait avancer
 * « depuis 12 min » et retire l'état dont `expiresAt` passe pendant qu'il est à l'écran. Le catalogue ne se charge
 * que si un état est servi.
 */

/** L'horloge qui fait passer « 12 min » à « 13 min », et qui fait tomber un état expiré : une minute suffit. */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function usePhoneCallState(userId: string | undefined, now: number, client: QueryClient = appQueryClient): PhoneCallState | null {
  const { data } = useQuery(
    {
      queryKey: PHONE_CALL_STATES_QUERY_KEY,
      queryFn: (): PhoneCallStates => phoneCallStatesOf(client, Date.now()),
      enabled: false,
      select: (states: PhoneCallStates) => servedPhoneCallState(states, userId, now),
    },
    client,
  );
  return data ?? null;
}

/** « En appel depuis 12 min », pour la ligne d'en-tête d'un direct ; absente sans état servi. */
export function usePhoneCallHeadline(userId: string | undefined, language: InterfaceLanguage, client: QueryClient = appQueryClient): string | undefined {
  const now = Math.max(useMinuteClock(), Date.now());
  const state = usePhoneCallState(userId, now, client);
  const ready = usePhoneCallCatalog(language, state !== null);
  return state === null || !ready ? undefined : phoneCallHeadline(state, language, { now });
}
