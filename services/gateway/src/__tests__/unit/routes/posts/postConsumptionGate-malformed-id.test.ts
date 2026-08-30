/**
 * #4044 — un identifiant qui n'est pas un ObjectId RÉPOND, il ne lève pas.
 *
 * Le doc-comment de `mayConsumePost` énonce déjà l'invariant du module :
 *
 * > `false` couvre indistinctement « absent », « supprimé » et « hors
 * > audience » — les trois se répondent pareil, sans quoi la route redevient
 * > l'oracle d'existence que ce lot ferme.
 *
 * Un identifiant MALFORMÉ est le quatrième membre de cette famille, et c'était
 * le seul à en sortir : Prisma lève `P2023` (« Malformed ObjectID ») avant que
 * la moindre règle d'audience ne se prononce, et la route rend un 500 là où
 * elle devait rendre un 404.
 *
 * Ce n'est pas un cas théorique. Le client iOS fabrique des identifiants LOCAUX
 * pour ce qui n'est pas encore publié (`pending_<uuid>`, `StoryPublishQueue`),
 * et une story ouverte pendant sa publication en envoyait un. Dix-neuf lignes
 * d'outbox `markStoryViewed` épuisées ont été relevées sur un appareil réel.
 * Le client refuse désormais de les émettre — mais le parc porte des versions
 * déjà installées qui continueront de le faire pendant des mois, et rien
 * n'empêche un autre client d'en envoyer un.
 *
 * **Le lot est le cas le plus grave, et il ne se voit pas depuis le cas
 * unitaire** : `filterConsumablePostIds` interroge un `findMany` borné par
 * `{ id: { in: [...] } }`. UN identifiant malformé y fait lever la requête
 * ENTIÈRE — cinquante impressions de défilement perdues pour une story en
 * cours de publication.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { mayConsumePost, filterConsumablePostIds } from '../../../../routes/posts/postConsumptionGate';

const VIEWER = 'u-viewer';
const AUTHOR = 'u-author';

/** Deux ObjectId valides — 24 caractères hexadécimaux. */
const PUBLIC_POST = '507f1f77bcf86cd799439011';
const OTHER_POST = '507f1f77bcf86cd799439012';

/** Ce que le client fabrique pour un contenu pas encore publié. */
const PENDING_LOCAL_ID = 'pending_5B2A1C4E-9F3D-4A7B-8C1E-2D6F0A9B3C5D';

/**
 * Un double qui se comporte comme MongoDB : toute requête portant un id qui
 * n'est pas un ObjectId LÈVE, exactement comme Prisma.
 *
 * C'est ce qui rend le témoin honnête. Un double tolérant rendrait simplement
 * « aucun post », le test passerait au vert, et il ne prouverait RIEN sur la
 * garde — il prouverait seulement que le double est gentil.
 */
function makePrisma() {
  const rows = [
    { id: PUBLIC_POST, authorId: AUTHOR, visibility: 'PUBLIC', visibilityUserIds: [], expiresAt: null },
    { id: OTHER_POST, authorId: AUTHOR, visibility: 'PUBLIC', visibilityUserIds: [], expiresAt: null },
  ];
  const assertObjectId = (id: unknown) => {
    if (typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) {
      throw new Error(`Inconsistent column data: Malformed ObjectID: provided hex string ${String(id)}`);
    }
  };
  return {
    post: {
      findFirst: async ({ where }: any) => {
        assertObjectId(where?.id);
        return rows.find((r) => r.id === where.id) ?? null;
      },
      findMany: async ({ where }: any) => {
        const ids: unknown[] = where?.id?.in ?? [];
        ids.forEach(assertObjectId);
        return rows.filter((r) => (ids as string[]).includes(r.id));
      },
    },
  } as any;
}

describe('#4044 — un identifiant malformé sort par la même porte que « absent »', () => {

  it('mayConsumePost rend false, sans interroger la base', async () => {
    await expect(mayConsumePost(makePrisma(), PENDING_LOCAL_ID, VIEWER)).resolves.toBe(false);
  });

  /**
   * Contrôle positif : sans lui, un `false` obtenu parce que la garde refuse
   * TOUT passerait pour la bonne règle.
   */
  it('mayConsumePost admet toujours un post public dont l\'identifiant est bien formé', async () => {
    await expect(mayConsumePost(makePrisma(), PUBLIC_POST, VIEWER)).resolves.toBe(true);
  });

  it('filterConsumablePostIds écarte l\'identifiant malformé et GARDE le reste du lot', async () => {
    const allowed = await filterConsumablePostIds(
      makePrisma(),
      [PUBLIC_POST, PENDING_LOCAL_ID, OTHER_POST],
      VIEWER,
    );

    expect([...allowed].sort()).toEqual([PUBLIC_POST, OTHER_POST].sort());
  });

  /**
   * La forme dégénérée : un lot qui ne contient QUE des identifiants malformés
   * ne doit pas lever non plus — il doit rendre l'ensemble vide, comme un lot
   * dont aucun post n'existe.
   */
  it('filterConsumablePostIds rend un ensemble vide quand le lot est entièrement malformé', async () => {
    const allowed = await filterConsumablePostIds(
      makePrisma(),
      [PENDING_LOCAL_ID, 'cid_not-an-object-id'],
      VIEWER,
    );

    expect(allowed.size).toBe(0);
  });
});
