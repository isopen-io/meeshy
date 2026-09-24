import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import {
  decodeDevice,
  decodeSession,
  decodeTwoFactorStatus,
  forgetDevice,
  loadActiveSessions,
  loadPushDevices,
  loadTwoFactorStatus,
  revokeOtherSessions,
  revokeSession,
  securityFailureOf,
} from './account-security';

/**
 * LE PORT DE LA SÉCURITÉ DU COMPTE (#6720) — ce que ces témoins gardent, dans
 * l'ordre de gravité :
 *
 *  1. **l'adresse IP et la géolocalisation ne sortent JAMAIS du fil** — le
 *     cache de requêtes est persisté dans le `localStorage`, et ce dépôt n'a
 *     aucun mécanisme d'exemption : ce qui est décodé est écrit sur le disque
 *     du lecteur ;
 *  2. une protection absente de la charge n'est pas annoncée (fail-closed) ;
 *  3. une fermeture déjà faite n'alarme pas.
 */

function fakeTransport(result: ApiResult<unknown>) {
  const requests: HttpRequest[] = [];
  const transport = (async () => result) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    requests.push(req);
    return result;
  }) as HttpTransport['request'];
  return { transport, requests };
}

const IP = '203.0.113.7';
const VILLE = 'Dakar';

/** La charge de `GET /auth/sessions` telle que `magic-link.ts:539-560` la sert. */
const servedSession = () => ({
  id: 'sess-1',
  deviceType: 'desktop',
  deviceVendor: 'Apple',
  deviceModel: 'MacBook Pro',
  osName: 'macOS',
  osVersion: '15.2',
  browserName: 'Chrome',
  browserVersion: '141',
  isMobile: false,
  ipAddress: IP,
  country: 'SN',
  city: VILLE,
  location: `${VILLE}, SN`,
  createdAt: '2026-09-01T10:00:00.000Z',
  lastActivityAt: '2026-09-16T08:00:00.000Z',
  isCurrentSession: true,
  isTrusted: true,
});

describe('decodeSession — ce qui reste sur le fil', () => {
  /**
   * LE TÉMOIN LE PLUS IMPORTANT DE CE FICHIER. Le cache est persisté
   * (`query-client.ts § persist`) : tout ce que ce décodeur laisse passer est
   * écrit DURABLEMENT dans le `localStorage` du lecteur. `session.ts` refuse
   * déjà de persister `lastLoginIp`/`lastLoginLocation` pour la session
   * courante — les servir ici pour TOUTES les sessions annulerait cette règle.
   */
  test('l’adresse IP, le pays, la ville et le lieu sont JETÉS', () => {
    const decoded = decodeSession(servedSession());
    const porte = JSON.stringify(decoded);
    for (const secret of [IP, VILLE, 'SN']) {
      expect({ secret, porte: porte.includes(secret) }).toEqual({ secret, porte: false });
    }
  });

  test('les clés rendues sont EXACTEMENT celles déclarées — aucune ne se glisse', () => {
    expect(Object.keys(decodeSession(servedSession()) ?? {}).sort()).toEqual([
      'browserName',
      'createdAt',
      'deviceModel',
      'deviceType',
      'deviceVendor',
      /* `id` EST rendu, et doit l'être : c'est ce que vise la fermeture d'une
         session. Son absence de cette liste était une faute du témoin, pas du
         décodeur — un témoin d'inventaire se trompe en OUBLIANT, jamais en
         inventant. */
      'id',
      'isCurrent',
      'isMobile',
      'isTrusted',
      'lastActivityAt',
      'osName',
      'osVersion',
    ]);
  });

  test('ce qui reste suffit à RECONNAÎTRE l’appareil', () => {
    const decoded = decodeSession(servedSession());
    expect(decoded?.deviceVendor).toBe('Apple');
    expect(decoded?.deviceModel).toBe('MacBook Pro');
    expect(decoded?.osName).toBe('macOS');
    expect(decoded?.browserName).toBe('Chrome');
    expect(decoded?.isCurrent).toBe(true);
  });

  test('les marqueurs absents sont FAUX, jamais supposés vrais', () => {
    const { isCurrentSession: _c, isTrusted: _t, isMobile: _m, ...sans } = servedSession();
    const decoded = decodeSession(sans);
    expect(decoded?.isCurrent).toBe(false);
    expect(decoded?.isTrusted).toBe(false);
    expect(decoded?.isMobile).toBe(false);
  });

  test('une ligne sans identifiant est illisible, jamais une session vide', () => {
    const { id: _id, ...sans } = servedSession();
    expect(decodeSession(sans)).toBeNull();
    expect(decodeSession(null)).toBeNull();
  });

  test('un texte vide devient `null` — jamais une chaîne qui ressemble à une valeur', () => {
    expect(decodeSession({ ...servedSession(), deviceModel: '   ' })?.deviceModel).toBeNull();
  });
});

describe('loadActiveSessions — GET /api/v1/auth/sessions', () => {
  test('lit la liste DANS `data.sessions`, et jette les lignes illisibles', async () => {
    const { transport, requests } = fakeTransport({
      ok: true,
      data: { sessions: [servedSession(), { deviceType: 'sans id' }], totalCount: 2 },
    });
    const result = await loadActiveSessions({ source: 'gateway', transport });
    expect(requests.map((r) => [r.method, r.path])).toEqual([['GET', '/api/v1/auth/sessions']]);
    expect(result.ok && result.data).toHaveLength(1);
  });

  test('une charge sans `sessions` rend une liste vide, jamais une exception', async () => {
    const { transport } = fakeTransport({ ok: true, data: { totalCount: 0 } });
    const result = await loadActiveSessions({ source: 'gateway', transport });
    expect(result.ok && result.data).toEqual([]);
  });

  test('un refus traverse tel quel', async () => {
    const { transport } = fakeTransport({ ok: false, status: 401, error: 'non authentifié' });
    const result = await loadActiveSessions({ source: 'gateway', transport });
    expect(result).toEqual({ ok: false, status: 401, error: 'non authentifié' });
  });

  /* Même raison que `admin.ts` : une démonstration afficherait des appareils
     INVENTÉS, dont l'un se dirait « cet appareil ». */
  test('en fixtures : rien n’est servi, et AUCUNE requête ne part', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: { sessions: [servedSession()] } });
    const result = await loadActiveSessions({ source: 'fixtures', transport });
    expect(result.ok).toBe(false);
    expect(requests).toHaveLength(0);
  });
});

describe('fermer des sessions', () => {
  test('en fermer UNE vise son identifiant, encodé', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: { message: 'ok' } });
    await revokeSession({ source: 'gateway', transport }, 'sess 1/2');
    expect(requests.map((r) => [r.method, r.path])).toEqual([['DELETE', '/api/v1/auth/sessions/sess%201%2F2']]);
  });

  /* « 3 sessions fermées » se dit ; « des sessions ont été fermées » se devine. */
  test('fermer LES AUTRES rend le nombre réellement fermé', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: { message: 'ok', revokedCount: 3 } });
    const result = await revokeOtherSessions({ source: 'gateway', transport });
    expect(requests.map((r) => [r.method, r.path])).toEqual([['DELETE', '/api/v1/auth/sessions']]);
    expect(result.ok && result.data).toBe(3);
  });

  test('un compte absent rend zéro plutôt qu’un nombre inventé', async () => {
    const { transport } = fakeTransport({ ok: true, data: { message: 'ok' } });
    const result = await revokeOtherSessions({ source: 'gateway', transport });
    expect(result.ok && result.data).toBe(0);
  });
});

describe('decodeDevice — les appareils de push', () => {
  const servedDevice = () => ({
    id: 'dev-1',
    type: 'apns',
    platform: 'ios',
    deviceId: 'abc',
    deviceName: 'iPhone d’Awa',
    appVersion: '1.0.7',
    isActive: true,
    lastUsedAt: '2026-09-16T08:00:00.000Z',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-16T08:00:00.000Z',
  });

  test('rend ce que l’écran montre, et le jeton n’en fait pas partie', () => {
    const decoded = decodeDevice(servedDevice());
    expect(decoded?.kind).toBe('apns');
    expect(decoded?.platform).toBe('ios');
    expect(decoded?.deviceName).toBe('iPhone d’Awa');
    expect(Object.keys(decoded ?? {})).not.toContain('deviceId');
  });

  test('un genre ou une plateforme hors liste ne s’invente pas', () => {
    const decoded = decodeDevice({ ...servedDevice(), type: 'pigeon', platform: 'betamax' });
    expect(decoded?.kind).toBeNull();
    expect(decoded?.platform).toBeNull();
  });

  /* `isActive` ABSENT ⇒ actif : la passerelle ne sert `false` que pour un
     appareil désarmé, et supposer l'inverse ferait disparaître de la liste des
     appareils bien vivants. */
  test('`isActive` absent ⇒ actif ; explicitement faux ⇒ inactif', () => {
    const { isActive: _a, ...sans } = servedDevice();
    expect(decodeDevice(sans)?.isActive).toBe(true);
    expect(decodeDevice({ ...servedDevice(), isActive: false })?.isActive).toBe(false);
  });

  test('oublier un appareil vise son identifiant, encodé', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: { message: 'ok' } });
    await forgetDevice({ source: 'gateway', transport }, 'dev/1');
    expect(requests.map((r) => [r.method, r.path])).toEqual([['DELETE', '/api/v1/users/me/devices/dev%2F1']]);
  });

  test('la liste jette les lignes illisibles', async () => {
    const { transport } = fakeTransport({ ok: true, data: [servedDevice(), { type: 'apns' }] });
    const result = await loadPushDevices({ source: 'gateway', transport });
    expect(result.ok && result.data).toHaveLength(1);
  });
});

describe('decodeTwoFactorStatus — fail-closed', () => {
  test('rend l’état servi', () => {
    expect(
      decodeTwoFactorStatus({ enabled: true, enabledAt: '2026-09-01T10:00:00.000Z', hasBackupCodes: true, backupCodesCount: 8 }),
    ).toEqual({ enabled: true, enabledAt: '2026-09-01T10:00:00.000Z', hasBackupCodes: true, backupCodesCount: 8 });
  });

  /* Annoncer une protection qu'on n'a pas mesurée est pire que de la taire. */
  test('une charge vide, ou illisible, n’annonce AUCUNE protection', () => {
    for (const charge of [{}, null, 'non', 42]) {
      expect(decodeTwoFactorStatus(charge)).toEqual({
        enabled: false,
        enabledAt: null,
        hasBackupCodes: false,
        backupCodesCount: 0,
      });
    }
  });

  test('un compte de codes absurde retombe à zéro', () => {
    expect(decodeTwoFactorStatus({ enabled: true, backupCodesCount: -3 }).backupCodesCount).toBe(0);
    expect(decodeTwoFactorStatus({ enabled: true, backupCodesCount: Number.NaN }).backupCodesCount).toBe(0);
  });

  test('la lecture vise la route du statut', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: { enabled: false } });
    await loadTwoFactorStatus({ source: 'gateway', transport });
    expect(requests.map((r) => [r.method, r.path])).toEqual([['GET', '/api/v1/auth/2fa/status']]);
  });
});

describe('securityFailureOf — une cause, jamais un statut', () => {
  /* Une session déjà fermée n'est pas une panne : c'est le résultat voulu. */
  test('404 sur une fermeture est un succès déguisé, nommé comme tel', () => {
    expect(securityFailureOf({ status: 404 })).toBe('not-found');
  });

  test('401 dit que la session a expiré, 0 qu’on est hors ligne', () => {
    expect(securityFailureOf({ status: 401 })).toBe('signed-out');
    expect(securityFailureOf({ status: 0 })).toBe('offline');
  });

  test('tout le reste reste indisponible — on ne devine pas une cause', () => {
    for (const status of [403, 429, 500, 502]) {
      expect(securityFailureOf({ status })).toBe('unavailable');
    }
  });
});
