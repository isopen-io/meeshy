/**
 * « No one can write » — appliqué à TOUS les verbes d'écriture, pas au seul envoi.
 *
 * `packages/shared/prisma/schema.prisma` documente `Conversation.closedAt` par
 * « Conversation closed for all — **no one can write**, messages stay
 * readable ». Le cycle 31 a fait respecter cette phrase sur UN verbe : *envoyer*.
 * Trois autres verbes écrivent dans le même conteneur terminal, et aucun ne
 * posait la question :
 *
 * | verbe                      | unité de convergence                            | transports couverts |
 * |----------------------------|--------------------------------------------------|---------------------|
 * | envoyer                    | `admitConversationWrite`                        | 3 (déjà gardé)      |
 * | **réagir**                 | `ReactionService.addReaction`                   | 3                   |
 * | **réagir (pièce jointe)**  | `AttachmentReactionService.addAttachmentReaction`| 1 — ne converge PAS |
 * | **éditer**                 | `admitMessageEdit`                              | 4                   |
 * | retirer / effacer          | — *délibérément NON gardé, § 3*                 | —                   |
 *
 * La ligne « pièce jointe » a été ajoutée après coup (#9240), et c'est la leçon
 * de ce fichier : le périmètre d'un témoin est l'ensemble des portes dont
 * quelqu'un s'est souvenu. La réaction par pièce jointe est le seul transport de
 * réaction qui ne converge pas vers `ReactionService.addReaction` ; elle avait
 * donc son propre point d'écriture, non gardé, et ce témoin ne pouvait pas le
 * dire puisqu'il ne la connaissait pas.
 *
 * Ce fichier énonce l'invariant UNE fois pour la famille entière : un conteneur
 * mort n'accepte aucun CONTENU NEUF, et continue d'accepter le RETRAIT de ce
 * qu'il porte déjà.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import { admitMessageEdit, MESSAGE_EDIT_WINDOW_MS } from '../../../../services/messaging/messageEditAdmission';
import { ReactionService } from '../../../../services/ReactionService';
import { AttachmentReactionService } from '../../../../services/AttachmentReactionService';

const AUTHOR = 'user-author';
const MODERATOR = 'user-moderator';
const CONV = 'conv-1';
const NOW = 1_700_000_000_000;
const MESSAGE_ID = '507f1f77bcf86cd799439022';
const PARTICIPANT_ID = '507f1f77bcf86cd799439011';

/**
 * Les DEUX formes que prend un fil terminé en base, et pourquoi les deux
 * comptent : `leave.ts` a posé pendant trente-sept cycles `isActive: false`
 * SEUL, sans `closedAt`. Ces lignes existent, rien ne les rétro-remplit, et un
 * prédicat qui ne lirait qu'une colonne les laisserait accepter du contenu.
 */
const CLOSED_SHAPES = [
  { label: 'closedAt posé', row: { isActive: true, closedAt: new Date(NOW - 1000) } },
  { label: 'isActive: false seul (ancien leave.ts)', row: { isActive: false, closedAt: null } },
] as const;

const ALIVE = { isActive: true, closedAt: null };

// ───────────────────────────── ÉDITER ──────────────────────────────

function buildEditPrisma(role = 'USER') {
  return {
    user: { findUnique: jest.fn<any>(async () => ({ role })) },
    participant: { findFirst: jest.fn<any>(async () => ({ id: 'part-1', user: { role } })) },
  };
}

const admitEdit = (params: {
  prisma: ReturnType<typeof buildEditPrisma>;
  editorUserId: string;
  conversation: { isActive?: boolean; closedAt?: Date | null } | null;
  createdAt?: Date;
}) =>
  admitMessageEdit({
    prisma: params.prisma as never,
    editorUserId: params.editorUserId,
    message: {
      authorUserId: AUTHOR,
      conversationId: CONV,
      conversation: params.conversation,
      createdAt: params.createdAt ?? new Date(NOW - 60_000),
    },
    now: NOW,
  });

describe('éditer — un fil terminé gèle son contenu', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(CLOSED_SHAPES)('refuse l\'auteur dans sa fenêtre quand le fil est clos ($label)', async ({ row }) => {
    const decision = await admitEdit({ prisma: buildEditPrisma(), editorUserId: AUTHOR, conversation: row });

    expect(decision).toEqual({ admitted: false, reason: 'conversation-closed' });
  });

  it('refuse le modérateur GLOBAL — la clôture ne connaît pas de rang', async () => {
    const decision = await admitEdit({
      prisma: buildEditPrisma('BIGBOSS'),
      editorUserId: MODERATOR,
      conversation: CLOSED_SHAPES[0].row,
    });

    expect(decision).toEqual({ admitted: false, reason: 'conversation-closed' });
  });

  it('refuse l\'auteur privilégié qui contournait la fenêtre de 24h', async () => {
    const decision = await admitEdit({
      prisma: buildEditPrisma('ADMIN'),
      editorUserId: AUTHOR,
      conversation: CLOSED_SHAPES[0].row,
      createdAt: new Date(NOW - MESSAGE_EDIT_WINDOW_MS - 1),
    });

    expect(decision).toEqual({ admitted: false, reason: 'conversation-closed' });
  });

  /**
   * L'ordre compte, et c'est une propriété de SÉCURITÉ, pas un détail
   * d'implémentation. `PUT /messages/:messageId` rend 404 sur tout refus non
   * temporel EXPRÈS, pour ne pas devenir un oracle d'existence à qui sonde des
   * ObjectIds. Trancher la clôture AVANT l'autorisation lui rendrait cet oracle
   * — « ce message existe, et son fil est clos » — à un inconnu. La clôture ne
   * se révèle donc qu'à qui aurait été admis sans elle.
   */
  it('ne révèle PAS la clôture à qui n\'avait de toute façon pas le droit d\'éditer', async () => {
    const prisma = buildEditPrisma('USER');
    prisma.participant.findFirst = jest.fn<any>(async () => null);

    const decision = await admitMessageEdit({
      prisma: prisma as never,
      editorUserId: 'user-stranger',
      message: {
        authorUserId: AUTHOR,
        conversationId: CONV,
        conversation: CLOSED_SHAPES[0].row,
        createdAt: new Date(NOW - 60_000),
      },
      now: NOW,
    });

    expect(decision).toEqual({ admitted: false, reason: 'not-a-member' });
  });

  it('laisse passer un fil VIVANT — la garde borne, elle ne bloque pas', async () => {
    const decision = await admitEdit({ prisma: buildEditPrisma(), editorUserId: AUTHOR, conversation: ALIVE });

    expect(decision).toEqual({ admitted: true, asModerator: false, windowBypassed: false });
  });

  /**
   * Contre-épreuve du permissif : une conversation absente de la projection de
   * l'appelant ne doit pas fabriquer un refus. Même contrat qu'`isConversationClosed`,
   * dont la lecture d'un `null` vaut « rien ne s'y oppose ».
   */
  it('admet quand la conversation est absente — un null ne ferme rien', async () => {
    const decision = await admitEdit({ prisma: buildEditPrisma(), editorUserId: AUTHOR, conversation: null });

    expect(decision).toEqual({ admitted: true, asModerator: false, windowBypassed: false });
  });
});

// ───────────────────────────── RÉAGIR ──────────────────────────────

function buildReactionPrisma(conversationRow: Record<string, unknown>) {
  const prisma: Record<string, any> = {
    message: {
      findUnique: jest.fn<any>(async () => ({
        id: MESSAGE_ID,
        conversationId: CONV,
        deletedAt: null,
        messageType: 'text',
        conversation: {
          id: CONV,
          ...conversationRow,
          participants: [{ id: PARTICIPANT_ID, isActive: true }],
        },
      })),
      update: jest.fn<any>(async () => ({})),
    },
    reaction: {
      findFirst: jest.fn<any>(async () => null),
      upsert: jest.fn<any>(async () => ({
        id: 'reaction-1',
        messageId: MESSAGE_ID,
        participantId: PARTICIPANT_ID,
        emoji: '👍',
        createdAt: new Date(NOW),
        updatedAt: new Date(NOW),
      })),
      deleteMany: jest.fn<any>(async () => ({ count: 1 })),
      count: jest.fn<any>(async () => 1),
      groupBy: jest.fn<any>(async () => [{ emoji: '👍', _count: { emoji: 1 } }]),
    },
    participant: { findMany: jest.fn<any>(async () => []) },
  };

  // `updateMessageReactionSummary` recalcule la ventilation DANS une
  // transaction ; le double la joue avec le même client.
  prisma.$transaction = jest.fn<any>(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

  return prisma;
}

describe('réagir — un fil terminé n\'accepte plus de contenu neuf', () => {
  it.each(CLOSED_SHAPES)('refuse la pose d\'une réaction ($label)', async ({ row }) => {
    const prisma = buildReactionPrisma(row);
    const service = new ReactionService(prisma as never);

    await expect(
      service.addReaction({ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '👍' })
    ).rejects.toThrow(/closed conversation/i);

    expect(prisma.reaction.upsert).not.toHaveBeenCalled();
  });

  it('laisse passer un fil VIVANT', async () => {
    const prisma = buildReactionPrisma(ALIVE);
    const service = new ReactionService(prisma as never);

    const result = await service.addReaction({
      messageId: MESSAGE_ID,
      participantId: PARTICIPANT_ID,
      emoji: '👍',
    });

    expect(result?.unchanged).toBe(false);
    expect(prisma.reaction.upsert).toHaveBeenCalled();
  });

  /**
   * La garde ne coûte AUCUNE lecture : `addReaction` chargeait déjà
   * `message.conversation` par son `include`. C'est ce qui rend le défaut
   * frappant — l'état du conteneur était en main, et personne ne le regardait.
   */
  it('ne déclenche aucune lecture supplémentaire pour trancher', async () => {
    const prisma = buildReactionPrisma(CLOSED_SHAPES[0].row);
    const service = new ReactionService(prisma as never);

    await expect(
      service.addReaction({ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '👍' })
    ).rejects.toThrow();

    expect(prisma.message.findUnique).toHaveBeenCalledTimes(1);
  });
});

// ───────────── RÉAGIR SUR UNE PIÈCE JOINTE (la cinquième porte) ─────────────

const ATTACHMENT_ID = '507f1f77bcf86cd799439033';

/**
 * Le double pour `AttachmentReactionService`. Il n'a PAS d'`include` qui
 * ramènerait la conversation : contrairement à la jumelle message-level, le
 * service devra lire l'état terminal lui-même — c'est le prix mesuré de cette
 * porte, et `coûte une lecture, et une seule` le gèle plus bas.
 */
function buildAttachmentReactionPrisma(conversationRow: {
  isActive?: boolean;
  closedAt?: Date | null;
}) {
  return {
    message: {
      findUnique: jest.fn<any>(async () => ({
        conversation: { ...conversationRow },
      })),
    },
    attachmentReaction: {
      findUnique: jest.fn<any>(async () => null),
      count: jest.fn<any>(async () => 0),
      upsert: jest.fn<any>(async () => ({})),
      deleteMany: jest.fn<any>(async () => ({ count: 1 })),
    },
  };
}

describe('réagir sur une pièce jointe — la cinquième porte, celle que le témoin ignorait', () => {
  it.each(CLOSED_SHAPES)('refuse la pose d\'une réaction ($label)', async ({ row }) => {
    const prisma = buildAttachmentReactionPrisma(row);
    const service = new AttachmentReactionService(prisma as never);

    await expect(
      service.addAttachmentReaction({
        attachmentId: ATTACHMENT_ID,
        messageId: MESSAGE_ID,
        participantId: PARTICIPANT_ID,
        emoji: '👍',
      })
    ).rejects.toThrow(/closed conversation/i);

    expect(prisma.attachmentReaction.upsert).not.toHaveBeenCalled();
  });

  /**
   * Le refus porte le MÊME message que la jumelle. Deux formulations pour une
   * seule règle donneraient deux cas à reconnaître aux clients, et la première
   * reformulation d'un littéral recopié ferait diverger la paire — c'est pour
   * cela que `CLOSED_CONVERSATION_REACTION_ERROR` est une constante partagée.
   */
  it('refuse avec le message de la jumelle, pas un littéral parallèle', async () => {
    const closedPrisma = buildAttachmentReactionPrisma(CLOSED_SHAPES[0].row);
    const twinPrisma = buildReactionPrisma(CLOSED_SHAPES[0].row);

    const attachmentError = await new AttachmentReactionService(closedPrisma as never)
      .addAttachmentReaction({
        attachmentId: ATTACHMENT_ID,
        messageId: MESSAGE_ID,
        participantId: PARTICIPANT_ID,
        emoji: '👍',
      })
      .catch((e: unknown) => (e as Error).message);

    const twinError = await new ReactionService(twinPrisma as never)
      .addReaction({ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '👍' })
      .catch((e: unknown) => (e as Error).message);

    expect(attachmentError).toBe(twinError);
  });

  it('laisse passer un fil VIVANT — la garde borne, elle ne bloque pas', async () => {
    const prisma = buildAttachmentReactionPrisma(ALIVE);
    const service = new AttachmentReactionService(prisma as never);

    await expect(
      service.addAttachmentReaction({
        attachmentId: ATTACHMENT_ID,
        messageId: MESSAGE_ID,
        participantId: PARTICIPANT_ID,
        emoji: '👍',
      })
    ).resolves.toEqual({ changed: true });

    expect(prisma.attachmentReaction.upsert).toHaveBeenCalled();
  });

  /**
   * Un message absent ne ferme rien — parité avec `isConversationClosed`, dont
   * le contrat est « `null` n'est pas clos », et avec la ligne « admet quand la
   * conversation est absente » du verbe ÉDITER plus haut.
   */
  it('admet quand le message (donc la conversation) est introuvable', async () => {
    const prisma = buildAttachmentReactionPrisma(ALIVE);
    prisma.message.findUnique = jest.fn<any>(async () => null);
    const service = new AttachmentReactionService(prisma as never);

    await expect(
      service.addAttachmentReaction({
        attachmentId: ATTACHMENT_ID,
        messageId: MESSAGE_ID,
        participantId: PARTICIPANT_ID,
        emoji: '👍',
      })
    ).resolves.toEqual({ changed: true });
  });

  /**
   * Coûte une lecture, et une seule. Le service n'avait aucun `include` à
   * recycler : la garde paie un `message.findUnique`. Ce témoin gèle ce prix —
   * s'il rougit, c'est qu'on relit la conversation plusieurs fois par pose.
   */
  it('coûte une lecture, et une seule', async () => {
    const prisma = buildAttachmentReactionPrisma(ALIVE);
    const service = new AttachmentReactionService(prisma as never);

    await service.addAttachmentReaction({
      attachmentId: ATTACHMENT_ID,
      messageId: MESSAGE_ID,
      participantId: PARTICIPANT_ID,
      emoji: '👍',
    });

    expect(prisma.message.findUnique).toHaveBeenCalledTimes(1);
  });

  /**
   * § 3 appliqué à cette porte : la rétraction survit à la clôture ICI AUSSI.
   * Si ce test rougit un jour, c'est qu'une garde a été étendue au retrait —
   * arbitrage produit, pas patch.
   */
  it.each(CLOSED_SHAPES)('laisse retirer une réaction de pièce jointe d\'un fil clos ($label)', async ({ row }) => {
    const prisma = buildAttachmentReactionPrisma(row);
    const service = new AttachmentReactionService(prisma as never);

    await expect(
      service.removeAttachmentReaction({
        attachmentId: ATTACHMENT_ID,
        participantId: PARTICIPANT_ID,
        emoji: '👍',
      })
    ).resolves.toBe(true);
  });
});

// ─────────────────────── RETIRER (non gardé, délibéré) ───────────────────────

/**
 * § 3 — L'asymétrie est une DÉCISION, pas un oubli.
 *
 * Un conteneur mort refuse le contenu NEUF ; il continue d'accepter qu'on
 * retire ce qu'il porte déjà. Retirer sa réaction ou effacer son message est
 * une RÉTRACTION : la refuser enfermerait un auteur dans un contenu qu'il ne
 * peut plus reprendre, pour toujours, puisque la clôture est IRRÉVERSIBLE
 * (aucun écrivain du dépôt ne rallume `Conversation.isActive`).
 *
 * Ce témoin GÈLE ce choix : s'il rougit un jour, c'est qu'une garde a été
 * étendue au retrait — ce qui demande un arbitrage produit, pas un patch.
 */
describe('retirer — la rétraction survit à la clôture, délibérément', () => {
  it.each(CLOSED_SHAPES)('laisse retirer une réaction d\'un fil clos ($label)', async ({ row }) => {
    const prisma = buildReactionPrisma(row);
    const service = new ReactionService(prisma as never);

    await expect(
      service.removeReaction({ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '👍' })
    ).resolves.toBe(true);
  });
});
