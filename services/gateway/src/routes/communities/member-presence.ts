/**
 * Filtrage de la présence des profils qu'une route de communauté rend à un
 * tiers : un membre rendu SEUL par une écriture (invitation, ajout par un
 * admin) et les participants des conversations d'une communauté.
 *
 * Directive produit (2026-08-25) : la co-appartenance à une communauté — ou
 * la co-participation à l'une de ses conversations — ne vaut RIEN, elle n'est
 * plus un contexte d'accès. Chaque profil passe donc par le critère STRICT
 * (`resolveForTarget` / `resolveForTargets`), avec le viewer RÉEL de la
 * requête : self/admin global toujours servi, un tiers seulement s'il est ami
 * accepté (et alors selon ses préférences), tout le reste masqué. Une entrée
 * absente de la carte rendue par le résolveur MASQUE (défaut `'hide'` de
 * `applyPresenceVisibilityAsOffline`) : sous le critère strict, un id que le
 * résolveur n'a pas rendu n'est pas un id autorisé.
 */
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';
import type { PresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import { getPresenceVisibilityService, type PresenceViewer } from '../../services/PresenceVisibilityService';

type PresencePrisma = Parameters<typeof getPresenceVisibilityService>[0];

export type MemberUser = { id: string; isOnline: boolean | null; lastActiveAt?: Date | null };

/**
 * Le profil d'un membre rendu SEUL par une écriture. `resolveForTarget` ne
 * relit pas la base : la désactivation du compte doit lui être REMISE, ou la
 * loi ne la voit pas — `PresenceTarget.deactivatedAt` est optionnel, et omis,
 * la cible passe pour active (la porte batchée, elle, lit le champ
 * d'elle-même). Obligatoire ici pour qu'un `select` qui l'oublie tombe à la
 * compilation plutôt qu'en production.
 */
export type CoMemberUser = MemberUser & { deactivatedAt: Date | null };

/**
 * Une ligne portant (ou non) un profil : un `CommunityMember` ou un
 * `Participant` de conversation. Un `Participant` chargé par `include` porte
 * AUSSI sa propre présence — `isOnline` et `lastActiveAt` de la LIGNE — que
 * le gate masque avec la MÊME visibilité que `user`. Sans profil (participant
 * anonyme), aucune résolution ne s'ouvre et aucune visibilité n'existe : la
 * ligne est masquée (défaut `'hide'`). Une ligne sans clé de présence n'en
 * gagne aucune.
 */
export type ProfileRow = {
  isOnline?: boolean | null;
  lastActiveAt?: Date | null;
  user?: MemberUser | null;
};

type PresenceRow = { isOnline: boolean | null; lastActiveAt?: Date | null };

const carriesPresence = (row: ProfileRow): row is ProfileRow & PresenceRow => 'isOnline' in row;

const gateRow = <T extends ProfileRow>(row: T, visibility: PresenceVisibility | undefined): T => {
  const rowGated: T = carriesPresence(row)
    ? { ...row, ...applyPresenceVisibilityAsOffline(row, visibility) }
    : row;
  return row.user ? { ...rowGated, user: applyPresenceVisibilityAsOffline(row.user, visibility) } : rowGated;
};

/**
 * Présence d'UN membre servi à l'acteur d'une écriture (l'admin qui l'ajoute,
 * l'inviteur) — la co-appartenance qu'ils viennent de créer ne vaut aucun
 * accès à sa présence. Un compte DÉSACTIVÉ est masqué pour tous, l'acteur
 * ADMIN compris : sa désactivation part avec la cible.
 */
export async function gateCoMemberPresence<T extends { user?: CoMemberUser | null }>(
  prisma: PresencePrisma,
  viewer: PresenceViewer,
  member: T,
): Promise<T> {
  const user = member.user;
  if (!user?.id) return member;

  const visibility = await getPresenceVisibilityService(prisma).resolveForTarget(viewer, {
    id: user.id,
    deactivatedAt: user.deactivatedAt ?? null,
  });
  return gateRow(member, visibility);
}

/**
 * Présence des PARTICIPANTS des conversations d'une communauté
 * (`GET /communities/:id/conversations`, `POST /communities/:id/conversations/:conversationId`)
 * — même `include`, même critère, UN appel batché pour toutes les conversations
 * rendues. Les deux routes partagent ce site pour que la seconde ne puisse plus
 * oublier le gate que la première pose (trou #2 du plan du 2026-08-25).
 */
export async function gateConversationParticipantsPresence<
  C extends { participants?: readonly ProfileRow[] },
>(
  prisma: PresencePrisma,
  viewer: PresenceViewer,
  conversations: readonly C[],
): Promise<C[]> {
  const participantsOf = (conversation: C): readonly ProfileRow[] => conversation.participants ?? [];
  const userIds = [
    ...new Set(
      conversations
        .flatMap(participantsOf)
        .map(participant => participant.user?.id)
        .filter((id): id is string => typeof id === 'string'),
    ),
  ];
  const visibility = userIds.length > 0
    ? await getPresenceVisibilityService(prisma).resolveForTargets(viewer, userIds)
    : new Map<string, PresenceVisibility>();

  return conversations.map(conversation => ({
    ...conversation,
    participants: participantsOf(conversation).map(participant =>
      gateRow(participant, participant.user ? visibility.get(participant.user.id) : undefined),
    ),
  }));
}
