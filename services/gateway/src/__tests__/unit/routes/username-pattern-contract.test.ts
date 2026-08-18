/**
 * Le contrat username est rendu par DEUX moteurs : Ajv (body JSON Schema
 * Fastify) et Zod (validateSchema). Ce fichier monte les schémas RÉELS dans une
 * instance Fastify nue — pas de mock — pour que le 400 provienne du vrai
 * compilateur Ajv. Les suites de route voisines mockent `@meeshy/shared/types`
 * (auth-register.test.ts remplace `registerRequestSchema` par
 * `{ additionalProperties: true }`), ce qui les rend structurellement aveugles à
 * ce contrat.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { registerRequestSchema } from '@meeshy/shared/types';
import { AuthSchemas } from '@meeshy/shared/utils/validation';
import { updateUsernameBodySchema } from '../../../routes/users/profile';

const VALID_REGISTRATION = {
  username: 'alice',
  password: 'motdepasse123',
  firstName: 'Alice',
  lastName: 'Martin',
  email: 'alice@example.com',
};

describe('contrat username — couche Ajv', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Mêmes options Ajv que le vrai serveur (server.ts:203) : sans `strict: 'log'`
    // et le mot-clé `example`, Ajv REFUSE de compiler les schémas OpenAPI du dépôt
    // et `ready()` lève — le test échouerait pour une raison sans rapport avec le
    // contrat qu'il vérifie.
    app = Fastify({
      ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
    });
    app.post('/register', { schema: { body: registerRequestSchema } }, async () => ({ ok: true }));
    app.patch('/username', { schema: { body: updateUsernameBodySchema } }, async () => ({ ok: true }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['la lionne noire', 'vanel momo', 'a b', 'josé'])(
    'POST /register refuse le username %j',
    async (username) => {
      const res = await app.inject({
        method: 'POST',
        url: '/register',
        payload: { ...VALID_REGISTRATION, username },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain('username');
    },
  );

  it('POST /register accepte un username conforme', async () => {
    const res = await app.inject({ method: 'POST', url: '/register', payload: VALID_REGISTRATION });
    expect(res.statusCode).toBe(200);
  });

  it.each(['la lionne noire', 'a b', 'josé'])(
    'PATCH /users/me/username refuse le username %j',
    async (newUsername) => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/username',
        payload: { newUsername, currentPassword: 'motdepasse123' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain('newUsername');
    },
  );

  it('PATCH /users/me/username accepte un username conforme', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/username',
      payload: { newUsername: 'lalionnenoire', currentPassword: 'motdepasse123' },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('contrat username — couche Zod', () => {
  it.each(['la lionne noire', 'a b', 'josé'])('AuthSchemas.register refuse %j', (username) => {
    const result = AuthSchemas.register.safeParse({ ...VALID_REGISTRATION, username });
    expect(result.success).toBe(false);
  });
});

describe('normalizeUsername', () => {
  it('refuse un username porteur d\'un espace interne', async () => {
    const { normalizeUsername } = await import('../../../utils/normalize');
    expect(() => normalizeUsername('la lionne noire')).toThrow(/lettres, chiffres/);
  });

  it('refuse une lettre accentuée', async () => {
    const { normalizeUsername } = await import('../../../utils/normalize');
    expect(() => normalizeUsername('josé')).toThrow(/lettres, chiffres/);
  });

  it('conserve un username conforme, espaces de bord retirés', async () => {
    const { normalizeUsername } = await import('../../../utils/normalize');
    expect(normalizeUsername('  lalionnenoire  ')).toBe('lalionnenoire');
  });
});
