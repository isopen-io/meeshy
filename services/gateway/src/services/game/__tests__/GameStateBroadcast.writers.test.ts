/**
 * CHAQUE ÉCRIVAIN DU JEU ANNONCE SON ÉCRITURE (#10900) — frappe, gain, reprise, prestige, dépense de Meesh. Un refus
 * (rien d'écrit) n'annonce rien. Le témoin passe par le VRAI `GameStateBroadcast`, branché sur un faux serveur : il
 * observe le COUPLE (événement, room) qui part, pas un appel interne.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { DEFAULT_ENGAGEMENT_SCALE } from '@meeshy/shared/types/engagement-scale';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { GameStateBroadcast, setGameStateBroadcast } from '../GameStateBroadcast';
import { MeeshService } from '../../meesh/MeeshService';
import { MeeshSpend } from '../MeeshSpend';
import { PrestigeService } from '../PrestigeService';
import { EngagementService } from '../../engagement/EngagementService';
import { EngagementReceipts } from '../../engagement/EngagementReceipts';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }),
}));
jest.mock('../../notifications/NotificationService', () => ({ NotificationService: jest.fn() }));

const flush = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

/** Le vrai diffuseur, sans fenêtre de coalescence, sur un faux serveur qui garde (room, événement, raison). */
const listen = () => {
  const emitted: Array<{ room: string; event: string; reason: string }> = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: { reason: string }) => {
        emitted.push({ room, event, reason: payload.reason });
        return true;
      },
    }),
  };
  setGameStateBroadcast(
    new GameStateBroadcast({ io: () => io as never, build: async () => null, schedule: (fn) => (setImmediate(fn), () => undefined) }),
  );
  return emitted;
};

const announced = (reason: string) => ({ room: ROOMS.user(USER), event: SERVER_EVENTS.GAME_UPDATED, reason });

afterEach(() => setGameStateBroadcast(undefined));

describe('les écrivains du jeu annoncent game:updated (#10900)', () => {
  it('une FRAPPE réussie annonce « mint » ; une frappe refusée n\'annonce rien', async () => {
    const emitted = listen();
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 5000, sparksSincePrestige: 5000 });

    await new MeeshService(db.prisma).mint(USER, 'frappe-annoncee', { maxPrice: 1 });
    await flush();
    expect(emitted).toEqual([]);

    await new MeeshService(db.prisma).mint(USER, 'frappe-annoncee-2');
    await flush();
    expect(emitted).toEqual([announced('mint')]);
  });

  it('une DÉPENSE de Meesh annonce « spend » ; un solde insuffisant n\'annonce rien', async () => {
    const emitted = listen();
    const db = fakeGameDb();
    seedUser(db);
    const spend = new MeeshSpend(db.prisma);

    await spend.spend({ userId: USER, requestId: 'depense-sans-solde', price: 3, kind: 'flame-relight' });
    await flush();
    expect(emitted).toEqual([]);

    db.meeshLedger.rows.push({ id: 'g1', userId: USER, delta: 5, reason: 'grant', requestId: 'octroi-0001' });
    await spend.spend({ userId: USER, requestId: 'depense-annoncee', price: 3, kind: 'flame-relight' });
    await flush();
    expect(emitted).toEqual([announced('spend')]);
  });

  it('un PRESTIGE passé annonce « prestige »', async () => {
    const emitted = listen();
    const db = fakeGameDb();
    const level100 = 100 * 100 * 100 + 3000;
    seedUser(db, { engagementScore: level100, sparksSincePrestige: level100, sparksEarnedLifetime: level100, levelRecord: 100, levelMaxLifetime: 100 });

    await new PrestigeService(db.prisma).pass({ userId: USER, requestId: 'prestige-annonce' });
    await flush();

    expect(emitted).toEqual([announced('prestige')]);
  });

  it('un GAIN d\'étincelles annonce « credit »', async () => {
    const emitted = listen();
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 200, sparksSincePrestige: 200, sparksEarnedLifetime: 200, levelRecord: 1 });
    const service = new EngagementService(db.prisma, { scale: { current: async () => DEFAULT_ENGAGEMENT_SCALE }, emitIO: () => undefined });

    await service.recordActivity(USER, 'content.text_message');
    await flush();

    expect(emitted).toContainEqual(announced('credit'));
  });

  it('une REPRISE d\'étincelles (contenu supprimé) annonce « reclaim »', async () => {
    const emitted = listen();
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 500, sparksSincePrestige: 500, sparksEarnedLifetime: 500 });
    db.engagementCounter.rows.push({ id: 'c1', userId: USER, axisKey: 'content.post', count: 1, points: 40 });
    db.engagementQuota.rows.push({ id: 'q1', userId: USER, operationKey: 'content.post', bucket: 'receipt:post-1|content.post', points: 40, createdAt: new Date() });
    const receipts = new EngagementReceipts(db.prisma as never, {} as never, { takeBack: async () => undefined } as never);

    await receipts.reclaim(USER, 'post-1');
    await flush();

    expect(emitted).toEqual([announced('reclaim')]);
  });
});
