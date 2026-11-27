import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MediaNotClaimedError, requirePublishableMedia } from '../unpublishableMedia';
import { matchesWhere, type MongoDoc, type WhereShape } from './helpers/mongoWhereMatcher';

/**
 * #13422 — un média demandé qui n'existe plus (balayé après 24 h) ou que
 * l'auteur ne peut plus réclamer refuse la publication au lieu de la laisser
 * partir sans lui. La base est simulée comme dans `mediaClaimGuard.test.ts` :
 * un `field: null` ne matche qu'un champ PRÉSENT à `null`.
 */

const ALICE = '507f1f77bcf86cd799439011';
const BOB = '507f1f77bcf86cd799439012';

type MediaDoc = MongoDoc & { id: string };

type Base = { postMedia: Pick<PrismaClient['postMedia'], 'findMany'> };

const base = (docs: readonly MediaDoc[]): Base => ({
  postMedia: {
    findMany: (async ({ where }: { where: WhereShape }) =>
      docs.filter((doc) => matchesWhere(doc, where)).map((doc) => ({ id: doc.id }))) as unknown as Base['postMedia']['findMany'],
  },
});

const refusal = async (docs: readonly MediaDoc[], ids: readonly string[], author = ALICE): Promise<readonly string[] | null> => {
  try {
    await requirePublishableMedia(base(docs), ids, author);
    return null;
  } catch (error) {
    if (error instanceof MediaNotClaimedError) return error.mediaIds;
    throw error;
  }
};

describe('requirePublishableMedia — un média demandé qui a disparu refuse la publication (#13422)', () => {
  it('un média libre de l’auteur passe', async () => {
    expect(await refusal([{ id: 'm1', postId: null, commentId: null, uploaderId: ALICE }], ['m1'])).toBeNull();
  });

  it('un média BALAYÉ (la ligne n’existe plus) refuse, en nommant son id', async () => {
    expect(await refusal([{ id: 'm1', postId: null, commentId: null, uploaderId: ALICE }], ['m1', 'swept'])).toEqual(['swept']);
  });

  it('un média libre d’un AUTRE uploadeur refuse', async () => {
    expect(await refusal([{ id: 'm1', postId: null, uploaderId: BOB }], ['m1'])).toEqual(['m1']);
  });

  it('un média déjà rattaché garde le chemin d’avant (copie d’une publication sœur, réemploi)', async () => {
    expect(await refusal([{ id: 'm1', postId: 'post-1', uploaderId: ALICE }], ['m1'])).toBeNull();
  });

  it('un média téléversé sans commentId (forme TUS) reste réclamable', async () => {
    expect(await refusal([{ id: 'm1', postId: null, uploaderId: ALICE }], ['m1'])).toBeNull();
  });

  it('un id répété ne se nomme qu’une fois, et rien demandé ne lit pas la base', async () => {
    expect(await refusal([], ['gone', 'gone'])).toEqual(['gone']);
    const silent = { postMedia: { findMany: (async () => { throw new Error('lu'); }) as unknown as Base['postMedia']['findMany'] } };
    await expect(requirePublishableMedia(silent, [], ALICE)).resolves.toEqual([]);
    await expect(requirePublishableMedia(silent, undefined, ALICE)).resolves.toBeUndefined();
  });
});
