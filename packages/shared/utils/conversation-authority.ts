import {
  MemberRole,
  type MemberRoleType,
  isMemberRole,
  memberRoleLevel,
} from '../types/role-types.js';
import { isPrivilegedPlatformRole } from './platform-privilege.js';

/**
 * **L'autorité d'un acteur DANS une conversation** — rang de conversation et
 * rôle de plateforme confondus en une seule question (issue #3941).
 *
 * Décision porteur du 2026-08-27, en tranchant #3892 : « un administrateur ou
 * grand boss, de la plateforme, une fois dans n'importe quelle conversation, a
 * toute la visibilité de la conversation et peut agir avec les droits du
 * créateur de la conversation ». #3892 n'avait appliqué ce principe qu'au
 * plancher d'historique ; l'audit de #3941 a trouvé le bypass posé à **trois**
 * points de contrôle sur quatorze — retirer un participant, changer un rang,
 * inviter — et absent partout ailleurs, sans qu'aucune décision ne l'explique.
 *
 * Trois mots de la décision gouvernent cette loi :
 *
 * - **« une fois dans »** — le bypass suppose une APPARTENANCE, jamais un
 *   passe-partout. Cette loi ne charge rien : c'est l'appelant qui lui remet le
 *   rang d'une ligne de participation qu'il a déjà trouvée. Un administrateur
 *   de la plateforme étranger à la conversation reste étranger — et la loi le
 *   fait respecter ELLE-MÊME : `Participant.role` est une colonne requise, donc
 *   un `conversationRole` absent signifie « aucune ligne », et alors aucun rôle
 *   de plateforme ne vaut un rang. Trois routes de membre (`PUT|PATCH` et
 *   `DELETE /conversations/:id`, `PATCH …/rights`) remettaient l'acteur sans
 *   avoir vérifié l'appartenance ; confier la garde à chacune aurait laissé le
 *   prochain appelant rouvrir le trou (#11217). Configurer une conversation
 *   dont on n'est pas membre passe par la route souveraine
 *   (`routes/admin/conversation-settings-sovereign.ts` : rang ADMIN, motif
 *   écrit, journal d'audit).
 * - **« avec les droits DU CRÉATEUR »** — au niveau du créateur, jamais
 *   au-dessus. Un administrateur de la plateforme n'hérite donc pas d'un rang
 *   qui lui permettrait de bannir ou de rétrograder le créateur : la règle du
 *   « rang strictement supérieur » continue de les départager, dans les deux
 *   sens. C'est la lecture CONSERVATRICE, et elle mérite d'être écrite parce
 *   que `getEffectiveRole` — l'échelle unifiée du paquet partagé — rendrait
 *   l'inverse : elle place `ADMIN` (80) AU-DESSUS de `CREATOR` (70). Employer
 *   ce voisin d'apparence interchangeable aurait rendu le créateur d'une
 *   conversation expulsable par n'importe quel administrateur, ce que la
 *   décision porteur ne dit pas.
 * - **« de la plateforme »** — les rôles PRIVILÉGIÉS de la table partagée
 *   (`PRIVILEGED_PLATFORM_ROLES`, `@meeshy/shared/utils/platform-privilege`) :
 *   `MODERATOR`, `ADMIN` et `BIGBOSS`, comparés exactement. La décision porteur
 *   du 2026-10-24 (#11217) a rangé `MODERATOR` avec eux — il était ordinaire
 *   ici pendant que l'édition et la suppression le privilégiaient. `AUDIT` et
 *   `ANALYST` restent des participants ordinaires. La visibilité de la
 *   présence, elle, garde sa propre loi (`isGlobalAdmin`).
 *
 * Type PUR : aucune requête, aucune horloge, aucun Prisma. Les routes lui
 * remettent deux chaînes.
 */
export type ConversationActor = {
  /**
   * `Participant.role` de l'appelant DANS cette conversation ; `null` ou absent
   * quand aucune ligne de participation active n'a été trouvée.
   */
  readonly conversationRole?: string | null;
  /** `User.role` de l'appelant — le rôle de PLATEFORME, en majuscules. */
  readonly platformRole?: string | null;
};

/** L'acteur a-t-il une ligne de participation — un rang, même illisible ? */
function isMember(actor: ConversationActor): boolean {
  return typeof actor.conversationRole === 'string';
}

/** L'acteur, MEMBRE, tient-il ses droits de la plateforme plutôt que de la conversation ? */
export function actsWithCreatorRights(actor: ConversationActor): boolean {
  return isMember(actor) && isPrivilegedPlatformRole(actor.platformRole);
}

/**
 * Le rang dont l'acteur dispose EFFECTIVEMENT dans cette conversation, ou
 * `null` s'il n'en a AUCUN de reconnaissable.
 *
 * **`null` n'est pas `member`.** `MEMBER_ROLE_HIERARCHY` place `member` à 10 et
 * rend 0 pour tout rang inconnu : un rang illisible vaut donc MOINS qu'un
 * simple membre, et c'est ce qui empêche une ligne corrompue d'agir. Replier
 * l'inconnu sur `member` aurait PROMU ces lignes — un repli « fail-closed »
 * mal choisi accorde exactement ce qu'il croyait refuser.
 */
export function effectiveConversationRole(actor: ConversationActor): MemberRoleType | null {
  if (actsWithCreatorRights(actor)) return MemberRole.CREATOR;
  const folded = (actor.conversationRole ?? '').toLowerCase();
  return isMemberRole(folded) ? folded : null;
}

/**
 * Le NIVEAU de l'acteur, pour les gestes qui comparent DEUX rangs entre eux —
 * bannir exige un rang strictement supérieur à celui de sa cible, ce qu'un
 * prédicat « au moins X » ne sait pas dire.
 */
export function actorRoleLevel(actor: ConversationActor): number {
  const role = effectiveConversationRole(actor);
  return role === null ? 0 : memberRoleLevel(role);
}

/** L'acteur atteint-il le rang exigé par ce geste ? */
export function actorHasMinimumRole(actor: ConversationActor, required: MemberRoleType): boolean {
  return actorRoleLevel(actor) >= memberRoleLevel(required);
}
