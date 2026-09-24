/**
 * **CE QUI NE DOIT PAS TOUCHER LE DISQUE** (#6862) — le préfixe des clés de
 * requête souveraines, et le prédicat qui les reconnaît.
 *
 * ## Pourquoi un module de douze lignes, et pas deux constantes chez leur usager
 *
 * Ce prédicat a DEUX appelants qui ne vivent pas au même étage :
 *
 * | appelant | étage |
 * |---|---|
 * | `admin-conversations.ts` | un chunk de ROUTE, chargé à la demande |
 * | `query-client.ts` | le SOCLE, dans la première peinture |
 *
 * Le socle ne peut pas importer le module d'administration : `budgets.json`
 * fait de la première peinture un GATE (90 Ko gzip), et tirer les décodeurs
 * admin dans le bundle d'entrée le ferait dépasser — le dépôt a déjà payé
 * cette leçon, où brancher une loi la fait entrer dans ce que TOUT lecteur
 * télécharge, qu'il soit administrateur ou non.
 *
 * L'inverse — recopier la chaîne des deux côtés — est pire : deux
 * déclarations d'un même littéral divergent au premier renommage, et la
 * divergence est SILENCIEUSE (le filtre cesse simplement de reconnaître les
 * clés, et le contenu privé repart sur le disque sans que rien ne rougisse).
 *
 * D'où ce module : aucune dépendance, aucun type importé, quelques octets.
 * C'est ce qui le rend importable par les deux étages à la fois.
 */

/**
 * Le premier segment de TOUTE clé de requête portant une lecture souveraine.
 *
 * Les fabriques de clés vivent dans `admin-conversations.ts` ; ce littéral vit
 * ici parce que le filtre de persistance doit le connaître sans connaître
 * elles.
 */
export const ADMIN_SOUVERAIN_PREFIXE = 'admin-souverain' as const;

/**
 * `true` si cette clé porte une lecture souveraine — donc **à ne pas
 * persister**.
 *
 * Le cache de la v2 est écrit sur le disque du navigateur (`query-client.ts`
 * déshydrate toute requête réussie vers `localStorage`). Sans ce prédicat, le
 * contenu d'une conversation privée lue en régime souverain y survivrait à la
 * session : une copie qu'`AdminAuditLog` ne connaît pas et que personne ne
 * révoque. La trace dit « il a lu », pas « il en garde une copie depuis six
 * jours ».
 */
export function estClefSouveraine(key: readonly unknown[]): boolean {
  return key[0] === ADMIN_SOUVERAIN_PREFIXE;
}
