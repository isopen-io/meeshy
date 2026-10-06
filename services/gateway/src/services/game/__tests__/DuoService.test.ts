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
import { DUO_INVITES_PER_WEEK, DuoService, roundedPartnerProgress } from '../DuoService';
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
    expect(db.gameDuoSlot.rows).toHaveLength(2);
    expect(await service.accept({ userId: OTHER, duoId, now: NOW })).toEqual({ status: 'already-active', duoId });
  });

  it('un tiers ne voit pas le duo : DUO_NOT_FOUND', async () => {
    const { db, service } = setup();
    seedUser(db, { engagementScore: SCORE, levelRecord: 20 }, C);
    const { duoId } = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    await expect(service.accept({ userId: C, duoId, now: NOW })).rejects.toMatchObject({ code: 'DUO_NOT_FOUND' });
    await expect(service.abandon({ userId: C, duoId, now: NOW })).rejects.toMatchObject({ code: 'DUO_NOT_FOUND' });
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
    expect(ctx.db.gameDuoSlot.rows).toHaveLength(2);
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
    ctx.db.gameDuo.rows[0]!.partTarget = 8;
    ctx.db.gameDuo.rows[0]!.commonTarget = 16;
    await advance(ctx.service, OTHER, signal, 2);
    ctx.db.user.rows.find((u) => u.id === OTHER)!.displayName = 'Marie';

    const view = await ctx.service.current(USER, NOW);

    expect(view).toMatchObject({ role: 'inviter', status: 'active', mine: 0, partnerProgress: 2, partner: { userId: OTHER, displayName: 'Marie' } });
    expect(view!.mission).toMatchObject({ signal, weekKey: WEEK });
  });

  it('un partenaire qui a coupé son statut en ligne, ou masqué son jeu, ne montre RIEN (B-3, A-7)', async () => {
    const ctx = setup();
    const { signal, target } = await started(ctx);
    await advance(ctx.service, OTHER, signal, target - 1);

    privacy.set(OTHER, { showOnlineStatus: false });
    expect((await ctx.service.current(USER, NOW))!.partnerProgress).toBe(0);
    expect((await ctx.service.current(USER, new Date('2026-10-15T12:00:00Z')))!.partnerProgress).toBe(0);

    privacy.clear();
    ctx.db.gameProfile.rows.push({ id: 'p', userId: OTHER, gameHiddenAt: new Date() });
    expect((await ctx.service.current(USER, NOW))!.partnerProgress).toBe(0);
  });

  it('la part du partenaire est ARRONDIE et la charge ne porte ni clé de jour ni horodatage', async () => {
    const ctx = setup();
    const { signal } = await started(ctx);
    ctx.db.gameDuo.rows[0]!.partTarget = 8;
    ctx.db.gameDuo.rows[0]!.commonTarget = 16;
    ctx.db.gameDuo.rows[0]!.signal = signal;
    await advance(ctx.service, OTHER, signal, 3);

    const view = await ctx.service.current(USER, NOW);

    expect(view!.partnerProgress).toBe(2);
    expect(JSON.stringify(view)).not.toMatch(/Today|todayKey|T12:00|lastActive/);
    expect(Object.keys(ctx.db.gameDuo.rows[0]!)).not.toEqual(expect.arrayContaining(['inviterTodayKey']));
  });

  it('un blocage termine le duo en cours : plus rien n’est servi', async () => {
    const ctx = setup();
    await started(ctx);
    ctx.db.user.rows.find((u) => u.id === OTHER)!.blockedUserIds = [USER];
    expect(await ctx.service.current(USER, NOW)).toBeNull();
    expect(ctx.db.gameDuo.rows[0]!.status).toBe('abandoned');
  });
});

describe('roundedPartnerProgress', () => {
  it('arrondit au quart de la cible vers le bas', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => roundedPartnerProgress(n, 8))).toEqual([0, 0, 2, 2, 4, 4, 6, 6, 8]);
    expect(roundedPartnerProgress(99, 8)).toBe(8);
    expect(roundedPartnerProgress(-3, 8)).toBe(0);
    expect(roundedPartnerProgress(5, 0)).toBe(0);
  });
});

describe('DuoService — pas de farming de récompenses', () => {
  it('invitations croisées A→B puis B→A la même semaine : la seconde est refusée', async () => {
    const { service } = setup();
    await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    await expect(service.invite({ inviterId: OTHER, friendId: USER, now: NOW })).rejects.toMatchObject({ code: 'DUO_ALREADY_ACTIVE' });
  });

  it('invitations croisées SIMULTANÉES : jamais deux duos actifs, aucun paiement double possible', async () => {
    const { db, service } = setup();
    const results = await Promise.allSettled([
      service.invite({ inviterId: USER, friendId: OTHER, now: NOW }),
      service.invite({ inviterId: OTHER, friendId: USER, now: NOW }),
    ]);
    const created = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value.duoId] : []));
    const accepted = await Promise.allSettled(
      created.map((duoId) => service.accept({ userId: db.gameDuo.rows.find((d) => d.id === duoId)!.inviteeId as string, duoId, now: NOW })),
    );
    expect(accepted.filter((r) => r.status === 'fulfilled').length).toBeLessThanOrEqual(1);
    expect(db.gameDuo.rows.filter((d) => d.status === 'active').length).toBeLessThanOrEqual(1);
  });

  it('un duo ACCOMPLI ne se rejoue pas la même semaine : ni même partenaire, ni autre, ni sens inverse', async () => {
    const ctx = setup();
    const { signal, target } = await started(ctx);
    await advance(ctx.service, USER, signal, target);
    await advance(ctx.service, OTHER, signal, target);
    expect(ctx.creditPoints).toHaveBeenCalledTimes(2);
    seedUser(ctx.db, { engagementScore: SCORE, levelRecord: 20 }, C);
    ctx.db.friendRequest.rows.push({ id: 'g', status: 'accepted', senderId: USER, receiverId: C });

    await expect(ctx.service.invite({ inviterId: USER, friendId: OTHER, now: NOW })).rejects.toMatchObject({ code: 'DUO_ALREADY_ACTIVE' });
    await expect(ctx.service.invite({ inviterId: OTHER, friendId: USER, now: NOW })).rejects.toMatchObject({ code: 'DUO_ALREADY_ACTIVE' });
    await expect(ctx.service.invite({ inviterId: USER, friendId: C, now: NOW })).rejects.toMatchObject({ code: 'DUO_ALREADY_ACTIVE' });
    expect(ctx.creditPoints).toHaveBeenCalledTimes(2);
  });

  it('abandon puis réinvitation : l’avancement repart de zéro, rien n’est payé pour le duo abandonné', async () => {
    const ctx = setup();
    const { duoId, signal, target } = await started(ctx);
    await advance(ctx.service, USER, signal, target);
    await ctx.service.abandon({ userId: OTHER, duoId, now: NOW });
    const again = await ctx.service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    await ctx.service.accept({ userId: OTHER, duoId: again.duoId, now: NOW });

    expect(ctx.creditPoints).not.toHaveBeenCalled();
    const fresh = ctx.db.gameDuo.rows.find((r) => r.id === again.duoId)!;
    expect([fresh.inviterProgress, fresh.inviteeProgress]).toEqual([0, 0]);
  });

  it('un duo terminé pour non-amitié n’est jamais payé, et sa recréation repart de zéro', async () => {
    const ctx = setup();
    const { signal, target } = await started(ctx);
    await advance(ctx.service, USER, signal, target);
    ctx.db.user.rows.find((u) => u.id === OTHER)!.blockedUserIds = [USER];
    await advance(ctx.service, USER, signal, 1);
    expect(ctx.db.gameDuo.rows[0]!.status).toBe('abandoned');
    expect(ctx.creditPoints).not.toHaveBeenCalled();
  });

  it('une invitation à un compte inconnu, supprimé ou désactivé est refusée', async () => {
    const { db, service } = setup();
    const refused = { code: expect.stringMatching(/^DUO_(LOCKED|NOT_FRIENDS)$/) };
    await expect(service.invite({ inviterId: USER, friendId: '68a0000000000000000000ff', now: NOW })).rejects.toMatchObject(refused);
    db.user.rows.find((u) => u.id === OTHER)!.deletedAt = new Date();
    await expect(service.invite({ inviterId: USER, friendId: OTHER, now: NOW })).rejects.toMatchObject(refused);
    db.user.rows.find((u) => u.id === OTHER)!.deletedAt = null;
    db.user.rows.find((u) => u.id === OTHER)!.isActive = false;
    await expect(service.invite({ inviterId: USER, friendId: OTHER, now: NOW })).rejects.toMatchObject(refused);
    expect(db.gameDuo.rows).toHaveLength(0);
  });

  it('le paiement est un compare-and-write : deux complétions concurrentes ne paient pas deux fois', async () => {
    const ctx = setup();
    const { signal, target } = await started(ctx);
    await advance(ctx.service, USER, signal, target - 1);
    await advance(ctx.service, OTHER, signal, target - 1);
    await Promise.all([ctx.service.onSignal(USER, signal, { now: NOW, ...(signal === 'reply-distinct-conversations' ? { key: 'zz1' } : {}) }), ctx.service.onSignal(OTHER, signal, { now: NOW, ...(signal === 'reply-distinct-conversations' ? { key: 'zz2' } : {}) })]);
    expect(ctx.creditPoints).toHaveBeenCalledTimes(2);
    await ctx.service.expireOld(new Date('2026-10-19T09:00:00Z'));
    expect(ctx.creditPoints).toHaveBeenCalledTimes(2);
  });

  it('inviter soi-même est refusé', async () => {
    const { service, db } = setup();
    await expect(service.invite({ inviterId: USER, friendId: USER, now: NOW })).rejects.toBeDefined();
    expect(db.gameDuo.rows).toHaveLength(0);
  });
});

describe('DuoService — autorisation et nuisance', () => {
  it('l’invitant ne peut pas accepter sa propre invitation, seul l’invité le peut', async () => {
    const { service } = setup();
    const { duoId } = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    await expect(service.accept({ userId: USER, duoId, now: NOW })).rejects.toMatchObject({ code: 'DUO_TRANSITION_REFUSED' });
  });

  it('un tiers reçoit EXACTEMENT la même réponse qu’un identifiant inexistant : DUO_NOT_FOUND, sans rien révéler', async () => {
    const { db, service } = setup();
    seedUser(db, { engagementScore: SCORE, levelRecord: 20 }, C);
    const { duoId } = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    const missing = '68b0000000000000000000ff';

    for (const act of [(id: string) => service.accept({ userId: C, duoId: id, now: NOW }), (id: string) => service.abandon({ userId: C, duoId: id, now: NOW })]) {
      const real = await act(duoId).catch((e) => e);
      const none = await act(missing).catch((e) => e);
      expect(real).toMatchObject({ code: 'DUO_NOT_FOUND' });
      expect({ code: real.code, details: real.details }).toEqual({ code: none.code, details: none.details });
    }
    expect(db.gameDuo.rows[0]!.status).toBe('invited');
  });

  it('l’invité ou l’invitant peut décliner / quitter, le tiers non', async () => {
    const { db, service } = setup();
    const { duoId } = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    expect((await service.abandon({ userId: OTHER, duoId, now: NOW })).status).toBe('abandoned');
    expect(db.gameDuoSlot.rows).toHaveLength(0);
  });

  it('une invitation en attente n’occupe PAS l’emplacement de l’invité : il garde son duo de la semaine', async () => {
    const { db, service } = setup();
    seedUser(db, { engagementScore: SCORE, levelRecord: 20 }, C);
    db.friendRequest.rows.push({ id: 'g', status: 'accepted', senderId: C, receiverId: OTHER });
    await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });

    expect(db.gameDuoSlot.rows.some((s) => s.userId === OTHER)).toBe(false);
    const other = await service.invite({ inviterId: C, friendId: OTHER, now: NOW });
    expect((await service.accept({ userId: OTHER, duoId: other.duoId, now: NOW })).status).toBe('active');
  });

  it('l’invité peut lui-même inviter quelqu’un d’autre pendant qu’une invitation l’attend', async () => {
    const { db, service } = setup();
    seedUser(db, { engagementScore: SCORE, levelRecord: 20 }, C);
    db.friendRequest.rows.push({ id: 'g', status: 'accepted', senderId: OTHER, receiverId: C });
    await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    await expect(service.invite({ inviterId: OTHER, friendId: C, now: NOW })).resolves.toMatchObject({ status: 'invited' });
  });

  it('les invitations envoyées dans une semaine sont plafonnées', async () => {
    const { db, service } = setup();
    for (let i = 0; i < DUO_INVITES_PER_WEEK; i += 1) {
      const friend = `68c0000000000000000000${String(i).padStart(2, '0')}`;
      seedUser(db, { engagementScore: SCORE, levelRecord: 20 }, friend);
      db.friendRequest.rows.push({ id: `fr${i}`, status: 'accepted', senderId: USER, receiverId: friend });
      const { duoId } = await service.invite({ inviterId: USER, friendId: friend, now: NOW });
      await service.abandon({ userId: USER, duoId, now: NOW });
    }
    await expect(service.invite({ inviterId: USER, friendId: OTHER, now: NOW })).rejects.toMatchObject({ code: 'DUO_TRANSITION_REFUSED', details: { reason: 'invitation-cap' } });
  });

  it('les invitations EN ATTENTE reçues par un même compte sont plafonnées', async () => {
    const { db, service } = setup();
    for (let i = 0; i < 5; i += 1) {
      const friend = `68d0000000000000000000${String(i).padStart(2, '0')}`;
      seedUser(db, { engagementScore: SCORE, levelRecord: 20 }, friend);
      db.friendRequest.rows.push({ id: `fq${i}`, status: 'accepted', senderId: friend, receiverId: OTHER });
      await service.invite({ inviterId: friend, friendId: OTHER, now: NOW });
    }
    await expect(service.invite({ inviterId: USER, friendId: OTHER, now: NOW })).rejects.toMatchObject({ code: 'DUO_TRANSITION_REFUSED', details: { reason: 'invitation-cap' } });
  });

  it('un compte bloqué (dans un sens ou l’autre) ne peut pas inviter', async () => {
    const { db, service } = setup();
    db.user.rows.find((u) => u.id === USER)!.blockedUserIds = [OTHER];
    await expect(service.invite({ inviterId: OTHER, friendId: USER, now: NOW })).rejects.toMatchObject({ code: 'DUO_NOT_FRIENDS' });
    await expect(service.invite({ inviterId: USER, friendId: OTHER, now: NOW })).rejects.toMatchObject({ code: 'DUO_NOT_FRIENDS' });
    expect(db.gameDuo.rows).toHaveLength(0);
  });
});

describe('DuoService — ce qu’une invitation révèle d’un inconnu, et ce que l’invité voit (#9385)', () => {
  it('un inconnu sous le niveau 20, un inconnu au-delà et un identifiant inexistant rendent la MÊME réponse : le niveau d’un tiers ne fuit pas', async () => {
    const { db, service } = setup();
    const LOW = '68a000000000000000000005';
    seedUser(db, { engagementScore: SCORE, levelRecord: 20 }, C);
    seedUser(db, { engagementScore: 0, levelRecord: 3 }, LOW);

    const answers = await Promise.all(
      [C, LOW, '68a0000000000000000000ff'].map((friendId) =>
        service.invite({ inviterId: USER, friendId, now: NOW }).then(
          () => 'accepted',
          (error: { code?: string; details?: unknown }) => JSON.stringify({ code: error.code, details: error.details ?? null }),
        ),
      ),
    );

    expect(new Set(answers).size).toBe(1);
    expect(JSON.parse(answers[0]!)).toMatchObject({ code: 'DUO_NOT_FRIENDS' });
  });

  it('l’invité VOIT l’invitation en attente (rôle invité, statut invited, son identifiant) : sans elle, il ne pourrait jamais l’accepter', async () => {
    const { service } = setup();
    const { duoId } = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });

    const view = await service.current(OTHER, NOW);

    expect(view).toMatchObject({ duoId, status: 'invited', role: 'invitee', partner: { userId: USER }, mine: 0, partnerProgress: 0 });
    await expect(service.accept({ userId: OTHER, duoId: view!.duoId, now: NOW })).resolves.toEqual({ status: 'active', duoId });
  });

  it('une invitation en attente d’un ancien ami ou d’un compte bloqué n’est pas servie à l’invité', async () => {
    const { db, service } = setup();
    await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    db.user.rows.find((u) => u.id === OTHER)!.blockedUserIds = [USER];

    expect(await service.current(OTHER, NOW)).toBeNull();
    expect(db.gameDuo.rows[0]!.status).toBe('abandoned');
  });
});

describe('DuoService — nuisance et déni de service (#9385)', () => {
  it('une invitation REFUSÉE par l’invité ne se renouvelle pas la même semaine, mais la semaine suivante oui', async () => {
    const { service } = setup();
    const { duoId } = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    await service.abandon({ userId: OTHER, duoId, now: NOW });

    await expect(service.invite({ inviterId: USER, friendId: OTHER, now: NOW })).rejects.toMatchObject({
      code: 'DUO_TRANSITION_REFUSED',
      details: { reason: 'declined-this-week' },
    });
    await expect(service.invite({ inviterId: USER, friendId: OTHER, now: new Date('2026-10-21T12:00:00Z') })).resolves.toMatchObject({ status: 'invited' });
  });

  it('l’invitant qui retire SA propre invitation peut la refaire : seul le refus de l’invité la verrouille', async () => {
    const { service } = setup();
    const { duoId } = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    await service.abandon({ userId: USER, duoId, now: NOW });
    await expect(service.invite({ inviterId: USER, friendId: OTHER, now: NOW })).resolves.toMatchObject({ status: 'invited' });
  });

  it('le refus d’un invité ne le prive de rien : il peut inviter l’invitant refusé, le duo se fait dans l’autre sens', async () => {
    const { service } = setup();
    const { duoId } = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    await service.abandon({ userId: OTHER, duoId, now: NOW });
    await expect(service.invite({ inviterId: OTHER, friendId: USER, now: NOW })).resolves.toMatchObject({ status: 'invited' });
  });

  it('une invitation coûte un nombre BORNÉ de requêtes, toutes par clé indexée (aucun balayage, aucune boucle sur les invitations)', async () => {
    const { db, service } = setup();
    for (let i = 0; i < 4; i += 1) {
      const friend = `68e0000000000000000000${String(i).padStart(2, '0')}`;
      seedUser(db, { engagementScore: SCORE, levelRecord: 20 }, friend);
      db.friendRequest.rows.push({ id: `fz${i}`, status: 'accepted', senderId: friend, receiverId: OTHER });
      await service.invite({ inviterId: friend, friendId: OTHER, now: NOW });
    }
    const calls: string[] = [];
    for (const name of ['gameDuo', 'gameDuoSlot', 'friendRequest', 'user'] as const) {
      const model = db[name] as unknown as Record<string, (...args: unknown[]) => unknown>;
      for (const method of ['findFirst', 'findMany', 'findUnique', 'count', 'create', 'update', 'updateMany']) {
        const original = model[method]!.bind(model);
        model[method] = (...args: unknown[]) => {
          calls.push(`${name}.${method}`);
          return original(...args);
        };
      }
    }

    await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });

    expect(calls.length).toBeLessThanOrEqual(16);
    expect(calls.filter((c) => c.endsWith('.findMany'))).toEqual([]);
  });
});

describe('DuoService — les notifications du duo (#9490)', () => {
  const withNotifier = () => {
    const events: Array<Record<string, unknown>> = [];
    const notifier = { notify: jest.fn(async (event: Record<string, unknown>) => { events.push(event); return 'sent' as const; }) };
    const base = setup();
    const service = new DuoService(base.db.prisma, { creditPoints: base.creditPoints, seasons: { addStars: base.addStars as never }, notifier: notifier as never });
    return { ...base, service, events, notifier };
  };

  it('une invitation prévient l’INVITÉ, en nommant l’invitant (son ami) — une fois', async () => {
    const { service, events } = withNotifier();

    const { duoId } = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });

    expect(events).toEqual([{ kind: 'duo-invited', recipientId: OTHER, actorId: USER, duoId, weekKey: WEEK }]);
  });

  it('une invitation refusée (pas amis, niveau manquant) ne prévient personne', async () => {
    const { service, events } = withNotifier();
    await expect(service.invite({ inviterId: USER, friendId: C, now: NOW })).rejects.toBeDefined();
    expect(events).toEqual([]);
  });

  it('l’acceptation prévient l’INVITANT ; rejouée, elle ne prévient pas deux fois', async () => {
    const { service, events } = withNotifier();
    const { duoId } = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    events.length = 0;

    await service.accept({ userId: OTHER, duoId, now: NOW });
    await service.accept({ userId: OTHER, duoId, now: NOW });

    expect(events).toEqual([{ kind: 'duo-accepted', recipientId: USER, actorId: OTHER, duoId, weekKey: WEEK }]);
  });

  it('un service de notification en panne ne défait JAMAIS le geste', async () => {
    const base = setup();
    const service = new DuoService(base.db.prisma, {
      creditPoints: base.creditPoints,
      notifier: { notify: async () => { throw new Error('boom'); } } as never,
    });
    const result = await service.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    expect(result.status).toBe('invited');
    await new Promise((resolve) => setImmediate(resolve));
    expect(base.db.gameDuo.rows).toHaveLength(1);
  });
});
