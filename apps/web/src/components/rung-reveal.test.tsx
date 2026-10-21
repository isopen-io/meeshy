import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { RungReveal } from './rung-reveal';

/**
 * **UN BARREAU QUI PARAÎT, EN `opacity` ET `transform`** (#11314) — le ressort
 * d'entrée n'anime plus la hauteur (`grid-template-rows`) : le bloc existe à
 * sa taille réelle dès le premier rendu et ne fait qu'apparaître.
 */
describe('RungReveal', () => {
  test('tant qu’il n’est pas paru, il n’existe pas', () => {
    expect(renderToStaticMarkup(<RungReveal shown={false}>contenu</RungReveal>)).toBe('');
  });

  test('paru : le contenu est là, à sa hauteur réelle, sans grille repliée', () => {
    const html = renderToStaticMarkup(<RungReveal shown>contenu</RungReveal>);
    expect(html).toContain('contenu');
    expect(html).toContain('signup-spring');
    expect(html).toContain('data-rung-reveal="open"');
    expect(html).not.toContain('grid-template-rows');
    expect(html).not.toContain('0fr');
  });
});
