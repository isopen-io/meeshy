/**
 * `notifyMessageRecipients` — ce que TOUT message committé doit à ses
 * DESTINATAIRES quand ils ne regardent pas : la notification (ligne DB, push
 * APNs/FCM, événement in-app), quel que soit le tuyau d'arrivée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import {
  notifyMessageRecipients,
  resolveNotificationSender,
} from '../../../services/messaging/messageNotificationFanOut';

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';
const SENDER_PART_ID = '507f1f77bcf86cd799439031';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const PEER_USER_ID = '507f1f77bcf86cd799439042';
const OTHER_USER_ID = '507f1f77bcf86cd799439043';

type ParticipantRow = { userId: string | null; displayName: string; avatar: string | null } | null;
type UserRow = { username: string; displayName: string | null; avatar: string | null } | null;

function makePrisma(options: {
  participant?: ParticipantRow;
  user?: UserRow;
  members?: string[];
  conversation?: unknown;
  attachments?: unknown[];
  suppressed?: string[];
  replyAuthorParticipantId?: string | null;
  replyAuthorUserId?: string | null;
  /** Ce que la relecture d'après-éventail trouve sur le message envoyé. */
  retractedAt?: Date | null;
  /** Le message a disparu de la base entre l'envoi et la relecture. */
  messageVanished?: boolean;
  /** Les lignes `Notification` que la relecture trouvera ancrées sur le message. */
  anchoredNotifications?: Array<{ id: string; userId: string }>;
} = {}) {
  const members = options.members ?? [PEER_USER_ID];
  const conversation =
    options.conversation === undefined
      ? {
          title: 'Salon',
          type: 'group',
          participants: members.map((userId) => ({ userId })),
        }
      : options.conversation;

  const participantFindUnique = jest.fn<any>(({ where }: any) => {
    if (where.id === SENDER_PART_ID) return Promise.resolve(options.participant ?? null);
    return Promise.resolve(
      options.replyAuthorUserId === undefined
        ? null
        : { userId: options.replyAuthorUserId, displayName: 'Auteur', avatar: null }
    );
  });

  return {
    participant: { findUnique: participantFindUnique },
    user: { findUnique: jest.fn<any>().mockResolvedValue(options.user ?? null) },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue(conversation) },
    // Deux questions distinctes passent par ce délégué, et elles ne portent pas
    // sur le même message : l'auteur du message CITÉ (avant l'éventail) et
    // l'état vivant du message ENVOYÉ (après). Un mock qui rendrait la même
    // ligne aux deux ne pourrait pas distinguer un défaut de l'un du défaut de
    // l'autre — d'où l'aiguillage sur `where.id`.
    message: {
      findUnique: jest.fn<any>(({ where }: any) => {
        if (where.id === MSG_ID) {
          return Promise.resolve(
            options.messageVanished ? null : { deletedAt: options.retractedAt ?? null }
          );
        }
        return Promise.resolve(
          options.replyAuthorParticipantId === undefined
            ? null
            : { senderId: options.replyAuthorParticipantId }
        );
      }),
    },
    notification: {
      findMany: jest.fn<any>().mockResolvedValue(options.anchoredNotifications ?? []),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue(options.attachments ?? []) },
    userConversationPreferences: {
      findMany: jest
        .fn<any>()
        .mockResolvedValue((options.suppressed ?? []).map((userId) => ({ userId }))),
    },
  };
}

function makeNotificationService() {
  return {
    createReplyNotification: jest.fn<any>().mockResolvedValue(null),
    createMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
    createMessageNotification: jest.fn<any>().mockResolvedValue(null),
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: MSG_ID,
    messageType: 'text',
    replyToId: null,
    isEncrypted: false,
    encryptionMode: null,
    isViewOnce: false,
    isBlurred: false,
    effectFlags: 0,
    expiresAt: null,
    createdAt: new Date('2026-08-08T10:00:00Z'),
    encryptedContent: null,
    ...overrides,
  };
}

const registeredSender = {
  participant: { userId: SENDER_USER_ID, displayName: 'Alice P', avatar: null },
  user: { username: 'alice', displayName: 'Alice', avatar: 'a.png' },
};

describe('resolveNotificationSender — trois branches, aucune impasse', () => {
  it('participant porteur d’un userId → acteur = utilisateur inscrit', async () => {
    const prisma = makePrisma(registeredSender);

    const identity = await resolveNotificationSender({
      prisma: prisma as any,
      senderParticipantId: SENDER_PART_ID,
    });

    expect(identity).toEqual({
      actorId: SENDER_USER_ID,
      isAnonymous: false,
      profile: { username: 'alice', displayName: 'Alice', avatar: 'a.png' },
    });
  });

  it('participant ANONYME (userId null) → acteur bâti sur le participant, jamais null', async () => {
    const prisma = makePrisma({
      participant: { userId: null, displayName: 'Invité curieux', avatar: 'anon.png' },
    });

    const identity = await resolveNotificationSender({
      prisma: prisma as any,
      senderParticipantId: SENDER_PART_ID,
    });

    expect(identity).toEqual({
      actorId: SENDER_PART_ID,
      isAnonymous: true,
      profile: {
        username: 'Invité curieux',
        displayName: 'Invité curieux',
        avatar: 'anon.png',
      },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('aucun participant → l’id est retenté comme User.id (participant synthétique meeshy)', async () => {
    const prisma = makePrisma({
      participant: null,
      user: { username: 'bob', displayName: null, avatar: null },
    });

    const identity = await resolveNotificationSender({
      prisma: prisma as any,
      senderParticipantId: SENDER_USER_ID,
    });

    expect(identity).toEqual({
      actorId: SENDER_USER_ID,
      isAnonymous: false,
      profile: { username: 'bob', displayName: null, avatar: null },
    });
  });

  it('ni participant ni utilisateur → null (rien à nommer)', async () => {
    const prisma = makePrisma({ participant: null, user: null });

    await expect(
      resolveNotificationSender({ prisma: prisma as any, senderParticipantId: SENDER_PART_ID })
    ).resolves.toBeNull();
  });
});

describe('notifyMessageRecipients — l’éventail', () => {
  it('notifie chaque membre inscrit sauf l’expéditeur', async () => {
    const prisma = makePrisma({ ...registeredSender, members: [SENDER_USER_ID, PEER_USER_ID] });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'coucou',
    });

    expect(notificationService.createMessageNotification).toHaveBeenCalledTimes(1);
    expect(notificationService.createMessageNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: PEER_USER_ID,
        senderId: SENDER_USER_ID,
        messageId: MSG_ID,
        conversationId: CONV_ID,
        messagePreview: 'coucou',
      })
    );
  });

  it('un expéditeur ANONYME notifie quand même — le défaut que ce cycle ferme', async () => {
    const prisma = makePrisma({
      participant: { userId: null, displayName: 'Invité', avatar: null },
      members: [PEER_USER_ID],
    });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'bonjour depuis un lien',
    });

    expect(notificationService.createMessageNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: PEER_USER_ID,
        senderId: SENDER_PART_ID,
        senderProfile: { username: 'Invité', displayName: 'Invité', avatar: null },
      })
    );
  });

  it('passe le profil déjà résolu pour éviter une lecture User par destinataire', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID, OTHER_USER_ID],
    });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'salut',
    });

    expect(notificationService.createMessageNotification).toHaveBeenCalledTimes(2);
    for (const call of notificationService.createMessageNotification.mock.calls) {
      expect((call[0] as any).senderProfile).toEqual({
        username: 'alice',
        displayName: 'Alice',
        avatar: 'a.png',
      });
    }
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('écarte les destinataires en sourdine ou en « mentions seulement »', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID, OTHER_USER_ID],
      suppressed: [OTHER_USER_ID],
    });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'salut',
    });

    expect(notificationService.createMessageNotification).toHaveBeenCalledTimes(1);
    expect(
      (notificationService.createMessageNotification.mock.calls[0][0] as any).recipientUserId
    ).toBe(PEER_USER_ID);
  });

  it('une réponse notifie son auteur, qui sort de l’éventail régulier', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID],
      replyAuthorParticipantId: '507f1f77bcf86cd799439060',
      replyAuthorUserId: PEER_USER_ID,
    });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage({ replyToId: '507f1f77bcf86cd799439070' }),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'ma réponse',
    });

    expect(notificationService.createReplyNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: PEER_USER_ID,
        replierUserId: SENDER_USER_ID,
        originalMessageId: '507f1f77bcf86cd799439070',
        senderProfile: { username: 'alice', displayName: 'Alice', avatar: 'a.png' },
      })
    );
    expect(notificationService.createMessageNotification).not.toHaveBeenCalled();
  });

  it('les mentions partent en lot avec le profil, et sortent de l’éventail régulier', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID, OTHER_USER_ID],
    });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: '@peer regarde',
      validatedMentionUserIds: [PEER_USER_ID],
    });

    expect(notificationService.createMentionNotificationsBatch).toHaveBeenCalledWith(
      [PEER_USER_ID],
      expect.objectContaining({
        senderId: SENDER_USER_ID,
        senderProfile: { username: 'alice', displayName: 'Alice', avatar: 'a.png' },
        conversationId: CONV_ID,
        messageId: MSG_ID,
      }),
      [PEER_USER_ID, OTHER_USER_ID]
    );
    expect(notificationService.createMessageNotification).toHaveBeenCalledTimes(1);
    expect(
      (notificationService.createMessageNotification.mock.calls[0][0] as any).recipientUserId
    ).toBe(OTHER_USER_ID);
  });

  it('un message protégé ne fuit pas son contenu dans l’aperçu', async () => {
    const prisma = makePrisma({ ...registeredSender, members: [PEER_USER_ID] });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage({ isViewOnce: true }),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'secret à ne pas révéler',
    });

    const params = notificationService.createMessageNotification.mock.calls[0][0] as any;
    expect(params.messagePreview).not.toContain('secret');
    expect(params.notificationLocKey).toBeTruthy();
  });

  // `FanOutMessage.createdAt` est optionnel : les routes de lien passent un
  // message structural, pas une ligne Prisma complète.
  it('un message protégé sans createdAt ne fait pas tomber l’éventail', async () => {
    const prisma = makePrisma({ ...registeredSender, members: [PEER_USER_ID] });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage({ isBlurred: true, createdAt: undefined, expiresAt: undefined }),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'secret',
    });

    const params = notificationService.createMessageNotification.mock.calls[0][0] as any;
    expect(params.messagePreview).not.toContain('secret');
  });

  it('la transcription d’un audio sert de corps de push quand elle existe', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID],
      attachments: [
        {
          mimeType: 'audio/m4a',
          fileName: 'voix.m4a',
          fileSize: 1024,
          duration: 3,
          width: null,
          height: null,
          fileUrl: 'https://cdn/voix.m4a',
          transcription: { text: 'bonjour tout le monde' },
        },
      ],
    });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: '',
    });

    const params = notificationService.createMessageNotification.mock.calls[0][0] as any;
    expect(params.messagePreview).toBe('bonjour tout le monde');
    expect(params.hasAttachments).toBe(true);
    expect(params.firstAttachmentType).toBe('audio');
    expect(params.firstAttachmentUrl).toBe('https://cdn/voix.m4a');
  });

  /**
   * Cycle 123 — l'éventail COMPOSE l'aperçu poussé, donc il déclare ce qui le
   * traduit.
   *
   * La transcription d'un vocal n'est pas `Message.content` : ses traductions
   * vivent sur `MessageAttachment.translations`. Le cycle 122 en concluait
   * « rien ne la traduit » (`previewIsMessageContent: false`) — la bannière d'un
   * vocal restait donc dans la langue de l'expéditeur pendant que la ligne de
   * liste de la même application servait la transcription traduite. Ces témoins
   * gardent le CÂBLAGE : sans lui la descente du service n'a aucune source, et
   * le correctif n'atteindrait personne.
   */
  it('déclare la base TRANSCRIPTION, avec la carte de l’attachment et la langue parlée', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID],
      attachments: [
        {
          mimeType: 'audio/m4a', fileName: 'v.m4a', fileSize: 1, duration: 1,
          width: null, height: null, fileUrl: null,
          transcription: { text: 'Hola, te llamo esta noche', language: 'es' },
          translations: {
            fr: { type: 'audio', transcription: "Salut, je t'appelle ce soir", createdAt: new Date() },
            it: { type: 'audio', transcription: 'Ciao', createdAt: new Date(), deletedAt: new Date() },
          },
        },
      ],
    });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: '',
    });

    const params = notificationService.createMessageNotification.mock.calls[0][0] as any;
    expect(params.previewBasis).toEqual({
      kind: 'transcript',
      source: {
        // L'entrée soft-supprimée ne concourt à aucun rang.
        translations: { fr: "Salut, je t'appelle ce soir" },
        originalLanguage: 'es',
      },
    });
  });

  it('CHARGE les traductions de l’attachment — sans ce select, la carte serait toujours vide', async () => {
    // Charger n'est pas servir (§ gateway/CLAUDE.md), et l'inverse est vrai
    // aussi : la base ci-dessus ne peut rien porter que la requête n'a pas
    // demandé, et une carte vide se lit exactement comme « pas de traduction ».
    const prisma = makePrisma({ ...registeredSender, members: [PEER_USER_ID] });

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService: makeNotificationService(),
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'Hello',
    });

    const select = (prisma.messageAttachment.findMany.mock.calls[0][0] as any).select;
    expect(select.translations).toBe(true);
  });

  it('sans transcription, la base reste le CONTENU du message', async () => {
    const prisma = makePrisma({ ...registeredSender, members: [PEER_USER_ID] });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'Hello',
    });

    const params = notificationService.createMessageNotification.mock.calls[0][0] as any;
    expect(params.previewBasis).toEqual({ kind: 'message-content' });
  });

  it('un aperçu PROTÉGÉ déclare le placeholder — sur les TROIS éventails', async () => {
    // Le corps et le fil dérivent tous deux de cette déclaration depuis le
    // cycle 123 : la manquer sur un éventail y relâcherait la traduction en
    // clair du texte que la protection masque.
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID, OTHER_USER_ID],
      replyAuthorParticipantId: 'part_other',
      replyAuthorUserId: OTHER_USER_ID,
    });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage({ replyToId: 'msg_cited', isViewOnce: true }),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'mon secret',
      validatedMentionUserIds: [PEER_USER_ID],
    });

    const placeholder = { kind: 'protected-placeholder' };
    expect((notificationService.createReplyNotification.mock.calls[0][0] as any).previewBasis)
      .toEqual(placeholder);
    expect((notificationService.createMentionNotificationsBatch.mock.calls[0][1] as any).previewBasis)
      .toEqual(placeholder);
  });

  it('une transcription illisible retombe sur l’aperçu du message', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID],
      attachments: [
        {
          mimeType: 'audio/m4a', fileName: 'v.m4a', fileSize: 1, duration: 1,
          width: null, height: null, fileUrl: null,
          transcription: { segments: [{ notText: 1 }] },
        },
      ],
    });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'message vocal',
    });

    expect(
      (notificationService.createMessageNotification.mock.calls[0][0] as any).messagePreview
    ).toBe('message vocal');
  });

  it('rend compte de l’éventail à son appelant, qui journalise dans son contexte', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID, OTHER_USER_ID],
    });
    const notificationService = makeNotificationService();
    notificationService.createMentionNotificationsBatch.mockResolvedValue(1);
    notificationService.createMessageNotification.mockResolvedValue({ id: 'n1' });
    const onFanOut = jest.fn<any>();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: '@peer regarde',
      validatedMentionUserIds: [PEER_USER_ID],
      onFanOut,
    });

    expect(onFanOut).toHaveBeenCalledWith({ mentions: 1, regular: 1, reply: false });
  });

  // ─── Trois éventails, trois destins ───────────────────────────────────────
  //
  // Réponse, mentions et messages réguliers sont indépendants par
  // construction : leurs audiences se déduisent des ENTRÉES
  // (`validatedMentionUserIds`, l'auteur du message cité), jamais du résultat
  // de l'éventail précédent. Ils partageaient pourtant un seul `try` : une
  // panne dans le PREMIER annulait purement et simplement les deux suivants —
  // dont les mentions, la seule famille qui perce toutes les autres
  // suppressions. Un hoquet Mongo sur la notification de réponse d'UNE personne
  // faisait taire le message pour TOUTE la conversation.

  it('une panne de l’éventail réponse n’annule ni les mentions ni les messages réguliers', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID, OTHER_USER_ID],
      replyAuthorParticipantId: '507f1f77bcf86cd799439060',
      replyAuthorUserId: PEER_USER_ID,
    });
    const notificationService = makeNotificationService();
    notificationService.createReplyNotification.mockRejectedValue(new Error('mongo down'));
    const onError = jest.fn<any>();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage({ replyToId: '507f1f77bcf86cd799439070' }),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: '@other ma réponse',
      validatedMentionUserIds: [OTHER_USER_ID],
      onError,
    });

    expect(notificationService.createMentionNotificationsBatch).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('une panne de l’éventail mentions n’annule pas les messages réguliers', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID, OTHER_USER_ID],
    });
    const notificationService = makeNotificationService();
    notificationService.createMentionNotificationsBatch.mockRejectedValue(new Error('mongo down'));
    const onError = jest.fn<any>();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: '@peer regarde',
      validatedMentionUserIds: [PEER_USER_ID],
      onError,
    });

    expect(notificationService.createMessageNotification).toHaveBeenCalledTimes(1);
    expect(
      (notificationService.createMessageNotification.mock.calls[0][0] as any).recipientUserId
    ).toBe(OTHER_USER_ID);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('un destinataire régulier en échec n’emporte pas les autres', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID, OTHER_USER_ID],
    });
    const notificationService = makeNotificationService();
    notificationService.createMessageNotification.mockImplementation((params: any) =>
      params.recipientUserId === PEER_USER_ID
        ? Promise.reject(new Error('mongo down'))
        : Promise.resolve({ id: 'n1' })
    );
    const onFanOut = jest.fn<any>();
    const onError = jest.fn<any>();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'coucou',
      onFanOut,
      onError,
    });

    expect(notificationService.createMessageNotification).toHaveBeenCalledTimes(2);
    expect(onFanOut).toHaveBeenCalledWith({ mentions: 0, regular: 1, reply: false });
  });

  // Le compte rendu dit ce qui est PARTI, pas ce qui était visé — principe
  // déjà retenu par `createMemberJoinedNotificationsBatch`. Sans lui,
  // l'isolement ci-dessus serait invisible : un éventail entièrement tombé
  // continuerait d'annoncer son audience comme si elle avait été servie.

  it('le compte rendu est celui des notifications réellement parties', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID, OTHER_USER_ID],
    });
    const notificationService = makeNotificationService();
    notificationService.createMentionNotificationsBatch.mockRejectedValue(new Error('mongo down'));
    notificationService.createMessageNotification.mockRejectedValue(new Error('mongo down'));
    const onFanOut = jest.fn<any>();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: '@peer regarde',
      validatedMentionUserIds: [PEER_USER_ID],
      onFanOut,
    });

    expect(onFanOut).toHaveBeenCalledWith({ mentions: 0, regular: 0, reply: false });
  });

  it('la réponse ne se déclare partie que si elle l’est', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID],
      replyAuthorParticipantId: '507f1f77bcf86cd799439060',
      replyAuthorUserId: PEER_USER_ID,
    });
    const notificationService = makeNotificationService();
    notificationService.createReplyNotification.mockResolvedValue({ id: 'n1' });
    const onFanOut = jest.fn<any>();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage({ replyToId: '507f1f77bcf86cd799439070' }),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'ma réponse',
      onFanOut,
    });

    expect(onFanOut).toHaveBeenCalledWith({ mentions: 0, regular: 0, reply: true });
  });

  it('préférences de conversation illisibles → tout le monde reste notifié', async () => {
    // Repli OUVERT, comme `filterMutedRecipients`. « Mentions seulement » et
    // sourdine sont des préférences de CONFORT ; quand on ne sait plus les
    // lire, un ping de trop se pardonne, un message jamais annoncé non — et
    // l'incident vaut pour la conversation entière, pas pour une personne.
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID, OTHER_USER_ID],
    });
    prisma.userConversationPreferences.findMany.mockRejectedValue(new Error('mongo down'));
    const notificationService = makeNotificationService();
    notificationService.createMessageNotification.mockResolvedValue({ id: 'n1' });
    const onFanOut = jest.fn<any>();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'coucou',
      onFanOut,
    });

    expect(notificationService.createMessageNotification).toHaveBeenCalledTimes(2);
    expect(onFanOut).toHaveBeenCalledWith({ mentions: 0, regular: 2, reply: false });
  });

  it('une panne signale à onError QUEL éventail est tombé', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID],
    });
    const notificationService = makeNotificationService();
    notificationService.createMentionNotificationsBatch.mockRejectedValue(new Error('mongo down'));
    const onError = jest.fn<any>();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: '@peer regarde',
      validatedMentionUserIds: [PEER_USER_ID],
      onError,
    });

    const reported = onError.mock.calls[0][0] as Error;
    expect(reported.message).toContain('mentions');
    expect((reported as any).cause).toEqual(expect.any(Error));
  });

  it('ne rend aucun compte quand l’éventail est abandonné', async () => {
    const prisma = makePrisma({ participant: null, user: null });
    const onFanOut = jest.fn<any>();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService: makeNotificationService(),
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'coucou',
      onFanOut,
    });

    expect(onFanOut).not.toHaveBeenCalled();
  });

  it('sans service de notification, ne fait rien et ne lit rien', async () => {
    const prisma = makePrisma(registeredSender);

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService: null,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'coucou',
    });

    expect(prisma.participant.findUnique).not.toHaveBeenCalled();
  });

  it('expéditeur introuvable → aucun envoi, aucune exception', async () => {
    const prisma = makePrisma({ participant: null, user: null });
    const notificationService = makeNotificationService();

    await expect(
      notifyMessageRecipients({
        prisma: prisma as any,
        notificationService,
        message: makeMessage(),
        senderParticipantId: SENDER_PART_ID,
        conversationId: CONV_ID,
        processedContent: 'coucou',
      })
    ).resolves.toBeUndefined();

    expect(notificationService.createMessageNotification).not.toHaveBeenCalled();
  });

  it('conversation introuvable → aucun envoi', async () => {
    const prisma = makePrisma({ ...registeredSender, conversation: null });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'coucou',
    });

    expect(notificationService.createMessageNotification).not.toHaveBeenCalled();
  });

  it('une panne de lecture est signalée à onError et jamais propagée', async () => {
    const prisma = makePrisma(registeredSender);
    prisma.conversation.findUnique.mockRejectedValue(new Error('mongo down'));
    const notificationService = makeNotificationService();
    const onError = jest.fn<any>();

    await expect(
      notifyMessageRecipients({
        prisma: prisma as any,
        notificationService,
        message: makeMessage(),
        senderParticipantId: SENDER_PART_ID,
        conversationId: CONV_ID,
        processedContent: 'coucou',
        onError,
      })
    ).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('un anonyme sans displayName reste nommable — chaîne vide, jamais null', async () => {
    const prisma = makePrisma({
      participant: { userId: null, displayName: null as unknown as string, avatar: null },
      members: [PEER_USER_ID],
    });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'coucou',
    });

    expect(
      (notificationService.createMessageNotification.mock.calls[0][0] as any).senderProfile
    ).toEqual({ username: '', displayName: '', avatar: null });
  });

  it('une transcription en segments alimente aussi le corps du push', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID],
      attachments: [
        {
          mimeType: 'audio/m4a', fileName: 'v.m4a', fileSize: 1, duration: 1,
          width: null, height: null, fileUrl: null,
          transcription: { segments: [{ text: 'salut' }, { text: 'toi' }, { notText: 1 }] },
        },
      ],
    });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: '',
    });

    expect(
      (notificationService.createMessageNotification.mock.calls[0][0] as any).messagePreview
    ).toBe('salut toi');
  });

  it.each([
    ['image/png', 'image'],
    ['video/mp4', 'video'],
    ['application/pdf', 'document'],
    [null, 'document'],
  ])('classe une pièce jointe %s en %s', async (mimeType, expected) => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID],
      attachments: [{ mimeType, fileName: 'f', fileSize: 1, duration: null, width: null, height: null, fileUrl: null }],
    });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'regarde',
    });

    expect(
      (notificationService.createMessageNotification.mock.calls[0][0] as any).firstAttachmentType
    ).toBe(expected);
  });

  // Une réponse à un message d'ANONYME n'a personne à notifier : son auteur n'a
  // pas de ligne `User`, donc pas de destinataire de notification possible.
  it('une réponse à un auteur anonyme ne produit pas de notification de réponse', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [PEER_USER_ID],
      replyAuthorParticipantId: '507f1f77bcf86cd799439060',
      replyAuthorUserId: null,
    });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage({ replyToId: '507f1f77bcf86cd799439070' }),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'ma réponse',
    });

    expect(notificationService.createReplyNotification).not.toHaveBeenCalled();
    expect(notificationService.createMessageNotification).toHaveBeenCalledTimes(1);
  });

  it('un message répondu introuvable ne bloque pas l’éventail régulier', async () => {
    const prisma = makePrisma({ ...registeredSender, members: [PEER_USER_ID] });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage({ replyToId: '507f1f77bcf86cd799439070' }),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'ma réponse',
    });

    expect(notificationService.createReplyNotification).not.toHaveBeenCalled();
    expect(notificationService.createMessageNotification).toHaveBeenCalledTimes(1);
  });

  it('aucun destinataire éligible → aucune lecture de préférences', async () => {
    const prisma = makePrisma({ ...registeredSender, members: [SENDER_USER_ID] });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'coucou',
    });

    expect(prisma.userConversationPreferences.findMany).not.toHaveBeenCalled();
    expect(notificationService.createMessageNotification).not.toHaveBeenCalled();
  });
});

/**
 * Le rappel qui court APRÈS l'éventail.
 *
 * Le cycle 47 a fait retirer, au rappel d'un message, les notifications qu'il
 * avait produites — et a nommé la course qu'il laissait ouverte : une ligne
 * créée APRÈS le `deleteMany` du rappel survit, avec la copie de l'extrait que
 * `createNotification` a dénormalisée. Aucun filtre à la lecture ne la rattrape.
 *
 * Une garde d'ADMISSION en tête d'éventail — la piste que le cycle 47 avait
 * inscrite — rétrécit la fenêtre sans jamais la fermer : `deletedAt` peut être
 * committé entre la relecture et la création. La relecture d'APRÈS, elle, la
 * ferme : toute ligne que le `deleteMany` du rappel n'a pas vue est
 * nécessairement née avant une relecture qui, elle, voit `deletedAt`.
 */
describe('notifyMessageRecipients — le rappel qui court après l’éventail', () => {
  const anchored = [
    { id: 'notif-peer', userId: PEER_USER_ID },
    { id: 'notif-other', userId: OTHER_USER_ID },
  ];

  it('un message rappelé pendant l’éventail perd les notifications qu’il vient de produire', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [SENDER_USER_ID, PEER_USER_ID, OTHER_USER_ID],
      retractedAt: new Date('2026-08-10T10:00:00Z'),
      anchoredNotifications: anchored,
    });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'ce que je regrette',
    });

    expect(notificationService.createMessageNotification).toHaveBeenCalledTimes(2);
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { messageId: MSG_ID } });
  });

  // Le témoin. Il interdit d'élargir : un éventail qui retirerait ses propres
  // lignes sans lire `deletedAt` rendrait TOUTE notification éphémère.
  it('un message vivant garde ses notifications', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [SENDER_USER_ID, PEER_USER_ID],
      anchoredNotifications: anchored,
    });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'coucou',
    });

    expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
  });

  it('annonce à leurs destinataires les lignes que le rappel emporte', async () => {
    // Les lignes retirées ici ont DÉJÀ été émises en `notification:new` et
    // comptées dans la cloche : sans annonce, le badge resterait sur un
    // compteur incluant des lignes que le serveur vient de supprimer.
    const prisma = makePrisma({
      ...registeredSender,
      members: [SENDER_USER_ID, PEER_USER_ID, OTHER_USER_ID],
      retractedAt: new Date('2026-08-10T10:00:00Z'),
      anchoredNotifications: anchored,
    });
    const announceNotificationsRetracted = jest.fn<any>().mockResolvedValue(undefined);

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService: makeNotificationService(),
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'ce que je regrette',
      retractionAnnouncer: { announceNotificationsRetracted },
    });

    expect(announceNotificationsRetracted).toHaveBeenCalledWith(anchored);
  });

  // La relecture est le prix de la fermeture ; un éventail qui n'a rien créé
  // n'a rien à fermer, et ne doit pas le payer.
  it('un éventail qui n’a rien créé ne relit pas le message', async () => {
    const prisma = makePrisma({ ...registeredSender, members: [SENDER_USER_ID] });

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService: makeNotificationService(),
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'personne à notifier',
    });

    expect(prisma.message.findUnique).not.toHaveBeenCalled();
    expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
  });

  // Sens sûr : `deletedAt` non nul est la SEULE preuve d'un rappel. Une ligne
  // absente ne prouve rien — et aucun chemin de la gateway ne supprime un
  // message physiquement. Retirer sur une non-preuve viderait des inboxes.
  it('un message introuvable à la relecture ne fait retirer aucune ligne', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [SENDER_USER_ID, PEER_USER_ID],
      messageVanished: true,
      anchoredNotifications: anchored,
    });

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService: makeNotificationService(),
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'coucou',
    });

    expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
  });

  it('une relecture qui jette n’emporte ni l’éventail ni son compte rendu', async () => {
    const prisma = makePrisma({ ...registeredSender, members: [SENDER_USER_ID, PEER_USER_ID] });
    prisma.message.findUnique.mockRejectedValue(new Error('mongo down'));
    const notificationService = makeNotificationService();
    notificationService.createMessageNotification.mockResolvedValue({ id: 'notif-peer' });
    const onFanOut = jest.fn<any>();
    const onError = jest.fn<any>();

    await expect(
      notifyMessageRecipients({
        prisma: prisma as any,
        notificationService,
        message: makeMessage(),
        senderParticipantId: SENDER_PART_ID,
        conversationId: CONV_ID,
        processedContent: 'coucou',
        onFanOut,
        onError,
      })
    ).resolves.toBeUndefined();

    expect(onFanOut).toHaveBeenCalledWith({ mentions: 0, regular: 1, reply: false });
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('notifyMessageRecipients — l’échéance du message suit ses notifications', () => {
  const EXPIRES_AT = new Date('2026-08-10T12:00:00Z');

  it('un message éphémère transmet son échéance à la réponse ET aux mentions', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [SENDER_USER_ID, PEER_USER_ID, OTHER_USER_ID],
      replyAuthorParticipantId: 'part-auteur-cite',
      replyAuthorUserId: PEER_USER_ID,
    });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage({ replyToId: 'msg-cite', expiresAt: EXPIRES_AT }),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'ça disparaît bientôt @autre',
      validatedMentionUserIds: [OTHER_USER_ID],
    });

    expect(notificationService.createReplyNotification).toHaveBeenCalledWith(
      expect.objectContaining({ messageExpiresAt: EXPIRES_AT })
    );
    expect(notificationService.createMentionNotificationsBatch).toHaveBeenCalledWith(
      [OTHER_USER_ID],
      expect.objectContaining({ messageExpiresAt: EXPIRES_AT }),
      expect.anything()
    );
  });

  it('témoin — un message ordinaire transmet null, jamais une échéance inventée', async () => {
    const prisma = makePrisma({
      ...registeredSender,
      members: [SENDER_USER_ID, OTHER_USER_ID],
    });
    const notificationService = makeNotificationService();

    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService,
      message: makeMessage(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'coucou @autre',
      validatedMentionUserIds: [OTHER_USER_ID],
    });

    expect(notificationService.createMentionNotificationsBatch).toHaveBeenCalledWith(
      [OTHER_USER_ID],
      expect.objectContaining({ messageExpiresAt: null }),
      expect.anything()
    );
  });
});
