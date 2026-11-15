import type { CardOp, CardTextOp } from './message-card-ops';
import type { CardLayout, CardRegion } from './message-card-layout';
import { isNoDecor, type CardDecor } from './message-card-models';
import { GUILLEMET_FONT, canvasFont, type CardPalette } from './message-card-templates';

/**
 * **LE DÉCOR D'UNE MAQUETTE, POSÉ SUR LA CARTE** (#18673, miroir de
 * `MessageCardDecorator`) — après la mise en page commune, sans la refaire :
 * le texte se centre, un cadre ou un panneau entoure le contenu, un ornement
 * le signe. Le panneau et l'ornement sont du contenu (ils penchent avec lui) ;
 * le cadre dépend du FORMAT et reste droit, comme le fond.
 */

export const DECOR_PANEL_PADDING = 56;
export const DECOR_PANEL_RADIUS = 44;
export const DECOR_BORDER_INSET = 44;
export const DECOR_BORDER_WIDTH = 3;
export const DECOR_RULE_WIDTH = 120;
export const DECOR_RULE_HEIGHT = 10;
export const DECOR_QUOTE_MARK_SIZE = 260;
const QUOTE_BAR_WIDTH = 6;

type Bounds = { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };

/** Ce que le contenu occupe — l'en-tête compris. */
function contentBounds(regions: readonly CardRegion[]): Bounds | null {
  const parts = regions.filter((region) => region.height > 0);
  if (parts.length === 0) return null;
  return {
    minX: Math.min(...parts.map((part) => part.x)),
    minY: Math.min(...parts.map((part) => part.y)),
    maxX: Math.max(...parts.map((part) => part.x + part.width)),
    maxY: Math.max(...parts.map((part) => part.y + part.height)),
  };
}

const startsTheLine = (op: CardTextOp): boolean => op.rotate === undefined && ((op.align === 'left' && op.direction === 'ltr') || (op.align === 'right' && op.direction === 'rtl'));

const isQuoteBar = (op: CardOp, quote: CardRegion | undefined): boolean =>
  op.kind === 'bar' && quote !== undefined && op.width === QUOTE_BAR_WIDTH && (Math.abs(op.x - quote.x) < 1 || Math.abs(op.x + op.width - (quote.x + quote.width)) < 1);

/** `#RRGGBB` à l'opacité `alpha`. */
function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (hex === undefined) return color;
  const channel = (at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
  return `rgba(${channel(0)}, ${channel(2)}, ${channel(4)}, ${alpha})`;
}

const isDark = (palette: CardPalette): boolean => palette.replyInk.toUpperCase() === '#FFFFFF';

export function decorateCard(layout: CardLayout, decor: CardDecor, palette: CardPalette): CardLayout {
  if (isNoDecor(decor)) return layout;
  const bounds = contentBounds(layout.regions);
  if (bounds === null) return layout;
  const column = layout.regions.find((region) => region.part === 'reply') ?? layout.regions.find((region) => region.part === 'quote');
  const centerX = column === undefined ? layout.width / 2 : column.x + column.width / 2;
  const quote = layout.regions.find((region) => region.part === 'quote');
  const centered = decor.alignment === 'center';
  const content: readonly CardOp[] = centered
    ? layout.ops.flatMap((op): readonly CardOp[] => {
        if (op.kind === 'text' && startsTheLine(op)) return [{ ...op, x: centerX, align: 'center' }];
        return isQuoteBar(op, quote) ? [] : [op];
      })
    : layout.ops;
  const panel: readonly CardOp[] =
    decor.frame === 'panel'
      ? [
          {
            kind: 'panel',
            x: Math.max(24, bounds.minX - DECOR_PANEL_PADDING),
            y: bounds.minY - DECOR_PANEL_PADDING,
            width: Math.min(layout.width - 24, bounds.maxX + DECOR_PANEL_PADDING) - Math.max(24, bounds.minX - DECOR_PANEL_PADDING),
            height: bounds.maxY - bounds.minY + 2 * DECOR_PANEL_PADDING,
            radius: DECOR_PANEL_RADIUS,
            color: isDark(palette) ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.62)',
          },
        ]
      : [];
  const ornament: readonly CardOp[] =
    decor.ornament === 'accentRule'
      ? [
          {
            kind: 'panel',
            x: centered ? centerX - DECOR_RULE_WIDTH / 2 : bounds.minX,
            y: Math.max(24, bounds.minY - 64),
            width: DECOR_RULE_WIDTH,
            height: DECOR_RULE_HEIGHT,
            radius: DECOR_RULE_HEIGHT / 2,
            color: palette.accent,
          },
        ]
      : decor.ornament === 'quoteMark'
        ? [
            {
              kind: 'text',
              text: '“',
              x: centered ? centerX : bounds.minX - 24,
              y: bounds.minY + DECOR_QUOTE_MARK_SIZE * 0.55,
              font: canvasFont(GUILLEMET_FONT, DECOR_QUOTE_MARK_SIZE),
              color: withAlpha(palette.accent, 0.28),
              align: centered ? 'center' : 'left',
              direction: 'ltr',
            },
          ]
        : [];
  const inset = DECOR_BORDER_INSET;
  const line = DECOR_BORDER_WIDTH;
  const ink = withAlpha(palette.accent, 0.55);
  const window = layout.viewportHeight ?? layout.height;
  const border: readonly CardOp[] =
    decor.frame === 'border'
      ? [
          { kind: 'bar', x: inset, y: inset, width: layout.width - 2 * inset, height: line, color: ink },
          { kind: 'bar', x: inset, y: window - inset - line, width: layout.width - 2 * inset, height: line, color: ink },
          { kind: 'bar', x: inset, y: inset, width: line, height: window - 2 * inset, color: ink },
          { kind: 'bar', x: layout.width - inset - line, y: inset, width: line, height: window - 2 * inset, color: ink },
        ]
      : [];
  return { ...layout, ops: [...panel, ...ornament, ...content], fixed: [...(layout.fixed ?? []), ...border] };
}
