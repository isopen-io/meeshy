import { describe, expect, test } from 'bun:test';

import { publishClientDeclaration } from '@/lib/net/client-session';

import { CLIENT_DECLARATION_GLOBAL, declaringClient, publishedClientDeclaration } from './auth';
import type { ApiResult, HttpRequest } from './http';

/**
 * LES REQUÊTES QUI OUVRENT UNE SESSION PORTENT LA DÉCLARATION DU CLIENT (#9611)
 * — la passerelle ne lit `X-Meeshy-*` qu'à `createSession` (connexion,
 * inscription, lien magique, second facteur) : c'est le flux de connexion qui
 * les pose, jamais le transport du socle (première peinture), et sans importer
 * le module qui les apprend.
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
  test('chaque requête porte la déclaration publiée', async () => {
    const { transport, requests } = recorder();
    await declaringClient(transport, () => ({ 'X-Meeshy-Version': '2.13.0', 'X-Meeshy-Platform': 'web' })).request({ method: 'POST', path: '/api/v1/auth/login', body: {} });
    expect(requests[0]?.headers).toEqual({ 'X-Meeshy-Version': '2.13.0', 'X-Meeshy-Platform': 'web' });
  });

  test('un en-tête posé par l’appelant l’emporte (la déconnexion nomme son crédential)', async () => {
    const { transport, requests } = recorder();
    await declaringClient(transport, () => ({ 'X-Meeshy-Platform': 'web' })).request({
      method: 'POST',
      path: '/api/v1/auth/logout',
      headers: { Authorization: 'Bearer a', 'X-Meeshy-Platform': 'pwa' },
    });
    expect(requests[0]?.headers).toEqual({ 'X-Meeshy-Platform': 'pwa', Authorization: 'Bearer a' });
  });
});

describe('la déclaration publiée', () => {
  test('rien de publié : aucune déclaration, la connexion part quand même', () => {
    expect(publishedClientDeclaration({})).toEqual({});
  });

  test('ce que `client-session.ts` publie est exactement ce que le flux de connexion lit — le nom est le même des deux côtés', async () => {
    const host = {};
    await publishClientDeclaration(host);
    expect(Object.keys(host)).toEqual([CLIENT_DECLARATION_GLOBAL]);
    expect(publishedClientDeclaration(host)['X-Meeshy-Version']).toBe(__APP_VERSION__);
  });

  test('une valeur hors forme n’est pas un en-tête', () => {
    expect(publishedClientDeclaration({ [CLIENT_DECLARATION_GLOBAL]: { 'X-Meeshy-Version': 2, 'X-Meeshy-Platform': 'web' } })).toEqual({ 'X-Meeshy-Platform': 'web' });
    expect(publishedClientDeclaration({ [CLIENT_DECLARATION_GLOBAL]: ['x'] })).toEqual({});
  });
});
