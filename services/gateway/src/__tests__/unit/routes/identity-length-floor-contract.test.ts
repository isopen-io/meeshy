/**
 * #13825 — un pseudo a au moins 3 caractères, un prénom, un nom ou un nom
 * affiché au moins 2, à l'inscription et à toute modification ; la CONNEXION
 * d'un compte existant à pseudo de 2 caractères n'est pas touchée.
 *
 * Les schémas RÉELS sont montés avec les options Ajv du serveur et son
 * gestionnaire de refus (`schemaValidationErrorResponse`) : le 400 observé est
 * celui qu'un ancien client recevra — même `code`, minimum dans le message.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import {
  loginRequestSchema,
  registerRequestSchema,
  updateUserRequestSchema,
  usernameMinLength,
} from '@meeshy/shared/types';
import { updateUsernameBodySchema } from '../../../routes/users/profile';
import { anonymousJoinBodySchema } from '../../../routes/anonymous';
import { schemaValidationErrorResponse } from '../../../utils/schema-validation-error';
import { normalizeUsername } from '../../../utils/normalize';
import { candidatsDePseudo } from '../../../utils/username-candidates';
import { generateUsername, type UsernameLookup } from '../../../services/auth/registration-identity';

const INSCRIPTION = { email: 'lena@example.com', password: 'Xk9$mQ2vLp8#nR4wZ' };

describe('les bornes d’identité — couche Ajv RÉELLE', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } } });
    app.setErrorHandler((error, _request, reply) => {
      const refus = schemaValidationErrorResponse(error);
      if (!refus) return reply.code(500).send({ success: false });
      const { statusCode, ...corps } = refus;
      return reply.code(statusCode).send(corps);
    });
    const ok = async () => ({ ok: true });
    app.post('/register', { schema: { body: registerRequestSchema } }, ok);
    app.post('/login', { schema: { body: loginRequestSchema } }, ok);
    app.patch('/username', { schema: { body: updateUsernameBodySchema } }, ok);
    app.patch('/me', { schema: { body: updateUserRequestSchema } }, ok);
    app.post('/anonymous/join', { schema: { body: anonymousJoinBodySchema } }, ok);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const envoyer = (method: 'POST' | 'PATCH', url: string, payload: Record<string, unknown>) =>
    app.inject({ method, url, payload });

  describe("l'inscription", () => {
    it('refuse le pseudo « Al » avec le refus de validation habituel, minimum annoncé', async () => {
      const res = await envoyer('POST', '/register', { ...INSCRIPTION, username: 'Al' });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
      expect(res.json().message).toContain(`fewer than ${usernameMinLength} characters`);
    });

    it('accepte le pseudo « Ali »', async () => {
      expect((await envoyer('POST', '/register', { ...INSCRIPTION, username: 'Ali' })).statusCode).toBe(200);
    });

    it.each(['firstName', 'lastName', 'displayName'])('refuse %s « A », accepte « Al »', async (champ) => {
      const refus = await envoyer('POST', '/register', { ...INSCRIPTION, [champ]: 'A' });
      expect(refus.statusCode).toBe(400);
      expect(refus.json().message).toContain('fewer than 2 characters');

      expect((await envoyer('POST', '/register', { ...INSCRIPTION, [champ]: 'Al' })).statusCode).toBe(200);
    });
  });

  describe('la connexion', () => {
    it('accepte encore un compte « Al » existant', async () => {
      expect((await envoyer('POST', '/login', { username: 'Al', password: 'secret' })).statusCode).toBe(200);
    });
  });

  describe('le changement de pseudo', () => {
    it('refuse « Al », accepte « Ali »', async () => {
      expect((await envoyer('PATCH', '/username', { newUsername: 'Al', currentPassword: 'x' })).statusCode).toBe(400);
      expect((await envoyer('PATCH', '/username', { newUsername: 'Ali', currentPassword: 'x' })).statusCode).toBe(200);
    });
  });

  describe('la modification du profil — le schéma laisse passer un nom hérité, le handler juge le CHANGEMENT', () => {
    it.each(['firstName', 'lastName'])('laisse passer %s « A » (un ancien client le renvoie inchangé), refuse la chaîne vide', async (champ) => {
      expect((await envoyer('PATCH', '/me', { [champ]: 'A' })).statusCode).toBe(200);
      expect((await envoyer('PATCH', '/me', { [champ]: '' })).statusCode).toBe(400);
    });

    it("laisse passer l'effacement du nom affiché", async () => {
      expect((await envoyer('PATCH', '/me', { displayName: '' })).statusCode).toBe(200);
    });
  });

  describe("la jonction anonyme héritée (POST /anonymous/join/:linkId)", () => {
    it.each(['firstName', 'lastName'])('refuse %s « A »', async (champ) => {
      const corps = { firstName: 'Lena', lastName: 'Vogel', [champ]: 'A' };
      expect((await envoyer('POST', '/anonymous/join', corps)).statusCode).toBe(400);
    });

    it('accepte « Al » et « Ly »', async () => {
      expect((await envoyer('POST', '/anonymous/join', { firstName: 'Al', lastName: 'Ly' })).statusCode).toBe(200);
    });
  });
});

describe('le pseudo normalisé à l’inscription', () => {
  it('refuse « Al » en annonçant le minimum', () => {
    expect(() => normalizeUsername('Al')).toThrow(String(usernameMinLength));
  });

  it('accepte « Ali »', () => {
    expect(normalizeUsername(' Ali ')).toBe('Ali');
  });
});

describe('les pseudos PROPOSÉS ou GÉNÉRÉS ont toujours au moins 3 caractères', () => {
  it('les suggestions d’un pseudo pris d’une lettre ne descendent pas sous la borne', () => {
    const candidats = candidatsDePseudo('a');

    expect(candidats.length).toBeGreaterThan(0);
    expect(candidats.every((c) => c.length >= usernameMinLength)).toBe(true);
  });

  const annuaireVide: UsernameLookup = {
    findMany: async () => [],
    findFirst: async () => null,
  };

  it.each(['al@example.com', 'a@example.com', 'li.l@example.com'])(
    'le pseudo dérivé de %j a au moins 3 caractères',
    async (email) => {
      const pseudo = await generateUsername(annuaireVide, { email });

      expect(pseudo.length).toBeGreaterThanOrEqual(usernameMinLength);
    },
  );
});
