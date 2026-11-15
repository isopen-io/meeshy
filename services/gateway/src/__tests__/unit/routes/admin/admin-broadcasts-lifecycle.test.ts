/**
 * Diffusions — quatre corrections de l'audit du 2026-10-04.
 *
 * 1. L'aperçu servait UN compte de destinataires, celui du canal e-mail
 *    (adresse vérifiée exigée) ; la confirmation de l'envoi IN-APP le
 *    réutilisait, alors que l'in-app n'exige aucune adresse. Deux comptes :
 *    `emailRecipients` et `inAppRecipients` (`recipientCount` reste l'e-mail).
 * 2. L'aperçu ramenait à READY une diffusion déjà SENT ou SENDING.
 * 3. La modification (PUT) et l'aperçu ne laissaient aucune ligne au journal.
 *
 * @jest-environment node
 */
import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));
jest.mock('../../../../services/admin/broadcast-translation.service', () => ({
  BroadcastTranslationService: jest.fn().mockImplementation(() => ({
    translateContent: async () => ({ subjects: {}, bodies: {} }),
  })),
}));
jest.mock('../../../../jobs/broadcast-sender', () => ({ BroadcastSenderJob: jest.fn().mockImplementation(() => ({ execute: jest.fn() })) }));
jest.mock('../../../../jobs/broadcast-inapp-sender', () => ({ BroadcastInAppSenderJob: jest.fn().mockImplementation(() => ({ execute: jest.fn() })) }));
jest.mock('../../../../services/EmailService', () => ({ EmailService: jest.fn().mockImplementation(() => ({})) }));

import { broadcastRoutes } from '../../../../routes/admin/broadcasts';

type AnyRecord = Record<string, unknown>;
const ID = '507f1f77bcf86cd799439011';
const ADMIN = '507f1f77bcf86cd799439099';

function diffusion(over: AnyRecord = {}): AnyRecord {
  return {
    id: ID, name: 'Rentrée', subject: 'Bonjour', body: 'Corps', sourceLanguage: 'fr', targeting: {},
    status: 'DRAFT', createdById: ADMIN, translatedSubjects: null, translatedBodies: null, ...over,
  };
}

function prisma(row: AnyRecord) {
  return {
    adminBroadcast: {
      findUnique: jest.fn(async () => row),
      update: jest.fn(async (a: { data: AnyRecord }) => ({ ...row, ...a.data })),
    },
    adminAuditLog: { create: jest.fn(async (_a: { data: AnyRecord }) => ({})) },
    user: {
      // Le canal e-mail exige `emailVerifiedAt` : 3 ; sans cette contrainte : 5.
      count: jest.fn(async (a: { where: AnyRecord }) => ('emailVerifiedAt' in a.where ? 3 : 5)),
      groupBy: jest.fn(async () => []),
      findMany: jest.fn(async () => []),
    },
    userPreferences: { findUnique: jest.fn(async () => null) },
  };
}
type P = ReturnType<typeof prisma>;

async function build(p: P): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', p as never);
  app.decorate('authenticate', async (request: { authContext?: unknown }) => {
    request.authContext = { isAuthenticated: true, userId: ADMIN, registeredUser: { id: ADMIN, role: 'ADMIN' } };
  });
  await app.register(broadcastRoutes);
  await app.ready();
  return app;
}

const lignes = (p: P) => p.adminAuditLog.create.mock.calls.map((c) => (c[0] as { data: AnyRecord }).data);

describe('POST /:id/preview', () => {
  it('sert deux comptes : e-mail (adresse vérifiée) et in-app (sans adresse)', async () => {
    const p = prisma(diffusion());
    const app = await build(p);
    const data = (await app.inject({ method: 'POST', url: `/${ID}/preview` })).json().data;
    expect(data).toMatchObject({ recipientCount: 3, emailRecipients: 3, inAppRecipients: 5 });
    await app.close();
  });

  it.each(['SENT', 'SENDING'])('ne ramène pas une diffusion %s à READY', async (status) => {
    const p = prisma(diffusion({ status }));
    const app = await build(p);
    const res = await app.inject({ method: 'POST', url: `/${ID}/preview` });
    expect(res.statusCode).toBe(200);
    const ecrit = (p.adminBroadcast.update.mock.calls[0]?.[0] as { data: AnyRecord } | undefined)?.data;
    expect(ecrit?.status).toBeUndefined();
    await app.close();
  });

  it('une diffusion DRAFT passe READY, et la préparation est tracée', async () => {
    const p = prisma(diffusion());
    const app = await build(p);
    await app.inject({ method: 'POST', url: `/${ID}/preview` });
    expect((p.adminBroadcast.update.mock.calls[0][0] as { data: AnyRecord }).data.status).toBe('READY');
    expect(lignes(p)).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'PREVIEW_BROADCAST', entity: 'Broadcast', entityId: ID, adminId: ADMIN })]));
    await app.close();
  });
});

describe('PUT /:id', () => {
  it('trace la modification avec le diff des champs changés', async () => {
    const p = prisma(diffusion());
    const app = await build(p);
    const res = await app.inject({ method: 'PUT', url: `/${ID}`, payload: { subject: 'Bonsoir' } });
    expect(res.statusCode).toBe(200);
    const ligne = lignes(p).find((l) => l.action === 'UPDATE_BROADCAST');
    expect(ligne).toMatchObject({ entity: 'Broadcast', entityId: ID, adminId: ADMIN });
    expect(JSON.parse(String(ligne?.changes))).toEqual({ subject: { before: 'Bonjour', after: 'Bonsoir' } });
    expect(JSON.parse(String(ligne?.metadata))).toMatchObject({ name: 'Rentrée' });
    await app.close();
  });
});
