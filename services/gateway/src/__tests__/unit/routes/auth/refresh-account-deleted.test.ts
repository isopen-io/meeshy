/**
 * #10264 — `POST /auth/refresh` dit « compte supprimé » au porteur d'un jeton
 * SIGNÉ d'un compte supprimé. C'est le chemin NOMINAL d'un appareil resté
 * hors ligne : son jeton a expiré, la porte des requêtes lui a rendu le 401
 * générique, et c'est ici qu'il apprend la vérité. Même statut 401 qu'avant ;
 * seul le code change, et seulement pour un compte supprimé.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

const USER_ID = '507f1f77bcf86cd799439011';

const mockVerify = jest.fn<any>();
jest.mock('jsonwebtoken', () => ({
  verify: (...args: unknown[]) => mockVerify(...args),
  decode: jest.fn().mockReturnValue({ userId: '507f1f77bcf86cd799439011', sid: 'sess-1' }),
}));

jest.mock('@meeshy/shared/utils/validation', () => ({
  AuthSchemas: { refreshToken: {}, verifyEmail: {}, resendVerification: {}, sendPhoneCode: {}, verifyPhone: {} },
  SessionSchemas: { validateToken: {} },
  validateSchema: jest.fn((_schema: unknown, data: unknown) => data),
}));

jest.mock('@meeshy/shared/types', () => ({
  ...(jest.requireActual('@meeshy/shared/types/api-schemas') as object),
  refreshTokenRequestSchema: { type: 'object', properties: { token: { type: 'string' }, sessionToken: { type: 'string' } } },
  verifyEmailRequestSchema: { type: 'object', properties: { token: { type: 'string' } } },
  resendVerificationRequestSchema: { type: 'object', properties: { email: { type: 'string' } } },
  sendPhoneCodeRequestSchema: { type: 'object', properties: { phoneNumber: { type: 'string' } } },
  verifyPhoneRequestSchema: { type: 'object', properties: { phoneNumber: { type: 'string' } } },
  validateSessionRequestSchema: { type: 'object', properties: { sessionToken: { type: 'string' } } },
}));

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async () => undefined,
  findTrustedSession: jest.fn(async () => null),
}));

jest.mock('../../../../services/notifications/contact-joined', () => ({
  scheduleContactJoinedAnnouncement: jest.fn(),
}));

import { registerMagicLinkRoutes } from '../../../../routes/auth/magic-link';

type Ligne = { isActive: boolean; deletedAt: Date | null; demandes?: readonly string[] };
const SUPPRIME: Ligne = { isActive: false, deletedAt: new Date('2026-10-01T00:00:00Z'), demandes: ['COMPLETED'] };
const GRACE_EXPIREE: Ligne = { isActive: false, deletedAt: new Date('2026-10-01T00:00:00Z'), demandes: ['GRACE_PERIOD_EXPIRED'] };
const DESACTIVE: Ligne = { isActive: false, deletedAt: null };

const monter = async (opts: { ligne: Ligne; sessionValide: boolean }): Promise<{ app: FastifyInstance; findUnique: jest.Mock<any> }> => {
  const { demandes = [], ...colonnes } = opts.ligne;
  const findUnique = jest.fn<any>(async () => ({ ...colonnes, birthDate: null }));
  const prisma = {
    user: { findUnique },
    accountDeletionRequest: {
      findFirst: jest.fn<any>(async ({ where }: { where: { status: string } }) => (demandes.includes(where.status) ? { id: 'req-1' } : null)),
    },
    userSession: {
      findFirst: jest.fn<any>(async () => (opts.sessionValide ? { id: 'sess-1' } : null)),
      update: jest.fn<any>(async () => ({})),
      count: jest.fn<any>(async () => (opts.sessionValide ? 1 : 0)),
    },
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async () => undefined);
  registerMagicLinkRoutes({
    fastify: app,
    authService: {
      jwtSecret: 'secret',
      getUserById: jest.fn<any>(async () => null),
      generateToken: jest.fn<any>(() => 'nouveau'),
      getUserPermissions: jest.fn<any>(() => []),
    },
    prisma,
    redis: null,
    phoneTransferService: {},
    smsService: {},
    cacheStore: {},
  } as never);
  await app.ready();
  return { app, findUnique };
};

const rafraichir = async (app: FastifyInstance) => {
  const res = await app.inject({ method: 'POST', url: '/refresh', payload: { token: 'jeton' } });
  await app.close();
  return res;
};

const jetonNomme = () => mockVerify.mockReturnValue({ userId: USER_ID, sid: 'sess-1', iat: Math.floor(Date.now() / 1000) });

describe('POST /auth/refresh — un jeton signé d’un compte supprimé', () => {
  it('session effacée par la purge : 401 `ACCOUNT_DELETED` qui NOMME le compte du jeton', async () => {
    jetonNomme();
    const { app } = await monter({ ligne: SUPPRIME, sessionValide: false });

    const res = await rafraichir(app);

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, code: 'ACCOUNT_DELETED', accountId: USER_ID });
  });

  it('grâce expirée, encore annulable : `SESSION_REVOKED`, jamais `ACCOUNT_DELETED`', async () => {
    jetonNomme();
    const { app } = await monter({ ligne: GRACE_EXPIREE, sessionValide: false });

    const res = await rafraichir(app);

    expect(res.json()).toMatchObject({ code: 'SESSION_REVOKED' });
  });

  it('jeton hérité (sans `sid`), aucune session restante : 401 `ACCOUNT_DELETED`', async () => {
    mockVerify.mockReturnValue({ userId: USER_ID, iat: Math.floor(Date.now() / 1000) });
    const { app } = await monter({ ligne: SUPPRIME, sessionValide: false });

    const res = await rafraichir(app);

    expect(res.json()).toMatchObject({ code: 'ACCOUNT_DELETED' });
  });

  it('session encore valide mais compte supprimé (purge pas encore passée) : 401 `ACCOUNT_DELETED`, jamais un 404', async () => {
    jetonNomme();
    const { app } = await monter({ ligne: SUPPRIME, sessionValide: true });

    const res = await rafraichir(app);

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'ACCOUNT_DELETED' });
  });

  it('session révoquée d’un compte qui existe : `SESSION_REVOKED`, comme avant', async () => {
    jetonNomme();
    const { app } = await monter({ ligne: { isActive: true, deletedAt: null }, sessionValide: false });

    const res = await rafraichir(app);

    expect(res.json()).toMatchObject({ code: 'SESSION_REVOKED' });
  });

  it('compte seulement désactivé : jamais `ACCOUNT_DELETED`', async () => {
    jetonNomme();
    const { app } = await monter({ ligne: DESACTIVE, sessionValide: false });

    const res = await rafraichir(app);

    expect(res.json()).toMatchObject({ code: 'SESSION_REVOKED' });
  });

  it('signature INVALIDE au nom d’un compte supprimé : refus générique, et la ligne n’est jamais lue', async () => {
    mockVerify.mockImplementation(() => {
      throw new Error('invalid signature');
    });
    const { app, findUnique } = await monter({ ligne: SUPPRIME, sessionValide: false });

    const res = await rafraichir(app);

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'MAGIC_LINK_INVALID' });
    expect(findUnique).not.toHaveBeenCalled();
  });
});
