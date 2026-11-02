/**
 * On ne republie, ne cite ni ne partage le contenu de quelqu'un avec qui un
 * blocage existe, dans un sens ou dans l'autre (#14242).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { isBlockedWithContentAuthors } from '../contentAuthorBlock';

const ACTOR = '507f1f77bcf86cd799439001';
const AUTHOR = '507f1f77bcf86cd799439002';
const ROOT_AUTHOR = '507f1f77bcf86cd799439003';
const POST = '507f1f77bcf86cd799439022';
const ROOT = '507f1f77bcf86cd799439044';
const MID = '507f1f77bcf86cd799439055';
const MID_AUTHOR = '507f1f77bcf86cd799439005';

type Post = { readonly id: string; readonly authorId: string; readonly repostOfId: string | null; readonly originalRepostOfId: string | null };

/** `blocks` : paires « A a bloqué B ». */
function prismaWith(posts: readonly Post[], blocks: ReadonlyArray<readonly [string, string]>) {
  const byId = new Map(posts.map((p) => [p.id, p]));
  const has = (a: string, b: string) => blocks.some(([x, y]) => x === a && y === b);
  return {
    post: {
      findFirst: jest.fn<any>(async (args: { where: { id: string } }) => byId.get(args.where.id) ?? null),
      findMany: jest.fn<any>(async (args: { where: { id: { in: string[] } } }) => args.where.id.in.flatMap((id) => byId.get(id) ?? [])),
    },
    user: {
      findFirst: jest.fn<any>(async (args: { where: { OR: Array<{ id: string; blockedUserIds: { has: string } }> } }) =>
        args.where.OR.some((c) => has(c.id, c.blockedUserIds.has)) ? { id: 'x' } : null),
    },
  } as any;
}

const post = (over: Partial<Post> = {}): Post => ({ id: POST, authorId: AUTHOR, repostOfId: null, originalRepostOfId: null, ...over });

describe('isBlockedWithContentAuthors', () => {
  it("rien entre l'acteur et l'auteur ⇒ pas de blocage", async () => {
    expect(await isBlockedWithContentAuthors(prismaWith([post()], []), { actorId: ACTOR, postId: POST })).toBe(false);
  });

  it("l'auteur a bloqué l'acteur ⇒ bloqué", async () => {
    expect(await isBlockedWithContentAuthors(prismaWith([post()], [[AUTHOR, ACTOR]]), { actorId: ACTOR, postId: POST })).toBe(true);
  });

  it("l'acteur a bloqué l'auteur ⇒ bloqué aussi", async () => {
    expect(await isBlockedWithContentAuthors(prismaWith([post()], [[ACTOR, AUTHOR]]), { actorId: ACTOR, postId: POST })).toBe(true);
  });

  it("une republication : un blocage avec l'auteur RACINE suffit", async () => {
    const prisma = prismaWith(
      [post({ repostOfId: ROOT, originalRepostOfId: ROOT }), { id: ROOT, authorId: ROOT_AUTHOR, repostOfId: null, originalRepostOfId: null }],
      [[ROOT_AUTHOR, ACTOR]]
    );
    expect(await isBlockedWithContentAuthors(prisma, { actorId: ACTOR, postId: POST })).toBe(true);
  });

  it.each([
    ['la source intermédiaire (`repostOfId`)', MID_AUTHOR],
    ['la racine (`originalRepostOfId`)', ROOT_AUTHOR],
  ])('une chaîne : un blocage avec l’auteur de %s suffit', async (_label, blocker) => {
    const prisma = prismaWith(
      [
        post({ repostOfId: MID, originalRepostOfId: ROOT }),
        { id: MID, authorId: MID_AUTHOR, repostOfId: ROOT, originalRepostOfId: ROOT },
        { id: ROOT, authorId: ROOT_AUTHOR, repostOfId: null, originalRepostOfId: null },
      ],
      [[blocker, ACTOR]]
    );
    expect(await isBlockedWithContentAuthors(prisma, { actorId: ACTOR, postId: POST })).toBe(true);
  });

  it('une publication introuvable répond « bloqué » (fermé)', async () => {
    expect(await isBlockedWithContentAuthors(prismaWith([], []), { actorId: ACTOR, postId: POST })).toBe(true);
  });

  it('son propre contenu ne se bloque jamais', async () => {
    expect(await isBlockedWithContentAuthors(prismaWith([post({ authorId: ACTOR })], [[ACTOR, ACTOR]]), { actorId: ACTOR, postId: POST })).toBe(false);
  });

  it("fermé sur l'échec : une lecture qui échoue répond « bloqué »", async () => {
    const prisma = prismaWith([post()], []);
    prisma.user.findFirst.mockRejectedValue(new Error('db down'));
    expect(await isBlockedWithContentAuthors(prisma, { actorId: ACTOR, postId: POST })).toBe(true);
  });
});
