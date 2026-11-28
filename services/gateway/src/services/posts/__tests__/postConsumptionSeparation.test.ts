/**
 * #20717 — LE VERDICT DE LECTURE D'UNE PUBLICATION LIT LE BLOCAGE.
 *
 * `viewerAudience.ts` DÉLÈGUE le blocage des accès unitaires à
 * `canUserConsumePost` (décision de #7184, écrite sur le site). Mesuré le
 * 2026-11-27 : le délégataire ne lisait aucun blocage, et la publication
 * `PUBLIC` d'un auteur qui vous a bloqué passait les huit portes que ce verdict
 * gouverne — `post:join` en tête.
 *
 * Les témoins ci-dessous portent sur les QUATRE propriétés du verdict, et
 * chacun tombe sous une mutation DIFFÉRENTE :
 *
 * 1. la séparation refuse, DANS LES DEUX SENS, sur `PUBLIC` — le rang où la
 *    règle n'avait aucun autre moyen de se faire respecter (une visibilité
 *    `FRIENDS` est déjà refusée par l'amitié rompue, donc un témoin posé là ne
 *    pourrait pas distinguer les deux causes : c'est la leçon 261 appliquée au
 *    choix du rang) ;
 * 2. l'AUTEUR n'est jamais séparé de son propre contenu, et son verdict ne
 *    coûte AUCUNE lecture ;
 * 3. FERMÉ sur l'échec — une lecture qui ne conclut pas refuse ;
 * 4. l'ensemble FOURNI par un appelant de lot est honoré, et son ABSENCE fait
 *    lire le verdict lui-même (polarité fail-safe : l'omission coûte une
 *    requête, elle ne désarme pas la garde).
 */
import { describe, it, expect, jest } from '@jest/globals';
import { PostVisibility } from '@meeshy/shared/prisma/client';
import { canUserConsumePost, canUserInteractWithPost, type PostVisibilityRecord } from '../postVisibility';

const AUTHOR = 'author-1';
const READER = 'reader-1';

const makePost = (overrides: Partial<PostVisibilityRecord> = {}): PostVisibilityRecord => ({
  id: '507f1f77bcf86cd799439011',
  authorId: AUTHOR,
  visibility: PostVisibility.PUBLIC,
  visibilityUserIds: [],
  expiresAt: null,
  communityId: null,
  ...overrides,
});

/**
 * Le double porte les DEUX colonnes de la loi de blocage, parce que la loi les
 * lit toutes les deux : `blockedUserIds` de l'auteur (« il m'a bloqué ») et
 * celui du lecteur (« je l'ai bloqué »). Un double qui n'en sert qu'une rend
 * le second sens intestable — et c'est le sens qu'aucune autre règle ne couvre.
 */
const makePrisma = (options: { readonly blockedBy?: readonly string[]; readonly blocking?: readonly string[] } = {}) => {
  const blockedBy = new Set(options.blockedBy ?? []);
  const blocking = new Set(options.blocking ?? []);
  return {
    user: {
      findFirst: jest.fn<any>(async ({ where }: any) => {
        const [mine, theirs] = where.OR as ReadonlyArray<{ id: string; blockedUserIds: { has: string } }>;
        if (blocking.has(mine.blockedUserIds.has) && mine.id === READER) return { id: mine.id };
        if (blockedBy.has(theirs.id)) return { id: theirs.id };
        return null;
      }),
      findMany: jest.fn<any>().mockResolvedValue([]),
      findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [] }),
    },
    friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    userRelation: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
    community: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    communityMember: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
    postMention: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    post: { findFirst: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
    postComment: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  };
};

describe('#20717 — canUserConsumePost et la séparation par blocage', () => {
  it('refuse une publication PUBLIC dont l’AUTEUR a bloqué le lecteur', async () => {
    const prisma = makePrisma({ blockedBy: [AUTHOR] });
    expect(await canUserConsumePost(prisma as any, makePost(), READER)).toBe(false);
  });

  it('refuse une publication PUBLIC dont l’auteur est bloqué PAR LE LECTEUR', async () => {
    const prisma = makePrisma({ blocking: [AUTHOR] });
    expect(await canUserConsumePost(prisma as any, makePost(), READER)).toBe(false);
  });

  it('sert la publication quand aucun blocage ne sépare', async () => {
    const prisma = makePrisma();
    expect(await canUserConsumePost(prisma as any, makePost(), READER)).toBe(true);
  });

  it('sert l’AUTEUR son propre contenu sans lire aucune séparation', async () => {
    const prisma = makePrisma({ blockedBy: [AUTHOR] });
    expect(await canUserConsumePost(prisma as any, makePost({ visibility: PostVisibility.PRIVATE }), AUTHOR)).toBe(true);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  /**
   * L'EXEMPTION DE L'AUTEUR EST UNE PROPRIÉTÉ DE CETTE PORTE, PAS DE SON
   * COLLABORATEUR — et ce témoin est le seul endroit où elle peut tomber.
   *
   * Mesuré en mutant la ligne `if (authorId === userId) return false` : le
   * témoin ci-dessus restait VERT, parce que `isBlockedWithAny` filtre
   * lui-même les ids égaux à l'acteur, donc la mutation ne changeait AUCUN
   * comportement. Un 0 rouge ne disait pas « la garde est inutile », il disait
   * « ma mutation n'exprimait pas ce qu'elle prétendait » (#20430).
   *
   * Le chemin où la ligne décide seule est celui du LOT : si l'ensemble fourni
   * contenait l'auteur, le verdict refuserait à quelqu'un son PROPRE contenu.
   * `getBlockedUserIdsAmong` ne le produit pas aujourd'hui (il écarte l'id du
   * lecteur) — c'est exactement pourquoi l'invariant doit vivre À LA PORTE et
   * non dans la discipline de ses appelants.
   */
  it('n’applique JAMAIS un ensemble fourni à l’auteur lui-même', async () => {
    const prisma = makePrisma();
    const verdict = await canUserConsumePost(prisma as any, makePost(), AUTHOR, {
      separatedAuthorIds: new Set([AUTHOR]),
    });
    expect(verdict).toBe(true);
  });

  it('refuse quand la lecture de séparation ÉCHOUE (fermé sur l’échec)', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst.mockRejectedValue(new Error('mongo down'));
    expect(await canUserConsumePost(prisma as any, makePost(), READER)).toBe(false);
  });

  it('ne lit RIEN pour un visiteur sans compte, et garde la règle PUBLIC', async () => {
    const prisma = makePrisma({ blockedBy: [AUTHOR] });
    expect(await canUserConsumePost(prisma as any, makePost(), undefined)).toBe(true);
    expect(await canUserConsumePost(prisma as any, makePost({ visibility: PostVisibility.PRIVATE }), undefined)).toBe(false);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  describe('l’ensemble fourni par un appelant de LOT', () => {
    it('est honoré sans aucune lecture de séparation', async () => {
      const prisma = makePrisma();
      const verdict = await canUserConsumePost(prisma as any, makePost(), READER, {
        separatedAuthorIds: new Set([AUTHOR]),
      });
      expect(verdict).toBe(false);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('sert quand l’ensemble fourni ne contient pas l’auteur, sans lire', async () => {
      const prisma = makePrisma({ blockedBy: [AUTHOR] });
      const verdict = await canUserConsumePost(prisma as any, makePost(), READER, {
        separatedAuthorIds: new Set(['quelqu-un-d-autre']),
      });
      expect(verdict).toBe(true);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('fait lire le verdict lui-même quand l’ensemble est ABSENT', async () => {
      const prisma = makePrisma({ blockedBy: [AUTHOR] });
      expect(await canUserConsumePost(prisma as any, makePost(), READER, {})).toBe(false);
      expect(prisma.user.findFirst).toHaveBeenCalled();
    });
  });

  /**
   * Le verdict d'INTERACTION garde sa règle : l'asymétrie « voir ⊇ interagir »
   * (décision 2026-07-08) n'est pas touchée, et ses appelants portent DÉJÀ leur
   * propre lecture de blocage à frais neufs (`PostReactionService`,
   * `commentHome`). Ce témoin gèle cette frontière : y ajouter la séparation
   * ferait payer deux lectures aux deux chemins chauds du dépôt.
   */
  it('laisse le verdict d’INTERACTION hors de ce lot', async () => {
    const prisma = makePrisma({ blockedBy: [AUTHOR] });
    expect(await canUserInteractWithPost(prisma as any, makePost(), READER)).toBe(true);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
