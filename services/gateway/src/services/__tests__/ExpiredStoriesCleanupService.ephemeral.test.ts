import { describe, it, expect, jest } from '@jest/globals';
import { ExpiredStoriesCleanupService } from '../ExpiredStoriesCleanupService';
import {
  EPHEMERAL_AUTHOR_ARCHIVE_MS,
  EPHEMERAL_POST_TYPES,
  EPHEMERAL_POST_TTL_HOURS,
  ephemeralExpiresAt,
} from '../posts/ephemeralPosts';
import { NOT_DELETED } from '../posts/softDelete';
import { PostFeedService } from '../PostFeedService';

/**
 * Trois défauts d'une même famille, tous dans la passe de balayage : elle ne
 * balayait rien (D1), elle ne connaissait qu'un des deux types éphémères (D2),
 * et sa fournée n'était bornée par rien (D3 — ce qui n'était sans conséquence
 * que tant que D1 la rendait vide).
 */
/**
 * Le double HONORE le filtre de type, au lieu de rendre la même ligne quelle
 * que soit la question. Sans cela, le témoin de bout en bout reste vert sur un
 * balayage borné aux stories — il mesurerait la chaîne de destruction, jamais
 * ce qui y entre. (Sonde P3 : c'est exactement ce qu'il faisait en v1.)
 */
const EXPIRED_POSTS = [{ id: 'story-1', type: 'STORY' }, { id: 'status-1', type: 'STATUS' }];

function buildPrisma(overrides: Record<string, unknown> = {}) {
  return {
    post: {
      updateMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      findMany: jest.fn<(args: any) => Promise<unknown[]>>(async (args) => {
        // 2e appel : les reposts des posts détruits.
        if (args?.where?.repostOfId) return [];
        const asked: string[] = args?.where?.type?.in ?? [args?.where?.type];
        return EXPIRED_POSTS.filter((p) => asked.includes(p.type)).map((p) => ({ id: p.id }));
      }),
      deleteMany: jest.fn<(args: any) => Promise<unknown>>(
        async (args) => ({ count: args?.where?.id?.in?.length ?? 0 }),
      ),
    },
    postComment: {
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
      updateMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    },
    postMedia: { deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }) },
    // La désactivation des liens de partage gouverne désormais la passe, au
    // même titre que le retrait des notifications : sans ce double elle rejette
    // et RIEN n'est détruit (comportement voulu — un lien laissé actif sur un
    // post détruit n'est plus rattrapable par aucune passe).
    trackingLink: {
      updateMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    },
    soundUsage: {
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]),
      deleteMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    },
    sound: { update: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}) },
    $runCommandRaw: jest.fn<(command: unknown) => Promise<unknown>>()
      .mockResolvedValue({ cursor: { firstBatch: [] } }),
    notification: {
      deleteMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  } as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
}

const softDeleteWhere = (prisma: { post: { updateMany: unknown } }) =>
  ((prisma.post.updateMany as jest.Mock).mock.calls[0][0] as { where: Record<string, unknown> }).where;

const eligibleQuery = (prisma: { post: { findMany: unknown } }) =>
  (prisma.post.findMany as jest.Mock).mock.calls[0][0] as {
    where: Record<string, unknown>;
    take?: number;
  };

/**
 * D1 — la passe de soft-delete n'a jamais rien apparié.
 *
 * `deletedAt: null` ne matche, sur le connecteur MongoDB de Prisma, QUE les
 * documents où le champ est présent-et-null. Or `post.create` n'écrit jamais
 * `deletedAt` : sur un post vivant le champ est ABSENT. Tout le reste du dépôt
 * lit donc la vivacité par `NOT_DELETED` (`{ isSet: false }`) — dont le module
 * dédié existe précisément parce que le filtre naïf avait déjà vidé le feed en
 * production. Cette passe était le dernier survivant du filtre naïf, du côté
 * ÉCRITURE cette fois : au lieu de masquer tous les posts vivants d'une
 * lecture, il les excluait tous d'un balayage.
 */
describe('ExpiredStoriesCleanupService — D1 : un post vivant a son deletedAt ABSENT, pas null', () => {
  it('test_softDeletePass_matchesLivePosts_byUnsetDeletedAt', async () => {
    const prisma = buildPrisma();
    await new ExpiredStoriesCleanupService(prisma).cleanup();

    expect(softDeleteWhere(prisma).deletedAt).toEqual(NOT_DELETED);
  });

  it('test_softDeletePass_neverUsesTheNaiveNullFilter', async () => {
    const prisma = buildPrisma();
    await new ExpiredStoriesCleanupService(prisma).cleanup();

    // La forme exacte qui n'appariait rien. Écrite en négatif parce que c'est
    // elle, et pas une autre, qui a rendu la passe inerte depuis son écriture.
    expect(softDeleteWhere(prisma).deletedAt).not.toBeNull();
  });
});

/**
 * D2 — le balayage ne connaissait qu'un des deux types éphémères.
 */
describe('ExpiredStoriesCleanupService — D2 : tout contenu éphémère est balayé, pas seulement les stories', () => {
  it('test_softDeletePass_targetsEveryEphemeralType', async () => {
    const prisma = buildPrisma();
    await new ExpiredStoriesCleanupService(prisma).cleanup();

    expect(softDeleteWhere(prisma).type).toEqual({ in: expect.arrayContaining(['STORY', 'STATUS']) });
  });

  it('test_hardDeletePass_targetsEveryEphemeralType', async () => {
    const prisma = buildPrisma();
    await new ExpiredStoriesCleanupService(prisma).cleanup();

    expect(eligibleQuery(prisma).where.type).toEqual({ in: expect.arrayContaining(['STORY', 'STATUS']) });
  });

  /**
   * Le témoin qui compte vraiment : ce n'est pas « STATUS est dans la liste »,
   * c'est « la liste est CELLE de la table des durées ». Un troisième type
   * éphémère ajouté à la table sans toucher au balayage doit faire rougir ici.
   */
  it('test_bothPasses_deriveTheirTypesFromTheTtlTable', async () => {
    const prisma = buildPrisma();
    await new ExpiredStoriesCleanupService(prisma).cleanup();

    const expected = { in: [...EPHEMERAL_POST_TYPES] };
    expect(softDeleteWhere(prisma).type).toEqual(expected);
    expect(eligibleQuery(prisma).where.type).toEqual(expected);
  });

  it('test_expiredStatus_isDestroyedAlongsideTheStory_throughTheSameEffects', async () => {
    const prisma = buildPrisma();
    const result = await new ExpiredStoriesCleanupService(prisma).cleanup();

    // Le statut périmé n'est pas seulement compté : il traverse les MÊMES
    // effets que la story — purge des médias, des commentaires, des usages de
    // sons, retrait des notifications — puisqu'il entre dans le même lot.
    expect(prisma.post.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['story-1', 'status-1'] } },
    });
    expect(result.hardDeleted).toBe(2);
    expect(prisma.postMedia.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ postId: { in: ['story-1', 'status-1'] } }]),
        }),
      }),
    );
  });
});

/**
 * D3 — la fournée n'était bornée par rien.
 *
 * Sans borne, la première passe d'après-correctif affronte TOUT l'historique :
 * chaque story expirée depuis la mise en service, plus chaque statut jamais
 * balayé. Or le retrait des notifications REJETTE quand son plafond de
 * drainage est atteint (40 000 lignes), et il s'exécute AVANT toute
 * destruction — la passe renoncerait, ne détruirait rien, et la passe suivante
 * retrouverait exactement le même ensemble. Non pas lente : bloquée.
 */
describe('ExpiredStoriesCleanupService — D3 : la fournée du hard-delete est bornée', () => {
  it('test_hardDeletePass_boundsTheBatch_soABacklogDrainsAcrossPasses', async () => {
    const prisma = buildPrisma();
    await new ExpiredStoriesCleanupService(prisma).cleanup();

    expect(eligibleQuery(prisma).take).toBeGreaterThan(0);
  });

  it('test_hardDeleteBatchSize_isConfigurable', async () => {
    const prisma = buildPrisma();
    await new ExpiredStoriesCleanupService(prisma, { hardDeleteBatchSize: 7 }).cleanup();

    expect(eligibleQuery(prisma).take).toBe(7);
  });

  /**
   * La borne ne vaut que si elle reste sous le plafond du retrait. Elle est
   * exprimée en POSTS, le plafond en NOTIFICATIONS : le témoin ancre le rapport
   * choisi (40 notifications par post en moyenne), pas un chiffre nu.
   */
  it('test_defaultBatchSize_staysWellUnderTheRetractionCeiling', async () => {
    const prisma = buildPrisma();
    await new ExpiredStoriesCleanupService(prisma).cleanup();

    const RETRACTION_CEILING_ROWS = 200 * 200;
    expect(eligibleQuery(prisma).take! * 40).toBeLessThanOrEqual(RETRACTION_CEILING_ROWS);
  });
});

/**
 * D4 — le soft-delete ne doit pas devancer le DERNIER lecteur.
 *
 * `getStories` renvoie à un AUTEUR ses propres stories périmées pendant sept
 * jours, pour que « Mes stories » puisse les archiver — mais la requête est
 * gardée par `deletedAt: NOT_DELETED`. Soft-supprimer à l'échéance, comme le
 * faisait la passe SUR LE PAPIER, viderait donc « Mes stories » au bout d'une
 * heure. Ce n'était jusqu'ici sans effet que parce que la passe n'appariait
 * rien (D1) : réparer D1 sans ceci aurait ÉTEINT une fonctionnalité livrée.
 */
describe("ExpiredStoriesCleanupService — D4 : le soft-delete attend la fin de l'archive auteur", () => {
  it('test_softDeletePass_waitsOutTheAuthorArchiveWindow_beforeHiding', async () => {
    const prisma = buildPrisma();
    await new ExpiredStoriesCleanupService(prisma).cleanup();

    const expiresAt = softDeleteWhere(prisma).expiresAt as { lt: Date };
    const elapsed = Date.now() - expiresAt.lt.getTime();

    // La borne n'est pas « maintenant » : elle recule d'exactement la fenêtre
    // d'archive. Tolérance d'une seconde pour l'horloge du test.
    expect(elapsed).toBeGreaterThanOrEqual(EPHEMERAL_AUTHOR_ARCHIVE_MS - 1000);
    expect(elapsed).toBeLessThan(EPHEMERAL_AUTHOR_ARCHIVE_MS + 1000);
  });

  it('test_authorArchiveWindow_isTheSameConstantTheFeedReads', () => {
    // Deux copies dériveraient : le jour où la fenêtre du feed s'allonge, la
    // passe la devancerait de nouveau, en silence.
    expect(PostFeedService.AUTHOR_ARCHIVE_WINDOW_MS).toBe(EPHEMERAL_AUTHOR_ARCHIVE_MS);
  });
});

describe('ephemeralPosts — la table des durées gouverne les deux chemins', () => {
  it('test_types_areDerivedFromTheTtlTable', () => {
    expect([...EPHEMERAL_POST_TYPES].sort()).toEqual(Object.keys(EPHEMERAL_POST_TTL_HOURS).sort());
  });

  it('test_ephemeralExpiresAt_matchesTheDocumentedSchemaValues', () => {
    const from = new Date('2026-08-10T00:00:00.000Z');

    expect(ephemeralExpiresAt('STORY', from)).toEqual(new Date('2026-08-10T21:00:00.000Z'));
    expect(ephemeralExpiresAt('STATUS', from)).toEqual(new Date('2026-08-10T01:00:00.000Z'));
  });

  it('test_ephemeralExpiresAt_returnsUndefinedForPermanentTypes', () => {
    const from = new Date('2026-08-10T00:00:00.000Z');

    expect(ephemeralExpiresAt('POST', from)).toBeUndefined();
    expect(ephemeralExpiresAt('REEL', from)).toBeUndefined();
  });

  /**
   * `hasOwnProperty` et non `in` : un type nommé comme une clé d'`Object.prototype`
   * ne doit pas hériter d'une échéance.
   */
  it('test_ephemeralExpiresAt_ignoresPrototypeKeys', () => {
    expect(ephemeralExpiresAt('constructor', new Date())).toBeUndefined();
    expect(ephemeralExpiresAt('toString', new Date())).toBeUndefined();
  });
});
