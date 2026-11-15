/**
 * Ouvrir une demande de suppression exige la preuve qu'on est là (#4183, critères 5-6).
 *
 * `DELETE /me/delete-account` portait trois défauts que ces témoins ferment :
 *
 *  1. **Elle RÉACTIVAIT un compte désactivé** avant d'ouvrir la demande. Un
 *     compte dont la grâce avait expiré revenait donc à la vie au moment même
 *     où son propriétaire demandait à le supprimer.
 *  2. **Elle annonçait « un e-mail a été envoyé » à un compte SANS adresse.**
 *     La demande restait alors bloquée en `PENDING_EMAIL_CONFIRMATION` pour
 *     toujours — et le 409 « une demande est déjà en cours » interdisait d'en
 *     rouvrir une. Le compte devenait insupprimable, en silence.
 *  3. **Aucune ré-authentification.** Un jeton volé ouvrait la suppression.
 *
 * C'est le cas SANS adresse, et non le cas nominal, qui distingue le
 * comportement corrigé de l'actuel — un témoin qui n'exercerait que le chemin
 * heureux resterait vert sur les deux versions.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

const mockCompare = jest.fn() as jest.Mock<any>;
jest.mock('../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../utils/password-hash') as Record<string, unknown>),
  verifyPassword: (...a: any[]) => mockCompare(...a),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

const mockEnvoiCourriel = jest.fn(async () => undefined);
jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendAccountDeletionConfirmEmail: mockEnvoiCourriel,
  })),
}));

import { deleteAccountRoutes } from '../../../routes/me/delete-account';

const PREFIXE = '/api/v1/me';
const USER_ID = '507f1f77bcf86cd799439011';
const PHRASE = 'SUPPRIMER MON COMPTE';

function buildApp(compte: { email: string | null; isActive?: boolean }) {
  const ecritures: Array<Record<string, unknown>> = [];
  const prisma = {
    accountDeletionRequest: {
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => 0),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        ecritures.push({ create: data });
        return { id: 'req-1', ...data };
      }),
      updateMany: jest.fn(async (a: unknown) => { ecritures.push({ updateMany: a }); return { count: 0 }; }),
    },
    user: {
      findUnique: jest.fn(async () => ({
        email: compte.email,
        password: 'hash',
        displayName: 'A',
        firstName: 'A',
        isActive: compte.isActive ?? true,
        systemLanguage: 'fr',
      })),
      update: jest.fn(async (a: unknown) => { ecritures.push({ user: a }); return {}; }),
    },
    $transaction: jest.fn(async (ops: unknown[]) => { ecritures.push({ transaction: ops.length }); return []; }),
  };
  return { prisma, ecritures };
}

async function monter(prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } };
  });
  app.decorate('prisma', prisma as never);
  app.decorate('redis', undefined as never);
  await app.register(async (i) => { await deleteAccountRoutes(i); }, { prefix: PREFIXE });
  await app.ready();
  return app;
}

const ouvrir = (app: FastifyInstance, corps: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: `${PREFIXE}/account/deletion`, payload: corps });

describe('POST /me/account/deletion — un compte SANS adresse', () => {
  it('rend 409 et n’ouvre AUCUNE demande', async () => {
    const { prisma, ecritures } = buildApp({ email: null });
    mockCompare.mockResolvedValue(true);
    const app = await monter(prisma);

    const res = await ouvrir(app, { confirmationPhrase: PHRASE, currentPassword: 'bon' });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('NO_EMAIL');
    // Ouvrir la demande la rendrait insupprimable : le 409 « déjà en cours »
    // interdirait d'en rouvrir une, et rien ne pourrait la confirmer.
    expect(ecritures.some((e) => 'create' in e)).toBe(false);

    await app.close();
  });
});

describe('POST /me/account/deletion — la preuve de présence', () => {
  it('refuse sans mot de passe courant', async () => {
    const { prisma, ecritures } = buildApp({ email: 'a@b.c' });
    const app = await monter(prisma);

    const res = await ouvrir(app, { confirmationPhrase: PHRASE });

    expect(res.statusCode).toBe(400);
    expect(ecritures.some((e) => 'create' in e)).toBe(false);
    await app.close();
  });

  it('refuse un mauvais mot de passe — un jeton volé n’ouvre plus la suppression', async () => {
    const { prisma, ecritures } = buildApp({ email: 'a@b.c' });
    mockCompare.mockResolvedValue(false);
    const app = await monter(prisma);

    const res = await ouvrir(app, { confirmationPhrase: PHRASE, currentPassword: 'faux' });

    // 400 depuis #4811, et non 401 : ce témoin gravait l'ancien statut. Un 401
    // sur une session VALIDE fait entrer la route dans la famille « session
    // expirée » de toutes les piles clientes — mesuré côté iOS, saisir un
    // mauvais mot de passe déconnectait l'utilisateur. Le refus lui-même est
    // inchangé, et c'est lui que ce témoin garde : un jeton volé n'ouvre rien.
    // La famille de statuts est couverte branche par branche par
    // `me-account-deletion-refusal-family.test.ts`.
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_PASSWORD');
    expect(ecritures.some((e) => 'create' in e)).toBe(false);
    await app.close();
  });

  it('ouvre la demande quand tout est prouvé, avec une date de péremption', async () => {
    const { prisma, ecritures } = buildApp({ email: 'a@b.c' });
    mockCompare.mockResolvedValue(true);
    const app = await monter(prisma);

    const res = await ouvrir(app, { confirmationPhrase: PHRASE, currentPassword: 'bon' });

    expect(res.statusCode).toBe(200);
    const creation = ecritures.find((e) => 'create' in e) as { create: Record<string, unknown> };
    expect(creation.create.tokenExpiresAt).toBeInstanceOf(Date);
    expect(mockEnvoiCourriel).toHaveBeenCalled();

    await app.close();
  });
});

describe('POST /me/account/deletion — un compte désactivé', () => {
  it('ne le RÉANIME pas au moment où son propriétaire demande à le supprimer', async () => {
    const { prisma, ecritures } = buildApp({ email: 'a@b.c', isActive: false });
    mockCompare.mockResolvedValue(true);
    const app = await monter(prisma);

    await ouvrir(app, { confirmationPhrase: PHRASE, currentPassword: 'bon' });

    const reanimation = ecritures.some(
      (e) => 'user' in e && JSON.stringify(e).includes('"isActive":true')
    );
    expect(reanimation).toBe(false);

    await app.close();
  });
});

describe('GET /me/account/deletion — l’état de la demande', () => {
  it('rend le statut et la date de fin de grâce', async () => {
    const { prisma } = buildApp({ email: 'a@b.c' });
    (prisma.accountDeletionRequest.findFirst as jest.Mock<any>).mockResolvedValue({
      id: 'req-1',
      status: 'CONFIRMED',
      gracePeriodEndsAt: new Date('2026-11-30T00:00:00Z'),
      confirmedAt: new Date('2026-09-01T00:00:00Z'),
    });
    const app = await monter(prisma);

    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/account/deletion` });

    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.status).toBe('CONFIRMED');
    expect(d.gracePeriodEndsAt).toContain('2026-11-30');

    await app.close();
  });

  it('rend un état VIDE plutôt qu’une erreur quand aucune demande n’existe', async () => {
    const { prisma } = buildApp({ email: 'a@b.c' });
    const app = await monter(prisma);

    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/account/deletion` });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBeNull();

    await app.close();
  });
});
