import { arrangeVisuals, type CardMediaArrangement } from './message-card-arrangement';
import type { CardAuthorPlacement } from './message-card-frame';
import type { CardOp } from './message-card-ops';
import type { CardPalette } from './message-card-templates';
import { textDirection, truncateLines, wrapText, type Measure } from './message-card-text';

/**
 * **LES MÉDIAS D'UNE CARTE** (#8693, #9236) — l'image jointe, la PREMIÈRE image
 * d'une vidéo, et l'audio, qui n'a pas d'image : on le REPRÉSENTE, en plusieurs
 * styles, au même titre que la liaison entre la citation et la réponse.
 *
 * LOI PURE : elle ne connaît des pièces que leurs dimensions (image, vidéo) ou
 * leur durée, leur nom et leur onde (audio). Les pixels arrivent au peintre à
 * part (`message-card-paint.ts`), désignés par leur rang.
 *
 * Les visuels PEINTS (`message-card-arrangement.ts`) s'agencent en une seule
 * image, en mosaïque ou selon une disposition de post ; un « +n » voilé dit le
 * reste sur la dernière tuile. Au-dessus d'eux — ou en signature dessous, selon
 * la place des noms —, le CRÉDIT nomme qui les a postés, mis en forme comme les
 * autres noms de la carte. Quatre REPRÉSENTATIONS de l'audio : l'ONDE dans sa
 * bulle, le SPECTRE en miroir, la PASTILLE de lecture, l'ÉTIQUETTE (nom et durée).
 */

export type CardVisualMedia = {
  readonly kind: 'image' | 'video';
  readonly width: number;
  readonly height: number;
  /** Le nom de qui l'a posté, tel qu'il se peint — déjà anonymisé ou mis en @pseudo par l'appelant ; absent : la carte ne le dit pas. */
  readonly credit?: string | null;
};
export type CardAudioMedia = { readonly kind: 'audio'; readonly durationMs: number; readonly name: string; readonly peaks: readonly number[] };
export type CardMedia = CardVisualMedia | CardAudioMedia;

export const CARD_AUDIO_STYLES = ['onde', 'spectre', 'pastille', 'etiquette'] as const;
export type CardAudioStyle = (typeof CARD_AUDIO_STYLES)[number];

export const DEFAULT_AUDIO_STYLE: CardAudioStyle = 'onde';

const RADIUS = 26;
const AUDIO_GAP = 24;
const CREDIT_SIZE = 30;
/** La ligne du crédit et son écart aux visuels — celles du nom d'un message. */
const CREDIT_LINE = 58;
const OVERFLOW_VEIL = 'rgba(0, 0, 0, 0.45)';

const AUDIO_HEIGHT: Readonly<Record<CardAudioStyle, number>> = { onde: 150, spectre: 176, pastille: 124, etiquette: 112 };

/** « 1:07 » — la durée d'un audio, lisible dans toutes les langues. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Une onde dont chaque barre tient entre 0 et 1 — la plus haute touche le plafond. */
export function normalizePeaks(values: readonly number[]): readonly number[] {
  const max = values.reduce((top, value) => Math.max(top, value), 0);
  return max <= 0 ? values.map(() => 0.3) : values.map((value) => Math.max(0.08, value / max));
}

export type CardMediaBlock = {
  readonly height: number;
  /** Les opérations du bloc, son coin haut posé en (`x`, `y`). */
  readonly place: (x: number, y: number) => readonly CardOp[];
};

const EMPTY_BLOCK: CardMediaBlock = { height: 0, place: () => [] };

/** Les noms de qui a posté les visuels peints, dans leur ordre, sans redite — `null` : aucun n'en porte. */
function creditOf(media: readonly CardMedia[], painted: readonly number[]): string | null {
  const names = painted.flatMap((index) => {
    const item = media[index];
    const credit = item === undefined || item.kind === 'audio' ? null : (item.credit?.trim() ?? '');
    return credit === null || credit === '' ? [] : [credit];
  });
  const distinct = names.filter((name, i) => names.indexOf(name) === i);
  return distinct.length === 0 ? null : distinct.join(' · ');
}

/**
 * LE BLOC DES MÉDIAS d'un message, dans une colonne de `width` pixels : le
 * crédit et les visuels PEINTS d'abord (au plus `maxHeight` de haut, son
 * compris), puis la représentation du PREMIER audio.
 */
export function layoutCardMedia(params: {
  readonly media: readonly CardMedia[];
  /** Les rangs des visuels peints — `[]` quand le visuel est en fond. */
  readonly painted: readonly number[];
  readonly arrangement: CardMediaArrangement;
  readonly audioStyle: CardAudioStyle;
  readonly width: number;
  readonly maxHeight: number;
  /** Le bloc est une COLONNE à côté de la réponse. */
  readonly column: boolean;
  /** Où se signe le crédit — au-dessus des visuels, ou à leur fin ; `null` : jamais (un fond). */
  readonly creditAt: CardAuthorPlacement | null;
  readonly measure: Measure;
  readonly palette: CardPalette;
  readonly rtl: boolean;
  readonly font: (size: number, weight: number) => string;
}): CardMediaBlock {
  const { media, painted, audioStyle, width, palette, rtl } = params;
  const audio = media.find((item): item is CardAudioMedia => item.kind === 'audio') ?? null;
  const audioHeight = audio === null ? 0 : AUDIO_HEIGHT[audioStyle];
  const names = params.creditAt === null ? null : creditOf(media, painted);
  const creditLine = names === null ? 0 : CREDIT_LINE;
  const visualRoom = params.maxHeight - (audio === null ? 0 : audioHeight + AUDIO_GAP) - creditLine;
  const total = media.filter((item) => item.kind !== 'audio').length;
  const arranged = arrangeVisuals({ media, painted, total, arrangement: params.arrangement, width, cap: visualRoom, column: params.column });
  const credited = arranged.height > 0 && names !== null;
  const lead = credited && params.creditAt === 'top' ? creditLine : 0;
  const trail = credited && params.creditAt === 'end' ? creditLine : 0;
  const visualHeight = arranged.height === 0 ? 0 : lead + arranged.height + trail;
  const gap = visualHeight > 0 && audio !== null ? AUDIO_GAP : 0;
  const height = visualHeight + gap + audioHeight;
  if (height === 0) return EMPTY_BLOCK;

  return {
    height,
    place: (x, y) => {
      const ops: CardOp[] = [];
      const top = y + lead;
      for (const slot of arranged.slots) {
        const item = media[slot.index];
        if (item === undefined || item.kind === 'audio') continue;
        const left = rtl ? x + width - slot.x - slot.width : x + slot.x;
        const frame = { x: left, y: top + slot.y, width: slot.width, height: slot.height };
        ops.push({ kind: 'media', index: slot.index, ...frame, radius: RADIUS, video: item.kind === 'video' });
        if (item.kind === 'video' && slot.overflow === 0) ops.push(...playBadge(left + slot.width / 2, frame.y + slot.height / 2, Math.min(slot.width, slot.height)));
        if (slot.overflow > 0) ops.push(...overflowOps(frame, slot.overflow, params.font));
      }
      if (credited && names !== null && params.creditAt !== null) {
        const baseline = params.creditAt === 'top' ? y + CREDIT_SIZE : top + arranged.height + CREDIT_LINE - CREDIT_SIZE / 2;
        ops.push(creditOp({ names, at: params.creditAt, x, y: baseline, width, ink: palette.authorInk, measure: params.measure, font: params.font(CREDIT_SIZE, 600) }));
      }
      if (audio !== null) ops.push(...audioOps(audio, audioStyle, { x, y: y + visualHeight + gap, width, height: audioHeight, palette, rtl, font: params.font }));
      return ops;
    },
  };
}

/** Ce qui reste à voir, jamais le total : un voile sur la dernière tuile, le compte au centre — la loi des posts. */
function overflowOps(frame: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }, overflow: number, font: (size: number, weight: number) => string): readonly CardOp[] {
  const size = Math.round(Math.min(96, Math.min(frame.width, frame.height) * 0.32));
  return [
    { kind: 'panel', ...frame, radius: RADIUS, color: OVERFLOW_VEIL },
    { kind: 'text', text: `+${overflow}`, x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 + Math.round(size * 0.36), font: font(size, 700), color: '#FFFFFF', align: 'center', direction: 'ltr' },
  ];
}

/** Le nom de qui a posté les visuels, mis en forme comme celui d'un message : au début de la ligne au-dessus d'eux, ou « — Nom » au bout, dessous. */
function creditOp(params: {
  readonly names: string;
  readonly at: CardAuthorPlacement;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly ink: string;
  readonly measure: Measure;
  readonly font: string;
}): CardOp {
  const whole = params.at === 'top' ? params.names : `— ${params.names}`;
  const [text = whole] = truncateLines(wrapText(whole, params.width, params.font, params.measure), 1, params.width, params.font, params.measure);
  const direction = textDirection(text);
  const atStart = (params.at === 'top') === (direction === 'ltr');
  return { kind: 'text', text, x: atStart ? params.x : params.x + params.width, y: params.y, font: params.font, color: params.ink, align: atStart ? 'left' : 'right', direction };
}

const NAME_LIMIT = 32;

/** Le nom d'un fichier audio, raccourci au milieu : son début ET son extension restent lisibles. */
export function shortName(name: string): string {
  const graphemes = Array.from(name.trim());
  if (graphemes.length <= NAME_LIMIT) return graphemes.join('');
  return `${graphemes.slice(0, NAME_LIMIT - 9).join('')}…${graphemes.slice(-8).join('')}`;
}

function playBadge(cx: number, cy: number, size: number): readonly CardOp[] {
  const radius = Math.max(28, Math.min(56, size * 0.14));
  return [
    { kind: 'dot', x: cx, y: cy, radius, color: 'rgba(0, 0, 0, 0.5)', still: true },
    { kind: 'play', x: cx + radius * 0.08, y: cy, size: radius * 0.9, color: '#FFFFFF', still: true },
  ];
}

function audioOps(
  audio: CardAudioMedia,
  style: CardAudioStyle,
  box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly palette: CardPalette; readonly rtl: boolean; readonly font: (size: number, weight: number) => string },
): readonly CardOp[] {
  const { x, y, width, height, palette, rtl, font } = box;
  const duration = formatDuration(audio.durationMs);
  const name = shortName(audio.name);
  const peaks = normalizePeaks(audio.peaks);
  const dim = palette.quoteInk;
  const start = rtl ? x + width : x;
  const toward = rtl ? -1 : 1;
  const align = rtl ? 'right' : 'left';
  const endAlign = rtl ? 'left' : 'right';
  const end = rtl ? x : x + width;

  switch (style) {
    case 'onde': {
      const cy = y + height / 2;
      const button = start + toward * 70;
      const waveFrom = start + toward * 128;
      const waveTo = end - toward * 128;
      return [
        { kind: 'panel', x, y, width, height, radius: height / 2, color: palette.replyPanel },
        { kind: 'dot', x: button, y: cy, radius: 44, color: palette.accent },
        { kind: 'play', x: button + 3, y: cy, size: 38, color: '#FFFFFF' },
        { kind: 'wave', x: Math.min(waveFrom, waveTo), y: cy - 36, width: Math.abs(waveTo - waveFrom), height: 72, peaks, mirror: true, color: palette.replyInk, dim },
        { kind: 'text', text: duration, x: end - toward * 36, y: cy + 11, font: font(30, 600), color: palette.replyInk, align: endAlign, direction: 'ltr' },
      ];
    }
    case 'spectre':
      return [
        { kind: 'wave', x, y, width, height: height - 52, peaks, mirror: true, color: palette.accent, dim },
        { kind: 'text', text: duration, x: start, y: y + height - 8, font: font(30, 700), color: palette.replyInk, align, direction: 'ltr' },
        { kind: 'text', text: name, x: end, y: y + height - 8, font: font(26, 500), color: palette.quoteInk, align: endAlign, direction: 'ltr' },
      ];
    case 'pastille': {
      const pill = Math.min(width, 520);
      const left = rtl ? x + width - pill : x;
      const cy = y + height / 2;
      const button = rtl ? left + pill - 62 : left + 62;
      return [
        { kind: 'panel', x: left, y, width: pill, height, radius: height / 2, color: palette.accent },
        { kind: 'dot', x: button, y: cy, radius: 42, color: 'rgba(255, 255, 255, 0.25)' },
        { kind: 'play', x: button + 3, y: cy, size: 36, color: '#FFFFFF' },
        { kind: 'text', text: duration, x: rtl ? button - 70 : button + 70, y: cy + 16, font: font(46, 800), color: '#FFFFFF', align, direction: 'ltr' },
      ];
    }
    case 'etiquette':
      return [
        { kind: 'bar', x: rtl ? x + width - 8 : x, y, width: 8, height, color: palette.accent },
        { kind: 'text', text: `♪ ${name}`, x: start + toward * 32, y: y + 44, font: font(34, 700), color: palette.replyInk, align, direction: 'ltr' },
        { kind: 'text', text: duration, x: start + toward * 32, y: y + 96, font: font(30, 500), color: palette.quoteInk, align, direction: 'ltr' },
      ];
  }
}
