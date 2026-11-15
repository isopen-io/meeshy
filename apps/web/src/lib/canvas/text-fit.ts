/**
 * UN TEXTE QUI TIENT DANS SA PLACE — la règle des cadres d'appel (#8743 § 5.3),
 * extraite ici pour que les cadres de gloire (#10159) l'importent sans dépendre
 * du module des appels : un texte trop long rétrécit jusqu'à 60 % de sa taille,
 * puis se tronque d'une ellipse. La mesure est INJECTÉE (le canevas en
 * production, une règle fixe dans les témoins).
 */

/** Mesure la largeur de `text` à `px` pixels. */
export type MeasureText = (text: string, px: number) => number;

export type FittedText = { readonly text: string; readonly px: number };

const MIN_SHARE = 0.6;
const ELLIPSIS = '…';

/** Coupé entre deux points de code, jamais au milieu d'un caractère. */
export function fitText(measure: MeasureText, text: string, maxWidth: number, fontPx: number): FittedText {
  if (text.length === 0 || maxWidth <= 0) return { text: maxWidth <= 0 ? '' : text, px: fontPx };
  const width = measure(text, fontPx);
  if (width <= maxWidth) return { text, px: fontPx };
  const floor = fontPx * MIN_SHARE;
  const scaled = Math.max(floor, (fontPx * maxWidth) / width);
  const settle = (px: number): number => (px > floor && measure(text, px) > maxWidth ? settle(Math.max(floor, px * 0.97)) : px);
  const px = settle(scaled);
  if (measure(text, px) <= maxWidth) return { text, px };
  const glyphs = Array.from(text);
  const cut = (keep: number): string => (keep <= 0 ? ELLIPSIS : `${glyphs.slice(0, keep).join('').trimEnd()}${ELLIPSIS}`);
  const longest = (low: number, high: number): number => {
    if (low >= high) return low;
    const middle = Math.ceil((low + high) / 2);
    return measure(cut(middle), px) <= maxWidth ? longest(middle, high) : longest(low, middle - 1);
  };
  const keep = longest(0, glyphs.length - 1);
  return { text: keep === 0 && measure(ELLIPSIS, px) > maxWidth ? '' : cut(keep), px };
}
