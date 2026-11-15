import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_ROUTE_USAGE_STATE,
  HEALTH_REFRESH_MS,
  healthRefetchInterval,
  isDefaultRouteUsageState,
  parseRouteUsageState,
  routeIssueUrl,
  routeUsageRequestQuery,
  serializeRouteUsageState,
  withLimit,
  withRoute,
  withScope,
} from './monitoring-state';

const search = (query: string) => new URLSearchParams(query);

describe('la santé se relit toute seule, tant que l’écran est visible', () => {
  test('toutes les trente secondes visible, plus du tout masqué', () => {
    expect(HEALTH_REFRESH_MS).toBe(30_000);
    expect(healthRefetchInterval(true)).toBe(30_000);
    expect(healthRefetchInterval(false)).toBe(false);
  });

  test('la cadence est injectable pour les témoins', () => {
    expect(healthRefetchInterval(true, 40)).toBe(40);
    expect(healthRefetchInterval(false, 40)).toBe(false);
  });
});

describe('l’usage des routes — l’état se lit dans l’adresse, par liste blanche', () => {
  test('une adresse vide rend le défaut : les routes surveillées, cent lignes, sans recherche', () => {
    expect(parseRouteUsageState(search(''))).toEqual({ scope: 'watched', route: '', limit: 100 });
    expect(isDefaultRouteUsageState(parseRouteUsageState(search('')))).toBe(true);
  });

  test('une adresse complète est lue telle quelle, la recherche nettoyée', () => {
    expect(parseRouteUsageState(search('scope=all&route=%20%2Fauth%2F%20&limit=250'))).toEqual({ scope: 'all', route: '/auth/', limit: 250 });
  });

  test('une valeur inconnue retombe sur le défaut', () => {
    expect(parseRouteUsageState(search('scope=tout&limit=7')).scope).toBe('watched');
    expect(parseRouteUsageState(search('scope=tout&limit=7')).limit).toBe(100);
  });

  test('la recherche est bornée : une adresse bricolée ne porte pas un roman', () => {
    expect(parseRouteUsageState(search(`route=${'a'.repeat(500)}`)).route).toHaveLength(120);
  });

  test('écrire garde l’onglet et ne pose que ce qui s’écarte du défaut', () => {
    const base = search('tab=routes');
    const state = withLimit(withRoute(withScope(DEFAULT_ROUTE_USAGE_STATE, 'all'), 'messages'), '500');

    expect(serializeRouteUsageState(state, base).toString()).toBe('tab=routes&scope=all&route=messages&limit=500');
    expect(serializeRouteUsageState(DEFAULT_ROUTE_USAGE_STATE, search('tab=routes&scope=all&route=x&limit=50')).toString()).toBe('tab=routes');
  });

  test('un geste inconnu ne pose rien d’inventé', () => {
    expect(withScope(DEFAULT_ROUTE_USAGE_STATE, 'tout').scope).toBe('watched');
    expect(withLimit(DEFAULT_ROUTE_USAGE_STATE, '3').limit).toBe(100);
  });

  test('la requête porte les noms exacts de la passerelle ; une recherche vide n’est pas envoyée', () => {
    expect(routeUsageRequestQuery(DEFAULT_ROUTE_USAGE_STATE).toString()).toBe('scope=watched&limit=100');
    expect(routeUsageRequestQuery(withRoute(withScope(DEFAULT_ROUTE_USAGE_STATE, 'all'), 'auth')).toString()).toBe('scope=all&limit=100&route=auth');
  });

  test('l’issue liée ouvre son numéro dans le dépôt', () => {
    expect(routeIssueUrl(4181)).toBe('https://github.com/isopen-io/meeshy/issues/4181');
  });
});
