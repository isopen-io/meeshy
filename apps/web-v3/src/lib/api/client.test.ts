import { describe, expect, test } from 'bun:test';

import { ApiError, credentialFromSession, unwrap } from './client';
import type { ApiResult } from './http';

/**
 * LE CRÉDENTIAL COURANT (#5605) — la règle que le transport de production
 * applique à CHAQUE appel, éprouvée sur les TROIS états du magasin.
 *
 * L'état qui compte est `pending2fa` : c'est le seul qui PORTE un jeton sans
 * avoir le droit de le présenter. Un témoin qui ne regarderait que
 * `authenticated` et `anonymous` rendrait le même verdict qu'une règle
 * fausse — la doctrine du « témoin de RANG » (leçon 261), portée ici à l'état
 * intermédiaire.
 */
describe('credentialFromSession', () => {
  test('authenticated ⇒ régime enregistré (Bearer)', () => {
    expect(
      credentialFromSession({
        status: 'authenticated',
        user: { id: 'u-1', username: 'ada' },
        token: 'jwt-1',
        sessionToken: 'sess-1',
        expiresAt: Date.UTC(2026, 8, 8),
      }),
    ).toEqual({ kind: 'registered', token: 'jwt-1' });
  });

  test('anonymous ⇒ aucun crédential', () => {
    expect(credentialFromSession({ status: 'anonymous' })).toBeNull();
  });

  test('pending2fa ⇒ aucun crédential — le jeton de second facteur n’ouvre que POST /auth/login/2fa', () => {
    expect(
      credentialFromSession({
        status: 'pending2fa',
        twoFactorToken: 'tok-2fa',
        user: { id: 'u-1', username: 'ada', email: 'a@x.io', firstName: 'A', lastName: 'D' },
      }),
    ).toBeNull();
  });
});

/**
 * L'ADAPTATEUR `unwrap` (#5605, revue-correction) — le seul pont entre
 * `ApiResult`, qui ne rejette jamais, et une consommation TanStack Query,
 * qui décide `isError`/`retry` sur le rejet de la promesse du `queryFn`.
 */
describe('unwrap', () => {
  test('ok:true ⇒ rend `data` directement, sans lever', () => {
    const result: ApiResult<{ id: string }> = { ok: true, data: { id: 'c-1' } };
    expect(unwrap(result)).toEqual({ id: 'c-1' });
  });

  test('ok:false ⇒ LÈVE une ApiError portant status/error/code — jamais un déballage silencieux', () => {
    const result: ApiResult<unknown> = {
      ok: false,
      status: 401,
      error: 'Identifiants invalides',
      code: 'INVALID_CREDENTIALS',
    };
    expect(() => unwrap(result)).toThrow();
    try {
      unwrap(result);
      throw new Error('unreachable — unwrap devait lever');
    } catch (thrown) {
      expect(thrown instanceof ApiError).toBe(true);
      const error = thrown as ApiError;
      expect(error.status).toBe(401);
      expect(error.code).toBe('INVALID_CREDENTIALS');
      expect(error.message).toBe('Identifiants invalides');
    }
  });

  test('ok:false SANS code (panne réseau) ⇒ ApiError.code est `undefined`, jamais une chaîne inventée', () => {
    const result: ApiResult<unknown> = { ok: false, status: 0, error: 'network down' };
    try {
      unwrap(result);
      throw new Error('unreachable — unwrap devait lever');
    } catch (thrown) {
      expect(thrown instanceof ApiError).toBe(true);
      expect((thrown as ApiError).code).toBeUndefined();
      expect((thrown as ApiError).status).toBe(0);
    }
  });
});
