/**
 * #6587 — la langue d'ÉCRITURE déclarée par l'auteur d'un commentaire.
 *
 * `PostComment.originalLanguage` est la langue SOURCE depuis laquelle tout
 * lecteur descend son prisme. Le champ voyage désormais depuis les trois
 * surfaces iOS (`CreateCommentPayload.originalLanguage`, chemin direct ET
 * chemin durable) ; côté serveur, l'heuristique de mots
 * (`detectLanguage`, PostService.ts) n'est plus qu'un REPLI.
 *
 * Ces témoins épinglent les deux moitiés du contrat :
 *   1. le champ DÉCLARÉ gagne — même quand le texte ferait dire autre chose
 *      à l'heuristique (c'est tout l'intérêt : une assertion posée sur un
 *      texte que la devinette classerait pareil verdirait pour un motif
 *      étranger à ce qu'elle affirme) ;
 *   2. le champ ABSENT laisse le repli s'appliquer — une ligne d'outbox
 *      gravée avant ce lot rejoue sans la clé et ne doit rien casser.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { PostCommentService } from '../../../services/PostCommentService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const noopTrackingLinks = {
  collectContentTrackingLinks: jest.fn().mockResolvedValue([]),
} as any;

/// Un texte que `detectLanguage` classe « fr » : il porte « les », « pour »
/// et « dans ». Toute assertion sur une langue DIFFÉRENTE de `fr` ne peut
/// donc verdir que si la DÉCLARATION a gagné.
const FRENCH_LOOKING = 'Merci pour les photos dans le groupe';

const buildPrisma = () => {
  const create = jest.fn().mockResolvedValue({
    id: 'c-new', content: FRENCH_LOOKING, originalLanguage: null, translations: null,
    likeCount: 0, replyCount: 0, effectFlags: 0, parentId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'), metadata: null,
    author: { id: 'a1', username: 'al', displayName: 'Al', avatar: null },
  });
  const prisma = {
    post: {
      findFirst: jest.fn().mockResolvedValue({ id: 'post-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    postComment: {
      findFirst: jest.fn(),
      create,
      update: jest.fn().mockResolvedValue({}),
    },
    postMedia: {
      findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(),
      create: jest.fn(), delete: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn(),
    },
  } as unknown as PrismaClient;
  return { prisma, create };
};

const writtenData = (create: jest.Mock) => create.mock.calls[0][0].data;

describe('PostCommentService.addComment — langue d’écriture déclarée (#6587)', () => {
  it('grave la langue DÉCLARÉE, pas celle que l’heuristique devinerait', async () => {
    const { prisma, create } = buildPrisma();
    const service = new PostCommentService(prisma, noopTrackingLinks);

    await service.addComment('post-1', 'a1', FRENCH_LOOKING, { originalLanguage: 'de' });

    expect(writtenData(create).originalLanguage).toBe('de');
  });

  it('canonicalise une locale de plateforme brute au lieu de la rejeter', async () => {
    const { prisma, create } = buildPrisma();
    const service = new PostCommentService(prisma, noopTrackingLinks);

    await service.addComment('post-1', 'a1', FRENCH_LOOKING, { originalLanguage: 'de_DE' });

    expect(writtenData(create).originalLanguage).toBe('de');
  });

  it('laisse le REPLI s’appliquer quand la charge ne déclare aucune langue', async () => {
    const { prisma, create } = buildPrisma();
    const service = new PostCommentService(prisma, noopTrackingLinks);

    await service.addComment('post-1', 'a1', FRENCH_LOOKING);

    // `null` = rien de déclaré. Le pipeline de traduction
    // (`PostTranslationService.translateComment`) retombe alors, et alors
    // SEULEMENT, sur `detectLanguage(content)`.
    expect(writtenData(create).originalLanguage).toBeNull();
  });
});
