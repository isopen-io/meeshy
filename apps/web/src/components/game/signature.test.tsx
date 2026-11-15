import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Signature, SignatureGlyph } from './signature';

const lines = (html: string): readonly string[] => html.match(/<line[^>]*>/g) ?? [];

describe('Signature — les trois traits, seuls', () => {
  const html = renderToStaticMarkup(<Signature size={64} />);

  test('un carré de 1024, décoratif, hors du parcours au clavier', () => {
    expect(html).toContain('viewBox="0 0 1024 1024"');
    expect(html).toContain('width="64"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    expect(html).not.toContain('<title');
  });

  test('en aplat par défaut : trois traits, à la couleur du texte, aux opacités 0,7 · 1 · 0,75', () => {
    expect(lines(html)).toHaveLength(3);
    expect(html).toContain('stroke="currentColor"');
    expect([...html.matchAll(/stroke-opacity="([^"]+)"/g)].map((m) => Number(m[1]))).toEqual([0.7, 1, 0.75]);
    for (const x2 of ['762', '662', '562']) expect(html).toContain(`x2="${x2}"`);
  });

  test('bouts ronds, épaisseur par défaut dans le repère 1024', () => {
    expect(html).toContain('stroke-linecap="round"');
    expect(html).toContain('stroke-width="92"');
  });

  test('aucun littéral de couleur', () => {
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});

describe('Signature — frappée et gravée', () => {
  test('frappée : trois couches, donc neuf traits ; seuls ceux de l’encre se gravent un à un', () => {
    const html = renderToStaticMarkup(<Signature size={100} mode="struck" color="var(--game-silver-ink)" />);
    expect(lines(html)).toHaveLength(9);
    expect(html.match(/data-game-dash="/g)).toHaveLength(3);
    expect(html).toContain('stroke="var(--game-shade)"');
    expect(html).toContain('stroke="var(--game-glint)"');
  });

  test('gravée : deux couches', () => {
    const html = renderToStaticMarkup(<Signature size={100} mode="engraved" color="var(--game-gold-ink)" />);
    expect(lines(html)).toHaveLength(6);
    expect(html).toContain('stroke="var(--game-gold-ink)"');
  });

  test('l’épaisseur est celle demandée', () => {
    expect(renderToStaticMarkup(<Signature size={50} strokeWidth={120} />)).toContain('stroke-width="120"');
  });
});

describe('SignatureGlyph — posée dans le SVG d’un autre objet', () => {
  test('un groupe centré en (cx, cy), mis à l’échelle size / 1024', () => {
    const html = renderToStaticMarkup(
      <svg>
        <SignatureGlyph cx={60} cy={60} size={66} color="var(--c)" mode="flat" />
      </svg>,
    );
    expect(html).toContain('translate(27 27) scale(0.064453125)');
    expect(html).not.toContain('<svg viewBox');
  });
});
