/**
 * **LE CARROUSEL D'UN MODE, EN LOI PURE** (#8578) — quel élément est au
 * centre, et où vont les flèches. Contrairement aux rangées (`call-row-keys.ts`),
 * le carrousel ne boucle pas : au bout, il s'arrête.
 */

export function nearestToCenter(items: readonly { readonly id: string; readonly center: number }[], middle: number): string | null {
  const best = items.reduce<{ readonly id: string; readonly gap: number } | null>((found, item) => {
    const gap = Math.abs(item.center - middle);
    return found === null || gap < found.gap ? { id: item.id, gap } : found;
  }, null);
  return best?.id ?? null;
}

type Step = { readonly key: string; readonly index: number; readonly count: number; readonly rtl: boolean };

export function carouselStep({ key, index, count, rtl }: Step): number | null {
  if (count === 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key !== 'ArrowRight' && key !== 'ArrowLeft') return null;
  const next = index + ((key === 'ArrowRight') !== rtl ? 1 : -1);
  return next < 0 || next >= count ? null : next;
}
