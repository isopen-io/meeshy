/**
 * LES GARDE-FOUS CONTRE L'ENTRE-SOI (#9377) — rien pour un message à soi, à un
 * compte de moins de 24 h ou bloqué ; points divisés par 4 au-delà de 50
 * messages par jour entre deux mêmes comptes seuls.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { GameAbuseGuard, MESSAGES_PER_PAIR_PER_DAY, REPLY_BONUS_WINDOW_MS } from '../GameAbuseGuard';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from './fakeGameDb';

const NOW = new Date('2026-10-05T12:00:00Z');
const CONV = '68b000000000000000000001';
const THIRD = '68a000000000000000000003';

const members = (db: FakeGameDb, ids: (string | null)[]) =>
  ids.forEach((userId, i) => db.participant.rows.push({ id: `p${i}`, conversationId: CONV, userId, isActive: true }));

const assess = (db: FakeGameDb, fields: { dailyMessages?: number; operationKey?: string; userId?: string } = {}) =>
  new GameAbuseGuard(db.prisma).assessMessage({
    userId: fields.userId ?? USER,
    conversationId: CONV,
    operationKey: fields.operationKey ?? 'content.text_message',
    dailyMessages: fields.dailyMessages ?? 0,
    now: NOW,
  });

describe('GameAbuseGuard.assessMessage', () => {
  it('rien pour un message à soi : la conversation n’a que son auteur', async () => {
    const db = fakeGameDb();
    seedUser(db);
    members(db, [USER]);

    expect(await assess(db)).toBe('none');
  });

  it('rien pour un message à un compte de moins de 24 h', async () => {
    const db = fakeGameDb();
    seedUser(db);
    seedUser(db, { createdAt: new Date('2026-10-05T03:00:00Z') }, OTHER);
    members(db, [USER, OTHER]);

    expect(await assess(db)).toBe('none');
  });

  it('un compte vieux de plus de 24 h compte', async () => {
    const db = fakeGameDb();
    seedUser(db);
    seedUser(db, { createdAt: new Date('2026-10-04T11:00:00Z') }, OTHER);
    members(db, [USER, OTHER]);

    expect(await assess(db)).toBe('full');
  });

  it('rien pour un message à un compte bloqué, dans un sens comme dans l’autre', async () => {
    const blockedByMe = fakeGameDb();
    seedUser(blockedByMe, { blockedUserIds: [OTHER] });
    seedUser(blockedByMe, {}, OTHER);
    members(blockedByMe, [USER, OTHER]);

    const blockingMe = fakeGameDb();
    seedUser(blockingMe);
    seedUser(blockingMe, { blockedUserIds: [USER] }, OTHER);
    members(blockingMe, [USER, OTHER]);

    expect(await assess(blockedByMe)).toBe('none');
    expect(await assess(blockingMe)).toBe('none');
  });

  it('au-delà de 50 messages par jour entre deux comptes seuls, les points sont divisés par 4', async () => {
    const db = fakeGameDb();
    seedUser(db);
    seedUser(db, {}, OTHER);
    members(db, [USER, OTHER]);

    expect(await assess(db, { dailyMessages: MESSAGES_PER_PAIR_PER_DAY - 1 })).toBe('full');
    expect(await assess(db, { dailyMessages: MESSAGES_PER_PAIR_PER_DAY })).toBe('quarter');
  });

  it('un groupe de trois n’est pas « deux comptes seuls » : aucun frein', async () => {
    const db = fakeGameDb();
    seedUser(db);
    seedUser(db, {}, OTHER);
    seedUser(db, {}, THIRD);
    members(db, [USER, OTHER, THIRD]);

    expect(await assess(db, { dailyMessages: 400 })).toBe('full');
  });

  it('un geste qui n’est pas un message n’est jamais freiné, et ne lit rien', async () => {
    const db = fakeGameDb();
    const read = jest.spyOn(db.participant, 'findMany');

    expect(await assess(db, { operationKey: 'tool.reaction', dailyMessages: 400 })).toBe('full');
    expect(read).not.toHaveBeenCalled();
  });

  it('la lecture d’une conversation se garde en mémoire : le second message ne relit rien', async () => {
    const db = fakeGameDb();
    seedUser(db);
    seedUser(db, {}, OTHER);
    members(db, [USER, OTHER]);
    const guard = new GameAbuseGuard(db.prisma);
    const read = jest.spyOn(db.participant, 'findMany');
    const input = { userId: USER, conversationId: CONV, operationKey: 'content.text_message', dailyMessages: 0, now: NOW };

    await guard.assessMessage(input);
    await guard.assessMessage(input);

    expect(read).toHaveBeenCalledTimes(1);
  });

  it('une conversation illisible ne coûte pas de points : le jeu ne bloque jamais un geste sur une panne', async () => {
    const db = fakeGameDb();
    jest.spyOn(db.participant, 'findMany').mockRejectedValue(new Error('base indisponible'));

    expect(await assess(db)).toBe('full');
  });
});

describe('GameAbuseGuard.assessReply — une réponse reçue', () => {
  const base = { replierId: OTHER, authorId: USER, originalCreatedAt: new Date('2026-10-05T11:30:00Z'), now: NOW };

  it('éligible : une autre personne, un compte de plus de 24 h, aucun blocage', async () => {
    const db = fakeGameDb();
    seedUser(db);
    seedUser(db, {}, OTHER);

    expect(await new GameAbuseGuard(db.prisma).assessReply(base)).toEqual({ eligible: true, withinWindow: true });
  });

  it('au-delà d’une heure, la réponse est éligible aux missions mais ne rapporte plus de points', async () => {
    const db = fakeGameDb();
    seedUser(db);
    seedUser(db, {}, OTHER);
    const late = new Date(NOW.getTime() - REPLY_BONUS_WINDOW_MS - 1000);

    expect(await new GameAbuseGuard(db.prisma).assessReply({ ...base, originalCreatedAt: late })).toEqual({ eligible: true, withinWindow: false });
  });

  it('rien pour une réponse à soi-même', async () => {
    const db = fakeGameDb();
    seedUser(db);

    expect(await new GameAbuseGuard(db.prisma).assessReply({ ...base, replierId: USER })).toMatchObject({ eligible: false });
  });

  it('rien d’un compte de moins de 24 h, ni d’un compte bloqué', async () => {
    const fresh = fakeGameDb();
    seedUser(fresh);
    seedUser(fresh, { createdAt: new Date('2026-10-05T09:00:00Z') }, OTHER);
    const blocked = fakeGameDb();
    seedUser(blocked, { blockedUserIds: [OTHER] });
    seedUser(blocked, {}, OTHER);

    expect(await new GameAbuseGuard(fresh.prisma).assessReply(base)).toMatchObject({ eligible: false });
    expect(await new GameAbuseGuard(blocked.prisma).assessReply(base)).toMatchObject({ eligible: false });
  });
});
