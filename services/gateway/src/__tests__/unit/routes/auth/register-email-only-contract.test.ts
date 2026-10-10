/**
 * LE CONTRAT QUI NE DOIT PAS BOUGER : une inscription par ADRESSE SEULE crée
 * toujours le compte, envoie l'e-mail d'activation et ouvre la session
 * (#9343, délai de grâce #8238).
 *
 * Directive porteur 2026-10-04 : « obliger le remplissage du numéro du
 * téléphone lors de la phase d'inscription uniquement dans les frontend ! Le
 * backend prend toujours le cas de non obligation ! Et permet toujours
 * d'enregistrer une personne qui se connecte par email directement en lui
 * envoyant un email d'activation de son compte ! »
 *
 * Les écrans web et iOS exigent désormais un numéro — la passerelle, NON :
 * l'API, les anciennes versions publiées des apps et tout autre client
 * continuent de s'inscrire par adresse seule. Le risque est donc qu'un lot
 * futur, voyant les deux écrans exiger le numéro, « aligne » le serveur. Ce
 * fichier rougit alors, couche par couche :
 *
 * 1. le schéma Ajv RÉEL (`registerRequestSchema`) laisse passer une charge
 *    sans numéro, et ne compte pas `phoneNumber` parmi ses requis ;
 * 2. le Zod RÉEL (`AuthSchemas.register`) l'accepte aussi ;
 * 3. la ROUTE, montée sur ces deux schémas réels (aucun mock de validation),
 *    rend 200 avec le jeton et la session ;
 * 4. le SERVICE crée le compte sans numéro et envoie l'e-mail d'activation.
 *
 * Les autres suites de la route remplacent les schémas par des doubles
 * (`register-contract.test.ts` § « Pourquoi ce fichier existe ») : aucune ne
 * pouvait voir un `required: ['phoneNumber']` réintroduit.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import crypto from 'crypto';
import { registerRequestSchema } from '@meeshy/shared/types';
import { AuthSchemas } from '@meeshy/shared/utils/validation';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));
jest.mock('../../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: jest.fn(async (p: string) => `hash(${p})`),
}));
jest.mock('../../../../services/auth/email-verification-watch', () => ({
  pendingSessionTokenFor: jest.fn(async () => ({ pendingSessionToken: 'attente-opaque' })),
  pendingSessionTokenForAccount: jest.fn(async () => ({ pendingSessionToken: 'attente-du-compte' })),
}));
jest.mock('../../../../utils/rate-limiter.js', () => {
  const limiteur = () => ({
    middleware: jest.fn(() => async () => {}),
    refund: jest.fn(async () => {}),
    keyFor: jest.fn(() => 'ip:test'),
  });
  return { createRegisterRateLimiter: jest.fn(limiteur), createAuthGlobalRateLimiter: jest.fn(limiteur) };
});
jest.mock('../../../../services/GeoIPService', () => ({
  getRequestContext: jest.fn(async () => ({ ip: '127.0.0.1', userAgent: 'test-agent', deviceInfo: { type: 'desktop' }, geoData: { country: 'FR' } })),
}));
const mockCreateSession = jest.fn(async () => ({ id: 'session-inscription' }));
jest.mock('../../../../services/SessionService', () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...(args as [])),
  generateSessionToken: jest.fn(() => 'session-token-inscription'),
}));

import { registerRegistrationRoutes } from '../../../../routes/auth/register';
import { registerAccount, type RegistrationDeps } from '../../../../services/auth/registration.service';
import { emailClaimStore } from '../../../helpers/email-claim-store';

/** La charge d'une inscription par ADRESSE SEULE — celle d'un client qui n'a pas de numéro. */
const ADRESSE_SEULE = { email: 'lena@example.com', systemLanguage: 'fr', regionalLanguage: 'en' } as const;

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

describe('POST /auth/register — une ADRESSE SEULE suffit à la passerelle (#9343)', () => {
  describe('1. le schéma Ajv réel', () => {
    it('ne compte pas le numéro parmi ses requis', () => {
      const requis: readonly string[] = registerRequestSchema.required ?? [];
      expect(requis).not.toContain('phoneNumber');
      expect(requis).not.toContain('phoneCountryCode');
    });

    it('laisse passer une charge sans numéro jusqu’au handler', async () => {
      const app = Fastify({ logger: false });
      let recu: unknown;
      app.post('/register', { schema: { body: registerRequestSchema } }, async (request) => {
        recu = request.body;
        return { ok: true };
      });
      await app.ready();

      const res = await app.inject({ method: 'POST', url: '/register', payload: ADRESSE_SEULE });

      expect(res.statusCode).toBe(200);
      expect(recu).toMatchObject({ email: 'lena@example.com' });
      await app.close();
    });
  });

  describe('2. le Zod réel', () => {
    it('accepte une adresse seule', () => {
      expect(AuthSchemas.register.safeParse(ADRESSE_SEULE).success).toBe(true);
    });
  });

  describe('3. la route, sur les deux schémas réels', () => {
    it('crée le compte et ouvre la session — 200, jeton, session, sans numéro transmis au service', async () => {
      mockCreateSession.mockClear();
      const register = jest.fn(async () => ({
        user: { id: '507f1f77bcf86cd799439011', username: 'lena', email: 'lena@example.com', displayName: 'Lena', phoneNumber: null, role: 'USER', isActive: true },
      }));
      const authService = {
        register,
        generateToken: jest.fn(() => 'jwt-token'),
        getUserPermissions: jest.fn(() => []),
      };
      const app = Fastify({ logger: false });
      app.decorate('prisma', { user: { findFirst: jest.fn(async () => null) } });
      registerRegistrationRoutes({
        fastify: app,
        authService,
        phoneTransferService: { getTransferDataByToken: jest.fn(), executeRegistrationTransfer: jest.fn() },
        redis: null,
        prisma: { user: { findFirst: jest.fn(async () => null), update: jest.fn() } },
        smsService: {},
        cacheStore: {},
      } as never);
      await app.ready();

      const res = await app.inject({ method: 'POST', url: '/register', payload: ADRESSE_SEULE });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.token).toBe('jwt-token');
      expect(res.json().data.sessionToken).toBe('session-token-inscription');
      expect(res.json().data.status).toBeUndefined();
      expect(mockCreateSession).toHaveBeenCalledTimes(1);
      const transmis = (register.mock.calls[0] as unknown[] | undefined)?.[0] as Record<string, unknown> | undefined;
      expect(transmis?.email).toBe('lena@example.com');
      expect(transmis?.phoneNumber).toBeUndefined();
      await app.close();
    });
  });

  describe('4. le service', () => {
    it('crée le compte sans numéro et envoie l’e-mail d’activation à l’adresse', async () => {
      const store = emailClaimStore();
      const sendEmailVerification = jest.fn(async (_p: Record<string, unknown>) => ({ success: true }));
      const deps: RegistrationDeps = {
        prisma: store.prisma as never,
        emailService: { sendEmailVerification } as never,
        frontendUrl: 'https://meeshy.test',
        toSocketIOUser: (u) => u as never,
        verificationToken: () => ({ raw: 'lien-1', hash: sha256('lien-1') }),
        verificationCode: () => '424242',
      };

      const resultat = await registerAccount(deps, { email: 'Lena@Example.com' });

      expect(resultat.phoneOwnershipConflict).toBeUndefined();
      expect(resultat.claimedEmail).toBeUndefined();
      const cree = await store.prisma.user.findFirst({ where: { email: 'lena@example.com' } });
      expect(cree).toMatchObject({ email: 'lena@example.com', phoneNumber: null, phoneVerifiedAt: null });
      expect(sendEmailVerification).toHaveBeenCalledTimes(1);
      expect(sendEmailVerification.mock.calls[0]?.[0]).toMatchObject({
        to: 'lena@example.com',
        verificationCode: '424242',
      });
      expect(String(sendEmailVerification.mock.calls[0]?.[0]?.verificationLink)).toContain('token=lien-1');
    });
  });
});
