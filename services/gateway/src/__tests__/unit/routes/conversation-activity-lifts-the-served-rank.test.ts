/**
 * **L'EFFET de bout en bout : une activité fait remonter la conversation dans
 * le rang SERVI** (#19800, critère de fin).
 *
 * Les deux moitiés de la règle #9026 sont justes séparément et ne se touchaient
 * jamais : `recordConversationActivity` écrit `Conversation.lastActivityAt`,
 * `loadRankedConversationPage` trie sur max(`lastMessageAt`, `lastActivityAt`).
 * Entre les deux, l'écriture n'appariait AUCUNE conversation — son `OR` ne
 * portait que `{ lastActivityAt: null }` (une ÉGALITÉ, qui exige la clé
 * présente) et `{ lt: at }`, quand aucun chemin de création n'écrit la colonne.
 * L'axe « activité » du classement n'existait donc pas, et aucun témoin ne le
 * disait : les deux unités étaient gardées CHEZ ELLES.
 *
 * Ce témoin les compose sur les MÊMES documents, dans la forme que la base
 * porte — `lastActivityAt` absent de la conversation nominale. Les deux unités
 * sont les vraies ; seul le moteur est un double, et il évalue le `where` avec
 * les sémantiques MESURÉES (`helpers/mongo-where.ts`).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { AttachmentReactionService } from '../../../services/AttachmentReactionService';
import { loadRankedConversationPage, type RowsQuery } from '../../../routes/conversations/utils/list-rank';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';
import { moteurDeRang } from '../../helpers/list-rank-engine';

const BAVARDE = '507f1f77bcf86cd799450011';
const TRANQUILLE = '507f1f77bcf86cd799450012';
const MESSAGE = '507f1f77bcf86cd799450021';
const ATTACHMENT = '507f1f77bcf86cd799450031';
const PARTICIPANT = '507f1f77bcf86cd799450041';

const at = (iso: string) => new Date(iso);
/** La réaction est postérieure aux DEUX derniers messages : elle doit remonter la ligne. */
const REACTION_AT = at('2026-11-08T12:00:00.000Z');

/**
 * `tranquille` a le dernier message le plus ANCIEN et **aucune clé
 * `lastActivityAt`** — la forme nominale. C'est elle qui reçoit la réaction.
 */
const monde = () => {
  const rows: MongoDocument[] = [
    { id: BAVARDE, lastMessageAt: at('2026-11-08T11:00:00.000Z') },
    { id: TRANQUILLE, lastMessageAt: at('2026-11-08T09:00:00.000Z') },
  ];

  const base = moteurDeRang(rows);

  const moteur = {
    conversation: {
      findMany: base.prisma.conversation.findMany,
      updateMany: async (args: { where: MongoDocument; data: MongoDocument }) => {
        const touchees = rows.filter((row) => matchesMongoWhere(row, args.where));
        touchees.forEach((row) => Object.assign(row, args.data));
        return { count: touchees.length };
      },
    },
  };

  const page = () =>
    loadRankedConversationPage({
      prisma: moteur as never,
      readRows: base.readRows as never,
      where: {},
      curseur: { genre: 'absent' },
      deltaOrder: false,
      limit: 10,
      offset: 0,
    }).then((servies) => servies.map((row) => row.id));

  return { rows, moteur, page };
};

/** Le service de réaction, branché sur le MÊME moteur que la page. */
const serviceSur = (moteur: unknown) =>
  new AttachmentReactionService({
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        conversationId: TRANQUILLE,
        conversation: { isActive: true, closedAt: null, encryptionMode: null },
      }),
    },
    attachmentReaction: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      count: jest.fn<any>().mockResolvedValue(0),
      upsert: jest.fn<any>().mockResolvedValue({ id: 'ar-1', createdAt: REACTION_AT }),
    },
    ...(moteur as object),
  } as never);

describe('réagir à une pièce jointe remonte la conversation dans le rang SERVI (#19800)', () => {
  it('la conversation tranquille passe DEVANT la bavarde après la réaction', async () => {
    const { moteur, page } = monde();

    expect(await page()).toEqual([BAVARDE, TRANQUILLE]);

    await serviceSur(moteur).addAttachmentReaction({
      attachmentId: ATTACHMENT,
      messageId: MESSAGE,
      participantId: PARTICIPANT,
      emoji: '❤️',
    });

    expect(await page()).toEqual([TRANQUILLE, BAVARDE]);
  });

  it('et elle le reste à la RELECTURE : le rang est écrit, pas seulement servi', async () => {
    const { rows, moteur, page } = monde();

    await serviceSur(moteur).addAttachmentReaction({
      attachmentId: ATTACHMENT,
      messageId: MESSAGE,
      participantId: PARTICIPANT,
      emoji: '❤️',
    });

    expect(rows.find((row) => row.id === TRANQUILLE)?.lastActivityAt).toEqual(REACTION_AT);
    expect(await page()).toEqual([TRANQUILLE, BAVARDE]);
  });

  /**
   * La contre-épreuve : l'écriture est BORNÉE à la conversation hôte. Un
   * `updateMany` dont le `where` perdrait son `id` remonterait toute la liste.
   */
  it('ne remonte QUE la conversation hôte', async () => {
    const { rows, moteur } = monde();

    await serviceSur(moteur).addAttachmentReaction({
      attachmentId: ATTACHMENT,
      messageId: MESSAGE,
      participantId: PARTICIPANT,
      emoji: '❤️',
    });

    expect(rows.find((row) => row.id === BAVARDE)?.lastActivityAt).toBeUndefined();
  });
});
