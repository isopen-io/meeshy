/**
 * #6777 — le ciblage `activityStatus` compte les MÊMES destinataires à la
 * preview et à l'envoi réel, pour ses QUATRE valeurs.
 *
 * `POST /admin/broadcasts/:id/preview` réimplémentait sa propre copie du
 * commutateur `activityStatus` : le régime `'new'` (inscrit il y a ≤ 7 jours)
 * n'existait que là, le champ `inactiveDays` (celui que l'UI admin écrit
 * réellement, `apps/web/app/admin/broadcasts/new/page.tsx`) y était honoré
 * alors que `activityWindow()` — le filtre de l'envoi réel — lisait un
 * `inactiveSinceDays` que personne n'écrit jamais, et le régime `'inactive'`
 * de l'envoi omettait les comptes SANS AUCUNE activité (`lastActiveAt: null`)
 * que la preview comptait.
 *
 * Ce témoin ne rejoue aucune de ces règles : il monte la VRAIE route de
 * preview et le VRAI `BroadcastSenderJob` contre la MÊME base en mémoire, et
 * confronte le nombre ANNONCÉ aux adresses réellement écrites — pour les
 * quatre valeurs de `activityStatus`, plus une fenêtre `inactiveDays`
 * personnalisée. Le double Prisma évalue la clause `where` (`matchesWhere`) :
 * un `count`/`findMany` stubé rendrait ce témoin vert quelle que soit la règle.
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
import type { BroadcastTargeting } from '../../../jobs/broadcast-recipients';
import { matchesWhere, type MongoDoc, type WhereShape } from '../../../services/posts/__tests__/helpers/mongoWhereMatcher';

/** `BroadcastIdParamSchema` exige un ObjectId. */
const BROADCAST_ID = '6777000000000000000067b1';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number): Date => new Date(Date.now() - n * DAY_MS);

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
    emailVerifiedAt: new Date('2020-01-01T00:00:00.000Z'),
    createdAt: daysAgo(500),
    ...overrides,
  };
}

/**
 * Cinq comptes couvrant les quatre régimes ET la divergence `inactiveDays` :
 *  - u-a : inscrit il y a 2 j, actif il y a 1 j        (nouveau + actif)
 *  - u-b : inscrit il y a 200 j, actif il y a 5 j       (actif)
 *  - u-c : inscrit il y a 200 j, actif il y a 20 j      (actif au régime 30j,
 *          inactif seulement sous une fenêtre personnalisée ≤ 15 j)
 *  - u-d : inscrit il y a 500 j, actif il y a 400 j     (inactif, toute fenêtre)
 *  - u-e : inscrit il y a 500 j, jamais actif (`lastActiveAt: null`)
 */
const BASE: readonly MongoDoc[] = [
  user('u-a', 'a@example.com', { createdAt: daysAgo(2), lastActiveAt: daysAgo(1) }),
  user('u-b', 'b@example.com', { createdAt: daysAgo(200), lastActiveAt: daysAgo(5) }),
  user('u-c', 'c@example.com', { createdAt: daysAgo(200), lastActiveAt: daysAgo(20) }),
  user('u-d', 'd@example.com', { createdAt: daysAgo(500), lastActiveAt: daysAgo(400) }),
  user('u-e', 'e@example.com', { createdAt: daysAgo(500), lastActiveAt: null }),
];

function makePrisma() {
  const select = (where: WhereShape) => BASE.filter((doc) => matchesWhere(doc, where));
  return {
    adminBroadcast: {
      findUnique: jest.fn<any>(),
      update: jest.fn<any>().mockResolvedValue({}),
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

function broadcastWith(targeting: BroadcastTargeting) {
  return {
    id: BROADCAST_ID,
    status: 'SENDING',
    subject: 'Nouveautés Meeshy',
    body: 'Bonjour !',
    sourceLanguage: 'fr',
    translatedSubjects: {},
    translatedBodies: {},
    targeting,
  };
}

async function nombreAnnonce(prisma: ReturnType<typeof makePrisma>, targeting: BroadcastTargeting): Promise<number> {
  prisma.adminBroadcast.findUnique.mockResolvedValue(broadcastWith(targeting));

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

async function adressesEcrites(prisma: ReturnType<typeof makePrisma>, targeting: BroadcastTargeting): Promise<string[]> {
  prisma.adminBroadcast.findUnique.mockResolvedValue(broadcastWith(targeting));

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

describe('Diffusion admin — le ciblage `activityStatus` compte pareil à la preview et à l’envoi (#6777)', () => {
  const scenarios: ReadonlyArray<{ readonly nom: string; readonly targeting: BroadcastTargeting; readonly attendus: readonly string[] }> = [
    { nom: "'all' — tout le monde", targeting: { activityStatus: 'all' }, attendus: ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com', 'e@example.com'] },
    { nom: "'active' — actif dans les 30 derniers jours", targeting: { activityStatus: 'active' }, attendus: ['a@example.com', 'b@example.com', 'c@example.com'] },
    { nom: "'new' — inscrit il y a ≤ 7 jours", targeting: { activityStatus: 'new' }, attendus: ['a@example.com'] },
    { nom: "'inactive' — fenêtre par défaut (30 j), inclut les comptes jamais actifs", targeting: { activityStatus: 'inactive' }, attendus: ['d@example.com', 'e@example.com'] },
    { nom: "'inactive' — fenêtre personnalisée (`inactiveDays: 15`)", targeting: { activityStatus: 'inactive', inactiveDays: 15 }, attendus: ['c@example.com', 'd@example.com', 'e@example.com'] },
  ];

  for (const { nom, targeting, attendus } of scenarios) {
    it(`${nom} : annonce ${attendus.length}, écrit aux mêmes adresses`, async () => {
      const annonce = await nombreAnnonce(makePrisma(), targeting);
      const ecrites = await adressesEcrites(makePrisma(), targeting);

      expect(ecrites).toEqual([...attendus].sort());
      expect(annonce).toBe(ecrites.length);
    });
  }
});
