/**
 * LA SECTION `relations` DE L'EXPORT (#14400, écart E2 de #13942) — mes liens,
 * ce que J'accorde, mes compteurs par paire et mes consentements, à travers le
 * VRAI sérialiseur de la route. Jamais ce que l'autre m'accorde, ni ses
 * passages, ni ses compteurs envers moi, ni ses consentements (art. 15(4)).
 *
 * Les doubles APPLIQUENT le `where` : ce qui sort est ce que la lecture rend.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { matchesMongoWhere, type MongoDocument } from '../../../helpers/mongo-where';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

import { dataExportRoutes } from '../../../../routes/me/export';

const ME = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd7994390ff';
const THIRD = '507f1f77bcf86cd7994390aa';
const STRANGER = '507f1f77bcf86cd7994390bb';
const BORN = new Date('2026-08-01T00:00:00.000Z');
const ROSE = new Date('2026-09-01T00:00:00.000Z');
const OTHER_DROP = new Date('2026-10-01T00:00:00.000Z');
const DAY = new Date('2026-10-20T00:00:00.000Z');
const WITHDRAWN = new Date('2026-10-15T00:00:00.000Z');

const zeroCounts = (side: 'Low' | 'High') =>
  Object.fromEntries(['Message', 'Reaction', 'PostView', 'Comment', 'Share', 'StoryReply', 'Mention', 'Call', 'Audio'].map((kind) => [`by${side}${kind}`, 0]));

const interactionDay = (row: { userLowId: string; userHighId: string; low?: Record<string, number>; high?: Record<string, number> }) => ({
  userLowId: row.userLowId,
  userHighId: row.userHighId,
  day: DAY,
  ...zeroCounts('Low'),
  ...zeroCounts('High'),
  ...row.low,
  ...row.high,
});

function table(rows: MongoDocument[]) {
  return {
    findMany: jest.fn<any>(async ({ where, take, skip }: { where: MongoDocument; take: number; skip: number }) =>
      rows.filter((row) => matchesMongoWhere(row, where)).slice(skip, skip + take),
    ),
  };
}

function relationTables() {
  return {
    userRelation: table([
      {
        userLowId: ME, userHighId: OTHER, grantedByLow: 'CLOSE', grantedByHigh: 'BLOOD', origin: 'request', createdAt: BORN,
        transitions: [
          { actorId: ME, from: 'PUBLIC', to: 'CLOSE', at: ROSE },
          { actorId: OTHER, from: 'PUBLIC', to: 'BLOOD', at: ROSE },
          { actorId: OTHER, from: 'BLOOD', to: 'ACQUAINTANCE', at: OTHER_DROP },
        ],
      },
      { userLowId: THIRD, userHighId: ME, grantedByLow: 'ATOM', grantedByHigh: 'ACQUAINTANCE', origin: 'auto-acquaintance', createdAt: BORN, transitions: [] },
      { userLowId: THIRD, userHighId: STRANGER, grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND', origin: 'request', createdAt: BORN, transitions: [] },
    ]),
    pairInteractionDay: table([
      interactionDay({ userLowId: ME, userHighId: OTHER, low: { byLowMessage: 3, byLowCall: 1 }, high: { byHighMessage: 777, byHighPostView: 888 } }),
      interactionDay({ userLowId: THIRD, userHighId: ME, low: { byLowReaction: 999 }, high: { byHighReaction: 2 } }),
      interactionDay({ userLowId: THIRD, userHighId: STRANGER, low: { byLowMessage: 555 } }),
    ]),
    relationFeatureSetting: table([
      { ownerId: ME, otherId: OTHER, listeningTitleShared: true, locationShared: false, locationHistoryShared: false, proximityShared: true, consentedAt: ROSE, locationWithdrawnAt: WITHDRAWN },
      { ownerId: OTHER, otherId: ME, listeningTitleShared: false, locationShared: true, locationHistoryShared: true, proximityShared: false, consentedAt: OTHER_DROP },
    ]),
  };
}

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', relationTables() as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: ME, registeredUser: { id: ME } };
  });
  await app.register(dataExportRoutes);
  await app.ready();
  return app;
}

const counts = (overrides: Record<string, number>) => ({
  message: 0, reaction: 0, postView: 0, comment: 0, share: 0, storyReply: 0, mention: 0, call: 0, audio: 0, ...overrides,
});

describe('GET /export?types=relations', () => {
  it('sert mes liens avec ce que J’accorde et mes seuls passages, de quelque côté de la paire que je sois', async () => {
    const app = await build();

    const relations = (await app.inject({ method: 'GET', url: '/export?types=relations' })).json().data.relations;

    expect(relations.links).toEqual([
      {
        userId: OTHER, grantedByMe: 'CLOSE', origin: 'request', createdAt: BORN.toISOString(),
        myTransitions: [{ from: 'PUBLIC', to: 'CLOSE', at: ROSE.toISOString() }],
      },
      { userId: THIRD, grantedByMe: 'ACQUAINTANCE', origin: 'auto-acquaintance', createdAt: BORN.toISOString(), myTransitions: [] },
    ]);
  });

  it('sert, par paire et par jour, ce que J’AI fait envers l’autre, jamais ce qu’il a fait envers moi', async () => {
    const app = await build();

    const relations = (await app.inject({ method: 'GET', url: '/export?types=relations' })).json().data.relations;

    expect(relations.interactionDays).toEqual([
      { userId: OTHER, day: DAY.toISOString(), ...counts({ message: 3, call: 1 }) },
      { userId: THIRD, day: DAY.toISOString(), ...counts({ reaction: 2 }) },
    ]);
  });

  it('sert les partages que J’AI consentis, jamais ceux qu’on m’a consentis', async () => {
    const app = await build();

    const relations = (await app.inject({ method: 'GET', url: '/export?types=relations' })).json().data.relations;

    expect(relations.consents).toEqual([
      {
        userId: OTHER, listeningCategoryShared: false, listeningTitleShared: true, locationShared: false, locationHistoryShared: false, proximityShared: true,
        consentedAt: ROSE.toISOString(),
        withdrawnAt: { listeningCategoryShared: null, listeningTitleShared: null, locationShared: WITHDRAWN.toISOString(), locationHistoryShared: null, proximityShared: null },
      },
    ]);
    expect(relations.hasMore).toEqual({ links: false, interactionDays: false, consents: false });
  });

  it('art. 15(4) — rien de ce que l’autre m’accorde, de ses baisses, de ses compteurs ni des liens d’autrui ne sort, même en CSV', async () => {
    const app = await build();

    const data = (await app.inject({ method: 'GET', url: '/export?types=relations&format=csv' })).json().data;
    const served = JSON.stringify(data);

    ['BLOOD', 'ATOM', OTHER_DROP.toISOString(), '777', '888', '999', '555', STRANGER].forEach((leak) => expect(served).not.toContain(leak));
    expect(data.csv['relations.links'].split('\n')[0]).toBe('userId,grantedByMe,origin,createdAt,myTransitions');
    expect(data.csv['relations.interactionDays'].split('\n')[0]).toBe(
      'userId,day,message,reaction,postView,comment,share,storyReply,mention,call,audio',
    );
    expect(data.csv['relations.consents']).toContain(OTHER);
  });

  it('borne chaque liste par la page et dit ce qui reste', async () => {
    const app = await build();

    const relations = (await app.inject({ method: 'GET', url: '/export?types=relations&limit=1' })).json().data.relations;

    expect(relations.links.map((link: { userId: string }) => link.userId)).toEqual([OTHER]);
    expect(relations.hasMore).toEqual({ links: true, interactionDays: true, consents: false });
  });
});
