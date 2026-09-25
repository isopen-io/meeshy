import type { AdminRoute } from './sections';

/**
 * L'ESPACE D'ADMINISTRATION OÙ L'ON SE TROUVE, et ce que le menu latéral en
 * déduit (#7873).
 *
 * D-76 tient `/adm` et `/admin` séparés : un menu qui mènerait toujours vers
 * `/admin` ferait sauter l'administrateur d'un espace à l'autre au premier
 * clic. Le menu lit donc l'espace de la route COURANTE et y traduit la route
 * de chaque section.
 */
export type AdminSpace = 'adm' | 'admin';

export type AdmRoute = 'adm' | 'admUsers' | 'admConversations' | 'admAgent' | 'admAnonymous';

const EN_ADM: Readonly<Record<AdminRoute, AdmRoute>> = {
  admin: 'adm',
  adminUsers: 'admUsers',
  adminConversations: 'admConversations',
  adminAgent: 'admAgent',
  adminAnonymous: 'admAnonymous',
};

export function adminSpaceOf(routeKey: string | null): AdminSpace {
  if (routeKey === null) return 'admin';
  return routeKey.startsWith('adm') && !routeKey.startsWith('admin') ? 'adm' : 'admin';
}

export function routeInSpace(route: AdminRoute, space: AdminSpace): AdminRoute | AdmRoute {
  return space === 'adm' ? EN_ADM[route] : route;
}

/**
 * La section que surligne le menu. Une FICHE appartient à sa liste : ouvrir un
 * membre garde « Comptes » actif, sans quoi le menu ne dirait plus où l'on est.
 */
const SECTION_PAR_SUFFIXE: readonly (readonly [RegExp, string])[] = [
  [/^adm(in)?$/, 'dashboard'],
  [/^adm(in)?Users?$/, 'users'],
  [/^adm(in)?Conversations?$/, 'conversations'],
  [/^adm(in)?Agent$/, 'agent'],
  [/^adm(in)?Anonymous(One)?$/, 'anonymous'],
];

export function activeAdminSectionId(routeKey: string | null): string | null {
  if (routeKey === null) return null;
  const trouve = SECTION_PAR_SUFFIXE.find(([motif]) => motif.test(routeKey));
  return trouve === undefined ? null : trouve[1];
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
