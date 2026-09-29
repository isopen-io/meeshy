import { describe, expect, test } from 'bun:test';

import { montageLayout, type MontageStyle } from './call-montage';
import { drawMontage, type MontageText, type Paintable } from './call-montage-render';

/**
 * LE RENDU DES MONTAGES GLAMOUR (#8580) — ce que le canevas reçoit : chaque
 * visage peint une fois, le titre et les accroches de la couverture, le noir
 * et blanc développé en gris, les néons qui rayonnent de leur couleur.
 */

type Entry = { readonly kind: 'call' | 'set'; readonly key: string; readonly value: readonly unknown[] };

const recorder = () => {
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
  ) as unknown as CanvasRenderingContext2D;
  return { log, context };
};

const tiles = (count: number): readonly Paintable[] => Array.from({ length: count }, () => ({ source: {} as CanvasImageSource, size: { width: 1280, height: 720 }, mirrored: false, fit: 'cover' as const }));

const TEXT: MontageText = { bubble: 'Quel appel !', date: '28 septembre 2026', coverlines: ['L’appel de l’année', 'Tous réunis', 'Exclusif'] };

const draw = (style: MontageStyle, count: number) => {
  const { log, context } = recorder();
  drawMontage(context, montageLayout({ style, count, size: { width: 1080, height: 1920 } }), tiles(count), TEXT);
  return log;
};

const texts = (log: readonly Entry[]): readonly unknown[] => log.filter((entry) => entry.key === 'fillText').map((entry) => entry.value[0]);
const sets = (log: readonly Entry[], key: string): readonly unknown[] => log.filter((entry) => entry.kind === 'set' && entry.key === key).map((entry) => entry.value[0]);

describe('le rendu glamour', () => {
  (['cover', 'gold', 'redcarpet', 'film', 'neon', 'noir'] as const).forEach((style) =>
    test(`${style} peint chaque visage une fois`, () => {
      expect(draw(style, 3).filter((entry) => entry.key === 'drawImage')).toHaveLength(3);
    }),
  );

  test('la couverture écrit MEESHY, la date et ses trois accroches', () => {
    const written = texts(draw('cover', 3));
    expect(written).toContain('MEESHY');
    expect(written).toContain('28 SEPTEMBRE 2026');
    TEXT.coverlines.forEach((line) => expect(written).toContain(line.toUpperCase()));
  });

  test('le noir et blanc développe chaque visage en gris', () => {
    expect(sets(draw('noir', 2), 'filter').some((filter) => typeof filter === 'string' && filter.includes('grayscale(1)'))).toBe(true);
  });

  test('les néons rayonnent de leur couleur', () => {
    const shadows = sets(draw('neon', 2), 'shadowColor');
    expect(shadows).toContain('#ff2d95');
    expect(shadows).toContain('#00e5ff');
  });

  test('le tapis rouge et le doré se peignent sur un fond rayonnant', () => {
    expect(draw('redcarpet', 2).some((entry) => entry.key === 'createRadialGradient')).toBe(true);
    expect(draw('gold', 2).some((entry) => entry.key === 'createRadialGradient')).toBe(true);
  });

  test('la pellicule numérote ses images', () => {
    expect(texts(draw('film', 2))).toEqual(['12A', '13A']);
  });
});
