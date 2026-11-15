/**
 * #7773 — le garde de champs requis de `POST /admin/broadcasts` portait
 * l'annotation :
 *
 *   `istanbul ignore next -- Zod CreateBroadcastBodySchema enforces all
 *    required fields; guard unreachable`
 *
 * L'affirmation était fausse. `CreateBroadcastBodySchema` déclare
 * `name: z.string()` — SANS `.min(1)`. Zod impose la PRÉSENCE du champ, pas
 * sa NON-VACUITÉ : `""` est un `string` valide. Le garde est donc le seul
 * rempart contre un broadcast au nom vide, et il s'exécute.
 *
 * Les trois témoins ci-dessous se lisent dans l'ordre : la prémisse (le
 * schéma laisse passer), la conséquence (le garde attrape), et le contraste
 * (un corps plein passe) — sans lequel le 400 pourrait venir d'ailleurs.
 *
 * Fichier séparé de `admin-routes-group3.test.ts`, déjà hors budget, comme
 * l'ont fait ses deux voisins `admin-broadcasts-*.test.ts`.
 *
 * @jest-environment node
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      info: jest.fn<any>(),
      warn: jest.fn<any>(),
      error: jest.fn<any>(),
      debug: jest.fn<any>(),
    }),
  },
}));

// Mockés parce que `broadcastRoutes` les importe au chargement du module —
// aucun témoin ci-dessous ne les exerce (ils ne servent qu'aux routes
// `/:id/preview|/send|/send-inapp`).
jest.mock('../../../../services/admin/broadcast-translation.service', () => ({
  BroadcastTranslationService: jest.fn<any>().mockImplementation(() => ({
    translateContent: jest.fn<any>(),
  })),
}));
jest.mock('../../../../jobs/broadcast-sender', () => ({
  BroadcastSenderJob: jest.fn<any>().mockImplementation(() => ({ execute: jest.fn<any>() })),
}));
jest.mock('../../../../jobs/broadcast-inapp-sender', () => ({
  BroadcastInAppSenderJob: jest.fn<any>().mockImplementation(() => ({ execute: jest.fn<any>() })),
}));
jest.mock('../../../../services/EmailService', () => ({
  EmailService: jest.fn<any>().mockImplementation(() => ({})),
}));

import { broadcastRoutes } from '../../../../routes/admin/broadcasts';
import { CreateBroadcastBodySchema } from '../../../../validation/admin-schemas';

const ADMIN_ID = '507f1f77bcf86cd799439011';
const BROADCAST_ID = '507f1f77bcf86cd799439012';

const PLEIN = {
  name: 'Annonce de maintenance',
  subject: 'Maintenance prevue',
  body: 'Le service sera indisponible une heure.',
  sourceLanguage: 'fr',
};

function makeMockPrisma() {
  return {
    adminBroadcast: {
      create: jest.fn<any>().mockResolvedValue({ id: BROADCAST_ID, ...PLEIN, status: 'DRAFT' }),
    },
    adminAuditLog: {
      create: jest.fn<any>().mockResolvedValue({ id: 'audit-1' }),
    },
  };
}

function buildApp(prisma: ReturnType<typeof makeMockPrisma>): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('notificationService', { createSystemNotification: jest.fn<any>() });
  app.decorate('authenticate', async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      registeredUser: { id: ADMIN_ID, role: 'ADMIN', username: 'admin' },
    };
  });
  app.register(broadcastRoutes);
  return app;
}

describe('POST /admin/broadcasts — le garde de champs vides est ATTEIGNABLE (#7773)', () => {
  it("LA PRÉMISSE — CreateBroadcastBodySchema accepte une chaîne vide : z.string() n'est pas .min(1)", () => {
    const parsed = CreateBroadcastBodySchema.safeParse({ ...PLEIN, name: '' });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.name).toBe('');
  });

  it('LA CONSÉQUENCE — un nom vide traverse Zod et se fait arrêter par le garde, pas par le schéma', async () => {
    const prisma = makeMockPrisma();
    const app = buildApp(prisma);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: { ...PLEIN, name: '' },
    });

    expect(res.statusCode).toBe(400);
    // Le message du GARDE, pas le « Validation failed » de `createValidator` :
    // c'est lui qui distingue les deux remparts.
    expect(res.json().message).toBe(
      'Les champs name, subject, body et sourceLanguage sont requis'
    );
    // Et rien n'est parti en base.
    expect(prisma.adminBroadcast.create).not.toHaveBeenCalled();

    await app.close();
  });

  it('LE CONTRASTE — un corps plein passe le garde et crée le brouillon', async () => {
    const prisma = makeMockPrisma();
    const app = buildApp(prisma);
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/', payload: PLEIN });

    expect(res.statusCode).toBe(201);
    expect(prisma.adminBroadcast.create).toHaveBeenCalledTimes(1);

    await app.close();
  });
});
