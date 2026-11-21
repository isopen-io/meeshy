/**
 * « Pas encore » ne s'écrit pas `null` sur MongoDB.
 *
 * Prisma n'écrit pas les champs optionnels qu'on ne lui donne pas au `create`.
 * Une colonne `DateTime?` jamais renseignée est donc ABSENTE du document, et le
 * filtre `{ champ: null }` — une égalité — ne l'apparie pas. Les deux états « pas
 * encore » coexistent en base et aucun n'est déductible de l'autre :
 *
 *   absente     le créateur n'a rien écrit — le cas de l'immense majorité
 *   `null`      un chemin a explicitement remis la colonne à zéro
 *
 * Ce dépôt a payé ce piège quatre fois en production : le feed vidé
 * (`services/posts/softDelete.ts`), 100 % des bascules média d'appel en no-op
 * (`CallService.initiateCall`), le balayage du contenu éphémère inerte (cycle 54),
 * et le compteur de vues uniques (cycle 57). Le correctif est toujours le même
 * — apparier les DEUX états — et il était recopié à la main sur une douzaine de
 * sites, chacun libre de l'oublier.
 *
 * ─── CE QUE CETTE FONCTION EST, ET N'EST PAS ─────────────────────────────────
 *
 * Elle nomme le prédicat de LECTURE, à spreader dans un `where` :
 *
 * ```ts
 * where: { id, isActive: true, ...unsetOrNull('bannedAt') }
 * ```
 *
 * Elle rend une clé `OR`. Un `where` qui porte DÉJÀ son propre `OR` ne peut donc
 * pas la spreader telle quelle — il faut alors passer par `AND: [..., unsetOrNull(f)]`,
 * comme `PostFeedService` le fait pour `expiresAt`. Le spread silencieux qui
 * écraserait un `OR` existant est le seul piège de cet utilitaire.
 *
 * Elle ne remplace pas la discipline d'ÉCRITURE là où celle-ci existe déjà et
 * porte un nom (`LIVE_MESSAGE_MARK` pour `Message.deletedAt`, le `leftAt: null`
 * explicite de `CallService.initiateCall`) : écrire la colonne rend les lectures
 * exactes pour les lignes À VENIR, ce prédicat les rend exactes pour celles DÉJÀ
 * EN BASE. Les deux moitiés ne se substituent pas l'une à l'autre.
 *
 * ─── ET LE PIÈGE EST UN ARTEFACT DE PRISMA : EN MONGO BRUT, C'EST L'INVERSE ──
 *
 * Tout ce qui précède vaut pour une requête passée par le CLIENT PRISMA. Dans le
 * langage de requête MongoDB, `{ champ: null }` apparie les documents où le champ
 * vaut `null` **OU est ABSENT** — c'est documenté (« Query for Null or Missing
 * Fields »), et c'est le comportement qu'on cherche. Le connecteur MongoDB de
 * Prisma, lui, distingue délibérément les deux états, ce pour quoi il fournit
 * `isSet` (mesuré contre `mongo:8`, #8309).
 *
 * Conséquence pratique, et elle a failli coûter une régression (#19909) : sur un
 * site qui exécute une commande par `prisma.$runCommandRaw`, l'égalité nue est
 * la forme **JUSTE**, et y poser `isSet` serait une faute — l'opérateur est
 * propre à Prisma, et un document portant littéralement `{ isSet: false }`
 * n'existe pas. `services/posts/postCounters.ts` est ce cas : sa clause
 * `scope.liveOnly ? { deletedAt: null } : {}` voyage dans un document de commande
 * brute, et elle apparie bien les posts dont la colonne est absente.
 *
 * **Avant de proposer `unsetOrNull` ou `NOT_DELETED` sur un site, vérifier qu'il
 * passe par Prisma et non par `$runCommandRaw`.** Les deux sémantiques sont
 * opposées sur la même syntaxe, dans le même dépôt, sur la même collection — et
 * un remède appliqué au mauvais chemin ressemble exactement aux bons.
 */
export type UnsetOrNull<F extends string> = {
  OR: [{ [K in F]: null }, { [K in F]: { isSet: false } }];
};

export function unsetOrNull<F extends string>(field: F): UnsetOrNull<F> {
  return {
    OR: [
      { [field]: null } as { [K in F]: null },
      { [field]: { isSet: false } } as { [K in F]: { isSet: false } },
    ],
  };
}

/**
 * « Différent de `value` » quand la clé peut être ABSENTE.
 *
 * Sur MongoDB, Prisma écarte de toute négation — `NOT`, `not`, `notIn` — le
 * document où la clé n'existe pas (mesuré contre `mongo:8`, #8309). Un invité
 * par lien n'a pas de clé `userId` : `NOT: { userId }` seul le retirait de
 * chaque audience « les autres participants » (#9106). L'absence se dit donc à
 * part, dans une branche positive.
 *
 * Comme `unsetOrNull`, elle rend une clé `OR` : un `where` qui porte déjà le
 * sien la compose par `AND`.
 */
export type DiffersOrUnset<F extends string, V> = {
  OR: [{ NOT: { [K in F]: V } }, { [K in F]: { isSet: false } }];
};

export function differsOrUnset<F extends string, V>(field: F, value: V): DiffersOrUnset<F, V> {
  return {
    OR: [
      { NOT: { [field]: value } as { [K in F]: V } },
      { [field]: { isSet: false } } as { [K in F]: { isSet: false } },
    ],
  };
}
