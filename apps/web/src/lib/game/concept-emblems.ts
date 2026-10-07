import type { GamePaint } from './materials';

/**
 * LES EMBLÈMES DE POINTS, D'ÉLANS ET DU TABLEAU DE BORD (#9563, amendement
 * n° 2) — leur GÉOMÉTRIE, dans un carré de 72 (celui des badges). Une table, pas
 * du JSX : le web la dessine (`components/game/concept-emblem.tsx`), l'app iOS
 * la recopie forme pour forme.
 *
 * Chaque emblème est UNE matière du jeu (`materials.ts`), la Signature gravée
 * dedans, et un accent qui dit le concept :
 *
 *   · Points          — un jeton rond indigo ; une étincelle d'or à quatre
 *                       branches, en haut à droite : un geste vient de rapporter ;
 *   · Élans           — un carré arrondi couleur de flamme ; un chevron qui monte
 *                       au-dessus de la Signature : ce qui pousse plus haut ;
 *   · Tableau de bord — un panneau d'argent ; la Signature à gauche comme trois
 *                       lignes de lecture, trois barres qui grandissent à droite.
 *
 * Aucune couleur ici : `paint` nomme une peinture (`--game-<peinture>-<i>`),
 * `tone` un jeton d'accent.
 */

export const CONCEPT_EMBLEM_BOX = 72;

export type ConceptEmblemKind = 'points' | 'elans' | 'dashboard';

export type EmblemBody =
  | { readonly shape: 'circle'; readonly cx: number; readonly cy: number; readonly r: number }
  | { readonly shape: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rx: number };

/** `ink` : l'encre de la matière ; `gold` : la peinture or ; `brand` : l'indigo de la marque. */
export type EmblemTone = 'ink' | 'gold' | 'brand';

export type EmblemAccent =
  /** Une forme pleine, donnée par son tracé. */
  | { readonly kind: 'spark'; readonly d: string; readonly tone: EmblemTone }
  /** Un trait à bouts ronds. */
  | { readonly kind: 'chevron'; readonly d: string; readonly strokeWidth: number; readonly tone: EmblemTone }
  /** Un rectangle arrondi plein. */
  | { readonly kind: 'bar'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rx: number; readonly tone: EmblemTone };

export type ConceptEmblemDesign = {
  readonly paint: GamePaint;
  readonly body: EmblemBody;
  /** Le centre et le côté de la Signature (carré de 1 024 ramené à `size`), et l'épaisseur de son trait dans ce repère. */
  readonly signature: { readonly cx: number; readonly cy: number; readonly size: number; readonly strokeWidth: number };
  readonly accents: readonly EmblemAccent[];
};

export const CONCEPT_EMBLEMS: Readonly<Record<ConceptEmblemKind, ConceptEmblemDesign>> = {
  points: {
    paint: 'indigo',
    body: { shape: 'circle', cx: 34, cy: 38, r: 28 },
    signature: { cx: 34, cy: 38, size: 38, strokeWidth: 100 },
    accents: [{ kind: 'spark', d: 'M56 4 L59 13 L68 16 L59 19 L56 28 L53 19 L44 16 L53 13 Z', tone: 'gold' }],
  },
  elans: {
    paint: 'flame',
    body: { shape: 'rect', x: 8, y: 8, width: 56, height: 56, rx: 18 },
    signature: { cx: 36, cy: 47, size: 32, strokeWidth: 104 },
    accents: [{ kind: 'chevron', d: 'M23 30 L36 17 L49 30', strokeWidth: 6, tone: 'ink' }],
  },
  dashboard: {
    paint: 'silver',
    body: { shape: 'rect', x: 6, y: 12, width: 60, height: 48, rx: 12 },
    signature: { cx: 26, cy: 36, size: 30, strokeWidth: 104 },
    accents: [
      { kind: 'bar', x: 41, y: 38, width: 5, height: 12, rx: 2.5, tone: 'brand' },
      { kind: 'bar', x: 48.5, y: 30, width: 5, height: 20, rx: 2.5, tone: 'brand' },
      { kind: 'bar', x: 56, y: 22, width: 5, height: 28, rx: 2.5, tone: 'brand' },
    ],
  },
};
