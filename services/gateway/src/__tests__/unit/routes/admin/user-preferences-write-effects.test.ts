/**
 * Ce qu'une écriture d'administrateur sur les préférences d'un membre FAIT
 * après l'écriture (#7845) — les effets réels d'`applyCategoryWriteEffects`,
 * que `user-preferences.test.ts` double pour attester qu'ils partent.
 *
 * Un fichier à part parce que le double y est posé par `jest.mock`, pour tout
 * le module : ici rien n'est doublé que Prisma et la couche Socket.IO, et les
 * témoins assertent sur ce qui ARRIVE — l'événement émis dans la room du
 * membre, la suppression des lignes héritées. Sans eux, une route qui cesserait
 * d'appeler le vrai helper, ou un helper qui cesserait d'émettre, laisserait les
 * appareils du membre sur l'ancienne valeur sans qu'aucun témoin ne rougisse.
 *
 * Portés de `admin-user-member-page.test.ts` (dev, 28387560), retiré par la
 * fusion des deux fiches.
 *
 * @jest-environment node
 */

import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

import { registerUserPreferenceRoutes } from '../../../../routes/admin/user-preferences';

const ADMIN_ID = '507f1f77bcf86cd799439001';
const TARGET_ID = '507f1f77bcf86cd799439777';

type Emission = { readonly room: string; readonly event: string; readonly payload: unknown };

function fauxPrisma() {
  return {
    user: {
      findUnique: jest.fn(async () => ({
        id: TARGET_ID,
        role: 'USER',
        dataProcessingConsentAt: null,
        analyticsConsentAt: null,
        voiceDataConsentAt: null,
        voiceProfileConsentAt: null,
        voiceCloningEnabledAt: null,
      })),
    },
    userPreferences: {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => ({ id: 'prefs-1' })),
    },
    userPreference: { findMany: jest.fn(async () => []), deleteMany: jest.fn(async (_args: unknown) => ({ count: 0 })) },
  };
}

async function patcher(category: string, values: Record<string, unknown>) {
  const prisma = fauxPrisma();
  const emissions: Emission[] = [];
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => emissions.push({ room, event, payload }) }) };
  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate('prisma', prisma as unknown as FastifyInstance['prisma']);
  app.decorate('socketIOHandler', { io } as unknown as FastifyInstance['socketIOHandler']);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID, role: 'ADMIN' },
      hasFullAccess: true,
    };
  });
  await app.register(async (scope) => {
    registerUserPreferenceRoutes(scope, { userAuditService: { createAuditLog: jest.fn(async () => undefined) } as never });
  }, { prefix: '/api/v1' });
  await app.ready();
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/v1/admin/users/${TARGET_ID}/preferences/${category}`,
    payload: { values },
  });
  await app.close();
  return { res, prisma, emissions };
}

describe('PATCH /admin/users/:userId/preferences/:category — les effets réels', () => {
  it('annonce la catégorie écrite aux appareils du membre (user:preferences-updated sur sa room)', async () => {
    const { res, emissions } = await patcher('notification', { dndEnabled: true });

    expect(res.statusCode).toBe(200);
    expect(emissions).toEqual([
      { room: `user:${TARGET_ID}`, event: 'user:preferences-updated', payload: { userId: TARGET_ID, category: 'notification' } },
    ]);
  });

  it('retire les lignes héritées du membre après une écriture de privacy', async () => {
    const { res, prisma } = await patcher('privacy', { showLastSeen: false });

    expect(res.statusCode).toBe(200);
    expect(prisma.userPreference.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: TARGET_ID }) })
    );
  });
});
