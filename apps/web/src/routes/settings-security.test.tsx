import { QueryClient } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { SESSIONS_QUERY_KEY, type ActiveSession, type ActiveSessions } from '@/lib/api/account-security';
import type { ApiResult } from '@/lib/api/http';
import { loadSessionsCatalog } from '@/lib/i18n-sessions-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SettingsSecurityScreen, type SecurityScreenDeps } from './settings-security';

/**
 * SÉCURITÉ > SESSIONS (#6720) — la courante en tête et sans geste, tout ce que
 * la passerelle sait de chaque session, l'attribution DB-IP, la fermeture
 * optimiste qui se défait sur un refus, et les états dessinés.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click, settle } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadSessionsCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(unmountAll);

const session = (overrides: Partial<ActiveSession>): ActiveSession => ({
  id: 's',
  deviceType: 'desktop',
  deviceVendor: null,
  deviceModel: null,
  deviceName: null,
  osName: 'macOS',
  osVersion: '15.2',
  browserName: 'Chrome',
  browserVersion: '141',
  isMobile: false,
  appVersion: '2.13.0',
  appBuild: null,
  platform: 'web',
  loginMethod: 'password',
  ipAddress: '203.0.113.7',
  country: 'SN',
  city: 'Dakar',
  location: 'Dakar, SN',
  timezone: 'Africa/Dakar',
  createdAt: '2026-10-01T08:00:00.000Z',
  lastActivityAt: '2026-10-08T11:00:00.000Z',
  isCurrent: false,
  isTrusted: false,
  ...overrides,
});

const GEO = { text: 'IP Geolocation by DB-IP', url: 'https://db-ip.com', approximate: true };

const served = (): ActiveSessions => ({
  sessions: [session({ id: 'autre', deviceName: 'Pixel 7', platform: 'android-shell' }), session({ id: 'ici', isCurrent: true })],
  geolocation: GEO,
});

function harness(overrides: Partial<SecurityScreenDeps> = {}) {
  const calls: string[] = [];
  /* Le serveur simulé RETIENT ce qu'il ferme : la relecture qui suit une fermeture le reflète. */
  const server = { state: served() };
  const deps: SecurityScreenDeps = {
    load: async () => ({ ok: true, data: server.state, status: 200 }),
    revoke: async (id) => {
      calls.push(`revoke:${id}`);
      server.state = { ...server.state, sessions: server.state.sessions.filter((s) => s.id !== id) };
      return { ok: true, data: {}, status: 200 };
    },
    revokeOthers: async () => {
      calls.push('others');
      server.state = { ...server.state, sessions: server.state.sessions.filter((s) => s.isCurrent) };
      return { ok: true, data: 1, status: 200 };
    },
    ...overrides,
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const element = <SettingsSecurityScreen language="fr" deps={deps} queryClient={queryClient} now={() => new Date('2026-10-08T12:00:00.000Z')} />;
  return { element, calls, queryClient };
}

describe('la liste', () => {
  test('la courante en tête, marquée, SANS bouton de fermeture ; les autres en ont un', async () => {
    const { element } = harness();
    const host = await mount(element);
    await settle();
    const cards = [...host.querySelectorAll('[data-session]')];
    expect(cards.map((card) => card.getAttribute('data-session'))).toEqual(['ici', 'autre']);
    expect(cards[0]?.textContent).toContain('Cet appareil');
    expect(cards[0]?.querySelector('[data-session-revoke]')).toBeNull();
    expect(cards[1]?.querySelector('[data-session-revoke]')?.getAttribute('aria-label')).toBe('Fermer la session Pixel 7');
  });

  test('chaque session dit tout ce que la passerelle sait, la ville « approximative »', async () => {
    const { element } = harness();
    const host = await mount(element);
    await settle();
    const card = host.querySelector('[data-session="autre"]');
    const fields = [...(card?.querySelectorAll('[data-session-field]') ?? [])].map((field) => field.getAttribute('data-session-field'));
    expect(fields).toEqual(['app', 'platform', 'system', 'browser', 'ip', 'place', 'timezone', 'opened', 'lastActive', 'method']);
    expect(card?.querySelector('[data-session-field="place"]')?.textContent).toContain('approximatif');
    expect(card?.querySelector('[data-session-field="ip"] dd')?.getAttribute('dir')).toBe('ltr');
  });

  test('l’attribution DB-IP servie est un lien vers db-ip.com', async () => {
    const { element } = harness();
    const host = await mount(element);
    await settle();
    const link = host.querySelector<HTMLAnchorElement>('[data-sessions-attribution] a');
    expect(link?.textContent).toBe('IP Geolocation by DB-IP');
    expect(link?.getAttribute('href')).toBe('https://db-ip.com');
    expect(link?.getAttribute('rel')).toContain('noopener');
  });

  test('cache d’abord : une liste en cache se peint au premier rendu, sans squelette', async () => {
    const { element, queryClient } = harness({ load: () => new Promise<ApiResult<ActiveSessions>>(() => undefined) });
    queryClient.setQueryData(SESSIONS_QUERY_KEY, served());
    const host = await mount(element);
    expect(host.querySelector('[data-sessions-loading]')).toBeNull();
    expect(host.querySelectorAll('[data-session]')).toHaveLength(2);
  });
});

describe('les états dessinés', () => {
  test('cache vide : un squelette annoncé', async () => {
    const { element } = harness({ load: () => new Promise<ApiResult<ActiveSessions>>(() => undefined) });
    const host = await mount(element);
    expect(host.querySelector('[data-sessions-loading]')?.getAttribute('aria-label')).toBe('Chargement des sessions…');
  });

  test('erreur : la cause et « Réessayer »', async () => {
    const { element } = harness({ load: async () => ({ ok: false, status: 500, error: 'panne' }) });
    const host = await mount(element);
    await settle();
    const error = host.querySelector('[data-sessions-error]');
    expect(error?.getAttribute('data-sessions-error')).toBe('unavailable');
    expect(error?.textContent).toContain('Réessayer');
  });

  test('vide : dit, jamais une liste blanche', async () => {
    const { element } = harness({ load: async () => ({ ok: true, data: { sessions: [], geolocation: null }, status: 200 }) });
    const host = await mount(element);
    await settle();
    expect(host.querySelector('[data-sessions-empty]')?.textContent).toContain('Aucune session active');
  });

  test('seul appareil : pas de « Déconnecter les autres », mais le dit', async () => {
    const { element } = harness({ load: async () => ({ ok: true, data: { sessions: [session({ id: 'ici', isCurrent: true })], geolocation: GEO }, status: 200 }) });
    const host = await mount(element);
    await settle();
    expect(host.querySelector('[data-sessions-revoke-others]')).toBeNull();
    expect(host.querySelector('[data-sessions-alone]')).not.toBeNull();
  });
});

describe('fermer', () => {
  test('une session : confirmation, retrait immédiat, appel, annonce', async () => {
    const { element, calls } = harness();
    const host = await mount(element);
    await settle();
    const revoke = host.querySelector<HTMLButtonElement>('[data-session="autre"] [data-session-revoke]');
    if (revoke !== null) await click(revoke);
    expect(calls).toEqual([]);
    const dialog = document.querySelector('[data-confirm-dialog="revoke-session"]');
    expect(dialog?.textContent).toContain('Pixel 7');
    const confirm = [...(dialog?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((button) => button.textContent === 'Fermer cette session') ?? null;
    if (confirm !== null) await click(confirm);
    await settle();
    expect(calls).toEqual(['revoke:autre']);
    expect(host.querySelector('[data-session="autre"]')).toBeNull();
    expect(host.querySelector('[data-sessions-announce]')?.textContent).toBe('Session fermée');
  });

  test('un refus remet la ligne et le dit', async () => {
    const { element } = harness({ revoke: async () => ({ ok: false, status: 500, error: 'panne' }), load: async () => ({ ok: true, data: served(), status: 200 }) });
    const host = await mount(element);
    await settle();
    const revoke = host.querySelector<HTMLButtonElement>('[data-session="autre"] [data-session-revoke]');
    if (revoke !== null) await click(revoke);
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('[data-confirm-dialog] button')].find((button) => button.textContent === 'Fermer cette session') ?? null;
    if (confirm !== null) await click(confirm);
    await settle();
    expect(host.querySelector('[data-session="autre"]')).not.toBeNull();
    expect(host.querySelector('[data-sessions-announce]')?.textContent).toBe('La session n’a pas pu être fermée. Réessayez.');
  });

  test('les autres appareils : la courante reste, le nombre fermé est dit', async () => {
    const { element, calls } = harness();
    const host = await mount(element);
    await settle();
    const others = host.querySelector<HTMLButtonElement>('[data-sessions-revoke-others]');
    if (others !== null) await click(others);
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('[data-confirm-dialog] button')].find((button) => button.textContent === 'Déconnecter les autres appareils') ?? null;
    if (confirm !== null) await click(confirm);
    await settle();
    expect(calls).toEqual(['others']);
    expect([...host.querySelectorAll('[data-session]')].map((card) => card.getAttribute('data-session'))).toEqual(['ici']);
    expect(host.querySelector('[data-sessions-announce]')?.textContent).toBe('Une session fermée');
  });
});
