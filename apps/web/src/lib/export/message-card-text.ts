/**
 * LE TEXTE D'UNE CARTE — couper en lignes, tronquer, lire le sens. Lois pures,
 * la mesure injectée : `ctx.measureText` en production, une règle fixe dans
 * les témoins.
 */

export type Measure = (text: string, font: string) => number;

const ELLIPSIS = '…';

const RTL_STRONG = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LTR_STRONG = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/;

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

