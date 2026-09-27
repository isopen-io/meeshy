/**
 * Flamme-œil (#8302) — « vu puis quitté » : le message disparaît chez CE
 * lecteur, et chez lui seul. L'expéditeur le garde jusqu'à ce que tous
 * l'aient vu ; la destruction du contenu suit alors, une heure plus tard.
 *
 * Le double Prisma de ce fichier HONORE les filtres qu'il reçoit (conversation,
 * absence de la colonne, échéance à venir) : un double qui rendrait la même
 * ligne quelle que soit la question mesurerait l'implémentation, pas la loi.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { EPHEMERAL_UNAVAILABILITY_GRACE_MS } from '@meeshy/shared/utils/ephemeral-countdown';

import { consumeAfterReadMessages } from '../consumeAfterReadMessages';

const CONV = '507f1f77bcf86cd799439011';
const OTHER_CONV = '507f1f77bcf86cd799439012';
const READER = '507f1f77bcf86cd7994390a1';
const PEER = '507f1f77bcf86cd7994390a2';
const SENDER = '507f1f77bcf86cd7994390af';
const FLAME = '507f1f77bcf86cd799439031';
const PLAIN_EPHEMERAL = '507f1f77bcf86cd799439032';
const FOREIGN_FLAME = '507f1f77bcf86cd799439033';
const OWN_FLAME = '507f1f77bcf86cd799439034';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const RETENTION = new Date('2026-10-04T12:00:00.000Z');
const AFTER_READ = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;

type Row = Record<string, any>;

const isAbsent = (value: unknown) => value === undefined || value === null;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((c) => matches(row, c));
    if (key === 'AND') return (cond as Row[]).every((c) => matches(row, c));
    const value = row[key];
    if (cond === null) return isAbsent(value);
    if (cond instanceof Date || typeof cond !== 'object') return value === cond || (value instanceof Date && cond instanceof Date && value.getTime() === cond.getTime());
    if ('in' in cond) return (cond.in as unknown[]).includes(value);
    if ('isSet' in cond) return cond.isSet ? value !== undefined : value === undefined;
    if ('not' in cond) return cond.not === null ? !isAbsent(value) : value !== cond.not;
    if ('gt' in cond) return value instanceof Date && value.getTime() > cond.gt.getTime();
    return false;
  });
}

function buildPrisma(seed: { messages: Row[]; entries?: Row[]; participants?: Row[] }) {
  const messages = seed.messages.map((m) => ({ ...m }));
  const entries = (seed.entries ?? []).map((e) => ({ ...e }));
  const participants = (seed.participants ?? []).map((p) => ({ ...p }));
  let nextId = 1;
  const prisma = {
    message: {
      findMany: async ({ where }: Row) => messages.filter((m) => matches(m, where)),
      updateMany: async ({ where, data }: Row) => {
        const hit = messages.filter((m) => matches(m, where));
        hit.forEach((m) => Object.assign(m, data));
        return { count: hit.length };
      },
    },
    messageStatusEntry: {
      findMany: async ({ where }: Row) => entries.filter((e) => matches(e, where)),
      findFirst: async ({ where }: Row) => entries.find((e) => matches(e, where)) ?? null,
      updateMany: async ({ where, data }: Row) => {
        const hit = entries.filter((e) => matches(e, where));
        hit.forEach((e) => Object.assign(e, data));
        return { count: hit.length };
      },
      create: async ({ data }: Row) => {
        if (entries.some((e) => e.messageId === data.messageId && e.participantId === data.participantId)) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        const row = { id: `entry-${nextId++}`, ...data };
        entries.push(row);
        return row;
      },
    },
    participant: {
      findMany: async ({ where }: Row) => participants.filter((p) => matches(p, where)),
    },
  };
  return { prisma: prisma as any, messages, entries };
}

const message = (over: Row): Row => ({
  id: FLAME,
  conversationId: CONV,
  senderId: SENDER,
  effectFlags: AFTER_READ,
  isViewOnce: false,
  expiresAt: RETENTION,
  deletedAt: null,
  ...over,
});

const activeParticipants = [
  { id: SENDER, conversationId: CONV, isActive: true },
  { id: READER, conversationId: CONV, isActive: true },
  { id: PEER, conversationId: CONV, isActive: true },
];

const consume = (prisma: unknown, messageIds: string[]) =>
  consumeAfterReadMessages(prisma as any, { conversationId: CONV, participantId: READER, messageIds, now: NOW });

describe('consumeAfterReadMessages', () => {
  it("pose l'échéance du lecteur à maintenant, sur SA ligne seulement", async () => {
    const { prisma, entries } = buildPrisma({
      messages: [message({})],
      entries: [
        { id: 'e-reader', messageId: FLAME, conversationId: CONV, participantId: READER, receivedAt: NOW },
        { id: 'e-peer', messageId: FLAME, conversationId: CONV, participantId: PEER, receivedAt: NOW },
      ],
      participants: activeParticipants,
    });

    const result = await consume(prisma, [FLAME]);

    expect(result.consumed).toEqual([FLAME]);
    expect(result.entries).toEqual([
      expect.objectContaining({ id: 'e-reader', messageId: FLAME, conversationId: CONV, participantId: READER, ephemeralExpiresAt: NOW }),
    ]);
    expect(entries.find((e) => e.id === 'e-peer')?.ephemeralExpiresAt).toBeUndefined();
  });

  it("crée la ligne du lecteur qui a vu avant l'accusé de réception", async () => {
    const { prisma, entries } = buildPrisma({ messages: [message({})], participants: activeParticipants });

    const result = await consume(prisma, [FLAME]);

    expect(result.consumed).toEqual([FLAME]);
    expect(entries).toEqual([
      expect.objectContaining({ messageId: FLAME, conversationId: CONV, participantId: READER, ephemeralExpiresAt: NOW }),
    ]);
  });

  it('ignore un éphémère ordinaire, un message d\'une autre conversation et le sien propre (fail-closed)', async () => {
    const { prisma, entries } = buildPrisma({
      messages: [
        message({ id: PLAIN_EPHEMERAL, effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 30 }),
        message({ id: FOREIGN_FLAME, conversationId: OTHER_CONV }),
        message({ id: OWN_FLAME, senderId: READER }),
      ],
      participants: activeParticipants,
    });

    const result = await consume(prisma, [PLAIN_EPHEMERAL, FOREIGN_FLAME, OWN_FLAME]);

    expect(result).toEqual({ consumed: [], entries: [] });
    expect(entries).toEqual([]);
  });

  it("ne repousse jamais une échéance déjà passée : un second appel rend la même ligne, inchangée", async () => {
    const earlier = new Date(NOW.getTime() - 60_000);
    const { prisma, entries } = buildPrisma({
      messages: [message({})],
      entries: [{ id: 'e-reader', messageId: FLAME, conversationId: CONV, participantId: READER, ephemeralExpiresAt: earlier }],
      participants: activeParticipants,
    });

    const result = await consume(prisma, [FLAME]);

    expect(result.consumed).toEqual([FLAME]);
    expect(result.entries[0]?.ephemeralExpiresAt).toEqual(earlier);
    expect(entries[0]?.ephemeralExpiresAt).toEqual(earlier);
  });

  it("l'expéditeur le garde tant qu'un destinataire ne l'a pas vu", async () => {
    const { prisma, messages } = buildPrisma({ messages: [message({})], participants: activeParticipants });

    await consume(prisma, [FLAME]);

    expect(messages[0]?.expiresAt).toEqual(RETENTION);
  });

  it('rapproche la destruction du contenu quand le DERNIER destinataire l\'a vu', async () => {
    const { prisma, messages } = buildPrisma({
      messages: [message({})],
      entries: [{ id: 'e-peer', messageId: FLAME, conversationId: CONV, participantId: PEER, ephemeralExpiresAt: new Date(NOW.getTime() - 5_000) }],
      participants: activeParticipants,
    });

    await consume(prisma, [FLAME]);

    expect(messages[0]?.expiresAt).toEqual(new Date(NOW.getTime() + EPHEMERAL_UNAVAILABILITY_GRACE_MS));
  });

  it('flamme-œil ET vue unique : la consommation rapproche la BULLE (expiresAt), jamais la purge du contenu (viewOnceBurnAt) (#8345)', async () => {
    const { prisma, messages } = buildPrisma({
      messages: [message({ isViewOnce: true, effectFlags: AFTER_READ | MESSAGE_EFFECT_FLAGS.VIEW_ONCE, viewOnceBurnAt: RETENTION })],
      entries: [{ id: 'e-peer', messageId: FLAME, conversationId: CONV, participantId: PEER, ephemeralExpiresAt: new Date(NOW.getTime() - 5_000) }],
      participants: activeParticipants,
    });

    const result = await consume(prisma, [FLAME]);

    expect(result.consumed).toEqual([FLAME]);
    expect(messages[0]?.expiresAt).toEqual(new Date(NOW.getTime() + EPHEMERAL_UNAVAILABILITY_GRACE_MS));
    expect(messages[0]?.viewOnceBurnAt).toEqual(RETENTION);
    expect(messages[0]?.deletedAt).toBeNull();
  });

  it("flamme-œil ET vue unique : une grâce de vue unique PLUS PROCHE n'est jamais repoussée par la flamme (#8345)", async () => {
    const soon = new Date(NOW.getTime() + 60_000);
    const { prisma, messages } = buildPrisma({
      messages: [message({ isViewOnce: true, effectFlags: AFTER_READ | MESSAGE_EFFECT_FLAGS.VIEW_ONCE, expiresAt: soon })],
      entries: [{ id: 'e-peer', messageId: FLAME, conversationId: CONV, participantId: PEER, ephemeralExpiresAt: new Date(NOW.getTime() - 5_000) }],
      participants: activeParticipants,
    });

    await consume(prisma, [FLAME]);

    expect(messages[0]?.expiresAt).toEqual(soon);
  });
});
