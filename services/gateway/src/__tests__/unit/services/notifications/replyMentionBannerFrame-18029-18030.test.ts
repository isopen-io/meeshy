/**
 * Cycle 153 — deux champs que la convergence des trois éventails a laissés
 * derrière, pour deux raisons différentes.
 *
 *  1. **#18029 — `conversationAvatar`.** Il ne compose AUCUNE chaîne : il
 *     QUALIFIE la bannière (repli de groupe de l'avatar iOS). Le relevé
 *     mécanique des clés de `context` des trois `createNotification` le donne
 *     présent sur le message et la mention, absent sur la RÉPONSE — et la cause
 *     est une colonne en amont, le `select` de la conversation de ce lot ne
 *     lisant pas `avatar`. C'est la forme du cycle 126, et le mécanisme qui la
 *     rend invisible est le même : « qui compose ce texte ? » ne trouve jamais
 *     ce qui ne compose rien.
 *
 *  2. **#18030 — l'échéance.** Réponse et mention la tiennent de l'APPELANT
 *     sous une exemption ÉCRITE : « `Message.expiresAt` est écrit à l'insertion
 *     et jamais modifié ensuite, donc sa copie ne peut pas dériver ». Le dépôt
 *     a une règle pour ça (cycle 127) : *un doc-comment qui EXEMPTE une unité
 *     d'une règle que sa voisine applique se vérifie comme une affirmation*.
 *     Elle est FAUSSE — quatre écrivains post-insertion, dont trois ne font que
 *     RAPPROCHER l'échéance (`ephemeralCountdown`, `consumeAfterReadMessages`,
 *     `captureNoticeRetention`). La copie de l'appelant peut donc être plus
 *     TARDIVE que la réalité, et la ligne `Notification` — qui porte le corps
 *     servi et l'enveloppe — survivrait au message qu'elle annonce.
 *
 *     La relecture est GRATUITE : `loadMessagePrismSource` SÉLECTIONNE déjà
 *     `expiresAt` (via `MESSAGE_LIVENESS_SELECT`, cycle 127). La colonne entre
 *     dans la requête et ne ressort pas de la source.
 *
 * Les témoins portent sur la ligne `Notification` réellement écrite et sur la
 * charge réellement remise à APNs — jamais sur un calcul intermédiaire.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { NotificationService } from '../../../../services/notifications/NotificationService';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';
const REPLIED_MSG_ID = '507f1f77bcf86cd799439052';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const RECIPIENT_ID = '507f1f77bcf86cd799439043';

const SERVER_CLOCK = new Date('2026-11-13T10:00:00Z');
const GROUP_AVATAR = 'https://cdn.example/groupe/salon.jpg';

/** Ce que la base dit du message, surchargeable par témoin. */
function makeServicePrisma(liveRow: Record<string, unknown>, conversation: Record<string, unknown>) {
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
        ...liveRow,
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
          where?.id === RECIPIENT_ID
            ? { id: RECIPIENT_ID, systemLanguage: 'fr' }
            : { id: SENDER_USER_ID, username: 'alice', displayName: 'Alice', avatar: null }
        )
      ),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue(conversation) },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;
}

function makeService(
  options: {
    live?: Record<string, unknown>;
    conversation?: Record<string, unknown>;
  } = {}
) {
  const prisma = makeServicePrisma(
    options.live ?? {},
    options.conversation ?? { title: 'Salon', type: 'group', avatar: GROUP_AVATAR }
  );
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

/** La ligne `Notification` réellement écrite. */
const createdRow = (prisma: any): Record<string, any> | undefined =>
  prisma.notification.create.mock.calls[0]?.[0]?.data;

const runners = [
  [
    'createReplyNotification',
    (service: NotificationService, extra: Record<string, unknown>) =>
      service.createReplyNotification({
        recipientUserId: RECIPIENT_ID,
        replierUserId: SENDER_USER_ID,
        messageId: MSG_ID,
        conversationId: CONV_ID,
        messagePreview: 'Regarde ça',
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
        messagePreview: 'Regarde ça',
        ...extra,
      } as any),
  ],
] as const;

// ── #18029 — l'avatar du groupe QUALIFIE les trois bannières ────────────────

describe.each(runners)('%s — #18029 l\'avatar de la conversation', (_name, run) => {
  it('voyage dans le contexte, comme sur un message simple', async () => {
    // `SocketNotificationEvent+Toast.swift` : avatar de l'expéditeur, à défaut
    // celui du GROUPE, à défaut les initiales. Sans ce champ, une réponse d'un
    // expéditeur sans photo n'affiche rien là où son message simple affiche le
    // groupe — même conversation, même instant, deux apparences.
    const { service, prisma } = makeService();

    await run(service, {});

    expect(createdRow(prisma)?.context?.conversationAvatar).toBe(GROUP_AVATAR);
  });

  it('se lit depuis la requête de conversation que ce lot fait DÉJÀ', async () => {
    // Un témoin de rendu ne peut pas voir une colonne absente du `select` : un
    // double Prisma rend ce qu'on lui dit. Le témoin de PROJECTION assert donc
    // sur la REQUÊTE (leçon « le select est le seul des trois qu'aucun témoin
    // de rang ne peut voir »).
    const { service, prisma } = makeService();

    await run(service, {});

    expect(prisma.conversation.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.conversation.findUnique.mock.calls[0][0].select.avatar).toBe(true);
  });

  it('reste absent quand la conversation n\'en a pas — jamais une chaîne vide', async () => {
    const { service, prisma } = makeService({
      conversation: { title: 'Salon', type: 'group', avatar: null },
    });

    await run(service, {});

    expect(createdRow(prisma)?.context?.conversationAvatar).toBeUndefined();
  });
});

// ── #18030 — l'échéance se relit chez elle ──────────────────────────────────

// Trois échéances RELATIVES à l'horloge du run : `messageLivenessOf` compare
// `expiresAt` à `Date.now()`, et une date gelée dans le fichier finit par
// basculer dans le passé — le message serait alors `gone`, et l'absence de
// notification ferait passer ces témoins pour une régression d'échéance.
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);
const CALLER_DEADLINE = inHours(8);
const BASE_RAPPROCHEE = inHours(2);
const BASE_REPOUSSEE = inHours(20);

describe.each(runners)('%s — #18030 l\'échéance servie', (_name, run) => {
  it('prend celle de la BASE quand elle est plus proche que celle de l\'appelant', async () => {
    // Les trois RAPPROCHEURS (`ephemeralCountdown`, `consumeAfterReadMessages`,
    // `captureNoticeRetention`) écrivent après l'insertion. La copie que
    // l'appelant porte depuis l'envoi est alors périmée, et dans le seul sens
    // qui compte : plus TARDIVE que la réalité.
    const { service, prisma } = makeService({ live: { expiresAt: BASE_RAPPROCHEE } });

    await run(service, { messageExpiresAt: CALLER_DEADLINE });

    expect(createdRow(prisma)?.expiresAt).toEqual(BASE_RAPPROCHEE);
  });

  it('garde celle de l\'appelant quand la base n\'en porte AUCUNE', async () => {
    // Cas nominal d'un éphémère : le décompte ne démarre qu'à la réception, et
    // l'éventail court AVANT. Prendre la base seule retirerait l'échéance.
    const { service, prisma } = makeService({ live: { expiresAt: null } });

    await run(service, { messageExpiresAt: CALLER_DEADLINE });

    expect(createdRow(prisma)?.expiresAt).toEqual(CALLER_DEADLINE);
  });

  it('garde celle de l\'appelant quand la base REPOUSSE', async () => {
    // Une notification qui s'efface avant son message ne retire qu'une
    // bannière ; une notification qui lui survit laisse le texte en base.
    const { service, prisma } = makeService({ live: { expiresAt: BASE_REPOUSSEE } });

    await run(service, { messageExpiresAt: CALLER_DEADLINE });

    expect(createdRow(prisma)?.expiresAt).toEqual(CALLER_DEADLINE);
  });

  it('garde celle de l\'appelant quand la relecture TOMBE', async () => {
    // `loadMessagePrismSource` est fail-OPEN et rend `UNKNOWN_BANNER_SOURCE`.
    // Une panne de lecture n'autorise pas à PROLONGER une échéance, et n'en
    // autorise pas davantage le retrait.
    const { service, prisma } = makeService();
    prisma.message.findUnique.mockRejectedValue(new Error('mongo down'));

    await run(service, { messageExpiresAt: CALLER_DEADLINE });

    expect(createdRow(prisma)?.expiresAt).toEqual(CALLER_DEADLINE);
  });

  it('ne pose AUCUNE échéance quand ni la base ni l\'appelant n\'en portent', async () => {
    const { service, prisma } = makeService({ live: { expiresAt: null } });

    await run(service, {});

    expect(createdRow(prisma)?.expiresAt).toBeNull();
  });

  it('vient de la relecture que ce créateur faisait DÉJÀ — aucune requête de plus', async () => {
    const { service, prisma } = makeService({ live: { expiresAt: BASE_RAPPROCHEE } });

    await run(service, { messageExpiresAt: CALLER_DEADLINE });

    expect(prisma.message.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.message.findUnique.mock.calls[0][0].select.expiresAt).toBe(true);
  });
});

// ── Ce que l'audit adversarial a trouvé NON GARDÉ ───────────────────────────
//
// Trois entrées de ce chemin passaient n'importe quelle mutation. Les trois
// sont devenues LOAD-BEARING avec ce lot, et c'est ce qui les rend urgentes :
// #18030 fait DÉPENDRE l'échéance servie de la ligne relue, et #18038 fait de
// `readerId` la SEULE valeur propre au site d'appel du helper partagé — donc
// exactement celle qu'une future fusion du troisième éventail câblera de
// travers.
//
// Mesuré avant de les écrire, sur la suite ENTIÈRE des notifications :
//
//   | mutation                                           | avant | après |
//   |----------------------------------------------------|-------|-------|
//   | la RÉPONSE relit `originalMessageId` (le message CITÉ) | 1490 verts | rouge |
//   | `readerId` = l'expéditeur au lieu du destinataire   | vert  | rouge |
//   | `contentDetail` retiré du contexte                  | vert  | rouge |
//
// Le premier est le plus cher : servir l'échéance du message CITÉ serait PIRE
// que le défaut que #18030 corrige, et aucun témoin ne tombait.

describe('#18030 — de QUELLE ligne vient l\'échéance servie', () => {
  // Un double qui rend la MÊME ligne pour tout id ne peut pas distinguer
  // « relit la réponse » de « relit le message cité » : c'est ce qui a laissé
  // la mutation passer. Celui-ci répond PAR LIGNE.
  function twoRowService() {
    const prisma = makeServicePrisma({}, { title: 'Salon', type: 'group', avatar: GROUP_AVATAR });
    prisma.message.findUnique = jest.fn<any>().mockImplementation(({ where }: any) =>
      Promise.resolve({
        deletedAt: null,
        isViewOnce: false,
        viewOnceCount: 0,
        createdAt: SERVER_CLOCK,
        messageType: 'text',
        translations: null,
        originalLanguage: 'fr',
        // La RÉPONSE vit plus longtemps que le message qu'elle cite : servir
        // l'échéance du cité raccourcirait la bannière d'une réponse vivante.
        expiresAt: where?.id === MSG_ID ? BASE_REPOUSSEE : BASE_RAPPROCHEE,
      })
    );
    const sendToUser = jest.fn<any>().mockResolvedValue(undefined);
    const service = new NotificationService(prisma);
    service.setSocketIO({
      to: jest.fn<any>().mockReturnThis(),
      in: jest.fn<any>().mockReturnThis(),
      fetchSockets: jest.fn<any>().mockResolvedValue([]),
      emit: jest.fn<any>(),
    } as any);
    service.setPushNotificationService({ sendToUser } as any);
    return { service, prisma };
  }

  it('la RÉPONSE relit SA ligne, jamais celle du message cité', async () => {
    const { service, prisma } = twoRowService();

    await service.createReplyNotification({
      recipientUserId: RECIPIENT_ID,
      replierUserId: SENDER_USER_ID,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      messagePreview: 'Regarde ça',
      originalMessageId: REPLIED_MSG_ID,
    } as any);

    expect(prisma.message.findUnique.mock.calls[0][0].where.id).toBe(MSG_ID);
    expect(createdRow(prisma)?.expiresAt).toEqual(BASE_REPOUSSEE);
  });
});

describe('#18038 — les deux entrées propres au site d\'appel', () => {
  const STORY_DETAIL = {
    storyReply: { authorId: RECIPIENT_ID, storyId: '507f1f77bcf86cd799439061' },
  };

  it('`readerId` est le DESTINATAIRE : « votre story » ne se dit qu\'à son auteur', async () => {
    // `storyReplyFramed` (`served-banner-body.ts`) choisit
    // `content.storyReply.yours` ou `.other` sur `authorId === readerId`.
    // Câbler l'EXPÉDITEUR y ferait dire « votre story » à qui n'en est pas
    // l'auteur — et c'est la seule valeur que le helper partagé reçoit du site
    // d'appel, donc la seule qu'une fusion du troisième éventail peut inverser.
    const { service: s1, prisma: p1 } = makeService();
    await s1.createReplyNotification({
      recipientUserId: RECIPIENT_ID,
      replierUserId: SENDER_USER_ID,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      messagePreview: 'Jolie photo',
      originalMessageId: REPLIED_MSG_ID,
      contentDetail: STORY_DETAIL,
    } as any);

    const { service: s2, prisma: p2 } = makeService();
    await s2.createMentionNotification({
      mentionedUserId: RECIPIENT_ID,
      mentionerUserId: SENDER_USER_ID,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      messagePreview: 'Jolie photo',
      contentDetail: { storyReply: { ...STORY_DETAIL.storyReply, authorId: SENDER_USER_ID } },
    } as any);

    // Le destinataire EST l'auteur de la story ⇒ cadrage « vôtre ».
    // Le destinataire ne l'est PAS ⇒ cadrage « autre ». Les deux corps
    // diffèrent, et c'est `readerId` seul qui les sépare.
    // #14309 — le corps est une SYNTHÈSE, jamais le texte brut : seul le
    // CADRAGE change entre les deux, et c'est bien `readerId` qui le décide.
    expect(createdRow(p1)?.content).not.toBe(createdRow(p2)?.content);
    expect(createdRow(p1)?.content).toContain('votre story');
    expect(createdRow(p2)?.content).not.toContain('votre story');
  });

  it('`contentDetail` voyage dans le contexte — c\'est lui que le client recadre', async () => {
    const { service, prisma } = makeService();

    await service.createReplyNotification({
      recipientUserId: RECIPIENT_ID,
      replierUserId: SENDER_USER_ID,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      messagePreview: 'Jolie photo',
      originalMessageId: REPLIED_MSG_ID,
      contentDetail: STORY_DETAIL,
    } as any);

    expect(createdRow(prisma)?.context?.contentDetail).toEqual(STORY_DETAIL);
  });
});
