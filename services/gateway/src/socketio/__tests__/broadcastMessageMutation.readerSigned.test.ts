/**
 * #9646 — `message:edited` d'un message protégé qui porte des pièces part par
 * destinataire, chacune signée pour lui : les clients REMPLACENT leur message
 * par la charge (`{ ...cached, ...edited }`), une diffusion de room y
 * réécrirait l'adresse nue.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

import { broadcastMessageMutation } from '../broadcastMessageMutation';
import { checkReaderFileToken, readSigningKeys } from '../../services/attachments/readerFileSignature';

const KEY = '2026/10/68f2a81417a557e8ce4ddfc1/photo_8b1f0c1e.jpg';
const A = { id: 'cccccccccccccccccccccc01', userId: 'bbbbbbbbbbbbbbbbbbbbbb01' };
const B = { id: 'cccccccccccccccccccccc02', userId: 'bbbbbbbbbbbbbbbbbbbbbb02' };
const piece = { id: 'aaaaaaaaaaaaaaaaaaaaaaa1', fileUrl: KEY, isViewOnce: false, isBlurred: false, effectFlags: 0 };

function setup(row: Record<string, unknown>) {
  const emitted: Array<{ room: string; event: string; payload: { attachments?: Array<{ fileUrl: string }>; quoteSealed?: boolean } }> = [];
  const target = (room: string) => ({
    emit: (event: string, payload: never) => emitted.push({ room, event, payload }),
    except: () => target(room),
  });
  const prisma = {
    participant: { findMany: jest.fn(async () => [A, B]) },
    message: { findUnique: jest.fn(async () => row), findFirst: jest.fn(async () => null) },
    conversationShareLink: { findMany: jest.fn(async () => []) },
  };
  const manager = {
    getIO: () => ({ to: target }),
    enqueueOfflineMessageMutation: jest.fn(async () => undefined),
    emitUnreadCountsToRecipients: jest.fn(async () => undefined),
  };
  return { emitted, prisma, manager };
}

const readerOf = (url: string | undefined) => {
  const match = /^\/api\/v1\/attachments\/signed\/([^/]+)\/([^/]+)$/.exec(url ?? '');
  if (!match) return null;
  const check = checkReaderFileToken({ token: match[1] as string, storageKey: decodeURIComponent(match[2] as string), keys: readSigningKeys(), now: new Date() });
  return check.kind === 'valid' ? check.readerParticipantId : null;
};

beforeEach(() => {
  process.env.ATTACHMENT_URL_SIGNING_KEY = Buffer.alloc(32, 9).toString('base64');
});
afterEach(() => {
  delete process.env.ATTACHMENT_URL_SIGNING_KEY;
});

const edited = (payload: Record<string, unknown>) => payload as never;

describe('broadcastMessageMutation — message:edited d’un message protégé', () => {
  it('une émission par participant admis, ses pièces signées pour lui, aucune à la room', async () => {
    const { emitted, prisma, manager } = setup({ isViewOnce: true, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null });
    await broadcastMessageMutation({
      prisma: prisma as never,
      manager: manager as never,
      conversationId: 'conv-1',
      actorUserId: A.userId,
      messageId: 'msg-1',
      eventType: 'edited',
      payload: edited({ id: 'msg-1', content: 'corrigé', attachments: [piece] }),
    });
    const live = emitted.filter((e) => e.event === SERVER_EVENTS.MESSAGE_EDITED);
    expect(live.map((e) => e.room)).toEqual([`user:${A.userId}`, `user:${B.userId}`]);
    expect(live.map((e) => readerOf(e.payload.attachments?.[0]?.fileUrl))).toEqual([A.id, B.id]);
  });

  it('garde la variante scellée d’un lecteur masqué — sans pièce ni citation — et signe pour les autres', async () => {
    const { emitted, prisma, manager } = setup({ isViewOnce: true, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null });
    await broadcastMessageMutation({
      prisma: prisma as never,
      manager: manager as never,
      conversationId: 'conv-1',
      actorUserId: A.userId,
      messageId: 'msg-1',
      eventType: 'edited',
      sealedQuoteAudience: new Map([[B.userId, new Date()]]),
      payload: edited({ id: 'msg-1', content: 'corrigé', attachments: [piece], replyTo: { id: 'q', content: 'secret' } }),
    });
    const toB = emitted.find((e) => e.event === SERVER_EVENTS.MESSAGE_EDITED && e.room === `user:${B.userId}`);
    expect(toB?.payload.attachments).toEqual([]);
    expect(JSON.stringify(toB?.payload)).not.toContain('secret');
    const toA = emitted.find((e) => e.event === SERVER_EVENTS.MESSAGE_EDITED && e.room === `user:${A.userId}`);
    expect(readerOf(toA?.payload.attachments?.[0]?.fileUrl)).toBe(A.id);
  });

  it('diffuse à la room, adresses intactes, un message ordinaire', async () => {
    const { emitted, prisma, manager } = setup({ isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null });
    await broadcastMessageMutation({
      prisma: prisma as never,
      manager: manager as never,
      conversationId: 'conv-1',
      actorUserId: A.userId,
      messageId: 'msg-1',
      eventType: 'edited',
      payload: edited({ id: 'msg-1', content: 'corrigé', attachments: [piece] }),
    });
    const live = emitted.filter((e) => e.event === SERVER_EVENTS.MESSAGE_EDITED);
    expect(live.map((e) => e.room)).toEqual(['conversation:conv-1']);
    expect(live[0]?.payload.attachments?.[0]?.fileUrl).toBe(KEY);
  });
});
