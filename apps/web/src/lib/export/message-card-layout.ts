import { CARD_ASPECT_SIZE, CARD_TILT_RADIANS, DEFAULT_CARD_FRAME, metaLine, sideHeaderOps, type CardAspect, type CardFrame } from './message-card-frame';
import {
  DEFAULT_MEDIA_ARRANGEMENT,
  DEFAULT_MEDIA_LAYOUT,
  effectiveMediaLayout,
  isBeside,
  paintedVisualIndexes,
  type CardMediaArrangement,
  type CardMediaLayout,
} from './message-card-arrangement';
import { DEFAULT_AUDIO_STYLE, layoutCardMedia, type CardAudioStyle, type CardMedia, type CardMediaBlock } from './message-card-media';
import type { CardOp } from './message-card-ops';
import { GUILLEMET_FONT, canvasFont, templateOf, type CardLinkId, type CardPalette, type MessageCardTemplateId } from './message-card-templates';
import { textDirection, truncateLines, wrapText, type Measure } from './message-card-text';

export { textDirection, truncateLines, wrapText, type Measure } from './message-card-text';
export type { CardBarOp, CardDotOp, CardMediaOp, CardOp, CardPanelOp, CardPlayOp, CardSeparatorOp, CardTextOp, CardWaveOp } from './message-card-ops';

/**
 * **LA MISE EN PAGE D'UNE CARTE D'EXPORT** — LOI PURE : aucun canvas, aucun
 * DOM. Elle reçoit une fonction de MESURE (`ctx.measureText` en production,
 * une règle fixe dans les témoins) et rend la liste des opérations à peindre.
 *
 * LA LECTURE DE HAUT EN BAS EST CELLE DU FIL :
 *  0. l'en-tête, si l'exportateur l'a voulu : titre de la conversation, date —
 *     en tête, ou couché dans la marge (onglet Frame, `message-card-frame.ts`) ;
 *  1. le message CITÉ — en entier, en taille RÉDUITE ;
 *  2. la LIAISON du template, qui mène la question à la réponse ;
 *  3. la RÉPONSE, en bas, dans la police du template et en grand — ses MÉDIAS
 *     (images, première image des vidéos, représentation de l'audio) au-dessus
 *     de son texte comme dans la bulle, au-dessous, dans une colonne à sa gauche
 *     ou à sa droite (la réponse se resserre à côté), ou un visuel EN FOND sous
 *     un voile de la palette (#9236, `message-card-arrangement.ts`) ;
 *  4. les SUITES, quand on image un commentaire « avec ses réponses » (#8734) :
 *     chacune en taille réduite, à la manière de la citation, trois lignes au
 *     plus — le commentaire imagé reste le sujet.
 * Aucun pied : la carte est signée par son seul filigrane diagonal,
 * « Meeshy @pseudo », qui reste même quand les auteurs sont anonymisés.
 *
 * LA CARTE « AJUSTÉE » S'ADAPTE AU TEXTE : 1080 px de large, une hauteur entre
 * le carré (1080) et le format story (1920). Un FORMAT FIXE (Story, Portrait,
 * Carré, Paysage) garde ses dimensions et centre le contenu. Dans les deux cas,
 * un texte long réduit ses polices pas à pas jusqu'à un plancher lisible, et ce
 * n'est qu'au plancher qu'il est tronqué d'une ellipse — la citation d'abord,
 * la réponse en dernier.
 */

export type MessageCardPart = {
  /** Le nom peint au-dessus du bloc — déjà anonymisé par l'appelant s'il l'a voulu. */
  readonly author: string;
  readonly text: string;
  /** L'heure du message, déjà rédigée — peinte à côté du nom quand le cadre la montre. */
  readonly time?: string | null;
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
  /** Le format de l'image — « ajusté » par défaut. */
  readonly aspect?: CardAspect;
  /** Les dispositions de l'onglet Frame. */
  readonly frame?: CardFrame;
  /** Les médias de la réponse, dans leur ordre — le peintre reçoit leurs pixels à part. */
  readonly media?: readonly CardMedia[];
  /** OÙ se posent les médias (#9236) — au-dessus de la réponse par défaut. */
  readonly mediaLayout?: CardMediaLayout;
  /** COMMENT plusieurs visuels s'agencent (#9236). */
  readonly mediaArrangement?: CardMediaArrangement;
  /** Le rang, dans `media`, du visuel que « une seule » et « en fond » montrent — absent : le premier. */
  readonly featuredMedia?: number | null;
  readonly audioStyle?: CardAudioStyle;
  /** Les réponses peintes SOUS la réponse (#8734), dans leur ordre. */
  readonly followUps?: readonly MessageCardPart[];
};

/**
 * Les PARTIES d'une carte qu'un geste peut désigner sur l'aperçu : l'en-tête,
 * la citation, la liaison, la réponse, ses médias — et le fond, partout
 * ailleurs. Le filigrane n'en est pas une : il signe toujours la carte, rien ne
 * le règle.
 */
export type CardPart = 'header' | 'quote' | 'link' | 'reply' | 'media' | 'replies' | 'background';

/** La zone d'une partie, en pixels de la carte. */
export type CardRegion = {
  readonly part: Exclude<CardPart, 'background'>;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type CardLayout = {
  readonly width: number;
  readonly height: number;
  readonly ops: readonly CardOp[];
  /** Les zones touchables, de haut en bas — seules les parties PEINTES en ont une. */
  readonly regions: readonly CardRegion[];
  /** Le motif du filigrane diagonal. */
  readonly watermark: string;
  /** Vrai quand, au plancher des polices, un texte a dû être coupé. */
  readonly truncated: boolean;
  /** La rotation du contenu autour du centre de la carte, en radians — le fond et le filigrane restent droits. */
  readonly tilt: number;
  /** Le visuel peint EN FOND (#9236) — droit comme le fond, sous un voile de la palette ; `null` : aucun. */
  readonly backdrop: CardBackdrop | null;
};

/** Le visuel de fond : son rang dans `MessageCardInput.media`, et le voile qui garde le texte lisible. */
export type CardBackdrop = { readonly index: number; readonly video: boolean; readonly veil: string };

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
const MEDIA_GAP = 28;
const SIDE_REGION = 64;
const FOLLOW_GAP = 40;
const FOLLOW_MAX_LINES = 3;
/** La part de la colonne de texte qu'une colonne de médias prend, et l'espace qui la sépare de la réponse. */
const BESIDE_SHARE = 0.42;
const BESIDE_GAP = 40;

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
  readonly followLines: readonly (readonly string[])[];
};

const replyLineHeight = (size: number) => Math.round(size * REPLY_LEADING);
const quoteLineHeight = (size: number) => Math.round(size * QUOTE_LEADING);

type Chrome = {
  readonly header: number;
  readonly quoteMeta: number;
  readonly replyMeta: number;
  readonly bubble: number;
  readonly link: number;
  readonly media: number;
  /** La hauteur d'une colonne de médias à côté de la réponse — elle ne s'ADDITIONNE pas au texte. */
  readonly beside: number;
};

function contentHeight(sized: Sized, hasQuote: boolean, chrome: Chrome): number {
  const quote = hasQuote ? chrome.quoteMeta + sized.quoteLines.length * quoteLineHeight(sized.quoteSize) + chrome.bubble + chrome.link : 0;
  const mediaGap = chrome.media > 0 && sized.replyLines.length > 0 ? MEDIA_GAP : 0;
  const text = chrome.replyMeta + sized.replyLines.length * replyLineHeight(sized.replySize);
  const reply = chrome.beside > 0 ? Math.max(text, chrome.beside) : chrome.media + mediaGap + text;
  return chrome.header + quote + reply + chrome.bubble;
}

/** Le voile d'un visuel de fond : la première teinte du fond, assez opaque pour que le texte se lise et que la carte garde sa couleur. */
function veilOf(palette: CardPalette): string {
  const base = /^#([0-9a-f]{6})$/i.exec(palette.background[0]?.[1] ?? '')?.[1] ?? '000000';
  const channel = (at: number) => Number.parseInt(base.slice(at, at + 2), 16);
  const alpha = palette.replyInk.toUpperCase() === '#FFFFFF' ? 0.6 : 0.72;
  return `rgba(${channel(0)}, ${channel(2)}, ${channel(4)}, ${alpha})`;
}

const nonBlank = (value: string | null | undefined): string | null => (value === undefined || value === null || value.trim() === '' ? null : value.trim());

/** « Meeshy @pseudo » — le pseudo sans son éventuel « @ », la marque seule quand il manque. */
export function watermarkOf(handle: string | null): string {
  const bare = nonBlank(handle?.replace(/^@+/, ''));
  return bare === null ? 'Meeshy' : `Meeshy @${bare}`;
}

/** Les dimensions de la carte et la place de son contenu, selon le format. */
function canvasOf(aspect: CardAspect): { readonly width: number; readonly fixedHeight: number | null; readonly budget: number } {
  if (aspect === 'auto') return { width: CARD_WIDTH, fixedHeight: null, budget: CARD_MAX_HEIGHT - 2 * PAD_Y };
  const size = CARD_ASPECT_SIZE[aspect];
  return { width: size.width, fixedHeight: size.height, budget: size.height - 2 * PAD_Y };
}

export function layoutMessageCard(input: MessageCardInput, measure: Measure): CardLayout {
  const template = templateOf(input.template);
  const { palette, typeface } = template;
  const geometry = LINK_GEOMETRY[template.link];
  const frame = input.frame ?? DEFAULT_CARD_FRAME;
  const { width, fixedHeight, budget } = canvasOf(input.aspect ?? 'auto');
  const textWidth = width - 2 * PAD_X;
  const bubbleWidth = textWidth - BUBBLE_OFFSET;
  const quoteWidth = geometry.bubbles ? bubbleWidth - 2 * BUBBLE_PAD_X : textWidth - QUOTE_INDENT;
  const replyWidth = geometry.bubbles ? bubbleWidth - 2 * BUBBLE_PAD_X : textWidth;
  const hasQuote = input.quoted !== null && input.quoted.text.trim() !== '';
  const title = nonBlank(input.title);
  const date = nonBlank(input.date);
  const showAuthors = input.showAuthors !== false;
  const sideHeader = frame.header === 'horizontal' || (title === null && date === null) ? null : frame.header;
  const metaOf = (part: MessageCardPart) => metaLine(showAuthors ? part.author : null, nonBlank(part.time), frame.authors);
  const quoteMeta = hasQuote && input.quoted !== null ? metaOf(input.quoted) : null;
  const replyMeta = metaOf(input.reply);
  const replyHasText = input.reply.text.trim() !== '';
  const followUps = (input.followUps ?? []).filter((part) => part.text.trim() !== '');
  const followMetas = followUps.map(metaOf);
  const followInset = geometry.quoteBar ? QUOTE_INDENT : 0;
  const media = input.media ?? [];
  const arrangement = input.mediaArrangement ?? DEFAULT_MEDIA_ARRANGEMENT;
  const painted = paintedVisualIndexes(media, { layout: input.mediaLayout ?? DEFAULT_MEDIA_LAYOUT, arrangement, featured: input.featuredMedia ?? null });
  const placement = effectiveMediaLayout(input.mediaLayout ?? DEFAULT_MEDIA_LAYOUT, painted.length > 0);
  const beside = isBeside(placement);
  const besideWidth = beside ? Math.round(replyWidth * BESIDE_SHARE) : 0;
  const replyTextWidth = beside ? replyWidth - besideWidth - BESIDE_GAP : replyWidth;
  const backdropIndex = placement === 'backdrop' ? (painted[0] ?? null) : null;
  const backdropMedia = backdropIndex === null ? undefined : media[backdropIndex];
  const replyRtl = textDirection(input.reply.text) === 'rtl';
  const mediaBlock: CardMediaBlock = layoutCardMedia({
    media,
    painted: placement === 'backdrop' ? [] : painted,
    arrangement,
    audioStyle: input.audioStyle ?? DEFAULT_AUDIO_STYLE,
    width: beside ? besideWidth : replyWidth,
    maxHeight: Math.round(budget * (beside ? 0.62 : replyHasText || hasQuote ? 0.46 : 0.8)),
    column: beside,
    creditAt: placement === 'backdrop' ? null : frame.authors,
    measure,
    palette,
    rtl: replyRtl,
    font: (size, weight) => canvasFont({ family: null, weight, style: 'normal' }, size),
  });
  const metaHeight = (line: string | null) => (line === null ? 0 : AUTHOR_LINE + AUTHOR_GAP);
  const chrome: Chrome = {
    header: sideHeader !== null || (title === null && date === null) ? 0 : (title === null ? 0 : TITLE_LINE) + (date === null ? 0 : DATE_LINE) + HEADER_GAP,
    quoteMeta: metaHeight(quoteMeta),
    replyMeta: metaHeight(replyMeta),
    bubble: geometry.bubbles ? 2 * BUBBLE_PAD_Y : 0,
    link: geometry.block,
    media: beside ? 0 : mediaBlock.height,
    beside: beside ? mediaBlock.height : 0,
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
      replyLines: replyHasText ? wrapText(input.reply.text, replyTextWidth, replyFont, measure) : [],
      quoteLines: hasQuote ? wrapText(input.quoted?.text ?? '', quoteWidth, quoteFont, measure) : [],
      followLines: followUps.map((part) => truncateLines(wrapText(part.text, quoteWidth, quoteFont, measure), FOLLOW_MAX_LINES, quoteWidth, quoteFont, measure)),
    };
  };

  /** Les suites ne cèdent jamais au-delà de leurs trois lignes : leur hauteur s'ajoute, elle ne se négocie pas. */
  const followHeight = (sized: Sized): number =>
    sized.followLines.reduce(
      (sum, lines, index) => sum + FOLLOW_GAP + metaHeight(followMetas[index] ?? null) + lines.length * quoteLineHeight(sized.quoteSize) + chrome.bubble,
      0,
    );
  const total = (sized: Sized): number => contentHeight(sized, hasQuote, chrome) + followHeight(sized);

  const atFloor = (sized: Sized) => sized.replySize <= REPLY_FLOOR * typeface.replyScale && sized.quoteSize <= QUOTE_FLOOR;
  let step = 0;
  let sized = sizeAt(step);
  while (total(sized) > budget && !atFloor(sized)) {
    step += 1;
    sized = sizeAt(step);
  }

  let truncated = false;
  if (total(sized) > budget) {
    truncated = true;
    const quoteLH = quoteLineHeight(sized.quoteSize);
    const replyLH = replyLineHeight(sized.replySize);
    /* Une colonne de médias se pose À CÔTÉ des lignes : elle ne leur prend pas de place en hauteur. */
    const besideShare = beside ? Math.max(chrome.replyMeta, chrome.beside) - chrome.replyMeta : 0;
    const fixed = total({ ...sized, quoteLines: [], replyLines: [] }) - besideShare + (chrome.media > 0 && replyHasText ? MEDIA_GAP : 0);
    const room = budget - fixed;
    /* La citation cède d'abord : au plus un tiers de la place, deux lignes au moins. */
    const quoteKeep = hasQuote ? Math.min(sized.quoteLines.length, Math.max(2, Math.floor((room * 0.3) / quoteLH))) : 0;
    const replyKeep = replyHasText ? Math.max(1, Math.floor((room - quoteKeep * quoteLH) / replyLH)) : 0;
    sized = {
      ...sized,
      quoteLines: truncateLines(sized.quoteLines, quoteKeep, quoteWidth, sized.quoteFont, measure),
      replyLines: replyHasText ? truncateLines(sized.replyLines, replyKeep, replyTextWidth, sized.replyFont, measure) : [],
    };
  }

  const content = total(sized);
  const height = fixedHeight ?? (truncated ? CARD_MAX_HEIGHT : Math.min(CARD_MAX_HEIGHT, Math.max(CARD_MIN_HEIGHT, 2 * PAD_Y + content)));
  /* Un texte court flotte au milieu de l'espace libre, jamais collé en haut. */
  let y = PAD_Y + Math.max(0, Math.floor((height - 2 * PAD_Y - content) / 2));

  const ops: CardOp[] = [];
  const start = (rtl: boolean, inset: number) => (rtl ? width - PAD_X - inset : PAD_X + inset);
  const align = (rtl: boolean): 'left' | 'right' => (rtl ? 'right' : 'left');
  const authorFont = canvasFont({ family: null, weight: 600, style: 'normal' }, AUTHOR_SIZE);

  const regions: CardRegion[] = [];
  const region = (part: CardRegion['part'], top: number, bottom: number) => regions.push({ part, x: PAD_X, y: top, width: textWidth, height: bottom - top });
  const headerTop = y;

  if (sideHeader !== null) {
    const side = sideHeaderOps({
      text: [title, date].filter((part): part is string => part !== null).join(' · '),
      orientation: sideHeader,
      width,
      height,
      margin: PAD_X,
      padY: PAD_Y,
      font: (size) => canvasFont({ family: null, weight: 800, style: 'normal' }, size),
      color: palette.replyInk,
      measure,
    });
    ops.push(...side.ops);
    regions.push({ part: 'header', x: side.x - SIDE_REGION / 2, y: side.top, width: SIDE_REGION, height: side.bottom - side.top });
  }
  if (sideHeader === null && title !== null) {
    const direction = textDirection(title);
    const titleFont = canvasFont({ family: null, weight: 800, style: 'normal' }, TITLE_SIZE);
    const [line = title] = truncateLines(wrapText(title, textWidth, titleFont, measure), 1, textWidth, titleFont, measure);
    ops.push({ kind: 'text', text: line, x: start(direction === 'rtl', 0), y: y + TITLE_SIZE, font: titleFont, color: palette.replyInk, align: align(direction === 'rtl'), direction });
    y += TITLE_LINE;
  }
  if (sideHeader === null && date !== null) {
    const direction = textDirection(date);
    const dateFont = canvasFont({ family: null, weight: 500, style: 'normal' }, DATE_SIZE);
    ops.push({ kind: 'text', text: date, x: start(direction === 'rtl', 0), y: y + DATE_SIZE, font: dateFont, color: palette.quoteInk, align: align(direction === 'rtl'), direction });
    y += DATE_LINE;
  }
  if (chrome.header > 0) {
    region('header', headerTop, y);
    y += HEADER_GAP;
  }

  const meta = (line: string | null, x: number, rtl: boolean) => {
    if (line === null) return;
    ops.push({ kind: 'text', text: line, x, y: y + AUTHOR_SIZE, font: authorFont, color: palette.authorInk, align: align(rtl), direction: textDirection(line) });
    y += AUTHOR_LINE + AUTHOR_GAP;
  };

  /** Un bloc : son identité, ses médias, ses lignes — et, pour la liaison « bulles », la bulle qui les porte. */
  const block = (
    part: MessageCardPart,
    lines: readonly string[],
    options: {
      readonly size: number;
      readonly lineHeight: number;
      readonly font: string;
      readonly ink: string;
      readonly inset: number;
      readonly meta: string | null;
      /** Les médias du bloc et leur place — au-dessus, au-dessous, ou en colonne à côté des lignes. */
      readonly media: { readonly block: CardMediaBlock; readonly at: 'above' | 'below' | 'left' | 'right' } | null;
      readonly bubble: { readonly offset: number; readonly color: string } | null;
    },
  ) => {
    const direction = textDirection(part.text);
    const rtl = direction === 'rtl';
    const top = y;
    const panelIndex = ops.length;
    const inset = options.bubble === null ? options.inset : options.bubble.offset + BUBBLE_PAD_X;
    if (options.bubble !== null) y += BUBBLE_PAD_Y;
    const media = options.media !== null && options.media.block.height > 0 ? options.media : null;
    const boxLeft = rtl ? width - PAD_X - inset - replyWidth : PAD_X + inset;
    const columnX = media?.at === 'left' ? boxLeft : boxLeft + replyWidth - besideWidth;
    /* À côté d'une colonne, la réponse — son nom compris — se resserre dans ce qui reste de la largeur. */
    const textStart = (() => {
      if (media?.at === 'left') return rtl ? boxLeft + replyWidth : boxLeft + besideWidth + BESIDE_GAP;
      if (media?.at === 'right') return rtl ? boxLeft + replyWidth - besideWidth - BESIDE_GAP : boxLeft;
      return start(rtl, inset);
    })();
    const rowTop = y;
    let mediaTop: number | null = null;
    if (media !== null && (media.at === 'left' || media.at === 'right')) {
      mediaTop = rowTop;
      ops.push(...media.block.place(columnX, rowTop));
    }
    if (frame.authors === 'top') meta(options.meta, textStart, rtl);
    if (media?.at === 'above') {
      mediaTop = y;
      ops.push(...media.block.place(boxLeft, y));
      y += media.block.height + (lines.length > 0 ? MEDIA_GAP : 0);
    }
    for (const line of lines) {
      ops.push({ kind: 'text', text: line, x: textStart, y: y + Math.round(options.size), font: options.font, color: options.ink, align: align(rtl), direction });
      y += options.lineHeight;
    }
    if (media?.at === 'below') {
      y += lines.length > 0 ? MEDIA_GAP : 0;
      mediaTop = y;
      ops.push(...media.block.place(boxLeft, y));
      y += media.block.height;
    }
    if (frame.authors === 'end') meta(options.meta, textStart, rtl);
    if (mediaTop !== null && (media?.at === 'left' || media?.at === 'right')) y = Math.max(y, rowTop + media.block.height);
    if (options.bubble !== null) {
      y += BUBBLE_PAD_Y;
      const x = rtl ? width - PAD_X - options.bubble.offset - bubbleWidth : PAD_X + options.bubble.offset;
      ops.splice(panelIndex, 0, { kind: 'panel', x, y: top, width: bubbleWidth, height: y - top, radius: BUBBLE_RADIUS, color: options.bubble.color });
    }
    return { top, rtl, mediaTop, mediaX: media?.at === 'left' || media?.at === 'right' ? columnX : null };
  };

  if (hasQuote && input.quoted !== null) {
    const quote = block(input.quoted, sized.quoteLines, {
      size: sized.quoteSize,
      lineHeight: quoteLineHeight(sized.quoteSize),
      font: sized.quoteFont,
      ink: palette.quoteInk,
      inset: geometry.quoteBar ? QUOTE_INDENT : 0,
      meta: quoteMeta,
      media: null,
      bubble: geometry.bubbles ? { offset: 0, color: palette.quotePanel } : null,
    });
    if (geometry.quoteBar) ops.push({ kind: 'bar', x: quote.rtl ? width - PAD_X - BAR_WIDTH : PAD_X, y: quote.top, width: BAR_WIDTH, height: y - quote.top, color: palette.accent });
    region('quote', quote.top, y);
    ops.push(...linkOps(template.link, { y, rtl: quote.rtl, accent: palette.accent, width }));
    region('link', y, y + geometry.block);
    y += geometry.block;
  }

  const reply = block(input.reply, sized.replyLines, {
    size: sized.replySize,
    lineHeight: replyLineHeight(sized.replySize),
    font: sized.replyFont,
    ink: palette.replyInk,
    inset: 0,
    meta: replyMeta,
    media: placement === 'backdrop' ? { block: mediaBlock, at: 'above' } : { block: mediaBlock, at: placement },
    bubble: geometry.bubbles ? { offset: BUBBLE_OFFSET, color: palette.replyPanel } : null,
  });
  region('reply', reply.top, y);
  /* Les médias vivent DANS la réponse : leur zone vient après pour se poser au-dessus d'elle. */
  if (reply.mediaTop !== null && reply.mediaX !== null) regions.push({ part: 'media', x: reply.mediaX, y: reply.mediaTop, width: besideWidth, height: mediaBlock.height });
  if (reply.mediaTop !== null && reply.mediaX === null) region('media', reply.mediaTop, reply.mediaTop + mediaBlock.height);

  const followTop = y + FOLLOW_GAP;
  followUps.forEach((part, index) => {
    y += FOLLOW_GAP;
    const follow = block(part, sized.followLines[index] ?? [], {
      size: sized.quoteSize,
      lineHeight: quoteLineHeight(sized.quoteSize),
      font: sized.quoteFont,
      ink: palette.quoteInk,
      inset: followInset,
      meta: followMetas[index] ?? null,
      media: null,
      bubble: geometry.bubbles ? { offset: 0, color: palette.quotePanel } : null,
    });
    if (geometry.quoteBar) ops.push({ kind: 'bar', x: follow.rtl ? width - PAD_X - BAR_WIDTH : PAD_X, y: follow.top, width: BAR_WIDTH, height: y - follow.top, color: palette.accent });
  });
  if (followUps.length > 0) region('replies', followTop, y);

  const backdrop: CardBackdrop | null =
    backdropIndex === null || backdropMedia === undefined ? null : { index: backdropIndex, video: backdropMedia.kind === 'video', veil: veilOf(palette) };
  return { width, height, ops, regions, watermark: watermarkOf(input.handle), truncated, tilt: CARD_TILT_RADIANS[frame.tilt], backdrop };
}

/** Ce que la liaison peint dans son bloc, entre le bas de la citation (`y`) et la réponse. */
function linkOps(link: CardLinkId, at: { readonly y: number; readonly rtl: boolean; readonly accent: string; readonly width: number }): CardOp[] {
  const { y, rtl, accent, width } = at;
  const block = LINK_GEOMETRY[link].block;
  const edge = rtl ? width - PAD_X : PAD_X;
  const toward = rtl ? -1 : 1;
  switch (link) {
    case 'orbite':
      return [{ kind: 'separator', x1: PAD_X, x2: width - PAD_X, y: y + block / 2, radius: 11, color: accent, dash: [2, 14], lineWidth: 3 }];
    case 'filet': {
      const [x1, x2] = [edge, edge + toward * 160].sort((a, b) => a - b) as [number, number];
      return [{ kind: 'separator', x1, x2, y: y + block / 2, radius: 0, color: accent, dash: [], lineWidth: 5 }];
    }
    case 'guillemets':
      return [{ kind: 'text', text: '“', x: edge - toward * 6, y: y + block - 8, font: canvasFont(GUILLEMET_FONT, 190), color: accent, align: rtl ? 'right' : 'left', direction: 'ltr' }];
    case 'fleche':
      return [{ kind: 'text', text: rtl ? '↲' : '↳', x: edge + toward * QUOTE_INDENT, y: y + Math.round(block * 0.7), font: canvasFont({ family: null, weight: 700, style: 'normal' }, 60), color: accent, align: rtl ? 'right' : 'left', direction: 'ltr' }];
    case 'fil': {
      const x = rtl ? width - PAD_X - BAR_WIDTH / 2 : PAD_X + BAR_WIDTH / 2;
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
