/**
 * Constat GW-05 de la revue E2EE du 2026-11-17 (#18906) — un message chiffré
 * ne naît jamais sans ses enveloppes. La ligne `Message` et ses
 * `MessageEnvelope` s'écrivent ENSEMBLE ou pas du tout : l'expéditeur qui
 * renvoie au même `clientMessageId` après un échec voit son enveloppe rangée et
 * distribuée, jamais un succès de déduplication sur une ligne que personne ne
 * peut ouvrir.
 *
 * Le témoin AFFIRMAIT le défaut dans la contre-analyse : enveloppes en échec,
 * suppression de rattrapage en échec (élection du jeu de réplicas) ⇒ la ligne
 * restait, et le renvoi rendait `success: true` avec zéro enveloppe et zéro
 * émission. Il est inversé ici.
 *
 * Banc : le vrai `MessagingService` sur un double Prisma (`e2ee-send-harness.ts`),
 * dont `$transaction` défait ce que son rappel a écrit quand il lève.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import type { MessageRequest } from '@meeshy/shared/types';
import { LIBSIGNAL_PROTOCOL } from '@meeshy/shared/types/e2ee-directory';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

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

const cid = (n: number) => `cid_00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

const libsignalSend = (clientMessageId: string) => ({
  conversationId: CONVERSATION, content: '', clientMessageId,
  encryptedPayload: {
    ciphertext: LIBSIGNAL_PROTOCOL, mode: 'e2ee', protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1, regimeEpoch: 0,
    relay: {
      protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1, sessionId: ALICE_SESSION, unapprovedOwnDevices: [],
      envelopes: [{ userId: BOB, deviceId: 1, registrationId: 222, type: 3, body: Buffer.from('opaque').toString('base64') }],
    },
  },
}) as unknown as MessageRequest;

const replicaSetElection = () => new Error('mongo: not primary');

afterEach(() => jest.clearAllMocks());

describe('GW-05 — un message chiffré ne naît jamais sans ses enveloppes', () => {
  it('les enveloppes ne s’écrivent pas : la ligne non plus, même quand une suppression de rattrapage échouerait', async () => {
    const h = createSendHarness({
      encryptionMode: 'e2ee',
      envelopeCreateMany: async () => { throw new Error('mongo: write concern timeout'); },
      messageDelete: async () => { throw replicaSetElection(); },
    });

    const response = await h.service.handleMessage(libsignalSend(cid(1)), ALICE_PARTICIPANT);

    expect(response.success).toBe(false);
    expect(h.messages).toHaveLength(0);
    expect(h.store.collections.MessageEnvelope.rows).toHaveLength(0);
    expect(h.emitted).toHaveLength(0);
  });

  it('le renvoi au même clientMessageId range son enveloppe et la distribue à l’appareil visé', async () => {
    let envelopesFail = true;
    const h = createSendHarness({
      encryptionMode: 'e2ee',
      envelopeCreateMany: async (args, write) => {
        if (envelopesFail) throw new Error('mongo: write concern timeout');
        return write(args);
      },
      messageDelete: async () => { throw replicaSetElection(); },
    });

    const first = await h.service.handleMessage(libsignalSend(cid(2)), ALICE_PARTICIPANT);
    envelopesFail = false;
    const retry = await h.service.handleMessage(libsignalSend(cid(2)), ALICE_PARTICIPANT);

    expect(first.success).toBe(false);
    expect(retry.success).toBe(true);
    expect(h.messages).toHaveLength(1);
    expect(h.store.collections.MessageEnvelope.rows).toEqual([
      expect.objectContaining({ messageId: h.messages[0].id, recipientUserId: BOB, recipientDeviceId: 1, recipientRegistrationId: 222 }),
    ]);
    expect(h.emitted).toEqual([
      expect.objectContaining({ room: ROOMS.device(BOB, 1, 222), event: SERVER_EVENTS.E2EE_ENVELOPE }),
    ]);
  });

  it('un renvoi d’un envoi DÉJÀ abouti reste une déduplication : ni seconde ligne, ni seconde enveloppe', async () => {
    const h = createSendHarness({ encryptionMode: 'e2ee' });

    const first = await h.service.handleMessage(libsignalSend(cid(3)), ALICE_PARTICIPANT);
    const retry = await h.service.handleMessage(libsignalSend(cid(3)), ALICE_PARTICIPANT);

    expect(first.success).toBe(true);
    expect(retry.success).toBe(true);
    expect(h.messages).toHaveLength(1);
    expect(h.store.collections.MessageEnvelope.rows).toHaveLength(1);
    expect(h.emitted).toHaveLength(1);
  });
});
