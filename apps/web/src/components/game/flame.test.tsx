import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { FLAME_FORMS } from '@meeshy/shared/utils/game/flame';

import { Flame } from './flame';

const render = (props: Parameters<typeof Flame>[0]): string => renderToStaticMarkup(<Flame {...props} />);
const topOf = (html: string): number => Number(/data-game-flame-body[^>]*d="M36 ([\d.]+)/.exec(html)?.[1] ?? Number.NaN);

/**
 * LA FLAMME (#9380) — cinq formes que la loi partagée choisit selon la série :
 * braise, flamme, brasier, astre, soleil. Elle vacille tant qu’elle est visible
 * (`data-game-flicker`), et le cœur des grandes flammes porte la Signature.
 */
describe('Flame — cinq formes', () => {
  test('chaque forme de la loi se dessine', () => {
    for (const { key } of FLAME_FORMS) expect(render({ form: key, size: 64 })).toContain(`data-game-flame="${key}"`);
  });

  test('la flamme GRANDIT avec la forme : sa pointe monte', () => {
    const tops = FLAME_FORMS.map(({ key }) => topOf(render({ form: key, size: 64 })));
    expect(tops).toEqual([...tops].sort((a, b) => b - a));
    expect(new Set(tops).size).toBeGreaterThanOrEqual(4);
  });

  test('un carré de 72, décoratif, peint du feu', () => {
    const html = render({ form: 'flamme', size: 64 });
    expect(html).toContain('viewBox="0 0 72 72"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('-p-flame)');
  });

  test('la Signature en aplat claire au cœur, dès la flamme de 7 jours — pas dans la braise', () => {
    expect(render({ form: 'braise', size: 64 })).not.toContain('data-game-signature');
    for (const form of ['flamme', 'brasier', 'astre', 'soleil'] as const) {
      expect(render({ form, size: 64 })).toContain('data-game-signature="flat"');
    }
  });

  test('l’astre et le soleil portent un anneau d’or en pointillé, le soleil plus large', () => {
    expect(render({ form: 'brasier', size: 64 })).not.toContain('data-game-halo');
    const astre = render({ form: 'astre', size: 64 });
    const soleil = render({ form: 'soleil', size: 64 });
    expect(astre).toMatch(/data-game-halo[^>]*r="25"/);
    expect(soleil).toMatch(/data-game-halo[^>]*r="31"/);
    expect(astre).toContain('stroke-dasharray="3 4"');
  });

  test('elle vacille : une cible pour le repli CSS et pour le moteur', () => {
    expect(render({ form: 'flamme', size: 64 })).toContain('data-game-flicker');
  });

  test('éteinte, elle est de cendre et ne vacille plus', () => {
    const html = render({ form: 'flamme', size: 64, out: true });
    expect(html).not.toContain('data-game-flicker');
    expect(html).toContain('fill="var(--game-ash)"');
    expect(html).not.toContain('-p-flame)');
  });

  test('aucun littéral de couleur', () => {
    expect(render({ form: 'soleil', size: 64 })).not.toMatch(/ (?:fill|stroke|stop-color)="#/);
  });
});
