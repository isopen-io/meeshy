/**
 * @jest-environment node
 *
 * #11381 / #11374 — l'ENVOI d'un message dans une conversation `server` ou
 * `hybrid`, de bout en bout de `MessageProcessor.saveMessage`, avec le VRAI
 * `EncryptionService` : ce que la base reçoit (le chiffré seul), ce que
 * l'expéditeur et `message:new` reçoivent (le clair), ce qu'un autre membre
 * relit (le clair), et ce que les journaux voient (rien du texte).
 */
import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import type { PrismaClient, Message } from '@meeshy/shared/prisma/client';

const logged: unknown[] = [];
const record = (...args: unknown[]) => { logged.push(args); };

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: record, warn: record, error: record, debug: record, trace: record })),
    warn: record,
  },
  performanceLogger: {
    withTiming: jest.fn().mockImplementation((_name: unknown, fn: () => unknown) => fn()),
  },
}));

jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    collectContentTrackingLinks: jest.fn(async () => []),
    processExplicitLinksInContent: jest.fn(async ({ content }: { content: string }) => ({ processedContent: content, trackingLinks: [] })),
  })),
}));

jest.mock('../../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn(() => []),
    extractMentionsWithParticipants: jest.fn(() => []),
    resolveUsernames: jest.fn(async () => new Map()),
    validateMentionPermissions: jest.fn(async () => ({ validUserIds: [] })),
    createMentions: jest.fn(async () => undefined),
  })),
}));

jest.mock('../../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({ associateAttachmentsToMessage: jest.fn(async () => undefined) })),
}));

import { MessageProcessor } from '../../../../services/messaging/MessageProcessor';
import { EncryptionService } from '../../../../services/EncryptionService';
import { revealAtRest, SERVER_AT_REST_UNAVAILABLE } from '../../../../services/messaging/serverAtRest';

const CONV_ID = '507f1f77bcf86cd799439011';
const SENDER_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439033';
const SECRET = 'Code de la porte : 4471, ne le dis à personne';
const MASTER = Buffer.alloc(32, 3).toString('base64');
const savedKey = process.env.ENCRYPTION_MASTER_KEY;

afterAll(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = savedKey;
});

type Regime = { encryptionMode: string | null; encryptionEnabledAt: Date | null; serverEncryptionKeyId: string | null };

function harness(regime: Regime) {
  const keys = new Map<string, Record<string, unknown>>();
  const created: Array<{ data: Record<string, unknown> }> = [];
  const prisma = {
    conversation: { findUnique: jest.fn(async () => regime) },
    message: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        created.push(args);
        return { id: MSG_ID, createdAt: new Date(), updatedAt: new Date(), translations: null, attachments: [], ...args.data } as unknown as Message;
      }),
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
    },
    messageAttachment: { findMany: jest.fn(async () => []), updateMany: jest.fn(async () => ({})) },
    participant: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    trackingLink: { updateMany: jest.fn(async () => ({})) },
    user: { findUnique: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    userConversationPreferences: { findMany: jest.fn(async () => []) },
    post: { findUnique: jest.fn(async () => null) },
    serverEncryptionKey: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => { keys.set(String(data.id), data); return data; }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => keys.get(where.id) ?? null),
      findMany: jest.fn(async () => [...keys.values()]),
      update: jest.fn(async () => ({})),
    },
  } as unknown as PrismaClient;
  return { prisma, created, keys };
}

const send = (processor: MessageProcessor) =>
  processor.saveMessage({ conversationId: CONV_ID, senderId: SENDER_ID, content: SECRET, originalLanguage: 'fr' });

beforeEach(() => {
  logged.length = 0;
  process.env.ENCRYPTION_MASTER_KEY = MASTER;
});

describe.each(['server', 'hybrid'] as const)('envoi en mode %s', (mode) => {
  const regime = (): Regime => ({ encryptionMode: mode, encryptionEnabledAt: new Date(), serverEncryptionKeyId: null });

  it('la base ne reçoit que le chiffré : aucun octet clair dans la ligne ni dans les clés', async () => {
    const h = harness(regime());
    await send(new MessageProcessor(h.prisma));

    const row = h.created[0].data;
    expect(row.content).toBe('');
    expect(row).toMatchObject({ isEncrypted: true, encryptionMode: mode });
    expect(JSON.stringify({ row, keys: [...h.keys.values()] })).not.toContain('4471');
  });

  it('l’expéditeur et `message:new` reçoivent le clair, servi comme un message non chiffré', async () => {
    const h = harness(regime());
    const served = await send(new MessageProcessor(h.prisma));
    expect(served).toMatchObject({ content: SECRET, isEncrypted: false, encryptionMode: mode, encryptedContent: null, encryptionMetadata: null });
  });

  it('un autre membre relit le clair depuis la ligne persistée', async () => {
    const h = harness(regime());
    await send(new MessageProcessor(h.prisma));
    const persisted = { id: MSG_ID, ...h.created[0].data } as unknown as Message;
    const reader = new EncryptionService(h.prisma);
    expect(await revealAtRest(persisted, reader)).toMatchObject({ content: SECRET, isEncrypted: false });
  });

  it('aucun journal ne voit le texte', async () => {
    const h = harness(regime());
    await send(new MessageProcessor(h.prisma));
    expect(JSON.stringify(logged)).not.toContain('4471');
  });

  it('sans clé maîtresse, l’envoi est REFUSÉ explicitement et rien n’est écrit', async () => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    const h = harness(regime());
    await expect(send(new MessageProcessor(h.prisma))).rejects.toMatchObject({ code: SERVER_AT_REST_UNAVAILABLE });
    expect(h.created).toHaveLength(0);
  });
});

describe('les autres régimes ne changent pas', () => {
  it('sans chiffrement, le texte est écrit tel quel', async () => {
    const h = harness({ encryptionMode: null, encryptionEnabledAt: null, serverEncryptionKeyId: null });
    const served = await send(new MessageProcessor(h.prisma));
    expect(h.created[0].data).toMatchObject({ content: SECRET, isEncrypted: false });
    expect(served.content).toBe(SECRET);
  });

  it('un mode inconnu est refusé, jamais écrit en clair', async () => {
    const h = harness({ encryptionMode: 'quantum', encryptionEnabledAt: new Date(), serverEncryptionKeyId: null });
    await expect(send(new MessageProcessor(h.prisma))).rejects.toMatchObject({ code: SERVER_AT_REST_UNAVAILABLE });
    expect(h.created).toHaveLength(0);
  });
});
