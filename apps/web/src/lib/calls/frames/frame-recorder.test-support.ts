import type { Surface2D } from './frame-paint-kit';

/**
 * UN CANEVAS QUI NOTE — le contexte 2D des témoins de peinture : chaque
 * appel et chaque affectation est consigné, les dégradés sont des objets
 * muets, `measureText` ne mesure rien (le peintre retombe alors sur sa
 * chasse moyenne). Même motif que `call-montage-glamour-render.test.ts`.
 */

export type Entry = { readonly kind: 'call' | 'set'; readonly key: string; readonly value: readonly unknown[] };

export function recorder(): { readonly log: Entry[]; readonly context: Surface2D } {
  const log: Entry[] = [];
  const gradient = { addColorStop: () => undefined };
  const context = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return (...args: unknown[]) => {
            log.push({ kind: 'call', key: String(key), value: args });
            return gradient;
          };
        }
        return (...args: unknown[]) => void log.push({ kind: 'call', key: String(key), value: args });
      },
      set: (_target, key, value: unknown) => {
        log.push({ kind: 'set', key: String(key), value: [value] });
        return true;
      },
    },
  ) as unknown as Surface2D;
  return { log, context };
}

const INK = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage']);

export const inked = (log: readonly Entry[]): number => log.filter((entry) => entry.kind === 'call' && INK.has(entry.key)).length;

export const written = (log: readonly Entry[]): readonly string[] => log.filter((entry) => entry.key === 'fillText').map((entry) => String(entry.value[0]));

export const sets = (log: readonly Entry[], key: string): readonly unknown[] => log.filter((entry) => entry.kind === 'set' && entry.key === key).map((entry) => entry.value[0]);

export const calls = (log: readonly Entry[], key: string): readonly (readonly unknown[])[] => log.filter((entry) => entry.kind === 'call' && entry.key === key).map((entry) => entry.value);

/**
 * Les trois traits de la marque : trois segments HORIZONTAUX consécutifs
 * (`moveTo` puis `lineTo` à la même ordonnée), partant de la même abscisse,
 * aux longueurs 500 · 400 · 300 du repère 1024, également espacés.
 */
export function drewBrandDashes(log: readonly Entry[]): boolean {
  const segments = log.flatMap((entry, index) => {
    const next = log[index + 1];
    if (entry.key !== 'moveTo' || next?.key !== 'lineTo') return [];
    const [x1, y1] = entry.value as [number, number];
    const [x2, y2] = next.value as [number, number];
    return Math.abs(y1 - y2) < 1e-6 && x2 > x1 ? [{ x1, x2, y: y1, length: x2 - x1 }] : [];
  });
  return segments.some((first, index) => {
    const second = segments[index + 1];
    const third = segments[index + 2];
    if (second === undefined || third === undefined) return false;
    const sameStart = Math.abs(first.x1 - second.x1) < 1e-6 && Math.abs(first.x1 - third.x1) < 1e-6;
    const ratios = Math.abs(second.length / first.length - 0.8) < 1e-3 && Math.abs(third.length / first.length - 0.6) < 1e-3;
    const spaced = Math.abs(second.y - first.y - (third.y - second.y)) < 1e-6 && second.y > first.y;
    return sameStart && ratios && spaced;
  });
}
