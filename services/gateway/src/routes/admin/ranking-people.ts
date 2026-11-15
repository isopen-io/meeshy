import type { FastifyInstance } from 'fastify';

/**
 * Les PERSONNES d'un classement : résolution des identifiants comptés en
 * comptes (ou en invités), et forme d'une ligne servie.
 *
 * Extrait de `system-rankings.ts` — la règle des invités et celle du repli
 * vivent ensemble, et le fichier de routes restait sous son budget de taille.
 */
export type UserInfo = { id: string; username: string; displayName: string | null; avatar: string | null; lastActiveAt: Date | null };

/**
 * Un INVITÉ : une participation sans compte (lien de partage, bot). Il n'a ni
 * pseudo ni présence ; son nom est celui que porte sa participation. Le servir
 * « Unknown » le confondait avec un identifiant orphelin (audit 2026-10-04).
 */
export type GuestInfo = { id: string; guest: true; displayName: string | null };

export type RankedPerson = UserInfo | GuestInfo;

const estInvite = (p: RankedPerson | undefined): p is GuestInfo => p !== undefined && 'guest' in p;

export async function fetchUserDetails(fastify: FastifyInstance, ids: string[]): Promise<Map<string, RankedPerson>> {
  if (ids.length === 0) return new Map();
  const users = await fastify.prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true, displayName: true, avatar: true, lastActiveAt: true }
  });
  const people = new Map<string, RankedPerson>(users.map(u => [u.id, u]));
  // Ce qui n'est pas un compte peut être une participation SANS compte : le
  // repli (`foldParticipantCountsToUsers`) garde la clé du participant quand
  // il n'a pas de `userId`.
  const restants = ids.filter((id) => !people.has(id));
  if (restants.length > 0) {
    const invites = await fastify.prisma.participant.findMany({
      where: { id: { in: restants } },
      select: { id: true, userId: true, displayName: true }
    });
    for (const p of invites) {
      if (!p.userId) people.set(p.id, { id: p.id, guest: true, displayName: p.displayName ?? null });
    }
  }
  return people;
}

// Directive produit 2026-08-25 : « les utilisateurs avec le rôle ADMIN et
// supérieur peuvent constamment avoir l'état de présence » — `requireAdmin`
// laisse passer AUDIT/ANALYST, qui n'ont plus le droit de voir `lastActivity`
// (dérivé de `User.lastActiveAt`). `canSeePresence` gouverne la clé : absente
// (jamais `undefined` ni une date fabriquée) quand le viewer n'y a pas droit.
export function buildUserRankings(
  sorted: Array<[string, number]>,
  userMap: Map<string, RankedPerson>,
  canSeePresence: boolean,
) {
  return sorted.map(([userId, count]) => {
    const person = userMap.get(userId);
    if (estInvite(person)) {
      return {
        id: userId,
        username: 'Unknown',
        displayName: person.displayName,
        avatar: null,
        guest: true,
        count,
      };
    }
    return {
      id: userId,
      username: person?.username || 'Unknown',
      displayName: person?.displayName,
      avatar: person?.avatar,
      guest: false,
      count,
      ...(canSeePresence ? { lastActivity: person?.lastActiveAt?.toISOString() } : {})
    };
  });
}

// Message.senderId, Reaction.participantId and
// CallParticipant.participantId all reference Participant.id, and a user holds one
// Participant per conversation. Counts keyed by those columns must be folded back
// to the owning userId — summing a user's per-conversation counts — before ranking.
// Otherwise the same user surfaces once per conversation (duplicated and
// undercounted), and counts keyed by a raw participant id never resolve to a user
// (rendered "Unknown"). An orphan participant id with no user keeps its own key so
// its activity stays visible rather than silently vanishing.
//
// Le repli exige TOUS les groupes : un `groupBy` borné à `limit` AVANT lui
// laisse hors du calcul les participations d'un membre classées au-delà de la
// borne — sous-comptage mesuré par l'audit du 2026-10-04.
export async function foldParticipantCountsToUsers(
  fastify: FastifyInstance,
  participantCounts: Map<string, number>
): Promise<Map<string, number>> {
  if (participantCounts.size === 0) return new Map();
  const participants = await fastify.prisma.participant.findMany({
    where: { id: { in: [...participantCounts.keys()] } },
    select: { id: true, userId: true }
  });
  const partToUser = new Map(participants.map(p => [p.id, p.userId]));
  const userCounts = new Map<string, number>();
  for (const [participantId, count] of participantCounts) {
    const key = partToUser.get(participantId) || participantId;
    userCounts.set(key, (userCounts.get(key) || 0) + count);
  }
  return userCounts;
}
