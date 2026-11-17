import { permissionsService } from '../../services/admin/permissions.service';
import type { UserRoleEnum } from '@meeshy/shared/types';

/**
 * Qui GÈRE un lien suivi — le modifier, le réactiver, le supprimer, le
 * désactiver, lire ses statistiques (#10291).
 *
 * Son créateur. Un lien SANS propriétaire : un compte qui peut modérer le
 * contenu, personne d'autre. Le lien d'un autre compte reste à son créateur
 * (la supervision passe par `/admin/tracking-links`).
 * L'ancienne garde (`createdBy && createdBy !== userId`) ouvrait un lien SANS
 * propriétaire à tout compte inscrit — exactement les liens fabriqués pour un
 * invité anonyme : un invité devenu inscrit rallumait le `m+<jeton>` de ses
 * anciens messages vers l'adresse de son choix. Sans propriétaire ⇒ personne.
 */
export function mayManageTrackingLink(
  link: { readonly createdBy?: string | null },
  caller: { readonly id: string; readonly role: string }
): boolean {
  if (link.createdBy) return link.createdBy === caller.id;
  return permissionsService.hasPermission(caller.role as UserRoleEnum, 'canModerateContent');
}

/**
 * Le lien d'une ADRESSE de fiche (#18863) n'existe pour personne d'autre que son propriétaire
 * (#19196) : ses portes de lecture rendent à tout autre lecteur, avec ou sans compte, la réponse
 * d'un jeton INCONNU (404), jamais un refus (401/403) qui dirait qu'il existe.
 */
export function isForeignAddressLink(
  link: { readonly createdBy?: string | null; readonly addressId?: string | null },
  authContext: { readonly registeredUser?: { readonly id: string } | null } | null | undefined
): boolean {
  if (!link.addressId) return false;
  const viewerId = authContext?.registeredUser?.id;
  return !link.createdBy || viewerId !== link.createdBy;
}
