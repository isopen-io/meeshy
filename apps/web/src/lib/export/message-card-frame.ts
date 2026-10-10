import type { CardTextOp } from './message-card-ops';
import { textDirection, truncateLines, type Measure } from './message-card-text';

/**
 * **LE CADRE D'UNE CARTE — L'ONGLET « FRAME »** (#8693, jumelle de #8692).
 *
 * Le FORMAT d'abord : la carte « ajustée » (1080 de large, une hauteur qui
 * suit le texte entre le carré et la story) ou un format FIXE — Story 9:16,
 * Portrait 4:5, Carré 1:1, Paysage 16:9. Un format fixe centre le contenu et
 * réduit les polices jusqu'à ce qu'il tienne, exactement comme la carte ajustée
 * au-delà de son plafond.
 *
 * Puis les DISPOSITIONS : l'en-tête (titre, date) couché dans la marge — lettre
 * à lettre, tourné vers le haut ou vers le bas —, les noms au-dessus du message
 * ou à sa fin, l'heure de chaque message, et une légère rotation du message.
 * Aucune n'ajoute de contenu : le cadre choisit comment MONTRER ce qui existe.
 */

export const CARD_ASPECTS = ['auto', 'story', 'portrait', 'square', 'landscape'] as const;
export type CardAspect = (typeof CARD_ASPECTS)[number];

export const CARD_ASPECT_SIZE: Readonly<Record<Exclude<CardAspect, 'auto'>, { readonly width: number; readonly height: number }>> = {
  story: { width: 1080, height: 1920 },
  portrait: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
};

export const CARD_HEADER_ORIENTATIONS = ['horizontal', 'letters', 'up', 'down'] as const;
/** `letters` : une lettre sous l'autre ; `up` / `down` : le texte couché, lu vers le haut ou vers le bas. */
export type CardHeaderOrientation = (typeof CARD_HEADER_ORIENTATIONS)[number];

export const CARD_AUTHOR_PLACEMENTS = ['top', 'end'] as const;
export type CardAuthorPlacement = (typeof CARD_AUTHOR_PLACEMENTS)[number];

export const CARD_TILTS = ['none', 'left', 'right'] as const;
export type CardTilt = (typeof CARD_TILTS)[number];

/** Trois degrés : assez pour qu'on la voie, jamais assez pour sortir un coin de la carte. */
export const CARD_TILT_RADIANS: Readonly<Record<CardTilt, number>> = { none: 0, left: -Math.PI / 60, right: Math.PI / 60 };

export type CardFrame = {
  readonly header: CardHeaderOrientation;
  readonly authors: CardAuthorPlacement;
  readonly tilt: CardTilt;
};

export const DEFAULT_CARD_FRAME: CardFrame = { header: 'horizontal', authors: 'top', tilt: 'none' };

/**
 * LA LIGNE D'IDENTITÉ D'UN BLOC — le nom, l'heure, ou les deux. À la fin du
 * message, elle se signe d'un tiret, comme une citation qu'on attribue.
 */
export function metaLine(author: string | null, time: string | null, placement: CardAuthorPlacement): string | null {
  const parts = [author, time].filter((part): part is string => part !== null && part.trim() !== '');
  if (parts.length === 0) return null;
  const line = parts.join(' · ');
  return placement === 'end' && author !== null && author.trim() !== '' ? `— ${line}` : line;
}

const SIDE_SIZE = 30;
const LETTER_STEP = 38;

/**
 * L'EN-TÊTE COUCHÉ DANS LA MARGE — la marge de début (gauche, droite pour un
 * texte arabe) est large de `margin` ; la colonne s'y centre. Le contenu ne
 * bouge pas : un en-tête vertical ne coûte aucune ligne à la réponse.
 */
export function sideHeaderOps(params: {
  readonly text: string;
  readonly orientation: Exclude<CardHeaderOrientation, 'horizontal'>;
  readonly width: number;
  readonly height: number;
  readonly margin: number;
  readonly padY: number;
  readonly font: (size: number) => string;
  readonly color: string;
  readonly measure: Measure;
}): { readonly ops: readonly CardTextOp[]; readonly x: number; readonly top: number; readonly bottom: number } {
  const { text, orientation, width, height, margin, padY, color, measure } = params;
  const direction = textDirection(text);
  const x = direction === 'rtl' ? width - margin / 2 : margin / 2;
  const font = params.font(SIDE_SIZE);
  const span = height - 2 * padY;

  if (orientation === 'letters') {
    const room = Math.max(1, Math.floor(span / LETTER_STEP));
    const graphemes = Array.from(text.replace(/\s+/g, ' '));
    const kept = graphemes.length <= room ? graphemes : [...graphemes.slice(0, room - 1), '…'];
    const top = padY + Math.floor((span - kept.length * LETTER_STEP) / 2);
    const ops = kept.flatMap((letter, i): CardTextOp[] =>
      letter === ' ' ? [] : [{ kind: 'text', text: letter, x, y: top + (i + 1) * LETTER_STEP - 8, font, color, align: 'center', direction: 'ltr' }],
    );
    return { ops, x, top, bottom: top + kept.length * LETTER_STEP };
  }

  const [line = text] = truncateLines([text], 1, span, font, measure);
  const length = Math.min(span, measure(line, font));
  const middle = height / 2;
  const rotate = orientation === 'up' ? -Math.PI / 2 : Math.PI / 2;
  return {
    ops: [{ kind: 'text', text: line, x, y: middle, font, color, align: 'center', direction, rotate }],
    x,
    top: middle - length / 2,
    bottom: middle + length / 2,
  };
}
