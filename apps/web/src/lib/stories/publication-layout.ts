import type { MosaicLayoutMode } from '@/lib/feed/mosaic-layout';

import type { PublicationKind } from './publication-kind';

/**
 * **CE QUE L'AUTEUR PUBLIE, EN UN GESTE** (#7684) — miroir de
 * `ComposerPublishChoice` (`ComposerPublishMenu.swift:16-20`) : le format ET
 * la disposition. `layout: null` ⇒ aucune disposition imposée, le repli du
 * modèle (`MOSAIC_FALLBACK_LAYOUT`) s'appliquera chez le lecteur. Le même
 * objet voyage du menu au corps de `POST /posts`, et survit à une intention
 * armée hors ligne comme à un échec.
 */
export type PublishChoice = { readonly kind: PublicationKind; readonly layout: MosaicLayoutMode | null };

/**
 * **LE SOUS-MENU DES AGENCEMENTS, POUR "POST" SEUL** — miroir de
 * `ComposerMosaicChoice.isServed(slideCount:format:)` et de
 * `ComposerPublishMenuRule.entries` (`ComposerPublishMenu.swift:68-84`).
 *
 * Ce qui est compté est ce qui PARTIRA : une page sans matière ne produit
 * aucune scène (`composeStoryCanvasPages`), donc elle ne compte pas — sinon le
 * sous-menu s'offrirait pour un document d'UNE scène, dont `layout` serait
 * retiré à la composition : un contrôle sans effet (loi 4).
 *
 * Jamais pour une STORY : son canal publie UN post PAR page
 * (`ComposerPublishChannel.swift:79-104`) — une story de plusieurs pages est
 * REFUSÉE avec sa raison tant que ce canal n'est pas écrit
 * (`studioPublishRefusal`). Jamais pour un RÉEL : `ComposerPublishMenu.swift:73`
 * ne déplie que Post.
 */
export function layoutIsServed(params: { readonly publishablePageCount: number; readonly kind: PublicationKind }): boolean {
  return params.kind === 'POST' && params.publishablePageCount > 1;
}

/**
 * L'ORDRE du sous-menu — le repli (`carousel`) D'ABORD, « pour que le premier
 * de la liste soit ce qu'on obtient sans rien choisir »
 * (`ComposerMosaicChoice.swift:190`). Gardé contre la source Swift par
 * `check-curve` (PARTIE 12, `scripts/lib/curve-mosaic-layout.mjs`) : un ordre
 * écrit à la main sans gate serait la jumelle que D-4 interdit.
 *
 * Distinct de `MOSAIC_LAYOUT_MODES` (`lib/feed/mosaic-layout.ts`), l'ordre de
 * la GÉOMÉTRIE. Ce module n'en importe que le TYPE : la géométrie des cinq
 * modes ne se charge qu'avec leurs glyphes (`components/layout-mark.tsx`, à la
 * demande), jamais sur le chemin statique du studio.
 */
export const PUBLICATION_LAYOUT_ORDER: readonly MosaicLayoutMode[] = ['carousel', 'reel', 'hero', 'wave', 'sine'];

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

/** La clé du libellé d'un mode — `ComposerMosaicChoice.swift:207-224`. */
export function publicationLayoutLabelKey(mode: MosaicLayoutMode): PublicationLayoutLabelKey {
  return LAYOUT_LABEL_KEY[mode];
}
