import { describe, expect, test } from 'bun:test';

import { declaringClient } from './auth';
import type { ApiResult, HttpRequest } from './http';

/**
 * LES REQUÊTES QUI OUVRENT UNE SESSION PORTENT LA DÉCLARATION DU CLIENT (#9611)
 * — la passerelle ne lit `X-Meeshy-*` qu'à `createSession` (connexion,
 * inscription, lien magique, second facteur) : c'est le flux de connexion qui
 * les pose, jamais le transport du socle (première peinture).
 */

function recorder() {
  const requests: HttpRequest[] = [];
  const transport = {
    request: async <T,>(req: HttpRequest): Promise<ApiResult<T>> => {
      requests.push(req);
      return { ok: true, data: undefined as T, status: 200 };
    },
  };
  return { transport, requests };
}

describe('declaringClient', () => {
  test('chaque requête porte la déclaration apprise', async () => {
    const { transport, requests } = recorder();
    const declared = declaringClient(transport, async () => ({ 'X-Meeshy-Version': '2.13.0', 'X-Meeshy-Platform': 'web' }));
    await declared.request({ method: 'POST', path: '/api/v1/auth/login', body: {} });
    expect(requests[0]?.headers).toEqual({ 'X-Meeshy-Version': '2.13.0', 'X-Meeshy-Platform': 'web' });
  });

  test('un en-tête posé par l’appelant l’emporte (la déconnexion nomme son crédential)', async () => {
    const { transport, requests } = recorder();
    const declared = declaringClient(transport, async () => ({ 'X-Meeshy-Platform': 'web' }));
    await declared.request({ method: 'POST', path: '/api/v1/auth/logout', headers: { Authorization: 'Bearer a', 'X-Meeshy-Platform': 'pwa' } });
    expect(requests[0]?.headers).toEqual({ 'X-Meeshy-Platform': 'pwa', Authorization: 'Bearer a' });
  });

  test('une déclaration indisponible n’empêche pas de se connecter', async () => {
    const { transport, requests } = recorder();
    const declared = declaringClient(transport, () => Promise.reject(new Error('chunk introuvable')));
    const result = await declared.request({ method: 'POST', path: '/api/v1/auth/login' });
    expect(result.ok).toBe(true);
    expect(requests[0]?.headers).toEqual({});
  });
});
