/**
 * @jest-environment node
 */

import {
  appareilsDuLecteur,
  enregistreLeJetonPush,
  retireLeJetonPush,
} from '@/lib/api/push-tokens';

/**
 * `lib/api/push-tokens.ts` — les trois appels réels du push web (#5391),
 * spécification § 2.1-2.3 : `POST`/`DELETE /users/register-device-token`,
 * `GET /users/me/devices` (`services/gateway/src/routes/push-tokens.ts`).
 */

const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

describe('enregistreLeJetonPush — POST /users/register-device-token', () => {
  it('poste EXACTEMENT { token, type: fcm, platform: web, deviceId, deviceName }', async () => {
    const vus: { url: string; options: RequestInit }[] = [];
    const recuperer = async (url: string, options: RequestInit): Promise<Response> => {
      vus.push({ url, options });
      return json({ success: true, data: { id: 'pt-1', isNew: true } });
    };

    const issue = await enregistreLeJetonPush({
      jeton: 'jwt-1',
      token: 'fcm-token-abc',
      deviceId: 'device-1',
      recuperer,
    });

    expect(issue).toEqual({ genre: 'fait' });
    expect(vus).toHaveLength(1);
    expect(vus[0]?.url).toMatch(/\/api\/v1\/users\/register-device-token$/);
    expect(vus[0]?.options.method).toBe('POST');
    expect(JSON.parse(String(vus[0]?.options.body))).toEqual({
      token: 'fcm-token-abc',
      type: 'fcm',
      platform: 'web',
      deviceId: 'device-1',
      deviceName: 'Web v3',
    });
    expect((vus[0]?.options.headers as Record<string, string>).authorization).toBe('Bearer jwt-1');
  });

  it('rend session-expiree sur un 401', async () => {
    const issue = await enregistreLeJetonPush({
      jeton: 'jwt-1',
      token: 't',
      deviceId: 'd',
      recuperer: async () => json({ success: false }, 401),
    });
    expect(issue).toEqual({ genre: 'session-expiree' });
  });

  it('rend panne sur une exception réseau', async () => {
    const issue = await enregistreLeJetonPush({
      jeton: 'jwt-1',
      token: 't',
      deviceId: 'd',
      recuperer: async () => {
        throw new Error('coupé');
      },
    });
    expect(issue).toEqual({ genre: 'panne' });
  });
});

describe('retireLeJetonPush — DELETE /users/register-device-token', () => {
  it('poste EXACTEMENT { deviceId } — jamais un corps vide', async () => {
    const vus: { url: string; options: RequestInit }[] = [];
    const recuperer = async (url: string, options: RequestInit): Promise<Response> => {
      vus.push({ url, options });
      return json({ success: true, data: { deletedCount: 1 } });
    };

    const issue = await retireLeJetonPush({ jeton: 'jwt-1', deviceId: 'device-1', recuperer });

    expect(issue).toEqual({ genre: 'fait' });
    expect(vus[0]?.options.method).toBe('DELETE');
    expect(JSON.parse(String(vus[0]?.options.body))).toEqual({ deviceId: 'device-1' });
  });
});

describe('appareilsDuLecteur — GET /users/me/devices', () => {
  it('rend la liste servie', async () => {
    const appareils = [{ id: 'd1', platform: 'web', deviceId: 'device-1', isActive: true }];
    const issue = await appareilsDuLecteur({
      jeton: 'jwt-1',
      recuperer: async () => json({ success: true, data: appareils }),
    });
    expect(issue).toEqual({ genre: 'liste', appareils });
  });

  it('rend panne quand le corps n’est pas un tableau', async () => {
    const issue = await appareilsDuLecteur({
      jeton: 'jwt-1',
      recuperer: async () => json({ success: true, data: { pas: 'un tableau' } }),
    });
    expect(issue).toEqual({ genre: 'panne' });
  });

  it('rend refus sur un 4xx', async () => {
    const issue = await appareilsDuLecteur({
      jeton: 'jwt-1',
      recuperer: async () => json({ success: false }, 403),
    });
    expect(issue).toEqual({ genre: 'refus', statut: 403 });
  });
});
