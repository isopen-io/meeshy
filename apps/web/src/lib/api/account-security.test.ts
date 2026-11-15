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
  SESSIONS_QUERY_KEY,
} from './account-security';
import { estClefNonPersistable } from './souverain';
import { API_RESPONSE_CACHE_PATTERN } from '../net/api-runtime-cache';

/**
 * LE PORT DE LA SÉCURITÉ DU COMPTE (#6720) — ce que ces témoins gardent, dans
 * l'ordre de gravité :
 *
 *  1. **tout ce que la passerelle sait d'une session est montré** (décision
 *     porteur du 2026-10-08, qui remplace la projection sans adresse) — et
 *     **rien n'en touche le disque** : la clé descend du préfixe que la
 *     déshydratation exclut ;
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

describe('decodeSession — tout ce que la passerelle sait, rien sur le disque', () => {
  test('l’adresse IP, le pays, la ville, le lieu et le fuseau sont MONTRÉS (décision porteur 2026-10-08)', () => {
    const decoded = decodeSession({ ...servedSession(), timezone: 'Africa/Dakar' });
    expect(decoded?.ipAddress).toBe(IP);
    expect(decoded?.country).toBe('SN');
    expect(decoded?.city).toBe(VILLE);
    expect(decoded?.location).toBe(`${VILLE}, SN`);
    expect(decoded?.timezone).toBe('Africa/Dakar');
  });

  test('… et la clé de leur cache n’est JAMAIS persistée (ni localStorage, ni seau du service worker)', () => {
    expect(estClefNonPersistable(SESSIONS_QUERY_KEY)).toBe(true);
    expect(API_RESPONSE_CACHE_PATTERN.test('https://gate.meeshy.me/api/v1/auth/sessions')).toBe(false);
    expect(API_RESPONSE_CACHE_PATTERN.test('https://gate.meeshy.me/api/v1/auth/sessions?x=1')).toBe(false);
    expect(API_RESPONSE_CACHE_PATTERN.test('https://gate.meeshy.me/api/v1/auth/me')).toBe(true);
  });

  test('la version, le build, la plateforme, le nom d’appareil et le moyen de connexion passent', () => {
    const decoded = decodeSession({
      ...servedSession(),
      appVersion: '2.13.0',
      appBuild: '1874',
      platform: 'android-shell',
      deviceName: 'Pixel 7',
      loginMethod: 'magic_link',
    });
    expect(decoded?.appVersion).toBe('2.13.0');
    expect(decoded?.appBuild).toBe('1874');
    expect(decoded?.platform).toBe('android-shell');
    expect(decoded?.deviceName).toBe('Pixel 7');
    expect(decoded?.loginMethod).toBe('magic_link');
    expect(decoded?.browserVersion).toBe('141');
  });

  test('une plateforme ou un moyen hors contrat ne s’invente pas', () => {
    const decoded = decodeSession({ ...servedSession(), platform: 'windows-phone', loginMethod: 'telepathie' });
    expect(decoded?.platform).toBeNull();
    expect(decoded?.loginMethod).toBeNull();
  });

  test('les clés rendues sont EXACTEMENT celles déclarées — aucune ne se glisse', () => {
    expect(Object.keys(decodeSession({ ...servedSession(), sessionToken: 'secret', refreshToken: 'r' }) ?? {}).sort()).toEqual([
      'appBuild',
      'appVersion',
      'browserName',
      'browserVersion',
      'city',
      'country',
      'createdAt',
      'deviceModel',
      'deviceName',
      'deviceType',
      'deviceVendor',
      'id',
      'ipAddress',
      'isCurrent',
      'isMobile',
      'isTrusted',
      'lastActivityAt',
      'location',
      'loginMethod',
      'osName',
      'osVersion',
      'platform',
      'timezone',
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
    expect(result.ok && result.data.sessions).toHaveLength(1);
  });

  test('l’attribution servie (DB-IP, CC-BY) accompagne la liste ; absente, elle n’est pas inventée', async () => {
    const geolocation = { provider: 'DB-IP', text: 'IP Geolocation by DB-IP', url: 'https://db-ip.com', license: 'CC-BY-4.0', approximate: true };
    const served = await loadActiveSessions({ source: 'gateway', transport: fakeTransport({ ok: true, data: { sessions: [], geolocation } }).transport });
    expect(served.ok && served.data.geolocation).toEqual({ text: 'IP Geolocation by DB-IP', url: 'https://db-ip.com', approximate: true });
    const old = await loadActiveSessions({ source: 'gateway', transport: fakeTransport({ ok: true, data: { sessions: [] } }).transport });
    expect(old.ok && old.data.geolocation).toBeNull();
    const hostile = await loadActiveSessions({ source: 'gateway', transport: fakeTransport({ ok: true, data: { sessions: [], geolocation: { text: 'x', url: 'javascript:alert(1)' } } }).transport });
    expect(hostile.ok && hostile.data.geolocation).toBeNull();
  });

  test('une charge sans `sessions` rend une liste vide, jamais une exception', async () => {
    const { transport } = fakeTransport({ ok: true, data: { totalCount: 0 } });
    const result = await loadActiveSessions({ source: 'gateway', transport });
    expect(result.ok && result.data).toEqual({ sessions: [], geolocation: null });
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
