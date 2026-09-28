import { MESSAGE_CARD_STYLES, canvasFont, type MessageCardStyleId } from './message-card-styles';

/**
 * **LA MISE EN PAGE D'UNE CARTE D'EXPORT** — LOI PURE : aucun canvas, aucun
 * DOM. Elle reçoit une fonction de MESURE (`ctx.measureText` en production,
 * une règle fixe dans les témoins) et rend la liste des opérations à peindre.
 *
 * LA LECTURE DE HAUT EN BAS EST CELLE DU FIL :
 *  1. le message CITÉ — en entier, en taille RÉDUITE, sous un filet ;
 *  2. le séparateur « ——— ○ ——— » ;
 *  3. la RÉPONSE, en bas, dans la police du style et en grand ;
 *  4. le pied : la marque Meeshy et « Exporté par … ».
 * Un filigrane diagonal (Meeshy · l'exportateur) couvre le fond.
 *
 * LA CARTE S'ADAPTE AU TEXTE, JAMAIS L'INVERSE : 1080 px de large (le format
 * des réseaux), une hauteur entre le carré (1080) et le format story (1920).
 * Un texte court est centré dans un carré ; un texte long réduit ses polices
 * pas à pas jusqu'à un plancher lisible, et ce n'est qu'au plancher qu'il est
 * tronqué d'une ellipse — la citation d'abord, la réponse en dernier.
 */

export type Measure = (text: string, font: string) => number;

export type MessageCardPart = {
  readonly author: string;
  readonly text: string;
};

export type MessageCardInput = {
  /** Le message auquel on répond — `null` pour un message isolé. */
  readonly quoted: MessageCardPart | null;
  readonly reply: MessageCardPart;
  /** Le nom de qui exporte : il signe le pied et le filigrane. */
  readonly exporter: string;
  /** « Exporté par {name} », déjà dans la langue d'INTERFACE : cette loi n'en connaît aucune. */
  readonly footerLabel: string;
  readonly style: MessageCardStyleId;
};

export type CardTextOp = {
  readonly kind: 'text';
  readonly text: string;
  readonly x: number;
  /** La ligne de base. */
  readonly y: number;
  readonly font: string;
  readonly color: string;
  readonly align: 'left' | 'right' | 'center';
  readonly direction: 'ltr' | 'rtl';
};

export type CardBarOp = {
  readonly kind: 'bar';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
};

export type CardSeparatorOp = {
  readonly kind: 'separator';
  readonly x1: number;
  readonly x2: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
  readonly dash: readonly number[];
};

export type CardOp = CardTextOp | CardBarOp | CardSeparatorOp;

export type CardLayout = {
  readonly width: number;
  readonly height: number;
  readonly ops: readonly CardOp[];
  /** Le motif du filigrane diagonal. */
  readonly watermark: string;
  /** Vrai quand, au plancher des polices, un texte a dû être coupé. */
  readonly truncated: boolean;
};

export const CARD_WIDTH = 1080;
export const CARD_MIN_HEIGHT = 1080;
export const CARD_MAX_HEIGHT = 1920;

const PAD_X = 96;
const PAD_TOP = 136;
const FOOTER_HEIGHT = 176;
const QUOTE_INDENT = 40;
const BAR_WIDTH = 6;
const AUTHOR_SIZE = 30;
const AUTHOR_LINE = 44;
const AUTHOR_GAP = 14;
const SEPARATOR_BLOCK = 132;
const REPLY_START = 68;
const REPLY_FLOOR = 36;
const QUOTE_START = 40;
const QUOTE_FLOOR = 26;
const REPLY_LEADING = 1.3;
const QUOTE_LEADING = 1.38;
const SHRINK = 0.92;
const ELLIPSIS = '…';

const RTL_STRONG = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_STRONG = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

/** Le sens d'un texte — celui de son PREMIER caractère fort, comme `dir="auto"`. */
export function textDirection(text: string): 'ltr' | 'rtl' {
  for (const ch of text) {
    if (RTL_STRONG.test(ch)) return 'rtl';
    if (LTR_STRONG.test(ch)) return 'ltr';
  }
  return 'ltr';
}

/**
 * Coupe un texte en lignes qui tiennent dans `maxWidth`. Les sauts de ligne
 * de l'auteur sont gardés ; un mot plus large que la ligne (une URL, un mot
 * allemand) est coupé par graphème plutôt que de déborder de la carte.
 */
export function wrapText(text: string, maxWidth: number, font: string, measure: Measure): string[] {
  const lines: string[] = [];
  const fits = (candidate: string) => measure(candidate, font) <= maxWidth;
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    const words = paragraph.split(/\s+/).filter((word) => word !== '');
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current === '' ? word : `${current} ${word}`;
      if (fits(candidate)) {
        current = candidate;
        continue;
      }
      if (current !== '') lines.push(current);
      current = '';
      if (fits(word)) {
        current = word;
        continue;
      }
      for (const ch of Array.from(word)) {
        if (current !== '' && !fits(current + ch)) {
          lines.push(current);
          current = ch;
        } else {
          current += ch;
        }
      }
    }
    if (current !== '') lines.push(current);
  }
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  /* Deux lignes vides d'affilée n'ajoutent rien à une image : une seule suffit. */
  return lines.filter((line, i) => !(line === '' && lines[i - 1] === ''));
}

/** Garde `count` lignes et termine la dernière par une ellipse qui tient dans la ligne. */
export function truncateLines(lines: readonly string[], count: number, maxWidth: number, font: string, measure: Measure): string[] {
  if (lines.length <= count) return [...lines];
  const kept = lines.slice(0, Math.max(1, count));
  let last = Array.from(kept[kept.length - 1] ?? '');
  while (last.length > 0 && measure(`${last.join('').trimEnd()}${ELLIPSIS}`, font) > maxWidth) last = last.slice(0, -1);
  kept[kept.length - 1] = `${last.join('').trimEnd()}${ELLIPSIS}`;
  return kept;
}

type Sized = {
  readonly replySize: number;
  readonly quoteSize: number;
  readonly replyFont: string;
  readonly quoteFont: string;
  readonly replyLines: string[];
  readonly quoteLines: string[];
};

const replyLineHeight = (size: number) => Math.round(size * REPLY_LEADING);
const quoteLineHeight = (size: number) => Math.round(size * QUOTE_LEADING);

function contentHeight(sized: Sized, hasQuote: boolean): number {
  const quote = hasQuote ? AUTHOR_LINE + AUTHOR_GAP + sized.quoteLines.length * quoteLineHeight(sized.quoteSize) + SEPARATOR_BLOCK : 0;
  return quote + AUTHOR_LINE + AUTHOR_GAP + sized.replyLines.length * replyLineHeight(sized.replySize);
}

export function layoutMessageCard(input: MessageCardInput, measure: Measure): CardLayout {
  const style = MESSAGE_CARD_STYLES[input.style];
  const textWidth = CARD_WIDTH - 2 * PAD_X;
  const quoteWidth = textWidth - QUOTE_INDENT;
  const hasQuote = input.quoted !== null && input.quoted.text.trim() !== '';
  const budget = CARD_MAX_HEIGHT - PAD_TOP - FOOTER_HEIGHT;

  const sizeAt = (step: number): Sized => {
    const replySize = Math.max(REPLY_FLOOR, REPLY_START * SHRINK ** step);
    const quoteSize = Math.max(QUOTE_FLOOR, QUOTE_START * SHRINK ** step);
    const replyFont = canvasFont(style.replyFont, replySize);
    const quoteFont = canvasFont(style.quoteFont, quoteSize);
    return {
      replySize,
      quoteSize,
      replyFont,
      quoteFont,
      replyLines: wrapText(input.reply.text, textWidth, replyFont, measure),
      quoteLines: hasQuote ? wrapText(input.quoted?.text ?? '', quoteWidth, quoteFont, measure) : [],
    };
  };

  let step = 0;
  let sized = sizeAt(step);
  while (contentHeight(sized, hasQuote) > budget && (sized.replySize > REPLY_FLOOR || sized.quoteSize > QUOTE_FLOOR)) {
    step += 1;
    sized = sizeAt(step);
  }

  let truncated = false;
  if (contentHeight(sized, hasQuote) > budget) {
    truncated = true;
    const quoteLH = quoteLineHeight(sized.quoteSize);
    const replyLH = replyLineHeight(sized.replySize);
    const fixed = (hasQuote ? AUTHOR_LINE + AUTHOR_GAP + SEPARATOR_BLOCK : 0) + AUTHOR_LINE + AUTHOR_GAP;
    const room = budget - fixed;
    /* La citation cède d'abord : au plus un tiers de la place, deux lignes au moins. */
    const quoteKeep = hasQuote ? Math.min(sized.quoteLines.length, Math.max(2, Math.floor((room * 0.3) / quoteLH))) : 0;
    const replyKeep = Math.max(1, Math.floor((room - quoteKeep * quoteLH) / replyLH));
    sized = {
      ...sized,
      quoteLines: truncateLines(sized.quoteLines, quoteKeep, quoteWidth, sized.quoteFont, measure),
      replyLines: truncateLines(sized.replyLines, replyKeep, textWidth, sized.replyFont, measure),
    };
  }

  const content = contentHeight(sized, hasQuote);
  const height = truncated ? CARD_MAX_HEIGHT : Math.min(CARD_MAX_HEIGHT, Math.max(CARD_MIN_HEIGHT, PAD_TOP + content + FOOTER_HEIGHT));
  /* Un texte court flotte au milieu de l'espace libre, jamais collé en haut. */
  let y = PAD_TOP + Math.max(0, Math.floor((height - PAD_TOP - FOOTER_HEIGHT - content) / 2));

  const ops: CardOp[] = [];
  const authorFont = canvasFont({ family: null, weight: 600, style: 'normal' }, AUTHOR_SIZE);
  const author = (name: string, x: number, direction: 'ltr' | 'rtl') => {
    ops.push({ kind: 'text', text: name, x, y: y + AUTHOR_SIZE, font: authorFont, color: style.authorInk, align: direction === 'rtl' ? 'right' : 'left', direction });
    y += AUTHOR_LINE + AUTHOR_GAP;
  };

  if (hasQuote && input.quoted !== null) {
    const direction = textDirection(input.quoted.text);
    const rtl = direction === 'rtl';
    const lh = quoteLineHeight(sized.quoteSize);
    const top = y;
    author(input.quoted.author, rtl ? CARD_WIDTH - PAD_X - QUOTE_INDENT : PAD_X + QUOTE_INDENT, textDirection(input.quoted.author));
    for (const line of sized.quoteLines) {
      ops.push({ kind: 'text', text: line, x: rtl ? CARD_WIDTH - PAD_X - QUOTE_INDENT : PAD_X + QUOTE_INDENT, y: y + Math.round(sized.quoteSize), font: sized.quoteFont, color: style.quoteInk, align: rtl ? 'right' : 'left', direction });
      y += lh;
    }
    ops.push({ kind: 'bar', x: rtl ? CARD_WIDTH - PAD_X - BAR_WIDTH : PAD_X, y: top, width: BAR_WIDTH, height: y - top, color: style.accent });
    ops.push({ kind: 'separator', x1: PAD_X, x2: CARD_WIDTH - PAD_X, y: y + SEPARATOR_BLOCK / 2, radius: 11, color: style.accent, dash: style.separatorDash });
    y += SEPARATOR_BLOCK;
  }

  const direction = textDirection(input.reply.text);
  const rtl = direction === 'rtl';
  author(input.reply.author, rtl ? CARD_WIDTH - PAD_X : PAD_X, textDirection(input.reply.author));
  const lh = replyLineHeight(sized.replySize);
  for (const line of sized.replyLines) {
    ops.push({ kind: 'text', text: line, x: rtl ? CARD_WIDTH - PAD_X : PAD_X, y: y + Math.round(sized.replySize), font: sized.replyFont, color: style.replyInk, align: rtl ? 'right' : 'left', direction });
    y += lh;
  }

  const footerY = height - Math.round(FOOTER_HEIGHT / 2) + 12;
  ops.push({ kind: 'text', text: 'Meeshy', x: PAD_X, y: footerY, font: canvasFont({ family: null, weight: 800, style: 'normal' }, 40), color: style.footerInk, align: 'left', direction: 'ltr' });
  ops.push({ kind: 'text', text: input.footerLabel, x: CARD_WIDTH - PAD_X, y: footerY, font: canvasFont({ family: null, weight: 500, style: 'normal' }, 26), color: style.footerInk, align: 'right', direction: textDirection(input.footerLabel) });

  return { width: CARD_WIDTH, height, ops, watermark: `Meeshy · ${input.exporter}`, truncated };
}
