import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { GAME_BADGE_MATERIALS } from '@/lib/game/materials';

import { GameBadge } from './game-badge';

const render = (props: Parameters<typeof GameBadge>[0]): string => renderToStaticMarkup(<GameBadge {...props} />);

/**
 * LES BADGES (#9380) — trois formes pour trois sens, sept matières, et
 * l’EMPREINTE d’un badge éteint. Hexagone : accumulation (combien de fois).
 * Losange : record (le meilleur). Médaillon : collection (à réunir).
 */
describe('GameBadge — trois formes', () => {
  test('accumulation : un hexagone', () => {
    const html = render({ shape: 'accumulation', material: 'gold', size: 64, label: '100' });
    expect(html).toContain('points="36,4 64,20 64,52 36,68 8,52 8,20"');
    expect(html).toContain('data-game-badge="accumulation"');
  });

  test('record : un losange', () => {
    expect(render({ shape: 'record', material: 'platinum', size: 64 })).toContain('d="M36 3 L66 36 L36 69 L6 36 Z"');
  });

  test('collection : un médaillon dont les points se remplissent', () => {
    const html = render({ shape: 'collection', size: 64, collected: 4, total: 6 });
    expect(html.match(/data-game-dot="on"/g)).toHaveLength(4);
    expect(html.match(/data-game-dot="off"/g)).toHaveLength(2);
  });

  test('une collection vide ou illisible ne dessine aucun point plein, jamais NaN', () => {
    const html = render({ shape: 'collection', size: 64, collected: Number.NaN, total: 6 });
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('data-game-dot="on"');
  });

  test('un total nul ne divise pas par zéro : il dessine un seul point vide', () => {
    const html = render({ shape: 'collection', size: 64, collected: 0, total: 0 });
    expect(html).not.toContain('NaN');
    expect(html.match(/data-game-dot=/g)).toHaveLength(1);
  });
});

describe('GameBadge — sept matières', () => {
  test('chaque matière peint le corps du badge et grave la Signature à son encre', () => {
    for (const material of GAME_BADGE_MATERIALS) {
      const html = render({ shape: 'accumulation', material, size: 64 });
      expect(html).toContain(`-p-${material})`);
      expect(html).toContain(`stroke="var(--game-${material}-ink)"`);
      expect(html).toContain('data-game-signature="engraved"');
    }
  });

  test('l’étiquette (le nombre d’actions) se lit sur l’hexagone seulement', () => {
    expect(render({ shape: 'accumulation', material: 'gold', size: 64, label: '100' })).toContain('>100<');
    expect(render({ shape: 'record', material: 'gold', size: 64, label: '100' })).not.toContain('>100<');
  });
});

describe('GameBadge — l’empreinte, badge éteint', () => {
  const html = render({ shape: 'accumulation', material: 'gold', size: 64, imprint: true, label: '−37' });

  test('un contour en pointillé, sans matière', () => {
    expect(html).toContain('stroke-dasharray="4 4"');
    expect(html).toContain('data-game-imprint');
    expect(html).not.toContain('-p-gold)');
  });

  test('porte ce qu’il manque pour le rallumer', () => {
    expect(html).toContain('>−37<');
  });

  test('la Signature de l’empreinte est atténuée, jamais gravée dans le métal', () => {
    expect(html).not.toContain('data-game-signature="engraved"');
    expect(html).toContain('stroke="var(--ios-ink-2)"');
  });
});

describe('GameBadge — hygiène', () => {
  test('décoratif, sans littéral de couleur', () => {
    const html = render({ shape: 'accumulation', material: 'bronze', size: 64, label: '10' });
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/ (?:fill|stroke|stop-color)="#/);
  });
});
