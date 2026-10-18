/**
 * L'ORDRE DES ÉTATS DU JEU RESTE JUSTE AVEC PLUSIEURS PASSERELLES (#10912).
 *
 * `gameRevision` est une horloge logique hybride PAR COMPTE, gravée avec l'état : chaque écriture du jeu y pose
 * `max(maintenant, révision lue + 1)`. Deux passerelles aux horloges décalées écrivent l'une après l'autre : la
 * révision servie après la seconde est STRICTEMENT plus grande, alors que l'horloge de la seconde est en retard. Une
 * lecture sert la révision GRAVÉE, jamais l'heure de la réponse ; un rejeu ne la fait pas monter.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { DEFAULT_ENGAGEMENT_SCALE } from '@meeshy/shared/types/engagement-scale';
import { gravedGameRevision, nextGameRevision, servedGameRevision, stampGameRevision } from '../GameRevision';
import { GameStateBroadcast } from '../GameStateBroadcast';
import { MeeshService } from '../../meesh/MeeshService';
import { MeeshSpend } from '../MeeshSpend';
import { PrestigeService } from '../PrestigeService';
import { GloryService } from '../GloryService';
import { MissionService } from '../MissionService';
import { EngagementService } from '../../engagement/EngagementService';
import { writeEngagementScore } from '../../engagement/EngagementScoreWrite';
import { takeBackPoints } from '../../engagement/EngagementReceipts';
import { meEngagementRoutes } from '../../../routes/me/engagement';
import { meMeeshRoutes } from '../../../routes/me/meesh';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }),
}));
jest.mock('../../notifications/NotificationService', () => ({ NotificationService: jest.fn() }));

/** L'instant de référence ; la passerelle A avance de cinq secondes, la B retarde de cinq. */
const T = 1_760_000_000_000;
const AHEAD = T + 5_000;
const BEHIND = T - 5_000;

/** Le `Date.now` d'une passerelle, le temps d'une écriture. */
const onGateway = async <R>(clock: number, work: () => Promise<R>): Promise<R> => {
  const spy = jest.spyOn(Date, 'now').mockReturnValue(clock);
  try {
    return await work();
  } finally {
    spy.mockRestore();
  }
};

const graved = (db: FakeGameDb) => gravedGameRevision(db.prisma, USER);

afterEach(() => jest.restoreAllMocks());

describe('la loi de la révision (#10912)', () => {
  it('la révision suivante est le plus grand de l\'instant et de la révision lue + 1', () => {
    expect(nextGameRevision(null, T)).toBe(T);
    expect(nextGameRevision(T - 1, T)).toBe(T);
    expect(nextGameRevision(AHEAD, BEHIND)).toBe(AHEAD + 1);
    expect(nextGameRevision(T, T)).toBe(T + 1);
  });

  it('une lecture sert la révision GRAVÉE ; sans révision gravée, l\'instant comme avant', () => {
    expect(servedGameRevision(AHEAD, () => BEHIND)).toBe(AHEAD);
    expect(servedGameRevision(null, () => T)).toBe(T);
  });

  it('deux passerelles décalées gravent l\'une après l\'autre : la seconde, en retard, grave plus haut', async () => {
    const db = fakeGameDb();
    seedUser(db, {});

    const first = await stampGameRevision(db.prisma, USER, AHEAD);
    const second = await stampGameRevision(db.prisma, USER, BEHIND);

    expect(first).toBe(AHEAD);
    expect(second).toBe(AHEAD + 1);
    expect(await graved(db)).toBe(AHEAD + 1);
  });

  it('une révision gravée en `long` (BigInt) ou rendue en JSON étendu se relit en nombre', async () => {
    const db = fakeGameDb();
    seedUser(db, { gameRevision: BigInt(AHEAD) });
    expect(await graved(db)).toBe(AHEAD);
    expect(await stampGameRevision(db.prisma, USER, BEHIND)).toBe(AHEAD + 1);
  });
});

describe('chaque écrivain du jeu grave la révision avec l\'état (#10912)', () => {
  it('une FRAPPE sur la passerelle en avance, puis un CRÉDIT sur la passerelle en retard : la révision monte strictement', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 5000, sparksSincePrestige: 5000 });

    const minted = await onGateway(AHEAD, () => new MeeshService(db.prisma).mint(USER, 'frappe-a'));
    expect(minted.status).toBe('minted');
    const afterMint = await graved(db);
    expect(afterMint).not.toBeNull();
    expect(afterMint!).toBeGreaterThanOrEqual(AHEAD);
    // La réponse de frappe sert la révision que SA transaction a gravée, jamais l'heure de la réponse.
    expect(minted.status === 'minted' ? minted.gameRevision : null).toBeGreaterThanOrEqual(AHEAD);

    await onGateway(BEHIND, () => writeEngagementScore(db.prisma, USER, 10));

    expect(await graved(db)).toBeGreaterThan(afterMint!);
  });

  it('un rejeu de frappe ne fait pas monter la révision et sert celle qui est gravée', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 5000, sparksSincePrestige: 5000 });
    await onGateway(AHEAD, () => new MeeshService(db.prisma).mint(USER, 'frappe-rejouee'));
    const engraved = await graved(db);

    const replay = await onGateway(T + 60_000, () => new MeeshService(db.prisma).mint(USER, 'frappe-rejouee'));

    expect(replay.status).toBe('already-minted');
    expect(await graved(db)).toBe(engraved);
    expect(replay.status === 'already-minted' ? replay.gameRevision : null).toBe(engraved);
  });

  it('un crédit de points de jeu (mission, coffre) grave la révision dans sa transaction', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 100, gameRevision: BigInt(AHEAD) });
    const service = new EngagementService(db.prisma, { scale: { current: async () => DEFAULT_ENGAGEMENT_SCALE }, emitIO: () => undefined });

    await onGateway(BEHIND, () => service.creditGamePoints(USER, 50, 'content.text_message'));

    expect(await graved(db)).toBeGreaterThan(AHEAD);
    expect(db.user.rows[0]?.engagementScore).toBe(150);
  });

  it('une REPRISE grave la révision dans sa commande', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 100, gameRevision: BigInt(AHEAD) });
    db.engagementCounter.rows.push({ id: 'c1', userId: USER, axisKey: 'content.post', count: 1, points: 40 });

    const taken = await onGateway(BEHIND, () => takeBackPoints(db.prisma as never, USER, 'content.post', 30));

    expect(taken).toBeGreaterThan(0);
    expect(await graved(db)).toBe(AHEAD + 1);
  });

  it('une DÉPENSE de Meesh grave la révision dans sa transaction', async () => {
    const db = fakeGameDb();
    seedUser(db, { gameRevision: BigInt(AHEAD) });
    db.meeshLedger.rows.push({ id: 'l1', userId: USER, delta: 5, reason: 'grant', requestId: 'octroi-0001' });

    const outcome = await onGateway(BEHIND, () => new MeeshSpend(db.prisma).spend({ userId: USER, requestId: 'depense-1', price: 1, kind: 'flame-freeze' }));

    expect(outcome.status).toBe('spent');
    expect(await graved(db)).toBe(AHEAD + 1);
  });

  it('un PRESTIGE grave la révision', async () => {
    const db = fakeGameDb();
    const level100 = 100 * 100 * 100 + 3000;
    seedUser(db, { engagementScore: level100, sparksSincePrestige: level100, sparksEarnedLifetime: level100, levelRecord: 100, levelMaxLifetime: 100, gameRevision: BigInt(AHEAD) });

    await onGateway(BEHIND, () => new PrestigeService(db.prisma).pass({ userId: USER, requestId: 'prestige-1' }));

    expect(await graved(db)).toBeGreaterThan(AHEAD);
  });
});

describe('les écrivains conditionnels gravent la révision juste après leur écriture (#10912)', () => {
  it('une ligne de GLOIRE gravée fait monter la révision ; un rejeu de la même clé, non', async () => {
    const db = fakeGameDb();
    seedUser(db, { gameRevision: BigInt(AHEAD) });
    const glory = new GloryService(db.prisma, { seats: { claimIfEligible: async () => null } as never, onLevelReached: async () => undefined });
    const entry = { userId: USER, delta: 5, reason: 'chest' as const, requestId: 'chest:2026-10-05' };

    await onGateway(BEHIND, () => glory.credit(entry));
    const afterCredit = await graved(db);
    await onGateway(BEHIND, () => glory.credit(entry));

    expect(afterCredit).toBe(AHEAD + 1);
    expect(await graved(db)).toBe(afterCredit);
  });

  it('une MISSION qui avance fait monter la révision', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 100 * 20 * 20, levelRecord: 20, gameRevision: BigInt(AHEAD) });
    db.dailyMission.rows.push({
      id: 'mission-0', userId: USER, dayKey: '2026-10-05', slot: 0, templateKey: 'send-texts', difficulty: 'easy',
      signal: 'axis:content.text_message', prism: false, target: 3, progress: 0, reward: 40, glory: 0, seen: [],
      completedAt: null, paidPoints: null, rerolledAt: null,
    });
    const missions = new MissionService(db.prisma, { creditPoints: async () => undefined });

    await onGateway(BEHIND, () => missions.onSignal(USER, 'axis:content.text_message', { now: new Date('2026-10-05T10:00:00Z') }));

    expect(db.dailyMission.rows[0]?.progress).toBe(1);
    expect(await graved(db)).toBe(AHEAD + 1);
  });

  it('un GEL offert par le coffre fait monter la révision', async () => {
    const db = fakeGameDb();
    seedUser(db, { flameFreezes: 0, gameRevision: BigInt(AHEAD) });

    await onGateway(BEHIND, () => new MissionService(db.prisma, { creditPoints: async () => undefined }).grantFreeze(USER));

    expect(await graved(db)).toBe(AHEAD + 1);
  });
});

describe('les lectures servent la révision gravée, jamais l\'heure de la réponse (#10912)', () => {
  const engagementApp = async (db: FakeGameDb): Promise<FastifyInstance> => {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    // Les bornes du registre de frappe (`_min` / `_max`), que le double ne calcule pas : la route les sert, sans plus.
    const ledger = db.prisma.meeshLedger;
    const aggregate = (args: { _sum?: unknown }) =>
      args._sum ? ledger.aggregate(args as never) : Promise.resolve({ _min: { createdAt: null }, _max: { createdAt: null } });
    app.decorate('prisma', { ...db.prisma, meeshLedger: Object.assign(Object.create(ledger), { aggregate }) });
    app.decorate('authenticate', async (req: FastifyRequest) => {
      (req as unknown as { auth: unknown }).auth = { userId: USER, isAuthenticated: true };
    });
    await app.register(meEngagementRoutes, { prefix: '/api/v1/me', gameBlock: async () => null });
    await app.register(meMeeshRoutes, { prefix: '/api/v1/me' });
    await app.ready();
    return app;
  };

  it('GET /me/engagement sert la révision gravée, même lue sur une passerelle à l\'horloge en avance', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 100, gameRevision: BigInt(T) });
    const app = await engagementApp(db);

    const response = await onGateway(T + 3_600_000, () => app.inject({ method: 'GET', url: '/api/v1/me/engagement' }));

    expect(response.json().data.gameRevision).toBe(T);
    await app.close();
  });

  it('GET /me/engagement d\'un compte sans révision gravée sert l\'instant, comme avant', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 100 });
    const app = await engagementApp(db);

    const response = await onGateway(T, () => app.inject({ method: 'GET', url: '/api/v1/me/engagement' }));

    expect(response.json().data.gameRevision).toBe(T);
    await app.close();
  });

  it('POST /me/meesh/mint sert la révision gravée par la frappe, puis la même au rejeu', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 5000, sparksSincePrestige: 5000, gameRevision: BigInt(AHEAD) });
    const app = await engagementApp(db);
    const mint = () => app.inject({ method: 'POST', url: '/api/v1/me/meesh/mint', payload: { requestId: 'frappe-route' } });

    const first = await onGateway(BEHIND, mint);
    const replay = await onGateway(T + 3_600_000, mint);

    expect(first.json().data.gameRevision).toBe(await graved(db));
    expect(first.json().data.gameRevision).toBeGreaterThan(AHEAD);
    expect(replay.json().data.gameRevision).toBe(first.json().data.gameRevision);
    await app.close();
  });

  it('game:updated porte la révision gravée lue avant le bloc, jamais l\'instant de l\'émission', async () => {
    const db = fakeGameDb();
    seedUser(db, { gameRevision: BigInt(T) });
    const emitted: Array<{ gameRevision: number }> = [];
    const io = { to: () => ({ emit: (_event: string, payload: { gameRevision: number }) => (emitted.push(payload), true) }) };
    const broadcast = new GameStateBroadcast({
      io: () => io as never,
      build: async () => null,
      revision: (userId) => gravedGameRevision(db.prisma, userId),
      now: () => T + 3_600_000,
    });

    broadcast.announce(USER, 'mint');
    for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));

    expect(emitted.map((payload) => payload.gameRevision)).toEqual([T]);
  });
});
