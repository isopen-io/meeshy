import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';

import {
  bringAvailabilityQueryKey,
  bringSendOutcomeOf,
  decodeBringAvailability,
  loadBringAvailability,
  sendBring,
  stopBring,
} from './bring-api';

/**
 * LE BRING, CÔTÉ PORT (#13936, `proche-bring@web`) — le contrat de
 * `packages/shared/types/bring.ts`, décodé à la main, TOLÉRANT et FERMÉ : une
 * disponibilité illisible se lit « indisponible » (le bouton disparaît), jamais
 * « disponible ».
 */

const OTHER = '64b000000000000000000002';

function fakeTransport(result: ApiResult<unknown>) {
  const requests: HttpRequest[] = [];
  const transport = (async () => result) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    requests.push(req);
    return result;
  }) as HttpTransport['request'];
  return { deps: { source: 'gateway' as const, transport }, requests };
}

const served = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  userId: OTHER,
  available: true,
  perDay: 3,
  remainingToday: 2,
  resetsAt: '2026-11-08T00:00:00.000Z',
  ...overrides,
});

describe('decodeBringAvailability', () => {
  test('lit une disponibilité servie telle quelle', () => {
    expect(decodeBringAvailability(served(), OTHER)).toEqual({ available: true, perDay: 3, remainingToday: 2, resetsAt: '2026-11-08T00:00:00.000Z' });
  });

  test('`null` = illimité (Atome), jamais zéro', () => {
    expect(decodeBringAvailability(served({ perDay: null, remainingToday: null }), OTHER)).toMatchObject({ available: true, perDay: null, remainingToday: null });
  });

  test('une charge illisible, ou un `available` absent, se lit INDISPONIBLE', () => {
    expect(decodeBringAvailability(null, OTHER).available).toBe(false);
    expect(decodeBringAvailability(served({ available: 'yes' }), OTHER).available).toBe(false);
  });

  test('une disponibilité qui parle d’une AUTRE personne ne s’applique pas à celle-ci', () => {
    expect(decodeBringAvailability(served({ userId: 'someone-else' }), OTHER).available).toBe(false);
  });

  test('disponible mais quota épuisé : indisponible à l’envoi, sans mentir sur le compteur', () => {
    expect(decodeBringAvailability(served({ remainingToday: 0 }), OTHER)).toMatchObject({ available: true, remainingToday: 0 });
  });
});

describe('les routes', () => {
  test('GET /bring/:userId lit la disponibilité', async () => {
    const { deps, requests } = fakeTransport({ ok: true, data: served() });
    const result = await loadBringAvailability(deps, OTHER);
    expect(requests[0]).toMatchObject({ method: 'GET', path: `/api/v1/bring/${OTHER}` });
    expect(result).toEqual({ ok: true, data: { available: true, perDay: 3, remainingToday: 2, resetsAt: '2026-11-08T00:00:00.000Z' } });
  });

  test('POST /bring/:userId rend le Bring parti', async () => {
    const sent = { bringId: 'b1', toUserId: OTHER, sentAt: '2026-11-07T10:00:00.000Z', expiresAt: '2026-11-07T10:02:00.000Z', perDay: 3, remainingToday: 1 };
    const { deps, requests } = fakeTransport({ ok: true, data: sent });
    const result = await sendBring(deps, OTHER);
    expect(requests[0]).toMatchObject({ method: 'POST', path: `/api/v1/bring/${OTHER}` });
    expect(bringSendOutcomeOf(result)).toEqual({ kind: 'sent', sent });
  });

  test('DELETE /bring/:bringId arrête', async () => {
    const { deps, requests } = fakeTransport({ ok: true, data: { bringId: 'b1', stopped: true } });
    expect(await stopBring(deps, 'b1')).toEqual({ ok: true, data: true });
    expect(requests[0]).toMatchObject({ method: 'DELETE', path: '/api/v1/bring/b1' });
  });

  test('les clés de cache sont par personne', () => {
    expect(bringAvailabilityQueryKey(OTHER)).not.toEqual(bringAvailabilityQueryKey('x'));
  });
});

describe('bringSendOutcomeOf — ce que l’écran fait d’un refus', () => {
  const failure = (status: number, code?: string): ApiResult<never> => ({ ok: false, status, error: 'x', ...(code === undefined ? {} : { code }) });

  test('quota du jour atteint ⇒ « plus de Bring aujourd’hui »', () => {
    expect(bringSendOutcomeOf(failure(429, 'BRING_QUOTA_EXCEEDED'))).toEqual({ kind: 'quota' });
  });

  test('bloqué, non permis, service coupé ⇒ le bouton DISPARAÎT, sans dire pourquoi', () => {
    for (const code of ['BRING_BLOCKED', 'BRING_NOT_ALLOWED', 'BRING_DISABLED']) expect(bringSendOutcomeOf(failure(403, code))).toEqual({ kind: 'gone' });
  });

  test('compteur injoignable, réseau ou panne ⇒ « réessayez »', () => {
    expect(bringSendOutcomeOf(failure(503, 'BRING_UNAVAILABLE'))).toEqual({ kind: 'retry' });
    expect(bringSendOutcomeOf(failure(500))).toEqual({ kind: 'retry' });
  });

  test('hors ligne ⇒ « il faut du réseau »', () => {
    expect(bringSendOutcomeOf(failure(0, 'NETWORK'))).toEqual({ kind: 'offline' });
  });

  test('un succès illisible n’est pas un Bring parti', () => {
    expect(bringSendOutcomeOf({ ok: true, data: null })).toEqual({ kind: 'retry' });
  });
});
