import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { adminUserStatsQueryKey } from '@/lib/api/admin-user-stats';
import { appQueryClient, persistableQuery } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { createActMounter, typeInto } from '@/test-support/act-mount';
import { pathOf, queryOf, routedTransport } from '@/test-support/admin-member';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminUserSecurityPanel } from './admin-user-security';

/**
 * **SESSIONS, ÉVÉNEMENTS, BANNISSEMENTS** (#7845) — l'onglet Sécurité. Une
 * révocation coupe un appareil : elle se CONFIRME, puis part en `DELETE`, et la
 * ligne dit « révoquée » sans relire la liste. Et rien de ce que cet onglet lit
 * n'atteint le disque.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadAdminInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

const SESSIONS = [
  { id: 's-mac', browserName: 'Safari', browserVersion: '18', osName: 'macOS', ipAddress: '203.0.113.7', city: 'Lyon', country: 'FR', isValid: true, lastActivityAt: '2026-09-20T10:00:00.000Z' },
  { id: 's-vieux', browserName: 'Firefox', osName: 'Linux', isValid: false, invalidatedAt: '2026-09-01T10:00:00.000Z' },
];

const EVENEMENTS = [{ id: 'e1', eventType: 'LOGIN_FAILED', severity: 'HIGH', status: 'OPEN', description: 'Trois échecs', createdAt: '2026-09-19T10:00:00.000Z' }];

const BANS = [{ id: 'b1', reason: 'Spam répété', createdAt: '2026-08-01T10:00:00.000Z', expiresAt: '2026-08-08T10:00:00.000Z', liftedAt: null, active: false }];

const page = (data: readonly unknown[]) => ({ ok: true, data, pagination: { total: data.length, offset: 0, limit: 20, hasMore: false } }) as never;

function transport() {
  return routedTransport((req) => {
    const chemin = pathOf(req);
    if (req.method === 'DELETE' && chemin.endsWith('/sessions/s-mac')) return { ok: true, data: { message: 'ok' } };
    if (chemin.endsWith('/sessions')) return page(SESSIONS);
    if (chemin.endsWith('/security-events')) return page(EVENEMENTS);
    if (chemin.endsWith('/bans')) return { ok: true, data: BANS };
    return undefined;
  });
}

async function monter(t = transport()) {
  const annonces: string[] = [];
  const host = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminUserSecurityPanel userId="u-membre" language="fr" deps={{ source: 'gateway', transport: t.transport }} onAnnounce={(x) => annonces.push(x)} />
    </QueryClientProvider>,
  );
  return { host, annonces, calls: t.calls };
}

describe('les sessions', () => {
  test('chaque session est listée, vivante ou révoquée', async () => {
    const { host } = await monter();
    expect(host.querySelector('[data-admin-session="s-mac"]')?.textContent ?? '').toContain('Safari');
    expect(host.querySelector('[data-admin-session="s-mac"]')?.textContent ?? '').toContain('Lyon');
    expect(host.querySelector('[data-admin-session="s-vieux"] [data-admin-session-state]')?.textContent).toBe(
      translateAdmin('fr', 'admin.security.revoked'),
    );
  });

  test('seule une session VIVANTE se révoque', async () => {
    const { host } = await monter();
    expect(host.querySelector('[data-admin-session-revoke="s-mac"]')).not.toBe(null);
    expect(host.querySelector('[data-admin-session-revoke="s-vieux"]')).toBe(null);
  });

  test('révoquer se CONFIRME, puis part en DELETE, et la ligne le dit', async () => {
    const { host, calls, annonces } = await monter();
    const bouton = () => host.querySelector('[data-admin-session-revoke="s-mac"]') as HTMLElement | null;

    await mounter.click(bouton());
    expect(calls().some((c) => c.method === 'DELETE')).toBe(false);
    expect(bouton()?.textContent).toBe(translateAdmin('fr', 'admin.edit.confirm'));

    await mounter.click(bouton());
    expect(calls().find((c) => c.method === 'DELETE')?.path).toBe('/api/v1/admin/users/u-membre/sessions/s-mac');
    expect(host.querySelector('[data-admin-session="s-mac"] [data-admin-session-state]')?.textContent).toBe(
      translateAdmin('fr', 'admin.security.revoked'),
    );
    expect(annonces).toContain(translateAdmin('fr', 'admin.security.revoked.done'));
  });

  test('révoquer rend PÉRIMÉ le compteur de sessions actives de la fiche', async () => {
    const { host } = await monter();
    appQueryClient.setQueryData(adminUserStatsQueryKey('u-membre'), { counts: {}, languages: [] });
    const bouton = () => host.querySelector('[data-admin-session-revoke="s-mac"]') as HTMLElement | null;
    await mounter.click(bouton());
    await mounter.click(bouton());
    expect(appQueryClient.getQueryState(adminUserStatsQueryKey('u-membre'))?.isInvalidated).toBe(true);
  });

  test('la dernière activité se compose par le CATALOGUE — la ponctuation est celle de la langue', async () => {
    const { host } = await monter();
    const gabarit = translateAdmin('fr', 'admin.security.lastActiveOn', { date: '\u0000' });
    const [avant] = gabarit.split('\u0000');
    expect(host.querySelector('[data-admin-session="s-mac"]')?.textContent ?? '').toContain(avant ?? '');
  });
});

describe('les événements et les bannissements', () => {
  test('un événement dit son type et sa gravité', async () => {
    const { host } = await monter();
    const ligne = host.querySelector('[data-admin-security-event="e1"]')?.textContent ?? '';
    expect(ligne).toContain('LOGIN_FAILED');
    expect(ligne).toContain(translateAdmin('fr', 'admin.security.severity.high'));
    expect(ligne).not.toContain('HIGH');
  });

  test('filtrer par gravité relance la lecture avec `severity`', async () => {
    const { host, calls } = await monter();
    typeInto(host.querySelector('[data-admin-security-severity]') as HTMLSelectElement, 'CRITICAL');
    await mounter.settle();
    const derniere = calls().filter((c) => pathOf(c).endsWith('/security-events')).at(-1);
    expect(derniere === undefined ? null : queryOf(derniere).get('severity')).toBe('CRITICAL');
  });

  test('l’historique des bannissements est sur la page, expiré dit expiré', async () => {
    const { host } = await monter();
    expect(host.querySelector('[data-admin-ban-history="b1"]')?.getAttribute('data-admin-ban-state')).toBe('expired');
  });
});

describe('rien ne touche le disque', () => {
  test('les clés des sessions et des événements sont exemptées de la persistance', async () => {
    await monter();
    const cles = appQueryClient
      .getQueryCache()
      .getAll()
      .filter((q) => q.queryKey.includes('sessions') || q.queryKey.includes('security-events'));
    expect(cles.length).toBeGreaterThan(0);
    expect(cles.every((q) => q.state.status === 'success' && !persistableQuery(q))).toBe(true);
  });
});
