import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { gameBlockFixture } from '@/lib/api/game-fixture';

import { GameGauges } from './game-gauges';

const html = (patch: Parameters<typeof gameBlockFixture>[0] = {}): string =>
  renderToStaticMarkup(<GameGauges game={gameBlockFixture(patch)} />);

/**
 * LE TRÉSOR ET LA FLAMME (#9383) — ce que chaque tuile DIT, en toutes lettres :
 * les dessins sont décoratifs, le texte est ce que lit le lecteur d'écran. Le
 * niveau et le rang sont dits par le HÉROS pleine largeur (`game-hero.test.tsx`).
 */
describe('les deux tuiles', () => {
  const page = html();

  test('trésor, puis Flamme — dans cet ordre, chacune ancrée ; le niveau et le rang n’y sont plus', () => {
    const order = ['game-treasury', 'game-flame'].map((id) => page.indexOf(`id="${id}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(page).not.toContain('id="game-level"');
    expect(page).not.toContain('id="game-rank"');
  });

  test('le trésor se compte en Meeshes et nomme son palier', () => {
    expect(page).toContain('4 Meeshes');
    expect(page).toContain('Bourse');
  });

  test('la Flamme dit ses jours, sa forme et son bonus', () => {
    expect(page).toContain('6 jours');
    expect(page).toContain('+12 % sur les missions');
  });

  test('les dessins sont décoratifs', () => {
    expect(page.match(/<svg[^>]*aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('les états qui changent la phrase', () => {
  test('Flamme en danger : on dit quoi faire', () => {
    expect(html({ lastActiveDay: '2026-10-04' })).toContain('Fais un geste avant minuit');
  });

  test('Flamme éteinte : cendre et mot juste', () => {
    const page = html({ streak: 9, lastActiveDay: '2026-10-01', freezes: 0, broken: { streak: 9, lastActiveDay: '2026-10-01' } });
    expect(page).toContain('Éteinte');
    expect(page).toContain('Pas de série');
  });

  test('trésor vide : on invite à garder, aucun palier n’est revendiqué', () => {
    const page = html({ balance: 0 });
    expect(page).toContain('Aucune Meesh');
    expect(page).toContain('Garde tes Meeshes');
    expect(page).not.toContain('>Bourse<');
  });
});
