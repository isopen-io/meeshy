import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Chest } from './chest';

const render = (props: Parameters<typeof Chest>[0]): string => renderToStaticMarkup(<Chest {...props} />);
const opacityOf = (html: string, part: string): number => Number(new RegExp(`${part}[^>]*opacity="([\\d.]+)"`).exec(html)?.[1] ?? Number.NaN);

/**
 * LE COFFRE DU JOUR (#9380) — fermé, ouvert, et sa serrure à la Signature.
 * Les deux couvercles sont dessinés ensemble : la chorégraphie du coffre
 * (« le couvercle s’ouvre, les récompenses montent ») fond de l’un à l’autre
 * par `transform` et `opacity`, sans changer la mise en page.
 */
describe('Chest', () => {
  test('un coffre de 90 × 72, décoratif', () => {
    const html = render({ state: 'closed', size: 90 });
    expect(html).toContain('viewBox="0 0 90 72"');
    expect(html).toContain('width="90"');
    expect(html).toContain('height="72"');
    expect(html).toContain('aria-hidden="true"');
  });

  test('fermé : le couvercle rond se voit, l’ouvert et les étincelles se cachent', () => {
    const html = render({ state: 'closed', size: 90 });
    expect(opacityOf(html, 'data-game-lid-closed')).toBe(1);
    expect(opacityOf(html, 'data-game-lid-open')).toBe(0);
    expect(opacityOf(html, 'data-game-spark-group')).toBe(0);
    expect(html).toContain('data-game-chest="closed"');
  });

  test('ouvert : l’inverse', () => {
    const html = render({ state: 'open', size: 90 });
    expect(opacityOf(html, 'data-game-lid-closed')).toBe(0);
    expect(opacityOf(html, 'data-game-lid-open')).toBe(1);
    expect(opacityOf(html, 'data-game-spark-group')).toBe(1);
    expect(html).toContain('data-game-chest="open"');
  });

  test('trois étincelles d’or montent du coffre ouvert', () => {
    expect(render({ state: 'open', size: 90 }).match(/data-game-spark="/g)).toHaveLength(3);
  });

  test('la serrure est la Signature gravée sur une plaque d’or', () => {
    const html = render({ state: 'closed', size: 90 });
    expect(html).toContain('data-game-lock');
    expect(html).toContain('data-game-signature="engraved"');
    expect(html).toContain('stroke="var(--game-gold-ink)"');
  });

  test('le corps est d’indigo, la bande d’or', () => {
    const html = render({ state: 'closed', size: 90 });
    expect(html).toContain('-p-indigo)');
    expect(html).toContain('-p-gold)');
  });

  test('aucun littéral de couleur', () => {
    expect(render({ state: 'open', size: 90 })).not.toMatch(/ (?:fill|stroke|stop-color)="#/);
  });
});
