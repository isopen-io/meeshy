import { ADMIN_SECTION_TABLE, adminSectionOfRouteKey, type AdmRoute, type AdminRoute, type AdminSectionId, type AdminSpace } from './admin-routes';

export type { AdmRoute, AdminSpace };

/**
 * L'ESPACE D'ADMINISTRATION OÙ L'ON SE TROUVE, et ce que le menu latéral en
 * déduit (#7873).
 *
 * D-76 tient `/adm` et `/admin` séparés : un menu qui mènerait toujours vers
 * `/admin` ferait sauter l'administrateur d'un espace à l'autre au premier
 * clic. Le menu lit donc l'espace de la route COURANTE et y traduit la route
 * de chaque section.
 *
 * Depuis #8876 la correspondance `/admin` → `/adm` et la section surlignée ne
 * sont plus écrites ici : elles DÉRIVENT de `admin-routes.ts`, l'unique table
 * des paires liste/fiche — un lot qui ajoute une section n'a plus aucune
 * seconde table à tenir d'accord.
 */
export function adminSpaceOf(routeKey: string | null): AdminSpace {
  if (routeKey === null) return 'admin';
  return routeKey.startsWith('adm') && !routeKey.startsWith('admin') ? 'adm' : 'admin';
}

export function routeInSpace(route: AdminRoute, space: AdminSpace): AdminRoute | AdmRoute {
  if (space === 'admin') return route;
  const row = ADMIN_SECTION_TABLE.find((candidate) => candidate.list.admin === route);
  return row === undefined ? route : row.list.adm;
}

/**
 * La section que surligne le menu. Une FICHE appartient à sa liste : ouvrir un
 * membre garde « Comptes » actif, sans quoi le menu ne dirait plus où l'on est.
 */
export function activeAdminSectionId(routeKey: string | null): AdminSectionId | null {
  return routeKey === null ? null : adminSectionOfRouteKey(routeKey);
}

/** Le repli du menu, retenu par navigateur — une commodité, jamais un état partagé. */
const CLE_REPLI = 'meeshy.admin.sidebar.folded';

export function readSidebarFolded(): boolean {
  try {
    return globalThis.localStorage?.getItem(CLE_REPLI) === '1';
  } catch {
    return false;
  }
}

export function writeSidebarFolded(folded: boolean): void {
  try {
    globalThis.localStorage?.setItem(CLE_REPLI, folded ? '1' : '0');
  } catch {
    return;
  }
}
