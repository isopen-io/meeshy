/**
 * LES COLLÈGUES DE L'ÉQUIPE d'un compte (#16623, correction porteur 2026-11-08).
 *
 * Entre deux comptes de l'équipe (MODERATOR, ADMIN, BIGBOSS), TOUTES les features de
 * cercle s'ouvrent sans lien (`RELATION_TEAM_CLOSED_FEATURES` ne garde que la
 * Connaissance automatique). La loi (`resolveRelationAccess`) juge une PAIRE ; les
 * énumérateurs d'audience (« à qui pousser ? », « quels auteurs dans mes cercles ? »)
 * partent des LIENS (`comptesAuMoins`, `comptesLies`) et ne verraient jamais un collègue
 * sans lien. Ce module leur donne l'autre moitié de l'ensemble : les collègues, élus
 * par la loi elle-même (`pairAccessAmong`) — rôles des deux côtés, âge déclaré, blocage,
 * compte parti — et jamais par une comparaison de rôles écrite ici.
 *
 * Un sujet qui n'est pas de l'équipe n'a aucun collègue : une seule lecture de son compte.
 */
import type { PrismaClient, UserRole } from '@meeshy/shared/prisma/client';
import { GlobalUserRole, isPlatformTeam } from '@meeshy/shared/types/role-types';
import type { RelationFeature } from '@meeshy/shared/utils/relation-levels';
import { pairAccessAmong, type PairAccessDb, type PairAccessSubject } from './pairAccess';
import { ACCOUNT_STATE_SELECT, isUsableTeamAccount } from './usableAccount';

/**
 * Les rôles de l'équipe : `isPlatformTeam` est la seule définition. `GlobalUserRole` reprend
 * valeur pour valeur l'énumération `UserRole` du schéma (garde de types partagés) ; l'assertion
 * évite de lire l'énumération Prisma à l'exécution.
 */
const TEAM_ROLES = Object.values(GlobalUserRole).filter(isPlatformTeam) as unknown as UserRole[];

/** Borne de l'énumération : l'équipe est petite, mais une base mal peuplée ne dépasse jamais cette fenêtre. */
export const TEAM_PEERS_LIMIT = 500;

export type TeamPeersDb = Pick<PrismaClient, 'user'>;

/** Le compte `subjectId` est-il un compte UTILISABLE de l'équipe ? Une lecture. */
export async function isTeamAccount(prisma: TeamPeersDb, subjectId: string): Promise<boolean> {
  if (!subjectId) return false;
  const self = await prisma.user.findUnique({ where: { id: subjectId }, select: { role: true, ...ACCOUNT_STATE_SELECT } });
  return isUsableTeamAccount(self);
}

/**
 * Les comptes utilisables de l'équipe autres que `subjectId`, si lui-même en est un ;
 * `[]` sinon. Ce sont des CANDIDATS : la loi dit lesquels s'ouvrent.
 */
export async function teamPeerCandidates(prisma: TeamPeersDb, subjectId: string): Promise<readonly string[]> {
  if (!(await isTeamAccount(prisma, subjectId))) return [];
  const rows = await prisma.user.findMany({
    where: { role: { in: [...TEAM_ROLES] }, isActive: true },
    select: { id: true, role: true, ...ACCOUNT_STATE_SELECT },
    take: TEAM_PEERS_LIMIT + 1,
  });
  return rows.filter((row) => row.id !== subjectId && isUsableTeamAccount(row)).slice(0, TEAM_PEERS_LIMIT).map((row) => row.id);
}

/**
 * Les comptes qui portent un rôle de l'équipe, quel que soit leur état : ceux dont les
 * cercles rangent un collègue, donc ceux qu'un changement de rôle ou de compte doit
 * faire oublier (`forgetTeamCircles`). Une lecture ; elle LÈVE si elle échoue.
 */
export async function teamAccountIds(prisma: TeamPeersDb): Promise<readonly string[]> {
  const rows = await prisma.user.findMany({ where: { role: { in: [...TEAM_ROLES] } }, select: { id: true }, take: TEAM_PEERS_LIMIT });
  return rows.map((row) => row.id);
}

/**
 * Les collègues que la loi ADMET pour `feature` auprès de `subjectId`, sans lien :
 * l'ensemble que les énumérateurs ajoutent à celui des liens réels. `subjectIs` dit
 * le sens, comme chez `pairAccessAmong`. Une lecture qui échoue LÈVE : l'appelant ferme.
 */
export async function teamPeersAdmitted(
  prisma: PairAccessDb,
  params: { readonly feature: RelationFeature; readonly subjectId: string; readonly subjectIs: PairAccessSubject },
): Promise<readonly string[]> {
  const candidates = await teamPeerCandidates(prisma, params.subjectId);
  if (candidates.length === 0) return [];
  const verdicts = await pairAccessAmong(prisma, { ...params, otherIds: candidates });
  return candidates.filter((id) => verdicts.get(id)?.allowed === true);
}
