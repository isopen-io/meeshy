import type { StudioMediaKind } from './story-document';
import { studioBackgroundMenuActions } from './studio-scene-menu';

/**
 * **ÉDITER LE FOND SANS QUITTER LA SCÈNE** (#8849, jumelle web de
 * `ComposerBackgroundTools` iOS, #8847 — directive porteur 2026-09-30) :
 *
 * > « l'édition de la vidéo ou image de fond ne doit plus ouvrir l'ancien
 * > éditeur mais juste les outils de droite qui n'ouvrent pas non plus l'ancien
 * > éditeur mais affichent les contrôleurs en bas de la scène en masquant ce
 * > qui y serait […] C'est quand on revient à la gestion de la scène qu'on
 * > affiche ces éléments ! »
 *
 * Le panneau Cadre d'un bloc (fit, légende, alt, fonds, filtre, retrait) était
 * l'ancien éditeur du web : il se découpe en OUTILS que le rail droit porte,
 * chacun ouvrant ses seuls contrôles sous la scène. Règles pures ; l'écran
 * (`use-studio-background-tools.tsx`) les relaie.
 */
export type StudioBackgroundSection = 'frame' | 'filter' | 'describe';

/** L'édition du fond en cours — `open` nul : seul le rail montre ses outils. */
export type StudioBackgroundEdit = { readonly open: StudioBackgroundSection | null };

/** Les gestes du fond servis à côté de ses outils — ceux de son menu d'appui
 * long, « Modifier » en moins : on y est déjà. */
export type StudioBackgroundToolAction = 'retake' | 'forward' | 'remove';

/** Le filtre ne se cuit que dans une IMAGE (#8798) ; une retouche ne décrit
 * ni ne filtre l'image qu'elle rend — le fil la publie ailleurs. */
export function studioBackgroundSections({ mediaType, retouching }: { readonly mediaType: StudioMediaKind; readonly retouching: boolean }): readonly StudioBackgroundSection[] {
  if (retouching) return ['frame'];
  return mediaType === 'image' ? ['frame', 'filter', 'describe'] : ['frame', 'describe'];
}

export function studioBackgroundToolActions({
  offersPhoto,
  overlayFree,
  retouching,
}: {
  readonly offersPhoto: boolean;
  readonly overlayFree: boolean;
  readonly retouching: boolean;
}): readonly StudioBackgroundToolAction[] {
  if (retouching) return ['remove'];
  return studioBackgroundMenuActions({ offersPhoto, overlayFree }).filter((action): action is StudioBackgroundToolAction => action !== 'edit');
}

/** **Toute porte d'édition du fond ouvre ses outils en ligne** — la section
 * demandée s'ouvre si ce fond la sert ; sinon le rail paraît seul. */
export function studioBackgroundEditOpened({
  requested,
  served,
}: {
  readonly requested: StudioBackgroundSection | null;
  readonly served: readonly StudioBackgroundSection[];
}): StudioBackgroundEdit {
  return { open: requested !== null && served.includes(requested) ? requested : null };
}

/** Toucher un outil ouvre ses contrôles ; toucher l'outil ouvert les range —
 * le rail, lui, reste jusqu'au `(x)`. */
export function studioBackgroundToolTapped(section: StudioBackgroundSection, edit: StudioBackgroundEdit): StudioBackgroundEdit {
  return { open: edit.open === section ? null : section };
}

/** **L'édition ne survit pas à son fond** : retiré, défait par l'historique,
 * ou la frise ouverte — la scène revient, l'écran ne reste jamais en mode
 * outil sur un fond qui n'est plus là. */
export function studioBackgroundEditResolved(
  edit: StudioBackgroundEdit | null,
  { hasBackground, timelineOpen }: { readonly hasBackground: boolean; readonly timelineOpen: boolean },
): StudioBackgroundEdit | null {
  return edit !== null && hasBackground && !timelineOpen ? edit : null;
}
