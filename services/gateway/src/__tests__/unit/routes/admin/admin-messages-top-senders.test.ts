/**
 * `GET /admin/messages/stats` — les plus gros expéditeurs se replient par
 * COMPTE avant le top 10, et nomment leurs invités (audit 2026-10-04).
 *
 * `Message.senderId` est un PARTICIPANT (un par conversation) : le top 10
 * pris au `groupBy` comptait un membre une fois par conversation, sous-compté
 * et parfois en double. Un invité (participation sans compte) sortait
 * « Unknown » : il est servi `guest: true` avec le nom de sa participation.
 *
 * @jest-environment node
 */
import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({ get: jest.fn(async () => null), set: jest.fn(), del: jest.fn() })),
}));

import { messagesRoutes } from '../../../../routes/admin/messages';

type AnyRecord = Record<string, unknown>;

const GROUPES = [
  { senderId: 'pB', _count: { id: 25 } },
  ...Array.from({ length: 12 }, (_, i) => ({ senderId: `pA${i}`, _count: { id: 3 } })),
  { senderId: 'pG', _count: { id: 2 } },
];
const PARTICIPANTS = [
  { id: 'pB', userId: 'uB', displayName: 'Bob', user: { username: 'bob', displayName: 'Bob' } },
  ...Array.from({ length: 12 }, (_, i) => ({ id: `pA${i}`, userId: 'uA', displayName: 'Alice', user: { username: 'alice', displayName: 'Alice' } })),
  { id: 'pG', userId: null, displayName: 'Invité du lien', user: null },
];

function prisma() {
  return {
    message: {
      count: jest.fn(async () => 10),
      groupBy: jest.fn(async (args: AnyRecord) => {
        if ((args.by as string[])[0] === 'messageType') return [{ messageType: 'text', _count: { id: 10 } }];
        // Le double honore `take` : c'est lui qui portait le défaut.
        return typeof args.take === 'number' ? GROUPES.slice(0, args.take) : GROUPES;
      }),
      findMany: jest.fn(async () => []),
      aggregateRaw: jest.fn(async () => [{ daily: [], length: [] }]),
    },
    participant: {
      findMany: jest.fn(async (args: AnyRecord) => {
        const ids = ((args.where as AnyRecord).id as { in: string[] }).in;
        return PARTICIPANTS.filter((p) => ids.includes(p.id));
      }),
    },
  };
}

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma() as never);
  app.decorate('authenticate', async (request: { authContext?: unknown }) => {
    request.authContext = { isAuthenticated: true, registeredUser: { id: '507f1f77bcf86cd799439011', role: 'ADMIN', username: 'admin' } };
  });
  app.register(messagesRoutes);
  await app.ready();
  return app;
}

describe('GET /admin/messages/stats — topSenders', () => {
  it('replie les participations d’un membre en UNE ligne, comptée en entier', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/stats' });
    expect(res.statusCode).toBe(200);
    const top = res.json().data.topSenders as AnyRecord[];
    expect(top[0]).toMatchObject({ userId: 'uA', username: 'alice', messageCount: 36, guest: false });
    expect(top.filter((t) => t.userId === 'uA')).toHaveLength(1);
    expect(top[1]).toMatchObject({ userId: 'uB', messageCount: 25 });
    await app.close();
  });

  it('sert un invité guest: true avec le nom de sa participation', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/stats' });
    const invite = (res.json().data.topSenders as AnyRecord[]).find((t) => t.userId === 'pG');
    expect(invite).toMatchObject({ guest: true, displayName: 'Invité du lien', messageCount: 2 });
    await app.close();
  });
});
