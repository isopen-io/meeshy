/**
 * `anonymizeMessagesOfDeletedAccount` (#5689, suite de #3632/#5688).
 *
 * `privacy.json` promet, à la fin de la période de grâce : « suppression
 * définitive de toutes vos données personnelles » SAUF « les messages dans
 * les conversations partagées sont anonymisés » (une exception nommée, pas
 * une omission). `MaintenanceService.processAccountDeletionRequests` purge
 * déjà sessions/profil vocal/liens (#5688) mais ne touchait aucun `Message` —
 * ceux d'un compte supprimé restaient servis en clair à tous les autres
 * participants, indéfiniment, via `GET /conversations/:id/messages`
 * (`messages-list-query.ts` sert `content: message.content` sans jamais
 * regarder `deletedAt`).
 *
 * C'est le CINQUIÈME écrivain de `deletedAt` sur `Message` — les quatre
 * premiers (le handler socket, `DELETE /messages/:id`,
 * `DELETE /conversations/:id/messages/:id`, le balayage des messages vides)
 * sont énumérés par le doc-comment de `messageRemovalEffects.ts`, qui les
 * relie tous par `applyMessageRemovalEffects` — décompte des compteurs,
 * rétraction des notifications déjà poussées, désactivation des liens de
 * partage orphelins, recalcul de `lastMessageAt`. Ne pas l'appeler ici
 * reproduirait exactement la divergence que ce fichier existe pour fermer.
 *
 * Destruction du CONTENU, pas simple masquage — même geste et même
 * justification qu'`ExpiredMessagesCleanupService` (`content`, `translations`
 * et `metadata` transportent le secret ; `deletedAt` seul ne fait que le
 * cacher à l'écran, jamais au repos) : une purge de fin de grâce est
 * irréversible, comme une échéance d'éphémère, contrairement à un
 * « supprimer pour tout le monde » que l'app ne rend jamais vraiment
 * réversible non plus mais dont la sémantique produit reste « retire de la
 * vue ». `reactionSummary`/`reactionCount` sont VOLONTAIREMENT préservés :
 * ce sont des réactions d'AUTRES utilisateurs, pas le contenu du compte
 * purgé.
 *
 * `Participant.displayName` — décision produit ouverte de l'issue, tranchée
 * ICI : `privacy.json` promet la suppression de « toutes vos données
 * personnelles » sans qu'aucune des trois exceptions nommées (messages
 * anonymisés, journaux de sécurité 90 j, facturation légale) ne couvre le
 * nom affiché. `Participant.displayName` est une COPIE dénormalisée d'un nom
 * — une donnée personnelle comme une autre — donc réécrite pour CHAQUE ligne
 * du compte, dans toutes ses conversations passées.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => {
  const actual = jest.requireActual('../../../../utils/logger-enhanced') as {
    enhancedLogger: Record<string, unknown>;
  };
  const child: Record<string, unknown> = {};
  Object.assign(child, {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    child: () => child,
  });
  return {
    ...actual,
    enhancedLogger: { ...actual.enhancedLogger, child: () => child },
  };
});

import {
  anonymizeMessagesOfDeletedAccount,
  DELETED_ACCOUNT_DISPLAY_NAME,
} from '../../../../services/messaging/anonymizeDeletedAccountMessages';

const USER_ID = 'user-deleted-1';

interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  metadata: unknown;
  messageType: string;
  attachments: Array<{ id: string; mimeType: string | null }>;
}

function messageRow(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    senderId: 'participant-1',
    content: 'le secret de ce compte',
    metadata: null,
    messageType: 'text',
    attachments: [],
    ...overrides,
  };
}

function buildPrisma(params: {
  participants?: Array<{ id: string }>;
  messagePages?: MessageRow[][];
}) {
  const { participants = [{ id: 'participant-1' }], messagePages = [[messageRow()], []] } = params;
  let pageIndex = 0;

  const message = {
    findMany: jest.fn<(args: unknown) => Promise<MessageRow[]>>().mockImplementation(async () => {
      const page = messagePages[pageIndex] ?? [];
      pageIndex += 1;
      return page;
    }),
    findFirst: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(null),
    update: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
  };

  return {
    participant: {
      findMany: jest.fn<(args: unknown) => Promise<Array<{ id: string }>>>().mockResolvedValue(participants),
      updateMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: participants.length }),
    },
    message,
    conversation: {
      findUnique: jest.fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue({ lastMessageAt: new Date(), createdAt: new Date() }),
      updateMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 1 }),
    },
    notification: {
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]),
      deleteMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    },
    trackingLink: {
      updateMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]),
    },
    conversationMessageStats: {
      findUnique: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(null),
      update: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
    },
    $runCommandRaw: jest.fn<(command: unknown) => Promise<unknown>>()
      .mockResolvedValue({ cursor: { firstBatch: [] } }),
  } as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
}

function buildAttachments() {
  return {
    deleteAttachment: jest.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
  };
}

const messageFindManyArgs = (prisma: unknown, callIndex = 0) =>
  ((prisma as { message: { findMany: jest.Mock } }).message.findMany.mock.calls[callIndex]?.[0]) as
    | { where: Record<string, unknown>; take?: number }
    | undefined;

const messageUpdateCalls = (prisma: unknown) =>
  (prisma as { message: { update: jest.Mock } }).message.update.mock.calls as Array<[
    { where: { id: string }; data: Record<string, unknown> },
  ]>;

describe('anonymizeMessagesOfDeletedAccount', () => {
  it("résout D'ABORD tous les `Participant` du compte, jamais un `senderId` en clair", async () => {
    const prisma = buildPrisma({ participants: [{ id: 'participant-1' }, { id: 'participant-2' }] });

    await anonymizeMessagesOfDeletedAccount(prisma, USER_ID, { attachmentRemover: buildAttachments() });

    expect((prisma as any).participant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } }),
    );
    expect(messageFindManyArgs(prisma)?.where).toMatchObject({
      senderId: { in: ['participant-1', 'participant-2'] },
    });
  });

  it("ne touche que les messages encore VIVANTS (`deletedAt: null`)", async () => {
    const prisma = buildPrisma({});

    await anonymizeMessagesOfDeletedAccount(prisma, USER_ID, { attachmentRemover: buildAttachments() });

    expect(messageFindManyArgs(prisma)?.where).toMatchObject({ deletedAt: null });
  });

  it('efface le clair, le chiffré, les traductions et le payload structuré — et pose `deletedAt`', async () => {
    const prisma = buildPrisma({ messagePages: [[messageRow({ content: 'bonjour tout le monde' })], []] });

    await anonymizeMessagesOfDeletedAccount(prisma, USER_ID, { attachmentRemover: buildAttachments() });

    const [call] = messageUpdateCalls(prisma);
    expect(call[0].where).toEqual({ id: 'msg-1' });
    expect(call[0].data).toMatchObject({
      content: '',
      encryptedContent: null,
      translations: null,
      metadata: null,
    });
    expect(call[0].data.deletedAt).toBeInstanceOf(Date);
  });

  it('supprime physiquement les pièces jointes de chaque message purgé', async () => {
    const attachments = buildAttachments();
    const prisma = buildPrisma({
      messagePages: [
        [messageRow({ attachments: [{ id: 'att-1', mimeType: 'image/png' }, { id: 'att-2', mimeType: 'audio/mp3' }] })],
        [],
      ],
    });

    await anonymizeMessagesOfDeletedAccount(prisma, USER_ID, { attachmentRemover: attachments });

    expect(attachments.deleteAttachment).toHaveBeenCalledWith('att-1');
    expect(attachments.deleteAttachment).toHaveBeenCalledWith('att-2');
  });

  it("applique `applyMessageRemovalEffects` — décompte, rétraction, liens orphelins, `lastMessageAt` — pas seulement `deletedAt`", async () => {
    // Le doc-comment de messageRemovalEffects.ts énumère les quatre écrivains
    // existants et prévient : « aucune unité ne les reliait ». Un cinquième
    // écrivain qui pose `deletedAt` à la main sans passer par cette unité
    // reproduit exactement la divergence qu'elle a été créée pour fermer —
    // ce test le garde en observant un effet qu'AUCUN update de Message ne
    // peut produire lui-même : le recalcul de `lastMessageAt`.
    const prisma = buildPrisma({});

    await anonymizeMessagesOfDeletedAccount(prisma, USER_ID, { attachmentRemover: buildAttachments() });

    expect((prisma as any).conversation.updateMany).toHaveBeenCalled();
  });

  it("réécrit `Participant.displayName` sur TOUTES les lignes du compte, dans toutes les conversations", async () => {
    const prisma = buildPrisma({ participants: [{ id: 'participant-1' }] });

    await anonymizeMessagesOfDeletedAccount(prisma, USER_ID, { attachmentRemover: buildAttachments() });

    expect((prisma as any).participant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER_ID }),
        data: { displayName: DELETED_ACCOUNT_DISPLAY_NAME },
      }),
    );
  });

  it('un compte sans aucun `Participant` ne fait aucune requête `Message`', async () => {
    const prisma = buildPrisma({ participants: [] });

    const result = await anonymizeMessagesOfDeletedAccount(prisma, USER_ID, { attachmentRemover: buildAttachments() });

    expect((prisma as any).message.findMany).not.toHaveBeenCalled();
    expect(result.anonymized).toBe(0);
  });

  it('draine PLUSIEURS fournées tant que la précédente est pleine', async () => {
    const prisma = buildPrisma({
      messagePages: [
        [messageRow({ id: 'msg-a' })],
        [messageRow({ id: 'msg-b' })],
        [],
      ],
    });

    const result = await anonymizeMessagesOfDeletedAccount(prisma, USER_ID, {
      attachmentRemover: buildAttachments(),
      batchSize: 1,
    });

    expect((prisma as any).message.findMany).toHaveBeenCalledTimes(3);
    expect(result.anonymized).toBe(2);
  });

  it("une ligne qui refuse l'écriture est REPRISE à la fournée suivante, jamais rejouée en boucle", async () => {
    // Le prédicat de base (`deletedAt: null`) n'exclut pas une ligne dont
    // l'écriture a échoué — elle resterait donc éligible pour toujours si
    // rien ne l'exclut explicitement le temps de CET appel. `batchSize: 1`
    // force une deuxième fournée (une fournée PLEINE ne prouve rien sur la
    // fin du flot) : c'est là que l'exclusion doit apparaître.
    const prisma = buildPrisma({ messagePages: [[messageRow({ id: 'msg-fail' })], []] });
    (prisma as any).message.update.mockRejectedValueOnce(new Error('Mongo indisponible'));

    const result = await anonymizeMessagesOfDeletedAccount(prisma, USER_ID, {
      attachmentRemover: buildAttachments(),
      batchSize: 1,
    });

    expect(result.anonymized).toBe(0);
    // Deuxième appel (findMany) exclut explicitement la ligne déjà tentée —
    // sans quoi le balayage rejouerait `msg-fail` indéfiniment.
    expect((prisma as any).message.findMany).toHaveBeenCalledTimes(2);
    expect(messageFindManyArgs(prisma, 1)?.where).toMatchObject({ id: { notIn: ['msg-fail'] } });
  });

  it("une pièce jointe qui résiste n'empêche pas l'anonymisation du message", async () => {
    const attachments = buildAttachments();
    attachments.deleteAttachment.mockRejectedValueOnce(new Error('fichier verrouillé'));
    const prisma = buildPrisma({
      messagePages: [[messageRow({ attachments: [{ id: 'att-1', mimeType: 'image/png' }] })], []],
    });

    const result = await anonymizeMessagesOfDeletedAccount(prisma, USER_ID, { attachmentRemover: attachments });

    expect(result.anonymized).toBe(1);
    expect((prisma as any).message.update).toHaveBeenCalled();
  });
});
