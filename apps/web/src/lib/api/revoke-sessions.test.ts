import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { revokeAllSessionsFromLink, revokeFailureOf } from './revoke-sessions';

/**
 * LE LIEN « CE N'ÉTAIT PAS MOI » (#10859) — le jeton, relevé dans le fragment
 * du lien, part dans le CORPS d'un POST, jamais dans une adresse journalisée.
 */
function transportReplying(reply: ApiResult<unknown>) {
  const calls: HttpRequest[] = [];
  const transport = (async () => reply) as unknown as HttpTransport;
  transport.request = (async (request: HttpRequest) => {
    calls.push(request);
    return reply;
  }) as HttpTransport['request'];
  return { calls, deps: { source: 'gateway' as const, transport } };
}

describe('revokeAllSessionsFromLink', () => {
  test('POST, jeton dans le corps, rend le nombre de sessions fermées', async () => {
    const { calls, deps } = transportReplying({ ok: true, data: { revokedCount: 3 } });
    const result = await revokeAllSessionsFromLink(deps, 'jwt.abc');
    expect(calls).toEqual([{ method: 'POST', path: '/api/v1/auth/revoke-all-sessions', body: { token: 'jwt.abc' } }]);
    expect(result).toEqual({ ok: true, data: { revokedCount: 3 } });
  });

  test('une réponse illisible est un échec nommé, jamais un compte deviné', async () => {
    const { deps } = transportReplying({ ok: true, data: { revoked: 'oui' } });
    const result = await revokeAllSessionsFromLink(deps, 'jwt.abc');
    expect(result.ok).toBe(false);
  });
});

describe('revokeFailureOf', () => {
  test('le lien expiré ou invalide se distingue d’une panne', () => {
    expect(revokeFailureOf({ ok: false, status: 400, error: 'x', code: 'INVALID_OR_EXPIRED_LINK' })).toBe('invalid');
    expect(revokeFailureOf({ ok: false, status: 429, error: 'x' })).toBe('rate-limited');
    expect(revokeFailureOf({ ok: false, status: 0, error: 'x' })).toBe('offline');
    expect(revokeFailureOf({ ok: false, status: 503, error: 'x' })).toBe('unavailable');
  });
});
