/**
 * #9646 — `message:new` d'un message protégé part PAR DESTINATAIRE, chacun avec
 * ses adresses signées ; un message ordinaire garde sa diffusion de room.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { checkReaderFileToken, readSigningKeys, readerFileUrlSigner } from '../../services/attachments/readerFileSignature';
import { emitMessageNew, type MessageNewIO } from '../messageNewEmission';
import { protectionOfFullMessageRow, readerSignedTargets, signedForReader } from '../readerSignedDelivery';

const KEYS = readSigningKeys({ ATTACHMENT_URL_SIGNING_KEY: Buffer.alloc(32, 2).toString('base64') });
const NOW = new Date();
const SIGNER = readerFileUrlSigner({ keys: KEYS, now: NOW });
const CONVERSATION = 'dddddddddddddddddddddd01';
const SENDER = 'cccccccccccccccccccccc02';
const KEY = '2026/10/68f2a81417a557e8ce4ddfc1/photo_8b1f0c1e.jpg';
const PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa1';

type Row = { id: string; userId: string | null; isActive: boolean; bannedAt?: Date | null; shareLinkId?: string | null; conversationId: string };

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === 'OR') return (condition as Record<string, unknown>[]).some((branch) => matches(row, branch));
    if (condition !== null && typeof condition === 'object' && 'isSet' in condition) {
      return (condition as { isSet: boolean }).isSet === (row[field] !== undefined);
    }
    return row[field] === condition;
  });
}

function prismaWith(rows: Row[]) {
  return {
    participant: { findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where))) },
    conversationShareLink: { findMany: jest.fn(async () => [{ id: 'l-old', expiresAt: new Date(NOW.getTime() - 1) }]) },
  };
}

const member = (n: number, over: Partial<Row> = {}): Row => ({
  id: `cccccccccccccccccccccc${String(n).padStart(2, '0')}`,
  userId: `bbbbbbbbbbbbbbbbbbbbbb${String(n).padStart(2, '0')}`,
  isActive: true,
  conversationId: CONVERSATION,
  ...over,
});

const PROTECTED = protectionOfFullMessageRow({ isViewOnce: true, effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE });
const ORDINARY = protectionOfFullMessageRow({ isViewOnce: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null });
const attachments = [{ id: PIECE, fileUrl: KEY, thumbnailUrl: null, isViewOnce: false, isBlurred: false, effectFlags: 0 }];

function recordingIO() {
  const emitted: Array<{ room: string; except: string[]; payload: { attachments: Array<{ fileUrl: string }> } }> = [];
  const operator = (room: string, except: string[] = []): ReturnType<MessageNewIO['to']> => ({
    except: (rooms) => operator(room, [...except, ...(Array.isArray(rooms) ? rooms : [rooms])]),
    emit: (_event, payload) => emitted.push({ room, except, payload: payload as never }),
  });
  return { io: { to: (room: string) => operator(room) } as MessageNewIO, emitted };
}

const readerOf = (url: string) => {
  const [, token, key] = /^\/api\/v1\/attachments\/signed\/([^/]+)\/([^/]+)$/.exec(url) as RegExpExecArray;
  const check = checkReaderFileToken({ token: token as string, storageKey: decodeURIComponent(key as string), keys: KEYS, now: NOW });
  return check.kind === 'valid' ? check.readerParticipantId : null;
};

describe('readerSignedTargets', () => {
  it('rend null, sans requête, pour un message ordinaire ou sans clé', async () => {
    const prisma = prismaWith([member(1)]);
    expect(await readerSignedTargets(prisma as never, { conversationId: CONVERSATION, message: ORDINARY, attachments, signer: SIGNER, now: NOW })).toBeNull();
    expect(await readerSignedTargets(prisma as never, { conversationId: CONVERSATION, message: PROTECTED, attachments, signer: null, now: NOW })).toBeNull();
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });

  it("n'adresse ni un BANNI resté marqué actif, ni un parti, ni un invité au lien échu", async () => {
    const prisma = prismaWith([
      member(1),
      member(3, { bannedAt: new Date(NOW.getTime() - 60_000) }),
      member(4, { isActive: false }),
      member(5, { userId: null, shareLinkId: 'l-old' }),
      member(6, { bannedAt: null }),
    ]);
    const targets = await readerSignedTargets(prisma as never, { conversationId: CONVERSATION, message: PROTECTED, attachments, signer: SIGNER, now: NOW });
    expect(targets?.map((t) => t.participantId)).toEqual([member(1).id, member(6).id]);
  });
});

describe('emitMessageNew — remise par lecteur', () => {
  it('une émission par participant admis, chacune signée pour LUI, aucune à la room ; un banni ne reçoit rien', async () => {
    const prisma = prismaWith([member(2, { id: SENDER }), member(1), member(3, { bannedAt: new Date(NOW.getTime() - 1) })]);
    const targets = await readerSignedTargets(prisma as never, { conversationId: CONVERSATION, message: PROTECTED, attachments, signer: SIGNER, now: NOW });
    const { io, emitted } = recordingIO();
    const peerPayload = { id: 'm1', conversationId: CONVERSATION, attachments } as never;
    emitMessageNew({
      io,
      room: `conversation:${CONVERSATION}`,
      senderPayload: { ...(peerPayload as object), clientMessageId: 'cid' } as never,
      peerPayload,
      senderUserId: member(2).userId,
      senderParticipantId: SENDER,
      hiddenKeys: [],
      payloadForKey: () => peerPayload,
      readerSigned: { targets: targets ?? [], signFor: (payload, participantId) => signedForReader(payload, { message: PROTECTED, participantId, signer: SIGNER }) },
    });
    expect(emitted.map((e) => e.room)).toEqual([`user:${member(2).userId}`, `user:${member(1).userId}`]);
    expect(emitted.map((e) => readerOf(e.payload.attachments[0]?.fileUrl ?? ''))).toEqual([SENDER, member(1).id]);
    expect((emitted[0]?.payload as unknown as { clientMessageId?: string }).clientMessageId).toBe('cid');
    expect(emitted.some((e) => e.room.startsWith('conversation:'))).toBe(false);
  });

  it('garde la diffusion de room, inchangée, sans remise par lecteur', () => {
    const { io, emitted } = recordingIO();
    const payload = { id: 'm1', conversationId: CONVERSATION, attachments } as never;
    emitMessageNew({
      io,
      room: `conversation:${CONVERSATION}`,
      senderPayload: payload,
      peerPayload: payload,
      senderUserId: 'u-sender',
      senderParticipantId: SENDER,
      hiddenKeys: ['u-hidden'],
      payloadForKey: () => payload,
    });
    expect(emitted.map((e) => [e.room, e.except])).toEqual([
      [`conversation:${CONVERSATION}`, ['user:u-sender', 'user:u-hidden']],
      ['user:u-sender', []],
      ['user:u-hidden', []],
    ]);
    expect(emitted[0]?.payload.attachments[0]?.fileUrl).toBe(KEY);
  });

  it('§ coût — un groupe de 1 000 membres : 1 000 émissions, signature et sérialisation mesurées', async () => {
    const rows = Array.from({ length: 1000 }, (_v, i) => member(i + 10, {
      id: `c${String(i).padStart(23, '0')}`,
      userId: `b${String(i).padStart(23, '0')}`,
    }));
    const prisma = prismaWith(rows);
    const heavy = { id: 'm1', conversationId: CONVERSATION, content: 'x'.repeat(2_000), translations: Array.from({ length: 6 }, () => ({ text: 'y'.repeat(300) })), attachments };
    const targets = await readerSignedTargets(prisma as never, { conversationId: CONVERSATION, message: PROTECTED, attachments, signer: SIGNER, now: NOW });
    const { io, emitted } = recordingIO();
    const started = performance.now();
    emitMessageNew({
      io,
      room: `conversation:${CONVERSATION}`,
      senderPayload: heavy as never,
      peerPayload: heavy as never,
      senderUserId: null,
      senderParticipantId: SENDER,
      hiddenKeys: [],
      payloadForKey: () => heavy as never,
      readerSigned: { targets: targets ?? [], signFor: (payload, participantId) => signedForReader(payload, { message: PROTECTED, participantId, signer: SIGNER }) },
    });
    const serialized = emitted.reduce((bytes, e) => bytes + JSON.stringify(e.payload).length, 0);
    const elapsed = performance.now() - started;
    process.stdout.write(`[#9646 coût] 1000 destinataires : ${emitted.length} émissions, ${Math.round(serialized / 1024)} Ko sérialisés, ${elapsed.toFixed(1)} ms (signature + sérialisation)\n`);
    expect(emitted).toHaveLength(1000);
    expect(new Set(emitted.map((e) => e.payload.attachments[0]?.fileUrl)).size).toBe(1000);
  });
});
