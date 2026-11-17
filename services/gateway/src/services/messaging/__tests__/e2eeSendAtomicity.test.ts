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
 * STRICT depuis l'audit de #19080 (E2) : la transaction tient ses lignes ET ses
 * enveloppes dans un tampon versé au magasin à la validation, cette validation
 * peut échouer APRÈS le rappel, et un abandon ne défait que le tampon. Une
 * enveloppe écrite hors de la transaction (mutant M1-b) ou une distribution
 * faite avant la validation (mutant M1-c) restent donc visibles : les témoins
 * ci-dessous rougissent sur l'une comme sur l'autre.
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

  // #12548 — le renvoi CONCURRENT (réessai réseau, repli socket après un REST
  // lent) arrive pendant que la première écriture attend ses enveloppes. Avant,
  // la ligne déjà écrite le faisait répondre « doublon réussi », puis la
  // première échouait et l'effaçait : un message annoncé envoyé qui n'existait plus.
  describe('un renvoi concurrent, pendant que la première écriture est en vol', () => {
    const heldEnvelopeWrite = (outcome: 'fails' | 'succeeds') => {
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => { release = resolve; });
      const state = { writes: 0 };
      const envelopeCreateMany = async (args: unknown, write: (args: unknown) => Promise<unknown>) => {
        state.writes += 1;
        if (state.writes > 1) return write(args);
        await held;
        if (outcome === 'fails') throw new Error('mongo: write concern timeout');
        return write(args);
      };
      return { envelopeCreateMany, release: () => release(), firstWriteInFlight: () => state.writes === 1 };
    };

    const until = async (condition: () => boolean): Promise<void> => {
      const turns = Array.from({ length: 200 });
      for (const _turn of turns) {
        if (condition()) return;
        await new Promise((resolve) => setImmediate(resolve));
      }
      throw new Error('la première écriture n’a jamais atteint ses enveloppes');
    };

    it('ne se déclare jamais réussi quand la première échoue : aucune ligne, aucune enveloppe, et le renvoi suivant aboutit', async () => {
      const writer = heldEnvelopeWrite('fails');
      const h = createSendHarness({ encryptionMode: 'e2ee', envelopeCreateMany: writer.envelopeCreateMany });

      const first = h.service.handleMessage(libsignalSend(cid(4)), ALICE_PARTICIPANT);
      await until(writer.firstWriteInFlight);
      const concurrent = await h.service.handleMessage(libsignalSend(cid(4)), ALICE_PARTICIPANT);
      writer.release();
      const firstResponse = await first;

      expect(concurrent.success).toBe(false);
      expect(firstResponse.success).toBe(false);
      expect(h.messages).toHaveLength(0);
      expect(h.store.collections.MessageEnvelope.rows).toHaveLength(0);

      const later = await h.service.handleMessage(libsignalSend(cid(4)), ALICE_PARTICIPANT);
      expect(later.success).toBe(true);
      expect(h.store.collections.MessageEnvelope.rows).toHaveLength(1);
    });

    it('quand la première aboutit, il n’écrit ni seconde ligne ni seconde enveloppe, et un renvoi ultérieur est une déduplication', async () => {
      const writer = heldEnvelopeWrite('succeeds');
      const h = createSendHarness({ encryptionMode: 'e2ee', envelopeCreateMany: writer.envelopeCreateMany });

      const first = h.service.handleMessage(libsignalSend(cid(5)), ALICE_PARTICIPANT);
      await until(writer.firstWriteInFlight);
      const concurrent = await h.service.handleMessage(libsignalSend(cid(5)), ALICE_PARTICIPANT);
      writer.release();
      const firstResponse = await first;
      const later = await h.service.handleMessage(libsignalSend(cid(5)), ALICE_PARTICIPANT);

      expect(concurrent.success).toBe(false);
      expect(firstResponse.success).toBe(true);
      expect(later.success).toBe(true);
      expect(h.messages).toHaveLength(1);
      expect(h.store.collections.MessageEnvelope.rows).toEqual([
        expect.objectContaining({ messageId: h.messages[0].id, recipientUserId: BOB }),
      ]);
      expect(h.emitted).toHaveLength(1);
    });
  });

  describe('la validation de la transaction échoue APRÈS le rappel (audit de #19080, E2)', () => {
    const writeConflict = () => Object.assign(new Error('Transaction failed due to a write conflict or a deadlock'), { code: 'P2034' });
    const transactionTimeout = () => Object.assign(new Error('Transaction already closed: the timeout was reached'), { code: 'P2028' });

    it.each([
      ['un conflit d’écriture à la validation (P2034)', writeConflict],
      ['un délai de transaction dépassé (P2028)', transactionTimeout],
      ['une élection du jeu de réplicas', replicaSetElection],
    ])('%s : rien ne reste et rien ne part — ni ligne, ni enveloppe, ni émission', async (_label, failure) => {
      const h = createSendHarness({ encryptionMode: 'e2ee', commitFailure: failure });

      const response = await h.service.handleMessage(libsignalSend(cid(9)), ALICE_PARTICIPANT);

      expect(response.success).toBe(false);
      expect(h.messages).toHaveLength(0);
      expect(h.store.collections.MessageEnvelope.rows).toHaveLength(0);
      expect(h.emitted).toHaveLength(0);
    });

    it('le renvoi après une validation manquée range son enveloppe et la distribue, une fois', async () => {
      const outcomes = [writeConflict(), null];
      const h = createSendHarness({ encryptionMode: 'e2ee', commitFailure: () => outcomes.shift() ?? null });

      const first = await h.service.handleMessage(libsignalSend(cid(10)), ALICE_PARTICIPANT);
      const retry = await h.service.handleMessage(libsignalSend(cid(10)), ALICE_PARTICIPANT);

      expect(first.success).toBe(false);
      expect(retry.success).toBe(true);
      expect(h.messages).toHaveLength(1);
      expect(h.store.collections.MessageEnvelope.rows).toEqual([
        expect.objectContaining({ messageId: h.messages[0].id, recipientUserId: BOB, recipientDeviceId: 1 }),
      ]);
      expect(h.emitted).toEqual([
        expect.objectContaining({ room: ROOMS.device(BOB, 1, 222), event: SERVER_EVENTS.E2EE_ENVELOPE }),
      ]);
    });
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
