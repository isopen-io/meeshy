import { describe, expect, test } from 'bun:test';

import {
  adminUserSecurityEventsQueryKey,
  adminUserSessionsQueryKey,
  decodeAdminSecurityEventPage,
  decodeAdminSessionPage,
  loadAdminUserSecurityEvents,
  loadAdminUserSessions,
  revokeAdminUserSession,
} from './admin-user-security';
import { pageServie } from './admin';
import type { HttpTransport } from './http';
import { persistableQuery } from './query-client';
import { resultatServi } from '@/test-support/served-pagination';

/**
 * SESSIONS ET ÉVÉNEMENTS DE SÉCURITÉ D'UN MEMBRE (#7845) —
 * `GET /admin/users/:id/sessions`, `DELETE …/sessions/:sessionId`,
 * `GET …/security-events`, sous `canViewSensitiveData`.
 *
 * C'est ICI, et nulle part ailleurs, que l'empreinte de connexion d'un membre
 * (appareil, IP, lieu) se montre : sous une clé `admin-souverain`, donc jamais
 * écrite sur le disque. `deviceFingerprint` et `metadata` ne sont pas décodés
 * du tout — un identifiant de suivi et un sac libre ne servent aucun geste.
 */

const SESSION = {
  id: 's-1',
  deviceType: 'mobile',
  deviceVendor: 'Apple',
  deviceModel: 'iPhone',
  osName: 'iOS',
  osVersion: '26.0',
  browserName: 'Safari',
  browserVersion: '26',
  isMobile: true,
  ipAddress: '196.0.0.1',
  country: 'SN',
  city: 'Dakar',
  location: 'Dakar, SN',
  latitude: 14.69,
  longitude: -17.44,
  timezone: 'Africa/Dakar',
  isTrusted: true,
  expiresAt: '2026-10-01T00:00:00.000Z',
  isValid: true,
  invalidatedAt: null,
  invalidatedReason: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  lastActivityAt: '2026-09-24T09:00:00.000Z',
  sessionToken: 'hash',
  deviceFingerprint: 'fp',
};

const EVENEMENT = {
  id: 'e-1',
  eventType: 'LOGIN_FAILED',
  severity: 'HIGH',
  status: 'OPEN',
  description: 'Mot de passe erroné',
  metadata: { secret: 'x' },
  ipAddress: '196.0.0.1',
  userAgent: 'Safari',
  deviceFingerprint: 'fp',
  geoLocation: 'Dakar',
  createdAt: '2026-09-24T08:00:00.000Z',
};

const transportEspion = (reponse: unknown, ok = true) => {
  const appels: { path: string; method: string }[] = [];
  const transport = {
    request: async (requete: { path: string; method: string }) => {
      appels.push({ path: requete.path, method: requete.method });
      return ok ? resultatServi(reponse) : reponse;
    },
  } as unknown as HttpTransport;
  return { transport, appels };
};

const deps = (transport: HttpTransport) => ({ source: 'gateway' as const, transport });

const servie = (enveloppe: unknown) => pageServie(resultatServi(enveloppe));

describe('decodeAdminSessionPage', () => {
  test('décode la session, sans jeton, empreinte ni coordonnées', () => {
    const page = decodeAdminSessionPage(servie({ data: [SESSION], pagination: { total: 3, offset: 0, limit: 20, hasMore: true } }), 0);
    const session = page.sessions[0];

    expect(page.total).toBe(3);
    expect(page.hasMore).toBe(true);
    expect(session?.deviceModel).toBe('iPhone');
    expect(session?.ipAddress).toBe('196.0.0.1');
    expect(session?.isValid).toBe(true);
    expect(session?.lastActivityAt).toBe('2026-09-24T09:00:00.000Z');
    for (const interdit of ['sessionToken', 'deviceFingerprint', 'latitude', 'longitude']) {
      expect(Object.keys(session ?? {})).not.toContain(interdit);
    }
  });

  test('une session révoquée reste listée, avec sa raison', () => {
    const session = decodeAdminSessionPage(
      servie({ data: [{ ...SESSION, isValid: false, invalidatedAt: '2026-09-20T00:00:00.000Z', invalidatedReason: 'admin_revoke' }] }),
      0,
    ).sessions[0];

    expect(session?.isValid).toBe(false);
    expect(session?.invalidatedReason).toBe('admin_revoke');
  });

  test('écarte une entrée sans identifiant', () => {
    expect(decodeAdminSessionPage(servie({ data: [{ deviceType: 'x' }] }), 0).sessions).toEqual([]);
  });
});

describe('decodeAdminSecurityEventPage', () => {
  test('décode l’événement, sans `metadata` ni empreinte', () => {
    const evenement = decodeAdminSecurityEventPage(servie({ data: [EVENEMENT] }), 0).events[0];

    expect(evenement?.eventType).toBe('LOGIN_FAILED');
    expect(evenement?.severity).toBe('HIGH');
    expect(evenement?.description).toBe('Mot de passe erroné');
    expect(Object.keys(evenement ?? {})).not.toContain('metadata');
    expect(Object.keys(evenement ?? {})).not.toContain('deviceFingerprint');
  });
});

describe('les lectures et la révocation', () => {
  test('les sessions : GET …/sessions, pagination par offset', async () => {
    const { transport, appels } = transportEspion({ data: [SESSION] });

    const resultat = await loadAdminUserSessions({ ...deps(transport), userId: 'u 1', offset: 20 });

    expect(appels[0]?.method).toBe('GET');
    expect(appels[0]?.path).toBe(`/api/v1/admin/users/${encodeURIComponent('u 1')}/sessions?offset=20&limit=20`);
    expect(resultat.ok && resultat.data.sessions).toHaveLength(1);
  });

  test('les événements : filtres émis seulement s’ils sont demandés', async () => {
    const { transport, appels } = transportEspion({ data: [] });

    await loadAdminUserSecurityEvents({ ...deps(transport), userId: 'u-1', offset: 0 });
    await loadAdminUserSecurityEvents({ ...deps(transport), userId: 'u-1', offset: 0, severity: 'HIGH', eventType: 'LOGIN_FAILED' });

    expect(appels[0]?.path).not.toContain('severity=');
    expect(appels[0]?.path).not.toContain('eventType=');
    expect(appels[1]?.path).toContain('severity=HIGH');
    expect(appels[1]?.path).toContain('eventType=LOGIN_FAILED');
  });

  test('révoquer : DELETE …/sessions/:sessionId, les deux segments encodés', async () => {
    const { transport, appels } = transportEspion({ message: 'ok' });

    const resultat = await revokeAdminUserSession({ ...deps(transport), userId: 'u 1', sessionId: 's/1' });

    expect(appels[0]?.method).toBe('DELETE');
    expect(appels[0]?.path).toBe(`/api/v1/admin/users/${encodeURIComponent('u 1')}/sessions/${encodeURIComponent('s/1')}`);
    expect(resultat).toEqual({ ok: true, data: { sessionId: 's/1' } });
  });

  test('un refus de révocation passe tel quel', async () => {
    const refus = { ok: false as const, status: 403, error: 'Forbidden' };
    const { transport } = transportEspion(refus, false);

    expect(await revokeAdminUserSession({ ...deps(transport), userId: 'u-1', sessionId: 's-1' })).toEqual(refus);
  });
});

describe('les clés ne touchent pas le disque', () => {
  test('sessions et événements descendent de `admin-souverain`', () => {
    const sessions = adminUserSessionsQueryKey('u-1', 0);
    const evenements = adminUserSecurityEventsQueryKey('u-1', 0, 'HIGH', '');

    expect(sessions).toEqual(['admin-souverain', 'user', 'u-1', 'sessions', 0]);
    expect(evenements).toEqual(['admin-souverain', 'user', 'u-1', 'security-events', 0, 'HIGH', '']);
    expect(persistableQuery({ state: { status: 'success' }, queryKey: sessions })).toBe(false);
    expect(persistableQuery({ state: { status: 'success' }, queryKey: evenements })).toBe(false);
  });
});
