/**
 * #13114 / #14647 — la charge push ne transporte JAMAIS un chiffré que le
 * destinataire ne doit pas ouvrir.
 *
 * En `server` et `hybrid`, `Message.encryptedContent` est le chiffré AU REPOS,
 * scellé sous la clé de la conversation que seule la passerelle détient : il
 * ne quitte pas le serveur (`serverAtRest.ts`), ni vers Apple, ni vers Google.
 * En `e2ee`, c'est l'enveloppe scellée par l'appareil de l'expéditeur, que la
 * NSE ouvre avec ses propres clés : elle voyage, et elle seule.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { notifyMessageRecipients } from '../../../../services/messaging/messageNotificationFanOut';

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';
const SENDER_PART_ID = '507f1f77bcf86cd799439031';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const PEER_USER_ID = '507f1f77bcf86cd799439042';

const AT_REST_CIPHERTEXT = 'c2VydmVyLWF0LXJlc3QtYWVzLWdjbQ==';
const DEVICE_ENVELOPE = 'ZGV2aWNlLXNlYWxlZC1lbnZlbG9wZQ==';

function makePrisma(conversationMode: string | null) {
  return {
    participant: {
      findUnique: jest.fn<any>().mockResolvedValue({ userId: SENDER_USER_ID, displayName: 'Alice', avatar: null }),
    },
    user: { findUnique: jest.fn<any>().mockResolvedValue({ username: 'alice', displayName: 'Alice', avatar: null }) },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        title: 'Salon',
        type: 'group',
        encryptionMode: conversationMode,
        participants: [{ userId: PEER_USER_ID, messageRequestAt: null }],
      }),
    },
    message: { findUnique: jest.fn<any>().mockResolvedValue({ deletedAt: null }) },
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

function makeNotificationService() {
  return {
    createReplyNotification: jest.fn<any>().mockResolvedValue(null),
    createMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
    createMessageNotification: jest.fn<any>().mockResolvedValue(null),
  };
}

async function pushParamsFor(params: {
  conversationMode: string | null;
  messageMode: string | null;
  encryptedContent: string | null;
}): Promise<Record<string, unknown>> {
  const notificationService = makeNotificationService();
  await notifyMessageRecipients({
    prisma: makePrisma(params.conversationMode) as any,
    notificationService,
    message: {
      id: MSG_ID,
      messageType: 'text',
      replyToId: null,
      isEncrypted: params.encryptedContent !== null,
      encryptionMode: params.messageMode,
      isViewOnce: false,
      isBlurred: false,
      effectFlags: 0,
      expiresAt: null,
      createdAt: new Date('2026-11-02T10:00:00Z'),
      encryptedContent: params.encryptedContent,
    },
    senderParticipantId: SENDER_PART_ID,
    conversationId: CONV_ID,
    processedContent: 'bonjour',
  });
  expect(notificationService.createMessageNotification).toHaveBeenCalledTimes(1);
  return notificationService.createMessageNotification.mock.calls[0][0] as Record<string, unknown>;
}

describe('#13114 — le chiffré au repos ne part jamais dans la charge push', () => {
  it.each(['server', 'hybrid'])('mode %s : aucun encryptedContent ne part vers le push', async (mode) => {
    const sent = await pushParamsFor({ conversationMode: mode, messageMode: mode, encryptedContent: AT_REST_CIPHERTEXT });

    expect(sent.encryptedContent).toBeUndefined();
    expect(JSON.stringify(sent)).not.toContain(AT_REST_CIPHERTEXT);
  });

  it('mode server lu en CAPITALES : le chiffré au repos reste au serveur', async () => {
    const sent = await pushParamsFor({ conversationMode: 'SERVER', messageMode: 'SERVER', encryptedContent: AT_REST_CIPHERTEXT });

    expect(JSON.stringify(sent)).not.toContain(AT_REST_CIPHERTEXT);
  });

  it('une ligne server dans une conversation passée en e2ee garde son chiffré au serveur : le mode de la LIGNE décide', async () => {
    const sent = await pushParamsFor({ conversationMode: 'e2ee', messageMode: 'server', encryptedContent: AT_REST_CIPHERTEXT });

    expect(JSON.stringify(sent)).not.toContain(AT_REST_CIPHERTEXT);
  });

  it.each(['e2ee', 'E2EE'])('mode %s : l’enveloppe de l’appareil voyage, seule, sous un aperçu protégé', async (mode) => {
    const sent = await pushParamsFor({ conversationMode: mode, messageMode: mode, encryptedContent: DEVICE_ENVELOPE });

    expect(sent.encryptedContent).toBe(DEVICE_ENVELOPE);
    expect(sent.messagePreview).not.toContain('bonjour');
    expect(sent.notificationLocKey).toBeDefined();
  });

  it('ligne héritée sans mode dans une conversation e2ee : l’enveloppe est celle de l’appareil, elle voyage', async () => {
    const sent = await pushParamsFor({ conversationMode: 'e2ee', messageMode: null, encryptedContent: DEVICE_ENVELOPE });

    expect(sent.encryptedContent).toBe(DEVICE_ENVELOPE);
  });

  it('conversation en clair : rien de chiffré ne part', async () => {
    const sent = await pushParamsFor({ conversationMode: null, messageMode: null, encryptedContent: null });

    expect(sent.encryptedContent).toBeUndefined();
  });
});
