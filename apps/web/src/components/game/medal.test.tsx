import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { MEDAL_PICTOGRAMS } from '@/lib/game/medal';

import { GameMedal } from './medal';

const render = (props: Partial<Parameters<typeof GameMedal>[0]> = {}): string =>
  renderToStaticMarkup(<GameMedal size={96} family="content" pictogram="text" tier={4} progress={0.62} threshold="100" {...props} />);

/**
 * LA MÉDAILLE (#9466) — lunette de métal, émail de la famille, pictogramme
 * d'axe au trait, sept perles de palier, poinçon Signature, ruban à partir de
 * l'Or, arc de progression ; éteinte, l'empreinte en creux.
 */
describe('GameMedal — la médaille allumée', () => {
  const html = render();

  test('un dessin 100 × 112, décoratif, qui nomme sa famille et sa matière', () => {
    expect(html).toContain('viewBox="0 0 100 112"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-game-medal="content"');
    expect(html).toContain('data-game-material="gold"');
  });

  test('le corps de la médaille est ciblable par la chorégraphie « badge »', () => {
    expect(html).toContain('data-game-badge-body');
  });

  test('la lunette est de la matière du palier — une peinture, déclarée', () => {
    const id = /data-game-bezel=""[^>]*fill="url\(#([^)]+)\)"/.exec(html)?.[1] ?? '';
    expect(id).toMatch(/-p-gold$/);
    expect(html).toContain(`id="${id}"`);
  });

  test('l’émail est à la couleur de la famille', () => {
    expect(html).toMatch(/data-game-enamel=""[^>]*fill="var\(--game-enamel-content\)"/);
    expect(render({ family: 'social' })).toMatch(/data-game-enamel=""[^>]*fill="var\(--game-enamel-social\)"/);
  });

  test('sept perles de palier, allumées jusqu’au palier atteint', () => {
    expect(html.match(/data-game-pearl="on"/g)).toHaveLength(4);
    expect(html.match(/data-game-pearl="off"/g)).toHaveLength(3);
  });

  test('le poinçon Signature est gravé sur la médaille', () => {
    expect(html).toContain('data-game-signature="engraved"');
  });

  test('l’arc de progression vers le palier suivant : une piste, puis l’arc de la famille', () => {
    expect(html).toContain('data-game-medal-track');
    const arc = Number(/data-game-medal-arc=""[^>]*stroke-dasharray="([\d.]+) /.exec(html)?.[1] ?? Number.NaN);
    expect(arc).toBeCloseTo(2 * Math.PI * 41 * 0.62, 0);
    expect(html).toMatch(/data-game-medal-arc=""[^>]*stroke="var\(--game-enamel-content\)"/);
  });

  test('un progrès illisible donne un arc vide, jamais NaN', () => {
    expect(render({ progress: Number.NaN })).not.toContain('NaN');
  });

  test('aucun littéral de couleur dans le dessin', () => {
    expect(html).not.toMatch(/ (?:fill|stroke|stop-color)="#/);
  });
});

describe('GameMedal — le ruban commence à l’Or', () => {
  test('quatre paliers et plus : un ruban, avec le palier en cartouche', () => {
    const html = render({ tier: 4, threshold: '100' });
    expect(html).toContain('data-game-ribbon');
    expect(html).toMatch(/data-game-ribbon-label=""[^>]*>100</);
  });

  test('trois paliers et moins : pas de ruban', () => {
    for (const tier of [1, 2, 3]) expect(render({ tier })).not.toContain('data-game-ribbon');
  });
});

describe('GameMedal — les sept matières', () => {
  test('chaque palier a sa matière', () => {
    const materials = [1, 2, 3, 4, 5, 6, 7].map((tier) => /data-game-material="([a-z]+)"/.exec(render({ tier }))?.[1]);
    expect(materials).toEqual(['copper', 'bronze', 'silver', 'gold', 'platinum', 'obsidian', 'prism']);
  });

  test('le prisme irise son émail ; aucun autre métal', () => {
    expect(render({ tier: 7 })).toContain('data-game-iridescence');
    expect(render({ tier: 6 })).not.toContain('data-game-iridescence');
  });
});

describe('GameMedal — un pictogramme par axe (#9639)', () => {
  test('chacun se dessine, et aucun n’est une bulle', () => {
    const drawings = MEDAL_PICTOGRAMS.map((pictogram) => render({ pictogram }));
    for (const [index, html] of drawings.entries()) expect(html).toContain(`data-game-pictogram="${MEDAL_PICTOGRAMS[index]}"`);
    expect(new Set(drawings).size).toBe(20);
    const glyphs = drawings.map((html) => html.replace(/^[\s\S]*?data-game-pictogram="[^"]+">/, '').replace(/<\/g>[\s\S]*$/, ''));
    expect(new Set(glyphs).size).toBe(20);
    for (const html of drawings) expect(html.toLowerCase()).not.toMatch(/bubble|bulle|speech/);
  });
});

describe('GameMedal — l’empreinte d’un badge éteint', () => {
  const html = render({ tier: 0, missing: '−37' });

  test('la même médaille en creux : aucune matière, aucun émail, un contour en pointillé', () => {
    expect(html).toContain('data-game-imprint');
    expect(html).not.toContain('data-game-bezel');
    expect(html).not.toContain('data-game-enamel');
    expect(html).toMatch(/stroke-dasharray="4 4"/);
  });

  test('ce qu’il manque s’écrit sous la médaille', () => {
    expect(html).toContain('−37');
  });

  test('le pictogramme y reste, en creux', () => {
    expect(html).toContain('data-game-pictogram="text"');
  });

  test('le corps n’est pas celui d’une médaille allumée', () => {
    expect(html).not.toContain('data-game-badge-body');
  });
});

describe('GameMedal — le lecteur d’écran', () => {
  test('avec un libellé, la médaille est une image nommée', () => {
    const html = render({ label: 'Messages texte, Or, 100 sur 500 vers Platine' });
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Messages texte, Or, 100 sur 500 vers Platine"');
    expect(html).not.toContain('aria-hidden');
  });
});
