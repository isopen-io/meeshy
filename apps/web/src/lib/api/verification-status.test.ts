import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest } from './http';
import { createAuthClient } from './auth';
import { createSessionStore } from './session';

/**
 * `POST /auth/verification/status` (#8083) — le jeton d'attente de CET appareil
 * lit un ÉTAT (`pending` / `proven`) et n'ouvre JAMAIS de session, même si la
 * réponse en portait une (décision porteur « si et seulement si »).
 */
function memoryStore() {
  const raw = new Map<string, string>();
  return createSessionStore({
    storage: {
      getItem: (key) => raw.get(key) ?? null,
      setItem: (key, value) => {
        raw.set(key, value);
      },
      removeItem: (key) => {
        raw.delete(key);
      },
    },
    now: () => 0,
  });
}

function stubTransport(response: ApiResult<unknown>) {
  const calls: HttpRequest[] = [];
  return {
    calls,
    transport: {
      request: async <T>(request: HttpRequest) => {
        calls.push(request);
        return response as ApiResult<T>;
      },
    },
  };
}

describe('verificationStatus()', () => {
  test('corps { pendingSessionToken } SEUL vers /api/v1/auth/verification/status ; l’état est rendu', async () => {
    const store = memoryStore();
    const { transport, calls } = stubTransport({ ok: true, status: 200, data: { status: 'proven' } });
    const auth = createAuthClient({ transport, store });

    const result = await auth.verificationStatus('tok-a');

    expect(calls).toEqual([{ method: 'POST', path: '/api/v1/auth/verification/status', body: { pendingSessionToken: 'tok-a' } }]);
    expect(result).toEqual({ ok: true, status: 200, data: { status: 'proven' } });
  });

  test('aucune session n’est ouverte, même par une réponse qui en porterait une', async () => {
    const store = memoryStore();
    const { transport } = stubTransport({
      ok: true,
      status: 200,
      data: { status: 'proven', token: 'jwt', sessionToken: 'sess', user: { id: 'u', username: 'u', displayName: 'U' } },
    });
    const auth = createAuthClient({ transport, store });

    await auth.verificationStatus('tok-a');

    expect(store.getState().session).toEqual({ status: 'anonymous' });
  });
});
