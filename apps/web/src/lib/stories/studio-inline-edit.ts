import type { InterfaceCatalogKey } from '@/lib/i18n-catalog';

/**
 * **TEXTE, CALQUE ET FOND S'ÉDITENT DANS LA VUE DE BASE** (#9140, jumelle web
 * de `ComposerInlineEditing` iOS, #9138 — directive porteur 2026-10-02) :
 *
 * > « […] avec les options des outils qui s'ouvrent à droite partant du haut
 * > (s'assurer de prendre l'espace disponible pour ne pas avoir de l'espace
 * > perdu sur la rangée de droite comme de gauche). »
 *
 * Éditer un objet — le poser, le double-toucher, « Modifier » — mène au MÊME
 * état que le fond (#8849) : ses sous-outils au rail droit, puis ses gestes,
 * puis `(x)`. Toucher un sous-outil ouvre ses options dans un panneau de verre
 * à droite, depuis le haut ; le retoucher les range. Aucune plaque en bas,
 * aucune vue de plus. Règles pures ; l'écran les relaie.
 */

/** Les sous-outils d'un TEXTE — `TextEditTool.all` d'iOS (police, effet,
 * couleur, alignement, fond, langue ; le cadre et la bordure n'existent pas
 * au web), puis la POSE, que le web rend atteignable au clavier (dimension 5). */
export type StudioTextSection = 'style' | 'effect' | 'color' | 'align' | 'background' | 'language' | 'pose';

/** Les sous-outils d'un CALQUE — sa légende et son texte alternatif, son
 * filtre, sa pose. */
export type StudioOverlaySection = 'describe' | 'filter' | 'pose';

export type StudioInlineSection = StudioTextSection | StudioOverlaySection;

export type StudioInlineFamily = 'text' | 'overlay';

/** Le nom de chaque sous-outil, celui que sa section porte déjà dans le
 * panneau — une tuile et son panneau disent le même mot. */
export const STUDIO_INLINE_SECTION_KEYS = {
  style: 'story.studio.editor.style',
  effect: 'story.studio.editor.effect',
  color: 'story.studio.editor.color',
  align: 'story.studio.editor.align',
  background: 'story.studio.editor.background',
  language: 'story.studio.editor.language',
  pose: 'story.studio.pose.label',
  describe: 'story.studio.background.tools.describe',
  filter: 'story.studio.editor.filter',
} as const satisfies Record<StudioInlineSection, InterfaceCatalogKey>;

const TEXT_SECTIONS: readonly StudioTextSection[] = ['style', 'effect', 'color', 'align', 'background', 'language', 'pose'];
const OVERLAY_SECTIONS: readonly StudioOverlaySection[] = ['describe', 'filter', 'pose'];

export function studioInlineSections({ family }: { readonly family: StudioInlineFamily }): readonly StudioInlineSection[] {
  return family === 'text' ? TEXT_SECTIONS : OVERLAY_SECTIONS;
}

/** Toucher un sous-outil ouvre ses options ; toucher l'ouvert les range — les
 * sous-outils, eux, restent jusqu'au `(x)`. La même loi que le fond
 * (`studioBackgroundToolTapped`). */
export function studioInlineSectionTapped<S extends string>(section: S, open: S | null): S | null {
  return open === section ? null : section;
}

/** Une section que l'objet ne sert plus se range ; l'édition reste. */
export function studioInlineSectionResolved<S extends string>(open: S | null, served: readonly S[]): S | null {
  return open !== null && served.includes(open) ? open : null;
}

/**
 * **LA PLACE DU PANNEAU** (`ComposerInlinePanelLayout` iOS) — aligné sur le
 * haut de la colonne droite (`top-2`), du bord de début (la marge des rails,
 * `start-2.5`) jusqu'à la colonne des sous-outils (marge, disque de 44 px et
 * son anneau de 2 px de chaque côté, gouttière de 8). Les portes du couloir
 * gauche cèdent pendant l'édition : aucun couloir n'est réservé de ce côté.
 * Au bureau, une carte de 320 px à côté du rail (`roomyPanelWidth`). La
 * hauteur épouse le contenu jusqu'à toute la hauteur libre, puis défile.
 */
export const STUDIO_INLINE_PANEL = { top: 8, start: 10, end: 10 + 48 + 8, roomyWidth: 320 } as const;
