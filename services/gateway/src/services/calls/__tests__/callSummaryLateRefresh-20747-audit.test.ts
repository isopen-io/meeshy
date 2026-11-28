/**
 * Audit adversarial de #20747 — deux témoins que le lot n'avait pas.
 *
 * 1. L'ORDRE des lectures : le témoin R2 de `callSummaryLateRefresh-20747`
 *    déclenche l'écriture concurrente après la PREMIÈRE lecture de la
 *    `CallSession` (l'ancre), si bien qu'il passe encore quand l'instantané
 *    des mesures est relu AVANT la bulle. Ici l'écriture concurrente tombe
 *    juste après la lecture des FAITS : seule la lecture de la bulle avant
 *    les faits empêche l'écrasement.
 *
 * 2. Le PERDANT du compare-and-set : quand deux instances lisent la même
 *    bulle et que celle qui tient l'instantané le plus ANCIEN écrit la
 *    première, la seconde échoue en `P2025` et renonce — le relevé le plus
 *    récent n'atteint jamais la bulle. Témoin `it.failing` : il documente le
 *    défaut restant sans rougir la CI, et rougira le jour où le perdant
 *    relira et réessaiera (retirer alors `.failing`).
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { Prisma } from '@meeshy/shared/prisma/client';
import { buildCallSummaryMetadata, callSummaryClientMessageId } from '@meeshy/shared/utils/call-summary';
import { createLateCallSummaryRefresher } from '../callSummaryLateRefresh';

const CALL_ID = '6650000000000000000000c8';
const GROUP_ID = '6650000000000000000000d8';
const INITIATOR_ID = '6650000000000000000000e8';

type Row = Record<string, unknown>;

const endedCall = (bytesReceivedTotal: number): Row => ({
  id: CALL_ID,
  conversationId: GROUP_ID,
  originConversationId: null,
  initiatorId: INITIATOR_ID,
  status: 'ended',
  endReason: 'completed',
  duration: 60,
  answeredAt: new Date('2026-11-27T10:00:00Z'),
  metadata: { type: 'audio' },
  bytesSent: 1_000,
  bytesReceived: bytesReceivedTotal,
  bytesSentTotal: 1_000,
  bytesReceivedTotal,
  networkQuality: 'good'
});

const terminalMetadata = (call: Row) => buildCallSummaryMetadata({
  status: 'ended',
  endReason: 'completed',
  callType: 'audio',
  durationSeconds: 60,
  callId: CALL_ID,
  initiatorId: INITIATOR_ID,
  bytesSent: call.bytesSentTotal as number,
  bytesReceived: call.bytesReceivedTotal as number,
  networkQuality: call.networkQuality as string,
  answeredAt: call.answeredAt as Date
});

type Store = { call: Row; bubble: Row };

const isFactsRead = (args: { select?: Row }): boolean => args.select?.bytesSentTotal === true;

const instance = (store: Store, hooks: { afterFactsRead?: () => Promise<void>; beforeUpdate?: () => Promise<void> } = {}) => {
  const prisma = {
    callSession: {
      findUnique: jest.fn(async (args: { select?: Row }) => {
        const snapshot = { ...store.call };
        if (isFactsRead(args)) await hooks.afterFactsRead?.();
        return snapshot;
      })
    },
    message: {
      findFirst: jest.fn(async (args: { where: Row }) =>
        args.where.conversationId === store.bubble.conversationId ? { ...store.bubble } : null),
      update: jest.fn(async (args: { where: { id: string; updatedAt: Date }; data: { metadata: unknown } }) => {
        await hooks.beforeUpdate?.();
        if ((store.bubble.updatedAt as Date).getTime() !== args.where.updatedAt.getTime()) {
          throw new Prisma.PrismaClientKnownRequestError('Record to update not found.', { code: 'P2025', clientVersion: 'test' });
        }
        store.bubble = { ...store.bubble, metadata: args.data.metadata, updatedAt: new Date((store.bubble.updatedAt as Date).getTime() + 1_000) };
        return { ...store.bubble };
      })
    },
    participant: { findMany: jest.fn(async () => []) }
  };
  const broadcast = jest.fn(async (_message: unknown, _conversationId: string) => undefined);
  const refresh = createLateCallSummaryRefresher({ prisma: () => prisma as never, broadcastEdited: () => broadcast, sealed: async () => false });
  return { prisma, broadcast, refresh };
};

const postedBubble = (): Row => ({
  id: 'm-group',
  conversationId: GROUP_ID,
  clientMessageId: callSummaryClientMessageId(CALL_ID),
  content: 'Appel audio · 01:00',
  metadata: terminalMetadata(endedCall(2_000)),
  updatedAt: new Date('2026-11-27T10:01:00Z'),
  sender: null,
  attachments: []
});

const bytesTotal = (store: Store): unknown => (store.bubble.metadata as Row).bytesTotal;

describe('#20747 audit — la bulle est lue AVANT l’instantané des mesures', () => {
  it('une écriture concurrente juste après la lecture des faits n’est pas écrasée par l’instantané plus ancien', async () => {
    const store: Store = { call: endedCall(3_000), bubble: postedBubble() };
    const a = instance(store, {
      afterFactsRead: async () => {
        store.call = endedCall(9_000);
        store.bubble = { ...store.bubble, metadata: terminalMetadata(store.call), updatedAt: new Date('2026-11-27T10:01:30Z') };
      }
    });

    await a.refresh(CALL_ID);

    expect(bytesTotal(store)).toBe(10_000);
    expect(a.broadcast).not.toHaveBeenCalled();
  });
});

describe('#20747 audit — le perdant du compare-and-set ne perd pas le relevé le plus récent', () => {
  it.failing('l’instance au relevé le plus récent finit par écrire, même quand l’autre a écrit la première', async () => {
    const store: Store = { call: endedCall(3_000), bubble: postedBubble() };
    let releaseB: () => void = () => undefined;
    const bMayWrite = new Promise<void>((resolve) => { releaseB = resolve; });
    let bReachedUpdate: () => void = () => undefined;
    const bAtUpdate = new Promise<void>((resolve) => { bReachedUpdate = resolve; });
    const b = instance(store, { beforeUpdate: async () => { bReachedUpdate(); await bMayWrite; } });
    let bDone: Promise<void> = Promise.resolve();
    const a = instance(store, {
      afterFactsRead: async () => {
        store.call = endedCall(9_000);
        bDone = b.refresh(CALL_ID);
        await bAtUpdate;
      }
    });

    await a.refresh(CALL_ID);
    releaseB();
    await bDone;

    expect(bytesTotal(store)).toBe(10_000);
  });
});
