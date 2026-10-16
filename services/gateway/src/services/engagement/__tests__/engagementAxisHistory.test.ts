/**
 * LES BADGES D'AXE DISENT LE TOTAL RÉEL ET NE SONT JAMAIS NOTIFIÉS DEUX FOIS (#10845).
 *
 * `EngagementCounter.count` est parti de 0 le 2026-09-07, sans rattrapage : un compte aux milliers de messages recevait
 * « Palier 3 atteint — Messages texte : 50 ». La garde de `credit()` regarde l'HISTORIQUE avant d'annoncer un palier :
 * quand il dépasse le compteur, le compteur est relevé à l'historique et les paliers passés sont gravés EN SILENCE.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { DEFAULT_ENGAGEMENT_SCALE } from '@meeshy/shared/types/engagement-scale';
import { EngagementService } from '../EngagementService';
import { historyCountFor, AXES_WITH_HISTORY } from '../engagementAxisHistory';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from '../../game/__tests__/fakeGameDb';

const createNotification = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => ({ createNotification: (...args: unknown[]) => createNotification(...args) }),
}));
jest.mock('../../notifications/NotificationService', () => ({ NotificationService: jest.fn() }));

const dayKey = () => new Date().toISOString().slice(0, 10);

const service = (db: FakeGameDb) =>
  new EngagementService(db.prisma, { scale: { current: async () => DEFAULT_ENGAGEMENT_SCALE }, emitIO: () => undefined });

/** `n` messages texte de l'utilisateur, plus du bruit qui ne doit PAS compter. */
const seedMessages = (db: FakeGameDb, n: number) => {
  db.participant.rows.push({ id: 'p1', userId: USER, conversationId: 'c1' }, { id: 'p2', userId: USER, conversationId: 'c2' });
  for (let i = 0; i < n; i += 1) {
    db.message.rows.push({ id: `m${i}`, senderId: i % 2 === 0 ? 'p1' : 'p2', messageSource: 'user', messageType: 'text', deletedAt: null });
  }
  db.message.rows.push(
    { id: 'sys', senderId: 'p1', messageSource: 'system', messageType: 'text', deletedAt: null },
    { id: 'del', senderId: 'p1', messageSource: 'user', messageType: 'text', deletedAt: new Date('2026-09-01') },
    { id: 'img', senderId: 'p1', messageSource: 'user', messageType: 'image', deletedAt: null },
    { id: 'other', senderId: 'p9', messageSource: 'user', messageType: 'text', deletedAt: null },
  );
};

const missionsAwaitOtherGestures = (db: FakeGameDb) =>
  db.dailyMission.rows.push(
    ...[0, 1, 2].map((slot) => ({
      id: `m-other-${slot}`, userId: USER, dayKey: dayKey(), slot, templateKey: 'publish-posts', difficulty: 'easy',
      signal: 'axis:content.post', prism: false, target: 2, progress: 0, reward: 60, glory: 0, seen: [],
      completedAt: null, paidPoints: null, rerolledAt: null,
    })),
  );

const badges = (db: FakeGameDb) => db.engagementMilestone.rows.filter((r) => r.milestoneType === 'badge').map((r) => r.milestoneKey as string).sort();
const counter = (db: FakeGameDb) => db.engagementCounter.rows.find((r) => r.axisKey === 'content.text_message');
const badgeNotifications = () => createNotification.mock.calls.filter(([n]) => (n as { type: string }).type === 'badge_earned');

beforeEach(() => createNotification.mockClear());

describe('historyCountFor — le total réel d\'un axe', () => {
  it('texte : les messages de l\'utilisateur (participants), source user, non supprimés, de type text', async () => {
    const db = fakeGameDb();
    seedMessages(db, 120);

    expect(await historyCountFor(db.prisma, USER, 'content.text_message')).toBe(120);
  });

  it('un axe sans source fiable rend null — jamais zéro, qui dirait « rien à rattraper »', async () => {
    const db = fakeGameDb();
    expect(await historyCountFor(db.prisma, USER, 'tool.sticker')).toBeNull();
    expect(AXES_WITH_HISTORY).toEqual(['content.text_message']);
  });

  it('un compte sans participant a un historique de zéro', async () => {
    const db = fakeGameDb();
    expect(await historyCountFor(db.prisma, USER, 'content.text_message')).toBe(0);
  });
});

describe('credit() — le premier crédit d\'un axe qui découvre un historique l\'initialise sans rien annoncer', () => {
  it('3 000 messages déjà envoyés : le compteur prend le total, les paliers passés sont gravés, AUCUNE notification de badge', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0 });
    seedMessages(db, 3000);
    missionsAwaitOtherGestures(db);

    await service(db).recordActivity(USER, 'content.text_message');

    expect(counter(db)?.count).toBe(3000);
    expect(badges(db)).toEqual(
      ['content.text_message:1', 'content.text_message:10', 'content.text_message:100', 'content.text_message:1000', 'content.text_message:50', 'content.text_message:500'].sort(),
    );
    expect(badgeNotifications()).toHaveLength(0);
  });

  it('les POINTS du geste sont quand même crédités : seule l\'annonce se tait', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0 });
    seedMessages(db, 3000);
    missionsAwaitOtherGestures(db);

    await service(db).recordActivity(USER, 'content.text_message');

    expect(counter(db)?.points).toBeGreaterThan(0);
    expect(db.user.rows[0]?.engagementScore).toBe(counter(db)?.points);
  });

  it('un compteur en retard (49) devant un historique de 3 000 : franchir le palier 50 ne l\'annonce pas', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0 });
    seedMessages(db, 3000);
    missionsAwaitOtherGestures(db);
    db.engagementCounter.rows.push({ id: 'c', userId: USER, axisKey: 'content.text_message', count: 49, points: 100 });

    await service(db).recordActivity(USER, 'content.text_message');

    expect(counter(db)?.count).toBe(3000);
    expect(badgeNotifications()).toHaveLength(0);
    expect(badges(db)).toContain('content.text_message:50');
  });

  it('un compteur JUSTE (historique == compteur) annonce son palier, une seule fois', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0 });
    seedMessages(db, 50);
    missionsAwaitOtherGestures(db);
    db.engagementCounter.rows.push({ id: 'c', userId: USER, axisKey: 'content.text_message', count: 49, points: 100 });

    await service(db).recordActivity(USER, 'content.text_message');

    expect(counter(db)?.count).toBe(50);
    expect(badgeNotifications()).toHaveLength(1);
    expect(badges(db)).toContain('content.text_message:50');
  });

  it('jamais deux fois : un palier déjà gravé ne se renotifie pas', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0 });
    seedMessages(db, 50);
    missionsAwaitOtherGestures(db);
    db.engagementCounter.rows.push({ id: 'c', userId: USER, axisKey: 'content.text_message', count: 49, points: 100 });
    db.engagementMilestone.rows.push({ id: 'b', userId: USER, milestoneType: 'badge', milestoneKey: 'content.text_message:50', reachedAt: new Date('2026-09-10') });

    await service(db).recordActivity(USER, 'content.text_message');

    expect(badgeNotifications()).toHaveLength(0);
  });

  it('un axe SANS source d\'historique annonce normalement', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0 });
    missionsAwaitOtherGestures(db);

    await service(db).recordActivity(USER, 'tool.sticker');

    expect(badgeNotifications()).toHaveLength(1);
  });

  it('un geste qui ne franchit aucun palier ne lit pas l\'historique', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0 });
    seedMessages(db, 3000);
    missionsAwaitOtherGestures(db);
    db.engagementCounter.rows.push({ id: 'c', userId: USER, axisKey: 'content.text_message', count: 20, points: 100 });
    const count = jest.spyOn(db.message, 'count');

    await service(db).recordActivity(USER, 'content.text_message');

    expect(count).not.toHaveBeenCalled();
    expect(counter(db)?.count).toBe(21);
  });
});
