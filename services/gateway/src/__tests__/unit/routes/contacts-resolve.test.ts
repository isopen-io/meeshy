/**
 * POST /contacts/resolve — la porte de la carte de visite partagée (#8101).
 *
 * Le résolveur est doublé pour isoler la PORTE : authentification, bornes du
 * corps, débit, et surtout le schéma de réponse FERMÉ — un champ que le
 * service laisserait passer n'atteint jamais le fil.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

const mockResolve = jest.fn<(input: unknown) => Promise<unknown[]>>();
jest.mock('../../../services/ContactCardResolver', () => ({
  ContactCardResolver: jest.fn().mockImplementation(() => ({ resolve: (input: unknown) => mockResolve(input) })),
}));

import { contactsResolveRoutes } from '../../../routes/contacts/resolve';

const VIEWER_ID = '507f1f77bcf86cd799439011';
const AWA_ID = '507f1f77bcf86cd799439022';

type Auth = 'registered' | 'anonymous' | 'none';

async function buildApp(auth: Auth = 'registered'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', {});
  app.decorate('authenticate', async (request: FastifyRequest) => {
    const contexts: Record<Auth, unknown> = {
      registered: { isAuthenticated: true, isAnonymous: false, userId: VIEWER_ID, registeredUser: { id: VIEWER_ID, role: 'USER' } },
      anonymous: { isAuthenticated: true, isAnonymous: true, userId: 'participant-1', registeredUser: null },
      none: { isAuthenticated: false, registeredUser: null },
    };
    (request as unknown as { authContext: unknown }).authContext = contexts[auth];
  });
  await contactsResolveRoutes(app);
  await app.ready();
  return app;
}

const post = (app: FastifyInstance, payload: unknown) =>
  app.inject({ method: 'POST', url: '/resolve', payload: payload as Record<string, unknown> });

beforeEach(() => {
  mockResolve.mockReset().mockResolvedValue([]);
});

describe('POST /contacts/resolve — accès', () => {
  it('refuse un appel non authentifié', async () => {
    const app = await buildApp('none');
    expect((await post(app, { phones: [], emails: [] })).statusCode).toBe(401);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('refuse un participant anonyme', async () => {
    const app = await buildApp('anonymous');
    expect((await post(app, { phones: ['+33612345678'], emails: [] })).statusCode).toBe(403);
    expect(mockResolve).not.toHaveBeenCalled();
  });
});

describe('POST /contacts/resolve — corps', () => {
  it('refuse plus de dix numéros', async () => {
    const app = await buildApp();
    const phones = Array.from({ length: 11 }, (_, index) => `+3361234560${index}`);
    expect((await post(app, { phones, emails: [] })).statusCode).toBe(400);
  });

  it('refuse un corps sans ses deux listes', async () => {
    const app = await buildApp();
    expect((await post(app, { phones: ['+33612345678'] })).statusCode).toBe(400);
  });

  it('transmet le lecteur, les identifiants et le pays au résolveur', async () => {
    const app = await buildApp();
    await post(app, { phones: ['06 12 34 56 78'], emails: ['awa@example.com'], defaultCountry: 'FR' });
    expect(mockResolve).toHaveBeenCalledWith({
      viewerId: VIEWER_ID,
      phones: ['06 12 34 56 78'],
      emails: ['awa@example.com'],
      defaultCountry: 'FR',
    });
  });
});

describe('POST /contacts/resolve — ce qui part sur le fil', () => {
  it('sert les comptes dans l’enveloppe { success, data: { accounts } }', async () => {
    const account = {
      userId: AWA_ID,
      displayName: 'Awa D.',
      username: 'awa',
      avatarUrl: null,
      bannerUrl: null,
      bio: null,
      relation: 'friend',
    };
    mockResolve.mockResolvedValue([account]);
    const app = await buildApp();
    const response = await post(app, { phones: ['+33612345678'], emails: [] });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, data: { accounts: [account] } });
  });

  it('retire tout champ hors contrat, même si le résolveur le laissait passer', async () => {
    mockResolve.mockResolvedValue([
      {
        userId: AWA_ID,
        displayName: 'Awa D.',
        username: 'awa',
        avatarUrl: null,
        bannerUrl: null,
        bio: null,
        relation: 'none',
        email: 'awa@example.com',
        phoneNumber: '+33612345678',
        isOnline: true,
        lastActiveAt: '2026-09-01T00:00:00.000Z',
        matchedBy: 'phone',
      },
    ]);
    const app = await buildApp();
    const body = (await post(app, { phones: ['+33612345678'], emails: [] })).body;
    expect(body).not.toContain('awa@example.com');
    expect(body).not.toContain('+33612345678');
    expect(body).not.toContain('isOnline');
    expect(body).not.toContain('lastActiveAt');
    expect(body).not.toContain('matchedBy');
  });
});

describe('POST /contacts/resolve — débit', () => {
  it('partage le seau de l’annuaire inversé et répond 429 au-delà', async () => {
    const app = await buildApp();
    const statuses = [];
    for (let index = 0; index < 31; index += 1) {
      statuses.push((await post(app, { phones: ['+33612345678'], emails: [] })).statusCode);
    }
    expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});
