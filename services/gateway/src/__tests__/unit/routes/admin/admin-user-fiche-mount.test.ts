/**
 * La fiche d'un membre, montée comme en production (#7845) : `userAdminRoutes`
 * sous `/api/v1`, les VRAIS `permissionsService`, `UserAuditService`, registre
 * des préférences et gestes d'après-écriture — seul Prisma est doublé.
 *
 * Les témoins voisins (`user-preferences.test.ts`, `admin-user-stats.test.ts`)
 * montent chaque module seul et doublent les effets ; celui-ci atteste ce que
 * seule la composition dit : la ligne d'audit PERSISTÉE, l'annonce aux
 * appareils du membre, le ménage des lignes héritées, et le seuil de `Report`
 * appliqué sur la porte réellement enregistrée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const ADMIN_ID = '507f1f77bcf86cd799439001';
const TARGET_ID = '507f1f77bcf86cd799439777';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

type Ligne = Record<string, unknown>;
type Emission = { readonly room: string; readonly event: string; readonly payload: unknown };

function fauxPrisma() {
  const emissions: Emission[] = [];
  const compteur = () => ({ count: jest.fn(async () => 0) });
  const prisma = {
    user: {
      findUnique: jest.fn(async () => ({
        id: TARGET_ID,
        role: 'USER',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        dataProcessingConsentAt: null,
        analyticsConsentAt: null,
        voiceDataConsentAt: null,
        voiceProfileConsentAt: null,
        voiceCloningEnabledAt: null,
      })),
    },
    message: { count: jest.fn(async () => 0), groupBy: jest.fn(async () => []), findMany: jest.fn(async () => []) },
    participant: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
    post: compteur(),
    postComment: compteur(),
    reaction: compteur(),
    postReaction: compteur(),
    commentReaction: compteur(),
    messageAttachment: compteur(),
    postMedia: compteur(),
    friendRequest: compteur(),
    userContact: compteur(),
    communityMember: compteur(),
    report: compteur(),
    userSession: compteur(),
    ban: compteur(),
    conversationShareLink: compteur(),
    trackingLink: compteur(),
    affiliateToken: compteur(),
    userPreferences: {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => ({ id: 'prefs-1' })),
    },
    userPreference: {
      findMany: jest.fn(async () => []),
      deleteMany: jest.fn(async (_args: unknown) => ({ count: 0 })),
    },
    adminAuditLog: {
      create: jest.fn(async (args: { data: Ligne }) => ({ id: 'audit-1', createdAt: new Date(), ...args.data })),
    },
  };
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => emissions.push({ room, event, payload }) }) };
  return { prisma, io, emissions };
}

type Faux = ReturnType<typeof fauxPrisma>;

async function monter(faux: Faux, role: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', faux.prisma as unknown as PrismaClient);
  app.decorate('socketIOHandler', { io: faux.io } as unknown as FastifyInstance['socketIOHandler']);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    (request as unknown as Ligne).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID, role },
      hasFullAccess: true,
    };
  });
  const { userAdminRoutes } = await import('../../../../routes/admin/users');
  await app.register(userAdminRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

const lignesDAudit = (faux: Faux): Ligne[] =>
  faux.prisma.adminAuditLog.create.mock.calls.map((appel) => (appel[0] as { data: Ligne }).data);

describe('fiche d\'un membre — préférences, montage de production', () => {
  it('persiste la consultation en VIEW_USER, surface preferences', async () => {
    const faux = fauxPrisma();
    const app = await monter(faux, 'ADMIN');
    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/users/${TARGET_ID}/preferences` });
    expect(res.statusCode).toBe(200);
    const [ligne] = lignesDAudit(faux);
    expect(ligne).toEqual(expect.objectContaining({ userId: TARGET_ID, adminId: ADMIN_ID, action: 'VIEW_USER' }));
    expect(JSON.parse(ligne?.metadata as string)).toEqual({ surface: 'preferences' });
    await app.close();
  });

  it('annonce la catégorie écrite aux appareils du membre, sur SA room', async () => {
    const faux = fauxPrisma();
    const app = await monter(faux, 'ADMIN');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${TARGET_ID}/preferences/notification`,
      payload: { values: { dndEnabled: true } },
    });
    expect(res.statusCode).toBe(200);
    expect(faux.emissions).toEqual([
      { room: `user:${TARGET_ID}`, event: 'user:preferences-updated', payload: { userId: TARGET_ID, category: 'notification' } },
    ]);
    await app.close();
  });

  it('retire les lignes héritées après une écriture de privacy', async () => {
    const faux = fauxPrisma();
    const app = await monter(faux, 'ADMIN');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${TARGET_ID}/preferences/privacy`,
      payload: { values: { showLastSeen: false } },
    });
    expect(res.statusCode).toBe(200);
    expect(faux.prisma.userPreference.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: TARGET_ID }) })
    );
    const [ligne] = lignesDAudit(faux);
    expect(JSON.parse(ligne?.changes as string)).toEqual({ 'privacy.showLastSeen': { before: true, after: false } });
    await app.close();
  });

  it('refuse la famille chiffrement même à un BIGBOSS, sans écrire ni tracer', async () => {
    const faux = fauxPrisma();
    const app = await monter(faux, 'BIGBOSS');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${TARGET_ID}/preferences/privacy`,
      payload: { values: { autoEncryptNewConversations: false } },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual(expect.objectContaining({ success: false, code: 'READ_ONLY_PREFERENCE' }));
    expect(faux.prisma.userPreferences.upsert).not.toHaveBeenCalled();
    expect(faux.emissions).toEqual([]);
    expect(lignesDAudit(faux)).toHaveLength(0);
    await app.close();
  });
});

describe('fiche d\'un membre — statistiques, montage de production', () => {
  it('rend les signalements à null pour AUDIT sans lire la table', async () => {
    const faux = fauxPrisma();
    const app = await monter(faux, 'AUDIT');
    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/users/${TARGET_ID}/stats` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.counts).toMatchObject({ reportsReceived: null, reportsMade: null, reportsOnMessages: null });
    expect(faux.prisma.report.count).not.toHaveBeenCalled();
    await app.close();
  });

  it('sert des nombres à un ADMIN', async () => {
    const faux = fauxPrisma();
    const app = await monter(faux, 'ADMIN');
    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/users/${TARGET_ID}/stats` });
    expect(res.json().data.counts).toMatchObject({ reportsReceived: 0, reportsMade: 0, reportsOnMessages: 0 });
    await app.close();
  });
});
