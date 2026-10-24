import {
  ADMIN_FICHES,
  adminGroupOf,
  adminSectionOfRouteKey,
  type AdminEntityKind,
  type AdminGroupId,
  type AdminSectionId,
} from './admin-routes';

/**
 * **LE FIL D'ARIANE DE L'ADMINISTRATION, DÉRIVÉ** (#12670) — « groupe › section ›
 * objet », lu dans la table des routes (`admin-routes.ts`), jamais écrit par
 * l'écran. Il l'était, vingt-neuf fois, et dérivait déjà du menu.
 *
 * - le tableau de bord est la racine : aucun maillon ;
 * - une liste : son groupe, puis elle-même, lieu courant ;
 * - une fiche : son groupe, sa section (un lien), puis l'objet, lieu courant —
 *   seulement une fois son nom connu ; pendant le chargement, le fil s'arrête à
 *   la section plutôt que de nommer le genre à la place de l'objet.
 *
 * Module PUR : les libellés se résolvent au rendu (`AdminPageHeader`).
 */
export type AdminTrailStep =
  | { readonly kind: 'group'; readonly group: AdminGroupId }
  | { readonly kind: 'section'; readonly section: AdminSectionId; readonly current: boolean }
  | { readonly kind: 'entity'; readonly entity: AdminEntityKind; readonly label: string };

/** Le genre d'objet qu'une clé de FICHE désigne — `null` pour une liste ou une route hors administration. */
export function adminEntityOfRouteKey(routeKey: string): AdminEntityKind | null {
  return ADMIN_FICHES.find((fiche) => fiche.adm === routeKey || fiche.admin === routeKey)?.entity ?? null;
}

export function adminTrailOf(routeKey: string, entityLabel?: string): readonly AdminTrailStep[] {
  const section = adminSectionOfRouteKey(routeKey);
  if (section === null || section === 'dashboard') return [];
  const entity = adminEntityOfRouteKey(routeKey);
  const group: AdminTrailStep = { kind: 'group', group: adminGroupOf(section) };
  if (entity === null) return [group, { kind: 'section', section, current: true }];
  const parent: AdminTrailStep = { kind: 'section', section, current: false };
  return entityLabel === undefined || entityLabel === '' ? [group, parent] : [group, parent, { kind: 'entity', entity, label: entityLabel }];
}
