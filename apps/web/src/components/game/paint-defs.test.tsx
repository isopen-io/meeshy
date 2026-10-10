import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { GameBird } from './game-bird';
import { PaintDefs } from './paint-defs';

describe('PaintDefs — les dégradés d’UNE instance', () => {
  const html = renderToStaticMarkup(
    <svg>
      <PaintDefs uid="gA" paints={['gold', 'flame', 'prism']} sheen />
    </svg>,
  );

  test('un dégradé par peinture, identifiant préfixé par l’instance', () => {
    for (const paint of ['gold', 'flame', 'prism']) expect(html).toContain(`<linearGradient id="gA-p-${paint}"`);
    expect(html).toContain('id="gA-sheen"');
  });

  test('les arrêts lisent des jetons, jamais un littéral', () => {
    expect(html).toContain('stop-color="var(--game-gold-0)"');
    expect(html).toContain('stop-color="var(--game-prism-4)"');
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  test('le feu monte du bas vers le haut', () => {
    expect(html).toMatch(/id="gA-p-flame" x1="0" y1="1" x2="0" y2="0"/);
  });

  test('sans demande, pas de reflet', () => {
    expect(renderToStaticMarkup(<svg><PaintDefs uid="gB" paints={['gold']} /></svg>)).not.toContain('sheen');
  });
});

describe('GameBird — une figure seule', () => {
  test('masquée au lecteur d’écran, dans une boîte de 150', () => {
    const html = renderToStaticMarkup(<GameBird bird="meeGuide" size={100} />);
    expect(html).toContain('viewBox="0 0 150 150"');
    expect(html).toContain('aria-hidden="true"');
  });

  test('retournée, elle regarde vers la gauche', () => {
    expect(renderToStaticMarkup(<GameBird bird="meoGuide" size={80} flip />)).toContain('scale(-1 1)');
  });
});
