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

const logged: unknown[][] = [];
const record = (level: string) => (...args: unknown[]) => { logged.push([level, ...args]); };

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: record('info'), warn: record('warn'), error: record('error'), debug: record('debug'), trace: record('trace') })),
    warn: record('warn'),
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
import { revealAtRest, SERVER_AT_REST_CIPHERTEXT_REFUSED, SERVER_AT_REST_UNAVAILABLE } from '../../../../services/messaging/serverAtRest';

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

function harness(regime: Regime, quoted: Record<string, unknown> | null = null) {
  const keys = new Map<string, Record<string, unknown>>();
  const created: Array<{ data: Record<string, unknown> }> = [];
  const prisma = {
    conversation: {
      findUnique: jest.fn(async () => regime),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    message: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        created.push(args);
        return {
          id: MSG_ID, createdAt: new Date(), updatedAt: new Date(), translations: null, attachments: [],
          replyTo: args.data.replyToId ? quoted : null,
          ...args.data,
        } as unknown as Message;
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
      updateMany: jest.fn(async () => ({ count: 0 })),
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

describe('seule la passerelle écrit un chiffré au repos', () => {
  const clientCiphertext = (mode: string) => ({
    conversationId: CONV_ID,
    senderId: SENDER_ID,
    content: '[Encrypted]',
    originalLanguage: 'fr',
    encryptedContent: 'Y2hpZmZyw6kgdm9sw6k=',
    encryptionMetadata: { mode, keyId: 'cle-d-une-autre-conversation', iv: 'aXY=', authTag: 'dGFn' },
  });

  it.each(['server', 'hybrid', 'Server'])('un chiffré client déclaré « %s » dans une conversation non chiffrée est REFUSÉ', async (mode) => {
    const h = harness({ encryptionMode: null, encryptionEnabledAt: null, serverEncryptionKeyId: null });
    await expect(new MessageProcessor(h.prisma).saveMessage(clientCiphertext(mode)))
      .rejects.toMatchObject({ code: SERVER_AT_REST_CIPHERTEXT_REFUSED });
    expect(h.created).toHaveLength(0);
  });

  it.each(['server', 'hybrid'])('aucun chiffré client n’entre dans une conversation %s', async (regimeMode) => {
    const h = harness({ encryptionMode: regimeMode, encryptionEnabledAt: new Date(), serverEncryptionKeyId: null });
    await expect(new MessageProcessor(h.prisma).saveMessage(clientCiphertext('e2ee')))
      .rejects.toMatchObject({ code: SERVER_AT_REST_CIPHERTEXT_REFUSED });
    expect(h.created).toHaveLength(0);
  });
});

describe('le chemin réel : la clé que l’activation a désignée', () => {
  it.each(['server', 'hybrid'] as const)('en %s, le message est scellé sous serverEncryptionKeyId et relu en clair', async (mode) => {
    const h = harness({ encryptionMode: mode, encryptionEnabledAt: new Date(), serverEncryptionKeyId: null });
    const activation = new EncryptionService(h.prisma);
    const designated = await activation.getOrCreateConversationKey(CONV_ID);
    const live = harness({ encryptionMode: mode, encryptionEnabledAt: new Date(), serverEncryptionKeyId: designated });
    for (const [id, row] of h.keys) live.keys.set(id, row);

    const served = await send(new MessageProcessor(live.prisma));

    const row = live.created[0].data;
    expect((row.encryptionMetadata as { keyId: string }).keyId).toBe(designated);
    expect(served.content).toBe(SECRET);
    const persisted = { id: MSG_ID, ...row } as unknown as Message;
    expect(await revealAtRest(persisted, new EncryptionService(live.prisma))).toMatchObject({ content: SECRET });
  });
});

describe('un message sans texte n’est pas scellé', () => {
  it('une photo seule en mode hybrid se range non chiffrée, mode gardé : rien à cacher, rien à masquer', async () => {
    const h = harness({ encryptionMode: 'hybrid', encryptionEnabledAt: new Date(), serverEncryptionKeyId: null });
    const served = await new MessageProcessor(h.prisma).saveMessage({ conversationId: CONV_ID, senderId: SENDER_ID, content: '', originalLanguage: 'fr' });
    expect(h.created[0].data).toMatchObject({ content: '', isEncrypted: false, encryptionMode: 'hybrid', encryptedContent: null });
    expect(served).toMatchObject({ isEncrypted: false, encryptionMode: 'hybrid' });
  });
});

describe('la citation d’une réponse sort en clair dès l’envoi', () => {
  it('message:new et la réponse d’envoi citent le clair, comme la liste', async () => {
    const h = harness({ encryptionMode: 'server', encryptionEnabledAt: new Date(), serverEncryptionKeyId: null });
    const writer = new EncryptionService(h.prisma);
    const sealed = await writer.sealAtRest({ plaintext: 'Rendez-vous 18h', conversationId: CONV_ID });
    const quoted = {
      id: '507f1f77bcf86cd799439044', conversationId: CONV_ID, content: '', isEncrypted: true, encryptionMode: 'server',
      encryptedContent: sealed.ciphertext, encryptionMetadata: { mode: 'server', ...sealed.metadata },
    };
    const quoting = harness({ encryptionMode: 'server', encryptionEnabledAt: new Date(), serverEncryptionKeyId: null }, quoted);
    for (const [id, row] of h.keys) quoting.keys.set(id, row);

    const served = await new MessageProcessor(quoting.prisma).saveMessage({
      conversationId: CONV_ID, senderId: SENDER_ID, content: SECRET, originalLanguage: 'fr', replyToId: quoted.id,
    });

    expect((served as unknown as { replyTo: Record<string, unknown> }).replyTo).toMatchObject({
      content: 'Rendez-vous 18h', isEncrypted: false, encryptedContent: null, encryptionMetadata: null,
    });
  });
});

describe('une clé maîtresse ERRONÉE (bonne longueur) au déploiement', () => {
  const WRONG_MASTER = Buffer.alloc(32, 99).toString('base64');

  it.each(['server', 'hybrid'] as const)('en %s, l’envoi est REFUSÉ (503) : aucune clé créée, désignation intacte, ERROR sans secret', async (mode) => {
    const h = harness({ encryptionMode: mode, encryptionEnabledAt: new Date(), serverEncryptionKeyId: null });
    const designated = await new EncryptionService(h.prisma).getOrCreateConversationKey(CONV_ID);
    const live = harness({ encryptionMode: mode, encryptionEnabledAt: new Date(), serverEncryptionKeyId: designated });
    for (const [id, row] of h.keys) live.keys.set(id, row);
    const keysBefore = live.keys.size;

    process.env.ENCRYPTION_MASTER_KEY = WRONG_MASTER;
    await expect(send(new MessageProcessor(live.prisma))).rejects.toMatchObject({ code: SERVER_AT_REST_UNAVAILABLE });

    const designationAfter = (await live.prisma.conversation.findUnique({ where: { id: CONV_ID } } as never) as unknown as Regime).serverEncryptionKeyId;
    expect({ written: live.created.length, keysCreated: live.keys.size - keysBefore, designationKept: designationAfter === designated })
      .toEqual({ written: 0, keysCreated: 0, designationKept: true });
    const errors = logged.filter(([level]) => level === 'error');
    expect(errors.length).toBeGreaterThan(0);
    const journal = JSON.stringify(logged);
    expect(journal).not.toContain(WRONG_MASTER);
    expect(journal).not.toContain(MASTER);
    expect(journal).not.toContain(String(live.keys.get(designated)?.encryptedKey));
    expect(journal).not.toContain('4471');
  });

  it('sans désignation, une clé de conversation du coffre illisible ne se remplace pas non plus', async () => {
    const h = harness({ encryptionMode: 'server', encryptionEnabledAt: new Date(), serverEncryptionKeyId: null });
    process.env.ENCRYPTION_MASTER_KEY = WRONG_MASTER;
    const former = await new EncryptionService(h.prisma).getOrCreateConversationKey(CONV_ID);
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const service = new EncryptionService(h.prisma);
    await service.initialize();
    const keysBefore = h.keys.size;

    await expect(service.sealAtRest({ plaintext: SECRET, conversationId: CONV_ID })).rejects.toMatchObject({ code: SERVER_AT_REST_UNAVAILABLE });
    expect({ keysCreated: h.keys.size - keysBefore, formerKept: h.keys.has(former) }).toEqual({ keysCreated: 0, formerKept: true });
  });
});
