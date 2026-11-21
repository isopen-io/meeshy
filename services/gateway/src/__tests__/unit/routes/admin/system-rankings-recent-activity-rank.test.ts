/**
 * « ACTIVITÉ LA PLUS RÉCENTE » SERT LE RANG, PAS LE DERNIER MESSAGE (#19835).
 *
 * `GET /ranking?entityType=conversations&criterion=recent_activity` est la seule
 * des quatre surfaces d'administration qui PASSE au rang, et la raison n'est pas
 * une préférence : la surface promet l'activité à l'administrateur, en quatre
 * langues (`apps/web/src/lib/interface-catalogs/admin/classement-supervision-*.ts`
 * — « Activité la plus récente »), et le champ servi s'appelle `lastActivity`.
 * Ses trois voisines (supervision de communauté, conversations outillées,
 * recherche) restent sur `lastMessageAt` et le DISENT à leur site.
 *
 * Le double évalue l'ordre demandé, le `where` de chaque flux et la borne : une
 * lecture d'un seul flux, ou un `lastActivity` servi depuis `lastMessageAt`, le
 * font tomber. Il ne pouvait pas tomber avant #19800, qui a rendu la colonne
 * `lastActivityAt` réellement écrite.
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { matchesMongoWhere, type MongoDocument } from '../../../helpers/mongo-where';
import { orderDocs } from '../../../helpers/direct-pair-world';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../validation/helpers', () => ({
  validateQuery: () => async () => {},
  validateBody: () => async () => {},
  validateParams: () => async () => {},
}));

import { systemRankingsRoutes } from '../../../../routes/admin/system-rankings';

const LIFTED = 'conv00lifted';
const SPOKEN = 'conv00spoken';

const EARLY = new Date('2026-11-01T10:00:00Z');
const MIDDLE = new Date('2026-11-10T10:00:00Z');
const LATE = new Date('2026-11-18T10:00:00Z');

const convo = (id: string, lastMessageAt: Date, lastActivityAt: Date | null): MongoDocument => ({
  id,
  identifier: id,
  title: id,
  type: 'group',
  avatar: null,
  lastMessageAt,
  lastActivityAt,
});

/** Un `findMany` qui honore le `where`, l'ordre (clés multiples comprises) et `take`. */
const conversationsIn = (docs: readonly MongoDocument[]) =>
  jest.fn(async (args: any) => {
    const kept = docs.filter((doc) => matchesMongoWhere(doc, args?.where));
    const ordered = orderDocs(kept as never, args?.orderBy);
    return (args?.take === undefined ? ordered : ordered.slice(0, args.take)) as never;
  });

function world(docs: readonly MongoDocument[]) {
  const findMany = conversationsIn(docs);
  const prisma: any = {
    message: { groupBy: jest.fn<any>().mockResolvedValue([]), findMany: jest.fn<any>().mockResolvedValue([]) },
    participant: { groupBy: jest.fn<any>().mockResolvedValue([]), findMany: jest.fn<any>().mockResolvedValue([]) },
    conversation: { findMany },
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = { isAuthenticated: true, registeredUser: { id: 'adminUser', role: 'ADMIN', username: 'admin' } };
  });
  app.register(systemRankingsRoutes);
  return { app, findMany };
}

const rank = async (docs: readonly MongoDocument[], query = '') => {
  const { app, findMany } = world(docs);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/ranking?entityType=conversations&criterion=recent_activity${query}` });
  await app.close();
  return { rankings: JSON.parse(res.body).data.rankings as readonly any[], findMany, status: res.statusCode };
};

describe('recent_activity — le classement suit le RANG (#19835)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('une conversation REMONTÉE par une réaction passe devant celle au dernier message plus récent', async () => {
    const { rankings, status } = await rank([convo(LIFTED, EARLY, LATE), convo(SPOKEN, MIDDLE, null)]);
    expect(status).toBe(200);
    expect(rankings.map((r) => r.id)).toEqual([LIFTED, SPOKEN]);
  });

  it('`lastActivity` sert le RANG, jamais le dernier message', async () => {
    const { rankings } = await rank([convo(LIFTED, EARLY, LATE)]);
    expect(rankings[0].lastActivity).toBe(LATE.toISOString());
    expect(rankings[0].lastActivity).not.toBe(EARLY.toISOString());
  });

  it('sans activité, le classement et le champ servi restent ceux du dernier message', async () => {
    const { rankings } = await rank([convo(SPOKEN, MIDDLE, null), convo(LIFTED, EARLY, null)]);
    expect(rankings.map((r) => r.id)).toEqual([SPOKEN, LIFTED]);
    expect(rankings[0].lastActivity).toBe(MIDDLE.toISOString());
  });

  it('la fenêtre de période borne sur le RANG : une conversation remontée DANS la période y entre, même parlée avant', async () => {
    const { rankings } = await rank([convo(LIFTED, EARLY, LATE)], '&period=7d');
    expect(rankings.map((r) => r.id)).toEqual([LIFTED]);
  });

  it('les deux flux sont lus, l’un borné aux lignes qui portent une activité', async () => {
    const { findMany } = await rank([convo(SPOKEN, MIDDLE, null)]);
    const reads = findMany.mock.calls.map((call) => call[0] as { orderBy: unknown; where: MongoDocument; select: MongoDocument });
    expect(reads.map((read) => read.orderBy)).toEqual([
      [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      [{ lastActivityAt: 'desc' }, { id: 'desc' }],
    ]);
    expect(reads[0].where.lastActivityAt).toBeUndefined();
    expect(reads[1].where.lastActivityAt).toEqual({ not: null });
    expect(reads[0].select).toMatchObject({ lastMessageAt: true, lastActivityAt: true });
  });
});
