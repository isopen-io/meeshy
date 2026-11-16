/**
 * `POST /conversations/:id/messages/after-read/consume` — flamme-œil (#8302).
 *
 * Le lecteur a vu puis quitté la conversation : ses flammes-œil disparaissent
 * chez LUI (room personnelle), jamais chez un autre lecteur ni dans la room de
 * la conversation. Le double Prisma honore les filtres qu'il reçoit.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../services/notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => undefined,
}));

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn<any>();
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

const mockStoredPrivacy = new Map<string, { showReadReceipts?: boolean }>();
jest.mock('../../../services/preferences/privacy-cache', () => ({
  ...(jest.requireActual('../../../services/preferences/privacy-cache') as Record<string, unknown>),
  loadPrivacyPreferencesCached: async (_prisma: unknown, userIds: string[]) =>
    new Map(userIds.map((id) => [id, mockStoredPrivacy.get(id) ?? {}])),
}));

import { registerMessageAfterReadRoutes } from '../../../routes/conversations/messages-after-read';

const CONV = '507f1f77bcf86cd799439011';
const READER_USER = '507f1f77bcf86cd799439022';
const READER = '507f1f77bcf86cd7994390a1';
const PEER = '507f1f77bcf86cd7994390a2';
const ANON = '507f1f77bcf86cd7994390a3';
const SENDER = '507f1f77bcf86cd7994390af';
const FLAME = '507f1f77bcf86cd799439031';
const PLAIN = '507f1f77bcf86cd799439032';
const AFTER_READ = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;

type Row = Record<string, any>;
const isAbsent = (value: unknown) => value === undefined || value === null;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((c) => matches(row, c));
    if (key === 'AND') return (cond as Row[]).every((c) => matches(row, c));
    const value = row[key];
    if (cond === null) return isAbsent(value);
    if (typeof cond !== 'object' || cond instanceof Date) return value === cond;
    if ('in' in cond) return (cond.in as unknown[]).includes(value);
    if ('isSet' in cond) return cond.isSet ? value !== undefined : value === undefined;
    if ('not' in cond) return cond.not === null ? !isAbsent(value) : value !== cond.not;
    if ('gt' in cond) return value instanceof Date && value.getTime() > cond.gt.getTime();
    return false;
  });
}

function buildDb(options: { othersConsumedAt?: Date } = {}) {
  const others = options.othersConsumedAt ? { ephemeralExpiresAt: options.othersConsumedAt } : {};
  const messages: Row[] = [
    { id: FLAME, conversationId: CONV, senderId: SENDER, effectFlags: AFTER_READ, expiresAt: new Date('2099-01-01') },
    { id: PLAIN, conversationId: CONV, senderId: SENDER, effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 30 },
  ];
  const entries: Row[] = [
    { id: 'e-reader', messageId: FLAME, conversationId: CONV, participantId: READER },
    { id: 'e-peer', messageId: FLAME, conversationId: CONV, participantId: PEER, ...others },
    ...(options.othersConsumedAt
      ? [{ id: 'e-anon', messageId: FLAME, conversationId: CONV, participantId: ANON, ...others }]
      : []),
  ];
  const participants: Row[] = [
    { id: SENDER, conversationId: CONV, userId: 'sender-user', isActive: true },
    { id: READER, conversationId: CONV, userId: READER_USER, isActive: true, role: 'MEMBER' },
    { id: PEER, conversationId: CONV, userId: 'peer-user', isActive: true },
    { id: ANON, conversationId: CONV, userId: null, isActive: true, role: 'MEMBER' },
  ];
  const where = (rows: Row[]) => async ({ where: w }: Row) => rows.filter((r) => matches(r, w));
  const updateMany = (rows: Row[]) => async ({ where: w, data }: Row) => {
    const hit = rows.filter((r) => matches(r, w));
    hit.forEach((r) => Object.assign(r, data));
    return { count: hit.length };
  };
  const prisma = {
    message: { findMany: where(messages), updateMany: updateMany(messages) },
    messageStatusEntry: {
      findMany: where(entries),
      findFirst: async ({ where: w }: Row) => entries.find((e) => matches(e, w)) ?? null,
      updateMany: updateMany(entries),
      create: async ({ data }: Row) => {
        const row = { id: `e-${entries.length}`, ...data };
        entries.push(row);
        return row;
      },
    },
    participant: {
      findMany: where(participants),
      findFirst: async ({ where: w }: Row) => participants.find((p) => matches(p, w)) ?? null,
      findUnique: async ({ where: w }: Row) => participants.find((p) => p.id === w.id) ?? null,
    },
    notification: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
  };
  return { prisma: prisma as any, entries, messages };
}

async function buildApp(db: ReturnType<typeof buildDb>, caller: 'member' | 'anonymous' = 'member') {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const emitted: Array<{ room: string | string[]; event: string; data: unknown }> = [];
  const enqueue = jest.fn(async (_params: unknown) => undefined);
  (app as any).socketIOHandler = {
    getManager: () => ({
      getIO: () => ({
        to: (room: string | string[]) => ({ emit: (event: string, data: unknown) => emitted.push({ room, event, data }) }),
      }),
      enqueueOfflineMessageMutation: enqueue,
      emitUnreadCountsToRecipients: async () => undefined,
    }),
  };
  const auth = async (req: any) => {
    req.authContext =
      caller === 'anonymous'
        ? { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: 'anon-token', participantId: ANON }
        : { type: 'registered', isAuthenticated: true, isAnonymous: false, userId: READER_USER };
  };
  registerMessageAfterReadRoutes(app, db.prisma, auth);
  await app.ready();
  return { app, emitted, enqueue };
}

const consume = (app: any, messageIds: unknown) =>
  app.inject({ method: 'POST', url: `/conversations/${CONV}/messages/after-read/consume`, payload: { messageIds } });

beforeEach(() => {
  mockStoredPrivacy.clear();
  mockResolveConversationId.mockResolvedValue(CONV);
  mockCanAccessConversation.mockResolvedValue(true);
});

describe('POST /conversations/:id/messages/after-read/consume', () => {
  it('fait disparaître la flamme-œil chez l\'appelant seul, et rend { consumed }', async () => {
    const db = buildDb();
    const { app, emitted } = await buildApp(db);
    try {
      const res = await consume(app, [FLAME, PLAIN]);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ success: true, data: { consumed: [FLAME] } });
      expect(emitted).toEqual([
        { room: `user:${READER_USER}`, event: 'message:expired', data: { messageId: FLAME, conversationId: CONV } },
      ]);
      expect(db.entries.find((e) => e.id === 'e-peer')?.ephemeralExpiresAt).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('le DERNIER lecteur qui quitte brûle la flamme-œil sous les yeux de tous, expéditeur compris (#18556)', async () => {
    const db = buildDb({ othersConsumedAt: new Date(Date.now() - 60_000) });
    const { app, emitted, enqueue } = await buildApp(db);
    try {
      const res = await consume(app, [FLAME]);

      expect(res.json().data).toEqual({ consumed: [FLAME] });
      expect(emitted).toContainEqual({
        room: [`conversation:${CONV}`, 'user:sender-user', `user:${READER_USER}`, 'user:peer-user', `user:${ANON}`],
        event: 'message:expired',
        data: { messageId: FLAME, conversationId: CONV },
      });
      expect(enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'expired', messageId: FLAME, actorUserId: null }),
      );
    } finally {
      await app.close();
    }
  });

  it('le feu annoncé est GRAVÉ sur la ligne de l’expéditeur, à l’instant du dernier départ, et lui est annoncé dans sa room (#18556)', async () => {
    const db = buildDb({ othersConsumedAt: new Date(Date.now() - 60_000) });
    const { app, emitted } = await buildApp(db);
    try {
      await consume(app, [FLAME]);

      const author = db.entries.find((e) => e.participantId === SENDER);
      const reader = db.entries.find((e) => e.id === 'e-reader');
      expect(author?.ephemeralExpiresAt).toEqual(reader?.ephemeralExpiresAt);
      expect(author?.ephemeralExpiredAt).toBeInstanceOf(Date);
      expect(emitted).toContainEqual({
        room: 'user:sender-user',
        event: 'message:expired',
        data: { messageId: FLAME, conversationId: CONV },
      });
    } finally {
      await app.close();
    }
  });

  it('un rejeu après le feu n’annonce rien de plus : la gravure est write-once (#18556)', async () => {
    const db = buildDb({ othersConsumedAt: new Date(Date.now() - 60_000) });
    const { app, emitted, enqueue } = await buildApp(db);
    try {
      await consume(app, [FLAME]);
      const announced = emitted.length;
      await consume(app, [FLAME]);

      expect(emitted).toHaveLength(announced);
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(db.entries.filter((e) => e.participantId === SENDER)).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('un feu retenu au premier appel s’annonce au rejeu, une fois la retenue levée (#18556)', async () => {
    mockStoredPrivacy.set('peer-user', { showReadReceipts: false });
    const db = buildDb({ othersConsumedAt: new Date(Date.now() - 60_000) });
    const { app, emitted, enqueue } = await buildApp(db);
    try {
      await consume(app, [FLAME]);
      expect(db.entries.some((e) => e.participantId === SENDER)).toBe(false);

      mockStoredPrivacy.clear();
      await consume(app, [FLAME]);

      expect(db.entries.find((e) => e.participantId === SENDER)?.ephemeralExpiresAt).toBeInstanceOf(Date);
      expect(emitted.map((e) => e.room)).toContainEqual('user:sender-user');
      expect(enqueue).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('copie bornée dont un décompte COURT ENCORE : rien ne brûle chez les autres avant leur heure (#18556)', async () => {
    const db = buildDb({ othersConsumedAt: new Date(Date.now() + 600_000) });
    const { app, emitted, enqueue } = await buildApp(db);
    try {
      await consume(app, [FLAME]);

      expect(emitted.map((e) => e.room)).toEqual([`user:${READER_USER}`]);
      expect(enqueue).not.toHaveBeenCalled();
      const author = db.entries.find((e) => e.participantId === SENDER);
      expect(author?.ephemeralExpiresAt?.getTime()).toBeGreaterThan(Date.now());
      expect(author?.ephemeralExpiredAt).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('un destinataire qui a coupé ses accusés de lecture retient le feu anticipé : l’expéditeur garde la bulle (#18556)', async () => {
    mockStoredPrivacy.set('peer-user', { showReadReceipts: false });
    const db = buildDb({ othersConsumedAt: new Date(Date.now() - 60_000) });
    const { app, emitted, enqueue } = await buildApp(db);
    try {
      const res = await consume(app, [FLAME]);

      expect(res.json().data).toEqual({ consumed: [FLAME] });
      expect(emitted.map((e) => e.room)).toEqual([`user:${READER_USER}`]);
      expect(enqueue).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('tant qu’un lecteur n’a pas quitté, la flamme-œil ne brûle que chez celui qui sort', async () => {
    const db = buildDb();
    const { app, emitted, enqueue } = await buildApp(db);
    try {
      await consume(app, [FLAME]);

      expect(emitted.map((e) => e.room)).toEqual([`user:${READER_USER}`]);
      expect(enqueue).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('est idempotente : un second appel rend la même réponse sans rien réannoncer', async () => {
    const db = buildDb();
    const { app, emitted } = await buildApp(db);
    try {
      await consume(app, [FLAME]);
      const again = await consume(app, [FLAME]);

      expect(again.json().data).toEqual({ consumed: [FLAME] });
      expect(emitted).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('sert un invité de lien partagé par sa room de participant', async () => {
    const db = buildDb();
    const { app, emitted } = await buildApp(db, 'anonymous');
    try {
      const res = await consume(app, [FLAME]);

      expect(res.json().data).toEqual({ consumed: [FLAME] });
      expect(emitted).toEqual([
        { room: `user:${ANON}`, event: 'message:expired', data: { messageId: FLAME, conversationId: CONV } },
      ]);
    } finally {
      await app.close();
    }
  });

  it('refuse un appelant sans accès à la conversation', async () => {
    mockCanAccessConversation.mockResolvedValue(false);
    const db = buildDb();
    const { app, emitted } = await buildApp(db);
    try {
      expect((await consume(app, [FLAME])).statusCode).toBe(403);
      expect(emitted).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it.each([[[]], [['pas-un-id']], [Array.from({ length: 201 }, () => FLAME)]])(
    'refuse un corps invalide (%#)',
    async (messageIds) => {
      const db = buildDb();
      const { app } = await buildApp(db);
      try {
        expect((await consume(app, messageIds)).statusCode).toBe(400);
      } finally {
        await app.close();
      }
    },
  );
});
