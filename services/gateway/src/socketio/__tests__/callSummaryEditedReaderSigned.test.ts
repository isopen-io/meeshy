/**
 * #19977 — le TROISIÈME producteur de `message:edited`.
 *
 * `MeeshySocketIOManager.broadcastMessageEdited` sert la bulle d'un
 * enregistrement d'appel, et il est le SEUL des trois transports d'édition qui
 * charge des pièces jointes AUJOURD'HUI : son appelant relit la bulle par
 * `CALL_SUMMARY_MESSAGE_INCLUDE`, qui porte `attachments`.
 *
 * Il diffusait pourtant l'adresse NUE à la room entière et l'enfilait pour 48 h
 * sans jamais interroger de plan signé — la fuite que #9646 ferme sur le
 * transport REST et #19939 sur le transport socket, rouverte ici par le site
 * que leurs deux énumérations ne nommaient pas.
 *
 * Les témoins traversent la PRODUCTION : un vrai `MeeshySocketIOManager`, et la
 * signature vérifiée par `checkReaderFileToken` — pas une chaîne reconnue au
 * motif qu'elle n'est plus la clé nue.
 *
 * @jest-environment node
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

import { getIoState } from './helpers/message-new-parity-mocks';

import { MeeshySocketIOManager } from '../MeeshySocketIOManager';
import {
  makeTranslationService,
  makePrisma,
  makeContractMessage,
  makeAttachmentRow,
  CONVERSATION_ID,
} from './helpers/message-new-parity-fixtures';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { checkReaderFileToken, readSigningKeys } from '../../services/attachments/readerFileSignature';

/** Une clé de l'arborescence datée — la seule forme que la signature réécrit. */
const KEY = '2026/10/68f2a81417a557e8ce4ddfc1/photo_8b1f0c1e.jpg';

const ATTACHMENT_ID = 'aaaaaaaaaaaaaaaaaaaaaaa1';

const A = { id: 'cccccccccccccccccccccc01', userId: 'bbbbbbbbbbbbbbbbbbbbbb01' };
const B = { id: 'cccccccccccccccccccccc02', userId: 'bbbbbbbbbbbbbbbbbbbbbb02' };

/**
 * À QUI cette adresse a-t-elle été signée ? `null` quand elle n'est pas signée
 * du tout — c'est la forme que le défaut sert, et elle doit se distinguer d'une
 * signature faite pour quelqu'un d'autre.
 */
const readerOf = (url: unknown): string | null => {
  const match = /^\/api\/v1\/attachments\/signed\/([^/]+)\/([^/]+)$/.exec(typeof url === 'string' ? url : '');
  if (!match) return null;
  const check = checkReaderFileToken({
    token: match[1] as string,
    storageKey: decodeURIComponent(match[2] as string),
    keys: readSigningKeys(),
    now: new Date(),
  });
  return check.kind === 'valid' ? check.readerParticipantId : null;
};

const protectedCallSummary = () =>
  makeContractMessage({
    id: 'msg-123456789012',
    content: 'Appel audio · 00:30',
    messageType: 'system',
    messageSource: 'system',
    isEncrypted: false,
    encryptionMode: null,
    encryptedContent: undefined,
    encryptionMetadata: undefined,
    attachments: [makeAttachmentRow({ id: ATTACHMENT_ID, fileUrl: KEY, thumbnailUrl: null, isViewOnce: true })],
  });

describe("message:edited (résumé d'appel) — la pièce qui se lit par lecteur", () => {
  let manager: any;
  let prisma: any;
  let ioState: ReturnType<typeof getIoState>;
  let queue: { enqueue: jest.Mock; drain: jest.Mock };

  const editedEmissions = () =>
    (ioState.toEmit.mock.calls as any[])
      .filter((c) => c[0] === SERVER_EVENTS.MESSAGE_EDITED)
      .map((c) => c[1] as Record<string, unknown>);

  const attachmentUrlOf = (payload: Record<string, unknown> | undefined) =>
    (payload?.attachments as ReadonlyArray<Record<string, unknown>> | undefined)?.[0]?.fileUrl;

  beforeEach(async () => {
    process.env.ATTACHMENT_URL_SIGNING_KEY = Buffer.alloc(32, 9).toString('base64');
    jest.clearAllMocks();
    ioState = getIoState();
    ioState.to.mockClear();
    ioState.toEmit.mockClear();
    ioState.sockets.sockets.clear();
    ioState.sockets.adapter.rooms.clear();

    prisma = makePrisma();
    // La ligne de PROTECTION que `protectionRowFailClosed` relit : vue unique,
    // donc toute pièce du message se lit par lecteur.
    prisma.message.findUnique.mockResolvedValue({
      isViewOnce: true,
      isBlurred: false,
      effectFlags: 0,
      ephemeralDuration: null,
      expiresAt: null,
    });
    prisma.participant.findMany.mockResolvedValue([
      { id: A.id, userId: A.userId, shareLinkId: null },
      { id: B.id, userId: B.userId, shareLinkId: null },
    ]);
    prisma.conversationShareLink = { findMany: jest.fn(async () => []) };

    manager = new MeeshySocketIOManager({} as any, prisma as any, makeTranslationService() as any);
    await manager.initialize();
    queue = { enqueue: jest.fn(async () => undefined) as any, drain: jest.fn() as any };
    manager.setDeliveryQueue(queue as any);
  });

  afterEach(() => {
    delete process.env.ATTACHMENT_URL_SIGNING_KEY;
  });

  it('sert une émission par lecteur admis, son adresse signée pour LUI, et aucune à la room', async () => {
    await manager.broadcastMessageEdited(protectedCallSummary(), CONVERSATION_ID);

    const live = editedEmissions();
    expect(live).toHaveLength(2);
    expect(live.map((p) => readerOf(attachmentUrlOf(p)))).toEqual([A.id, B.id]);
    expect(live.map((p) => attachmentUrlOf(p))).not.toContain(KEY);
  });

  it("enfile pour l'absent SA charge, signée pour sa ligne `Participant`", async () => {
    await manager.broadcastMessageEdited(protectedCallSummary(), CONVERSATION_ID);

    const entries = (queue.enqueue.mock.calls as any[]).map(([key, entry]) => ({ key, entry }));
    expect(entries.map((e) => e.key).sort()).toEqual([A.userId, B.userId]);
    for (const { key, entry } of entries) {
      expect(entry.eventType).toBe('edited');
      const expected = key === A.userId ? A.id : B.id;
      expect(readerOf(attachmentUrlOf(entry.payload))).toBe(expected);
    }
  });

  it("ne diffuse ni n'enfile RIEN quand la lecture des destinataires tombe", async () => {
    prisma.participant.findMany.mockRejectedValue(new Error('db down'));

    await expect(manager.broadcastMessageEdited(protectedCallSummary(), CONVERSATION_ID)).resolves.not.toThrow();

    expect(editedEmissions()).toEqual([]);
    expect(queue.enqueue.mock.calls).toEqual([]);
  });

  it("garde la diffusion de room, adresse intacte, pour une bulle d'appel ORDINAIRE", async () => {
    prisma.message.findUnique.mockResolvedValue({
      isViewOnce: false,
      isBlurred: false,
      effectFlags: 0,
      ephemeralDuration: null,
      expiresAt: null,
    });

    await manager.broadcastMessageEdited(
      makeContractMessage({
        id: 'msg-123456789012',
        isEncrypted: false,
        encryptionMode: null,
        encryptedContent: undefined,
        encryptionMetadata: undefined,
        isViewOnce: false,
        attachments: [makeAttachmentRow({ id: ATTACHMENT_ID, fileUrl: KEY, thumbnailUrl: null, isViewOnce: false })],
      }),
      CONVERSATION_ID,
    );

    const live = editedEmissions();
    expect(live).toHaveLength(1);
    expect(attachmentUrlOf(live[0])).toBe(KEY);
  });
});
