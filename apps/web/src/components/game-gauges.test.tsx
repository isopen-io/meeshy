import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { gameBlockFixture } from '@/lib/api/game-fixture';

import { GameGauges } from './game-gauges';

const html = (patch: Parameters<typeof gameBlockFixture>[0] = {}): string =>
  renderToStaticMarkup(<GameGauges game={gameBlockFixture(patch)} />);

/**
 * LES TROIS JAUGES ET LA FLAMME (#9383) — ce que chaque tuile DIT, en toutes
 * lettres : les dessins sont décoratifs, le texte est ce que lit le lecteur
 * d'écran.
 */
describe('les quatre tuiles', () => {
  const page = html();

  test('niveau, rang, trésor, Flamme — dans cet ordre, chacune ancrée', () => {
    const order = ['game-level', 'game-rank', 'game-treasury', 'game-flame'].map((id) => page.indexOf(`id="${id}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('le niveau dit son numéro, son palier et ce qui manque', () => {
    const text = page.replace(/<[^>]+>/g, ' ');
    expect(text).toMatch(/Niveau 1[0-9]\s*·\s*Lueur/);
    expect(text).toMatch(/Encore .* avant le niveau/);
  });

  test('le rang dit son nom, sa division et la Gloire', () => {
    expect(page).toContain('Écho III');
    expect(page).toContain('Gloire 620');
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
    expect(page.match(/<svg[^>]*aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(4);
  });
});

describe('les états qui changent la phrase', () => {
  test('sous le record : le record et le Vent arrière se disent', () => {
    const text = html({ score: 23, levelRecord: 14 }).replace(/<[^>]+>/g, ' ');
    expect(text).toContain('Record : niveau 14');
    expect(text).toContain('Vent arrière ×1,25');
  });

  test('au record : aucune puce de record', () => {
    expect(html()).not.toContain('Record :');
  });

  test('Flamme en danger : on dit quoi faire', () => {
    expect(html({ lastActiveDay: '2026-10-04' })).toContain('Fais un geste avant minuit');
  });

  test('Flamme éteinte : cendre et mot juste', () => {
    const page = html({ streak: 9, lastActiveDay: '2026-10-01', freezes: 0, broken: { streak: 9, lastActiveDay: '2026-10-01' } });
    expect(page).toContain('Éteinte');
    expect(page).toContain('Pas de série');
  });

  test('niveau 100 : « Tu es au sommet » plutôt qu’un compte à rebours', () => {
    expect(html({ score: 10 * 100 * 100 }).replace(/<[^>]+>/g, ' ')).toContain('Tu es au sommet');
  });

  test('le rang le plus haut n’annonce aucune suite', () => {
    expect(html({ glory: 200000, mythic: true })).toContain('Le rang le plus haut');
  });

  test('trésor vide : on invite à garder, aucun palier n’est revendiqué', () => {
    const page = html({ balance: 0 });
    expect(page).toContain('Aucune Meesh');
    expect(page).toContain('Garde tes Meeshes');
    expect(page).not.toContain('>Bourse<');
  });
});
