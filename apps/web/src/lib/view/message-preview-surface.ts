import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { MessageMenuBubbleSpan } from './popover';

/**
 * LA SURFACE DE L'APERÇU, PAR MODE DE LECTURE (décision #11204, lot #11206) —
 * l'aperçu d'un message tenu longuement suit le mode de lecture de la
 * conversation, Focal compris. Le clone porte déjà la PEAU du mode (rangée
 * plate ou bulle) ; cette table dit seulement ce que l'HÔTE lui ajoute pour
 * qu'il se décolle du voile sans cesser d'être la rangée :
 *
 * - `card` — une carte OPAQUE à marges : la rangée plate de Focal n'a ni fond
 *   ni rayon, et se confondait avec le voile flouté (iOS pose
 *   `ThemedMessageBubble` opaque même en Focal). Le Résumé se présente pareil.
 * - `margins` — Script garde la LÉGÈRETÉ du script : du VERRE (`.glass`, le
 *   site unique de la matière translucide, `styles/glass.css` — pas la carte
 *   opaque de Focal) et des marges pour que son texte ne colle plus au bord de
 *   l'aperçu. Jamais transparent : un texte nu sur le voile flouté s'y
 *   confondait (revue #5814, défaut majeur 11), l'ombre seule ne le décollait
 *   pas.
 * - `none` — une bulle porte déjà sa surface ; une seconde, carrée, déborderait
 *   de ses coins. La Rivière rend des bulles.
 */

export type PreviewSurfaceKind = 'card' | 'margins' | 'none';

export type PreviewSurface = {
  readonly kind: PreviewSurfaceKind;
  /** Marge interne de l'hôte, en px. */
  readonly padding: number;
  /** Fond OPAQUE de l'hôte (jeton de couleur) ; `null` : aucun. */
  readonly background: string | null;
  /** L'hôte porte la matière de verre (`.glass`) — jamais un ton translucide
   * écrit ici (`scripts/lib/glass-site.mjs`). */
  readonly glass: boolean;
  readonly radius: number;
};

/** La marge interne d'une rangée plate dans l'aperçu. */
export const PREVIEW_SURFACE_PADDING = 12;

const CARD: PreviewSurface = { kind: 'card', padding: PREVIEW_SURFACE_PADDING, background: 'var(--color-ios-surface)', glass: false, radius: 14 };
const MARGINS: PreviewSurface = { kind: 'margins', padding: PREVIEW_SURFACE_PADDING, background: null, glass: true, radius: 14 };
const NONE: PreviewSurface = { kind: 'none', padding: 0, background: null, glass: false, radius: 0 };

const SURFACES = {
  focal: CARD,
  script: MARGINS,
  bubbles: NONE,
  summary: CARD,
  river: NONE,
} as const satisfies Readonly<Record<ConversationReadingMode, PreviewSurface>>;

const isReadingMode = (value: string | null): value is ConversationReadingMode => value !== null && Object.hasOwn(SURFACES, value);

export function previewSurfaceOf(mode: ConversationReadingMode): PreviewSurface {
  return SURFACES[mode];
}

/**
 * LE MODE DE LA RANGÉE PRESSÉE — lu sur le DOM qu'on clone, jamais redécidé :
 * `FocalRow` pose `data-reading-mode` sur sa racine, `Bubble` ne pose rien.
 * Une valeur hors du schéma retombe sur Bulles — aucune surface inventée.
 */
export function readingModeOfRow(row: Element): ConversationReadingMode {
  const declared = row.querySelector('[data-reading-mode]')?.getAttribute('data-reading-mode') ?? row.getAttribute('data-reading-mode');
  return isReadingMode(declared) ? declared : 'bubbles';
}

/**
 * LA BULLE DE LA RANGÉE PRESSÉE (#12635) — l'ancre horizontale du menu en
 * Bulles : `Bubble` enveloppe sa colonne (contenu, pied, drapeaux) dans
 * `.thread-bubble-measure`, la boîte que `thread-column.css` borne à 70 %.
 * Une rangée plate n'en porte aucune ; une bulle sans mise en page non plus.
 */
const BUBBLE_SELECTOR = '.thread-bubble-measure';

export function bubbleSpanOfRow(row: Element): MessageMenuBubbleSpan | undefined {
  const rect = row.querySelector(BUBBLE_SELECTOR)?.getBoundingClientRect();
  if (rect === undefined || rect.width <= 0) return undefined;
  return { left: rect.left, right: rect.right };
}
