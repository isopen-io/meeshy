/**
 * Filtrage de la présence sur un membre rendu SEUL par une écriture
 * (adhésion, invitation, ajout par un admin).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';

type MemberUser = { id: string; isOnline?: boolean | null } & Record<string, unknown>;
type MemberRow = { user?: MemberUser | null } & Record<string, unknown>;

/**
 * Applique le régime « contexte acquis » à la présence du membre rendu.
 *
 * Ces routes rendent le profil d'un TIERS — l'invité pour `POST /invite`,
 * l'ajouté pour `POST /members` — et `userMinimalSchema` déclare `isOnline`.
 * Le lien est posé des DEUX côtés au moment où la réponse part (l'appelant et
 * le sujet sont co-membres), donc seules les préférences s'appliquent :
 * `resolvePrefsOnly`, jamais `resolveForTargets`.
 *
 * Le défaut de carte incomplète est celui du régime prefs-only, et il est
 * l'INVERSE du régime strict : un id absent est NORMAL et vaut VISIBLE — d'où
 * la comparaison à `false` explicite plutôt qu'un `!vis?.showOnline`, qui
 * masquerait sur simple absence. Voir § « Les deux régimes ont des défauts
 * OPPOSÉS sur une carte incomplète » dans le CLAUDE.md de la passerelle.
 */
export async function gateMemberPresence<T extends MemberRow>(
  prisma: PrismaClient,
  member: T,
): Promise<T> {
  const user = member.user;
  if (!user) return member;

  const visibility = await getPresenceVisibilityService(prisma).resolvePrefsOnly([user.id]);
  if (visibility.get(user.id)?.showOnline === false) {
    return { ...member, user: { ...user, isOnline: false } };
  }
  return member;
}
