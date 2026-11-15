import { ADMIN_FICHES, adminGroupOf, type AdminEntityKind, type AdminGroupId, type AdminSectionId } from './admin-routes';

/**
 * **LE FIL D'ARIANE DE L'ADMINISTRATION, DÉRIVÉ** (#12670) — « groupe › section ›
 * objet », lu dans la table des routes (`admin-routes.ts`), jamais écrit par
 * l'écran. Il l'était, vingt-neuf fois, et dérivait déjà du menu.
 *
 * L'écran ne dit que OÙ il est (`AdminPlace`) : sa section, et s'il en montre un
 * OBJET (une fiche) — ce que chaque écran sait déjà, puisqu'il le passe à sa garde.
 *
 * - le tableau de bord est la racine : aucun maillon ;
 * - une liste : son groupe, puis elle-même, lieu courant ;
 * - une fiche : son groupe, sa section (un lien), puis l'objet, lieu courant —
 *   seulement une fois son nom connu ; sans lui, le fil s'arrête à la section.
 *
 * Module PUR : les libellés se résolvent au rendu (`AdminPageHeader`).
 */
export type AdminPlace = {
  readonly section: AdminSectionId;
  readonly fiche?: boolean;
  /** Le nom de l'objet quand il diffère du titre ; `null` : pas encore lu (chargement, échec) — le fil s'arrête à la section. */
  readonly object?: string | null;
};

export type AdminTrailStep =
  | { readonly kind: 'group'; readonly group: AdminGroupId }
  | { readonly kind: 'section'; readonly section: AdminSectionId; readonly current: boolean }
  | { readonly kind: 'entity'; readonly entity: AdminEntityKind; readonly label: string };

/** Le genre d'objet que montre la fiche d'une section — `null` pour une section sans fiche. */
export function adminEntityOfSection(section: AdminSectionId): AdminEntityKind | null {
  return ADMIN_FICHES.find((fiche) => fiche.section === section)?.entity ?? null;
}

export function adminTrailOf(place: AdminPlace, objectLabel?: string): readonly AdminTrailStep[] {
  const { section } = place;
  if (section === 'dashboard') return [];
  const group: AdminTrailStep = { kind: 'group', group: adminGroupOf(section) };
  const entity = place.fiche === true ? adminEntityOfSection(section) : null;
  if (entity === null) return [group, { kind: 'section', section, current: true }];
  const parent: AdminTrailStep = { kind: 'section', section, current: false };
  return objectLabel === undefined || objectLabel === '' ? [group, parent] : [group, parent, { kind: 'entity', entity, label: objectLabel }];
}
