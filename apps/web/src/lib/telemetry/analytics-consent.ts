import type { QueryClient } from '@tanstack/react-query';

import { APP_PREFERENCES_QUERY_KEY, type AppPreferences, type appPreferencesQueryOptions } from '@/lib/api/app-preferences';
import { CONSENTS_QUERY_KEY, type GrantedConsents, type consentsQueryOptions } from '@/lib/api/consents';
import type { SessionState } from '@/lib/api/session';
import type { ConsentState } from '@/lib/api/social-events-context';

/**
 * **LE CONSENTEMENT D'ANALYSE QUE LE WEB DÉCLARE** (#10502) — le `consent` du
 * contexte de lot de `POST /social/events`. Même règle qu'iOS
 * (`AnalyticsConsentStanding.consent(allowAnalytics:serverGranted:)`,
 * `SocialEventsV2Reporter.swift`) :
 *  - bascule « Analytique » COUPÉE ⇒ `denied`, toujours — la passerelle ne
 *    range alors aucune ligne de comportement, seuls les compteurs bougent ;
 *  - ACTIVE ⇒ `granted` seulement si la passerelle a confirmé le
 *    consentement d'analyse (`GET /me/consents`), `unknown` sinon ;
 *  - bascule inconnue (réglages pas encore lus, ancien serveur), visiteur ou
 *    déconnecté ⇒ `unknown`.
 * Le client ne fait jamais accorder : la passerelle relit son propre
 * consentement avant d'attribuer. Le consentement ne coupe jamais le comptage.
 */
export function analyticsConsentOf(input: { readonly allowAnalytics?: boolean; readonly serverGranted?: boolean }): ConsentState {
  if (input.allowAnalytics === undefined) return 'unknown';
  if (!input.allowAnalytics) return 'denied';
  return input.serverGranted === true ? 'granted' : 'unknown';
}

type SessionSource = {
  getState(): { readonly session: SessionState };
  subscribe(listener: (state: { readonly session: SessionState }) => void): () => void;
};

export type AnalyticsConsentSyncDeps = {
  readonly sessionStore: SessionSource;
  /** Le cache de requêtes UNIQUE (`appQueryClient`) : il est purgé, puis rendu au compte arrivé, AVANT que ce module ne l'apprenne. */
  readonly queryClient: QueryClient;
  /** Relit les réglages et les consentements du compte connecté — appelé seulement sous un compte. */
  readonly refresh: () => void;
  readonly note: (consent: ConsentState) => void;
};

const accountOf = (session: SessionState): string | null => (session.status === 'authenticated' ? session.user.id : null);

const watchedKeys: readonly (readonly string[])[] = [APP_PREFERENCES_QUERY_KEY, CONSENTS_QUERY_KEY];

const isWatched = (key: readonly unknown[]): boolean =>
  watchedKeys.some((watched) => watched.length === key.length && watched.every((part, index) => part === key[index]));

/**
 * Tient le consentement déclaré à jour, hors de tout rendu : à chaque
 * changement de COMPTE (connexion, déconnexion, autre compte — un jeton
 * renouvelé n'en est pas un) et à chaque écriture des réglages ou des
 * consentements dans le cache (lecture, bascule optimiste, retour arrière).
 * Aucune requête sans compte connecté.
 */
export function syncAnalyticsConsent(deps: AnalyticsConsentSyncDeps): () => void {
  const announce = (): void => {
    if (accountOf(deps.sessionStore.getState().session) === null) {
      deps.note('unknown');
      return;
    }
    const preferences = deps.queryClient.getQueryData<AppPreferences>(APP_PREFERENCES_QUERY_KEY);
    const granted = deps.queryClient.getQueryData<GrantedConsents>(CONSENTS_QUERY_KEY);
    deps.note(
      analyticsConsentOf({
        ...(preferences?.allowAnalytics === undefined ? {} : { allowAnalytics: preferences.allowAnalytics }),
        ...(granted === undefined ? {} : { serverGranted: granted.includes('analytics') }),
      }),
    );
  };

  let account = accountOf(deps.sessionStore.getState().session);
  announce();
  if (account !== null) deps.refresh();

  const stopSession = deps.sessionStore.subscribe(({ session }) => {
    const next = accountOf(session);
    if (next === account) return;
    account = next;
    announce();
    if (next !== null) deps.refresh();
  });
  const stopCache = deps.queryClient.getQueryCache().subscribe(({ query }) => {
    if (isWatched(query.queryKey)) announce();
  });

  return () => {
    stopSession();
    stopCache();
  };
}

/**
 * Relit les deux sources — chacune selon sa fraîcheur, sauf des réglages en
 * cache qui ne portent pas la bascule : persistés par une version qui ne la
 * demandait pas, ils laisseraient le consentement `unknown` jusqu'à trente
 * minutes, et un refus partirait sans être dit. Un échec réseau laisse le cache
 * tel quel : rien n'y devient accordé.
 */
export function refreshAnalyticsConsentSources(params: {
  readonly queryClient: QueryClient;
  readonly preferences: ReturnType<typeof appPreferencesQueryOptions>;
  readonly consents: ReturnType<typeof consentsQueryOptions>;
}): void {
  const { preferences } = params;
  void params.queryClient
    .fetchQuery({
      ...preferences,
      staleTime: ({ state }) => (state.data?.allowAnalytics === undefined ? 0 : preferences.staleTime),
    })
    .catch(() => undefined);
  void params.queryClient.fetchQuery(params.consents).catch(() => undefined);
}
