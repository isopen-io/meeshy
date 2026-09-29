import { GUILLEMET_FONT, canvasFont, templateOf, type CardLinkId, type MessageCardTemplateId } from './message-card-templates';
import { textDirection, truncateLines, wrapText, type Measure } from './message-card-text';

export { textDirection, truncateLines, wrapText, type Measure } from './message-card-text';

/**
 * **LA MISE EN PAGE D'UNE CARTE D'EXPORT** — LOI PURE : aucun canvas, aucun
 * DOM. Elle reçoit une fonction de MESURE (`ctx.measureText` en production,
 * une règle fixe dans les témoins) et rend la liste des opérations à peindre.
 *
 * LA LECTURE DE HAUT EN BAS EST CELLE DU FIL :
 *  0. l'en-tête, si l'exportateur l'a voulu : titre de la conversation, date ;
 *  1. le message CITÉ — en entier, en taille RÉDUITE ;
 *  2. la LIAISON du template, qui mène la question à la réponse ;
 *  3. la RÉPONSE, en bas, dans la police du template et en grand.
 * Aucun pied : la carte est signée par son seul filigrane diagonal,
 * « Meeshy @pseudo », qui reste même quand les auteurs sont anonymisés.
 *
 * LA CARTE S'ADAPTE AU TEXTE, JAMAIS L'INVERSE : 1080 px de large (le format
 * des réseaux), une hauteur entre le carré (1080) et le format story (1920).
 * Un texte court est centré dans un carré ; un texte long réduit ses polices
 * pas à pas jusqu'à un plancher lisible, et ce n'est qu'au plancher qu'il est
 * tronqué d'une ellipse — la citation d'abord, la réponse en dernier.
 */

export type MessageCardPart = {
  /** Le nom peint au-dessus du bloc — déjà anonymisé par l'appelant s'il l'a voulu. */
  readonly author: string;
  readonly text: string;
};

export type MessageCardInput = {
  /** Le message auquel on répond — `null` pour un message isolé. */
  readonly quoted: MessageCardPart | null;
  readonly reply: MessageCardPart;
  readonly template: MessageCardTemplateId;
  /** Le pseudo de qui exporte — il signe le filigrane ; `null` : la marque seule. */
  readonly handle: string | null;
  /** L'en-tête optionnel : le titre de la conversation et/ou la date, déjà rédigés. */
  readonly title?: string | null;
  readonly date?: string | null;
  /** Les noms des auteurs au-dessus de chaque bloc — `true` par défaut. */
  readonly showAuthors?: boolean;
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

/** Un trait horizontal — interrompu par un cercle au milieu quand `radius` > 0. */
export type CardSeparatorOp = {
  readonly kind: 'separator';
  readonly x1: number;
  readonly x2: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
  readonly dash: readonly number[];
  readonly lineWidth: number;
};

/** Une bulle : un rectangle arrondi sous un bloc de texte. */
export type CardPanelOp = {
  readonly kind: 'panel';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly color: string;
};

export type CardDotOp = {
  readonly kind: 'dot';
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
};

export type CardOp = CardTextOp | CardBarOp | CardSeparatorOp | CardPanelOp | CardDotOp;

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
const PAD_Y = 136;
const QUOTE_INDENT = 40;
const BAR_WIDTH = 6;
const AUTHOR_SIZE = 30;
const AUTHOR_LINE = 44;
const AUTHOR_GAP = 14;
const TITLE_SIZE = 34;
const TITLE_LINE = 46;
const DATE_SIZE = 26;
const DATE_LINE = 38;
const HEADER_GAP = 56;
const REPLY_START = 68;
const REPLY_FLOOR = 36;
const QUOTE_START = 40;
const QUOTE_FLOOR = 26;
const REPLY_LEADING = 1.3;
const QUOTE_LEADING = 1.38;
const SHRINK = 0.92;
const BUBBLE_OFFSET = 72;
const BUBBLE_PAD_X = 40;
const BUBBLE_PAD_Y = 34;
const BUBBLE_RADIUS = 36;

/**
 * La géométrie de chaque liaison : la hauteur du bloc qui sépare la citation
 * de la réponse, et ce que la citation porte — son filet vertical, ou une bulle.
 */
type LinkGeometry = { readonly block: number; readonly quoteBar: boolean; readonly bubbles: boolean };

const LINK_GEOMETRY: Readonly<Record<CardLinkId, LinkGeometry>> = {
  orbite: { block: 132, quoteBar: true, bubbles: false },
  filet: { block: 104, quoteBar: true, bubbles: false },
  guillemets: { block: 150, quoteBar: false, bubbles: false },
  fleche: { block: 112, quoteBar: true, bubbles: false },
  bulles: { block: 44, quoteBar: false, bubbles: true },
  fil: { block: 120, quoteBar: true, bubbles: false },
  silence: { block: 88, quoteBar: false, bubbles: false },
};

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

type Chrome = { readonly header: number; readonly author: number; readonly bubble: number; readonly link: number };

function contentHeight(sized: Sized, hasQuote: boolean, chrome: Chrome): number {
  const quote = hasQuote ? chrome.author + sized.quoteLines.length * quoteLineHeight(sized.quoteSize) + chrome.bubble + chrome.link : 0;
  return chrome.header + quote + chrome.author + sized.replyLines.length * replyLineHeight(sized.replySize) + chrome.bubble;
}

const nonBlank = (value: string | null | undefined): string | null => (value === undefined || value === null || value.trim() === '' ? null : value.trim());

/** « Meeshy @pseudo » — le pseudo sans son éventuel « @ », la marque seule quand il manque. */
export function watermarkOf(handle: string | null): string {
  const bare = nonBlank(handle?.replace(/^@+/, ''));
  return bare === null ? 'Meeshy' : `Meeshy @${bare}`;
}

export function layoutMessageCard(input: MessageCardInput, measure: Measure): CardLayout {
  const template = templateOf(input.template);
  const { palette, typeface } = template;
  const geometry = LINK_GEOMETRY[template.link];
  const textWidth = CARD_WIDTH - 2 * PAD_X;
  const bubbleWidth = textWidth - BUBBLE_OFFSET;
  const quoteWidth = geometry.bubbles ? bubbleWidth - 2 * BUBBLE_PAD_X : textWidth - QUOTE_INDENT;
  const replyWidth = geometry.bubbles ? bubbleWidth - 2 * BUBBLE_PAD_X : textWidth;
  const hasQuote = input.quoted !== null && input.quoted.text.trim() !== '';
  const budget = CARD_MAX_HEIGHT - 2 * PAD_Y;
  const title = nonBlank(input.title);
  const date = nonBlank(input.date);
  const showAuthors = input.showAuthors !== false;
  const chrome: Chrome = {
    header: title === null && date === null ? 0 : (title === null ? 0 : TITLE_LINE) + (date === null ? 0 : DATE_LINE) + HEADER_GAP,
    author: showAuthors ? AUTHOR_LINE + AUTHOR_GAP : 0,
    bubble: geometry.bubbles ? 2 * BUBBLE_PAD_Y : 0,
    link: geometry.block,
  };

  const sizeAt = (step: number): Sized => {
    const replySize = Math.max(REPLY_FLOOR * typeface.replyScale, REPLY_START * typeface.replyScale * SHRINK ** step);
    const quoteSize = Math.max(QUOTE_FLOOR, QUOTE_START * SHRINK ** step);
    const replyFont = canvasFont(typeface.replyFont, replySize);
    const quoteFont = canvasFont(typeface.quoteFont, quoteSize);
    return {
      replySize,
      quoteSize,
      replyFont,
      quoteFont,
      replyLines: wrapText(input.reply.text, replyWidth, replyFont, measure),
      quoteLines: hasQuote ? wrapText(input.quoted?.text ?? '', quoteWidth, quoteFont, measure) : [],
    };
  };

  const atFloor = (sized: Sized) => sized.replySize <= REPLY_FLOOR * typeface.replyScale && sized.quoteSize <= QUOTE_FLOOR;
  let step = 0;
  let sized = sizeAt(step);
  while (contentHeight(sized, hasQuote, chrome) > budget && !atFloor(sized)) {
    step += 1;
    sized = sizeAt(step);
  }

  let truncated = false;
  if (contentHeight(sized, hasQuote, chrome) > budget) {
    truncated = true;
    const quoteLH = quoteLineHeight(sized.quoteSize);
    const replyLH = replyLineHeight(sized.replySize);
    const fixed = contentHeight({ ...sized, quoteLines: [], replyLines: [] }, hasQuote, chrome);
    const room = budget - fixed;
    /* La citation cède d'abord : au plus un tiers de la place, deux lignes au moins. */
    const quoteKeep = hasQuote ? Math.min(sized.quoteLines.length, Math.max(2, Math.floor((room * 0.3) / quoteLH))) : 0;
    const replyKeep = Math.max(1, Math.floor((room - quoteKeep * quoteLH) / replyLH));
    sized = {
      ...sized,
      quoteLines: truncateLines(sized.quoteLines, quoteKeep, quoteWidth, sized.quoteFont, measure),
      replyLines: truncateLines(sized.replyLines, replyKeep, replyWidth, sized.replyFont, measure),
    };
  }

  const content = contentHeight(sized, hasQuote, chrome);
  const height = truncated ? CARD_MAX_HEIGHT : Math.min(CARD_MAX_HEIGHT, Math.max(CARD_MIN_HEIGHT, 2 * PAD_Y + content));
  /* Un texte court flotte au milieu de l'espace libre, jamais collé en haut. */
  let y = PAD_Y + Math.max(0, Math.floor((height - 2 * PAD_Y - content) / 2));

  const ops: CardOp[] = [];
  const start = (rtl: boolean, inset: number) => (rtl ? CARD_WIDTH - PAD_X - inset : PAD_X + inset);
  const align = (rtl: boolean): 'left' | 'right' => (rtl ? 'right' : 'left');
  const authorFont = canvasFont({ family: null, weight: 600, style: 'normal' }, AUTHOR_SIZE);

  if (title !== null) {
    const direction = textDirection(title);
    const titleFont = canvasFont({ family: null, weight: 800, style: 'normal' }, TITLE_SIZE);
    const [line = title] = truncateLines(wrapText(title, textWidth, titleFont, measure), 1, textWidth, titleFont, measure);
    ops.push({ kind: 'text', text: line, x: start(direction === 'rtl', 0), y: y + TITLE_SIZE, font: titleFont, color: palette.replyInk, align: align(direction === 'rtl'), direction });
    y += TITLE_LINE;
  }
  if (date !== null) {
    const direction = textDirection(date);
    const dateFont = canvasFont({ family: null, weight: 500, style: 'normal' }, DATE_SIZE);
    ops.push({ kind: 'text', text: date, x: start(direction === 'rtl', 0), y: y + DATE_SIZE, font: dateFont, color: palette.quoteInk, align: align(direction === 'rtl'), direction });
    y += DATE_LINE;
  }
  if (chrome.header > 0) y += HEADER_GAP;

  const author = (name: string, x: number, rtl: boolean) => {
    if (!showAuthors) return;
    ops.push({ kind: 'text', text: name, x, y: y + AUTHOR_SIZE, font: authorFont, color: palette.authorInk, align: align(rtl), direction: textDirection(name) });
    y += AUTHOR_LINE + AUTHOR_GAP;
  };

  /** Un bloc : son nom, ses lignes — et, pour la liaison « bulles », la bulle qui les porte. */
  const block = (part: MessageCardPart, lines: readonly string[], options: { readonly size: number; readonly lineHeight: number; readonly font: string; readonly ink: string; readonly inset: number; readonly bubble: { readonly offset: number; readonly color: string } | null }) => {
    const direction = textDirection(part.text);
    const rtl = direction === 'rtl';
    const top = y;
    const panelIndex = ops.length;
    const inset = options.bubble === null ? options.inset : options.bubble.offset + BUBBLE_PAD_X;
    if (options.bubble !== null) y += BUBBLE_PAD_Y;
    author(part.author, start(rtl, inset), rtl);
    for (const line of lines) {
      ops.push({ kind: 'text', text: line, x: start(rtl, inset), y: y + Math.round(options.size), font: options.font, color: options.ink, align: align(rtl), direction });
      y += options.lineHeight;
    }
    if (options.bubble !== null) {
      y += BUBBLE_PAD_Y;
      const x = rtl ? CARD_WIDTH - PAD_X - options.bubble.offset - bubbleWidth : PAD_X + options.bubble.offset;
      ops.splice(panelIndex, 0, { kind: 'panel', x, y: top, width: bubbleWidth, height: y - top, radius: BUBBLE_RADIUS, color: options.bubble.color });
    }
    return { top, rtl };
  };

  if (hasQuote && input.quoted !== null) {
    const quote = block(input.quoted, sized.quoteLines, {
      size: sized.quoteSize,
      lineHeight: quoteLineHeight(sized.quoteSize),
      font: sized.quoteFont,
      ink: palette.quoteInk,
      inset: geometry.quoteBar ? QUOTE_INDENT : 0,
      bubble: geometry.bubbles ? { offset: 0, color: palette.quotePanel } : null,
    });
    if (geometry.quoteBar) ops.push({ kind: 'bar', x: quote.rtl ? CARD_WIDTH - PAD_X - BAR_WIDTH : PAD_X, y: quote.top, width: BAR_WIDTH, height: y - quote.top, color: palette.accent });
    ops.push(...linkOps(template.link, { y, rtl: quote.rtl, accent: palette.accent }));
    y += geometry.block;
  }

  block(input.reply, sized.replyLines, {
    size: sized.replySize,
    lineHeight: replyLineHeight(sized.replySize),
    font: sized.replyFont,
    ink: palette.replyInk,
    inset: 0,
    bubble: geometry.bubbles ? { offset: BUBBLE_OFFSET, color: palette.replyPanel } : null,
  });

  return { width: CARD_WIDTH, height, ops, watermark: watermarkOf(input.handle), truncated };
}

/** Ce que la liaison peint dans son bloc, entre le bas de la citation (`y`) et la réponse. */
function linkOps(link: CardLinkId, at: { readonly y: number; readonly rtl: boolean; readonly accent: string }): CardOp[] {
  const { y, rtl, accent } = at;
  const block = LINK_GEOMETRY[link].block;
  const edge = rtl ? CARD_WIDTH - PAD_X : PAD_X;
  const toward = rtl ? -1 : 1;
  switch (link) {
    case 'orbite':
      return [{ kind: 'separator', x1: PAD_X, x2: CARD_WIDTH - PAD_X, y: y + block / 2, radius: 11, color: accent, dash: [2, 14], lineWidth: 3 }];
    case 'filet': {
      const [x1, x2] = [edge, edge + toward * 160].sort((a, b) => a - b) as [number, number];
      return [{ kind: 'separator', x1, x2, y: y + block / 2, radius: 0, color: accent, dash: [], lineWidth: 5 }];
    }
    case 'guillemets':
      return [{ kind: 'text', text: '“', x: edge - toward * 6, y: y + block - 8, font: canvasFont(GUILLEMET_FONT, 190), color: accent, align: rtl ? 'right' : 'left', direction: 'ltr' }];
    case 'fleche':
      return [{ kind: 'text', text: rtl ? '↲' : '↳', x: edge + toward * QUOTE_INDENT, y: y + Math.round(block * 0.7), font: canvasFont({ family: null, weight: 700, style: 'normal' }, 60), color: accent, align: rtl ? 'right' : 'left', direction: 'ltr' }];
    case 'fil': {
      const x = rtl ? CARD_WIDTH - PAD_X - BAR_WIDTH / 2 : PAD_X + BAR_WIDTH / 2;
      return [
        { kind: 'bar', x: x - 1.5, y: y + 10, width: 3, height: block - 44, color: accent },
        { kind: 'dot', x, y: y + block - 26, radius: 10, color: accent },
      ];
    }
    case 'bulles':
    case 'silence':
      return [];
  }
}
