import type { EffectGenre } from './call-effect-layers';

/**
 * **OÙ EN EST LA BARRE D'EFFETS** (directive porteur du 2026-11-14 sur #16979 et #17962, #18186 ; jumelle de
 * `CallEffectsBarRule` d'iOS #18189 et d'Android, mêmes vecteurs) — Effets ET Montage, looks, couleurs,
 * déformations, cadres : une même famille d'outils, une même navigation. Loi pure, aucune vue.
 *
 * - `base` : le menu de base, la rangée Visage · Couleur · Cadres sur `‹ · Réglages · (+)`, rien d'ouvert ;
 * - `looks` : le carrousel d'un genre, ouvert au-dessus de la barre (l'entrée d'un mode, une puce, (+)) ;
 * - `settings` : le panneau Luminosité · Flou du fond (P8b), qui reste ouvert pendant qu'on règle (#17947) ;
 * - `applied` : la liste des effets appliqués, ouverte par l'appui long sur (+).
 *
 * Après un CHOIX (un look, une couleur, une déformation, un cadre, une déclinaison, l'option « Cadre »,
 * « Chaque visage »), ce que la fonction avait ouvert se referme : la barre revient au menu de base. Parcourir
 * (faire défiler, les flèches, une ambiance, « Plus d'ambiances ») n'est pas un choix.
 */
export type EffectsBarMode = 'base' | 'looks' | 'settings' | 'applied';

export const EFFECTS_BAR_MODES: readonly EffectsBarMode[] = ['base', 'looks', 'settings', 'applied'];

export const ENTERING: EffectsBarMode = 'looks';

export const afterChoice: EffectsBarMode = 'base';

export const afterRemoval: EffectsBarMode = 'base';

/** Une puce de genre ouvre son carrousel ; retouchée alors que son carrousel est ouvert, elle le referme. */
export const afterGenre = (mode: EffectsBarMode, { isOpen }: { readonly isOpen: boolean }): EffectsBarMode => (mode === 'looks' && isOpen ? 'base' : 'looks');

export const afterAddingLook = (_mode: EffectsBarMode): EffectsBarMode => 'looks';

export const afterSettings = (mode: EffectsBarMode): EffectsBarMode => (mode === 'settings' ? 'base' : 'settings');

export const afterShowingApplied = (mode: EffectsBarMode, { hasLayers }: { readonly hasLayers: boolean }): EffectsBarMode => (hasLayers ? 'applied' : mode);

/** ‹ referme le panneau Réglages (#17947) ; ailleurs il quitte le mode (`null`). */
export const afterBack = (mode: EffectsBarMode): EffectsBarMode | null => (mode === 'settings' ? 'base' : null);

/** Échap, au clavier du web : referme le panneau ou la liste ; ailleurs il quitte le mode. */
export const afterEscape = (mode: EffectsBarMode): EffectsBarMode | null => (mode === 'settings' || mode === 'applied' ? 'base' : null);

export const reconciled = (mode: EffectsBarMode, { hasLayers }: { readonly hasLayers: boolean }): EffectsBarMode => (mode === 'applied' && !hasLayers ? 'base' : mode);

/** La puce pressée : celle du carrousel ouvert, aucune ailleurs. */
export const pressed = (genre: EffectGenre, mode: EffectsBarMode): EffectGenre | null => (mode === 'looks' ? genre : null);

export const showsLooks = (mode: EffectsBarMode): boolean => mode === 'base' || mode === 'looks';

export const showsCarousel = (mode: EffectsBarMode): boolean => mode === 'looks';
