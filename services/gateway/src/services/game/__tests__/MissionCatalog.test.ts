/**
 * LES MISSIONS DU JOUR NE PROPOSENT QUE DES GESTES QUE LE SERVEUR COMPTE (#9634).
 *
 *  - chaque gabarit gardé avance par son geste NOMINAL, de bout en bout : `EngagementService.recordActivity`
 *    crédite, le crochet du jeu relaie, `MissionService` fait avancer et paie. Le geste est écrit ICI, à côté
 *    du gabarit, jamais dérivé de son signal : un gabarit dont le signal cesserait de suivre le geste tombe ;
 *  - une mission du jour déjà tirée sur un gabarit RETIRÉ est remplacée au prochain chargement — même
 *    emplacement, même difficulté — sans toucher au coffre, au changement du jour ni aux missions achevées.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { EngagementOperationKey } from '@meeshy/shared/types/engagement';
import { DEFAULT_ENGAGEMENT_SCALE } from '@meeshy/shared/types/engagement-scale';
import { MISSION_TEMPLATES, isRetiredMissionTemplate, missionObjective } from '@meeshy/shared/utils/game/missions';
import { PERSONAL_MISSION_SLOT } from '@meeshy/shared/utils/game/personal-mission';
import { EngagementService } from '../../engagement/EngagementService';
import { MissionService, READ_ONLY_CREDIT } from '../MissionService';
import { PersonalMissionService } from '../PersonalMissionService';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }),
}));
jest.mock('../../notifications/NotificationService', () => ({ NotificationService: jest.fn() }));

/** Le geste que l'utilisateur fait pour CHAQUE gabarit gardé, tel que son libellé le lui demande. */
const NOMINAL_GESTURE: Readonly<Record<string, EngagementOperationKey>> = {
  'react-messages': 'tool.reaction',
  'send-voice': 'content.audio_message',
  'send-texts': 'content.text_message',
  'send-attachments': 'tool.attachment',
  'comment-text': 'comment.text',
  'publish-story': 'content.story',
  'publish-post': 'content.post',
  'publish-posts': 'content.post',
  'long-chat': 'content.text_message',
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const engagement = (db: FakeGameDb) =>
  new EngagementService(db.prisma, { scale: { current: async () => DEFAULT_ENGAGEMENT_SCALE }, emitIO: () => undefined });

describe('chaque gabarit gardé avance par son geste nominal (#9634)', () => {
  it('nomme un geste pour chaque gabarit du catalogue, et aucun gabarit retiré', () => {
    expect(MISSION_TEMPLATES.map((t) => t.key).sort()).toEqual(Object.keys(NOMINAL_GESTURE).sort());
  });

  it.each(MISSION_TEMPLATES.map((t) => [t.key, t] as const))('%s : le geste crédité fait avancer la mission, et la paie à l’objectif', async (key, template) => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10 * 10 * 10, levelRecord: 10 });
    db.dailyMission.rows.push({
      id: 'm1', userId: USER, dayKey: todayKey(), slot: 0, templateKey: template.key, difficulty: template.difficulty,
      signal: template.signal, prism: template.prism, target: 2, progress: 0, reward: 60, glory: 0, seen: [],
      completedAt: null, paidPoints: null, rerolledAt: null,
    });

    await engagement(db).recordActivity(USER, NOMINAL_GESTURE[key]!);
    expect(db.dailyMission.rows[0]).toMatchObject({ progress: 1, completedAt: null });

    await engagement(db).recordActivity(USER, NOMINAL_GESTURE[key]!);
    expect(db.dailyMission.rows[0]?.completedAt).toBeInstanceOf(Date);
  });
});

const NOW = new Date('2026-10-06T06:00:00Z');
const DAY = '2026-10-06';
const LEVEL_20 = 10 * 20 * 20;
const STARTS = new Date('2026-10-06T16:00:00Z');
const ENDS = new Date('2026-10-06T18:00:00Z');
const DONE = new Date('2026-10-06T05:30:00Z');

const row = (db: FakeGameDb, fields: Record<string, unknown>) => {
  const inserted = {
    id: `mission-${String(fields.slot)}`, userId: USER, dayKey: DAY, prism: false, target: 3, progress: 0, reward: 60, glory: 0,
    seen: [], completedAt: null, paidPoints: null, rerolledAt: null, createdAt: new Date('2026-10-06T05:00:00Z'), ...fields,
  };
  db.dailyMission.rows.push(inserted);
  return inserted;
};

const setup = () => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: LEVEL_20, levelRecord: 20 });
  const missions = new MissionService(db.prisma, { creditPoints: READ_ONLY_CREDIT });
  return { db, missions, personal: new PersonalMissionService(db.prisma, { missions }) };
};

describe('une mission du jour tirée sur un gabarit retiré est remplacée au prochain chargement (#9634)', () => {
  const retiredDay = (db: FakeGameDb) => {
    const done = row(db, { slot: 0, templateKey: 'use-stickers', difficulty: 'easy', signal: 'axis:tool.sticker', target: 2, progress: 2, completedAt: DONE, paidPoints: 30 });
    const medium = row(db, { slot: 1, templateKey: 'share-link', difficulty: 'medium', signal: 'axis:social.share', target: 1, rerolledAt: DONE });
    const gold = row(db, {
      slot: 2, templateKey: 'gold-reply-conversations', difficulty: 'gold', signal: 'reply-distinct-conversations',
      target: 10, progress: 4, seen: ['c1', 'c2', 'c3', 'c4'], reward: 300, glory: 40,
    });
    db.gameDay.rows.push({ id: 'gd', userId: USER, dayKey: DAY, rerollCount: 1, chestClaimedAt: null, chestPoints: null, chestFragment: null, chestFreeze: null });
    return { done, medium, gold };
  };

  it('remplace chaque mission en cours par un gabarit tracé de même emplacement et même difficulté', async () => {
    const { db, missions } = setup();
    retiredDay(db);

    const today = await missions.ensureToday(USER, NOW);

    expect(today.rows.map((r) => [r.slot, r.difficulty])).toEqual([[0, 'easy'], [1, 'medium'], [2, 'gold']]);
    const [, medium, gold] = today.rows;
    for (const replaced of [medium!, gold!]) {
      expect(isRetiredMissionTemplate(replaced.templateKey)).toBe(false);
      expect(replaced.signal.startsWith('axis:')).toBe(true);
      expect(replaced).toMatchObject({ progress: 0, seen: [], completedAt: null, prism: false });
      const template = MISSION_TEMPLATES.find((t) => t.key === replaced.templateKey)!;
      expect(replaced.target).toBe(missionObjective({ baseTarget: template.baseTarget, level: 20 }));
    }
    expect(gold!.glory).toBe(40);
    expect(new Set(today.rows.slice(1).map((r) => r.signal)).size).toBe(2);
  });

  it('ne touche ni la mission achevée, ni le changement du jour, ni le coffre, et n’écrit aucune ligne de plus', async () => {
    const { db, missions } = setup();
    const { done } = retiredDay(db);
    const before = { ...done };

    await missions.ensureToday(USER, NOW);

    expect(db.dailyMission.rows.find((r) => r.slot === 0)).toEqual(before);
    expect(db.dailyMission.rows.find((r) => r.slot === 1)?.rerolledAt).toEqual(DONE);
    expect(db.dailyMission.rows).toHaveLength(3);
    expect(db.dailyMission.rows.map((r) => r.id)).toEqual(['mission-0', 'mission-1', 'mission-2']);
    expect(db.gameDay.rows).toEqual([
      { id: 'gd', userId: USER, dayKey: DAY, rerollCount: 1, chestClaimedAt: null, chestPoints: null, chestFragment: null, chestFreeze: null },
    ]);
  });

  it('remplace une fois : un second chargement rend les mêmes missions', async () => {
    const { db, missions } = setup();
    retiredDay(db);

    const first = (await missions.ensureToday(USER, NOW)).rows.map((r) => r.templateKey);
    const second = (await missions.ensureToday(USER, NOW)).rows.map((r) => r.templateKey);

    expect(second).toEqual(first);
  });

  it('une journée sans gabarit retiré n’est pas réécrite', async () => {
    const { db, missions } = setup();
    row(db, { slot: 0, templateKey: 'send-texts', difficulty: 'easy', signal: 'axis:content.text_message' });
    row(db, { slot: 1, templateKey: 'publish-story', difficulty: 'medium', signal: 'axis:content.story' });
    row(db, { slot: 2, templateKey: 'publish-posts', difficulty: 'hard', signal: 'axis:content.post' });
    const writes = jest.spyOn(db.prisma.dailyMission, 'updateMany');

    await missions.ensureToday(USER, NOW);

    expect(writes).not.toHaveBeenCalled();
  });

  it('la mission personnelle retirée est remplacée à son emplacement, sa plage et son annonce intactes', async () => {
    const { db, personal } = setup();
    row(db, { slot: 0, templateKey: 'send-texts', difficulty: 'easy', signal: 'axis:content.text_message' });
    row(db, { slot: 1, templateKey: 'publish-story', difficulty: 'medium', signal: 'axis:content.story' });
    row(db, { slot: 2, templateKey: 'publish-posts', difficulty: 'hard', signal: 'axis:content.post' });
    row(db, { slot: PERSONAL_MISSION_SLOT, templateKey: 'reply-conversations', difficulty: 'medium', signal: 'reply-distinct-conversations', startsAt: STARTS, endsAt: ENDS, notifiedAt: DONE });

    const replaced = await personal.ensure(USER, NOW);

    expect(replaced).toMatchObject({ slot: PERSONAL_MISSION_SLOT, difficulty: 'medium', startsAt: STARTS, endsAt: ENDS, notifiedAt: DONE, glory: 0 });
    expect(isRetiredMissionTemplate(replaced!.templateKey)).toBe(false);
    expect(replaced!.signal).not.toBe('axis:content.story');
    expect(db.dailyMission.rows).toHaveLength(4);
  });

  it('la mission personnelle achevée sur un gabarit retiré reste la sienne', async () => {
    const { db, personal } = setup();
    row(db, { slot: 0, templateKey: 'send-texts', difficulty: 'easy', signal: 'axis:content.text_message' });
    row(db, { slot: 1, templateKey: 'publish-story', difficulty: 'medium', signal: 'axis:content.story' });
    row(db, { slot: 2, templateKey: 'publish-posts', difficulty: 'hard', signal: 'axis:content.post' });
    row(db, { slot: PERSONAL_MISSION_SLOT, templateKey: 'voice-comments', difficulty: 'hard', signal: 'axis:comment.audio', startsAt: STARTS, endsAt: ENDS, completedAt: DONE });

    expect((await personal.ensure(USER, NOW))?.templateKey).toBe('voice-comments');
  });
});
