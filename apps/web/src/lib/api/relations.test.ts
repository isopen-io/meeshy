import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { FRIENDS_QUERY_PREFIX } from './friends-keys';
import {
  RELATION_LINKS_QUERY_KEY,
  decodeRelationLink,
  decodeRitualStep,
  loadRelationLinks,
  relationLinksQueryOptions,
  relationRefusalOf,
  runRitualPhase,
} from './relations';

/**
 * MES CERCLES, CÔTÉ PORT (#13938) — `GET /api/v1/relations` et le rituel du Sang
 * (`POST /api/v1/relations/:userId/ritual`). Miroir de `RelationLink`,
 * `RelationRitualStep` et `RelationRefusal` (MeeshySDK `Relations/`) : un
 * décodage tolérant et FERMÉ par défaut — un niveau inconnu se lit Public,
 * jamais un niveau plus haut.
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

const servedLink = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  userId: '64b000000000000000000001',
  effectiveLevel: 'FRIEND',
  grantedByMe: 'CLOSE',
  since: '2026-10-01T00:00:00.000Z',
  progress: { activeWeeks: 3, needed: 4, missing: [] },
  eligibleFor: null,
  ...overrides,
});

describe('decodeRelationLink', () => {
  test('lit un lien servi tel quel', () => {
    expect(decodeRelationLink(servedLink())).toEqual({
      userId: '64b000000000000000000001',
      effectiveLevel: 'FRIEND',
      grantedByMe: 'CLOSE',
      since: '2026-10-01T00:00:00.000Z',
      progress: { activeWeeks: 3, needed: 4, missing: [] },
      eligibleFor: null,
    });
  });

  test('un niveau inconnu ou réservé se lit Public — jamais un niveau plus haut', () => {
    const link = decodeRelationLink(servedLink({ effectiveLevel: 'ATOM', grantedByMe: 'close' }));
    expect(link?.effectiveLevel).toBe('PUBLIC');
    expect(link?.grantedByMe).toBe('PUBLIC');
  });

  test('une éligibilité illisible se lit null ; seules Proche et Sang sont des éligibilités', () => {
    expect(decodeRelationLink(servedLink({ eligibleFor: 'CLOSE' }))?.eligibleFor).toBe('CLOSE');
    expect(decodeRelationLink(servedLink({ eligibleFor: 'BLOOD' }))?.eligibleFor).toBe('BLOOD');
    expect(decodeRelationLink(servedLink({ eligibleFor: 'FRIEND' }))?.eligibleFor).toBeNull();
    expect(decodeRelationLink(servedLink({ eligibleFor: 42 }))?.eligibleFor).toBeNull();
  });

  test('une progression incomplète ne fait pas tomber le lien : zéro, absent, vide', () => {
    expect(decodeRelationLink(servedLink({ progress: undefined }))?.progress).toEqual({ activeWeeks: 0, needed: null, missing: [] });
    expect(decodeRelationLink(servedLink({ progress: { activeWeeks: 'x', needed: -1, missing: ['audio', 3, 'message'] } }))?.progress).toEqual({
      activeWeeks: 0,
      needed: null,
      missing: ['audio', 'message'],
    });
  });

  test('sans identifiant de personne, la ligne est illisible', () => {
    expect(decodeRelationLink(servedLink({ userId: '' }))).toBeNull();
    expect(decodeRelationLink(null)).toBeNull();
    expect(decodeRelationLink('FRIEND')).toBeNull();
  });

  test('aucun champ de plus ne passe : ni nom, ni présence, ni cool-down', () => {
    const link = decodeRelationLink(servedLink({ displayName: 'Ada', isOnline: true, lastActiveAt: '2026-11-01', cooldownUntil: '2026-12-01' }));
    expect(Object.keys(link ?? {}).sort()).toEqual(['effectiveLevel', 'eligibleFor', 'grantedByMe', 'progress', 'since', 'userId']);
  });
});

describe('loadRelationLinks — GET /api/v1/relations', () => {
  test('lit la route générée et écarte les lignes illisibles', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: [servedLink(), { userId: '' }, servedLink({ userId: '64b000000000000000000002', effectiveLevel: 'BLOOD' })] });
    const result = await loadRelationLinks({ source: 'gateway', transport });
    expect(requests.map((r) => [r.method, r.path])).toEqual([['GET', '/api/v1/relations']]);
    expect(result.ok && result.data.map((l) => [l.userId, l.effectiveLevel])).toEqual([
      ['64b000000000000000000001', 'FRIEND'],
      ['64b000000000000000000002', 'BLOOD'],
    ]);
  });

  test('un échec passe tel quel', async () => {
    const failure: ApiResult<unknown> = { ok: false, status: 503, error: 'panne' };
    const { transport } = fakeTransport(failure);
    expect(await loadRelationLinks({ source: 'gateway', transport })).toEqual(failure);
  });

  test('la clé vit dans la famille `friends` : une demande acceptée, refusée ou annulée relit aussi les cercles', () => {
    expect(RELATION_LINKS_QUERY_KEY.slice(0, FRIENDS_QUERY_PREFIX.length)).toEqual([...FRIENDS_QUERY_PREFIX]);
    const { transport } = fakeTransport({ ok: true, data: [] });
    expect(relationLinksQueryOptions({ source: 'gateway', transport }).queryKey).toEqual(RELATION_LINKS_QUERY_KEY);
  });
});

describe('runRitualPhase — POST /api/v1/relations/:userId/ritual', () => {
  test('start part sans jeton ni consentement', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: { token: 't1', requestId: 'r1', expiresAt: '2026-11-02T10:00:00Z', holdWindowMs: 15000 } });
    const result = await runRitualPhase({ source: 'gateway', transport }, { userId: 'u 1', phase: 'start' });
    expect(requests.map((r) => [r.method, r.path, r.body])).toEqual([['POST', '/api/v1/relations/u%201/ritual', { phase: 'start' }]]);
    expect(result).toEqual({ ok: true, data: { token: 't1', holdWindowMs: 15000, held: null, completed: null } });
  });

  test('confirm porte le jeton et les QUATRE consentements explicites', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: { completed: true, level: 'BLOOD' } });
    const consents = { listeningTitle: true, locationLive: false, locationHistory: false, locationProximity: true };
    const result = await runRitualPhase({ source: 'gateway', transport }, { userId: 'u1', phase: 'confirm', token: 't1', consents });
    expect(requests[0]?.body).toEqual({ phase: 'confirm', token: 't1', consents });
    expect(result.ok && result.data.completed).toBe(true);
  });

  test('un refus typé se lit sur le code machine, jamais sur la phrase', () => {
    expect(relationRefusalOf({ ok: false, status: 409, error: 'L’autre a lâché', code: 'RELATION_RITUAL_LAPSED' })).toBe('RELATION_RITUAL_LAPSED');
    expect(relationRefusalOf({ ok: false, status: 400, error: 'x', code: 'RELATION_CONSENT_REQUIRED' })).toBe('RELATION_CONSENT_REQUIRED');
    expect(relationRefusalOf({ ok: false, status: 409, error: 'x', code: 'RELATION_COOLDOWN' })).toBe('RELATION_COOLDOWN');
    expect(relationRefusalOf({ ok: false, status: 500, error: 'RELATION_RITUAL_LAPSED' })).toBeNull();
    expect(relationRefusalOf({ ok: false, status: 409, error: 'x', code: 'AUTRE' })).toBeNull();
  });

  test('une étape illisible ne fabrique rien', () => {
    expect(decodeRitualStep({ token: 3, holdWindowMs: 'x', held: 'yes' })).toEqual({ token: null, holdWindowMs: null, held: null, completed: null });
    expect(decodeRitualStep(null)).toEqual({ token: null, holdWindowMs: null, held: null, completed: null });
  });
});
