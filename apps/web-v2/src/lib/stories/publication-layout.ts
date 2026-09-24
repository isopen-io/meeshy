import type { PublicationKind } from './publication-kind';

/**
 * **LE SOUS-MENU DES AGENCEMENTS, POUR "POST" SEUL** (#7684) — miroir de
 * `ComposerMosaicChoice.isServed(slideCount:format:)` et de
 * `ComposerPublishMenuRule.entries` (`ComposerPublishMenu.swift:68-84`,
 * spécification §1.4) : le sous-menu est offert **si et seulement si** le
 * format publié est POST et que le document porte AU MOINS DEUX pages.
 *
 * Jamais pour une STORY : son canal publie UN post PAR page
 * (`ComposerPublishChannel.swift:79-104`, canal `.scene`) — la story
 * « N posts » n'est pas encore écrite côté web (question 9.4, #7684 § 1.6,
 * suivi ouvert). Jamais non plus pour un RÉEL : le canal `.document` existe
 * côté iOS, mais l'offrir ici sortirait du périmètre de ce lot — consigné,
 * pas soldé.
 *
 * **CE FICHIER RESTE DÉLIBÉRÉMENT NU** (#7684, revue-correction du poids) :
 * `PublishSplitButton` (`components/publish-split-button.tsx`) l'importe pour
 * DÉCIDER si la ligne « Post » porte un chevron, AVANT même que le menu ne
 * s'ouvre — donc sur le chemin STATIQUE du chunk `story_studio` (plafond
 * mesuré à 0,84 Ko de marge, #7683). L'ORDRE, les LIBELLÉS et le GLYPHE du
 * sous-menu vivent dans `publication-layout-modes.ts`, chargé À LA DEMANDE
 * par `components/publish-layout-menu.tsx` — seulement quand l'auteur ouvre
 * effectivement le sous-menu. Fusionner les deux ferait payer sa géométrie
 * (`mosaicTiles`, `lib/feed/mosaic-layout.ts`) à CHAQUE studio, même celui
 * d'une story sans deuxième page.
 */
export function layoutIsServed(params: { readonly pageCount: number; readonly kind: PublicationKind }): boolean {
  return params.kind === 'POST' && params.pageCount > 1;
}
