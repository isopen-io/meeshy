/**
 * CHAQUE DÉFI DU JOUR SE FAIT, ET PAIE TOUT CE QU'IL ANNONCE (#9634, #9635).
 *
 * Pour chaque gabarit du catalogue, de bout en bout : le geste NOMINAL passe par le point unique où la
 * passerelle l'établit (`EngagementService.recordActivity` pour un geste crédité, `recordMessageSignals` pour
 * un message, `recordCommentFacts` pour un commentaire, `recordGameSignal` pour un fait posé au geste), le
 * crochet du jeu relaie, `MissionService` fait avancer, et l'achèvement paie ce que `missionArtifacts` annonce :
 * les points, la Gloire, les étoiles de saison, et la place de la mission dans le coffre du jour.
 *
 * Le geste est écrit ICI, à côté du gabarit, jamais dérivé de son signal : un gabarit dont le signal cesserait
 * de suivre le geste tombe.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { DEFAULT_ENGAGEMENT_SCALE } from '@meeshy/shared/types/engagement-scale';
import {
  MISSION_TEMPLATES,
  drawnMissionOf,
  missionArtifacts,
  missionObjective,
  missionTemplatesFor,
  type MissionTemplate,
} from '@meeshy/shared/utils/game/missions';
import { PERSONAL_MISSION_SLOT } from '@meeshy/shared/utils/game/personal-mission';
import { EngagementService } from '../../engagement/EngagementService';
import { recordCommentFacts } from '../commentGameFacts';
import { MissionService, READ_ONLY_CREDIT } from '../MissionService';
import { PersonalMissionService } from '../PersonalMissionService';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }),
}));
jest.mock('../../notifications/NotificationService', () => ({ NotificationService: jest.fn() }));
jest.mock('../../preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: async (_prisma: unknown, ids: string[]) => new Map(ids.map((id) => [id, {}])),
}));

/** Un jour de la saison 1, dans le fuseau UTC des comptes de la fausse base. */
const NOW = new Date('2026-10-20T09:00:00Z');
const DAY = '2026-10-20';
const CONV = '68b000000000000000000001';

type Ctx = { readonly db: FakeGameDb; readonly engagement: EngagementService };

const message = (ctx: Ctx, over: Record<string, unknown> = {}) =>
  ctx.engagement.recordMessageSignals({
    senderUserId: USER,
    conversationId: CONV,
    messageId: 'msg-2',
    replyToId: null,
    quotedAuthorUserId: null,
    originalLanguage: 'fr',
    content: 'Hello my friend, how are you today?',
    now: NOW,
    ...over,
  });

const comment = (ctx: Ctx) =>
  recordCommentFacts({ prisma: ctx.db.prisma, engagement: ctx.engagement, commenterId: USER, postId: 'post-1', post: { authorId: OTHER, visibility: 'PUBLIC' } });

/** Le geste nominal de CHAQUE gabarit, tel que son libellé le demande — et qui le fait (l'auteur cité pour les réponses reçues). */
const NOMINAL: Readonly<Record<string, { readonly by?: string; readonly gesture: (ctx: Ctx) => Promise<void> }>> = {
  'send-texts': { gesture: (ctx) => ctx.engagement.recordActivity(USER, 'content.text_message') },
  'long-chat': { gesture: (ctx) => ctx.engagement.recordActivity(USER, 'content.text_message') },
  'send-attachments': { gesture: (ctx) => ctx.engagement.recordActivity(USER, 'tool.attachment') },
  'react-messages': { gesture: (ctx) => ctx.engagement.recordActivity(USER, 'tool.reaction') },
  'react-posts': { gesture: (ctx) => ctx.engagement.recordActivity(USER, 'tool.post_reaction') },
  'use-stickers': { gesture: (ctx) => ctx.engagement.recordActivity(USER, 'tool.sticker') },
  'send-voice': { gesture: (ctx) => ctx.engagement.recordActivity(USER, 'content.audio_message') },
  'publish-story': { gesture: (ctx) => ctx.engagement.recordActivity(USER, 'content.story') },
  'publish-post': { gesture: (ctx) => ctx.engagement.recordActivity(USER, 'content.post') },
  'publish-posts': { gesture: (ctx) => ctx.engagement.recordActivity(USER, 'content.post') },
  'voice-comments': { gesture: (ctx) => ctx.engagement.recordActivity(USER, 'comment.audio') },
  'join-community': { gesture: (ctx) => ctx.engagement.recordActivity(USER, 'social.community_joined', { targetId: 'community-1' }) },
  'write-someone-new': { gesture: (ctx) => ctx.engagement.recordActivity(USER, 'conversation.private', { targetId: CONV }) },
  'community-hello': { gesture: (ctx) => ctx.engagement.recordActivity(USER, 'conversation.community', { targetId: CONV }) },
  'create-invite-link': { gesture: (ctx) => ctx.engagement.recordActivity(USER, 'social.affiliate_link_created') },
  'share-link': { gesture: (ctx) => ctx.engagement.recordActivity(USER, 'social.share', { targetId: 'post-1' }) },
  'invite-contact': { gesture: (ctx) => ctx.engagement.recordActivity(USER, 'social.email_invite') },
  'invite-joined': { gesture: (ctx) => ctx.engagement.recordActivity(USER, 'social.invite_joined', { targetId: 'invitee-1' }) },
  'comment-text': { gesture: comment },
  'comment-stranger-post': { gesture: comment },
  'reply-conversations': { gesture: (ctx) => message(ctx) },
  'reply-conversations-wide': { gesture: (ctx) => message(ctx) },
  'gold-reply-conversations': { gesture: (ctx) => message(ctx) },
  'reply-story': { gesture: (ctx) => message(ctx, { storyReplyToId: 'story-1' }) },
  'cross-language-chat': { gesture: (ctx) => message(ctx) },
  'prism-foreign-messages': { gesture: (ctx) => message(ctx) },
  'prism-foreign-exchange': { gesture: (ctx) => message(ctx) },
  'reply-their-language': { gesture: (ctx) => message(ctx, { replyToId: 'msg-1', quotedAuthorUserId: OTHER }) },
  'gold-replies-received': { by: OTHER, gesture: (ctx) => message(ctx, { replyToId: 'msg-1', quotedAuthorUserId: OTHER }) },
  'start-conversation': { gesture: (ctx) => ctx.engagement.recordConversationStarted({ senderUserId: USER, conversationId: CONV }) },
  'publish-reel': { gesture: (ctx) => ctx.engagement.recordGameSignal(USER, 'reel-published', { key: 'post-9' }) },
};

const world = (): Ctx => {
  const db = fakeGameDb();
  const old = new Date('2026-01-01T00:00:00Z');
  seedUser(db, { engagementScore: 1000, levelRecord: 10, systemLanguage: 'fr', regionalLanguage: 'en', createdAt: old });
  seedUser(db, { engagementScore: 1000, levelRecord: 10, systemLanguage: 'en', createdAt: old }, OTHER);
  db.participant.rows.push(
    { id: 'p-1', conversationId: CONV, userId: USER, isActive: true },
    { id: 'p-2', conversationId: CONV, userId: OTHER, isActive: true },
  );
  db.message.rows.push({ id: 'msg-1', createdAt: new Date('2026-10-20T08:50:00Z') });
  const engagement = new EngagementService(db.prisma, { scale: { current: async () => DEFAULT_ENGAGEMENT_SCALE }, emitIO: () => undefined });
  return { db, engagement };
};

const seasonStars = (db: FakeGameDb, userId: string): number =>
  db.gameSeason.rows.filter((r) => r.userId === userId).reduce((sum, r) => sum + (r.stars as number), 0);

describe('chaque défi du jour se fait et paie tout ce qu’il annonce (#9635)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(NOW);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ language: 'en' }), { status: 200 }));
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('nomme un geste pour chaque gabarit du catalogue', () => {
    expect(MISSION_TEMPLATES.map((t) => t.key).sort()).toEqual(Object.keys(NOMINAL).sort());
  });

  it.each(MISSION_TEMPLATES.map((t) => [t.key, t] as const))('%s', async (key, template: MissionTemplate) => {
    const ctx = world();
    const owner = NOMINAL[key]!.by ?? USER;
    const drawn = drawnMissionOf({ template, difficulty: template.difficulty, level: 10, flameDays: 0 });
    const announced = missionArtifacts(drawn, 0);
    ctx.db.dailyMission.rows.push({
      id: 'm1', userId: owner, dayKey: DAY, slot: 0, templateKey: template.key, difficulty: drawn.difficulty, signal: drawn.signal,
      prism: drawn.prism, target: 1, progress: 0, reward: drawn.reward, glory: drawn.glory, seen: [],
      completedAt: null, paidPoints: null, rerolledAt: null, createdAt: NOW,
    });
    const scoreBefore = ctx.db.user.rows.find((u) => u.id === owner)!.engagementScore as number;

    await NOMINAL[key]!.gesture(ctx);

    const row = ctx.db.dailyMission.rows[0]!;
    expect({ key, completed: row.completedAt instanceof Date }).toEqual({ key, completed: true });
    const paid = row.paidPoints as number;
    expect([announced.points, announced.points * 2]).toContain(paid);
    expect((ctx.db.user.rows.find((u) => u.id === owner)!.engagementScore as number) - scoreBefore).toBeGreaterThanOrEqual(paid);
    const glory = ctx.db.gloryLedger.rows.filter((r) => r.userId === owner && String(r.requestId) === 'mission:m1');
    expect(glory.map((r) => r.delta)).toEqual(announced.glory > 0 ? [announced.glory] : []);
    expect(seasonStars(ctx.db, owner)).toBe(announced.seasonStars);
    expect(announced.chest).toBe(true);
  });

  it('les trois missions du jour achevées par leurs gestes ouvrent le coffre', async () => {
    const ctx = world();
    const keys = ['send-texts', 'publish-story', 'publish-posts'];
    keys.forEach((key, slot) => {
      const template = MISSION_TEMPLATES.find((t) => t.key === key)!;
      const drawn = drawnMissionOf({ template, difficulty: template.difficulty, level: 10, flameDays: 0 });
      ctx.db.dailyMission.rows.push({
        id: `m${slot}`, userId: USER, dayKey: DAY, slot, templateKey: key, difficulty: drawn.difficulty, signal: drawn.signal, prism: false,
        target: 1, progress: 0, reward: drawn.reward, glory: drawn.glory, seen: [], completedAt: null, paidPoints: null, rerolledAt: null, createdAt: NOW,
      });
    });
    for (const key of keys) await NOMINAL[key]!.gesture(ctx);

    const missions = new MissionService(ctx.db.prisma, { creditPoints: (userId, points, axis) => ctx.engagement.creditGamePoints(userId, points, axis) });
    const chest = await missions.claimChest({ userId: USER, requestId: 'chest-0001', now: NOW });

    expect(chest.status).toBe('claimed');
  });
});

const LEVEL_20 = 10 * 20 * 20;
const MORNING = new Date('2026-10-06T06:00:00Z');
const MORNING_DAY = '2026-10-06';
const STARTS = new Date('2026-10-06T16:00:00Z');
const ENDS = new Date('2026-10-06T18:00:00Z');
const DONE = new Date('2026-10-06T05:30:00Z');

const row = (db: FakeGameDb, fields: Record<string, unknown>) => {
  const inserted = {
    id: `mission-${String(fields.slot)}`, userId: USER, dayKey: MORNING_DAY, prism: false, target: 3, progress: 0, reward: 60, glory: 0,
    seen: [], completedAt: null, paidPoints: null, rerolledAt: null, createdAt: new Date('2026-10-06T05:00:00Z'), ...fields,
  };
  db.dailyMission.rows.push(inserted);
  return inserted;
};

const services = () => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: LEVEL_20, levelRecord: 20 });
  const missions = new MissionService(db.prisma, { creditPoints: READ_ONLY_CREDIT });
  return { db, missions, personal: new PersonalMissionService(db.prisma, { missions }) };
};

const known = (key: string) => MISSION_TEMPLATES.some((t) => t.key === key);

describe('une mission du jour devenue impossible est remplacée au prochain chargement', () => {
  const staleDay = (db: FakeGameDb) => {
    const done = row(db, { slot: 0, templateKey: 'ancien-facile', difficulty: 'easy', signal: 'axis:tool.in_app_edit', target: 2, progress: 2, completedAt: DONE, paidPoints: 30 });
    row(db, { slot: 1, templateKey: 'ancien-moyen', difficulty: 'medium', signal: 'axis:tool.pin', target: 1, rerolledAt: DONE });
    row(db, { slot: 2, templateKey: 'ancien-or', difficulty: 'gold', signal: 'axis:tool.forward', target: 10, progress: 4, seen: ['a', 'b'], reward: 300, glory: 40 });
    db.gameDay.rows.push({ id: 'gd', userId: USER, dayKey: MORNING_DAY, rerollCount: 1, chestClaimedAt: null, chestPoints: null, chestFragment: null, chestFreeze: null });
    return { done };
  };

  it('remplace chaque mission en cours par un gabarit connu de même emplacement et même difficulté', async () => {
    const { db, missions } = services();
    staleDay(db);

    const today = await missions.ensureToday(USER, MORNING);

    expect(today.rows.map((r) => [r.slot, r.difficulty])).toEqual([[0, 'easy'], [1, 'medium'], [2, 'gold']]);
    for (const replaced of today.rows.slice(1)) {
      expect(known(replaced.templateKey)).toBe(true);
      expect(replaced).toMatchObject({ progress: 0, seen: [], completedAt: null });
      const template = missionTemplatesFor(replaced.difficulty as 'medium' | 'gold').find((t) => t.key === replaced.templateKey)!;
      expect(replaced.target).toBe(Math.min(template.maxTarget, Math.max(template.minTarget, missionObjective({ baseTarget: template.baseTarget, level: 20 }))));
    }
    expect(today.rows[2]!.glory).toBeGreaterThanOrEqual(40);
  });

  it('ne touche ni la mission achevée, ni le changement du jour, ni le coffre, et n’écrit aucune ligne de plus', async () => {
    const { db, missions } = services();
    const { done } = staleDay(db);
    const before = { ...done };

    await missions.ensureToday(USER, MORNING);

    expect(db.dailyMission.rows.find((r) => r.slot === 0)).toEqual(before);
    expect(db.dailyMission.rows.find((r) => r.slot === 1)?.rerolledAt).toEqual(DONE);
    expect(db.dailyMission.rows.map((r) => r.id)).toEqual(['mission-0', 'mission-1', 'mission-2']);
    expect(db.gameDay.rows).toEqual([
      { id: 'gd', userId: USER, dayKey: MORNING_DAY, rerollCount: 1, chestClaimedAt: null, chestPoints: null, chestFragment: null, chestFreeze: null },
    ]);
  });

  it('remplace une fois : un second chargement rend les mêmes missions, et une journée saine n’est pas réécrite', async () => {
    const { db, missions } = services();
    staleDay(db);
    const first = (await missions.ensureToday(USER, MORNING)).rows.map((r) => r.templateKey);
    const writes = jest.spyOn(db.prisma.dailyMission, 'updateMany');

    const second = (await missions.ensureToday(USER, MORNING)).rows.map((r) => r.templateKey);

    expect(second).toEqual(first);
    expect(writes).not.toHaveBeenCalled();
  });

  it('la mission personnelle devenue impossible est remplacée à son emplacement, sa plage et son annonce intactes', async () => {
    const { db, personal } = services();
    row(db, { slot: 0, templateKey: 'send-texts', difficulty: 'easy', signal: 'axis:content.text_message' });
    row(db, { slot: 1, templateKey: 'publish-story', difficulty: 'medium', signal: 'axis:content.story' });
    row(db, { slot: 2, templateKey: 'publish-posts', difficulty: 'hard', signal: 'axis:content.post' });
    row(db, { slot: PERSONAL_MISSION_SLOT, templateKey: 'ancien-personnel', difficulty: 'medium', signal: 'axis:tool.pin', startsAt: STARTS, endsAt: ENDS, notifiedAt: DONE });

    const replaced = await personal.ensure(USER, MORNING);

    expect(replaced).toMatchObject({ slot: PERSONAL_MISSION_SLOT, difficulty: 'medium', startsAt: STARTS, endsAt: ENDS, notifiedAt: DONE });
    expect(known(replaced!.templateKey)).toBe(true);
    expect(db.dailyMission.rows).toHaveLength(4);
  });

  it('la mission personnelle achevée garde son gabarit', async () => {
    const { db, personal } = services();
    row(db, { slot: 0, templateKey: 'send-texts', difficulty: 'easy', signal: 'axis:content.text_message' });
    row(db, { slot: 1, templateKey: 'publish-story', difficulty: 'medium', signal: 'axis:content.story' });
    row(db, { slot: 2, templateKey: 'publish-posts', difficulty: 'hard', signal: 'axis:content.post' });
    row(db, { slot: PERSONAL_MISSION_SLOT, templateKey: 'ancien-personnel', difficulty: 'hard', signal: 'axis:tool.pin', startsAt: STARTS, endsAt: ENDS, completedAt: DONE });

    expect((await personal.ensure(USER, MORNING))?.templateKey).toBe('ancien-personnel');
  });
});
