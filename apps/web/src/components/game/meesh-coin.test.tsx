import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { MeeshCoin, MeeshCoinFlip } from './meesh-coin';

/**
 * LA MEESH, AVERS ET REVERS (#9380, conception IV.2). Avers : la Signature
 * frappée, « MEESHY · UNE MEESH » en couronne, tranche cannelée. Revers : Mee
 * et Meo face à face, le numéro de frappe et l’année. Trois éditions : argent,
 * or (chaque centième), prisme (chaque millième).
 */
describe('MeeshCoin — l’avers', () => {
  const html = renderToStaticMarkup(<MeeshCoin side="obverse" size={120} />);

  test('un disque de 120, décoratif', () => {
    expect(html).toContain('viewBox="0 0 120 120"');
    expect(html).toContain('width="120"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-game-face="obverse"');
  });

  test('la Signature est FRAPPÉE : ombre, éclat, encre', () => {
    expect(html).toContain('data-game-signature="struck"');
    expect(html).toContain('stroke="var(--game-shade)"');
  });

  test('l’inscription court en couronne, deux fois', () => {
    expect(html).toContain('<textPath');
    expect(html).toContain('MEESHY · UNE MEESH · MEESHY · UNE MEESH ·');
  });

  test('la tranche est cannelée : un cercle en pointillé', () => {
    expect(html).toMatch(/stroke-dasharray="1\.4 2"/);
  });

  test('porte le trait de reflet que le moteur ou le repli CSS fait balayer', () => {
    expect(html).toContain('data-game-sheen');
  });

  test('pas de colibri à l’avers', () => {
    expect(html).not.toContain('data-game-bird');
  });

  test('aucun littéral de couleur', () => {
    expect(html).not.toMatch(/stroke="#|fill="#|stop-color="#/);
  });
});

describe('MeeshCoin — le revers', () => {
  const html = renderToStaticMarkup(<MeeshCoin side="reverse" size={130} number={13} year={2026} />);

  test('Mee et Meo face à face : Meo est retourné', () => {
    expect(html).toContain('data-game-bird="meeJoy"');
    expect(html).toContain('data-game-bird="meoOpen"');
    expect(html).toMatch(/data-game-bird="meoOpen" transform="translate\(107 30\) scale\(-0\.34 0\.34\)"/);
  });

  test('Mee et Meo sont GRAVÉS dans le métal, colorés, jamais en autocollant (#9540)', () => {
    expect(html).toContain('-engrave"');
    expect(html).toMatch(/filter="url\(#[^)]*-engrave\)"/);
    expect(html).not.toContain('-cut');
    expect(html).not.toContain('dilate');
  });

  test('le numéro de frappe et l’année', () => {
    expect(html).toContain('N° 13');
    expect(html).toContain('2026');
  });

  test('le libellé du numéro se localise : l’hôte le passe', () => {
    expect(renderToStaticMarkup(<MeeshCoin side="reverse" size={100} number={13} numberLabel="No. 13" />)).toContain('No. 13');
  });

  test('sans numéro, aucun libellé inventé', () => {
    expect(renderToStaticMarkup(<MeeshCoin side="reverse" size={100} />)).not.toContain('N°');
  });
});

describe('MeeshCoin — les éditions', () => {
  const metal = (edition: 'silver' | 'gold' | 'prism'): string => renderToStaticMarkup(<MeeshCoin side="obverse" size={90} edition={edition} />);

  test('argent par défaut', () => {
    expect(renderToStaticMarkup(<MeeshCoin side="obverse" size={90} />)).toContain('-p-coin-silver)');
  });

  test('or : le métal change, le fond de la pièce reste argent', () => {
    expect(metal('gold')).toContain('-p-coin-gold)');
    expect(metal('gold')).toContain('-p-coin-silver-in)');
  });

  test('prisme : le spectre', () => {
    expect(metal('prism')).toContain('-p-prism)');
  });

  test('chaque édition a son propre attribut pour le moteur d’irisation', () => {
    expect(metal('prism')).toContain('data-game-edition="prism"');
    expect(metal('silver')).toContain('data-game-edition="silver"');
  });
});

describe('MeeshCoin — instances', () => {
  test('deux pièces sur une page ne partagent aucun identifiant', () => {
    const ids = (h: string): readonly string[] => [...h.matchAll(/ id="([^"]+)"/g)].map((m) => m[1] ?? '');
    const a = ids(renderToStaticMarkup(<MeeshCoin side="obverse" size={50} />));
    expect(a.length).toBeGreaterThan(2);
    expect(new Set(a).size).toBe(a.length);
  });
});

describe('MeeshCoinFlip — la pièce qui se retourne sur son numéro', () => {
  test('les deux faces sont superposées ; la face montrée est la seule visible', () => {
    const html = renderToStaticMarkup(<MeeshCoinFlip size={120} face="obverse" number={7} year={2026} />);
    expect(html).toContain('data-game-face="obverse"');
    expect(html).toContain('data-game-face="reverse"');
    expect(html).toContain('data-game-coin-flip');
    expect(html.match(/opacity:0/g)).toHaveLength(1);
  });

  test('retournée, c’est le revers qui est visible', () => {
    const html = renderToStaticMarkup(<MeeshCoinFlip size={120} face="reverse" number={7} year={2026} />);
    expect(html).toMatch(/opacity:0" data-game-face-wrap="obverse"/);
    expect(html).toMatch(/opacity:1" data-game-face-wrap="reverse"/);
  });
});
