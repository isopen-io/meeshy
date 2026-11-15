import type { ScrollContentKind, ScrollContentSummary } from '@/lib/api/social-events-v2-types';

/**
 * LE DÉFILEMENT DANS UN CONTENU (#10509) — séparé de l'accumulateur de
 * listing pour que la carte du fil ne paie que lui (budget du chunk `feed`).
 */
export const ratio2 = (part: number, whole: number): number => (whole <= 0 ? 0 : Math.round((part / whole) * 100) / 100);

/** Le défilement À L'INTÉRIEUR d'un contenu — carrousel, texte long, commentaires, slides. */
export function createContentScrollAccumulator(params: { readonly contentKind: ScrollContentKind; readonly itemsTotal: number; readonly startedAt: number }) {
  let index = 0;
  let maxIndex = 0;
  let swipes = 0;
  let maxScroll = 0;
  let readThrough = 0;

  return {
    noteIndex(next: number): void {
      if (next === index) return;
      swipes += 1;
      index = next;
      maxIndex = Math.max(maxIndex, next);
    },
    noteFraction(scrollFraction: number, readThroughFraction: number): void {
      maxScroll = Math.max(maxScroll, scrollFraction);
      readThrough = Math.max(readThrough, readThroughFraction);
    },
    hasActivity: (): boolean => swipes > 0 || maxScroll > 0,
    summary(at: number): ScrollContentSummary {
      return {
        contentKind: params.contentKind,
        itemsTotal: params.itemsTotal,
        maxIndexReached: maxIndex,
        swipes,
        maxScrollFraction: ratio2(maxScroll, 1),
        readThroughFraction: ratio2(readThrough, 1),
        durationMs: Math.max(0, Math.round(at - params.startedAt)),
      };
    },
  };
}
