import { MEMBER_ROLE_HIERARCHY, MemberRole } from '@meeshy/shared/types/role-types';

/**
 * QUI MODÈRE UN APPEL (#8438) — couper le micro d'un participant, le retirer.
 *
 * L'admin d'un appel est celui qui l'a LANCÉ, tant qu'il y est connecté ; s'y
 * ajoutent les modérateurs et plus de la conversation qui DÉPASSENT la cible en
 * rang (rang égal ne dépasse pas : deux modérateurs ne se modèrent pas). Nul ne
 * se modère soi-même. Un invité de l'appel (#8433) n'a aucun rang dans la
 * conversation : il ne modère que s'il a lancé l'appel, ce qui n'arrive pas.
 *
 * La loi est UNE fonction pure, partagée par le socket (`call:mute-participant`)
 * et la route d'éviction (`DELETE /calls/:callId/participants/:participantId`).
 */

/** Rang de conversation (creator 40 > admin 30 > moderator 20 > member 10), 0 pour tout le reste. */
export const conversationRoleRank = (role: string | null | undefined): number =>
  MEMBER_ROLE_HIERARCHY[(role ?? '') as MemberRole] ?? 0;

export const MODERATOR_RANK = MEMBER_ROLE_HIERARCHY[MemberRole.MODERATOR];

export type CallModerationActor = {
  readonly key: string;
  readonly isActiveCallInitiator: boolean;
  readonly conversationRank: number;
};

export type CallModerationTarget = {
  readonly key: string;
  readonly conversationRank: number;
};

export function mayModerateCallParticipant(actor: CallModerationActor, target: CallModerationTarget): boolean {
  if (actor.key === target.key) return false;
  if (actor.isActiveCallInitiator) return true;
  return actor.conversationRank >= MODERATOR_RANK && actor.conversationRank > target.conversationRank;
}

/** La forme minimale d'une session d'appel lue par `getCallSession`. */
export type ModeratedCallSession = {
  readonly initiatorId: string;
  readonly participants: ReadonlyArray<{
    readonly id: string;
    readonly participantId: string;
    readonly leftAt: Date | null;
    readonly participant?: {
      readonly userId: string | null;
      readonly role: string;
      readonly isActive: boolean;
    } | null;
  }>;
};

export type CallStanding = {
  /** La clé du roster : `userId` d'un inscrit, `participantId` d'un anonyme. */
  readonly key: string;
  readonly participantId: string;
  readonly callParticipantId: string;
  readonly conversationRank: number;
  readonly isActiveCallInitiator: boolean;
};

/**
 * La place d'une personne CONNECTÉE à l'appel, lue de la session elle-même :
 * `null` si elle n'y est pas (jamais venue, partie). Le rang est celui de sa
 * participation ACTIVE à la conversation — un ancien membre ou un invité de
 * l'appel n'en a aucun.
 */
export function activeCallStanding(session: ModeratedCallSession, key: string): CallStanding | null {
  const row = session.participants.find(
    (p) => !p.leftAt && (p.participant?.userId ?? p.participantId) === key
  );
  if (!row) return null;
  return {
    key,
    participantId: row.participantId,
    callParticipantId: row.id,
    conversationRank: row.participant?.isActive ? conversationRoleRank(row.participant.role) : 0,
    isActiveCallInitiator: session.initiatorId === key,
  };
}
