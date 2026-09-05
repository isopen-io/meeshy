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
 * bas, le défaut qu'il est venu corriger. L'ORDRE (`orderBy`) et les bornes
 * (`take` / `skip` / `cursor`) ne sont pas modélisés : les faire ignorer en
 * silence rendrait « la première ligne » sur une collection que la production
 * croyait triée. Qui en a besoin étend ce module DÉLIBÉRÉMENT.
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
};

const CLES_SUPPORTEES: ReadonlySet<string> = new Set(['where', 'include', 'select']);

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
    return valeur
      .filter((element) => matchesMongoWhere(element as MongoDocument, arbre.where))
      .map((element) => projeterLigne(element as MongoDocument, arbre, chemin));
  }
  if (valeur === null || valeur === undefined) return valeur;
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
    const trouvee = rows.find((ligne) => matchesMongoWhere(ligne, arbre.where));
    return Promise.resolve(trouvee ? projeterLigne(trouvee, arbre, 'findFirst') : null);
  };
}
