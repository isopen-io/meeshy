import { describe, expect, test } from 'bun:test';

import { resolveRouteAccess, type RouteKey } from './session-guard';

/**
 * LA PORTE (#5555, T7) — pure. Fixtures ⇒ toujours `allow` (les captures et le
 * POC ne changent pas) ; passerelle réelle ⇒ les routes PRIVÉES exigent une
 * session, les routes PUBLIQUES d'authentification en refusent une active.
 */

const PRIVATE_ROUTES: readonly RouteKey[] = ['list', 'thread'];
const PUBLIC_AUTH_ROUTES: readonly RouteKey[] = ['login', 'signup'];

describe('resolveRouteAccess — source fixtures : toujours allow (les deux moitiés du seuil)', () => {
  test('toute route, tout statut ⇒ allow', () => {
    for (const routeKey of [...PRIVATE_ROUTES, ...PUBLIC_AUTH_ROUTES]) {
      for (const sessionStatus of ['anonymous', 'pending2fa', 'authenticated'] as const) {
        expect(resolveRouteAccess({ sessionStatus, source: 'fixtures', routeKey })).toBe('allow');
      }
    }
  });
});

describe('resolveRouteAccess — source gateway, visiteur anonyme sur une route PRIVÉE ⇒ redirect-login', () => {
  test('list', () => expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey: 'list' })).toBe('redirect-login'));
  test('thread', () => expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey: 'thread' })).toBe('redirect-login'));
});

describe('resolveRouteAccess — source gateway, session ACTIVE sur login/signup ⇒ redirect-home', () => {
  test('login', () => expect(resolveRouteAccess({ sessionStatus: 'authenticated', source: 'gateway', routeKey: 'login' })).toBe('redirect-home'));
  test('signup', () => expect(resolveRouteAccess({ sessionStatus: 'authenticated', source: 'gateway', routeKey: 'signup' })).toBe('redirect-home'));
});

describe('resolveRouteAccess — source gateway, visiteur anonyme sur login/signup ⇒ allow', () => {
  test('login', () => expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey: 'login' })).toBe('allow'));
  test('signup', () => expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey: 'signup' })).toBe('allow'));
});

describe('resolveRouteAccess — pending2fa sur login : l’écran 2FA y vit', () => {
  test('login ⇒ allow', () => {
    expect(resolveRouteAccess({ sessionStatus: 'pending2fa', source: 'gateway', routeKey: 'login' })).toBe('allow');
  });
});

describe('resolveRouteAccess — source gateway, session ACTIVE sur une route PRIVÉE ⇒ allow', () => {
  test('list', () => expect(resolveRouteAccess({ sessionStatus: 'authenticated', source: 'gateway', routeKey: 'list' })).toBe('allow'));
  test('thread', () => expect(resolveRouteAccess({ sessionStatus: 'authenticated', source: 'gateway', routeKey: 'thread' })).toBe('allow'));
});
