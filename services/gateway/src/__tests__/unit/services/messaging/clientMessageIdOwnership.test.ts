/**
 * @jest-environment node
 *
 * **UNE CLÉ D'IDEMPOTENCE APPARTIENT À SON AUTEUR** (#19960).
 *
 * L'unicité que la base garde est celle du COUPLE `(conversationId,
 * clientMessageId)` — un espace de noms PARTAGÉ par les participants — quand
 * chaque client tire sa clé dans SON espace d'ids optimistes. Les relectures
 * de dédoublonnage appariaient sur ce couple : une ligne portant la clé sous
 * un AUTRE expéditeur était servie comme « votre message », et le message de
 * l'appelant n'était jamais écrit — un succès RENDU sur une perte.
 *
 * Le double Prisma de ce fichier HONORE le `where` qu'on lui passe et émule
 * l'index partiel sur `create` : sans cela, aucun de ces témoins ne pourrait
 * tomber (un double qui ignore `senderId` rend la même ligne avant comme après
 * le correctif).
 */
import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const mockHandleNewMessage = jest.fn(async (..._args: unknown[]) => undefined);

jest.mock('../../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({ handleNewMessage: mockHandleNewMessage })),
}));
jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    processExplicitLinksInContent: jest.fn(async ({ content }: { content: string }) => ({ processedContent: content, trackingLinks: [] })),
    collectContentTrackingLinks: jest.fn(async () => []),
  })),
}));
jest.mock('../../../../services/MessageReadStatusService', () => ({
  // `markMessagesAsRead` est CHAÎNÉ (`.then(...).catch(...)`) par
  // `runPostSaveSideEffects` : un double qui rend `undefined` fait lever le
  // chemin nominal, et le témoin de l'écriture LIBRE tomberait pour une raison
  // qui n'est pas la sienne.
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    markMessagesAsRead: jest.fn(async () => 0),
    getUnreadCount: jest.fn(async () => 0),
  })),
}));
jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { MessagingService } from '../../../../services/MessagingService';
import { CLIENT_MESSAGE_ID_TAKEN } from '../../../../services/messaging/clientMessageIdOwnership';
import { resetParticipantLookupCache } from '../../../../utils/participant-lookup-cache';

const CONV_ID = '507f1f77bcf86cd799439012';
/** Bob — celui qui ENVOIE dans ces témoins. */
const BOB_PARTICIPANT = '507f1f77bcf86cd799439014';
const BOB_USER = '507f1f77bcf86cd799439011';
/** Alice — la propriétaire de la clé, dans la MÊME conversation. */
const ALICE_PARTICIPANT = '507f1f77bcf86cd799439024';
const ALICE_MESSAGE_ID = '507f1f77bcf86cd799439013';
const CID = 'cid_550e8400-e29b-41d4-a716-446655440000';
const ALICE_SECRET = 'Je passe te prendre a 18h';

const savedKey = process.env.ENCRYPTION_MASTER_KEY;
afterAll(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = savedKey;
});

beforeEach(() => {
  jest.clearAllMocks();
  resetParticipantLookupCache();
  process.env.ENCRYPTION_MASTER_KEY = Buffer.alloc(32, 5).toString('base64');
});

type Row = Record<string, unknown>;

function messageRow(overrides: Row = {}): Row {
  return {
    id: ALICE_MESSAGE_ID, conversationId: CONV_ID, senderId: ALICE_PARTICIPANT,
    content: ALICE_SECRET, originalLanguage: 'fr', messageType: 'text',
    replyToId: null, deletedAt: null, isEdited: false, validatedMentions: [],
    createdAt: new Date(), updatedAt: new Date(), clientMessageId: CID,
    translations: {}, sender: null, attachments: [], replyTo: null,
    isEncrypted: false, encryptionMode: 'none', encryptedContent: null, encryptionMetadata: null,
    ...overrides,
  };
}

/**
 * Le double qui REFUSE ce que la production refuse : `findFirst` filtre sur
 * TOUTES les clés scalaires du `where` qu'il reçoit (donc sur `senderId` dès
 * que l'appelant le passe), et `create` émule l'index partiel en levant
 * `P2002` sur un `(conversationId, clientMessageId)` déjà pris, QUEL QUE SOIT
 * l'expéditeur — ce que fait la base.
 */
function harness(rows: Row[]) {
  const table = [...rows];
  const matches = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (value === null || typeof value === 'object') return true;
      return row[key] === value;
    });

  const prisma = {
    conversation: {
      findUnique: jest.fn(async () => ({ id: CONV_ID, type: 'private' })),
      findFirst: jest.fn(async () => ({ id: CONV_ID, identifier: 'test-conv', type: 'private' })),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    participant: {
      findUnique: jest.fn(async () => ({ id: BOB_PARTICIPANT, conversationId: CONV_ID, isActive: true, type: 'user', userId: BOB_USER })),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
    message: {
      create: jest.fn(async ({ data }: { data: Row }) => {
        const cid = data.clientMessageId;
        if (typeof cid === 'string' && table.some((row) => row.conversationId === data.conversationId && row.clientMessageId === cid)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const created = messageRow({ ...data, id: 'created-row', sender: null });
        table.push(created);
        return created;
      }),
      update: jest.fn(async () => ({})),
      count: jest.fn(async () => table.length),
      groupBy: jest.fn(async () => []),
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async (args: { where?: Row } = {}) =>
        table.find((row) => matches(row, args.where ?? {})) ?? null),
    },
    messageAttachment: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    conversationStats: { findUnique: jest.fn(async () => null), upsert: jest.fn(async () => ({})) },
    user: { findUnique: jest.fn(), findMany: jest.fn(async () => []) },
    serverEncryptionKey: {
      create: jest.fn(async ({ data }: { data: Row }) => data),
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      update: jest.fn(async () => ({})),
    },
  };
  return { prisma, table };
}

const serviceOf = (prisma: unknown) =>
  new MessagingService(prisma as PrismaClient, { handleNewMessage: mockHandleNewMessage } as never);

describe('la clé d’idempotence d’un envoi appartient à son auteur', () => {
  it('le rejeu de SON PROPRE clientMessageId sert sa ligne, inchangé', async () => {
    const { prisma } = harness([messageRow({ senderId: BOB_PARTICIPANT, content: 'mon texte' })]);

    const response = await serviceOf(prisma).handleMessage(
      { conversationId: CONV_ID, content: 'mon texte', clientMessageId: CID }, BOB_PARTICIPANT
    );

    expect(response.success).toBe(true);
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(response.data).toMatchObject({ id: ALICE_MESSAGE_ID, content: 'mon texte' });
  });

  it('la clé tenue par un AUTRE expéditeur ne rend PAS la ligne d’autrui — l’envoi est refusé, nommément', async () => {
    const { prisma } = harness([messageRow()]);

    const response = await serviceOf(prisma).handleMessage(
      { conversationId: CONV_ID, content: 'mon propre texte', clientMessageId: CID }, BOB_PARTICIPANT
    );

    expect(response.success).toBe(false);
    expect(response.code).toBe(CLIENT_MESSAGE_ID_TAKEN);
    expect(JSON.stringify(response)).not.toContain(ALICE_SECRET);
    expect(JSON.stringify(response)).not.toContain(ALICE_MESSAGE_ID);
  });

  it('la clé LIBRE écrit, et l’écriture porte l’expéditeur de l’appelant', async () => {
    const { prisma, table } = harness([]);

    const response = await serviceOf(prisma).handleMessage(
      { conversationId: CONV_ID, content: 'premier envoi', clientMessageId: CID }, BOB_PARTICIPANT
    );

    expect(response.success).toBe(true);
    expect(prisma.message.create).toHaveBeenCalled();
    expect(table.at(-1)).toMatchObject({ clientMessageId: CID, senderId: BOB_PARTICIPANT });
  });

  it('la COURSE (dédup précoce manqué, P2002 sur une ligne d’autrui) refuse aussi, au lieu de servir l’autre', async () => {
    const { prisma } = harness([messageRow()]);
    // La dédup précoce ne voit rien : la ligne d'Alice est arrivée APRÈS sa
    // lecture. Seul le `create` la rencontre, par l'index partiel.
    let firstRead = true;
    const honest = prisma.message.findFirst.getMockImplementation()!;
    prisma.message.findFirst.mockImplementation(async (args: { where?: Row } = {}) => {
      if (firstRead) { firstRead = false; return null; }
      return honest(args);
    });

    const response = await serviceOf(prisma).handleMessage(
      { conversationId: CONV_ID, content: 'mon propre texte', clientMessageId: CID }, BOB_PARTICIPANT
    );

    expect(prisma.message.create).toHaveBeenCalled();
    expect(response.success).toBe(false);
    expect(response.code).toBe(CLIENT_MESSAGE_ID_TAKEN);
    expect(JSON.stringify(response)).not.toContain(ALICE_SECRET);
  });
});
