import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { BrandMark } from './brand-mark';

/**
 * LA MARQUE EST LE GLYPHE, PAS L'ICÔNE (revue de #5555, défaut 1).
 *
 * `LoginView.swift:96-103` monte `AnimatedLogoView` — les TROIS TRAITS seuls,
 * teintés par le schéma. L'écran servait `/brand/logo.png`, l'icône
 * d'application : un carré indigo plein, aux angles vifs, dans les deux
 * schémas. Le témoin s'écrit sur ce qui DISTINGUE les deux — le nombre de
 * traits, leur géométrie (`MeeshyDashesShape`), et le fait qu'AUCUNE couleur
 * n'est écrite ici : `currentColor` seul, pour que le consommateur pose le
 * jeton dérivé et que les deux schémas suivent d'eux-mêmes.
 */
describe('BrandMark — le glyphe des trois traits', () => {
  const html = renderToStaticMarkup(<BrandMark size={100} lineWidth={10} />);

  test('trois traits, aux abscisses de MeeshyDashesShape (762 · 662 · 562)', () => {
    expect(html.match(/<line/g)).toHaveLength(3);
    for (const x2 of ['762', '662', '562']) expect(html).toContain(`x2="${x2}"`);
    for (const y of ['384', '512', '640']) expect(html).toContain(`y1="${y}"`);
  });

  test('le trait du MILIEU est le plus dense — 0,7 · 1 · 0,75 (breathe == false)', () => {
    const opacities = [...html.matchAll(/stroke-opacity="([^"]+)"/g)].map((m) => Number(m[1]));
    expect(opacities).toEqual([0.7, 1, 0.75]);
  });

  test('aucune couleur écrite : `currentColor`, donc les deux schémas suivent le jeton de l’hôte', () => {
    expect(html).toContain('stroke="currentColor"');
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  test('l’épaisseur est convertie du repère de la VUE vers le repère 1024 du tracé', () => {
    // 10 pt sur une vue de 100 pt ⇒ 10 % de la boîte ⇒ 102,4 unités du viewBox.
    expect(html).toContain('stroke-width="102.4"');
    // La même épaisseur VISUELLE sur une vue deux fois plus petite double la
    // valeur du repère : c'est ce que l'appelant n'a pas à recalculer.
    expect(renderToStaticMarkup(<BrandMark size={50} lineWidth={10} />)).toContain('stroke-width="204.8"');
  });

  test('décoratif : masqué au lecteur d’écran, hors du parcours au clavier', () => {
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
  });
});
