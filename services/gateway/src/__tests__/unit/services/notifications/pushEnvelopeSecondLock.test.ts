/**
 * Cycle 152 — le SECOND verrou de l'enveloppe de l'appareil (#17195), et la
 * troisième preuve de mort que la relecture des bannières ne lisait pas
 * (#17208).
 *
 * `deviceEnvelopeForPush` (#17191) retient l'enveloppe quand le message porte
 * une protection plus forte que son chiffrement. Elle lit ces drapeaux **dans
 * ses paramètres** : depuis le cycle 151 les cinq champs sont REQUIS par le
 * type, donc un appelant qui n'en dit rien ne compile pas — et c'est le maximum
 * qu'une fonction PURE puisse garantir. Ce n'est pas le maximum souhaitable :
 * un appelant peut toujours écrire `null` de bonne foi sur une ligne qu'il n'a
 * pas chargée entière.
 *
 * > **Une garde de confidentialité se relit CHEZ ELLE, pas dans ses
 * > paramètres.** Un paramètre dont l'absence désactive une garde est un
 * > demi-correctif — et les transports construisent chacun leur propre
 * > enregistrement.
 *
 * D'où ces témoins, et leur forme : ils FONT MENTIR l'éventail. Ils déclarent
 * un message ORDINAIRE au créateur — enveloppe fournie, aucun drapeau — pendant
 * que la base le dit à VUE UNIQUE, ÉPHÉMÈRE ou FLOUTÉ. Aucun ne peut tomber si
 * la garde reste uniquement dans l'éventail : c'est précisément ce que mesure
 * « un piège armé, pas une panne » (l'audit du cycle 151 a énuméré les deux
 * appelants et constaté qu'aucun ne la désarme AUJOURD'HUI), et le dépôt ne
 * laisse pas un piège armé au motif que personne n'a encore marché dessus
 * (cycle 84).
 *
 * Les témoins portent sur ce qui atteint APNs et sur la ligne PERSISTÉE —
 * jamais sur un calcul intermédiaire.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { NotificationService } from '../../../../services/notifications/NotificationService';
import {
  protectedBeyondEncryption,
  MESSAGE_PROTECTION_SELECT,
} from '../../../../services/messages/push-envelope-protection';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

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

const SERVER_CLOCK = new Date('2026-11-09T10:00:00Z');

/** L'enveloppe que la NSE ouvre — la seule chose qui ne doit pas franchir la garde. */
const ENVELOPE = 'BASE64_CIPHERTEXT_DU_MESSAGE';

/**
 * La ligne telle que la relecture la rend. ORDINAIRE par défaut : chaque témoin
 * ne pose QUE la protection qu'il mesure, pour que l'échec nomme sa cause.
 */
const row = (overrides: Record<string, unknown> = {}) => ({
  deletedAt: null,
  expiresAt: null,
  viewOnceBurnedAt: null,
  isViewOnce: null,
  isBlurred: null,
  effectFlags: null,
  ephemeralDuration: null,
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
      // Conversation CHIFFRÉE : c'est l'hypothèse de toute la branche.
      findUnique: jest.fn<any>().mockResolvedValue({
        title: 'Salon', type: 'group', avatar: null, encryptionMode: 'e2ee',
      }),
    },
    participant: { findUnique: jest.fn<any>(), findMany: jest.fn<any>().mockResolvedValue([]) },
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

/** Le lot `regular` — l'éventail qui tient sa source de sa propre relecture. */
const runRegular = (service: NotificationService) =>
  service.createMessageNotification({
    recipientUserId: RECIPIENT_ID,
    senderId: SENDER_USER_ID,
    messageId: MSG_ID,
    conversationId: CONV_ID,
    messagePreview: '🔒 💬',
    encryptedContent: ENVELOPE,
    senderProfile: { username: 'alice', displayName: 'Alice', avatar: null },
  } as any);

/** Le lot `reply` — celui qui sert la personne VISÉE. */
const runReply = (service: NotificationService) =>
  service.createReplyNotification({
    recipientUserId: RECIPIENT_ID,
    replierUserId: SENDER_USER_ID,
    messageId: MSG_ID,
    conversationId: CONV_ID,
    messagePreview: '🔒 💬',
    originalMessageId: REPLIED_MSG_ID,
    encryptedContent: ENVELOPE,
    senderProfile: { username: 'alice', displayName: 'Alice', avatar: null },
  } as any);

/** Le lot `mentions` — celui qui perce la sourdine. */
const runMention = (service: NotificationService) =>
  service.createMentionNotificationsBatch(
    [RECIPIENT_ID],
    {
      senderId: SENDER_USER_ID,
      senderProfile: { username: 'alice', displayName: 'Alice', avatar: null },
      messageContent: '🔒 💬',
      conversationId: CONV_ID,
      messageId: MSG_ID,
      encryptedContent: ENVELOPE,
    } as any,
    [SENDER_USER_ID, RECIPIENT_ID]
  );

const fanOuts = (): ReadonlyArray<readonly [string, (s: NotificationService) => Promise<unknown>]> => [
  ['regular', runRegular],
  ['reply', runReply],
  ['mentions', runMention],
];

/** Ce que la charge push porte réellement sous `data.encryptedContent`. */
const pushedEnvelope = (sendToUser: any): unknown =>
  sendToUser.mock.calls[0]?.[0]?.payload?.data?.encryptedContent;

/**
 * Les trois protections qui PRIMENT le chiffrement, chacune par les DEUX
 * chemins qui la déclarent : la colonne, et le bit d'`effectFlags`.
 *
 * Les deux chemins importent — `composeMessageEffectFlags` miroite les colonnes
 * dans le bitfield à l'envoi, donc une ligne écrite par le chemin courant porte
 * la protection DEUX fois ; les colonnes booléennes sont le filet des lignes
 * HÉRITÉES dont le bit n'a pas été posé, et le bit celui des canaux qui n'ont
 * pas de colonne.
 */
const strongerThanEncryption = (): ReadonlyArray<readonly [string, Record<string, unknown>]> => [
  ['vue unique (colonne)', { isViewOnce: true }],
  ['vue unique (effectFlags)', { effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }],
  ['flouté (colonne)', { isBlurred: true }],
  ['flouté (effectFlags)', { effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }],
  ['éphémère (échéance)', { expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) }],
  ['éphémère (durée)', { ephemeralDuration: 30 }],
  ['éphémère (effectFlags)', { effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL }],
  ['éphémère après lecture', { effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ }],
];

describe('#17195 — le second verrou : la relecture VIVANTE ré-affirme la protection', () => {
  describe.each(fanOuts())('éventail %s', (_label, run) => {
    it.each(strongerThanEncryption())(
      'un appelant qui déclare un message ORDINAIRE alors que la base le dit %s ne fait pas partir l\'enveloppe',
      async (_protection, dbFlags) => {
        // L'appelant MENT : il fournit l'enveloppe et ne déclare aucun drapeau.
        // Seule la relecture sait, et c'est elle qui doit trancher.
        const { service, sendToUser, prisma } = makeService(
          jest.fn<any>().mockResolvedValue(row(dbFlags))
        );

        await run(service);

        expect(sendToUser).toHaveBeenCalled();
        expect(pushedEnvelope(sendToUser)).toBe('');
        expect(JSON.stringify(sendToUser.mock.calls)).not.toContain(ENVELOPE);
        expect(JSON.stringify(prisma.notification.create.mock.calls)).not.toContain(ENVELOPE);
      }
    );

    it('un message ORDINAIRE en conversation chiffrée garde son enveloppe — la garde ne referme pas #17080', async () => {
      const { service, sendToUser } = makeService(jest.fn<any>().mockResolvedValue(row()));

      await run(service);

      expect(pushedEnvelope(sendToUser)).toBe(ENVELOPE);
    });
  });

  it('une relecture qui LÈVE retient l\'enveloppe — fail-CLOSED, à l\'inverse de la vivacité', async () => {
    // Les deux arbitrages cohabitent dans la même relecture et ne se
    // contredisent pas : la vivacité est fail-OPEN parce que c'est une
    // LIVRAISON qui est en jeu, l'enveloppe fail-CLOSED parce que c'est un
    // SECRET. La bannière reste « 🔒 💬 » — l'état d'avant #17080 — et elle
    // part.
    const { service, sendToUser } = makeService(jest.fn<any>().mockRejectedValue(new Error('mongo down')));

    await expect(runReply(service)).resolves.not.toBeNull();
    expect(sendToUser).toHaveBeenCalled();
    expect(pushedEnvelope(sendToUser)).toBe('');
  });

  it('la relecture DEMANDE les cinq colonnes de la préséance — le select est la condition qu\'aucun témoin de verdict ne peut voir', async () => {
    // Un double Prisma rend ce qu'on lui dit quel que soit le `select` : sans ce
    // témoin, les huit témoins ci-dessus passent au vert sur une requête qui ne
    // ramène pas les colonnes, et la garde est morte en production.
    const findUnique = jest.fn<any>().mockResolvedValue(row());
    const { service } = makeService(findUnique);

    await runReply(service);

    for (const call of findUnique.mock.calls) {
      expect(call[0].select).toMatchObject(MESSAGE_PROTECTION_SELECT);
    }
  });
});

describe('protectedBeyondEncryption — la loi, seule', () => {
  const ordinary = {
    isViewOnce: null, isBlurred: null, effectFlags: null, expiresAt: null, ephemeralDuration: null,
  } as const;

  it('fail-CLOSED : une ligne ABSENTE répond « protégé »', () => {
    expect(protectedBeyondEncryption(null)).toBe(true);
    expect(protectedBeyondEncryption(undefined)).toBe(true);
  });

  it('une ligne ordinaire répond « non protégé » — sinon la garde retiendrait tout', () => {
    expect(protectedBeyondEncryption(ordinary)).toBe(false);
  });

  it.each(strongerThanEncryption())('%s prime le chiffrement', (_label, flags) => {
    expect(protectedBeyondEncryption({ ...ordinary, ...flags } as any)).toBe(true);
  });

  it('le CHIFFREMENT seul ne prime pas — le mode d\'échec silencieux du correctif', () => {
    // Passer `isEncrypted` rendrait le prédicat vrai partout et retiendrait
    // l'enveloppe pour TOUT LE MONDE : la feature #17080 serait annulée sans
    // qu'un seul témoin de fuite tombe.
    expect(protectedBeyondEncryption({ ...ordinary, isEncrypted: true } as any)).toBe(false);
  });

  it('un effet COMPORTEMENTAL n\'est pas une protection — seuls les trois bits de cycle de vie priment', () => {
    // `effectFlags` porte DEUX familles (§ `BEHAVIORAL_EFFECTS`) : interroger le
    // bitfield en bloc (`effectFlags !== 0`) retiendrait l'enveloppe de tout
    // message animé. La loi partagée est appelée pour cette raison exacte.
    expect(protectedBeyondEncryption({ ...ordinary, effectFlags: MESSAGE_EFFECT_FLAGS.GLOW } as any)).toBe(false);
    expect(protectedBeyondEncryption({ ...ordinary, effectFlags: MESSAGE_EFFECT_FLAGS.CONFETTI } as any)).toBe(false);
  });

  it('une durée éphémère NULLE ou négative n\'est pas une protection', () => {
    expect(protectedBeyondEncryption({ ...ordinary, ephemeralDuration: 0 } as any)).toBe(false);
  });
});
