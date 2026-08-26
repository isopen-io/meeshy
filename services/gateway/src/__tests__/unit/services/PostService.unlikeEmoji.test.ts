/**
 * Tests — `PostService.unlikePost` : QUELLE réaction part.
 *
 * Règle produit (2026-08-25) : « Appui simple sur le cœur ⇒ envoie un cœur.
 * Appui long ⇒ le sélecteur des autres réactions. Re-toucher ⇒ retire la
 * DERNIÈRE réaction posée, une par une, jusqu'à n'en plus avoir. »
 *
 * Elle exige DEUX choses du serveur, et il n'en tenait aucune :
 *  - qu'on puisse DÉSIGNER la réaction à retirer (le client connaît sa pile) ;
 *  - qu'à défaut de désignation, ce soit la PLUS RÉCENTE qui parte.
 *
 * `unlikePost` lisait `userReactions[0]` d'un `findMany` SANS `orderBy` : un
 * élément d'un ensemble NON ORDONNÉ. La ligne rendue est alors l'ordre naturel
 * de la collection — l'ordre d'INSERTION — donc la PLUS ANCIENNE. Et l'emoji
 * ainsi tiré alimente `post:unliked` / `story:unreacted` / `status:unreacted` :
 * un client optimiste qui retire un pouce s'entend annoncer le départ d'un
 * cœur, et se désynchronise sur un geste RÉUSSI.
 *
 * La table factice ci-dessous rend l'ordre d'insertion quand la requête ne
 * trie pas — exactement ce que fait Mongo — et honore `orderBy` sinon. Les
 * données sont semées pour que les deux ordres DIVERGENT : le pouce est posé
 * en premier (donc plus ancien) et le cœur en second.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../services/posts/communityVisibility', () => ({
  getCommunityCoMemberIds: jest.fn<any>().mockResolvedValue([]),
}));

jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstanceSync: jest.fn<any>().mockReturnValue(null) },
}));

jest.mock('../../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: { processPostAudio: jest.fn<any>().mockResolvedValue(undefined) },
  },
}));

import { PostService } from '../../../services/PostService';

const POST_ID = 'post-1';
const VIEWER = 'user-1';
const OTHER = 'user-2';

type ReactionRow = { userId: string; emoji: string; createdAt: Date };

const at = (hhmm: string) => new Date(`2026-08-25T${hhmm}:00Z`);

/**
 * Trois réactions du même lecteur, posées pouce → rire → cœur. L'ordre
 * d'INSERTION (👍, 😂, ❤️) diverge donc de l'ordre chronologique DÉCROISSANT
 * (❤️, 😂, 👍) : une lecture non triée rend le pouce — le PLUS ANCIEN — là où
 * la règle produit veut le cœur. Le rire, ni premier ni dernier, sert à la
 * désignation explicite : aucun ordre ne peut le rendre « par chance ».
 * Le 🔥 d'une AUTRE personne garde la garde d'identité sous les yeux.
 */
const seededStack = (): ReactionRow[] => [
  { userId: VIEWER, emoji: '👍', createdAt: at('10:00') },
  { userId: VIEWER, emoji: '😂', createdAt: at('10:02') },
  { userId: VIEWER, emoji: '❤️', createdAt: at('10:05') },
  { userId: OTHER, emoji: '🔥', createdAt: at('10:07') },
];

function makePrisma(rows: ReactionRow[]) {
  const store = [...rows];

  const findMany = jest.fn<any>().mockImplementation(async (args: any = {}) => {
    const where = args?.where ?? {};
    const matching = store.filter((row) =>
      (where.userId === undefined || row.userId === where.userId) &&
      (where.emoji === undefined || row.emoji === where.emoji));
    const direction = args?.orderBy?.createdAt;
    if (direction === 'asc') {
      return [...matching].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }
    if (direction === 'desc') {
      return [...matching].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    // Aucun tri demandé ⇒ ordre naturel de la collection = ordre d'insertion.
    return matching;
  });

  const prisma = {
    post: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: POST_ID, authorId: 'author-1', type: 'POST' }),
      update: jest.fn<any>().mockResolvedValue({ id: POST_ID }),
    },
    postReaction: { findMany },
    notification: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    $runCommandRaw: jest.fn<any>().mockResolvedValue({ cursor: { firstBatch: [] } }),
  };

  return { prisma, store, findMany };
}

function makeSut(rows: ReactionRow[]) {
  const { prisma, store, findMany } = makePrisma(rows);
  // Le service de réactions est le SEUL à écrire : le retirer du magasin ici
  // rend la relecture « ce qu'il reste » fidèle, donc les assertions sur le
  // JSON dénormalisé et le `likeCount` mesurent bien l'effet du geste.
  const reactionService = {
    addReaction: jest.fn<any>().mockResolvedValue({}),
    removeReaction: jest.fn<any>().mockImplementation(async ({ userId, emoji }: any) => {
      const index = store.findIndex((row) => row.userId === userId && row.emoji === emoji);
      if (index >= 0) store.splice(index, 1);
      return index >= 0;
    }),
  };
  const trackingService = { collectContentTrackingLinks: jest.fn<any>().mockResolvedValue([]) };
  const sut = new PostService(
    prisma as any,
    undefined,
    undefined,
    reactionService as any,
    trackingService as any,
  );
  return { sut, prisma, reactionService, findMany, store };
}

const persistedReactions = (prisma: { post: { update: jest.Mock } }) => {
  const call = (prisma.post.update as any).mock.calls.at(-1)?.[0];
  return (call?.data?.reactions ?? []) as Array<{ emoji: string }>;
};

// ─── Sans emoji : la DERNIÈRE posée part ──────────────────────────────────────

describe('unlikePost — sans emoji désigné', () => {
  it('retire la réaction la PLUS RÉCENTE, jamais un élément non ordonné', async () => {
    const { sut, reactionService } = makeSut(seededStack());

    const result = await sut.unlikePost(POST_ID, VIEWER);

    expect(reactionService.removeReaction).toHaveBeenCalledWith(
      expect.objectContaining({ postId: POST_ID, userId: VIEWER, emoji: '❤️' }),
    );
    expect(result?.removedEmoji).toBe('❤️');
  });

  it('lit la pile TRIÉE — un ensemble non ordonné ne peut pas dire « la dernière »', async () => {
    const { sut, findMany } = makeSut(seededStack());

    await sut.unlikePost(POST_ID, VIEWER);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ postId: POST_ID, userId: VIEWER }),
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('pèle la pile une par une, de la plus récente à la plus ancienne', async () => {
    const { sut } = makeSut(seededStack());

    const peeled = [
      await sut.unlikePost(POST_ID, VIEWER),
      await sut.unlikePost(POST_ID, VIEWER),
      await sut.unlikePost(POST_ID, VIEWER),
      await sut.unlikePost(POST_ID, VIEWER),
    ].map((step) => step?.removedEmoji ?? null);

    expect(peeled).toEqual(['❤️', '😂', '👍', null]);
  });
});

// ─── Avec emoji : celui-là, exactement ────────────────────────────────────────

describe('unlikePost — emoji désigné', () => {
  it('retire EXACTEMENT l\'emoji demandé — ni le plus ancien, ni le plus récent', async () => {
    const { sut, reactionService, prisma } = makeSut(seededStack());

    const result = await sut.unlikePost(POST_ID, VIEWER, '😂');

    expect(reactionService.removeReaction).toHaveBeenCalledWith(
      expect.objectContaining({ userId: VIEWER, emoji: '😂' }),
    );
    expect(result?.removedEmoji).toBe('😂');
    // Le cœur ET le pouce SURVIVENT : le geste n'emporte que ce qu'il désigne.
    expect(persistedReactions(prisma).map((r) => r.emoji).sort())
      .toEqual(['❤️', '👍', '🔥'].sort());
  });

  it('emoji posé par QUELQU\'UN D\'AUTRE ⇒ rien retiré, rien à annoncer', async () => {
    const { sut, reactionService } = makeSut(seededStack());

    const result = await sut.unlikePost(POST_ID, VIEWER, '🔥');

    expect(reactionService.removeReaction).not.toHaveBeenCalled();
    expect(result?.removedEmoji).toBeNull();
  });
});
