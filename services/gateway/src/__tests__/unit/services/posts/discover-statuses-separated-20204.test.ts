/**
 * #20204 — LA DÉCOUVERTE DES STATUTS ÉCARTE L'AUTEUR SÉPARÉ DU LECTEUR.
 *
 * `getDiscoverStatuses` sert les statuts `PUBLIC` de TOUT auteur. Sa jumelle
 * `getStatuses` passe par `buildFeedVisibilityFilter`, qui lit les blocages
 * lui-même et pose `authorId: { notIn }` ; la découverte, elle, compose son
 * `where` à la main — `deletedAt`, `type`, `visibility`, l'expiration, le
 * curseur — et n'a JAMAIS porté la moindre clause de séparation.
 *
 * Le témoin se pose sur la REQUÊTE, pas sur la page servie : la séparation d'un
 * AUTEUR appartient au `where` (filtrée après lecture, une page reviendrait
 * courte avec un `hasMore` faux — `separatedCommentAuthors.ts` l'écrit déjà).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { PostFeedService } from '../../../../services/PostFeedService';

const VIEWER = '507f1f77bcf86cd799439001';
const AUTHOR = '507f1f77bcf86cd799439002';
/** Celui que le lecteur a bloqué. */
const BLOCKED = '507f1f77bcf86cd799439003';
/** Celui qui a bloqué le lecteur — l'autre sens, que le dépôt garde aussi. */
const BLOCKER = '507f1f77bcf86cd799439004';

const person = (id: string) => ({ id, username: `u${id.slice(-2)}`, displayName: null, avatar: null });

const status = (id: string, authorId: string) => ({
  id,
  authorId,
  type: 'STATUS',
  visibility: 'PUBLIC',
  createdAt: new Date('2026-11-25T10:00:00Z'),
  content: 'mon humeur',
  author: person(authorId),
  postMentions: [],
});

function prismaServing(rows: readonly unknown[], blocks: { readonly blockedByViewer: readonly string[]; readonly blockers: readonly string[] }) {
  return {
    post: { findMany: jest.fn<any>(async () => rows) },
    user: {
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: [...blocks.blockedByViewer] })),
      findMany: jest.fn<any>(async () => blocks.blockers.map((id) => ({ id }))),
    },
  };
}

const whereOf = (prisma: { post: { findMany: jest.Mock } }) =>
  (prisma.post.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;

describe('#20204 — getDiscoverStatuses et la séparation du lecteur', () => {
  it('écarte de la REQUÊTE les auteurs séparés, dans les deux sens', async () => {
    const prisma = prismaServing([status('s1', AUTHOR)], { blockedByViewer: [BLOCKED], blockers: [BLOCKER] });

    await new PostFeedService(prisma as never).getDiscoverStatuses(VIEWER);

    expect(whereOf(prisma).authorId).toEqual({ notIn: expect.arrayContaining([BLOCKED, BLOCKER]) });
  });

  it('écarte aussi la COPIE d’un contenu dont l’auteur d’origine est séparé', async () => {
    const prisma = prismaServing([status('s1', AUTHOR)], { blockedByViewer: [BLOCKED], blockers: [] });

    await new PostFeedService(prisma as never).getDiscoverStatuses(VIEWER);

    expect(whereOf(prisma).AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([{ snapshotAuthorId: { notIn: expect.arrayContaining([BLOCKED]) } }]),
        }),
      ]),
    );
  });

  it('sans aucun blocage, aucune clause d’exclusion n’est posée — un `notIn: []` coûterait un niveau de plan pour rien', async () => {
    const prisma = prismaServing([status('s1', AUTHOR)], { blockedByViewer: [], blockers: [] });

    const page = await new PostFeedService(prisma as never).getDiscoverStatuses(VIEWER);

    expect(whereOf(prisma).authorId).toBeUndefined();
    expect(page.items.map((item: { id: string }) => item.id)).toEqual(['s1']);
  });

  it('ne lit les blocages qu’UNE fois par appel', async () => {
    const prisma = prismaServing([status('s1', AUTHOR)], { blockedByViewer: [BLOCKED], blockers: [BLOCKER] });

    await new PostFeedService(prisma as never).getDiscoverStatuses(VIEWER);

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('FERMÉ : une lecture des blocages qui lève fait échouer la découverte, jamais servir sans savoir', async () => {
    const prisma = prismaServing([status('s1', AUTHOR)], { blockedByViewer: [], blockers: [] });
    prisma.user.findUnique.mockRejectedValue(new Error('mongo down'));

    await expect(new PostFeedService(prisma as never).getDiscoverStatuses(VIEWER)).rejects.toThrow();
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });
});
