import type { CardLinkId } from '@/lib/export/message-card-templates';

/**
 * **LA LIAISON POSÉE, EN PETIT** (#18809) — miroir de `MessageCardLinkSketch`
 * (`apps/ios/Meeshy/Features/Export/MessageCardThumbnails.swift`). Une case du
 * choix de liaison montre une carte miniature : la citation en haut, la réponse
 * en bas et, entre les deux, ce que la liaison y PEINT, dans les encres de la
 * palette choisie. Les coordonnées vivent dans un carré de 50 × 50 ; la bande de
 * la liaison est `LINK_SKETCH_BAND`.
 */
export type SketchInk = 'accent' | 'quote' | 'reply' | 'quotePanel' | 'replyPanel';

export type SketchMark =
  | { readonly kind: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly width: number; readonly dash: readonly number[]; readonly ink: SketchInk }
  | { readonly kind: 'dot'; readonly x: number; readonly y: number; readonly radius: number; readonly ink: SketchInk }
  | { readonly kind: 'ring'; readonly x: number; readonly y: number; readonly radius: number; readonly ink: SketchInk }
  | { readonly kind: 'panel'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly ink: SketchInk }
  | { readonly kind: 'diamond'; readonly x: number; readonly y: number; readonly radius: number; readonly ink: SketchInk }
  | { readonly kind: 'arrow'; readonly x: number; readonly top: number; readonly bottom: number; readonly end: number; readonly ink: SketchInk }
  | { readonly kind: 'glyph'; readonly text: string; readonly x: number; readonly y: number; readonly size: number; readonly serif: boolean; readonly ink: SketchInk };

export type LinkSketch = { readonly quote: readonly SketchMark[]; readonly link: readonly SketchMark[]; readonly reply: readonly SketchMark[] };

export const LINK_SKETCH_SIDE = 50;
export const LINK_SKETCH_BAND = { top: 17, bottom: 33 } as const;

const line = (x1: number, y1: number, x2: number, y2: number, width: number, ink: SketchInk, dash: readonly number[] = []): SketchMark => ({ kind: 'line', x1, y1, x2, y2, width, dash, ink });

const QUOTE_BAR_LINKS: readonly CardLinkId[] = ['orbite', 'filet', 'fleche', 'fil'];

function quoteMarks(link: CardLinkId): readonly SketchMark[] {
  if (link === 'bulles') return [{ kind: 'panel', x: 5, y: 4, width: 30, height: 13, ink: 'quotePanel' }, line(10, 10.5, 29, 10.5, 2, 'quote')];
  const barred = QUOTE_BAR_LINKS.includes(link);
  const start = barred ? 14 : 8;
  return [...(barred ? [line(9, 6, 9, 15, 2, 'accent')] : []), line(start, 8, 40, 8, 2, 'quote'), line(start, 13, 32, 13, 2, 'quote')];
}

function replyMarks(link: CardLinkId): readonly SketchMark[] {
  if (link === 'bulles') return [{ kind: 'panel', x: 15, y: 33, width: 30, height: 13, ink: 'replyPanel' }, line(20, 39.5, 40, 39.5, 2.6, 'reply')];
  return [line(8, 37, 42, 37, 2.6, 'reply'), line(8, 42.5, 33, 42.5, 2.6, 'reply')];
}

function linkMarks(link: CardLinkId): readonly SketchMark[] {
  switch (link) {
    case 'orbite':
      return [line(6, 25, 20, 25, 1.8, 'accent', [1, 3.5]), { kind: 'ring', x: 25, y: 25, radius: 3, ink: 'accent' }, line(30, 25, 44, 25, 1.8, 'accent', [1, 3.5])];
    case 'filet':
      return [line(8, 25, 24, 25, 3, 'accent')];
    case 'guillemets':
      return [{ kind: 'glyph', text: '“', x: 13, y: 26, size: 26, serif: true, ink: 'accent' }];
    case 'fleche':
      return [{ kind: 'arrow', x: 12, top: 19, bottom: 27, end: 28, ink: 'accent' }];
    case 'bulles':
    case 'silence':
      return [];
    case 'fil':
      return [line(9, 18, 9, 27, 2, 'accent'), { kind: 'dot', x: 9, y: 30, radius: 2.2, ink: 'accent' }];
    case 'points':
      return [19, 25, 31].map((x) => ({ kind: 'dot', x, y: 25, radius: 1.9, ink: 'accent' }));
    case 'losange':
      return [line(8, 25, 19, 25, 1.6, 'accent'), { kind: 'diamond', x: 25, y: 25, radius: 3.6, ink: 'accent' }, line(31, 25, 42, 25, 1.6, 'accent')];
    case 'asterisme':
      return [{ kind: 'glyph', text: '⁂', x: 25, y: 25, size: 15, serif: false, ink: 'accent' }];
    case 'double':
      return [line(8, 23, 42, 23, 1.5, 'accent'), line(8, 27.5, 42, 27.5, 1.5, 'accent')];
  }
}

export const linkSketch = (link: CardLinkId): LinkSketch => ({ quote: quoteMarks(link), link: linkMarks(link), reply: replyMarks(link) });

export const sketchMarks = (sketch: LinkSketch): readonly SketchMark[] => [...sketch.quote, ...sketch.link, ...sketch.reply];
