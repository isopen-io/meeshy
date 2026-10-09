/**
 * Un `findFirst` qui honore son `where` — Y COMPRIS celui des relations
 * INCLUSES, parce que c'est là que vit la décision d'autorisation (#4585).
 *
 * ─── Ce qu'un double inconditionnel ne peut pas dire ────────────────────────
 *
 * `mockResolvedValue(ligne)` rend la ligne quel que soit le filtre demandé.
 * Inoffensif sur une lecture ordinaire ; trou silencieux dès que **la requête
 * EST la garde**. Mesuré sur `links-admin.test.ts` : on pouvait élargir, en
 * production, le `where` qui restreint la liste des participants à l'APPELANT
 * — et les cinquante témoins restaient verts, dont les sept qui portent
 * nommément sur la branche ADMIN/MODERATOR de `DELETE /links/:linkId`.
 * Un témoin qui ne peut pas tomber n'est pas une garde : c'est une
 * affirmation de couverture que rien ne soutient.
 *
 * ─── Pourquoi le `where` de la RELATION, et pas seulement celui de la ligne ─
 *
 * `loadShareLinkForManagement` (`routes/links/management.ts`) ne décide pas
 * dans son `where` de tête : elle charge le lien par son identifiant PUBLIC,
 * puis lit `link.conversation.participants` — une liste que Prisma a filtrée
 * pour elle par `include.conversation.include.participants.where`. Le rang est
 * ensuite jugé par `actorHasMinimumRole` sur cette liste. **Deux des trois
 * moitiés de la garde vivent donc dans un `where` IMBRIQUÉ**, et un double qui
 * n'honore que le `where` de tête les laisse toutes deux sans témoin :
 *
 * - `userId` retiré ⇒ le rang d'un AUTRE membre décide pour l'appelant ;
 * - `isActive: true` retiré ⇒ un administrateur SORTI garde ses clés.
 *
 * Un double partiel est PIRE qu'un double absent : il rassure. C'est pourquoi
 * ce module ne se contente pas de filtrer la ligne — il PROJETTE l'arbre
 * `include` / `select` comme Prisma le ferait.
 *
 * ─── Ce qu'il ne réimplémente pas ───────────────────────────────────────────
 *
 * La sémantique du `where` elle-même reste chez `matchesMongoWhere`
 * (`./mongo-where`) : une seconde jumelle de cette règle serait libre de
 * diverger de la première, et c'est exactement la faute que le `CLAUDE.md` du
 * gateway proscrit. Ce module n'ajoute qu'une dimension : **où** appliquer ce
 * `where`.
 *
 * ─── Il jette au lieu d'ignorer ─────────────────────────────────────────────
 *
 * Toute clé d'argument dont ce double ne sait rien fait ÉCHOUER le test. Un
 * double qui passe en ignorant ce qu'il ne comprend pas rejoue, un cran plus
 * bas, le défaut qu'il est venu corriger. Les bornes (`take` / `skip` /
 * `cursor`) ne sont pas modélisées : les faire ignorer en silence rendrait « la
 * première ligne » sur une collection que la production croyait bornée. Qui en
 * a besoin étend ce module DÉLIBÉRÉMENT.
 *
 * L'ORDRE (`orderBy`) l'est depuis #9776 : toute lecture des pièces d'un
 * message passe `MESSAGE_ATTACHMENT_ORDER`. Il TRIE la liste (scalaires
 * `asc` / `desc`, un champ absent ou nul EN TÊTE d'un tri ascendant, comme
 * MongoDB) — le refuser obligeait à retirer l'ordre de la production pour
 * tester, l'ignorer laisserait passer une lecture qui oublie de trier.
 */

import { matchesMongoWhere, type MongoDocument } from './mongo-where';

/**
 * Un nœud de l'arbre d'arguments : la racine de `findFirst` comme une relation
 * incluse s'écrivent avec les trois mêmes clés.
 */
export type PrismaQueryNode = {
  readonly where?: MongoDocument;
  readonly include?: Record<string, unknown>;
  readonly select?: Record<string, unknown>;
  readonly orderBy?: unknown;
};

const CLES_SUPPORTEES: ReadonlySet<string> = new Set(['where', 'include', 'select', 'orderBy']);

type Critere = { readonly champ: string; readonly sens: 1 | -1 };

function criteres(chemin: string, orderBy: unknown): ReadonlyArray<Critere> {
  const liste = Array.isArray(orderBy) ? orderBy : [orderBy];
  return liste.flatMap((entree) => {
    if (typeof entree !== 'object' || entree === null) {
      throw new Error(`double Prisma: « ${chemin}.orderBy » n'est pas un objet`);
    }
    return Object.entries(entree).map(([champ, sens]) => {
      if (sens !== 'asc' && sens !== 'desc') {
        throw new Error(`double Prisma: « ${chemin}.orderBy.${champ} » direction non supportée`);
      }
      return { champ, sens: sens === 'asc' ? 1 : -1 } as const;
    });
  });
}

const poids = (valeur: unknown): number | string | null => {
  if (valeur === undefined || valeur === null) return null;
  if (valeur instanceof Date) return valeur.getTime();
  if (typeof valeur === 'number' || typeof valeur === 'string') return valeur;
  throw new Error(`double Prisma: valeur non ordonnable ${JSON.stringify(valeur)}`);
};

function comparer(a: unknown, b: unknown): number {
  const [pa, pb] = [poids(a), poids(b)];
  if (pa === pb) return 0;
  if (pa === null) return -1;
  if (pb === null) return 1;
  return pa < pb ? -1 : 1;
}

function trier(
  lignes: ReadonlyArray<MongoDocument>,
  orderBy: unknown,
  chemin: string
): ReadonlyArray<MongoDocument> {
  if (orderBy === undefined) return lignes;
  const ordre = criteres(chemin, orderBy);
  return [...lignes].sort((a, b) =>
    ordre.reduce((verdict, { champ, sens }) => verdict || sens * comparer(a[champ], b[champ]), 0)
  );
}

const aLaCle = (ligne: MongoDocument, cle: string): boolean =>
  Object.prototype.hasOwnProperty.call(ligne, cle);

function noeud(chemin: string, specification: unknown): PrismaQueryNode {
  if (typeof specification !== 'object' || specification === null || Array.isArray(specification)) {
    throw new Error(`double Prisma: « ${chemin} » n'est pas un nœud de requête`);
  }
  const inconnues = Object.keys(specification).filter((cle) => !CLES_SUPPORTEES.has(cle));
  if (inconnues.length > 0) {
    throw new Error(`double Prisma: clé non supportée « ${chemin}.${inconnues.join(', ')} »`);
  }
  return specification as PrismaQueryNode;
}

function projeterLigne(ligne: MongoDocument, arbre: PrismaQueryNode, chemin: string): MongoDocument {
  if (arbre.include && arbre.select) {
    throw new Error(`double Prisma: « ${chemin} » porte include ET select`);
  }
  if (arbre.select) return selectionner(ligne, arbre.select, chemin);
  if (arbre.include) return inclure(ligne, arbre.include, chemin);
  return ligne;
}

function inclure(
  ligne: MongoDocument,
  include: Record<string, unknown>,
  chemin: string
): MongoDocument {
  return Object.entries(include).reduce<MongoDocument>((acc, [relation, specification]) => {
    if (specification === true) return acc;
    const sousChemin = `${chemin}.${relation}`;
    return { ...acc, [relation]: projeterRelation(acc[relation], noeud(sousChemin, specification), sousChemin) };
  }, { ...ligne });
}

function selectionner(
  ligne: MongoDocument,
  select: Record<string, unknown>,
  chemin: string
): MongoDocument {
  return Object.entries(select).reduce<MongoDocument>((acc, [champ, specification]) => {
    // Une clé ABSENTE de la ligne reste absente de la projection : c'est la
    // règle « un champ absent n'est pas un champ à null » de `mongo-where`,
    // qu'une projection qui matérialise `undefined` effacerait.
    if (specification === true) return aLaCle(ligne, champ) ? { ...acc, [champ]: ligne[champ] } : acc;
    const sousChemin = `${chemin}.${champ}`;
    return { ...acc, [champ]: projeterRelation(ligne[champ], noeud(sousChemin, specification), sousChemin) };
  }, {});
}

function projeterRelation(valeur: unknown, arbre: PrismaQueryNode, chemin: string): unknown {
  if (Array.isArray(valeur)) {
    const retenues = (valeur as ReadonlyArray<MongoDocument>).filter((element) =>
      matchesMongoWhere(element, arbre.where)
    );
    return trier(retenues, arbre.orderBy, chemin).map((element) => projeterLigne(element, arbre, chemin));
  }
  if (valeur === null || valeur === undefined) return valeur;
  if (arbre.orderBy !== undefined) {
    throw new Error(`double Prisma: « ${chemin} » n'est pas une liste, son orderBy ne trie rien`);
  }
  if (arbre.where) {
    // Prisma refuse `where` sur une relation to-one : l'accepter en silence
    // laisserait croire à un filtre qui n'a jamais existé.
    throw new Error(`double Prisma: « ${chemin} » n'est pas une liste, son where ne filtre rien`);
  }
  return projeterLigne(valeur as MongoDocument, arbre, chemin);
}

/**
 * Le double : une COLLECTION en mémoire, et la première ligne qui satisfait le
 * `where` demandé — projetée par l'arbre `include` / `select` de l'appel.
 * Rend `null` quand rien n'apparie, exactement comme Prisma.
 *
 * Le type de retour est celui d'un DOCUMENT, pas celui de la ligne semée : sous
 * `select`, Prisma rend un sous-ensemble, et prétendre le contraire par une
 * assertion serait un mensonge de type au service d'un test.
 */
export function findFirstHonouringWhere(rows: ReadonlyArray<MongoDocument>) {
  return (args?: unknown): Promise<MongoDocument | null> => {
    const arbre = args === undefined ? {} : noeud('findFirst', args);
    const trouvee = trier(rows, arbre.orderBy, 'findFirst').find((ligne) => matchesMongoWhere(ligne, arbre.where));
    return Promise.resolve(trouvee ? projeterLigne(trouvee, arbre, 'findFirst') : null);
  };
}
