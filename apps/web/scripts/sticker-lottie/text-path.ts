/**
 * LE TEXTE D'UN STICKER EN TRACÉ (#10639) — « MDR », « Courage ! », « LUNDI » :
 * le web les écrit en `system-ui`, une police qu'un fichier Lottie ne peut ni
 * porter ni nommer de façon fiable sur iOS. Le générateur les convertit donc
 * en contours avec Manrope (OFL, voir `fonts/NOTICE.md`), la sans-serif que le
 * dépôt redistribue déjà ; le film n'a plus besoin d'aucune police.
 *
 * fontkit n'instancie pas la graisse d'un WOFF2 variable (sa table `cmap`
 * disparaît) : la source est le TTF variable, gardé à côté.
 */
import { createRequire } from 'node:module';

type Glyph = { readonly path: { scale(sx: number, sy: number): { translate(x: number, y: number): { toSVG(): string } } } };
type GlyphRun = { readonly glyphs: readonly Glyph[]; readonly positions: readonly { readonly xAdvance: number; readonly xOffset: number }[] };
type Font = { readonly unitsPerEm: number; getVariation(settings: Record<string, number>): Font; layout(text: string): GlyphRun };

const fontkit = createRequire(import.meta.url)('fontkit') as { openSync(path: string): Font };
const MANROPE = fontkit.openSync(new URL('./fonts/manrope-variable.ttf', import.meta.url).pathname);
const WEIGHT = { min: 200, max: 800 } as const;

export type StickerText = {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly weight: number;
  readonly anchor: 'start' | 'middle' | 'end';
};

export function textToPathData(t: StickerText): string {
  const font = MANROPE.getVariation({ wght: Math.min(WEIGHT.max, Math.max(WEIGHT.min, t.weight)) });
  const run = font.layout(t.text);
  const scale = t.size / font.unitsPerEm;
  const width = run.positions.reduce((sum, position) => sum + position.xAdvance * scale, 0);
  const origin = t.anchor === 'middle' ? t.x - width / 2 : t.anchor === 'end' ? t.x - width : t.x;
  return run.glyphs
    .reduce<{ readonly x: number; readonly parts: readonly string[] }>(
      (acc, glyph, index) => {
        const position = run.positions[index] as GlyphRun['positions'][number];
        const part = glyph.path.scale(scale, -scale).translate(acc.x + position.xOffset * scale, t.y).toSVG();
        return { x: acc.x + position.xAdvance * scale, parts: [...acc.parts, part] };
      },
      { x: origin, parts: [] },
    )
    .parts.join('');
}
