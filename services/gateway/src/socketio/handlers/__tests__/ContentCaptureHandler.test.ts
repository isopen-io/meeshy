/**
 * `message:capture-detected` (#9617) — le transport socket. Il refuse ce qui
 * n'est pas authentifié, mal formé ou hors participation, sans rien écrire ;
 * il remet le reste au jugement partagé et rend son accusé.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { CLIENT_EVENTS, RATE_LIMIT_REFUSAL_MESSAGE } from '@meeshy/shared/types/socketio-events';
import type { ContentCaptureAck } from '@meeshy/shared/types/content-capture';

import { handleContentCapture, listenContentCapture, type ContentCaptureHandlerDeps } from '../ContentCaptureHandler';
import type { SocketUser } from '../../utils/socket-helpers';
import type { MeeshySocket } from '../../typed-socket';

const CONV = '507f1f77bcf86cd799439011';
const PARTICIPANT = '507f1f77bcf86cd7994390a1';
const USER = '507f1f77bcf86cd7994390c1';
const SENDER = '507f1f77bcf86cd7994390af';
const FLAME = '507f1f77bcf86cd799439031';
const NOW = new Date('2026-10-07T12:00:00.000Z');

const socketUser: SocketUser = {
  id: USER,
  socketId: 'socket-1',
  isAnonymous: false,
  language: 'fr',
  resolvedLanguages: ['fr'],
  userId: USER,
};

function harness(overrides: { authenticated?: boolean; member?: boolean; allowed?: boolean; closed?: boolean } = {}) {
  const created: Record<string, unknown>[] = [];
  const broadcasts: unknown[] = [];
  const prisma = {
    conversation: {
      findUnique: async () => ({ id: CONV, identifier: 'mon-groupe', isActive: true, closedAt: overrides.closed ? NOW : null }),
      update: async () => ({}),
    },
    participant: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (overrides.member === false) return null;
        if (where.userId === USER && where.conversationId === CONV) return { id: PARTICIPANT, displayName: 'Alice', nickname: null };
        if (where.id === PARTICIPANT && where.conversationId === CONV) {
          return { id: PARTICIPANT, userId: USER, displayName: 'Alice', nickname: null, user: { username: 'alice' } };
        }
        return null;
      },
    },
    message: {
      findMany: async () => [
        {
          id: FLAME,
          conversationId: CONV,
          createdAt: new Date('2026-10-07T11:58:00Z'),
          deletedAt: null,
          senderId: SENDER,
          isViewOnce: false,
          isBlurred: false,
          effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL,
          ephemeralDuration: 60,
          expiresAt: null,
          attachments: [],
        },
      ],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: 'sys-1', createdAt: NOW };
        created.push(row);
        return row;
      },
    },
    messageStatusEntry: {
      findFirst: async () => ({
        readAt: NOW,
        viewedOnceAt: null,
        ephemeralExpiresAt: null,
      }),
    },
  } as unknown as PrismaClient;

  const keys = new Set<string>();
  const deps: ContentCaptureHandlerDeps = {
    prisma,
    socketToUser: new Map(overrides.authenticated === false ? [] : [['socket-1', USER]]),
    connectedUsers: new Map([[USER, socketUser]]),
    broadcast: async (message) => {
      broadcasts.push(message);
    },
    dedup: {
      setnx: async (key) => (keys.has(key) ? false : (keys.add(key), true)),
      del: async (key) => {
        keys.delete(key);
      },
    },
    limiter: { checkLimit: async () => overrides.allowed ?? true },
    mayRead: async () => true,
    now: () => NOW,
  };
  return { deps, created, broadcasts };
}

const payload = (overrides: Record<string, unknown> = {}) => ({
  conversationId: 'mon-groupe',
  messageIds: [FLAME],
  kind: 'screenshot',
  captureId: 'capture-0001',
  ...overrides,
});

describe('handleContentCapture', () => {
  it('annonce la capture, résout l’identifiant lisible de la conversation et rend les messages annoncés', async () => {
    const h = harness();
    const ack = await handleContentCapture('socket-1', payload(), h.deps);
    expect(ack).toEqual({ success: true, data: { noticedMessageIds: [FLAME] } });
    expect(h.created).toHaveLength(1);
    expect(h.created[0]).toMatchObject({ conversationId: CONV, senderId: PARTICIPANT, messageType: 'system' });
    expect(h.broadcasts).toHaveLength(1);
  });

  it('refuse un socket non authentifié', async () => {
    const h = harness({ authenticated: false });
    expect(await handleContentCapture('socket-1', payload(), h.deps)).toMatchObject({ success: false, code: 'UNAUTHENTICATED' });
    expect(h.created).toHaveLength(0);
  });

  it('refuse une charge invalide', async () => {
    const h = harness();
    expect(await handleContentCapture('socket-1', payload({ kind: 'photo' }), h.deps)).toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
    });
    expect(await handleContentCapture('socket-1', undefined, h.deps)).toMatchObject({ success: false });
    expect(h.created).toHaveLength(0);
  });

  it('refuse un appelant qui n’est pas participant', async () => {
    const h = harness({ member: false });
    expect(await handleContentCapture('socket-1', payload(), h.deps)).toMatchObject({ success: false, code: 'NOT_A_PARTICIPANT' });
    expect(h.created).toHaveLength(0);
  });

  it('refuse dans une conversation close', async () => {
    const h = harness({ closed: true });
    expect(await handleContentCapture('socket-1', payload(), h.deps)).toMatchObject({ success: false, code: 'CONVERSATION_CLOSED' });
    expect(h.created).toHaveLength(0);
  });

  it('rend le refus de débit PARTAGÉ quand le budget est épuisé', async () => {
    const h = harness({ allowed: false });
    expect(await handleContentCapture('socket-1', payload(), h.deps)).toEqual({
      success: false,
      error: RATE_LIMIT_REFUSAL_MESSAGE,
      code: 'RATE_LIMITED',
    });
  });
});

describe('listenContentCapture', () => {
  it('écoute message:capture-detected et répond par l’accusé', async () => {
    const h = harness();
    const listeners = new Map<string, (data: unknown, callback?: (ack: ContentCaptureAck) => void) => void>();
    const socket = {
      id: 'socket-1',
      on: (event: string, listener: (data: unknown, callback?: (ack: ContentCaptureAck) => void) => void) => {
        listeners.set(event, listener);
      },
    } as unknown as MeeshySocket;

    listenContentCapture(socket, h.deps);
    const ack = await new Promise<ContentCaptureAck>((resolve) =>
      listeners.get(CLIENT_EVENTS.MESSAGE_CAPTURE_DETECTED)?.(payload(), resolve),
    );
    expect(ack).toEqual({ success: true, data: { noticedMessageIds: [FLAME] } });
  });
});
