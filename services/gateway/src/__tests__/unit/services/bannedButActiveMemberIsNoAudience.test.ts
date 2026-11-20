/**
 * #20100 — un membre ACTIF-ET-BANNI n'est l'audience de rien : ni la bannière
 * d'un message, ni l'annonce d'un groupe qui démarre.
 *
 * `isActive: true, bannedAt ≠ null` EXISTE en base — bannir pendant qu'une
 * ligne est inactive n'écrit que `bannedAt` (`conversationBanState.ts`), et
 * aucune migration n'a reprise les lignes d'avant #10436. Une telle ligne est
 * exclue de `conversation:<id>` (`AuthHandler`) et du REST
 * (`canAccessConversation`), mais sa room `user:<id>` est rejointe
 * INCONDITIONNELLEMENT : l'écran verrouillé était le seul canal qui lui
 * restait, et il portait le texte.
 *
 * ── POURQUOI CES TÉMOINS ASSERTENT SUR LA REQUÊTE, PAS SUR LE RENDU ─────────
 *
 * Un double Prisma rend ce qu'on lui dit **quel que soit le `where`**. Sur
 * l'éventail, la clause EST le correctif : un témoin qui lui passerait un banni
 * dans la liste rendue serait vert avant comme après (la règle du dépôt :
 * « un témoin de projection assert sur la REQUÊTE »). Sur l'annonce, où la loi
 * s'applique APRÈS lecture, c'est l'inverse — le rendu est la seule chose qui
 * puisse tomber. Les deux formes de correctif n'ont pas le même témoin, et les
 * confondre rend une garde indémontrable.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { notifyMessageRecipients } from '../../../services/messaging/messageNotificationFanOut';
import { announceStartedGroup } from '../../../services/conversations/announceStartedGroup';
import { reconcileEditedMentions } from '../../../services/messaging/messageMentions';
import { PARTICIPATION_VIVANTE } from '../../../routes/conversations/utils/access-control';

const CONV = '507f1f77bcf86cd799439222';
const MSG = '507f1f77bcf86cd799439251';
const SENDER_PART = '507f1f77bcf86cd799439231';
const SENDER = '507f1f77bcf86cd799439241';
const BANNI = '507f1f77bcf86cd799439242';
const MEMBRE = '507f1f77bcf86cd799439243';

describe("l'éventail de notifications demande la participation VIVANTE", () => {
  it('pose la loi dans le `where` de son audience, et non `isActive` nu', async () => {
    const findUnique = jest.fn<any>().mockResolvedValue({
      title: null,
      type: 'group',
      encryptionMode: null,
      participants: [{ userId: SENDER, messageRequestAt: null, user: { isActive: true, deletedAt: null } }],
    });
    await notifyMessageRecipients({
      prisma: {
        participant: { findUnique: jest.fn<any>().mockResolvedValue({ userId: SENDER, displayName: 'Alice', avatar: null }) },
        user: { findUnique: jest.fn<any>().mockResolvedValue({ username: 'alice', displayName: 'Alice', avatar: null }) },
        conversation: { findUnique },
        message: { findUnique: jest.fn<any>().mockResolvedValue({ deletedAt: null }) },
        notification: { findMany: jest.fn<any>().mockResolvedValue([]), deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
        messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([]) },
        userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
      } as never,
      notificationService: {
        createReplyNotification: jest.fn<any>().mockResolvedValue(null),
        createMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
        createMessageNotification: jest.fn<any>().mockResolvedValue(null),
      } as never,
      message: {
        id: MSG,
        messageType: 'text',
        replyToId: null,
        isEncrypted: false,
        encryptionMode: null,
        isViewOnce: false,
        isBlurred: false,
        effectFlags: 0,
        expiresAt: null,
        createdAt: new Date('2026-11-20T10:00:00Z'),
        encryptedContent: null,
      } as never,
      senderParticipantId: SENDER_PART,
      conversationId: CONV,
      processedContent: 'salut',
    });

    const audience = (findUnique.mock.calls[0][0] as any).select.participants.where;

    expect(audience).toEqual({ ...PARTICIPATION_VIVANTE, type: 'user' });
  });
});

describe("l'annonce d'un groupe démarré n'invite pas un membre banni", () => {
  const member = (userId: string, over: Record<string, unknown> = {}) => ({
    userId,
    role: 'member',
    isActive: true,
    bannedAt: null,
    messageRequestAt: null,
    user: { id: userId, displayName: userId, username: userId, avatar: null, firstName: null, lastName: null },
    ...over,
  });

  const annoncer = async (participants: readonly unknown[]) => {
    const emitted: string[] = [];
    const notificationService = { createConversationInviteNotification: jest.fn<any>().mockResolvedValue(null) };
    await announceStartedGroup(
      {
        prisma: {
          conversation: {
            findUnique: jest.fn<any>().mockResolvedValue({
              id: CONV,
              type: 'group',
              title: 'Équipe',
              createdAt: new Date('2026-11-20T09:00:00.000Z'),
              participants,
            }),
          },
        } as never,
        io: { to: (room: string) => ({ emit: () => emitted.push(room) }) },
        notificationService: notificationService as never,
      },
      CONV
    );
    return { emitted, notificationService };
  };

  it("ni `conversation:new` ni l'invitation ne partent vers un actif-et-banni", async () => {
    const { emitted, notificationService } = await annoncer([
      member(SENDER, { role: 'creator' }),
      member(MEMBRE),
      member(BANNI, { bannedAt: new Date('2026-11-19T00:00:00Z') }),
    ]);

    expect(emitted).toEqual([`user:${MEMBRE}`]);
    expect(notificationService.createConversationInviteNotification.mock.calls.map((call: any) => call[0].invitedUserId)).toEqual([MEMBRE]);
  });

  /**
   * Le pendant de la DÉCISION écrite sur le site : le créateur se cherche sur le
   * SUR-ENSEMBLE, parce que `Conversation` n'a aucune colonne d'auteur et que
   * son rang ne vit que sur sa ligne de participation. Resserrer le `where`
   * ferait disparaître un créateur banni du relevé, et PLUS AUCUN invité
   * légitime ne serait annoncé — la garde retournée contre qui elle protège.
   */
  it('un créateur banni annonce quand même ses invités légitimes', async () => {
    const { emitted } = await annoncer([
      member(SENDER, { role: 'creator', bannedAt: new Date('2026-11-19T00:00:00Z') }),
      member(MEMBRE),
    ]);

    expect(emitted).toEqual([`user:${MEMBRE}`]);
  });
});

describe("une édition qui ajoute une mention n'admet pas un membre banni", () => {
  /**
   * Le double HONORE le `where` — sans quoi ce témoin serait vert avant comme
   * après, et c'est exactement ce que mon premier jet était : il laissait une
   * porte de sortie (`if (calls.length === 0) return`) et restait VERT sous la
   * mutation inverse. **Un témoin qui ne peut pas tomber n'est pas un témoin** ;
   * le harnais ci-dessous vient de l'audit adversarial, qui l'a livré ROUGE.
   *
   * La portée de mention est `directory` ici (`validateMentionPermissions` y
   * valide « tout compte existant ») : c'est le seul cas où un banni-mais-actif
   * atteint `newlyMentionedUserIds`, donc le seul où la clause de cette lecture
   * décide quelque chose.
   */
  const harness = async () => {
    const batch = jest.fn<any>().mockResolvedValue(1);
    // MEMBRE est nommé lui aussi, et il est VIVANT : sans lui le lot serait
    // vide, l'unité rendrait avant d'appeler, et le témoin n'observerait plus
    // rien — vert par absence. C'est la même erreur que la porte de sortie du
    // premier jet, déplacée dans la fixture.
    const rows = [
      { userId: SENDER, messageRequestAt: null, bannedAt: null, isActive: true, user: { isActive: true, deletedAt: null } },
      { userId: MEMBRE, messageRequestAt: null, bannedAt: null, isActive: true, user: { isActive: true, deletedAt: null } },
      { userId: BANNI, messageRequestAt: null, bannedAt: new Date('2026-11-01T00:00:00Z'), isActive: true, user: { isActive: true, deletedAt: null } },
    ];
    const honour = (where: any) =>
      rows.filter((row) => (where?.isActive === undefined || row.isActive === where.isActive)
        && (where?.OR === undefined || row.bannedAt === null));

    const prisma = {
      mention: { findMany: jest.fn<any>().mockResolvedValue([]), deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
      message: {
        update: jest.fn<any>().mockResolvedValue({}),
        findUnique: jest.fn<any>().mockResolvedValue({
          createdAt: new Date('2026-11-20T10:00:00Z'), messageType: 'text', isEncrypted: false,
          isViewOnce: false, isBlurred: false, effectFlags: 0, expiresAt: null, ephemeralDuration: null,
        }),
      },
      user: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        findUnique: jest.fn<any>().mockResolvedValue({ username: 'ed', displayName: 'Ed', avatar: null }),
      },
      participant: {
        findMany: jest.fn<any>(async (args: any) => honour(args?.where).map((row) => ({ id: row.userId, userId: row.userId, historyFloorAt: null }))),
        findUnique: jest.fn<any>().mockResolvedValue({ userId: SENDER, isActive: true, bannedAt: null, conversationId: CONV }),
        findFirst: jest.fn<any>().mockResolvedValue({ id: SENDER_PART, userId: SENDER }),
      },
      conversation: {
        findUnique: jest.fn<any>(async (args: any) => ({
          participants: honour(args?.select?.participants?.where ?? args?.include?.participants?.where),
        })),
      },
      conversationShareLink: { findMany: jest.fn<any>().mockResolvedValue([]) },
      userBlock: { findMany: jest.fn<any>().mockResolvedValue([]) },
    };

    await reconcileEditedMentions({
      prisma: prisma as never,
      mentionService: {
        extractMentions: () => [BANNI, MEMBRE],
        extractMentionsWithParticipants: () => ['banni', 'membre'],
        resolveUsernames: async () => new Map([['banni', { id: BANNI, username: 'banni' }], ['membre', { id: MEMBRE, username: 'membre' }]]),
        validateMentionPermissions: async () => ({ validUserIds: [BANNI, MEMBRE] }),
        createMentions: jest.fn<any>().mockResolvedValue(undefined),
      } as never,
      notificationService: { createMentionNotificationsBatch: batch } as never,
      message: { id: MSG, conversationId: CONV, senderId: SENDER_PART, expiresAt: null } as never,
      content: 'coucou @banni @membre',
      editorUserId: SENDER,
      onError: () => undefined,
    } as never);

    return batch;
  };

  it("ne met pas le banni dans le `memberIds` qui AUTORISE le lot de mentions", async () => {
    const batch = await harness();

    expect(batch).toHaveBeenCalled();
    expect(batch.mock.calls[0][2] as string[]).toContain(MEMBRE);
    expect(batch.mock.calls[0][2] as string[]).not.toContain(BANNI);
  });

  it("ne l'admet pas parmi les mentionnés notifiés", async () => {
    const batch = await harness();

    expect(batch.mock.calls[0][0] as string[]).toContain(MEMBRE);
    expect(batch.mock.calls[0][0] as string[]).not.toContain(BANNI);
  });
});

/**
 * LA PROJECTION, et c'est le constat que l'audit a mesuré le plus coûteux pour
 * `announceStartedGroup` : sa loi est jugée APRÈS lecture, et
 * `participationEstVivante` vaut `row.isActive === true && row.bannedAt == null`.
 *
 * `undefined == null` est **vrai**. Une lecture qui oublie `bannedAt` dans son
 * `select` rend donc une garde qui LAISSE PASSER TOUT LE MONDE — un no-op
 * silencieux, l'inverse exact de l'omission d'`isActive`, qui ferme tout et se
 * voit immédiatement. Mesuré par l'audit : en retirant `bannedAt: true` du
 * `select`, la suite gateway ENTIÈRE reste verte, les trente-cinq témoins de la
 * famille du lot compris.
 *
 * > **Les deux moitiés d'une loi jugée après lecture n'échouent pas du même
 * > côté.** Celle qui ferme se voit ; celle qui ouvre ne se voit pas. Un témoin
 * > de comportement ne peut attraper que la première — d'où un témoin sur la
 * > REQUÊTE, la règle que le dépôt écrit déjà pour le Prisme
 * > (« un témoin de projection assert sur la REQUÊTE, pas sur le rendu »).
 */
describe("l'annonce d'un groupe PROJETTE les deux colonnes de sa loi", () => {
  it('demande `isActive` ET `bannedAt`, sans quoi la garde est un no-op muet', async () => {
    const findUnique = jest.fn<any>().mockResolvedValue(null);
    await announceStartedGroup(
      { prisma: { conversation: { findUnique } } as never, io: undefined, notificationService: undefined },
      CONV
    );

    const projection = (findUnique.mock.calls[0][0] as any).select.participants.select;

    expect(projection.isActive).toBe(true);
    expect(projection.bannedAt).toBe(true);
  });
});
