/**
 * #19368 — les compteurs de publications d'un profil se comptent pour LE
 * LECTEUR, avec l'audience même des listes, jamais en total brut de l'auteur.
 *
 * Le double de `post.count` APPLIQUE la requête (`matchesPostWhere`) : retirer
 * l'audience ou l'expiration fait monter un nombre, et le témoin tombe.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PostType, PostVisibility } from '@meeshy/shared/prisma/client';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../../../services/posts/feedVisibility', () => ({ viewerPostAudience: jest.fn() }));

import { viewerPostAudience } from '../../../../services/posts/feedVisibility';
import { buildPostVisibilityOrFilter, NO_POST_CIRCLES } from '../../../../services/posts/postVisibility';
import { countAuthorContent, contentCountReaderFor } from '../../../../services/posts/authorContentCounts';
import { matchesPostWhere } from '../../../helpers/where-matcher-posts';

const AUTEUR = '507f1f77bcf86cd799439011';
const LECTEUR = '507f1f77bcf86cd799439022';
const MAINTENANT = new Date('2026-11-17T12:00:00.000Z');
const DEMAIN = new Date('2026-11-18T12:00:00.000Z');
const HIER = new Date('2026-11-16T12:00:00.000Z');

type Ligne = Record<string, unknown>;

const publication = (id: string, type: PostType, visibility: PostVisibility, extra: Ligne = {}): Ligne => ({
  id,
  authorId: AUTEUR,
  type,
  visibility,
  visibilityUserIds: [],
  communityId: null,
  expiresAt: null,
  ...extra,
});

const PUBLICATIONS: readonly Ligne[] = [
  publication('p1', PostType.POST, PostVisibility.PUBLIC),
  publication('p2', PostType.POST, PostVisibility.FRIENDS),
  publication('p3', PostType.POST, PostVisibility.PRIVATE),
  publication('p4', PostType.REEL, PostVisibility.CLOSE),
  publication('p5', PostType.STORY, PostVisibility.PUBLIC, { expiresAt: DEMAIN }),
  publication('p6', PostType.STORY, PostVisibility.PUBLIC, { expiresAt: HIER }),
  publication('p7', PostType.STATUS, PostVisibility.FRIENDS, { expiresAt: DEMAIN }),
  publication('p8', PostType.POST, PostVisibility.ONLY, { visibilityUserIds: [LECTEUR] }),
  publication('p9', PostType.POST, PostVisibility.PUBLIC, { deletedAt: HIER }),
  publication('p10', PostType.POST, PostVisibility.COMMUNITY, { communityId: '507f1f77bcf86cd7994390cc' }),
  publication('p11', PostType.REEL, PostVisibility.ACQUAINTANCES),
  publication('p12', PostType.POST, PostVisibility.EXCEPT, { visibilityUserIds: [LECTEUR] }),
  publication('p13', PostType.STATUS, PostVisibility.PUBLIC, { expiresAt: HIER }),
  { ...publication('autre', PostType.POST, PostVisibility.PUBLIC), authorId: LECTEUR },
];

const prismaDouble = () =>
  ({
    post: {
      count: jest.fn(async (args: { where?: unknown }) => PUBLICATIONS.filter((ligne) => matchesPostWhere(ligne, args.where)).length),
    },
  }) as unknown as PrismaClient;

const audienceDe = jest.mocked(viewerPostAudience);

beforeEach(() => audienceDe.mockReset());

describe('countAuthorContent — ce que CE lecteur peut voir', () => {
  it("le total (soi, administration) compte tout ce qui n'est pas supprimé, archive comprise", async () => {
    const compte = await countAuthorContent(prismaDouble(), AUTEUR, { kind: 'total' }, MAINTENANT);

    expect(compte).toEqual({ postsCount: 6, reelsCount: 2, storiesCount: 2, statusesCount: 2 });
  });

  it("l'anonyme ne compte que le PUBLIC encore en ligne", async () => {
    const compte = await countAuthorContent(prismaDouble(), AUTEUR, { kind: 'anonymous' }, MAINTENANT);

    expect(compte).toEqual({ postsCount: 1, reelsCount: 0, storiesCount: 1, statusesCount: 0 });
  });

  it("un lecteur Ami compte avec l'audience des listes : ONLY qui le nomme oui, EXCEPT qui l'exclut non, Proche non", async () => {
    audienceDe.mockResolvedValue(
      buildPostVisibilityOrFilter(LECTEUR, [AUTEUR], [], [], { acquaintance: [AUTEUR], close: [], blood: [] }) as never,
    );

    const compte = await countAuthorContent(prismaDouble(), AUTEUR, { kind: 'viewer', viewerId: LECTEUR }, MAINTENANT);

    expect(audienceDe).toHaveBeenCalledWith(expect.anything(), LECTEUR, undefined);
    expect(compte).toEqual({ postsCount: 3, reelsCount: 1, storiesCount: 1, statusesCount: 1 });
  });

  it('un blocage entre eux ramène tout à zéro', async () => {
    audienceDe.mockResolvedValue(buildPostVisibilityOrFilter(LECTEUR, [AUTEUR], [], [AUTEUR], NO_POST_CIRCLES) as never);

    const compte = await countAuthorContent(prismaDouble(), AUTEUR, { kind: 'viewer', viewerId: LECTEUR }, MAINTENANT);

    expect(compte).toEqual({ postsCount: 0, reelsCount: 0, storiesCount: 0, statusesCount: 0 });
  });

  it('« Voir comme » Ami : Public, Amis, Sauf, Connaissances ; ni Proche, ni Uniquement, ni Privé', async () => {
    const compte = await countAuthorContent(prismaDouble(), AUTEUR, { kind: 'circle', level: 'FRIEND' }, MAINTENANT);

    expect(compte).toEqual({ postsCount: 3, reelsCount: 1, storiesCount: 1, statusesCount: 1 });
  });

  it('« Voir comme » Proche ouvre en plus le réel Proche', async () => {
    const compte = await countAuthorContent(prismaDouble(), AUTEUR, { kind: 'circle', level: 'CLOSE' }, MAINTENANT);

    expect(compte).toEqual({ postsCount: 3, reelsCount: 2, storiesCount: 1, statusesCount: 1 });
  });

  it('« Voir comme » Connaissance : le Public et les Connaissances, rien des Amis', async () => {
    const compte = await countAuthorContent(prismaDouble(), AUTEUR, { kind: 'circle', level: 'ACQUAINTANCE' }, MAINTENANT);

    expect(compte).toEqual({ postsCount: 1, reelsCount: 1, storiesCount: 1, statusesCount: 0 });
  });

  it('« Voir comme » Public vaut l\'anonyme', async () => {
    const commePublic = await countAuthorContent(prismaDouble(), AUTEUR, { kind: 'circle', level: 'PUBLIC' }, MAINTENANT);
    const anonyme = await countAuthorContent(prismaDouble(), AUTEUR, { kind: 'anonymous' }, MAINTENANT);

    expect(commePublic).toEqual(anonyme);
  });
});

describe('contentCountReaderFor — qui compte comme qui', () => {
  it('« Voir comme » prime, même pour le propriétaire', () => {
    expect(contentCountReaderFor({ subjectId: AUTEUR, viewerId: AUTEUR, isAdministration: true, seenAs: 'FRIEND' })).toEqual({
      kind: 'circle',
      level: 'FRIEND',
    });
  });

  it('soi et l\'administration gardent le total', () => {
    expect(contentCountReaderFor({ subjectId: AUTEUR, viewerId: AUTEUR, isAdministration: false })).toEqual({ kind: 'total' });
    expect(contentCountReaderFor({ subjectId: AUTEUR, viewerId: LECTEUR, isAdministration: true })).toEqual({ kind: 'total' });
  });

  it('un tiers compte comme lui, un anonyme comme personne', () => {
    expect(contentCountReaderFor({ subjectId: AUTEUR, viewerId: LECTEUR, isAdministration: false })).toEqual({
      kind: 'viewer',
      viewerId: LECTEUR,
    });
    expect(contentCountReaderFor({ subjectId: AUTEUR, isAdministration: false })).toEqual({ kind: 'anonymous' });
  });
});
