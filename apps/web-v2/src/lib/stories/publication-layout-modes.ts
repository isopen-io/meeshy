import { MOSAIC_LAYOUT_MODES, type MosaicLayoutMode } from '@/lib/feed/mosaic-layout';

/**
 * **L'ORDRE ET LES LIBELLÉS DU SOUS-MENU DE DISPOSITION** (#7684) — séparés de
 * `publication-layout.ts` (qui ne porte que `layoutIsServed`, sur le chemin
 * STATIQUE du studio) parce que ce module-ci tire `lib/feed/mosaic-layout.ts`
 * (la géométrie des cinq modes) : le sous-menu ne s'ouvre qu'au geste de
 * l'auteur, donc ce poids est chargé À LA DEMANDE par
 * `components/publish-layout-menu.tsx`, jamais au premier rendu du studio.
 */

/**
 * L'ORDRE du sous-menu — le repli (`carousel`) D'ABORD, « pour que le premier
 * de la liste soit ce qu'on obtient sans rien choisir »
 * (`ComposerMosaicChoice.swift:190`). Distinct de `MOSAIC_LAYOUT_MODES`
 * (`lib/feed/mosaic-layout.ts`), qui énumère dans l'ordre de sa GÉOMÉTRIE —
 * un ordre de menu et un ordre de rendu répondent à des questions
 * différentes, même quand ils partagent les cinq mêmes valeurs.
 */
export const PUBLICATION_LAYOUT_ORDER: readonly MosaicLayoutMode[] = ['carousel', 'reel', 'hero', 'wave', 'sine'];

/** Épingle que les deux ordres restent la MÊME PALETTE de cinq modes — un
 * mode ajouté à l'un sans l'autre serait absent du menu ou du rendu. */
export const publicationLayoutOrderCoversAllModes = (): boolean =>
  new Set(PUBLICATION_LAYOUT_ORDER).size === MOSAIC_LAYOUT_MODES.length &&
  MOSAIC_LAYOUT_MODES.every((mode) => PUBLICATION_LAYOUT_ORDER.includes(mode));

export type PublicationLayoutLabelKey =
  | 'story.studio.layout.carousel'
  | 'story.studio.layout.reel'
  | 'story.studio.layout.hero'
  | 'story.studio.layout.wave'
  | 'story.studio.layout.sine';

const LAYOUT_LABEL_KEY: Readonly<Record<MosaicLayoutMode, PublicationLayoutLabelKey>> = {
  carousel: 'story.studio.layout.carousel',
  reel: 'story.studio.layout.reel',
  hero: 'story.studio.layout.hero',
  wave: 'story.studio.layout.wave',
  sine: 'story.studio.layout.sine',
};

/** La clé de traduction du libellé d'un mode — `ComposerMosaicChoice.swift:207-224`
 * (« Image par image », « Défilement continu », « Une grande, les autres à
 * côté », « En vague », « En zigzag »). Une union LITTÉRALE, jamais `string` :
 * `translate()` infère depuis elle si la clé attend des paramètres — un
 * retour large aurait forcé tout appelant à en fournir un. */
export function publicationLayoutLabelKey(mode: MosaicLayoutMode): PublicationLayoutLabelKey {
  return LAYOUT_LABEL_KEY[mode];
}
