/**
 * Ce que l'auteur — ou un tiers — ne peut pas défaire d'un retrait de modération (#10315).
 * Les trois chemins sont ceux que l'audit adversarial du lot a démontrés ouverts.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { audienceChangeVerdict, mayRepostSource } from '../moderationHold';

const POST = '507f1f77bcf86cd799439022';
const SOURCE = '507f1f77bcf86cd799439033';
const AUTHOR = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439099';
const EARLIER = new Date('2026-10-11T08:00:00.000Z');

type Row = Record<string, unknown>;

/** Un double qui rend la ligne demandée PAR SON IDENTIFIANT — jamais une suite de réponses à l'aveugle. */
function prismaWith(rows: Readonly<Record<string, Row>>) {
  const findFirst = jest.fn<any>(async (args: { where: { id: string } }) => rows[args.where.id] ?? null);
  return { prisma: { post: { findFirst } } as any, findFirst };
}

const hold = (over: Row = {}): Row => ({
  id: POST,
  deletedAt: null,
  originalRepostOfId: null,
  authorId: AUTHOR,
  visibility: 'PRIVATE',
  visibilityUserIds: [],
  expiresAt: null,
  moderationHiddenAt: null,
  moderationPriorVisibility: null,
  repostOfId: null,
  ...over,
});

describe("audienceChangeVerdict — l'édition d'audience par l'auteur", () => {
  it("retient l'auteur qui rouvre une publication hors ligne", async () => {
    const { prisma } = prismaWith({ [POST]: hold({ moderationHiddenAt: EARLIER }) });
    expect(await audienceChangeVerdict(prisma, { postId: POST, userId: AUTHOR, requestedVisibility: 'PUBLIC' })).toEqual({ refusal: 'held', clearsPriorVisibility: false });
  });

  it('laisse passer une publication en ligne', async () => {
    const { prisma } = prismaWith({ [POST]: hold({ visibility: 'FRIENDS' }) });
    expect((await audienceChangeVerdict(prisma, { postId: POST, userId: AUTHOR, requestedVisibility: 'PUBLIC' })).refusal).toBeNull();
  });

  it("ne dit rien à un autre que l'auteur — aucun oracle sur l'état de modération", async () => {
    const { prisma } = prismaWith({ [POST]: hold({ moderationHiddenAt: EARLIER }) });
    expect(await audienceChangeVerdict(prisma, { postId: POST, userId: OTHER, requestedVisibility: 'PUBLIC' })).toEqual({ refusal: null, clearsPriorVisibility: false });
  });

  it("ne lit rien quand l'audience ne change pas", async () => {
    const { prisma, findFirst } = prismaWith({ [POST]: hold({ moderationHiddenAt: EARLIER }) });
    await audienceChangeVerdict(prisma, { postId: POST, userId: AUTHOR, requestedVisibility: undefined });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("refuse d'élargir une republication au-delà de sa source — la republication privée d'un contenu retiré ne se rouvre pas", async () => {
    const { prisma } = prismaWith({
      [POST]: hold({ repostOfId: SOURCE }),
      [SOURCE]: { visibility: 'FRIENDS', moderationHiddenAt: null, deletedAt: null, originalRepostOfId: null },
    });
    expect((await audienceChangeVerdict(prisma, { postId: POST, userId: AUTHOR, requestedVisibility: 'PUBLIC' })).refusal).toBe('repost-broader');
  });

  it('refuse de rouvrir la republication d’une source hors ligne', async () => {
    const { prisma } = prismaWith({
      [POST]: hold({ repostOfId: SOURCE }),
      [SOURCE]: { visibility: 'PRIVATE', moderationHiddenAt: EARLIER, deletedAt: null, originalRepostOfId: null },
    });
    expect((await audienceChangeVerdict(prisma, { postId: POST, userId: AUTHOR, requestedVisibility: 'PRIVATE' })).refusal).toBeNull();
    expect((await audienceChangeVerdict(prisma, { postId: POST, userId: AUTHOR, requestedVisibility: 'FRIENDS' })).refusal).toBe('held');
  });

  it("refuse d'élargir une republication dont la source a été supprimée", async () => {
    const { prisma } = prismaWith({
      [POST]: hold({ repostOfId: SOURCE }),
      [SOURCE]: { visibility: 'PUBLIC', moderationHiddenAt: null, deletedAt: EARLIER, originalRepostOfId: null },
    });
    expect((await audienceChangeVerdict(prisma, { postId: POST, userId: AUTHOR, requestedVisibility: 'FRIENDS' })).refusal).toBe('repost-broader');
  });

  it("périme l'audience retenue par une mise en privé dès que l'auteur choisit la sienne", async () => {
    const { prisma } = prismaWith({ [POST]: hold({ visibility: 'PRIVATE', moderationPriorVisibility: 'PUBLIC' }) });
    expect(await audienceChangeVerdict(prisma, { postId: POST, userId: AUTHOR, requestedVisibility: 'FRIENDS' })).toEqual({ refusal: null, clearsPriorVisibility: true });
    expect(await audienceChangeVerdict(prisma, { postId: POST, userId: AUTHOR, requestedVisibility: 'PRIVATE' })).toEqual({ refusal: null, clearsPriorVisibility: true });
  });
});

describe('mayRepostSource — on ne republie que ce qu’on peut lire, et jamais ce qui est hors ligne', () => {
  it('admet une source publique et en ligne', async () => {
    const { prisma } = prismaWith({ [SOURCE]: hold({ id: SOURCE, visibility: 'PUBLIC' }) });
    expect(await mayRepostSource(prisma, SOURCE, OTHER)).toBe(true);
  });

  it('refuse une source hors ligne, même à son auteur', async () => {
    const { prisma } = prismaWith({ [SOURCE]: hold({ id: SOURCE, moderationHiddenAt: EARLIER }) });
    expect(await mayRepostSource(prisma, SOURCE, AUTHOR)).toBe(false);
  });

  it("refuse une source privée à qui n'en est pas l'auteur — connaître l'identifiant ne suffit plus", async () => {
    const { prisma } = prismaWith({ [SOURCE]: hold({ id: SOURCE, visibility: 'PRIVATE' }) });
    expect(await mayRepostSource(prisma, SOURCE, OTHER)).toBe(false);
  });

  it('refuse la republication d’une copie dont la RACINE est hors ligne', async () => {
    const ROOT = '507f1f77bcf86cd799439044';
    const { prisma } = prismaWith({
      [SOURCE]: hold({ id: SOURCE, visibility: 'PUBLIC', originalRepostOfId: ROOT }),
      [ROOT]: hold({ id: ROOT, moderationHiddenAt: EARLIER }),
    });
    expect(await mayRepostSource(prisma, SOURCE, OTHER)).toBe(false);
  });

  it('refuse une source supprimée', async () => {
    const { prisma } = prismaWith({ [SOURCE]: hold({ id: SOURCE, visibility: 'PUBLIC', deletedAt: EARLIER }) });
    expect(await mayRepostSource(prisma, SOURCE, OTHER)).toBe(false);
  });

  it('refuse un identifiant malformé sans interroger la base', async () => {
    const { prisma, findFirst } = prismaWith({});
    expect(await mayRepostSource(prisma, 'tmp_1', OTHER)).toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
