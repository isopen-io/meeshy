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
