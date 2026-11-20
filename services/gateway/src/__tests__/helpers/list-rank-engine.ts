/**
 * **LE MOTEUR DES TÉMOINS DU RANG DE LISTE** — un seul, pour les cinq suites qui
 * exercent `loadRankedConversationPage` (#19881).
 *
 * ## Pourquoi un site unique
 *
 * Les quatre suites de rang portaient chacune son propre double, et ils
 * DIVERGEAIENT sur ce qu'ils honorent. Celui de
 * `conversation-list-rank-populated-activity` fixait `skip` à zéro pour le flux
 * « par activité » — la production n'en passe pas — ce qui rendait
 * **indétectable** la mutation « ajouter `skip: offset` au flux B », laquelle
 * sert la mauvaise ligne. Et `skip` n'étant pas déclaré dans
 * `RankedPagePrisma`, le compilateur ne la voyait pas davantage.
 *
 * > **Un double de test ment par ce qu'il RÉPOND, par ce qu'il ACCEPTE, et par
 * > ce qu'il IGNORE.** La troisième forme est la plus discrète : le témoin qu'il
 * > sert PASSE, et la régression qui ajoute le levier ignoré passe avec lui. Un
 * > double de requête honore donc TOUS les leviers de la requête — `where`,
 * > `orderBy`, `skip`, `take` — y compris ceux que la production n'utilise pas
 * > aujourd'hui, qui sont précisément ceux dont l'apparition ne rougit nulle
 * > part.
 *
 * ## Ce qu'il honore
 *
 * - `where` par `matchesMongoWhere` — l'absence d'une clé n'est pas `null` ;
 * - `orderBy` en **liste ORDONNÉE de clés**, une seule ou plusieurs, chacune
 *   `asc` ou `desc`, dates comme chaînes. C'est ce qui permet d'exercer le
 *   départage sur `id` : MongoDB compare un ObjectId octet par octet, donc
 *   l'ordre lexicographique de son hexadécimal ;
 * - `skip` et `take`, sur les deux flux.
 *
 * Une clé d'`orderBy` qu'AUCUNE ligne ne porte est triée sans effet, et c'est
 * voulu : le flux « par activité » trie sur `lastActivityAt` même quand pas une
 * ligne ne la porte — l'état de TOUTE conversation avant #19800, et ce que
 * `conversation-list-rank-absent-activity` exerce exprès. Faire jeter le moteur
 * là aurait transformé un cas de production en échec de harnais.
 */
import { matchesMongoWhere, type MongoDocument } from './mongo-where';

export interface RequeteTriee {
  readonly where?: unknown;
  readonly orderBy?: unknown;
  readonly skip?: number;
  readonly take?: number;
}

type Sens = 'asc' | 'desc';
type Cle = readonly [string, Sens];

/** `{ a: 'desc' }` ou `[{ a: 'desc' }, { id: 'desc' }]` → une liste ordonnée de clés. */
function clesDe(orderBy: unknown): Cle[] {
  const blocs = Array.isArray(orderBy) ? orderBy : orderBy === undefined || orderBy === null ? [] : [orderBy];
  return blocs.flatMap((bloc) =>
    Object.entries(bloc as Record<string, Sens>).map(([champ, sens]) => [champ, sens] as Cle),
  );
}

function compare(gauche: unknown, droite: unknown): number {
  if (gauche instanceof Date && droite instanceof Date) return gauche.getTime() - droite.getTime();
  if (typeof gauche === 'string' && typeof droite === 'string') return gauche < droite ? -1 : gauche > droite ? 1 : 0;
  if (gauche === undefined || gauche === null) return droite === undefined || droite === null ? 0 : -1;
  if (droite === undefined || droite === null) return 1;
  throw new Error(`moteur de rang: deux valeurs incomparables (${String(gauche)}, ${String(droite)})`);
}

export function moteurDeRang<Ligne extends MongoDocument>(lignes: readonly Ligne[]) {
  const lire = (requete: RequeteTriee): Ligne[] => {
    const cles = clesDe(requete.orderBy);
    const retenues = lignes.filter((l) => matchesMongoWhere(l, requete.where as MongoDocument));
    const triees = [...retenues].sort((a, b) => {
      for (const [champ, sens] of cles) {
        const ordre = compare(a[champ], b[champ]) * (sens === 'desc' ? -1 : 1);
        if (ordre !== 0) return ordre;
      }
      return 0;
    });
    const depart = requete.skip ?? 0;
    const combien = requete.take ?? triees.length;
    return triees.slice(depart, depart + combien);
  };

  return {
    lire,
    /** Le `prisma` que `loadRankedConversationPage` attend (clés seules). */
    prisma: { conversation: { findMany: async (args: RequeteTriee) => lire(args) } },
    /** Le `readRows` que la route fournit (lignes complètes). */
    readRows: async (requete: RequeteTriee) => lire(requete),
  };
}
