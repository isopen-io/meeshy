/**
 * #20717 — LA PORTE DE CONSOMMATION LIT LA SÉPARATION, ET LE CHEMIN DE LOT NE
 * LA LIT QU'UNE FOIS.
 *
 * Deux propriétés DISJOINTES, et chacune a besoin de son témoin :
 *
 * 1. **La règle.** Le favori, l'impression et le partage sont des gestes de
 *    LECTEUR, gardés par `canUserConsumePost` (en-tête du module). Un blocage,
 *    dans un sens ou dans l'autre, les refuse désormais — y compris sur une
 *    publication `PUBLIC`, le seul rang où ce témoin peut tomber.
 *
 * 2. **Le COÛT.** `consumablePostAuthors` est appelé à chaque défilement sur
 *    jusqu'à cinquante publications, et son en-tête promet qu'« un post PUBLIC
 *    ou dont on est l'auteur ne coûte aucune requête de plus ». La séparation
 *    étant une question par LECTEUR et non par publication, elle se lit UNE
 *    fois pour tous les auteurs distincts du lot. Le témoin COMPTE les
 *    requêtes : sans la passe unique, le verdict les lirait lui-même, une par
 *    publication, et la promesse serait perdue sans qu'aucune assertion de
 *    comportement ne bouge.
 *
 * > Une garde juste qui coûte N requêtes sur un chemin de défilement est une
 * > lenteur, donc un bug (§ Roadmap, dimension 2) — pas une dette. D'où un
 * > témoin de REQUÊTES à côté du témoin de RÈGLE : aucun des deux ne subsume
 * > l'autre.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { mayConsumePost, filterConsumablePostIds } from '../../../../routes/posts/postConsumptionGate';

const VIEWER = 'u-viewer';
const AUTHOR = 'u-author';
const OTHER_AUTHOR = 'u-other-author';

const POST_A = '507f1f77bcf86cd799439011';
const POST_B = '507f1f77bcf86cd799439012';
const POST_C = '507f1f77bcf86cd799439013';

type Blocks = { readonly blockedBy?: readonly string[]; readonly blocking?: readonly string[] };

/**
 * Le double compte ses lectures de `user` — c'est la seule façon de voir la
 * différence entre « une passe pour le lot » et « une passe par publication »,
 * les deux rendant le même verdict.
 */
function makePrisma(blocks: Blocks = {}, options: { readonly failUserReads?: boolean } = {}) {
  const blockedBy = new Set(blocks.blockedBy ?? []);
  const blocking = new Set(blocks.blocking ?? []);
  const rows = [
    { id: POST_A, authorId: AUTHOR, visibility: 'PUBLIC', visibilityUserIds: [], expiresAt: null, communityId: null },
    { id: POST_B, authorId: AUTHOR, visibility: 'PUBLIC', visibilityUserIds: [], expiresAt: null, communityId: null },
    { id: POST_C, authorId: OTHER_AUTHOR, visibility: 'PUBLIC', visibilityUserIds: [], expiresAt: null, communityId: null },
  ];
  const userReads = { count: 0 };
  const guard = () => {
    userReads.count += 1;
    if (options.failUserReads === true) throw new Error('mongo down');
  };
  return {
    userReads,
    prisma: {
      post: {
        findFirst: async ({ where }: any) => rows.find((r) => r.id === where?.id) ?? null,
        findMany: async ({ where }: any) => {
          const ids: string[] = where?.id?.in ?? [];
          return rows.filter((r) => ids.includes(r.id));
        },
      },
      user: {
        // « qui, parmi ces candidats, m'a bloqué ? » — le sens que seul le
        // propriétaire de la liste connaît.
        findMany: async ({ where }: any) => {
          guard();
          const candidates: string[] = where?.id?.in ?? [];
          return candidates.filter((id) => blockedBy.has(id)).map((id) => ({ id }));
        },
        // « qui ai-je bloqué ? »
        findUnique: async () => {
          guard();
          return { blockedUserIds: [...blocking] };
        },
        // Le verdict UNITAIRE : les deux sens en une requête indexée.
        findFirst: async ({ where }: any) => {
          guard();
          const [mine, theirs] = where.OR as ReadonlyArray<{ id: string; blockedUserIds: { has: string } }>;
          if (mine.id === VIEWER && blocking.has(mine.blockedUserIds.has)) return { id: mine.id };
          if (blockedBy.has(theirs.id)) return { id: theirs.id };
          return null;
        },
      },
      friendRequest: { findFirst: async () => null },
      userRelation: { findUnique: async () => null, findMany: async () => [] },
      communityMember: { findMany: async () => [], findFirst: async () => null },
      participant: { findMany: async () => [], findFirst: async () => null },
      postMention: { findFirst: async () => null },
      postComment: { findFirst: async () => null },
      community: { findFirst: async () => null },
    } as any,
  };
}

describe('#20717 — la porte de consommation et la séparation par blocage', () => {
  describe('le geste UNITAIRE (favori, impression, partage)', () => {
    it('refuse une publication PUBLIC dont l’auteur a bloqué le lecteur', async () => {
      const { prisma } = makePrisma({ blockedBy: [AUTHOR] });
      await expect(mayConsumePost(prisma, POST_A, VIEWER)).resolves.toBe(false);
    });

    it('refuse une publication PUBLIC dont l’auteur est bloqué PAR le lecteur', async () => {
      const { prisma } = makePrisma({ blocking: [AUTHOR] });
      await expect(mayConsumePost(prisma, POST_A, VIEWER)).resolves.toBe(false);
    });

    it('admet la même publication quand aucun blocage ne sépare (contrôle positif)', async () => {
      const { prisma } = makePrisma();
      await expect(mayConsumePost(prisma, POST_A, VIEWER)).resolves.toBe(true);
    });
  });

  describe('le chemin de LOT', () => {
    it('écarte les publications des auteurs séparés et GARDE les autres', async () => {
      const { prisma } = makePrisma({ blockedBy: [AUTHOR] });
      const allowed = await filterConsumablePostIds(prisma, [POST_A, POST_B, POST_C], VIEWER);
      expect([...allowed]).toEqual([POST_C]);
    });

    it('garde tout le lot quand aucun blocage ne sépare (contrôle positif)', async () => {
      const { prisma } = makePrisma();
      const allowed = await filterConsumablePostIds(prisma, [POST_A, POST_B, POST_C], VIEWER);
      expect([...allowed].sort()).toEqual([POST_A, POST_B, POST_C].sort());
    });

    /**
     * LE TÉMOIN DE COÛT. `getBlockedUserIdsAmong` fait DEUX lectures de `user`,
     * quel que soit le nombre de publications ou d'auteurs. Trois publications,
     * deux auteurs distincts ⇒ 2, jamais 3.
     *
     * Mutation qui le fait tomber : retirer la passe unique de
     * `consumablePostAuthors` et laisser le verdict lire lui-même — le
     * comportement reste JUSTE, et ce compte passe à 3.
     */
    it('ne lit la séparation qu’UNE fois pour tout le lot', async () => {
      const { prisma, userReads } = makePrisma();
      await filterConsumablePostIds(prisma, [POST_A, POST_B, POST_C], VIEWER);
      expect(userReads.count).toBe(2);
    });

    it('ne lit RIEN quand le lot est vide', async () => {
      const { prisma, userReads } = makePrisma();
      await filterConsumablePostIds(prisma, [], VIEWER);
      expect(userReads.count).toBe(0);
    });

    /**
     * FERMÉ sur l'échec, et sur le lot ENTIER : une lecture de séparation qui
     * ne conclut pas ne permet de servir AUCUN id, puisqu'on ne sait plus
     * lesquels sont séparés. Servir le reste serait un fail-closed PARTIEL —
     * ce que #20236 interdit — sur une porte dont rien d'autre ne tient la
     * règle.
     */
    it('rend un ensemble VIDE quand la lecture de séparation échoue', async () => {
      const { prisma } = makePrisma({}, { failUserReads: true });
      const allowed = await filterConsumablePostIds(prisma, [POST_A, POST_B, POST_C], VIEWER);
      expect([...allowed]).toEqual([]);
    });
  });
});
