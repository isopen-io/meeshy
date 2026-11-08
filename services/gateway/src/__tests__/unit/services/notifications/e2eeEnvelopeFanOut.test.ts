/**
 * Cycle 150 — l'enveloppe de l'appareil, et ce qu'elle a le DROIT de porter.
 *
 * Deux défauts distincts vivent sur le même champ, et le second est l'inverse
 * exact du premier :
 *
 *  1. **#17080 — ABSENCE.** `encryptedContent` ne partait que sur l'éventail
 *     `regular` : ni `createReplyNotification` ni `createMentionNotification`
 *     n'en déclaraient le paramètre. En conversation chiffrée de bout en bout,
 *     une RÉPONSE ou une MENTION restait donc « 🔒 💬 » à vie — la NSE ne
 *     remplace le corps par le clair que si `userInfo["encryptedContent"]` est
 *     non vide, et `createNotification` lit `params.context.encryptedContent
 *     || ''`. C'est le cycle 126 à la lettre : l'enveloppe ne compose AUCUNE
 *     chaîne, elle est la charge que le LECTEUR déchiffre, donc elle ne se
 *     trouve pas en cherchant « qui compose ce corps ? ».
 *
 *  2. **FUITE — et c'est le cycle 124 rejoué sur le médium du cycle 125.**
 *     `protectedPreview` compose le placeholder d'un message à VUE UNIQUE,
 *     ÉPHÉMÈRE ou FLOUTÉ et pose `notificationLocKey` ; le cycle 125 a refermé
 *     le MÉDIA sous ce verrou (`pushMediaFields`), le cycle 124 le CORPS.
 *     `encryptedContent`, lui, voyage sous le seul `showPreview` — et
 *     `applyBodyRewrites` (NSE) écrit `content.body = decrypted` **sans jamais
 *     regarder la clé de protection** : la branche `locKey` n'est qu'un REPLI
 *     pour l'échec de déchiffrement. Le texte entier d'un message à vue unique
 *     s'affichait donc sur l'écran verrouillé, sous une bannière disant
 *     « 👁️ 🖼️ ».
 *
 * > Propager l'enveloppe aux deux autres éventails SANS ce verrou aurait porté
 * > la fuite aux deux populations les plus exposées — celle à qui on répond, et
 * > les mentionnés, dont la bannière perce la sourdine. C'est la leçon du
 * > cycle 127 (« une garde qui protège la population la plus NOMBREUSE peut
 * > manquer la plus EXPOSÉE ») prise à l'envers : le correctif de complétude et
 * > la garde de protection sont le MÊME lot, ou le premier arme le second.
 *
 * Le discriminant n'est pas « ce message est-il protégé ? » — en `e2ee` tout
 * message l'est (`protectedPreview` rend la branche `encrypted`, la moins
 * restrictive), et s'arrêter là retirerait l'enveloppe du cas NOMINAL, c'est-à-
 * dire la feature entière. C'est « la protection est-elle le CHIFFREMENT SEUL ? » :
 * l'enveloppe EST le mécanisme par lequel un message chiffré se montre à son
 * destinataire légitime ; elle n'est pas celui par lequel un message à vue
 * unique se montre à un écran verrouillé.
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
const THIRD_USER_ID = '507f1f77bcf86cd799439044';
const FOURTH_USER_ID = '507f1f77bcf86cd799439045';
const RECIPIENT_ID = '507f1f77bcf86cd799439043';

const SERVER_CLOCK = new Date('2026-11-08T10:00:00Z');
/** Le chiffré de l'appareil — opaque, et c'est tout l'intérêt. */
const ENVELOPE = 'YmFzZTY0LWVudmVsb3BwZS1kZS1sYXBwYXJlaWw=';

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
  messageOverrides: Record<string, unknown> = {},
  conversationMode: string | null = 'e2ee'
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
      encryptionMode: conversationMode,
      isViewOnce: false,
      isBlurred: false,
      effectFlags: 0,
      expiresAt: null,
      createdAt: SERVER_CLOCK,
      encryptedContent: ENVELOPE,
      ...messageOverrides,
    } as any,
    senderParticipantId: SENDER_PART_ID,
    conversationId: CONV_ID,
    processedContent: '',
    validatedMentionUserIds: [THIRD_USER_ID],
  });

  return {
    reply: createReplyNotification.mock.calls[0]?.[0] as Record<string, unknown> | undefined,
    mention: createMentionNotificationsBatch.mock.calls[0]?.[1] as Record<string, unknown> | undefined,
    regular: createMessageNotification.mock.calls[0]?.[0] as Record<string, unknown> | undefined,
  };
}

describe('éventail — l\'enveloppe de l\'appareil accompagne les TROIS lots (#17080)', () => {
  it('en e2ee, réponse et mention reçoivent la MÊME enveloppe que le message simple', async () => {
    const { reply, mention, regular } = await servedLots();

    expect(regular?.encryptedContent).toBe(ENVELOPE);
    expect(reply?.encryptedContent).toBe(ENVELOPE);
    expect(mention?.encryptedContent).toBe(ENVELOPE);
  });

  it('hors e2ee, aucun lot n\'en porte — le cas nominal reste identique', async () => {
    // Mode d'échec du correctif : `deviceEnvelopeForPush` rend `undefined` hors
    // E2EE, donc un témoin écrit en clair ne peut pas tomber. Celui-ci garde
    // l'autre moitié : propager le champ ne doit pas le FABRIQUER.
    const { reply, mention, regular } = await servedLots(
      { isEncrypted: false, encryptionMode: null },
      null
    );

    for (const lot of [regular, reply, mention]) {
      expect(lot?.encryptedContent).toBeUndefined();
    }
  });
});

describe('éventail — l\'enveloppe est RETENUE par le verrou de protection', () => {
  // Les trois protections qui ne sont PAS le chiffrement, une par branche de
  // `protectedPreview` au-dessus de `encrypted` dans sa préséance.
  const protections: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['vue unique', { isViewOnce: true }],
    ['flouté', { isBlurred: true }],
    ['éphémère', { expiresAt: new Date('2026-11-08T11:00:00Z') }],
  ];

  it.each(protections)(
    'un message %s en e2ee ne remet son chiffré à AUCUN des trois lots',
    async (_l, overrides) => {
      const { reply, mention, regular } = await servedLots(overrides);

      // Le placeholder est bien celui d'une protection PLUS forte que le
      // chiffrement — sans quoi le témoin mesurerait le cas nominal.
      expect(regular?.notificationLocKey).not.toBe('notification.encrypted_message');
      expect(regular?.notificationLocKey).toBeTruthy();

      for (const lot of [regular, reply, mention]) {
        expect(lot?.encryptedContent).toBeUndefined();
      }
    }
  );

  it('un message SEULEMENT chiffré la remet aux trois — l\'enveloppe EST la feature', async () => {
    // Mode d'échec du correctif, et il est total : en `e2ee` tout message est
    // protégé, donc une garde formulée « protectedOverride === null » (celle du
    // média, cycle 125) retirerait l'enveloppe à TOUTE conversation chiffrée.
    const { reply, mention, regular } = await servedLots();

    expect(regular?.notificationLocKey).toBe('notification.encrypted_message');
    for (const lot of [regular, reply, mention]) {
      expect(lot?.encryptedContent).toBe(ENVELOPE);
    }
  });
});

// ── Service — la charge réellement remise à APNs ───────────────────────────

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
      findUnique: jest.fn<any>().mockResolvedValue({ title: 'Salon', type: 'group', avatar: null }),
    },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;
}

function makeService() {
  const prisma = makeServicePrisma();
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

const servedPushData = (sendToUser: any): Record<string, any> | undefined =>
  sendToUser.mock.calls[0]?.[0]?.payload?.data;

const runners = [
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

describe.each(runners)('%s — l\'enveloppe atteint le fil APNs', (_name, run) => {
  it('la remet à la NSE, qui n\'a pas d\'autre source de clair', async () => {
    const { service, sendToUser } = makeService();

    await run(service, {
      encryptedContent: ENVELOPE,
      notificationLocKey: 'notification.encrypted_message',
    });

    expect(servedPushData(sendToUser)?.encryptedContent).toBe(ENVELOPE);
  });

  it('sans enveloppe, la clé reste vide — jamais `undefined` sur le fil', async () => {
    const { service, sendToUser } = makeService();

    await run(service, {});

    expect(servedPushData(sendToUser)?.encryptedContent).toBe('');
  });

  it('la RETIENT sous une protection plus forte, même si l\'appelant la passe', async () => {
    // Le SECOND VERROU, et il n'est pas redondant avec celui de l'éventail : un
    // appelant SOLO (édition, rejeu, script) n'a pas traversé
    // `notifyMessageRecipients`. Cf. cycle 125 — « le second verrou se pose sur
    // la clé qui DÉCLARE », et `protectedPreview` en est l'unique producteur.
    const { service, sendToUser } = makeService();

    await run(service, {
      encryptedContent: ENVELOPE,
      notificationLocKey: 'notification.view_once_message',
      messagePreview: '👁️ 💬',
    });

    const data = servedPushData(sendToUser);
    expect(data?.encryptedContent).toBe('');
    expect(JSON.stringify(data)).not.toContain(ENVELOPE);
  });
});
