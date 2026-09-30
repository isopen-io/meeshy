import { useQuery } from '@tanstack/react-query';

import { adminIdentityQueryOptions } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import { useOptionalRoute } from '@/lib/router';

import type { AdminSectionId } from './admin-routes';
import { adminSpaceOf, type AdminSpace } from './admin-space';
import {
  canEnterAdmin,
  hasAdministrationRank,
  visibleAdminSections,
  type AdminPermissionKey,
  type AdminPermissions,
  type ServedAdminSection,
} from './sections';

/**
 * **CE QUE LE LECTEUR PEUT ATTEINDRE** (#8876) — la lecture unique de la
 * matrice servie (`GET /me/permissions`), prête à interroger : menu, hub,
 * garde d'écran, blocs masqués d'un écran ouvert, liens d'entité.
 *
 * Même clé de requête que le menu latéral et la rangée des Réglages
 * (`adminIdentityQueryOptions`) : AUCUNE seconde lecture de la matrice — chaque
 * site qui en aurait fait une aurait pu la lire autrement.
 *
 * Fail-closed : tant que la réponse manque, `status` vaut `'pending'` (jamais un
 * refus qui clignote) et `opens`/`can` répondent faux ; une réponse refusée ou
 * en échec rend `'denied'`, qui ne dit pas pourquoi.
 */
export type AdminReach = {
  readonly status: 'pending' | 'ready' | 'denied';
  readonly role: string | null;
  readonly permissions: AdminPermissions | null;
  readonly space: AdminSpace;
  readonly sections: readonly ServedAdminSection[];
  /** Une capacité fine — pour masquer un BLOC dont la route exige plus que celle de sa section. */
  readonly can: (key: AdminPermissionKey) => boolean;
  /** La section est visible ET prête : c'est le seul prédicat qui autorise un lien vers elle. */
  readonly opens: (section: AdminSectionId) => boolean;
  readonly hasAdminRank: boolean;
  readonly isSovereign: boolean;
};

export function useAdminReach(): AdminReach {
  const route = useOptionalRoute();
  const identity = useQuery(adminIdentityQueryOptions(apiDeps));

  const permissions = identity.data?.permissions ?? null;
  const role = identity.data?.role ?? null;
  const sections = visibleAdminSections(permissions, role);
  const entered = canEnterAdmin(permissions);

  return {
    status: identity.isPending ? 'pending' : entered ? 'ready' : 'denied',
    role,
    permissions,
    space: adminSpaceOf(route?.key ?? null),
    sections,
    can: (key) => entered && permissions?.[key] === true,
    opens: (section) => sections.some((candidate) => candidate.id === section),
    hasAdminRank: entered && hasAdministrationRank(role),
    isSovereign: entered && role === 'BIGBOSS',
  };
}
