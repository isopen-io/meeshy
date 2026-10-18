import type { CardOp } from './message-card-ops';
import type { CardLinkId } from './message-card-templates';

/**
 * **L'IMBRICATION D'UN FIL SUR LA CARTE** (#10915) — LOIS PURES, miroir exact de
 * `MessageCardThread.swift` (`packages/MeeshySDK/.../MessageCard/`) : mêmes noms,
 * mêmes constantes, même formule.
 *
 * Une réponse se lit RETIRÉE sous sa racine : chaque niveau décale le texte de
 * `THREAD_INDENT`, et une SÉPARATION précède chaque entrée de niveau ≥ 1. Cette
 * séparation est celle que le template configure déjà (sa liaison : orbite,
 * filet, guillemets, flèche, fil, bulles, silence) — pas de barre propre au fil.
 * Elle se dessine au retrait du niveau, sur `threadSeparatorWidth(level)`, et
 * donne aussi l'air entre deux entrées. Au-delà de `THREAD_MAX_LEVEL` niveaux on
 * ne creuse plus ; le texte d'un niveau garde `THREAD_MIN_WIDTH` au moins.
 */

export const THREAD_INDENT = 44;
export const THREAD_MAX_LEVEL = 3;
export const THREAD_MIN_WIDTH = 240;
/** La longueur de la séparation d'une entrée de niveau 1 ; elle décroît d'un `THREAD_INDENT` par niveau. */
export const THREAD_SEPARATOR_LENGTH = 160;
/** La hauteur de la ligne qui porte la séparation (et l'air entre deux entrées). */
export const THREAD_SEPARATOR_ROW = 40;

const clampLevel = (level: number): number => Math.min(THREAD_MAX_LEVEL, Math.max(0, Math.trunc(level)));

export const threadLevel = clampLevel;

/** Le retrait d'un niveau, du bord de départ du bloc. */
export const threadShift = (level: number): number => clampLevel(level) * THREAD_INDENT;

/** La longueur de la séparation d'un niveau : `160 − (niveau − 1) × 44`, au moins 44. */
export const threadSeparatorWidth = (level: number): number => Math.max(THREAD_INDENT, THREAD_SEPARATOR_LENGTH - (Math.max(1, level) - 1) * THREAD_INDENT);

/** La largeur de texte qui reste à un niveau dans `width`. */
export const threadRoom = (width: number, level: number): number => Math.max(THREAD_MIN_WIDTH, width - threadShift(level));

/** Combien de hauteur la séparation d'une entrée ajoute : rien au niveau 0, ou si la liaison du template ne dessine rien (« bulles », « silence »). */
export const threadSeparatorHeight = (link: CardLinkId, level: number): number => (level >= 1 && link !== 'bulles' && link !== 'silence' ? THREAD_SEPARATOR_ROW : 0);

/**
 * La séparation d'une entrée de fil : la liaison du template en version compacte,
 * au retrait du niveau — `x` est le bord de départ de l'entrée, `y` le haut de la ligne.
 */
export function threadSeparatorOps(link: CardLinkId, at: { readonly x: number; readonly y: number; readonly rtl: boolean; readonly level: number; readonly accent: string }): readonly CardOp[] {
  const { x, rtl, accent } = at;
  const y = at.y + THREAD_SEPARATOR_ROW / 2;
  const length = threadSeparatorWidth(at.level);
  const [x1, x2] = rtl ? [x - length, x] : [x, x + length];
  switch (link) {
    case 'orbite':
    case 'guillemets':
      return [{ kind: 'separator', x1, x2, y, radius: 0, color: accent, dash: [2, 14], lineWidth: 3 }];
    case 'filet':
    case 'fil':
      return [{ kind: 'separator', x1, x2, y, radius: 0, color: accent, dash: [], lineWidth: 4 }];
    case 'fleche':
      return [{ kind: 'text', text: rtl ? '↲' : '↳', x, y: y + 14, font: '700 40px sans-serif', color: accent, align: rtl ? 'right' : 'left', direction: 'ltr' }];
    case 'bulles':
    case 'silence':
      return [];
  }
}
