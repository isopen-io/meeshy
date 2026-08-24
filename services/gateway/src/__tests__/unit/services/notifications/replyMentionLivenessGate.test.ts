/**
 * Cycle 127 — les trois éventails composent la même bannière ; un seul demande
 * si le message est encore VIVANT.
 *
 * `createMessageNotification` relit l'état du message juste avant de pousser, et
 * abandonne quand il a disparu, été rappelé ou expiré dans la fenêtre de
 * l'éventail. Son commentaire dit pourquoi, et il vaut mot pour mot pour les
 * deux autres lots : « we MUST NOT leak the original content via the banner ».
 *
 * Réponse et mention n'avaient AUCUNE garde. Elles relisent pourtant la MÊME
 * ligne, dans la MÊME fenêtre — `loadMessagePrismSource` — et passaient à côté
 * des colonnes qui disent la vie du message. Un message rappelé entre son commit
 * et l'éventail poussait donc son texte ORIGINAL sur l'écran verrouillé de la
 * personne à qui l'on répond et de tous les mentionnés, pendant que les membres
 * ordinaires du fil, eux, étaient protégés.
 *
 * Le balayage de rétraction en fin d'éventail ne rattrape pas ce cas : il retire
 * la LIGNE `Notification`, quand la bannière est déjà sur l'écran.
 *
 * > **Une garde qui protège la population la plus NOMBREUSE peut manquer la
 * > plus EXPOSÉE.** Le lot `regular` sert les membres passifs du fil ; la
 * > réponse sert la personne visée, et la mention perce jusqu'à la sourdine.
 *
 * Les témoins portent sur ce que le service REND et sur ce qui atteint APNs —
 * jamais sur un calcul intermédiaire.
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
const SECOND_RECIPIENT_ID = '507f1f77bcf86cd799439044';

const SERVER_CLOCK = new Date('2026-08-24T10:00:00Z');

/** Le texte que la bannière d'un message rappelé ne doit JAMAIS porter. */
const SECRET = 'le virement part demain sur le compte 4412';

/** La ligne telle que la relecture la rend quand le message est vivant. */
const liveRow = (overrides: Record<string, unknown> = {}) => ({
  deletedAt: null,
  expiresAt: null,
  translations: null,
  originalLanguage: 'fr',
  createdAt: SERVER_CLOCK,
  messageType: 'text',
  ...overrides,
});

function makeService(messageFindUnique: any) {
  const prisma = {
    message: { findUnique: messageFindUnique },
    notification: {
      create: jest.fn<any>().mockImplementation((args: any) => ({ id: 'notif_created', ...args.data })),
      findMany: jest.fn<any>().mockResolvedValue([]),
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
            : { id: where?.id, systemLanguage: 'fr' }
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

const runReply = (service: NotificationService) =>
  service.createReplyNotification({
    recipientUserId: RECIPIENT_ID,
    replierUserId: SENDER_USER_ID,
    messageId: MSG_ID,
    conversationId: CONV_ID,
    messagePreview: SECRET,
    originalMessageId: REPLIED_MSG_ID,
    senderProfile: { username: 'alice', displayName: 'Alice', avatar: null },
  } as any);

const runMentionBatch = (service: NotificationService, recipients = [RECIPIENT_ID]) =>
  service.createMentionNotificationsBatch(
    recipients,
    {
      senderId: SENDER_USER_ID,
      senderProfile: { username: 'alice', displayName: 'Alice', avatar: null },
      messageContent: SECRET,
      conversationId: CONV_ID,
      messageId: MSG_ID,
    } as any,
    [SENDER_USER_ID, ...recipients]
  );

const runRegular = (service: NotificationService) =>
  service.createMessageNotification({
    recipientUserId: RECIPIENT_ID,
    senderId: SENDER_USER_ID,
    messageId: MSG_ID,
    conversationId: CONV_ID,
    messagePreview: SECRET,
    senderProfile: { username: 'alice', displayName: 'Alice', avatar: null },
  } as any);

/**
 * Les deux formes qui PROUVENT que le message n'a plus à être annoncé, chacune
 * la fenêtre de course d'un geste réel : rappeler, laisser expirer.
 *
 * Une ligne ABSENTE n'en fait pas partie, et c'est le point de conception du
 * cycle : elle ne prouve rien. L'éventail l'écrit déjà pour sa rétraction —
 * « aucun chemin de la gateway ne supprime un message physiquement » — et une
 * lecture servie par un secondaire en retard rend `null` pour un message
 * parfaitement vivant. La traiter en preuve ferait perdre des annonces qu'aucun
 * réessai ne rattrape. Elle est gardée en POSITIF plus bas.
 */
const provenDead = (): ReadonlyArray<readonly [string, any]> => [
  ['rappelé en vol', jest.fn<any>().mockResolvedValue(liveRow({ deletedAt: new Date('2026-08-24T10:00:01Z') }))],
  ['expiré en vol', jest.fn<any>().mockResolvedValue(liveRow({ expiresAt: new Date('2026-08-24T09:59:59Z') }))],
];

describe('éventail RÉPONSE — la garde de vivacité que seul le lot regular portait', () => {
  it.each(provenDead())('un message %s ne pousse AUCUNE bannière de réponse', async (_label, findUnique) => {
    const { service, sendToUser, prisma } = makeService(findUnique);

    await expect(runReply(service)).resolves.toBeNull();

    expect(sendToUser).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('le texte original n\'atteint NI le fil push NI la ligne persistée', async () => {
    // Le cœur de la règle : ce n'est pas « une notification en trop », c'est le
    // contenu d'un message rappelé sur un écran verrouillé.
    const { service, sendToUser, prisma } = makeService(
      jest.fn<any>().mockResolvedValue(liveRow({ deletedAt: new Date('2026-08-24T10:00:01Z') }))
    );

    await runReply(service);

    const pushed = JSON.stringify(sendToUser.mock.calls);
    const persisted = JSON.stringify(prisma.notification.create.mock.calls);
    expect(pushed).not.toContain(SECRET);
    expect(persisted).not.toContain(SECRET);
  });

  it('un message VIVANT est annoncé — la garde ne referme pas le cas nominal', async () => {
    const { service, sendToUser } = makeService(jest.fn<any>().mockResolvedValue(liveRow()));

    await expect(runReply(service)).resolves.not.toBeNull();
    expect(sendToUser).toHaveBeenCalled();
  });

  it('une relecture qui LÈVE laisse la bannière partir — fail-OPEN', async () => {
    // Mode d'échec du correctif, et il n'est pas théorique : la relecture est
    // documentée fail-open depuis le cycle 122. « la dépendance n'a pas
    // répondu » et « la réponse dit non » sont deux verdicts distincts — les
    // confondre transformerait un hoquet Mongo en silence pour tout le fil.
    const { service, sendToUser } = makeService(jest.fn<any>().mockRejectedValue(new Error('mongo down')));

    await expect(runReply(service)).resolves.not.toBeNull();
    expect(sendToUser).toHaveBeenCalled();
  });
});

describe('éventail MENTION — la même garde, et elle se paie UNE fois pour le lot', () => {
  it.each(provenDead())('un message %s ne pousse AUCUNE bannière de mention', async (_label, findUnique) => {
    const { service, sendToUser, prisma } = makeService(findUnique);

    await expect(runMentionBatch(service, [RECIPIENT_ID, SECOND_RECIPIENT_ID])).resolves.toBe(0);

    expect(sendToUser).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('le lot abandonne sur UNE relecture, pas une par mentionné', async () => {
    // La source du Prisme est déjà relue une fois pour tout l'éventail : la
    // vivacité voyage avec elle, donc le verdict ne coûte aucune requête de
    // plus — et n'en ajoute pas non plus par destinataire.
    const findUnique = jest
      .fn<any>()
      .mockResolvedValue(liveRow({ deletedAt: new Date('2026-08-24T10:00:01Z') }));
    const { service } = makeService(findUnique);

    await runMentionBatch(service, [RECIPIENT_ID, SECOND_RECIPIENT_ID]);

    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('un message VIVANT est annoncé à tous ses mentionnés', async () => {
    const { service } = makeService(jest.fn<any>().mockResolvedValue(liveRow()));

    await expect(runMentionBatch(service, [RECIPIENT_ID, SECOND_RECIPIENT_ID])).resolves.toBe(2);
  });
});

describe('les TROIS lots rendent le même verdict', () => {
  // La forme du défaut : la parité ne se lit pas lot par lot, elle se lit en
  // les mettant côte à côte sur la MÊME ligne relue.
  it.each(provenDead())('sur un message %s, aucun des trois n\'annonce', async (_label, findUnique) => {
    const reply = makeService(findUnique);
    const mention = makeService(findUnique);
    const regular = makeService(findUnique);

    await expect(runReply(reply.service)).resolves.toBeNull();
    await expect(runMentionBatch(mention.service)).resolves.toBe(0);
    await expect(runRegular(regular.service)).resolves.toBeNull();

    for (const lot of [reply, mention, regular]) {
      expect(lot.sendToUser).not.toHaveBeenCalled();
    }
  });
});

describe('une ligne ABSENTE ne prouve rien — et les lots en tirent des politiques DIFFÉRENTES', () => {
  // Le point de conception du cycle, et il se garde en POSITIF : la tentation
  // est de traiter « pas de ligne » comme « message rappelé », ce qui ferait
  // perdre des annonces sur un simple retard de réplication.
  const vanished = () => jest.fn<any>().mockResolvedValue(null);

  it('réponse et mention annoncent quand même — leur échéance vient de l\'appelant', async () => {
    const reply = makeService(vanished());
    const mention = makeService(vanished());

    await expect(runReply(reply.service)).resolves.not.toBeNull();
    await expect(runMentionBatch(mention.service)).resolves.toBe(1);
  });

  it('le lot regular, lui, se tait — il tient sa source de cette relecture SEULE', async () => {
    // Politique PROPRE à ce lot, pas une propriété du message : sans ligne il
    // n'a ni horloge, ni langue d'origine, ni traduction à servir.
    const { service, sendToUser } = makeService(vanished());

    await expect(runRegular(service)).resolves.toBeNull();
    expect(sendToUser).not.toHaveBeenCalled();
  });
});

describe('la relecture de vivacité ne coûte aucune requête de plus', () => {
  it('les colonnes de vie sont demandées dans le select qui se faisait DÉJÀ', async () => {
    // Un témoin de PROJECTION, pas de rendu : un double Prisma rend ce qu'on lui
    // dit quel que soit son `select`, donc un témoin de comportement passerait
    // au vert sur une requête qui ne ramène pas ces colonnes — et la garde
    // serait morte en production.
    const findUnique = jest.fn<any>().mockResolvedValue(liveRow());
    const { service } = makeService(findUnique);

    await runReply(service);

    expect(findUnique).toHaveBeenCalledTimes(1);
    const select = findUnique.mock.calls[0][0].select;
    expect(select).toMatchObject({ deletedAt: true, expiresAt: true });
  });
});
