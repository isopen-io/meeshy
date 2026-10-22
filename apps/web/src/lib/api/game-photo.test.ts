import { describe, expect, test } from 'bun:test';

import { GAME_PHOTO_ROUTES } from '@meeshy/shared/types/game-routes';

import { pathOf, routedTransport } from '@/test-support/routed-transport';

import { setFrameAtmosphere } from './game-photo';

/**
 * L'ÉCRITURE DE L'ATMOSPHÈRE (#10163, L10b) — `PUT /me/game/frames/atmosphere` : le corps porte l'identifiant
 * d'idempotence et l'atmosphère, la réponse dit si le pack est installé. Un ANCIEN serveur (404) n'est pas un
 * refus : le choix reste local, `packInstalled` faux, et l'appelant le sait (`local: true`).
 */
describe('setFrameAtmosphere', () => {
  test('envoie requestId et atmosphère sur la route du contrat, et lit la réponse', async () => {
    const routed = routedTransport((req) => (pathOf(req) === `/api/v1${GAME_PHOTO_ROUTES.frameAtmosphere}` ? { ok: true, data: { atmosphere: 'olympe', packInstalled: true } } : undefined));
    const result = await setFrameAtmosphere(routed.transport, 'req-1', 'olympe');
    expect(result).toEqual({ ok: true, data: { atmosphere: 'olympe', packInstalled: true, local: false } });
    expect(routed.calls()[0]).toMatchObject({ method: 'PUT', body: { requestId: 'req-1', atmosphere: 'olympe' } });
  });

  test('un ancien serveur (404) ⇒ le choix reste local : succès, pack non installé, `local` vrai', async () => {
    const routed = routedTransport(() => ({ ok: false, status: 404, error: 'Not found', code: 'NOT_FOUND' }));
    expect(await setFrameAtmosphere(routed.transport, 'req-2', 'neon')).toEqual({ ok: true, data: { atmosphere: 'neon', packInstalled: false, local: true } });
  });

  test('un refus (409) et une réponse illisible restent des échecs', async () => {
    const refused = routedTransport(() => ({ ok: false, status: 409, error: 'refus', code: 'GAME_REQUEST_ID_CONFLICT' }));
    expect((await setFrameAtmosphere(refused.transport, 'req-3', 'neon')).ok).toBe(false);
    const garbled = routedTransport(() => ({ ok: true, data: { atmosphere: 'mars', packInstalled: true } }));
    const result = await setFrameAtmosphere(garbled.transport, 'req-4', 'neon');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MALFORMED_PAYLOAD');
  });
});
