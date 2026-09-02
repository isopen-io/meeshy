/**
 * Fabriques de `message-new-producer-parity.test.ts` — sorties du fichier le
 * 2026-09-02 parce que le témoin `sticker` (#4823) l'avait fait passer de
 * 1 000 à 1 015 lignes, au-dessus du cliquet de #4531 (`DETTE_HERITEE` le gèle
 * à 1 000 exactement). Découpe par RESPONSABILITÉ : ces trois fabriques sont
 * pures — aucune ne lit l'état des doubles `jest.mock` du fichier hôte, qui
 * garde `getIoState()` pour cette raison.
 *
 * `eslint-disable` : le harnais manipule des doubles `any`, comme l'hôte.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

export function makeTranslationService() {
  return Object.assign(new EventEmitter(), {
    initialize: jest.fn().mockResolvedValue(undefined),
    healthCheck: jest.fn().mockResolvedValue(true),
    close: jest.fn().mockResolvedValue(undefined),
    getStats: jest.fn().mockReturnValue({ messages: 0, translationRequests: 0 }),
    getZmqClient: jest.fn().mockReturnValue(null),
    getTranslation: jest.fn().mockResolvedValue(null),
    handleNewMessage: jest.fn().mockResolvedValue(undefined),
  });
}

export function makePrisma(): any {
  const fn = () => jest.fn() as any;
  return {
    conversation: { findUnique: fn().mockResolvedValue(null) },
    message: { findUnique: fn().mockResolvedValue(null), findFirst: fn().mockResolvedValue(null) },
    // `broadcastNewMessage` consulte le post cité quand `storyReplyToId` est
    // posé sans snapshot. Sans cette table le double lèverait un TypeError
    // avalé par le `try` du broadcast — donc aucune émission, donc un témoin
    // qui tombe pour la mauvaise raison.
    post: { findUnique: fn().mockResolvedValue(null) },
    messageAttachment: { findUnique: fn().mockResolvedValue(null) },
    participant: {
      findMany: fn().mockResolvedValue([]),
      findFirst: fn().mockResolvedValue(null),
      findUnique: fn().mockResolvedValue(null),
    },
    user: { findUnique: fn().mockResolvedValue(null), findMany: fn().mockResolvedValue([]) },
  };
}


export const CONVERSATION_ID = 'conv-123456789012';

/**
 * Message de référence : il porte UNE valeur de chaque famille du contrat de
 * fil, pour qu'aucun producteur ne puisse rester vert en omettant une famille
 * entière. `content` est VIDE parce que c'est ce que `MessageProcessor` écrit
 * pour un message chiffré (`content: isEncrypted ? '' : …`) — le texte vit
 * dans `encryptedContent`, et un destinataire qui ne reçoit pas l'enveloppe
 * E2EE reçoit donc une bulle VIDE, pas un message dégradé.
 */
export function makeContractMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-123456789012',
    conversationId: CONVERSATION_ID,
    senderId: 'sender-participantId',
    content: '',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: new Date('2026-08-22T10:00:00.000Z'),
    updatedAt: new Date('2026-08-22T10:00:00.000Z'),
    translations: [],
    attachments: [],
    validatedMentions: [],
    sender: {
      id: 'sender-participantId',
      userId: 'sender-userId',
      displayName: 'Alice',
      avatar: null,
      type: 'member',
      user: { id: 'sender-userId', username: 'alice', firstName: 'Ali', lastName: 'Ce', avatar: null },
    },
    isEncrypted: true,
    encryptionMode: 'e2ee',
    encryptedContent: 'Y2lwaGVydGV4dA==',
    encryptionMetadata: { iv: 'aXY=', authTag: 'dGFn' },
    isViewOnce: true,
    maxViewOnceCount: 3,
    forwardedFromId: 'msg-forwarded-source',
    forwardedFromConversationId: 'conv-forwarded-source',
    storyReplyToId: 'post-999999999999',
    ...overrides,
  } as any;
}
