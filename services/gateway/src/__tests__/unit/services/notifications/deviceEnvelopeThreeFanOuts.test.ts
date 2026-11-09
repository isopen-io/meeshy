/**
 * #17080 / #17177 — l'enveloppe de l'appareil : la faire voyager sur les TROIS
 * éventails, et la RETENIR quand la protection n'est pas le chiffrement.
 *
 * Les deux moitiés ne se livrent pas séparément, et c'est le cadrage du
 * cycle 151 qui l'a tranché :
 *
 *  1. **#17080** — en conversation E2EE, seul le lot `regular` portait
 *     `encryptedContent`. La bannière d'une RÉPONSE ou d'une MENTION restait
 *     `🔒 💬` à vie, parce que la NSE iOS ne remplace le corps par le clair que
 *     si `userInfo["encryptedContent"]` est non vide. Le champ ne compose
 *     AUCUNE chaîne — c'est la charge que le LECTEUR compose lui-même — donc
 *     « qui compose ce corps ? » ne le trouve jamais (cycle 126).
 *  2. **#17177** — et le faire voyager tel quel aurait propagé à deux éventails
 *     de plus une fuite que `regular` portait déjà : `protectedPreview` a pour
 *     préséance *éphémère > vue unique > flouté > chiffré*, donc un message à
 *     VUE UNIQUE d'une conversation E2EE compose le placeholder `👁️ 🖼️` **et**
 *     laissait partir l'enveloppe à côté. La NSE la déchiffrait et écrasait le
 *     placeholder : le texte entier sur l'écran verrouillé, là où le même
 *     message en mode `server` est protégé.
 *
 * > Leçon 275, dans le médium qu'aucune des cinq passes précédentes n'avait
 * > compté : **une protection de CONTENU se mesure sur tout ce que la charge
 * > TRANSPORTE.** Le texte (123), la base du Prisme (123), le verrou (124), le
 * > FICHIER (125), la piste traduite (128) — et l'enveloppe, qui n'est ni une
 * > chaîne ni un fichier.
 *
 * Les témoins portent sur ce que l'éventail REMET aux trois créateurs, puis sur
 * la charge réellement remise à APNs — jamais sur un calcul intermédiaire.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { notifyMessageRecipients } from '../../../../services/messaging/messageNotificationFanOut';
import { NotificationService } from '../../../../services/notifications/NotificationService';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';
const REPLIED_MSG_ID = '507f1f77bcf86cd799439052';
const SENDER_PART_ID = '507f1f77bcf86cd799439031';
const PEER_PART_ID = '507f1f77bcf86cd799439032';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const PEER_USER_ID = '507f1f77bcf86cd799439042';
const RECIPIENT_ID = '507f1f77bcf86cd799439043';
const THIRD_USER_ID = '507f1f77bcf86cd799439044';
const FOURTH_USER_ID = '507f1f77bcf86cd799439045';

const SERVER_CLOCK = new Date('2026-11-08T10:00:00Z');

/**
 * Une échéance ÉPHÉMÈRE, donc dans le futur — relative à `now`, jamais un
 * littéral : « un littéral de date sous une fenêtre n'est pas une constante,
 * c'est une échéance » (`tasks/lessons/`). Un littéral passé ferait répondre à
 * ces témoins une AUTRE question que la leur : `messageLiveness` rendrait
 * `gone` et le créateur n'enverrait rien du tout, si bien que l'assertion
 * passerait sans que le verrou de protection ait été exercé.
 */
const ephemeralDeadline = (): Date => new Date(Date.now() + 3_600_000);

/** Le chiffré de l'appareil : la seule chose que la NSE sache déchiffrer. */
const ENVELOPE = 'YmFzZTY0LWRldmljZS1lbnZlbG9wZQ==';

// ── Éventail — ce que les trois lots reçoivent ─────────────────────────────

function makePrisma(conversationMode: string | null) {
  return {
    participant: {
      findUnique: jest.fn<any>().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.id === PEER_PART_ID
            ? { userId: PEER_USER_ID, displayName: 'Bob P', avatar: null }
            : { userId: SENDER_USER_ID, displayName: 'Alice P', avatar: null }
        )
      ),
    },
    user: {
      findUnique: jest
        .fn<any>()
        .mockResolvedValue({ username: 'alice', displayName: 'Alice', avatar: null }),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        title: 'Salon',
        type: 'group',
        encryptionMode: conversationMode,
        participants: [
          { userId: SENDER_USER_ID },
          { userId: PEER_USER_ID },
          { userId: THIRD_USER_ID },
          { userId: FOURTH_USER_ID },
        ],
      }),
    },
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({ senderId: PEER_PART_ID, deletedAt: null }),
    },
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

async function servedLots(
  conversationMode: string | null,
  messageOverrides: Record<string, unknown> = {}
) {
  const createReplyNotification = jest.fn<any>().mockResolvedValue({ id: 'reply' });
  const createMentionNotificationsBatch = jest.fn<any>().mockResolvedValue(1);
  const createMessageNotification = jest.fn<any>().mockResolvedValue({ id: 'notif' });

  await notifyMessageRecipients({
    prisma: makePrisma(conversationMode) as any,
    notificationService: {
      createReplyNotification,
      createMentionNotificationsBatch,
      createMessageNotification,
    },
    message: {
      id: MSG_ID,
      messageType: 'text',
      replyToId: REPLIED_MSG_ID,
      isEncrypted: true,
      encryptionMode: null,
      isViewOnce: false,
      isBlurred: false,
      effectFlags: 0,
      expiresAt: null,
      ephemeralDuration: null,
      createdAt: SERVER_CLOCK,
      encryptedContent: ENVELOPE,
      ...messageOverrides,
    } as any,
    senderParticipantId: SENDER_PART_ID,
    conversationId: CONV_ID,
    processedContent: '[Encrypted]',
    validatedMentionUserIds: [THIRD_USER_ID],
  });

  return {
    reply: createReplyNotification.mock.calls[0]?.[0] as Record<string, unknown> | undefined,
    mention: createMentionNotificationsBatch.mock.calls[0]?.[1] as Record<string, unknown> | undefined,
    regular: createMessageNotification.mock.calls[0]?.[0] as Record<string, unknown> | undefined,
  };
}

describe('éventail — l\'enveloppe que le lot `regular` transporte', () => {
  // Ce lot-ci la REÇOIT ; la réponse et la mention la DÉRIVENT de leur
  // relecture partagée (témoins plus bas). Une règle, deux sites qui
  // l'appliquent — même partage que `messageLiveness`.
  it('une conversation e2ee la remet au créateur', async () => {
    const { regular } = await servedLots('e2ee');

    expect(regular?.encryptedContent).toBe(ENVELOPE);
  });

  it('la casse du mode n\'y change rien — iOS écrit « E2EE »', async () => {
    expect((await servedLots('E2EE')).regular?.encryptedContent).toBe(ENVELOPE);
  });

  it('le mode de la LIGNE suffit dans une conversation repassée en clair', async () => {
    // #12881 — un message e2ee d'hier reste chiffré à jamais, même si sa
    // conversation ne l'est plus.
    const { regular } = await servedLots(null, { encryptionMode: 'e2ee' });

    expect(regular?.encryptedContent).toBe(ENVELOPE);
  });

  it('une conversation en CLAIR n\'en remet aucune', async () => {
    const { regular } = await servedLots(null, { isEncrypted: false });

    expect(regular?.encryptedContent).toBeUndefined();
  });

  it('un message e2ee SANS chiffré n\'en fabrique pas', async () => {
    const { regular } = await servedLots('e2ee', { encryptedContent: null });

    expect(regular?.encryptedContent).toBeUndefined();
  });
});

describe('éventail — la protection de CYCLE DE VIE retient l\'enveloppe (#17177)', () => {
  // Les trois branches de `protectedPreview` qui GAGNENT sur « chiffré » : sa
  // préséance est éphémère > vue unique > flouté > chiffré, donc le placeholder
  // composé n'est PAS celui du chiffrement et la NSE n'a pas à l'écraser.
  const lifecycleProtections: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['à vue unique', { isViewOnce: true }],
    ['flouté', { isBlurred: true }],
    ['éphémère (échéance)', { expiresAt: ephemeralDeadline() }],
    ['éphémère (durée déclarée)', { ephemeralDuration: 30 }],
  ];

  it.each(lifecycleProtections)(
    'un message %s d\'une conversation e2ee ne remet AUCUN chiffré',
    async (_label, overrides) => {
      const { regular } = await servedLots('e2ee', overrides);

      // La bannière part — c'est son CONTENU qui ne doit pas.
      expect(regular).toBeDefined();
      expect(regular?.encryptedContent).toBeUndefined();
    }
  );

  it('le placeholder qu\'elle laisse n\'est PAS celui du chiffrement', async () => {
    // Ce qui rendait la fuite exploitable : le corps dit `👁️ 🖼️` et la charge
    // transportait de quoi le remplacer par le texte entier.
    const { regular } = await servedLots('e2ee', { isViewOnce: true });

    expect(regular?.notificationLocKey).toBe('notification.view_once_message');
  });

  it('un message SEULEMENT chiffré garde son enveloppe — le verrou ne mord pas au cas nominal', async () => {
    const { regular } = await servedLots('e2ee');

    expect(regular?.notificationLocKey).toBe('notification.encrypted_message');
    expect(regular?.encryptedContent).toBe(ENVELOPE);
  });
});

// ── Service — la charge remise à APNs ──────────────────────────────────────

function makeServicePrisma(
  messageOverrides: Record<string, unknown> = {},
  conversationMode: string | null = 'e2ee'
) {
  return {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        deletedAt: null,
        expiresAt: null,
        isViewOnce: false,
        isBlurred: false,
        viewOnceCount: 0,
        createdAt: SERVER_CLOCK,
        messageType: 'text',
        translations: null,
        originalLanguage: 'fr',
        ephemeralDuration: null,
        effectFlags: 0,
        encryptedContent: ENVELOPE,
        encryptionMode: null,
        ...messageOverrides,
      }),
    },
    notification: {
      create: jest.fn<any>().mockImplementation((args: any) => ({ id: 'notif_created', ...args.data })),
      findMany: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      update: jest.fn<any>(),
      updateMany: jest.fn<any>(),
      delete: jest.fn<any>(),
      deleteMany: jest.fn<any>(),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    user: {
      findUnique: jest.fn<any>().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.id === SENDER_USER_ID
            ? { id: SENDER_USER_ID, username: 'alice', displayName: 'Alice', avatar: null }
            : { id: where?.id, username: 'bob', displayName: 'Bob', avatar: null, systemLanguage: 'fr' }
        )
      ),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        title: 'Salon',
        type: 'group',
        avatar: null,
        encryptionMode: conversationMode,
      }),
    },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;
}

function makeService(
  messageOverrides: Record<string, unknown> = {},
  conversationMode: string | null = 'e2ee'
) {
  const prisma = makeServicePrisma(messageOverrides, conversationMode);
  const sendToUser = jest.fn<any>().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO({
    to: jest.fn<any>().mockReturnThis(),
    in: jest.fn<any>().mockReturnThis(),
    fetchSockets: jest.fn<any>().mockResolvedValue([]),
    emit: jest.fn<any>(),
  } as any);
  service.setPushNotificationService({ sendToUser } as any);
  return { service, sendToUser, prisma };
}

const servedPushData = (sendToUser: any, call = 0): Record<string, any> | undefined =>
  sendToUser.mock.calls[call]?.[0]?.payload?.data;

const derivingRunners = [
  [
    'createReplyNotification',
    (service: NotificationService, extra: Record<string, unknown>) =>
      service.createReplyNotification({
        recipientUserId: RECIPIENT_ID,
        replierUserId: SENDER_USER_ID,
        messageId: MSG_ID,
        conversationId: CONV_ID,
        messagePreview: '🔒 💬',
        originalMessageId: REPLIED_MSG_ID,
        ...extra,
      } as any),
  ],
  [
    'createMentionNotification',
    (service: NotificationService, extra: Record<string, unknown>) =>
      service.createMentionNotification({
        mentionedUserId: RECIPIENT_ID,
        mentionerUserId: SENDER_USER_ID,
        messageId: MSG_ID,
        conversationId: CONV_ID,
        messagePreview: '🔒 💬',
        ...extra,
      } as any),
  ],
] as const;

describe.each(derivingRunners)('%s — le chiffré part sur le fil (#17080)', (_name, run) => {
  it('la charge remise à APNs porte l\'enveloppe que la NSE déchiffre', async () => {
    const { service, sendToUser } = makeService();

    await run(service, { notificationLocKey: 'notification.encrypted_message' });

    expect(servedPushData(sendToUser)?.encryptedContent).toBe(ENVELOPE);
  });

  it('elle vient des DEUX lectures que ce créateur faisait déjà — aucune requête de plus', async () => {
    // Quatre colonnes sur la relecture du message, et le régime de la
    // conversation sur la lecture de conversation du MÊME `Promise.all`.
    //
    // L'absence de relation `conversation` sur la relecture est ASSERTÉE, pas
    // subie : la prendre là coûterait un aller-retour de plus pour une valeur
    // en main deux lignes plus loin, et cette relation est REQUISE — l'absence
    // du document ferait lever le moteur sur une lecture qui réussissait.
    const { service, prisma } = makeService();

    await run(service, { notificationLocKey: 'notification.encrypted_message' });

    expect(prisma.message.findUnique).toHaveBeenCalledTimes(1);
    const select = prisma.message.findUnique.mock.calls[0][0].select;
    expect(select.encryptedContent).toBe(true);
    expect(select.encryptionMode).toBe(true);
    expect(select.isViewOnce).toBe(true);
    expect(select.isBlurred).toBe(true);
    expect(select).not.toHaveProperty('conversation');

    expect(prisma.conversation.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.conversation.findUnique.mock.calls[0][0].select.encryptionMode).toBe(true);
  });

  it('aucun appelant n\'a à la câbler — elle n\'est pas un paramètre', async () => {
    // Le chemin d'ÉDITION (`notifyNewlyMentioned`) appelle le lot de mentions
    // sans jamais composer de charge push : une enveloppe passée en paramètre
    // serait absente là, et le symptôme survivrait sur ce chemin.
    const { service, sendToUser } = makeService();

    await run(service, {});

    expect(servedPushData(sendToUser)?.encryptedContent).toBe(ENVELOPE);
  });

  it('une conversation en clair ne pose aucune enveloppe', async () => {
    const { service, sendToUser } = makeService({
      encryptedContent: null,
      conversation: { encryptionMode: null },
    });

    await run(service, {});

    expect(servedPushData(sendToUser)?.encryptedContent).toBe('');
  });

  it('se tait quand la relecture tombe — jamais un chiffré inventé', async () => {
    const { service, sendToUser, prisma } = makeService();
    prisma.message.findUnique.mockRejectedValue(new Error('mongo down'));

    await run(service, {});

    expect(servedPushData(sendToUser)?.encryptedContent).toBe('');
  });
});

describe.each(derivingRunners)('%s — le PREMIER verrou, sur le chemin qui le DÉRIVE (#17177)', (_name, run) => {
  /**
   * Ces deux chemins dérivent leur enveloppe de la relecture partagée, donc
   * c'est `deviceEnvelopeFor` + `deviceEnvelopeForPush` qui les garde — et
   * l'audit adversarial du lot a MESURÉ que rien ne le vérifiait : remplacer la
   * résolution par la matière brute (`encryptedContent` servi tel quel) laissait
   * 3 063 témoins sur 3 063 VERTS. Les témoins de protection d'alors ne
   * lisaient que le lot `regular`, et le harnais fixait `isViewOnce: false`,
   * `isBlurred: false`, `expiresAt: null` — **le verrou ne pouvait pas rougir.**
   *
   * Un double PARTIEL qui gèle le verdict, exactement la forme que ce lot
   * prétendait chercher. Les témoins ci-dessous sont montés sur un harnais
   * PARAMÉTRÉ par le régime et par la protection.
   */
  it.each(['server', 'hybrid'])(
    'une conversation %s ne pousse PAS le chiffré AU REPOS',
    async (mode) => {
      // #13114 — en `server`/`hybrid`, `encryptedContent` est le chiffré au
      // repos, sous la clé que SEULE la passerelle détient : aucun lecteur ne
      // saurait l'ouvrir, et il n'a rien à faire chez Apple ou Google.
      const { service, sendToUser } = makeService({}, mode);

      await run(service, {});

      expect(servedPushData(sendToUser)?.encryptedContent).toBe('');
    }
  );

  it.each([
    ['à vue unique', { isViewOnce: true }],
    ['flouté', { isBlurred: true }],
    ['éphémère (échéance)', { expiresAt: ephemeralDeadline() }],
    ['éphémère (durée déclarée)', { ephemeralDuration: 30 }],
  ])(
    'un message %s d\'une conversation e2ee ne pousse AUCUNE enveloppe, SANS clé de protection',
    async (_label, overrides) => {
      // Le cas du chemin d'ÉDITION, et il n'est pas théorique :
      // `notifyNewlyMentioned` appelle le lot de mentions SANS transmettre
      // `notificationLocKey`, donc le SECOND verrou y est inerte
      // (`envelopeSurvivesProtectionLock(undefined)` rend `true`). Sur ce
      // chemin, le premier verrou est le SEUL — c'est le témoin qui le dit.
      const { service, sendToUser } = makeService(overrides);

      await run(service, {});

      expect(servedPushData(sendToUser)?.encryptedContent).toBe('');
    }
  );

  it('un message e2ee ORDINAIRE la pousse — le verrou ne mord pas au cas nominal', async () => {
    const { service, sendToUser } = makeService();

    await run(service, {});

    expect(servedPushData(sendToUser)?.encryptedContent).toBe(ENVELOPE);
  });
});

const allThreeRunners = [
  ...derivingRunners,
  [
    'createMessageNotification',
    (service: NotificationService, extra: Record<string, unknown>) =>
      service.createMessageNotification({
        recipientUserId: RECIPIENT_ID,
        senderId: SENDER_USER_ID,
        messageId: MSG_ID,
        conversationId: CONV_ID,
        messagePreview: '👁️ 🖼️',
        encryptedContent: ENVELOPE,
        ...extra,
      } as any),
  ],
] as const;

describe.each(allThreeRunners)('%s — le SECOND VERROU du fil (#17177)', (_name, run) => {
  // `createNotification` est le seul producteur de `data.encryptedContent`. Le
  // verrou s'y pose sur la clé qui DÉCLARE la protection, comme pour le média
  // (cycle 125) : un appelant qui masque le corps sans retirer son chiffré
  // perd le déchiffrement local, jamais le secret.
  it.each([
    'notification.view_once_message',
    'notification.hidden_message',
    'notification.ephemeral_message',
  ])('la clé %s retient le chiffré', async (locKey) => {
    const { service, sendToUser, prisma } = makeService();

    await run(service, { notificationLocKey: locKey, previewBasis: { kind: 'protected-placeholder' } });

    // Sur le FIL, la clé reste présente et VIDE : `createNotification` sert
    // `context.encryptedContent || ''` depuis toujours, et une conversation en
    // clair pousse déjà cette chaîne vide. Le verrou ne change donc pas la
    // forme du fil — rétrocompatibilité, directive #9231 — il change ce qu'elle
    // porte. Dans la LIGNE persistée, la clé n'est pas écrite du tout.
    expect(servedPushData(sendToUser)?.encryptedContent).toBe('');
    expect(prisma.notification.create.mock.calls[0][0].data.context).not.toHaveProperty('encryptedContent');
    expect(JSON.stringify(prisma.notification.create.mock.calls[0][0])).not.toContain(ENVELOPE);
  });

  it('la clé du CHIFFREMENT, elle, le laisse passer', async () => {
    const { service, sendToUser } = makeService();

    await run(service, {
      notificationLocKey: 'notification.encrypted_message',
      previewBasis: { kind: 'protected-placeholder' },
    });

    expect(servedPushData(sendToUser)?.encryptedContent).toBe(ENVELOPE);
  });
});

describe('createMentionNotificationsBatch — le relais RÉPAND l\'enveloppe (#17080)', () => {
  it('deux mentionnés ⇒ deux charges qui la portent, pour UNE relecture', async () => {
    const { service, sendToUser, prisma } = makeService();

    await service.createMentionNotificationsBatch(
      [RECIPIENT_ID, THIRD_USER_ID],
      {
        senderId: SENDER_USER_ID,
        messageContent: '🔒 💬',
        conversationId: CONV_ID,
        messageId: MSG_ID,
        notificationLocKey: 'notification.encrypted_message',
      } as any,
      [RECIPIENT_ID, THIRD_USER_ID, SENDER_USER_ID]
    );

    expect(sendToUser).toHaveBeenCalledTimes(2);
    expect(servedPushData(sendToUser, 0)?.encryptedContent).toBe(ENVELOPE);
    expect(servedPushData(sendToUser, 1)?.encryptedContent).toBe(ENVELOPE);
    expect(prisma.message.findUnique).toHaveBeenCalledTimes(1);
  });
});
