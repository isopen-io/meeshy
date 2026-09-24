/**
 * `PATCH /links/:linkId` — l'édition d'un lien d'invitation écrit CHAQUE champ
 * que les écrans de détail iOS et web éditent (#7797, point D).
 *
 * Schémas réels (corps JSON et Zod) : un champ que le schéma du corps ne
 * déclarerait pas, ou que le gestionnaire ne recopierait pas, n'atteindrait
 * jamais la ligne — et un témoin qui n'assert que le statut resterait vert.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (req: FastifyRequest) => {
    (req as unknown as { authContext: unknown }).authContext = {
      isAuthenticated: true, isAnonymous: false, userId: CREATOR,
      registeredUser: { id: CREATOR, role: 'USER' }, hasFullAccess: true,
    };
  }),
  isRegisteredUser: jest.fn((ctx: { registeredUser?: unknown } | null) => ctx?.registeredUser != null),
}));

import { registerManagementRoutes } from '../../../../routes/links/management';

const CREATOR = '507f1f77bcf86cd799439011';
const LINK_DB_ID = '507f1f77bcf86cd799439022';
const LINK_ID = 'mshy_abc123';

const edit = {
  name: 'Invitation équipe',
  description: 'Rejoins-nous !',
  maxUses: 50,
  maxConcurrentUsers: 10,
  expiresAt: '2026-12-31T23:59:59.000Z',
  isActive: true,
  allowAnonymousMessages: false,
  allowAnonymousFiles: true,
  allowAnonymousImages: false,
  allowViewHistory: false,
  requireAccount: true,
  requireNickname: false,
  requireEmail: true,
  requireBirthday: true,
  allowedLanguages: ['fr', 'en'],
};

async function patch(payload: Record<string, unknown>) {
  const update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: LINK_DB_ID, linkId: LINK_ID, ...data }));
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    conversationShareLink: {
      findFirst: jest.fn(async () => ({ id: LINK_DB_ID, linkId: LINK_ID, createdBy: CREATOR, conversation: { participants: [] } })),
      update,
    },
  } as never);
  await registerManagementRoutes(app);
  await app.ready();
  const res = await app.inject({ method: 'PATCH', url: `/links/${LINK_ID}`, payload });
  await app.close();
  const written = (update.mock.calls[0] as unknown as [{ data: Record<string, unknown> }] | undefined)?.[0].data;
  return { status: res.statusCode, written };
}

describe('PATCH /links/:linkId — les champs de l’édition', () => {
  it('écrit chacun des champs que les écrans de détail éditent', async () => {
    const { status, written } = await patch(edit);

    expect(status).toBe(200);
    expect(written).toEqual({ ...edit, expiresAt: new Date(edit.expiresAt) });
  });

  it('lève les limites : sans maximum, sans expiration, toutes les langues', async () => {
    const { status, written } = await patch({ maxUses: null, maxConcurrentUsers: null, expiresAt: null, allowedLanguages: [] });

    expect(status).toBe(200);
    expect(written).toEqual({ maxUses: null, maxConcurrentUsers: null, expiresAt: null, allowedLanguages: [] });
  });
});
