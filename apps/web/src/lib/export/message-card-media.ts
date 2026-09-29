import type { CardOp } from './message-card-ops';
import type { CardPalette } from './message-card-templates';

/**
 * **LES MÉDIAS D'UNE CARTE** (#8693) — l'image jointe, la PREMIÈRE image d'une
 * vidéo, et l'audio, qui n'a pas d'image : on le REPRÉSENTE, en plusieurs
 * styles, au même titre que la liaison entre la citation et la réponse.
 *
 * LOI PURE : elle ne connaît des pièces que leurs dimensions (image, vidéo) ou
 * leur durée, leur nom et leur onde (audio). Les pixels arrivent au peintre à
 * part (`message-card-paint.ts`), désignés par leur rang.
 *
 * Trois DISPOSITIONS pour les pièces visuelles (quatre au plus, un « +N » dit
 * le reste) : la MOSAÏQUE, la PLEINE largeur de la première, la BANDE de
 * vignettes carrées. Quatre REPRÉSENTATIONS de l'audio : l'ONDE dans sa bulle,
 * le SPECTRE en miroir, la PASTILLE de lecture, l'ÉTIQUETTE (nom et durée).
 */

export type CardVisualMedia = { readonly kind: 'image' | 'video'; readonly width: number; readonly height: number };
export type CardAudioMedia = { readonly kind: 'audio'; readonly durationMs: number; readonly name: string; readonly peaks: readonly number[] };
export type CardMedia = CardVisualMedia | CardAudioMedia;

export const CARD_MEDIA_STYLES = ['mosaique', 'pleine', 'bande'] as const;
export type CardMediaStyle = (typeof CARD_MEDIA_STYLES)[number];

export const CARD_AUDIO_STYLES = ['onde', 'spectre', 'pastille', 'etiquette'] as const;
export type CardAudioStyle = (typeof CARD_AUDIO_STYLES)[number];

export const DEFAULT_MEDIA_STYLE: CardMediaStyle = 'mosaique';
export const DEFAULT_AUDIO_STYLE: CardAudioStyle = 'onde';

const MAX_VISUALS = 4;
const GAP = 12;
const RADIUS = 26;
const AUDIO_GAP = 24;
const STRIP_TILE = 300;

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

type Slot = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

const ratioOf = (media: CardVisualMedia): number => {
  const ratio = media.width > 0 && media.height > 0 ? media.height / media.width : 1;
  return Math.min(1.25, Math.max(0.5, ratio));
};

/** Les cadres des pièces visuelles, relatifs au coin du bloc, et la hauteur du bloc. */
function visualSlots(visuals: readonly CardVisualMedia[], style: CardMediaStyle, width: number, maxHeight: number): { readonly slots: readonly Slot[]; readonly height: number } {
  const n = Math.min(visuals.length, MAX_VISUALS);
  const [first] = visuals;
  if (n === 0 || first === undefined || maxHeight <= 0) return { slots: [], height: 0 };
  if (style === 'bande') {
    const tile = Math.min(STRIP_TILE, maxHeight, Math.floor((width - GAP * (n - 1)) / n));
    return { slots: Array.from({ length: n }, (_, i) => ({ x: i * (tile + GAP), y: 0, width: tile, height: tile })), height: tile };
  }
  if (style === 'pleine' || n === 1) {
    const height = Math.min(maxHeight, Math.round(width * ratioOf(first)));
    return { slots: [{ x: 0, y: 0, width, height }], height };
  }
  const half = Math.floor((width - GAP) / 2);
  if (n === 2) {
    const height = Math.min(maxHeight, half);
    return { slots: [{ x: 0, y: 0, width: half, height }, { x: half + GAP, y: 0, width: half, height }], height };
  }
  const height = Math.min(maxHeight, Math.round(width * 0.75));
  const row = Math.floor((height - GAP) / 2);
  if (n === 3) {
    return {
      slots: [
        { x: 0, y: 0, width: half, height },
        { x: half + GAP, y: 0, width: half, height: row },
        { x: half + GAP, y: row + GAP, width: half, height: height - row - GAP },
      ],
      height,
    };
  }
  return {
    slots: [
      { x: 0, y: 0, width: half, height: row },
      { x: half + GAP, y: 0, width: half, height: row },
      { x: 0, y: row + GAP, width: half, height: height - row - GAP },
      { x: half + GAP, y: row + GAP, width: half, height: height - row - GAP },
    ],
    height,
  };
}

export type CardMediaBlock = {
  readonly height: number;
  /** Les opérations du bloc, son coin haut posé en (`x`, `y`). */
  readonly place: (x: number, y: number) => readonly CardOp[];
};

const EMPTY_BLOCK: CardMediaBlock = { height: 0, place: () => [] };

/**
 * LE BLOC DES MÉDIAS d'un message, dans une colonne de `width` pixels : les
 * pièces visuelles d'abord (au plus `maxHeight` de haut), puis la
 * représentation du PREMIER audio.
 */
export function layoutCardMedia(params: {
  readonly media: readonly CardMedia[];
  readonly style: CardMediaStyle;
  readonly audioStyle: CardAudioStyle;
  readonly width: number;
  readonly maxHeight: number;
  readonly palette: CardPalette;
  readonly rtl: boolean;
  readonly font: (size: number, weight: number) => string;
}): CardMediaBlock {
  const { media, style, audioStyle, width, palette, rtl } = params;
  const visuals = media.flatMap((item, index) => (item.kind === 'audio' ? [] : [{ item, index }]));
  const audio = media.find((item): item is CardAudioMedia => item.kind === 'audio') ?? null;
  const audioHeight = audio === null ? 0 : AUDIO_HEIGHT[audioStyle];
  const visualRoom = params.maxHeight - (audio === null ? 0 : audioHeight + AUDIO_GAP);
  const { slots, height: visualHeight } = visualSlots(
    visuals.map((v) => v.item),
    style,
    width,
    visualRoom,
  );
  const gap = visualHeight > 0 && audio !== null ? AUDIO_GAP : 0;
  const height = visualHeight + gap + audioHeight;
  if (height === 0) return EMPTY_BLOCK;
  const hidden = visuals.length - slots.length;

  return {
    height,
    place: (x, y) => {
      const ops: CardOp[] = [];
      slots.forEach((slot, i) => {
        const visual = visuals[i];
        if (visual === undefined) return;
        const left = rtl ? x + width - slot.x - slot.width : x + slot.x;
        ops.push({ kind: 'media', index: visual.index, x: left, y: y + slot.y, width: slot.width, height: slot.height, radius: RADIUS, video: visual.item.kind === 'video' });
        if (visual.item.kind === 'video') ops.push(...playBadge(left + slot.width / 2, y + slot.y + slot.height / 2, Math.min(slot.width, slot.height)));
      });
      const last = slots[slots.length - 1];
      if (hidden > 0 && last !== undefined) {
        const left = rtl ? x + width - last.x - last.width : x + last.x;
        ops.push({ kind: 'panel', x: left + last.width - 118, y: y + last.y + last.height - 78, width: 102, height: 62, radius: 31, color: 'rgba(0, 0, 0, 0.55)' });
        ops.push({ kind: 'text', text: `+${hidden}`, x: left + last.width - 67, y: y + last.y + last.height - 36, font: params.font(30, 700), color: '#FFFFFF', align: 'center', direction: 'ltr' });
      }
      if (audio !== null) ops.push(...audioOps(audio, audioStyle, { x, y: y + visualHeight + gap, width, height: audioHeight, palette, rtl, font: params.font }));
      return ops;
    },
  };
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
    { kind: 'dot', x: cx, y: cy, radius, color: 'rgba(0, 0, 0, 0.5)' },
    { kind: 'play', x: cx + radius * 0.08, y: cy, size: radius * 0.9, color: '#FFFFFF' },
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
