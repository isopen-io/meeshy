/**
 * #13113 (constats GW-03 et GWX-01 de la revue E2EE du 2026-11-17, #18906) —
 * dans une conversation chiffrée de bout en bout, RIEN de ce que le client
 * déclare à côté du chiffré ne s'écrit en clair : ni sticker (les textes du
 * gabarit), ni pièce citée, ni transfert serveur. Le refus se pose au point où
 * REST et les deux événements socket CONVERGENT (`handleMessage` →
 * `saveMessage` → `admitSendUnderRegime`), avant toute écriture, et son motif
 * voyage en `code` jusqu'au transport.
 *
 * Banc : le vrai `MessagingService` sur un double Prisma (`e2ee-send-harness.ts`).
 * Ces témoins AFFIRMAIENT le défaut dans la contre-analyse (sticker écrit en
 * clair, `success: true`) ; ils sont inversés ici.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import type { MessageRequest } from '@meeshy/shared/types';
import { LIBSIGNAL_PROTOCOL } from '@meeshy/shared/types/e2ee-directory';

jest.mock('../../message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({ handleNewMessage: jest.fn() })),
}));
jest.mock('../../ConversationStatsService', () => ({
  conversationStatsService: { updateOnNewMessage: jest.fn() },
}));
jest.mock('../../ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../ConversationMessageStatsService') as object),
  conversationMessageStatsService: { onNewMessage: jest.fn(async () => undefined) },
}));
jest.mock('../../TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    findExistingTrackingLink: jest.fn(async () => null),
    createTrackingLink: jest.fn(async () => ({ token: 'abc123' })),
    processExplicitLinksInContent: jest.fn(async ({ content }: { content: string }) => ({ processedContent: content, trackingLinks: [] })),
    collectContentTrackingLinks: jest.fn(async () => []),
  })),
}));
jest.mock('../../MentionService', () => ({
  ...jest.requireActual<Record<string, unknown>>('../../MentionService'),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn().mockReturnValue([]),
    extractMentionsWithParticipants: jest.fn().mockReturnValue([]),
    resolveUsernames: jest.fn(async () => new Map()),
    validateMentionPermissions: jest.fn(async () => ({ isValid: true, validUserIds: [], invalidUsernames: [], errors: [] })),
    createMentions: jest.fn(async () => undefined),
  })),
}));
jest.mock('../../MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({ markMessagesAsRead: jest.fn(async () => undefined), getUnreadCount: jest.fn(async () => 0) })),
}));
jest.mock('../../CacheStore', () => {
  const actual = jest.requireActual('../../CacheStore') as Record<string, unknown>;
  const spy = new Proxy({}, { get: () => async () => null });
  return { ...actual, getCacheStore: () => spy };
});
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { createSendHarness, ALICE_PARTICIPANT, ALICE_SESSION, BOB, CONVERSATION } from './e2ee-send-harness';
import { E2EE_PLAINTEXT_REFUSED } from '../e2eePlaintextAdmission';

const SENTINEL = 'sentinelle-secrete-42';
const cid = (n: number) => `cid_00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

const libsignalPayload = () => ({
  ciphertext: LIBSIGNAL_PROTOCOL, mode: 'e2ee', protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1, regimeEpoch: 0,
  relay: {
    protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1, sessionId: ALICE_SESSION, unapprovedOwnDevices: [],
    envelopes: [{ userId: BOB, deviceId: 1, registrationId: 222, type: 3, body: Buffer.from('opaque').toString('base64') }],
  },
});

const nothingWritten = (h: ReturnType<typeof createSendHarness>) => {
  expect(h.messages).toHaveLength(0);
  expect(h.store.collections.MessageEnvelope.rows).toHaveLength(0);
  expect(h.emitted).toHaveLength(0);
  expect(JSON.stringify(h.writes)).not.toContain(SENTINEL);
};

afterEach(() => jest.clearAllMocks());

describe('#13113 — un sticker n’entre jamais en clair dans une conversation e2ee', () => {
  it('sans chiffré : refusé E2EE_PLAINTEXT_REFUSED, rien n’est écrit', async () => {
    const h = createSendHarness({ encryptionMode: 'e2ee' });

    const response = await h.service.handleMessage({
      conversationId: CONVERSATION, content: '', originalLanguage: 'fr', clientMessageId: cid(1),
      sticker: { templateId: 'bubble', slots: { line1: SENTINEL } },
    } as unknown as MessageRequest, ALICE_PARTICIPANT);

    expect(response).toMatchObject({ success: false, code: E2EE_PLAINTEXT_REFUSED });
    nothingWritten(h);
  });

  it('à côté d’un envoi libsignal valide : refusé aussi, ni message ni enveloppe', async () => {
    const h = createSendHarness({ encryptionMode: 'e2ee' });

    const response = await h.service.handleMessage({
      conversationId: CONVERSATION, content: '', clientMessageId: cid(2),
      encryptedPayload: libsignalPayload(),
      sticker: { templateId: 'bubble', slots: { line1: SENTINEL } },
    } as unknown as MessageRequest, ALICE_PARTICIPANT);

    expect(response).toMatchObject({ success: false, code: E2EE_PLAINTEXT_REFUSED });
    nothingWritten(h);
  });

  it('le même envoi libsignal, sans sticker, passe et range son enveloppe (le refus ne vise que le voisin)', async () => {
    const h = createSendHarness({ encryptionMode: 'e2ee' });

    const response = await h.service.handleMessage({
      conversationId: CONVERSATION, content: '', clientMessageId: cid(3), encryptedPayload: libsignalPayload(),
    } as unknown as MessageRequest, ALICE_PARTICIPANT);

    expect(response.success).toBe(true);
    expect(h.store.collections.MessageEnvelope.rows).toHaveLength(1);
  });
});
