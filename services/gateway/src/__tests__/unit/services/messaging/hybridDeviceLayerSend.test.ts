/**
 * @jest-environment node
 *
 * #14369 — le mode HYBRIDE chiffre réellement deux fois. Un envoi hybride porte
 * le texte en clair (la couche SERVEUR : scellée au repos par la passerelle,
 * qui la traduit, l'indexe et l'édite) ET une couche APPAREIL libsignal (une
 * enveloppe opaque par appareil, admise par Sesame comme un envoi `e2ee`).
 *
 * Matrice d'admission : régime (aucun, server, hybrid, e2ee) × porteur (clair,
 * couche appareil, chiffré + relais). Ce que la base reçoit (aucun octet clair,
 * ni sur la ligne ni dans les enveloppes), ce qui est distribué (une enveloppe
 * par appareil, à SA room), ce que les journaux voient (rien du texte).
 */
import { describe, it, expect, jest, beforeEach, afterAll, afterEach } from '@jest/globals';
import type { PrismaClient, Message } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { HYBRID_DEVICE_LAYER_METADATA_KEY, type E2EEDeviceLayerRequest, type E2EEServedEnvelope } from '@meeshy/shared/types/e2ee-directory';

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
import { clientDeclaredMetadata } from '../../../../services/messaging/clientDeclaredMetadata';
import { EncryptionService } from '../../../../services/EncryptionService';
import { revealAtRest } from '../../../../services/messaging/serverAtRest';
import { E2EE_PLAINTEXT_REFUSED } from '../../../../services/messaging/e2eePlaintextAdmission';
import { setE2EEEnvelopeIOProvider } from '../../../../services/e2ee/envelope-delivery';
import { createFakeE2EEStore } from '../../../../services/e2ee/__tests__/fake-e2ee-store';

const CONV_ID = '507f1f77bcf86cd799439011';
const SENDER_PARTICIPANT = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439033';
const SENDER_USER = '507f1f77bcf86cd799439055';
const PEER_USER = '507f1f77bcf86cd799439077';
const THIRD_USER = '507f1f77bcf86cd799439088';
const SENDER_SESSION = '507f1f77bcf86cd799439066';
const SECRET = 'Code de la porte : 4471, ne le dis à personne';
const SEALED_BODY_FOR_PEER = 'b3BhcXVlLXBvdXItbGUtcGFpcg==';
const SEALED_BODY_FOR_THIRD = 'b3BhcXVlLXBvdXItbGUtdGllcnM=';
const MASTER = Buffer.alloc(32, 3).toString('base64');
const savedKey = process.env.ENCRYPTION_MASTER_KEY;

type Mode = 'server' | 'hybrid' | 'e2ee' | null;
type Regime = { encryptionMode: Mode; encryptionEnabledAt: Date | null; serverEncryptionKeyId: string | null; encryptionEpoch: number };

const regimeOf = (mode: Mode, epoch = 0): Regime => ({
  encryptionMode: mode, encryptionEnabledAt: mode ? new Date('2026-11-01T00:00:00Z') : null, serverEncryptionKeyId: null, encryptionEpoch: epoch,
});

type Member = { readonly userId: string; readonly deviceId: number; readonly registrationId: number };
const PEER: Member = { userId: PEER_USER, deviceId: 1, registrationId: 31 };
const THIRD: Member = { userId: THIRD_USER, deviceId: 2, registrationId: 41 };

function harness(params: { regime: Regime; peers?: readonly Member[]; senderRegistered?: boolean }) {
  const keys = new Map<string, Record<string, unknown>>();
  const created: Array<{ data: Record<string, unknown> }> = [];
  const store = createFakeE2EEStore();
  store.collections.E2EEDevice.insert({ userId: SENDER_USER, deviceId: 1, registrationId: 7, sessionId: SENDER_SESSION });
  store.collections.Participant.insert({ conversationId: CONV_ID, userId: SENDER_USER });
  (params.peers ?? [PEER]).forEach((peer) => {
    store.collections.E2EEDevice.insert({ userId: peer.userId, deviceId: peer.deviceId, registrationId: peer.registrationId, sessionId: `s-${peer.userId}` });
    store.collections.Participant.insert({ conversationId: CONV_ID, userId: peer.userId });
  });
  const prisma = {
    e2EEDevice: store.prisma.e2EEDevice,
    messageEnvelope: store.prisma.messageEnvelope,
    conversation: {
      findUnique: jest.fn(async () => params.regime),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    message: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        created.push(args);
        return { id: MSG_ID, createdAt: new Date(), updatedAt: new Date(), translations: null, attachments: [], ...args.data } as unknown as Message;
      }),
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
      delete: jest.fn(async () => ({})),
    },
    messageAttachment: { findMany: jest.fn(async () => []), updateMany: jest.fn(async () => ({})) },
    participant: {
      findUnique: jest.fn(async () => (params.senderRegistered === false ? { userId: null } : { userId: SENDER_USER })),
      findFirst: jest.fn(async () => null),
      findMany: store.prisma.participant.findMany,
    },
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
  return { prisma, created, keys, store, processor: new MessageProcessor(prisma) };
}

const envelopeFor = (member: Member, body: string) => ({
  userId: member.userId, deviceId: member.deviceId, registrationId: member.registrationId, type: 3 as const, body,
});

const deviceLayer = (envelopes = [envelopeFor(PEER, SEALED_BODY_FOR_PEER)], regimeEpoch?: number): E2EEDeviceLayerRequest => ({
  relay: { protocol: 'libsignal-v1', senderDeviceId: 1, sessionId: SENDER_SESSION, envelopes, unapprovedOwnDevices: [] },
  ...(regimeEpoch === undefined ? {} : { regimeEpoch }),
});

const send = (overrides: Record<string, unknown> = {}) => ({
  conversationId: CONV_ID, senderId: SENDER_PARTICIPANT, content: SECRET, originalLanguage: 'fr', ...overrides,
});

const emitted: Array<{ room: string; envelope: E2EEServedEnvelope }> = [];

beforeEach(() => {
  logged.length = 0;
  emitted.length = 0;
  process.env.ENCRYPTION_MASTER_KEY = MASTER;
  setE2EEEnvelopeIOProvider(() => ({
    to: (room: string) => ({
      emit: (event: string, envelope: E2EEServedEnvelope) => {
        if (event === SERVER_EVENTS.E2EE_ENVELOPE) emitted.push({ room, envelope });
        return true;
      },
    }),
    in: () => ({ fetchSockets: async () => [], socketsLeave: () => undefined }),
  }));
});

afterEach(() => setE2EEEnvelopeIOProvider(() => null));

afterAll(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = savedKey;
});

describe('hybride avec couche appareil : les DEUX couches sont admises', () => {
  it('la ligne est scellée au repos comme en server, et garde le mode hybrid', async () => {
    const h = harness({ regime: regimeOf('hybrid') });
    await h.processor.saveMessage(send({ deviceLayerRelay: deviceLayer() }));

    const row = h.created[0].data;
    expect(row).toMatchObject({ content: '', isEncrypted: true, encryptionMode: 'hybrid' });
    expect(JSON.stringify({ row, keys: [...h.keys.values()] })).not.toContain('personne');
  });

  it('un autre membre relit le clair depuis la ligne persistée (traduction, recherche, édition continuent)', async () => {
    const h = harness({ regime: regimeOf('hybrid') });
    const served = await h.processor.saveMessage(send({ deviceLayerRelay: deviceLayer() }));

    expect(served).toMatchObject({ content: SECRET, encryptionMode: 'hybrid' });
    const persisted = { id: MSG_ID, ...h.created[0].data } as unknown as Message;
    expect(await revealAtRest(persisted, new EncryptionService(h.prisma))).toMatchObject({ content: SECRET });
  });

  it('range une enveloppe par appareil destinataire, telle qu’envoyée, sans aucun octet clair', async () => {
    const h = harness({ regime: regimeOf('hybrid') });
    await h.processor.saveMessage(send({ deviceLayerRelay: deviceLayer() }));

    const rows = await h.store.prisma.messageEnvelope.findMany({ where: { messageId: MSG_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      messageId: MSG_ID, conversationId: CONV_ID, recipientUserId: PEER_USER, recipientDeviceId: 1,
      recipientRegistrationId: 31, senderUserId: SENDER_USER, senderDeviceId: 1, body: SEALED_BODY_FOR_PEER,
    });
    expect(JSON.stringify(rows)).not.toContain('personne');
  });

  it('distribue chaque enveloppe à la room de SON appareil', async () => {
    const h = harness({ regime: regimeOf('hybrid') });
    await h.processor.saveMessage(send({ deviceLayerRelay: deviceLayer() }));

    expect(emitted).toHaveLength(1);
    expect(emitted[0].room).toContain(PEER_USER);
    expect(emitted[0].envelope).toMatchObject({ messageId: MSG_ID, body: SEALED_BODY_FOR_PEER });
  });

  it('dit sur la ligne que la couche appareil est présente', async () => {
    const h = harness({ regime: regimeOf('hybrid') });
    await h.processor.saveMessage(send({ deviceLayerRelay: deviceLayer() }));

    expect(h.created[0].data.metadata).toMatchObject({ deviceLayer: 'libsignal-v1' });
  });

  it('un groupe hybride reçoit une enveloppe par appareil de chaque membre (fan-out par paire)', async () => {
    const h = harness({ regime: regimeOf('hybrid'), peers: [PEER, THIRD] });
    await h.processor.saveMessage(send({
      deviceLayerRelay: deviceLayer([envelopeFor(PEER, SEALED_BODY_FOR_PEER), envelopeFor(THIRD, SEALED_BODY_FOR_THIRD)]),
    }));

    const rows = await h.store.prisma.messageEnvelope.findMany({ where: { messageId: MSG_ID } });
    expect(rows.map((row) => row.recipientUserId).sort()).toEqual([PEER_USER, THIRD_USER].sort());
    expect(emitted).toHaveLength(2);
  });

  it('aucun journal ne voit le texte', async () => {
    const h = harness({ regime: regimeOf('hybrid') });
    await h.processor.saveMessage(send({ deviceLayerRelay: deviceLayer() }));
    expect(JSON.stringify(logged)).not.toContain('personne');
  });
});

describe('hybride sans couche appareil : la couche serveur seule reste admise', () => {
  it('un client sans libsignal (Android, web, ancien iOS) envoie toujours', async () => {
    const h = harness({ regime: regimeOf('hybrid') });
    const served = await h.processor.saveMessage(send());

    expect(served).toMatchObject({ content: SECRET, encryptionMode: 'hybrid' });
    expect(h.created[0].data).toMatchObject({ content: '', isEncrypted: true, encryptionMode: 'hybrid' });
    expect(await h.store.prisma.messageEnvelope.findMany({ where: { messageId: MSG_ID } })).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });

  it('la ligne ne prétend aucune couche appareil', async () => {
    const h = harness({ regime: regimeOf('hybrid') });
    await h.processor.saveMessage(send());
    const metadata = (h.created[0].data.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.deviceLayer).toBeUndefined();
  });

  it('un marqueur deviceLayer FORGÉ par le client (metadata brut, lieu, sticker) ne se range jamais sur la ligne', async () => {
    const h = harness({ regime: regimeOf('hybrid') });
    await h.processor.saveMessage(send({
      metadata: { deviceLayer: 'libsignal-v1' },
      deviceLayer: 'libsignal-v1',
      location: { deviceLayer: 'libsignal-v1' },
      sticker: { deviceLayer: 'libsignal-v1' },
    }));
    const metadata = (h.created[0].data.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.deviceLayer).toBeUndefined();
  });
});

describe('le marqueur deviceLayer n’est pas une métadonnée déclarable par le client', () => {
  it('clientDeclaredMetadata ignore une clé deviceLayer et ne rend que ses blocs parsés', () => {
    const forged: Record<string, unknown> = { deviceLayer: 'libsignal-v1', metadata: { deviceLayer: 'libsignal-v1' } };
    const declared = clientDeclaredMetadata(forged, { endToEnd: false }) as Record<string, unknown>;
    expect(declared).toEqual({});
    expect(Object.keys(declared)).not.toContain(HYBRID_DEVICE_LAYER_METADATA_KEY);
  });
});

describe('la couche appareil d’un hybride est jugée comme un envoi e2ee', () => {
  it('une liste d’appareils qui ne couvre pas l’annuaire est refusée 409, rien n’est écrit', async () => {
    const h = harness({ regime: regimeOf('hybrid'), peers: [PEER, THIRD] });
    await expect(h.processor.saveMessage(send({ deviceLayerRelay: deviceLayer() })))
      .rejects.toMatchObject({ code: 'E2EE_DEVICES_MISMATCH', status: 409 });
    expect(h.created).toHaveLength(0);
  });

  it('une couche scellée sous une époque périmée est refusée E2EE_REGIME_CHANGED', async () => {
    const h = harness({ regime: regimeOf('hybrid', 2) });
    await expect(h.processor.saveMessage(send({ deviceLayerRelay: deviceLayer(undefined, 1) })))
      .rejects.toMatchObject({ code: 'E2EE_REGIME_CHANGED', status: 409 });
    expect(h.created).toHaveLength(0);
  });

  it('un expéditeur non inscrit n’a pas de couche appareil', async () => {
    const h = harness({ regime: regimeOf('hybrid'), senderRegistered: false });
    await expect(h.processor.saveMessage(send({ deviceLayerRelay: deviceLayer() })))
      .rejects.toMatchObject({ code: 'E2EE_DEVICE_NOT_BOUND', status: 403 });
    expect(h.created).toHaveLength(0);
  });
});

describe('un clair accompagné d’une couche appareil n’entre QUE dans une conversation hybride', () => {
  it.each([null, 'server'] as const)('régime %s : refusé E2EE_REGIME_CHANGED, rien n’est écrit', async (mode) => {
    const h = harness({ regime: regimeOf(mode) });
    await expect(h.processor.saveMessage(send({ deviceLayerRelay: deviceLayer() })))
      .rejects.toMatchObject({ code: 'E2EE_REGIME_CHANGED', status: 409 });
    expect(h.created).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });

  it('régime e2ee : le clair est refusé fail-closed, avant toute enveloppe', async () => {
    const h = harness({ regime: regimeOf('e2ee') });
    await expect(h.processor.saveMessage(send({ deviceLayerRelay: deviceLayer() })))
      .rejects.toMatchObject({ code: E2EE_PLAINTEXT_REFUSED });
    expect(h.created).toHaveLength(0);
  });

  it('régime e2ee : une couche appareil sans clair ni chiffré est refusée E2EE_REGIME_CHANGED', async () => {
    const h = harness({ regime: regimeOf('e2ee') });
    await expect(h.processor.saveMessage(send({ content: '', deviceLayerRelay: deviceLayer() })))
      .rejects.toMatchObject({ code: 'E2EE_REGIME_CHANGED', status: 409 });
    expect(h.created).toHaveLength(0);
  });

  it('régime hybrid : un chiffré client accompagné de son relais reste refusé E2EE_REGIME_CHANGED', async () => {
    const h = harness({ regime: regimeOf('hybrid') });
    await expect(h.processor.saveMessage(send({
      content: '[Encrypted]',
      encryptedContent: 'libsignal-v1',
      encryptionMetadata: { mode: 'e2ee', protocol: 'libsignal-v1', senderDeviceId: 1 },
      e2eeRelay: deviceLayer().relay,
    }))).rejects.toMatchObject({ code: 'E2EE_REGIME_CHANGED', status: 409 });
    expect(h.created).toHaveLength(0);
  });
});
