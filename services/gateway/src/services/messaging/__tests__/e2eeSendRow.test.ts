/**
 * Constat GW-12 de la revue E2EE du 2026-11-17 (#18906), et #9998 — par le
 * vrai `MessagingService.handleMessage` (point de convergence de REST et des
 * deux sockets) : la ligne d'un message chiffré de bout en bout ne garde que la
 * métadonnée de la liste blanche, et la langue qu'elle porte est une CONSTANTE
 * (le défaut de la colonne), jamais celle que le client déclare. La langue
 * réelle voyage DANS le contenu chiffré (`E2EEContent.language`). Les
 * statistiques de langue de la conversation reçoivent la langue PERSISTÉE.
 *
 * La contre-analyse AFFIRMAIT le défaut (`note: SENTINEL` et `originalLanguage:
 * 'en'` écrits sur la ligne) ; le témoin est inversé ici.
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
import { conversationStatsService } from '../../ConversationStatsService';
import { conversationMessageStatsService } from '../../ConversationMessageStatsService';

const SENTINEL = 'sentinelle-secrete-42';

const sealedSend = (extraMetadata: Record<string, unknown>, originalLanguage?: string) => ({
  conversationId: CONVERSATION, content: '', clientMessageId: 'cid_00000000-0000-4000-8000-000000000012',
  ...(originalLanguage ? { originalLanguage } : {}),
  encryptedPayload: {
    ciphertext: LIBSIGNAL_PROTOCOL, mode: 'e2ee', protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1, regimeEpoch: 0, ...extraMetadata,
    relay: {
      protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1, sessionId: ALICE_SESSION, unapprovedOwnDevices: [],
      envelopes: [{ userId: BOB, deviceId: 1, registrationId: 222, type: 3, body: Buffer.from('opaque').toString('base64') }],
    },
  },
}) as unknown as MessageRequest;

const postSaveEffects = async () => {
  for (const _turn of Array.from({ length: 5 })) await new Promise((resolve) => setImmediate(resolve));
};

afterEach(() => jest.clearAllMocks());

describe('GW-12 — la ligne d’un message chiffré de bout en bout ne garde rien de libre', () => {
  it('une clé libre de la métadonnée et la langue déclarée ne s’écrivent pas : le message passe, la ligne garde la liste blanche', async () => {
    const h = createSendHarness({ encryptionMode: 'e2ee' });

    const response = await h.service.handleMessage(sealedSend({ note: SENTINEL, mode: 'server' }, 'en'), ALICE_PARTICIPANT);

    expect(response.success).toBe(true);
    const row = h.messages[0] as { encryptionMetadata: unknown; encryptionMode: string; originalLanguage: string };
    expect(row.encryptionMetadata).toEqual({ mode: 'e2ee', protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1, regimeEpoch: 0 });
    expect(row.encryptionMode).toBe('e2ee');
    expect(row.originalLanguage).toBe('fr');
    expect(JSON.stringify(h.writes)).not.toContain(SENTINEL);
    expect(h.store.collections.MessageEnvelope.rows).toHaveLength(1);
  });

  it('les statistiques de langue de la conversation reçoivent la constante de la ligne, jamais la langue déclarée', async () => {
    const h = createSendHarness({ encryptionMode: 'e2ee' });

    await h.service.handleMessage(sealedSend({}, 'en'), ALICE_PARTICIPANT);
    await postSaveEffects();

    const languages = [
      ...(conversationStatsService.updateOnNewMessage as jest.Mock).mock.calls.map((call) => call[2]),
      ...(conversationMessageStatsService.onNewMessage as jest.Mock).mock.calls.map((call) => call[5]),
    ];
    expect(languages.length).toBeGreaterThan(0);
    expect(languages).not.toContain('en');
    expect(new Set(languages)).toEqual(new Set(['fr']));
  });
});
