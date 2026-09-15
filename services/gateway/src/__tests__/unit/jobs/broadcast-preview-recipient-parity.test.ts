/**
 * #6581 — l'APERÇU annonce EXACTEMENT ceux à qui l'envoi écrira.
 *
 * `POST /admin/broadcasts/:id/preview` sert un `recipientCount` sur lequel un
 * administrateur décide de lancer une campagne. Il portait sa propre copie de
 * la contrainte de canal (`emailVerifiedAt: { not: null }`, écrit à la main)
 * pendant que `BroadcastSenderJob` portait la sienne. Deux copies d'une même
 * règle divergent au premier lot qui n'en touche qu'une — et l'exclusion des
 * trois adresses de bootstrap est exactement ce lot-là : ajoutée d'un seul
 * côté, elle ferait ANNONCER trois destinataires que l'envoi n'atteindra
 * jamais, ou l'inverse.
 *
 * Ce témoin ne lit aucun source : il monte la VRAIE route, lui donne la même
 * base en mémoire qu'au VRAI job d'envoi, et confronte le nombre ANNONCÉ au
 * nombre d'adresses réellement écrites. Le double Prisma évalue la clause
 * `where` (`matchesWhere`) — un `count` stubé rendrait ce témoin vert quelle
 * que soit la règle.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../middleware/authorize', () => ({
  requirePermission: () => async () => {},
}));

jest.mock('../../../services/admin/broadcast-translation.service', () => ({
  BroadcastTranslationService: jest.fn().mockImplementation(() => ({
    translateContent: jest.fn<any>().mockResolvedValue({ subjects: {}, bodies: {} }),
  })),
}));

import { broadcastRoutes } from '../../../routes/admin/broadcasts';
import { BroadcastSenderJob } from '../../../jobs/broadcast-sender';
import { matchesWhere, type MongoDoc, type WhereShape } from '../../../services/posts/__tests__/helpers/mongoWhereMatcher';

/** `BroadcastIdParamSchema` exige un ObjectId — la route refuse toute autre forme en 400. */
const BROADCAST_ID = '6581000000000000000065b1';

const BROADCAST = {
  id: BROADCAST_ID,
  status: 'SENDING',
  subject: 'Nouveautés Meeshy',
  body: 'Bonjour !',
  sourceLanguage: 'fr',
  translatedSubjects: {},
  translatedBodies: {},
  targeting: {},
};

function user(id: string, email: string, overrides: Partial<MongoDoc> = {}): MongoDoc {
  return {
    id,
    email,
    displayName: id,
    username: id,
    systemLanguage: 'fr',
    registrationCountry: 'FR',
    isActive: true,
    deletedAt: null,
    emailVerifiedAt: new Date('2026-09-15T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

/** Deux humains, les trois comptes semés, et un compte jamais vérifié. */
const BASE: readonly MongoDoc[] = [
  user('u-andre', 'zuymanto@gmail.com'),
  user('u-claire', 'claire@example.com'),
  user('u-meeshy', 'meeshy@meeshy.me'),
  user('u-admin', 'admin@meeshy.me'),
  user('u-atabeth', 'atabeth@meeshy.me'),
  user('u-neuf', 'neuf@example.com', { emailVerifiedAt: null }),
];

function makePrisma() {
  const select = (where: WhereShape) => BASE.filter((doc) => matchesWhere(doc, where));
  return {
    adminBroadcast: {
      findUnique: jest.fn<any>().mockResolvedValue(BROADCAST),
      update: jest.fn<any>().mockResolvedValue(BROADCAST),
    },
    user: {
      count: jest.fn<any>(async (args: { where: WhereShape }) => select(args.where).length),
      groupBy: jest.fn<any>().mockResolvedValue([]),
      findMany: jest.fn<any>(async (args: { where?: WhereShape; distinct?: string[]; skip?: number; take?: number }) => {
        if (args?.distinct?.includes('systemLanguage')) return [];
        const rows = select(args.where ?? {});
        return rows.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? rows.length));
      }),
    },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  };
}

async function nombreAnnonce(prisma: ReturnType<typeof makePrisma>): Promise<number> {
  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate('authenticate', async () => {});
  app.decorate('prisma', prisma as never);
  await app.register(broadcastRoutes);
  await app.ready();

  const res = await app.inject({ method: 'POST', url: `/${BROADCAST_ID}/preview` });
  await app.close();

  expect(res.statusCode).toBe(200);
  return (res.json() as { data: { recipientCount: number } }).data.recipientCount;
}

async function adressesEcrites(prisma: ReturnType<typeof makePrisma>): Promise<string[]> {
  const sent: string[] = [];
  const emailService = {
    sendBroadcastEmail: jest.fn<any>(async ({ to }: { to: string }) => {
      sent.push(to);
      return { success: true };
    }),
  };
  await new BroadcastSenderJob(prisma as never, emailService as never).execute(BROADCAST_ID);
  return sent.sort();
}

describe('Diffusion admin — l’aperçu et l’envoi comptent les MÊMES destinataires (#6581)', () => {
  it('annonce 2, écrit à 2 — ni les trois adresses de bootstrap, ni le compte non vérifié', async () => {
    const annonce = await nombreAnnonce(makePrisma());
    const ecrites = await adressesEcrites(makePrisma());

    expect(ecrites).toEqual(['claire@example.com', 'zuymanto@gmail.com']);
    expect(annonce).toBe(ecrites.length);
  });
});
