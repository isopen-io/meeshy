/**
 * LE GROUPE EXACT D'UN APPEL NE DÉPEND PLUS DE LA FENÊTRE (#19906).
 *
 * `findExactCallGroups` cherche les groupes dont l'ensemble des membres actifs
 * est EXACTEMENT celui de l'appel. La lecture, elle, ne bornait que par le
 * SUR-ENSEMBLE — « les groupes qui CONTIENNENT ces membres » — et l'exactitude
 * se jugeait en mémoire, APRÈS une fenêtre de vingt lignes :
 *
 *   lecture : les 20 premiers par rang, parmi tous les SUR-ENSEMBLES
 *   filtre  : ceux dont l'ensemble est exactement le bon
 *
 * Un groupe appariant exactement mais rangé derrière vingt sur-ensembles plus
 * récents était donc INVISIBLE — et `reserveTarget` en créait alors un neuf
 * (`callConversationRebranch.ts`), sans erreur ni trace : un DOUBLON de groupe
 * pour un appel qui devait rejoindre l'existant.
 *
 * ─── Ce que le correctif fait, et pourquoi il ne MESURE rien ────────────────
 *
 * L'issue offrait deux leviers. Celui retenu porte l'exactitude EN BASE, ce qui
 * ne demande aucune mesure de production : à l'intersection « tous les membres
 * visés sont actifs ici » s'ajoute son complément, « aucun membre actif d'ici
 * n'est hors de la cible ». Les deux ensemble SONT l'égalité des ensembles.
 *
 * La fenêtre reste, et elle est désormais PROUVÉE inoffensive : ce qu'elle
 * tronque est la queue d'un ensemble DÉJÀ exact, ordonné par le rang sur lequel
 * l'appelant choisit — et la preuve du top-K de `highestRanked.ts` garantit que
 * les vingt premiers par rang sont bien les vingt premiers. `reserveTarget`
 * consomme dans cet ordre et s'arrête au premier dont la réservation se prend.
 *
 * ─── Le filtre de base NARROW, il ne REMPLACE pas ───────────────────────────
 *
 * `sameSet` en mémoire reste autoritatif, et c'est délibéré : un participant
 * SANS compte n'a pas de clé `userId`, et toute négation sous MongoDB exige la
 * clé PRÉSENTE (#8309). Le `none` dit donc l'absence dans une branche POSITIVE
 * (`isSet: false`) pour que l'anonyme soit vu comme un intrus — mais même si
 * une forme de document lui échappait, le filtre en mémoire le rattraperait.
 * Un filtre de base qui ne peut que RESSERRER ne peut pas introduire de faux
 * positif ; c'est ce qui rend ce lot sûr sans base de données sous la main.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { findConversationsIn, type DirectDoc } from '../../../helpers/direct-pair-world';

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const CALL = '507f1f77bcf86cd7994390c3';
const A = '507f1f77bcf86cd799439001';
const B = '507f1f77bcf86cd799439002';
const C = '507f1f77bcf86cd799439003';
const EXACT = '507f1f77bcf86cd7994390e1';
const TARGET = [A, B, C];

const hex = (n: number): string => `507f1f77bcf86cd7994${(0x39100 + n).toString(16)}`;

const group = (id: string, at: Date, userIds: readonly string[]): DirectDoc => ({
  id,
  title: null,
  type: 'group',
  isActive: true,
  lastMessageAt: at,
  participants: userIds.map((userId) => (userId === 'anonyme' ? { isActive: true } : { userId, isActive: true })) as never,
});

const candidates = async (docs: readonly DirectDoc[], memberUserIds: readonly string[] = TARGET) => {
  const conversations = findConversationsIn(docs);
  const findMany = jest.fn(async (args: never) => conversations.findMany(args));
  const prisma = { conversation: { findMany }, callSession: { findMany: jest.fn(async () => []) } };
  const { findExactCallGroups } = await import('../../../../services/calls/callGroupConversation');
  const found = await findExactCallGroups(prisma as never, { callId: CALL, memberUserIds: [...memberUserIds] });
  return { ids: found.map((row) => row.id), findMany };
};

/** Vingt-cinq SUR-ENSEMBLES plus récents que le groupe exact : plus que la fenêtre n'en lit. */
const vingtCinqSurEnsemblesPlusRecents = (): readonly DirectDoc[] =>
  Array.from({ length: 25 }, (_, index) =>
    group(hex(index), new Date(Date.UTC(2026, 10, 18, 0, index)), [...TARGET, hex(900 + index)])
  );

describe('un groupe exact rangé derrière plus de vingt sur-ensembles reste trouvable (#19906)', () => {
  it('il est rendu, là où la fenêtre le cachait et faisait créer un doublon', async () => {
    const { ids } = await candidates([
      ...vingtCinqSurEnsemblesPlusRecents(),
      group(EXACT, new Date('2026-11-01T10:00:00Z'), TARGET),
    ]);
    expect(ids).toEqual([EXACT]);
  });

  it('le `where` dit l’exactitude lui-même : tous les visés DEDANS, aucun autre actif', async () => {
    const { findMany } = await candidates([group(EXACT, new Date('2026-11-01T10:00:00Z'), TARGET)]);
    const where = (findMany.mock.calls[0][0] as unknown as { where: Record<string, unknown> }).where;
    expect(where.AND).toEqual(expect.arrayContaining(
      TARGET.map((userId) => ({ participants: { some: { userId, isActive: true } } }))
    ));
    expect(where.participants).toEqual({
      none: {
        isActive: true,
        OR: [{ userId: { isSet: false } }, { userId: null }, { userId: { notIn: TARGET } }],
      },
    });
    const eligibilite = JSON.stringify(where.AND);
    expect(eligibilite).toContain('closedAt');
    expect(eligibilite).toContain('deletedAt');
    expect(eligibilite).toContain('communityId');
    expect(eligibilite).toContain('isSet');
  });

  it('un sur-ensemble n’est jamais rendu, même seul et au plus haut rang', async () => {
    const { ids } = await candidates([group(hex(1), new Date('2026-11-18T10:00:00Z'), [...TARGET, hex(999)])]);
    expect(ids).toEqual([]);
  });

  it('un sous-ensemble n’est jamais rendu — le `some` de chaque membre visé le refuse', async () => {
    const { ids } = await candidates([group(hex(2), new Date('2026-11-18T10:00:00Z'), [A, B])]);
    expect(ids).toEqual([]);
  });

  it('un groupe dont un membre actif n’a PAS de compte est un sur-ensemble, pas un groupe exact', async () => {
    const { ids } = await candidates([group(hex(3), new Date('2026-11-18T10:00:00Z'), [...TARGET, 'anonyme'])]);
    expect(ids).toEqual([]);
  });

  /**
   * **Le témoin ci-dessus passe pour une raison autre que celle qu'il annonce**, et
   * ce n'est pas réparable à son échelle : `sameSet` rejette l'anonyme sur la
   * LONGUEUR, donc il reste vert même si la branche `{ userId: { isSet: false } }`
   * disparaît du `where`. Il atteste le filtre mémoire, pas la branche.
   *
   * Ce que cette branche décide VRAIMENT est une place dans la FENÊTRE. Sans elle,
   * l'anonyme n'apparie ni `{ userId: null }` (clé absente) ni
   * `{ userId: { notIn } }` (toute négation exige la clé présente, #8309) : le
   * `none` ne le voit pas comme intrus, son groupe est RETENU en base, et vingt de
   * ces groupes remplissent la fenêtre que le groupe exact attendait.
   *
   * Un témoin de branche de filtre de base se construit donc SOUS PRESSION de
   * fenêtre — c'est le seul régime où le filtre de base a un effet observable.
   */
  it('vingt groupes à membre anonyme ne volent pas la fenêtre du groupe exact', async () => {
    const anonymes = Array.from({ length: 20 }, (_, index) =>
      group(hex(200 + index), new Date(Date.UTC(2026, 10, 18, 1, index)), [...TARGET, 'anonyme'])
    );
    const { ids } = await candidates([...anonymes, group(EXACT, new Date('2026-11-01T10:00:00Z'), TARGET)]);
    expect(ids).toEqual([EXACT]);
  });

  /**
   * L'ÉLIGIBILITÉ descend elle aussi en base pour ce qu'elle peut y descendre
   * EXACTEMENT (#19906 bis) : `closedAt`, `deletedAt` et `communityId` sont trois
   * `DateTime?`/`String?`, donc `unsetOrNull` les dit sans amputer. Sans elles, le
   * `where` ne disait que l'exactitude des MEMBRES, `isPlainLiveGroup` jugeait
   * l'éligibilité APRÈS la fenêtre, et vingt salons de communauté aux membres
   * exacts suffisaient à cacher le groupe ordinaire — le défaut même que ce lot
   * déclare fermé, à une probabilité plus basse.
   */
  it('vingt salons de communauté aux membres exacts ne volent pas la fenêtre', async () => {
    const salons = Array.from({ length: 20 }, (_, index) => ({
      ...group(hex(300 + index), new Date(Date.UTC(2026, 10, 18, 2, index)), TARGET),
      communityId: '507f1f77bcf86cd7994390f1',
    }));
    const { ids } = await candidates([...salons, group(EXACT, new Date('2026-11-01T10:00:00Z'), TARGET)]);
    expect(ids).toEqual([EXACT]);
  });

  it('vingt groupes mis au rebut aux membres exacts ne volent pas la fenêtre', async () => {
    const rebut = Array.from({ length: 20 }, (_, index) => ({
      ...group(hex(400 + index), new Date(Date.UTC(2026, 10, 18, 3, index)), TARGET),
      deletedAt: new Date('2026-11-17T10:00:00Z'),
      closedAt: new Date('2026-11-17T10:00:00Z'),
    }));
    const { ids } = await candidates([...rebut, group(EXACT, new Date('2026-11-01T10:00:00Z'), TARGET)]);
    expect(ids).toEqual([EXACT]);
  });

  /**
   * **Ce que la fenêtre peut ENCORE tronquer, et pourquoi on le laisse là.**
   * `isActive: false` et `isAnnouncementChannel: true` sont des booléens REQUIS au
   * schéma : Prisma n'offre pas d'`isSet` dessus, et une égalité nue amputerait un
   * document d'avant la colonne — le piège qu'on vient de fermer deux fois. Le
   * RÉGIME, lui, ne descend pas pour une autre raison : `isPlainLiveGroup` admet un
   * mode INCONNU (`!isEndToEndMode`) là où `SERVER_READABLE_REGIME_FILTER` le
   * refuse, donc le descendre changerait la POLITIQUE d'un appel de groupe — une
   * décision qui ne se prend pas au détour d'un lot de fenêtre.
   */
  it('un groupe clos par `isActive: false` reste écarté — en mémoire, après la fenêtre', async () => {
    const { ids } = await candidates([{ ...group(hex(5), new Date('2026-11-18T10:00:00Z'), TARGET), isActive: false }]);
    expect(ids).toEqual([]);
  });

  it('un groupe chiffré de bout en bout reste écarté — en mémoire, après la fenêtre', async () => {
    const { ids } = await candidates([{ ...group(hex(6), new Date('2026-11-18T10:00:00Z'), TARGET), encryptionMode: 'e2ee' }]);
    expect(ids).toEqual([]);
  });

  it('les deux flux du rang gardent la MÊME fenêtre — ce que la preuve du top-K exige', async () => {
    const { findMany } = await candidates([group(EXACT, new Date('2026-11-01T10:00:00Z'), TARGET)]);
    const reads = findMany.mock.calls.map((call) => call[0] as unknown as { orderBy: unknown; take: number });
    expect(reads.map((read) => read.orderBy)).toEqual([
      [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      [{ lastActivityAt: 'desc' }, { id: 'desc' }],
    ]);
    expect(new Set(reads.map((read) => read.take))).toEqual(new Set([20]));
  });
});
