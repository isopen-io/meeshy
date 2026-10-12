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
