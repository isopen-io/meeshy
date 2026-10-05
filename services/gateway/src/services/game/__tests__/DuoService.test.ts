/**
 * LA MISSION EN DUO (#9385, conformité B-1 à B-6) — sur invitation acceptée, entre
 * amis non bloqués, un duo par semaine, quittée à tout moment, payée à deux
 * (doublée) ou seul à la fin de la semaine, partenaire au jour près si sa
 * présence est coupée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { duoReward } from '@meeshy/shared/utils/game/duo';
import { levelFromScore } from '@meeshy/shared/utils/game/levels';
import { DuoService } from '../DuoService';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from './fakeGameDb';

const privacy = new Map<string, Record<string, unknown>>();
jest.mock('../../preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: async (_prisma: unknown, ids: string[]) => new Map(ids.map((id) => [id, privacy.get(id) ?? {}])),
}));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const NOW = new Date('2026-10-14T12:00:00Z'); // semaine du 2026-10-12
const WEEK = '2026-10-12';
const SCORE = 4000;
const C = '68a000000000000000000003';

const setup = () => {
  const db = fakeGameDb();
  for (const id of [USER, OTHER]) seedUser(db, { engagementScore: SCORE, levelRecord: 20 }, id);
  db.friendRequest.rows.push({ id: 'f', status: 'accepted', senderId: USER, receiverId: OTHER });
  const creditPoints = jest.fn<(userId: string, points: number, axis: string) => Promise<void>>().mockResolvedValue(undefined);
  const addStars = jest.fn<(userId: string, source: string, now?: Date) => Promise<void>>().mockResolvedValue(undefined);
  const service = new DuoService(db.prisma, { creditPoints, seasons: { addStars: addStars as never } });
  return { db, service, creditPoints, addStars };
};

const started = async (ctx: ReturnType<typeof setup>) => {
  const { duoId } = await ctx.service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
  await ctx.service.accept({ userId: OTHER, duoId, now: NOW });
  const duo = ctx.db.gameDuo.rows[0]!;
  return { duoId, signal: duo.signal as string, target: duo.partTarget as number };
};

/** Fait avancer UNE part de `n` — par clés distinctes pour les signaux « distincts ». */
const advance = async (service: DuoService, userId: string, signal: string, n: number) => {
  for (let i = 0; i < n; i += 1) {
    await service.onSignal(userId, signal, signal === 'reply-distinct-conversations' ? { now: NOW, key: `c${userId}${i}` } : { now: NOW });
  }
};

beforeEach(() => privacy.clear());

describe('DuoService.invite', () => {
  it('crée un duo invité, tire la mission de la paire et réserve l’emplacement de l’invitant', async () => {
    const { db, service } = setup();
    const result = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });

    expect(result).toMatchObject({ status: 'invited', weekKey: WEEK });
    expect(db.gameDuo.rows[0]).toMatchObject({ inviterId: USER, inviteeId: OTHER, status: 'invited', weekKey: WEEK });
    expect(db.gameDuo.rows[0]!.partTarget).toBeGreaterThan(0);
    expect(db.gameDuoSlot.rows.map((s) => s.userId)).toEqual([USER]);
  });

  it('la même invitation rejouée rend already-invited sans créer de second duo', async () => {
    const { db, service } = setup();
    const first = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    const again = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    expect(again).toEqual({ status: 'already-invited', duoId: first.duoId, weekKey: WEEK });
    expect(db.gameDuo.rows).toHaveLength(1);
  });

  it('refuse : soi-même, niveau 20 manquant, pas amis, un duo déjà en cours', async () => {
    const { db, service } = setup();
    await expect(service.invite({ inviterId: USER, friendId: USER, now: NOW })).rejects.toMatchObject({ code: 'DUO_TRANSITION_REFUSED' });

    db.user.rows.find((u) => u.id === OTHER)!.levelRecord = 3;
    db.user.rows.find((u) => u.id === OTHER)!.engagementScore = 0;
    await expect(service.invite({ inviterId: USER, friendId: OTHER, now: NOW })).rejects.toMatchObject({ code: 'DUO_LOCKED' });

    db.user.rows.find((u) => u.id === OTHER)!.levelRecord = 20;
    db.user.rows.find((u) => u.id === OTHER)!.engagementScore = SCORE;
    seedUser(db, { engagementScore: SCORE, levelRecord: 20 }, C);
    await expect(service.invite({ inviterId: USER, friendId: C, now: NOW })).rejects.toMatchObject({ code: 'DUO_NOT_FRIENDS' });

    await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    db.friendRequest.rows.push({ id: 'g', status: 'accepted', senderId: USER, receiverId: C });
    await expect(service.invite({ inviterId: USER, friendId: C, now: NOW })).rejects.toMatchObject({ code: 'DUO_ALREADY_ACTIVE' });
  });

  it('un blocage rend les amis « faux » : l’invitation est refusée, dans un sens comme dans l’autre', async () => {
    const { db, service } = setup();
    db.user.rows.find((u) => u.id === OTHER)!.blockedUserIds = [USER];
    await expect(service.invite({ inviterId: USER, friendId: OTHER, now: NOW })).rejects.toMatchObject({ code: 'DUO_NOT_FRIENDS' });
    db.user.rows.find((u) => u.id === OTHER)!.blockedUserIds = [];
    db.user.rows.find((u) => u.id === USER)!.blockedUserIds = [OTHER];
    await expect(service.invite({ inviterId: USER, friendId: OTHER, now: NOW })).rejects.toMatchObject({ code: 'DUO_NOT_FRIENDS' });
  });
});

describe('DuoService.accept', () => {
  it('seul l’invité accepte : le duo devient actif et l’invité prend son emplacement', async () => {
    const { db, service } = setup();
    const { duoId } = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });

    await expect(service.accept({ userId: USER, duoId, now: NOW })).rejects.toMatchObject({ code: 'DUO_TRANSITION_REFUSED' });
    expect(await service.accept({ userId: OTHER, duoId, now: NOW })).toEqual({ status: 'active', duoId });
    expect(db.gameDuo.rows[0]!.status).toBe('active');
    expect(db.gameDuoSlot.rows.map((s) => s.userId).sort()).toEqual([USER, OTHER]);
    expect(await service.accept({ userId: OTHER, duoId, now: NOW })).toEqual({ status: 'already-active', duoId });
  });

  it('un tiers ne voit pas le duo : DUO_NOT_FOUND', async () => {
    const { db, service } = setup();
    seedUser(db, { engagementScore: SCORE, levelRecord: 20 }, C);
    const { duoId } = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    await expect(service.accept({ userId: C, duoId, now: NOW })).rejects.toMatchObject({ code: 'DUO_NOT_FOUND' });
    await expect(service.abandon({ userId: C, duoId, now: NOW })).rejects.toMatchObject({ code: 'DUO_NOT_FOUND' });
  });

  it('un invité déjà pris dans un autre duo cette semaine refuse (DUO_ALREADY_ACTIVE)', async () => {
    const { db, service } = setup();
    seedUser(db, { engagementScore: SCORE, levelRecord: 20 }, C);
    db.friendRequest.rows.push({ id: 'g', status: 'accepted', senderId: C, receiverId: OTHER });
    const { duoId } = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    const other = await service.invite({ inviterId: C, friendId: OTHER, now: NOW });
    await service.accept({ userId: OTHER, duoId: other.duoId, now: NOW });

    await expect(service.accept({ userId: OTHER, duoId, now: NOW })).rejects.toMatchObject({ code: 'DUO_ALREADY_ACTIVE' });
  });

  it('une invitation d’une semaine passée expire et ne s’accepte plus', async () => {
    const { db, service } = setup();
    const { duoId } = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    await expect(service.accept({ userId: OTHER, duoId, now: new Date('2026-10-20T12:00:00Z') })).rejects.toMatchObject({ code: 'DUO_TRANSITION_REFUSED' });
    expect(db.gameDuo.rows[0]!.status).toBe('expired');
    expect(db.gameDuoSlot.rows).toHaveLength(0);
  });

  it('un blocage entre l’invitation et l’acceptation termine le duo', async () => {
    const { db, service } = setup();
    const { duoId } = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    db.user.rows.find((u) => u.id === USER)!.blockedUserIds = [OTHER];
    await expect(service.accept({ userId: OTHER, duoId, now: NOW })).rejects.toMatchObject({ code: 'DUO_NOT_FRIENDS' });
    expect(db.gameDuo.rows[0]!.status).toBe('abandoned');
  });
});

describe('DuoService.abandon', () => {
  it('l’un ou l’autre quitte à tout moment : l’état se ferme et les deux emplacements se libèrent', async () => {
    const ctx = setup();
    const { duoId } = await started(ctx);

    expect(await ctx.service.abandon({ userId: OTHER, duoId, now: NOW })).toEqual({ status: 'abandoned', duoId });
    expect(ctx.db.gameDuo.rows[0]!.status).toBe('abandoned');
    expect(ctx.db.gameDuoSlot.rows).toHaveLength(0);
    expect(await ctx.service.abandon({ userId: USER, duoId, now: NOW })).toEqual({ status: 'already-abandoned', duoId });
    await expect(ctx.service.invite({ inviterId: USER, friendId: OTHER, now: NOW })).resolves.toMatchObject({ status: 'invited' });
  });

  it('un duo accompli ne se quitte pas', async () => {
    const ctx = setup();
    const { duoId, signal, target } = await started(ctx);
    await advance(ctx.service, USER, signal, target);
    await advance(ctx.service, OTHER, signal, target);
    await expect(ctx.service.abandon({ userId: USER, duoId, now: NOW })).rejects.toMatchObject({ code: 'DUO_TRANSITION_REFUSED' });
  });
});

describe('DuoService.onSignal', () => {
  it('ne fait avancer que la part de qui agit, que sur le signal du duo', async () => {
    const ctx = setup();
    const { signal } = await started(ctx);
    await ctx.service.onSignal(USER, 'axis:something.else', { now: NOW });
    await advance(ctx.service, USER, signal, 2);
    expect(ctx.db.gameDuo.rows[0]).toMatchObject({ inviterProgress: 2, inviteeProgress: 0 });
  });

  it('une part ne dépasse pas ce qu’on lui demande', async () => {
    const ctx = setup();
    const { signal, target } = await started(ctx);
    await advance(ctx.service, USER, signal, target + 5);
    expect(ctx.db.gameDuo.rows[0]!.inviterProgress).toBe(target);
  });

  it('un duo seulement invité ne compte rien ; un non-participant non plus', async () => {
    const ctx = setup();
    await ctx.service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    const signal = ctx.db.gameDuo.rows[0]!.signal as string;
    await advance(ctx.service, USER, signal, 3);
    expect(ctx.db.gameDuo.rows[0]!.inviterProgress).toBe(0);
  });

  it('un signal distinct ne compte qu’une fois par clé', async () => {
    const ctx = setup();
    await started(ctx);
    ctx.db.gameDuo.rows[0]!.signal = 'reply-distinct-conversations';
    ctx.db.gameDuo.rows[0]!.partTarget = 5;
    ctx.db.gameDuo.rows[0]!.commonTarget = 10;

    await ctx.service.onSignal(USER, 'reply-distinct-conversations', { now: NOW, key: 'conv-1' });
    await ctx.service.onSignal(USER, 'reply-distinct-conversations', { now: NOW, key: 'conv-1' });
    await ctx.service.onSignal(USER, 'reply-distinct-conversations', { now: NOW, key: 'conv-2' });

    expect(ctx.db.gameDuo.rows[0]!.inviterProgress).toBe(2);
  });

  it('quand les deux parts sont faites : accompli, chacun payé DOUBLE, 5 étoiles chacun, emplacements libérés', async () => {
    const ctx = setup();
    const { signal, target } = await started(ctx);

    await advance(ctx.service, USER, signal, target);
    expect(ctx.db.gameDuo.rows[0]!.status).toBe('active');
    await advance(ctx.service, OTHER, signal, target);

    const doubled = duoReward({ level: levelFromScore(SCORE), flameDays: 0, mineDone: true, partnerDone: true });
    expect(doubled.doubled).toBe(true);
    expect(ctx.db.gameDuo.rows[0]!.status).toBe('completed');
    expect(ctx.creditPoints.mock.calls.map((c) => [c[0], c[1]]).sort()).toEqual([[OTHER, doubled.points], [USER, doubled.points]].sort());
    expect(ctx.addStars.mock.calls.map((c) => [c[0], c[1]]).sort()).toEqual([[OTHER, 'duo'], [USER, 'duo']].sort());
    expect(ctx.db.gameDuoSlot.rows).toHaveLength(0);
  });

  it('un blocage en cours de route termine le duo au prochain fait', async () => {
    const ctx = setup();
    const { signal } = await started(ctx);
    ctx.db.user.rows.find((u) => u.id === OTHER)!.blockedUserIds = [USER];
    await advance(ctx.service, USER, signal, 1);
    expect(ctx.db.gameDuo.rows[0]!.status).toBe('abandoned');
    expect(ctx.db.gameDuo.rows[0]!.inviterProgress).toBe(0);
  });
});

describe('DuoService.expireOld', () => {
  const AFTER = new Date('2026-10-19T09:00:00Z');

  it('celui qui a fini seul reçoit sa part SIMPLE, le duo expire, les emplacements se libèrent', async () => {
    const ctx = setup();
    const { signal, target } = await started(ctx);
    await advance(ctx.service, USER, signal, target);

    expect(await ctx.service.expireOld(AFTER)).toBe(1);

    const solo = duoReward({ level: levelFromScore(SCORE), flameDays: 0, mineDone: true, partnerDone: false });
    expect(ctx.creditPoints.mock.calls).toEqual([[USER, solo.points, 'content.text_message']]);
    expect(ctx.db.gameDuo.rows[0]!.status).toBe('expired');
    expect(ctx.db.gameDuoSlot.rows).toHaveLength(0);
  });

  it('est idempotent, et laisse intacte la semaine en cours', async () => {
    const ctx = setup();
    const { signal, target } = await started(ctx);
    await advance(ctx.service, USER, signal, target);

    expect(await ctx.service.expireOld(new Date('2026-10-19T07:00:00Z'))).toBe(0);
    expect(await ctx.service.expireOld(AFTER)).toBe(1);
    expect(await ctx.service.expireOld(AFTER)).toBe(0);
    expect(ctx.creditPoints).toHaveBeenCalledTimes(1);
  });

  it('un paiement qui échoue rend sa réclamation : un prochain passage le rejouerait', async () => {
    const ctx = setup();
    const { signal, target } = await started(ctx);
    await advance(ctx.service, USER, signal, target);
    ctx.creditPoints.mockRejectedValueOnce(new Error('down'));

    await ctx.service.expireOld(AFTER);

    expect(ctx.db.gameDuo.rows[0]!.inviterPaidAt).toBeNull();
  });
});

describe('DuoService.current', () => {
  it('rien sans duo cette semaine', async () => {
    const { service } = setup();
    expect(await service.current(USER, NOW)).toBeNull();
  });

  it('sert la mission, mon avancement et celui du partenaire, sous son nom d’ami', async () => {
    const ctx = setup();
    const { signal } = await started(ctx);
    await advance(ctx.service, OTHER, signal, 2);
    ctx.db.user.rows.find((u) => u.id === OTHER)!.displayName = 'Marie';

    const view = await ctx.service.current(USER, NOW);

    expect(view).toMatchObject({ role: 'inviter', status: 'active', mine: 0, partnerProgress: 2, partner: { userId: OTHER, displayName: 'Marie' } });
    expect(view!.mission).toMatchObject({ signal, weekKey: WEEK });
  });

  it('un partenaire qui a coupé sa présence se montre à la fin de la veille (B-3)', async () => {
    const ctx = setup();
    const { signal } = await started(ctx);
    await advance(ctx.service, OTHER, signal, 2);
    privacy.set(OTHER, { showOnlineStatus: false });

    expect((await ctx.service.current(USER, NOW))!.partnerProgress).toBe(0);
    expect((await ctx.service.current(USER, new Date('2026-10-15T12:00:00Z')))!.partnerProgress).toBe(2);

    privacy.clear();
    expect((await ctx.service.current(USER, NOW))!.partnerProgress).toBe(2);
  });

  it('un blocage termine le duo en cours : plus rien n’est servi', async () => {
    const ctx = setup();
    await started(ctx);
    ctx.db.user.rows.find((u) => u.id === OTHER)!.blockedUserIds = [USER];
    expect(await ctx.service.current(USER, NOW)).toBeNull();
    expect(ctx.db.gameDuo.rows[0]!.status).toBe('abandoned');
  });
});
