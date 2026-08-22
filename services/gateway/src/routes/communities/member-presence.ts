/**
 * Filtrage de la présence sur un membre rendu SEUL par une écriture
 * (invitation, ajout par un admin).
 */
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';

type PresencePrisma = Parameters<typeof getPresenceVisibilityService>[0];

export type MemberUser = { id: string; isOnline: boolean | null; lastActiveAt?: Date | null };

/**
 * Présence d'un CO-MEMBRE servie à un membre de la même communauté.
 *
 * L'appartenance commune est un contexte d'accès garanti des deux côtés : la
 * présence est montrable, et seules les préférences `showOnlineStatus` /
 * `showLastSeen` de la cible s'appliquent. C'est le même régime que celui que
 * `routes/conversations/participants.ts` porte pour les co-participants.
 *
 * `onMissingEntry: 'reveal'` parce que le régime prefs-only tient une entrée
 * absente pour normale et non pour suspecte — le défaut inverse de celui du
 * critère strict. Le collapse lui-même passe par l'applicateur PARTAGÉ : c'est
 * la dette de recopie manuelle que le cycle 84 avait nommée.
 */
export async function gateCoMemberPresence<T extends { user?: MemberUser | null }>(
  prisma: PresencePrisma,
  member: T,
): Promise<T> {
  const user = member.user;
  if (!user?.id) return member;

  const visibility = await getPresenceVisibilityService(prisma).resolvePrefsOnly([user.id]);
  return {
    ...member,
    user: applyPresenceVisibilityAsOffline(user, visibility.get(user.id), {
      onMissingEntry: 'reveal',
    }),
  };
}
