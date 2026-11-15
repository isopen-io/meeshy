/**
 * « EN CONVERSATION » avec l'émetteur (#14147, spec § 5) — les trois faits lus par la
 * passerelle : la conversation directe ouverte, le dernier échange, la réponse attendue.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { batteryContextReaderOf } from '../../../../services/battery/batteryContext';
import { table, type Row } from '../../../helpers/messaging-circle-world';
import { matchesMongoWhere } from '../../../helpers/mongo-where';

const EMETTEUR = '6600000000000000000000e1';
const LECTEUR = '6600000000000000000000b1';
const AUTRE = '6600000000000000000000b2';
const DIRECT = '6600000000000000000000d1';
const PART_EMETTEUR = '66000000000000000000aa01';
const PART_LECTEUR = '66000000000000000000aa02';
const NOW = new Date('2026-11-15T10:00:00.000Z');

function monde(messages: readonly Row[], viewing: ReadonlySet<string> = new Set()) {
  const message = {
    findFirst: async (args: { where?: Row; orderBy?: { createdAt: 'desc' } }) =>
      [...messages].filter((row) => matchesMongoWhere(row, args.where)).sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime())[0] ?? null,
  };
  const prisma = {
    conversation: table([{
      id: DIRECT,
      type: 'direct',
      deletedAt: null,
      participants: [{ userId: EMETTEUR, isActive: true }, { userId: LECTEUR, isActive: true }],
    }]),
    participant: table([
      { id: PART_EMETTEUR, conversationId: DIRECT, userId: EMETTEUR, isActive: true },
      { id: PART_LECTEUR, conversationId: DIRECT, userId: LECTEUR, isActive: true },
    ]),
    message,
  };
  return batteryContextReaderOf({ prisma: prisma as never, isViewing: (userId, conversationId) => viewing.has(`${userId}:${conversationId}`) });
}

const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000);

describe('le contexte d\'un lecteur', () => {
  it('le dernier message de l\'émetteur donne l\'heure de l\'échange, sans réponse attendue', async () => {
    const read = monde([{ conversationId: DIRECT, senderId: PART_EMETTEUR, createdAt: at(10), deletedAt: null }]);
    expect((await read({ emitterId: EMETTEUR, readerIds: [LECTEUR], now: NOW })).get(LECTEUR)).toEqual({
      roomOpen: false,
      lastExchangeAt: at(10).toISOString(),
      awaitingReply: false,
    });
  });

  it('le dernier message du LECTEUR attend une réponse', async () => {
    const read = monde([
      { conversationId: DIRECT, senderId: PART_EMETTEUR, createdAt: at(300), deletedAt: null },
      { conversationId: DIRECT, senderId: PART_LECTEUR, createdAt: at(120), deletedAt: null },
    ]);
    expect((await read({ emitterId: EMETTEUR, readerIds: [LECTEUR], now: NOW })).get(LECTEUR)?.awaitingReply).toBe(true);
  });

  it('une réponse attendue depuis plus de 24 h ne compte plus', async () => {
    const read = monde([{ conversationId: DIRECT, senderId: PART_LECTEUR, createdAt: at(25 * 60), deletedAt: null }]);
    expect((await read({ emitterId: EMETTEUR, readerIds: [LECTEUR], now: NOW })).get(LECTEUR)?.awaitingReply).toBe(false);
  });

  it('un message effacé ne compte pas', async () => {
    const read = monde([{ conversationId: DIRECT, senderId: PART_LECTEUR, createdAt: at(1), deletedAt: at(0) }]);
    expect((await read({ emitterId: EMETTEUR, readerIds: [LECTEUR], now: NOW })).get(LECTEUR)).toEqual({ roomOpen: false, lastExchangeAt: null, awaitingReply: false });
  });

  it('la conversation directe ouverte au premier plan', async () => {
    const read = monde([], new Set([`${LECTEUR}:${DIRECT}`]));
    expect((await read({ emitterId: EMETTEUR, readerIds: [LECTEUR], now: NOW })).get(LECTEUR)?.roomOpen).toBe(true);
  });

  it('sans conversation directe, rien de tout cela', async () => {
    const read = monde([]);
    expect((await read({ emitterId: EMETTEUR, readerIds: [AUTRE], now: NOW })).get(AUTRE)).toEqual({ roomOpen: false, lastExchangeAt: null, awaitingReply: false });
  });
});
