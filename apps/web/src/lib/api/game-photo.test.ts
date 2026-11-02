import { describe, expect, test } from 'bun:test';

import { GAME_PHOTO_ROUTES } from '@meeshy/shared/types/game-routes';

import { pathOf, routedTransport } from '@/test-support/routed-transport';

import { postPhotoMomentsKept, postPhotoMomentsPresented, putPhotoInvitations, setFrameAtmosphere } from './game-photo';

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

/**
 * L'ACCUSÉ ET LE SIGNAL « IMMORTALISÉE » (#10174, L18 ; § 5.16.2 ; D22 b de #10182) — `POST …/presented`
 * et `POST …/kept` portent des identifiants d'étape, rien d'autre ; face à un ancien serveur, un 404 abandonne
 * sans bruit (`local: true`). Le réglage d'invitation : `PUT …/invitations`.
 */
describe('postPhotoMomentsPresented / postPhotoMomentsKept / putPhotoInvitations', () => {
  test('l’accusé envoie requestId et stepIds sur la route du contrat, et lit les dates de première présentation', async () => {
    const routed = routedTransport((req) =>
      pathOf(req) === `/api/v1${GAME_PHOTO_ROUTES.photoPresented}` ? { ok: true, data: { presented: [{ stepId: 'meesh:10', presentedAt: '2026-10-22T12:00:00.000Z' }] } } : undefined,
    );
    const result = await postPhotoMomentsPresented(routed.transport, 'req-5', ['meesh:10']);
    expect(result).toEqual({ ok: true, data: { presented: [{ stepId: 'meesh:10', presentedAt: '2026-10-22T12:00:00.000Z' }], local: false } });
    expect(routed.calls()[0]).toMatchObject({ method: 'POST', body: { requestId: 'req-5', stepIds: ['meesh:10'] } });
  });

  test('le signal « immortalisée » ne porte que des identifiants, et un ancien serveur (404) l’abandonne sans bruit', async () => {
    const routed = routedTransport((req) => (pathOf(req) === `/api/v1${GAME_PHOTO_ROUTES.photoKept}` ? { ok: true, data: { kept: [{ stepId: 'flame:7', keptAt: '2026-10-22T12:00:00.000Z' }] } } : undefined));
    const result = await postPhotoMomentsKept(routed.transport, 'req-6', ['flame:7']);
    expect(result.ok).toBe(true);
    expect(Object.keys((routed.calls()[0]?.body ?? {}) as object).sort()).toEqual(['requestId', 'stepIds']);
    const old = routedTransport(() => ({ ok: false, status: 404, error: 'Not found', code: 'NOT_FOUND' }));
    expect(await postPhotoMomentsKept(old.transport, 'req-7', ['flame:7'])).toEqual({ ok: true, data: { kept: [], local: true } });
    expect(await postPhotoMomentsPresented(old.transport, 'req-8', ['flame:7'])).toEqual({ ok: true, data: { presented: [], local: true } });
  });

  test('le réglage d’invitation se pose par PUT ; 404 le laisse local ; une réponse illisible est un échec', async () => {
    const routed = routedTransport((req) => (pathOf(req) === `/api/v1${GAME_PHOTO_ROUTES.photoInvitations}` ? { ok: true, data: { invitations: 'major' } } : undefined));
    expect(await putPhotoInvitations(routed.transport, 'req-9', 'major')).toEqual({ ok: true, data: { invitations: 'major', local: false } });
    expect(routed.calls()[0]).toMatchObject({ method: 'PUT', body: { requestId: 'req-9', invitations: 'major' } });
    const old = routedTransport(() => ({ ok: false, status: 404, error: 'Not found', code: 'NOT_FOUND' }));
    expect(await putPhotoInvitations(old.transport, 'req-10', 'never')).toEqual({ ok: true, data: { invitations: 'never', local: true } });
    const garbled = routedTransport(() => ({ ok: true, data: { invitations: 'sometimes' } }));
    expect((await putPhotoInvitations(garbled.transport, 'req-11', 'never')).ok).toBe(false);
  });
});
