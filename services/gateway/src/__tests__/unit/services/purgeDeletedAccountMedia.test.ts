/**
 * `purgeMediaOfDeletedAccount` (#5690, suite de #3632/#5688/#5689).
 *
 * `privacy.json` promet « suppression définitive de toutes vos données
 * personnelles » à la fin de la grâce. #5688 a purgé les trois tables
 * ISOLÉES (sessions, profil vocal, liens) ; #5689 a anonymisé les messages
 * visibles par des tiers. Aucun des deux ne touchait aux MÉDIAS —
 * `MessageAttachment` (`uploadedBy`) et `PostMedia` (`uploaderId`), les deux
 * catégories que `me/export-sections.ts` (#3633) définit déjà comme
 * « médias » pour l'export RGPD.
 *
 * Ce module RÉUTILISE les deux infrastructures de suppression PHYSIQUE
 * existantes plutôt que de dupliquer leurs règles :
 * - `AttachmentService.deleteAttachment` pour `MessageAttachment` (déjà
 *   utilisé par `messages-writes.ts`, `ExpiredMessagesCleanupService` et
 *   #5689) ;
 * - `reclaimMediaRowBytes` pour `PostMedia`, dont le garde-fou `Sound`
 *   (`coverUrl` dénormalisé) protège un fichier encore référencé par un son
 *   vivant d'un AUTRE utilisateur — jamais un `deleteMany` brut.
 *
 * Ordre avec #5689 : `purgeMediaOfDeletedAccount` s'exécute APRÈS
 * `purgeMessagesOfDeletedAccount` dans `MaintenanceService` — les messages
 * du compte sont donc déjà anonymisés (et les pièces jointes qu'ils
 * portaient déjà supprimées par #5689) avant que ce balayage-ci ne
 * s'exécute. Ce qu'il reste à couvrir ici : les attachments PAS encore
 * rattachés à un message, ceux dont le message était déjà `deletedAt` avant
 * le passage de #5689 (donc jamais touchés par lui), et tout `PostMedia`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => {
  const actual = jest.requireActual('../../../utils/logger-enhanced') as {
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

import { purgeMediaOfDeletedAccount } from '../../../services/purgeDeletedAccountMedia';

const USER_ID = 'user-deleted-1';

interface AttachmentRow {
  id: string;
}

interface PostMediaRow {
  id: string;
  fileUrl: string | null;
  thumbnailUrl: string | null;
}

function buildPrisma(params: {
  attachmentPages?: AttachmentRow[][];
  postMediaPages?: PostMediaRow[][];
  sounds?: Array<{ fileUrl: string | null; coverUrl: string | null }>;
}) {
  const {
    attachmentPages = [[{ id: 'att-1' }], []],
    postMediaPages = [[{ id: 'pm-1', fileUrl: '/f/pm-1.jpg', thumbnailUrl: null }], []],
    sounds = [],
  } = params;

  let attachmentPageIndex = 0;
  let postMediaPageIndex = 0;

  return {
    messageAttachment: {
      findMany: jest.fn<(args: unknown) => Promise<AttachmentRow[]>>().mockImplementation(async () => {
        const page = attachmentPages[attachmentPageIndex] ?? [];
        attachmentPageIndex += 1;
        return page;
      }),
    },
    postMedia: {
      findMany: jest.fn<(args: unknown) => Promise<PostMediaRow[]>>().mockImplementation(async () => {
        const page = postMediaPages[postMediaPageIndex] ?? [];
        postMediaPageIndex += 1;
        return page;
      }),
      deleteMany: jest.fn<(args: unknown) => Promise<{ count: number }>>().mockImplementation(async (args) => {
        const where = args as { where: { id: { in: string[] } } };
        return { count: where.where.id.in.length };
      }),
    },
    sound: {
      findMany: jest.fn<(args: unknown) => Promise<Array<{ fileUrl: string | null; coverUrl: string | null }>>>()
        .mockResolvedValue(sounds),
    },
  } as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
}

function buildAttachmentRemover() {
  return {
    deleteAttachment: jest.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
  };
}

function buildMediaService() {
  return {
    delete: jest.fn<(fileUrl: string) => Promise<void>>().mockResolvedValue(undefined),
  };
}

const attachmentFindManyArgs = (prisma: unknown, callIndex = 0) =>
  ((prisma as { messageAttachment: { findMany: jest.Mock } }).messageAttachment.findMany.mock.calls[callIndex]?.[0]) as
    | { where: Record<string, unknown>; take?: number }
    | undefined;

const postMediaFindManyArgs = (prisma: unknown, callIndex = 0) =>
  ((prisma as { postMedia: { findMany: jest.Mock } }).postMedia.findMany.mock.calls[callIndex]?.[0]) as
    | { where: Record<string, unknown>; take?: number }
    | undefined;

describe('purgeMediaOfDeletedAccount', () => {
  describe('MessageAttachment', () => {
    it('cible `uploadedBy: userId, isAnonymous: false` — même filtre que export-sections.ts', async () => {
      const prisma = buildPrisma({});
      await purgeMediaOfDeletedAccount(prisma, buildAttachmentRemover(), buildMediaService(), USER_ID);

      expect(attachmentFindManyArgs(prisma)?.where).toMatchObject({ uploadedBy: USER_ID, isAnonymous: false });
    });

    it('appelle `AttachmentService.deleteAttachment` pour chaque attachment — jamais un `deleteMany` direct', async () => {
      const remover = buildAttachmentRemover();
      const prisma = buildPrisma({ attachmentPages: [[{ id: 'att-1' }, { id: 'att-2' }], []] });

      await purgeMediaOfDeletedAccount(prisma, remover, buildMediaService(), USER_ID);

      expect(remover.deleteAttachment).toHaveBeenCalledWith('att-1');
      expect(remover.deleteAttachment).toHaveBeenCalledWith('att-2');
    });

    it('drape PLUSIEURS fournées tant que la précédente est pleine', async () => {
      const prisma = buildPrisma({
        attachmentPages: [[{ id: 'att-a' }], [{ id: 'att-b' }], []],
      });

      const result = await purgeMediaOfDeletedAccount(prisma, buildAttachmentRemover(), buildMediaService(), USER_ID, {
        batchSize: 1,
      });

      expect((prisma as any).messageAttachment.findMany).toHaveBeenCalledTimes(3);
      expect(result.attachmentsDeleted).toBe(2);
    });

    it("un attachment dont la suppression échoue est EXCLU de la fournée suivante, jamais rejoué en boucle", async () => {
      const remover = buildAttachmentRemover();
      remover.deleteAttachment.mockRejectedValueOnce(new Error('fichier verrouillé'));
      const prisma = buildPrisma({ attachmentPages: [[{ id: 'att-fail' }], []] });

      const result = await purgeMediaOfDeletedAccount(prisma, remover, buildMediaService(), USER_ID, {
        batchSize: 1,
      });

      expect(result.attachmentsDeleted).toBe(0);
      expect((prisma as any).messageAttachment.findMany).toHaveBeenCalledTimes(2);
      expect(attachmentFindManyArgs(prisma, 1)?.where).toMatchObject({ id: { notIn: ['att-fail'] } });
    });
  });

  describe('PostMedia', () => {
    it('cible `uploaderId: userId` — même filtre que export-sections.ts', async () => {
      const prisma = buildPrisma({});
      await purgeMediaOfDeletedAccount(prisma, buildAttachmentRemover(), buildMediaService(), USER_ID);

      expect(postMediaFindManyArgs(prisma)?.where).toMatchObject({ uploaderId: USER_ID });
    });

    it('passe par `reclaimMediaRowBytes` (garde `Sound`) puis `deleteMany` — jamais un `deleteMany` sans lecture préalable', async () => {
      const mediaService = buildMediaService();
      const prisma = buildPrisma({
        postMediaPages: [[{ id: 'pm-1', fileUrl: '/f/pm-1.jpg', thumbnailUrl: null }], []],
      });

      await purgeMediaOfDeletedAccount(prisma, buildAttachmentRemover(), mediaService, USER_ID);

      expect((prisma as any).sound.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { OR: [{ fileUrl: { in: ['/f/pm-1.jpg'] } }, { coverUrl: { in: ['/f/pm-1.jpg'] } }] } }),
      );
      expect(mediaService.delete).toHaveBeenCalledWith('/f/pm-1.jpg');
      expect((prisma as any).postMedia.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['pm-1'] }, uploaderId: USER_ID } }),
      );
    });

    it("un fichier encore référencé par un `Sound` VIVANT d'un autre utilisateur SURVIT", async () => {
      const mediaService = buildMediaService();
      const prisma = buildPrisma({
        postMediaPages: [[{ id: 'pm-1', fileUrl: '/f/cover.jpg', thumbnailUrl: null }], []],
        sounds: [{ fileUrl: null, coverUrl: '/f/cover.jpg' }],
      });

      await purgeMediaOfDeletedAccount(prisma, buildAttachmentRemover(), mediaService, USER_ID);

      expect(mediaService.delete).not.toHaveBeenCalled();
      // La LIGNE PostMedia est retirée quand même — c'est le fichier, seul,
      // que le Sound protège (même comportement que sweepPendingPostMedia).
      expect((prisma as any).postMedia.deleteMany).toHaveBeenCalled();
    });

    it('drape PLUSIEURS fournées tant que la précédente est pleine', async () => {
      const prisma = buildPrisma({
        postMediaPages: [
          [{ id: 'pm-a', fileUrl: '/f/a.jpg', thumbnailUrl: null }],
          [{ id: 'pm-b', fileUrl: '/f/b.jpg', thumbnailUrl: null }],
          [],
        ],
      });

      const result = await purgeMediaOfDeletedAccount(prisma, buildAttachmentRemover(), buildMediaService(), USER_ID, {
        batchSize: 1,
      });

      expect((prisma as any).postMedia.findMany).toHaveBeenCalledTimes(3);
      expect(result.postMediaDeleted).toBe(2);
    });

    it("un échec du garde-fou `Sound` abandonne la fournée — jamais de `deleteMany` sans savoir ce qui est référencé", async () => {
      const prisma = buildPrisma({
        postMediaPages: [[{ id: 'pm-1', fileUrl: '/f/pm-1.jpg', thumbnailUrl: null }], []],
      });
      (prisma as any).sound.findMany.mockRejectedValueOnce(new Error('Mongo indisponible'));

      const result = await purgeMediaOfDeletedAccount(prisma, buildAttachmentRemover(), buildMediaService(), USER_ID);

      expect(result.postMediaDeleted).toBe(0);
      expect((prisma as any).postMedia.deleteMany).not.toHaveBeenCalled();
    });
  });

  it('un compte sans aucun média ne supprime rien et ne lève pas', async () => {
    const prisma = buildPrisma({ attachmentPages: [[]], postMediaPages: [[]] });

    const result = await purgeMediaOfDeletedAccount(prisma, buildAttachmentRemover(), buildMediaService(), USER_ID);

    expect(result).toEqual({ attachmentsDeleted: 0, postMediaDeleted: 0 });
  });
});
