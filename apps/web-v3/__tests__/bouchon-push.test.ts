/**
 * `e2e/visual/lib/bouchon-push.ts` — LE BOUCHON DE
 * `POST`/`DELETE /api/v1/users/register-device-token` (#5391), copié sur
 * `services/gateway/src/routes/push-tokens.ts:72,264`. Ce témoin vit dans
 * `__tests__/` (jest exclut `/e2e/` de son périmètre) et importe le module
 * de bouchon directement — la même relation que `bouchon-preferences.ts` a
 * avec ses propres témoins e2e, en plus rapide à exécuter.
 */

import { routesDuPush, type AppareilDeBouchon } from '@/e2e/visual/lib/bouchon-push';

type Reponses = { corps: unknown; statut: number }[];

const dispatche = (
  appareils: AppareilDeBouchon[],
  options: { readonly method: string; readonly pathname: string; readonly corps: unknown },
): Reponses => {
  const reponses: Reponses = [];
  const traite = routesDuPush(appareils);
  const intercepte = traite({
    requete: { method: options.method } as never,
    url: new URL(`https://gate.test${options.pathname}`),
    corps: Buffer.from(JSON.stringify(options.corps)),
    json: (corps: unknown, statut = 200) => {
      reponses.push({ corps, statut });
    },
  });
  expect(intercepte).toBe(true);
  return reponses;
};

describe('routesDuPush — POST /api/v1/users/register-device-token', () => {
  it('crée une entrée neuve avec isNew=true', () => {
    const appareils: AppareilDeBouchon[] = [];

    const reponses = dispatche(appareils, {
      method: 'POST',
      pathname: '/api/v1/users/register-device-token',
      corps: { token: 'fcm-token-1', platform: 'web', deviceId: 'device-1' },
    });

    expect(reponses[0]?.statut).toBe(200);
    expect((reponses[0]?.corps as { success: boolean }).success).toBe(true);
    expect((reponses[0]?.corps as { data: { isNew: boolean } }).data.isNew).toBe(true);
    expect(appareils).toHaveLength(1);
    expect(appareils[0]).toMatchObject({ token: 'fcm-token-1', platform: 'web', deviceId: 'device-1', type: 'fcm', isActive: true });
  });

  it('un second POST du MÊME token/type met à jour — isNew=false', () => {
    const appareils: AppareilDeBouchon[] = [];
    dispatche(appareils, { method: 'POST', pathname: '/api/v1/users/register-device-token', corps: { token: 't1', platform: 'web', deviceId: 'd1' } });

    const reponses = dispatche(appareils, {
      method: 'POST',
      pathname: '/api/v1/users/register-device-token',
      corps: { token: 't1', platform: 'web', deviceId: 'd1', deviceName: 'Chrome' },
    });

    expect((reponses[0]?.corps as { data: { isNew: boolean } }).data.isNew).toBe(false);
    expect(appareils).toHaveLength(1);
    expect(appareils[0]?.deviceName).toBe('Chrome');
  });

  it('un token sans platform est refusé — 400', () => {
    const appareils: AppareilDeBouchon[] = [];

    const reponses = dispatche(appareils, { method: 'POST', pathname: '/api/v1/users/register-device-token', corps: { token: 't1' } });

    expect(reponses[0]?.statut).toBe(400);
    expect(appareils).toHaveLength(0);
  });
});

describe('routesDuPush — DELETE /api/v1/users/register-device-token', () => {
  it('retire par deviceId — les autres appareils survivent', () => {
    const appareils: AppareilDeBouchon[] = [
      { id: 'pt-1', deviceName: '', platform: 'web', lastUsedAt: null, deviceId: 'd1', type: 'fcm', isActive: true, token: 't1' },
      { id: 'pt-2', deviceName: '', platform: 'ios', lastUsedAt: null, deviceId: 'd2', type: 'apns', isActive: true, token: 't2' },
    ];

    const reponses = dispatche(appareils, { method: 'DELETE', pathname: '/api/v1/users/register-device-token', corps: { deviceId: 'd1' } });

    expect((reponses[0]?.corps as { data: { deletedCount: number } }).data.deletedCount).toBe(1);
    expect(appareils).toHaveLength(1);
    expect(appareils[0]?.deviceId).toBe('d2');
  });

  it('un deviceId inconnu retire zéro entrée', () => {
    const appareils: AppareilDeBouchon[] = [
      { id: 'pt-1', deviceName: '', platform: 'web', lastUsedAt: null, deviceId: 'd1', type: 'fcm', isActive: true, token: 't1' },
    ];

    const reponses = dispatche(appareils, { method: 'DELETE', pathname: '/api/v1/users/register-device-token', corps: { deviceId: 'inconnu' } });

    expect((reponses[0]?.corps as { data: { deletedCount: number } }).data.deletedCount).toBe(0);
    expect(appareils).toHaveLength(1);
  });
});

describe('routesDuPush — un chemin étranger n’est jamais intercepté', () => {
  it('rend false sur un autre chemin', () => {
    const appareils: AppareilDeBouchon[] = [];
    const traite = routesDuPush(appareils);
    const intercepte = traite({
      requete: { method: 'GET' } as never,
      url: new URL('https://gate.test/api/v1/users/me/devices'),
      corps: Buffer.from(''),
      json: () => undefined,
    });
    expect(intercepte).toBe(false);
  });
});
