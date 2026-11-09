/**
 * Cycle 151 — l'ENVELOPPE de l'appareil, sur les trois éventails et sous la
 * protection du message.
 *
 * Deux lots, et ils ne se livrent pas séparément.
 *
 *  - **#17080** — `encryptedContent` ne partait que sur le lot `regular`. Une
 *    RÉPONSE ou une MENTION en conversation chiffrée restait « 🔒 💬 » à vie :
 *    la NSE ne remplace le corps que si `userInfo["encryptedContent"]` est non
 *    vide, et `createNotification` lit `params.context.encryptedContent || ''`.
 *    C'est le cycle 126 mot pour mot — l'enveloppe ne compose AUCUNE chaîne,
 *    donc elle ne se trouve pas en cherchant « qui compose ce corps ? ».
 *
 *  - **#17191** — et `deviceEnvelopeForPush` ne posait qu'une condition : le
 *    MODE. En E2EE, un message à VUE UNIQUE / ÉPHÉMÈRE / FLOUTÉ poussait donc
 *    son enveloppe, la NSE la déchiffrait, et le texte entier s'affichait sur
 *    l'écran verrouillé sous une bannière disant « 👁️ 💬 ».
 *
 * > **Pourquoi le second DOIT accompagner le premier.** Les destinataires d'une
 * > réponse et d'une mention sont la population la plus EXPOSÉE — la bannière
 * > d'une mention perce la sourdine. Faire voyager l'enveloppe sur ces deux
 * > éventails sans la garde aurait élargi une fuite vivante vers eux : « une
 * > garde qui protège la population la plus NOMBREUSE peut manquer la plus
 * > EXPOSÉE » (cycle 127), à l'envers.
 *
 * Pourquoi les quatre verrous du cycle 125 ne pouvaient pas l'attraper : en
 * E2EE `protectedOverride` n'est jamais `null`, donc `notificationLocKey` est
 * TOUJOURS posé — et l'enveloppe est précisément ce qui doit traverser ce
 * verrou pour que « 🔒 💬 » devienne le vrai texte. Le discriminant n'est pas
 * « y a-t-il un verrou ? » mais « la protection est-elle PLUS FORTE que le
 * chiffrement ? », une préséance que `protectedPreview` écrit déjà.
 *
 * Les témoins lisent ce que l'éventail REMET aux trois créateurs, puis la
 * charge réellement remise à APNs — jamais un calcul intermédiaire.
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
const MENTIONED_USER_ID = '507f1f77bcf86cd799439044';
const PLAIN_MEMBER_ID = '507f1f77bcf86cd799439045';

const SERVER_CLOCK = new Date('2026-11-09T10:00:00Z');

/** L'enveloppe de l'appareil : ce que la NSE déchiffre, et rien d'autre. */
const ENVELOPE = 'yK3mQ1pZ8hE2vA==';

function makePrisma(encryptionMode: string | null) {
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
        encryptionMode,
        participants: [
          { userId: SENDER_USER_ID },
          { userId: PEER_USER_ID },
          { userId: MENTIONED_USER_ID },
          { userId: PLAIN_MEMBER_ID },
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

/** Ce que les TROIS créateurs reçoivent de l'éventail. */
async function servedLots(
  encryptionMode: string | null,
  messageOverrides: Record<string, unknown> = {}
) {
  const createReplyNotification = jest.fn<any>().mockResolvedValue({ id: 'reply' });
  const createMentionNotificationsBatch = jest.fn<any>().mockResolvedValue(1);
  const createMessageNotification = jest.fn<any>().mockResolvedValue({ id: 'notif' });

  await notifyMessageRecipients({
    prisma: makePrisma(encryptionMode) as any,
    notificationService: {
      createReplyNotification,
      createMentionNotificationsBatch,
      createMessageNotification,
    },
    message: {
      id: MSG_ID,
      messageType: 'text',
      replyToId: REPLIED_MSG_ID,
      isEncrypted: encryptionMode !== null,
      encryptionMode,
      isViewOnce: false,
      isBlurred: false,
      effectFlags: 0,
      expiresAt: null,
      createdAt: SERVER_CLOCK,
      encryptedContent: ENVELOPE,
      metadata: null,
      ...messageOverrides,
    } as any,
    senderParticipantId: SENDER_PART_ID,
    conversationId: CONV_ID,
    processedContent: '',
    validatedMentionUserIds: [MENTIONED_USER_ID],
  });

  return {
    reply: createReplyNotification.mock.calls[0]?.[0] as Record<string, unknown> | undefined,
    mention: createMentionNotificationsBatch.mock.calls[0]?.[1] as Record<string, unknown> | undefined,
    regular: createMessageNotification.mock.calls[0]?.[0] as Record<string, unknown> | undefined,
  };
}

describe('#17080 — l’enveloppe de l’appareil accompagne les TROIS éventails', () => {
  it('une réponse et une mention portent la même enveloppe qu’un message simple', async () => {
    const { reply, mention, regular } = await servedLots('e2ee');

    expect(regular?.encryptedContent).toBe(ENVELOPE);
    expect(reply?.encryptedContent).toBe(ENVELOPE);
    expect(mention?.encryptedContent).toBe(ENVELOPE);
  });

  it('hors E2EE, aucun des trois ne la porte (non-régression)', async () => {
    // `deviceEnvelopeForPush` rend `undefined` hors E2EE : les trois éventails
    // sont identiques au cas nominal, donc ce témoin-ci ne peut PAS tomber sous
    // le défaut de #17080. Il garde le mode d'échec du correctif — une enveloppe
    // posée sans condition de mode.
    const { reply, mention, regular } = await servedLots(null);

    for (const lot of [regular, reply, mention]) {
      expect(lot?.encryptedContent).toBeUndefined();
    }
  });
});

describe('#17191 — une protection PLUS FORTE que le chiffrement retient l’enveloppe', () => {
  // Les trois branches de `protectedPreview` qui précèdent `encrypted` dans sa
  // préséance : éphémère > vue unique > flouté > chiffré.
  const stronger: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['à vue unique', { isViewOnce: true }],
    ['flouté', { isBlurred: true }],
    ['éphémère par échéance', { expiresAt: new Date('2026-11-09T11:00:00Z') }],
    ['éphémère par durée', { ephemeralDuration: 30 }],
  ];

  it.each(stronger)('un message %s en E2EE n’envoie son enveloppe sur AUCUN éventail', async (_label, overrides) => {
    const { reply, mention, regular } = await servedLots('e2ee', overrides);

    for (const lot of [regular, reply, mention]) {
      expect(lot?.encryptedContent).toBeUndefined();
    }
  });

  it.each(stronger)('et sa bannière garde la clé de la protection la plus forte (%s)', async (_label, overrides) => {
    const { regular } = await servedLots('e2ee', overrides);

    // Le mode d'échec symétrique : retenir l'enveloppe ET servir la clé
    // `encrypted_message` laisserait la NSE annoncer un chiffré qu'elle ne peut
    // pas ouvrir, au lieu du placeholder de la vraie protection.
    expect(regular?.notificationLocKey).toBeTruthy();
    expect(regular?.notificationLocKey).not.toBe('notification.encrypted_message');
  });
});

// ── Le fil push — qui AFFICHE ce que l'éventail élit ───────────────────────

function makeServicePrisma() {
  return {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        deletedAt: null,
        expiresAt: null,
        isViewOnce: false,
        viewOnceCount: 0,
        createdAt: SERVER_CLOCK,
        messageType: 'text',
        translations: null,
        originalLanguage: 'fr',
        ephemeralDuration: null,
        effectFlags: 0,
      }),
    },
    notification: {
      create: jest.fn<any>().mockImplementation((args: any) => ({ id: 'notif_created', ...args.data })),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: PEER_USER_ID,
        username: 'bob',
        displayName: 'Bob',
        avatar: null,
        systemLanguage: 'fr',
        regionalLanguage: null,
        customDestinationLanguage: null,
        deviceLocale: null,
      }),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        title: 'Salon',
        type: 'group',
        avatar: null,
        encryptionMode: 'e2ee',
      }),
    },
    userConversationPreferences: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

/** La charge remise à APNs pour un lot donné, de bout en bout. */
async function pushedBy(lot: 'reply' | 'mention'): Promise<string> {
  const prisma = makeServicePrisma();
  const sendToUser = jest.fn<any>().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO({
    to: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    fetchSockets: jest.fn<any>().mockResolvedValue([]),
    emit: jest.fn(),
  } as any);
  service.setPushNotificationService({ sendToUser } as any);

  const common = {
    messageId: MSG_ID,
    conversationId: CONV_ID,
    encryptedContent: ENVELOPE,
    notificationLocKey: 'notification.encrypted_message',
    messagePreview: '🔒 💬',
    senderProfile: { id: SENDER_USER_ID, username: 'alice', displayName: 'Alice', avatar: null },
  };

  if (lot === 'reply') {
    await service.createReplyNotification({
      ...common,
      recipientUserId: PEER_USER_ID,
      replierUserId: SENDER_USER_ID,
      originalMessageId: REPLIED_MSG_ID,
    } as any);
  } else {
    await service.createMentionNotificationsBatch(
      [MENTIONED_USER_ID],
      {
        ...common,
        senderId: SENDER_USER_ID,
        messageContent: common.messagePreview,
      } as any,
      [MENTIONED_USER_ID]
    );
  }

  return JSON.stringify(sendToUser.mock.calls.map((call) => call[0]));
}

describe('#17080 — et l’enveloppe atteint la charge que la NSE LIT', () => {
  // Cycle 122 : « un correctif dont la valeur n'atteint aucun lecteur n'a
  // corrigé personne ». La NSE ne lit QUE `userInfo["encryptedContent"]`.
  it.each(['reply', 'mention'] as const)('le fil push du lot %s porte l’enveloppe', async (lot) => {
    const charge = await pushedBy(lot);

    expect(charge).toContain('encryptedContent');
    expect(charge).toContain(ENVELOPE);
  });
});
