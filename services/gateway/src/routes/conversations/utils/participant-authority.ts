import { MemberRole, type MemberRoleType, memberRoleLevel } from '@meeshy/shared/types/role-types';
import { actorRoleLevel, type ConversationActor } from '../../../utils/conversation-authority';

/**
 * **Agir SUR quelqu'un dans une conversation** — la loi que quatre gestes
 * partagent : retirer (`DELETE …/participants/:key`), changer un rang
 * (`PATCH …/role`), bannir et lever un bannissement (`ban.ts`).
 *
 * Elle se lit en une phrase : **on n'atteint que ce qui est SOUS soi, et pas
 * avant d'avoir soi-même le titre.** Deux questions, donc, jamais une :
 *
 * - le **plancher** — le titre minimal que le geste exige, quelle que soit sa
 *   cible (`actorHasMinimumRole` seul répondait à celle-là) ;
 * - la **comparaison de rang** — l'acteur doit être STRICTEMENT au-dessus de sa
 *   cible. C'est celle qui manquait à trois gestes sur quatre : seul `/ban` la
 *   portait, en clair, dans son propre fichier.
 *
 * Ce que l'absence coûtait, mesuré sur le dépôt du 2026-08-29 : un
 * **modérateur** franchissait le plancher de `DELETE` et pouvait donc retirer un
 * **administrateur**, voire le **créateur** de la conversation — le rang qui le
 * dominait ne le protégeait de rien, puisque personne ne le lisait. Et un
 * **administrateur** rétrogradait un autre administrateur par `PATCH …/role`,
 * la seule protection posée étant celle du créateur (#4008). Le geste le plus
 * destructeur de la conversation était le moins gardé.
 *
 * ─── Pourquoi une valeur de REFUS plutôt qu'un booléen ────────────────────────
 *
 * Les deux refus ne se disent pas pareil à l'utilisateur : « vous n'avez pas les
 * droits » (le titre manque) et « vous ne pouvez pas agir sur un participant de
 * rang égal ou supérieur » (le titre est là, la cible est hors de portée). Un
 * booléen aurait forcé chaque route à refaire la moitié du calcul pour choisir
 * sa phrase — c'est-à-dire à réécrire la loi, ce que ce fichier existe pour
 * empêcher.
 *
 * ─── Deux valeurs par défaut, et pourquoi elles ne sont pas symétriques ───────
 *
 * - **L'ACTEUR** dont le rang est illisible vaut 0 — MOINS qu'un simple membre
 *   (`actorRoleLevel`). Une ligne corrompue n'agit pas.
 * - **La CIBLE** dont le rang est absent vaut `member`, jamais 0 : c'est le
 *   comportement que `/ban` portait déjà (`role ?? 'member'`), et il est le bon
 *   sens ici — un rang manquant sur la ligne visée ne doit pas la rendre
 *   ATTEIGNABLE par tout le monde. Un rang présent mais illisible (`'ADMIN '`,
 *   une graphie inconnue) vaut bien 0, lui, et reste donc joignable par
 *   n'importe quel titulaire du plancher : c'est ce qui permet de nettoyer une
 *   ligne cassée plutôt que de la laisser inexpugnable.
 *
 * La casse ne décide de rien (#4008) : `memberRoleLevel` replie, des deux côtés.
 * Le rôle de PLATEFORME de la cible ne la protège pas non plus — décision
 * porteur du 2026-08-28, dont `ban.test.ts` porte le témoin : la comparaison ne
 * consulte que le rang de CONVERSATION, et `actorRoleLevel` hisse un
 * ADMIN/BIGBOSS de la plateforme au niveau du créateur, jamais au-dessus.
 */
export type ParticipantActionRefusal = 'below-floor' | 'rank-not-above';

export function participantActionRefusal(options: {
  readonly actor: ConversationActor;
  readonly targetRole: string | null | undefined;
  readonly floor: MemberRoleType;
}): ParticipantActionRefusal | null {
  const actorLevel = actorRoleLevel(options.actor);
  if (actorLevel < memberRoleLevel(options.floor)) return 'below-floor';
  if (actorLevel <= memberRoleLevel(options.targetRole ?? MemberRole.MEMBER)) return 'rank-not-above';
  return null;
}
