import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { Message, Participant } from '@/lib/api/types';

import { pendingAttachmentOf } from './attachments';
import { confirmedMessageOf, localMessageOf } from './local-message';

// `File`/`URL.createObjectURL`, requis par `attachmentPreviewOf` — DOM réel.
beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

const sender: Participant = {
  id: 'p-viewer',
  conversationId: 'c-a',
  userId: 'u-viewer',
  type: 'user',
  role: 'member',
  displayName: 'Vous',
  language: 'fr',
  permissions: {
    canSendMessages: true,
    canSendFiles: true,
    canSendImages: true,
    canSendVideos: true,
    canSendAudios: true,
    canSendLocations: true,
    canSendLinks: true,
  },
  isActive: true,
  isOnline: true,
  joinedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('localMessageOf', () => {
  const now = new Date('2026-09-09T10:00:00.000Z');

  test('id === clientMessageId, clientMessageId posé, les défauts « en attente »', () => {
    const local = localMessageOf({
      clientMessageId: 'cid_1',
      conversationId: 'c-a',
      viewerId: 'u-viewer',
      content: 'bonjour',
      originalLanguage: 'en',
      now,
    });
    expect(local.id).toBe('cid_1');
    expect(local.clientMessageId).toBe('cid_1');
    expect(local.deliveredCount).toBe(0);
    expect(local.readCount).toBe(0);
    expect(local.translations).toEqual([]);
    expect(local.messageType).toBe('text');
    expect(local.messageSource).toBe('user');
    expect(local.isViewOnce).toBe(false);
    expect(local.isBlurred).toBe(false);
    expect(local.createdAt).toBe(now);
    expect(local.timestamp).toBe(now);
    // Leçon 261 : jamais 'fr' par accident — la langue REÇUE, ici 'en'.
    expect(local.originalLanguage).toBe('en');
  });

  test('sender seulement si fourni', () => {
    const withSender = localMessageOf({
      clientMessageId: 'cid_2',
      conversationId: 'c-a',
      viewerId: 'u-viewer',
      sender,
      content: 'bonjour',
      originalLanguage: 'fr',
      now,
    });
    expect(withSender.sender).toBe(sender);

    const withoutSender = localMessageOf({
      clientMessageId: 'cid_3',
      conversationId: 'c-a',
      viewerId: 'u-viewer',
      content: 'bonjour',
      originalLanguage: 'fr',
      now,
    });
    expect('sender' in withoutSender).toBe(false);
  });

  test('replyToId seulement si fourni — clé ABSENTE sinon', () => {
    const withReply = localMessageOf({
      clientMessageId: 'cid_4',
      conversationId: 'c-a',
      viewerId: 'u-viewer',
      content: 'bonjour',
      originalLanguage: 'fr',
      replyToId: 'm-1',
      now,
    });
    expect(withReply.replyToId).toBe('m-1');

    const withoutReply = localMessageOf({
      clientMessageId: 'cid_5',
      conversationId: 'c-a',
      viewerId: 'u-viewer',
      content: 'bonjour',
      originalLanguage: 'fr',
      now,
    });
    expect('replyToId' in withoutReply).toBe(false);
  });

  /**
   * REVUE-CORRECTION #5813, DÉFAUT MAJEUR 6 — `replyToId` seul part au
   * serveur, mais les DEUX peaux (`bubble.tsx`, `focal-row.tsx`) rendent la
   * citation ET le saut depuis `message.replyTo`, jamais depuis
   * `replyToId`. Sans lui, une réponse envoyée restait sans citation ni
   * geste de saut jusqu'au prochain chargement complet du fil.
   */
  test('replyTo (le message cité ENTIER) seulement si fourni — clé ABSENTE sinon', () => {
    const quoted: Message = {
      id: 'm-1',
      conversationId: 'c-a',
      senderId: 'u-other',
      content: 'Je reprends ta remarque sur le flux.',
      originalLanguage: 'fr',
      messageType: 'text',
      messageSource: 'user',
      isEdited: false,
      isViewOnce: false,
      viewOnceCount: 0,
      isBlurred: false,
      deliveredCount: 1,
      readCount: 0,
      reactionCount: 0,
      isEncrypted: false,
      translations: [],
      createdAt: new Date('2026-09-09T09:00:00.000Z'),
      timestamp: new Date('2026-09-09T09:00:00.000Z'),
    };

    const withReply = localMessageOf({
      clientMessageId: 'cid_6',
      conversationId: 'c-a',
      viewerId: 'u-viewer',
      content: 'bonjour',
      originalLanguage: 'fr',
      replyToId: quoted.id,
      replyTo: quoted,
      now,
    });
    expect(withReply.replyTo).toBe(quoted);

    const withoutReply = localMessageOf({
      clientMessageId: 'cid_7',
      conversationId: 'c-a',
      viewerId: 'u-viewer',
      content: 'bonjour',
      originalLanguage: 'fr',
      now,
    });
    expect('replyTo' in withoutReply).toBe(false);
  });

  /**
   * #5668 — LA BULLE OPTIMISTE PORTE SES PIÈCES JOINTES. `messageType` par
   * défaut reste `'text'` (non-régression) ; le fournir change la valeur
   * posée.
   */
  test('attachments : projection en Attachment (fileUrl = blob:), clé ABSENTE sans sélection', () => {
    const pending = pendingAttachmentOf(new File([new Uint8Array(4)], 'photo.png', { type: 'image/png' }));
    const withAttachments = localMessageOf({
      clientMessageId: 'cid_8',
      conversationId: 'c-a',
      viewerId: 'u-viewer',
      content: '',
      originalLanguage: 'fr',
      attachments: [pending],
      messageType: 'image',
      now,
    });
    expect(withAttachments.messageType).toBe('image');
    expect(withAttachments.attachments).toHaveLength(1);
    expect(withAttachments.attachments?.[0]?.fileUrl.startsWith('blob:')).toBe(true);
    expect(withAttachments.attachments?.[0]?.fileName).toBe('photo.png');

    const withoutAttachments = localMessageOf({
      clientMessageId: 'cid_9',
      conversationId: 'c-a',
      viewerId: 'u-viewer',
      content: 'bonjour',
      originalLanguage: 'fr',
      now,
    });
    expect('attachments' in withoutAttachments).toBe(false);
    expect(withoutAttachments.messageType).toBe('text');
  });
});

describe('confirmedMessageOf', () => {
  const now = new Date('2026-09-09T10:00:00.000Z');
  const quoted: Message = {
    id: 'm-1',
    conversationId: 'c-a',
    senderId: 'u-other',
    content: 'Je reprends ta remarque sur le flux.',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 1,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
    createdAt: new Date('2026-09-09T09:00:00.000Z'),
    timestamp: new Date('2026-09-09T09:00:00.000Z'),
  };
  const local = localMessageOf({
    clientMessageId: 'cid_1',
    conversationId: 'c-a',
    viewerId: 'u-viewer',
    sender,
    content: 'bonjour',
    originalLanguage: 'en',
    replyToId: 'm-1',
    replyTo: quoted,
    now,
  });

  test('id === ack.id, createdAt === ack.createdAt (chaîne conservée), clientMessageId conservé', () => {
    const confirmed = confirmedMessageOf(local, {
      id: 'm9',
      conversationId: 'c-a',
      createdAt: '2026-09-09T10:00:01.000Z',
      deliveredCount: 0,
      readCount: 0,
    });
    expect(confirmed.id).toBe('m9');
    expect(confirmed.createdAt as unknown).toBe('2026-09-09T10:00:01.000Z');
    expect(confirmed.timestamp as unknown).toBe('2026-09-09T10:00:01.000Z');
    expect(confirmed.clientMessageId).toBe('cid_1');
    expect(confirmed.deliveredCount).toBe(0);
  });

  test('content/originalLanguage/replyToId/sender LOCAUX conservés ; le local n’est pas muté', () => {
    const confirmed = confirmedMessageOf(local, {
      id: 'm9',
      conversationId: 'c-a',
      createdAt: '2026-09-09T10:00:01.000Z',
    });
    expect(confirmed.content).toBe(local.content);
    expect(confirmed.originalLanguage).toBe('en');
    expect(confirmed.replyToId).toBe('m-1');
    expect(confirmed.sender).toBe(local.sender);
    // REVUE-CORRECTION #5813, DÉFAUT MAJEUR 6 — la citation ENTIÈRE traverse
    // la greffe de l'accusé, comme le contenu et l'expéditeur : la bulle
    // confirmée continue d'afficher sa citation et son saut.
    expect(confirmed.replyTo).toBe(quoted);
    expect(local.id).toBe('cid_1'); // le local n'a pas bougé
  });

  test('deliveredCount/readCount : 0 quand absents de l’accusé', () => {
    const confirmed = confirmedMessageOf(local, { id: 'm9', conversationId: 'c-a', createdAt: 'x' });
    expect(confirmed.deliveredCount).toBe(0);
    expect(confirmed.readCount).toBe(local.readCount);
  });
});
