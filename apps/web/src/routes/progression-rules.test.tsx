import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { GAME_RULES } from '@/lib/view/game-guide-copy';

import ProgressionRulesScreen, { RulesBody } from './progression-rules';

const body = renderToStaticMarkup(<RulesBody />);
const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/**
 * « COMMENT ÇA MARCHE » (#9379) — le carnet des règles : ce que le joueur a
 * découvert à l'intégration, il le retrouve ici, en entier, quand il veut. Les
 * cartes de l'intégration y sont TOUTES gardées (« chaque carte peut se
 * passer ; le carnet des règles les garde toutes »).
 */
describe('les huit règles', () => {
  test('numérotées de 1 à 8, dans l’ordre de la conception', () => {
    const positions = GAME_RULES.map((rule) => text.indexOf(rule.title));
    expect(positions.every((i) => i >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  test('chaque règle dit sa phrase, pas seulement son titre', () => {
    for (const rule of GAME_RULES) expect(text).toContain(rule.body);
  });

  test('c’est une liste numérotée : le lecteur d’écran annonce « 3 sur 8 »', () => {
    expect(body).toContain('<ol');
    expect(body.match(/<li/g)?.length).toBeGreaterThanOrEqual(8);
  });
});

describe('les sept étapes de l’intégration', () => {
  test('toutes, de 1 sur 7 à 7 sur 7, avec leur explication complète', () => {
    for (let i = 1; i <= 7; i += 1) expect(text).toContain(`Étape ${i} sur 7`);
    expect(text).toContain('Salut, c’est Mee !');
    expect(text).toContain('Ton rang ne baisse jamais.');
    expect(text).toContain('Un gel couvre un jour manqué.');
  });

  test('le carnet n’a pas de bouton qui agit : il explique', () => {
    expect(body).not.toContain('data-game-guide-action');
  });
});

describe('le décor', () => {
  test('Mee et Meo l’ouvrent, sans bulle', () => {
    expect(body).toContain('data-game-bird="meeGuide"');
    expect(body).toContain('data-game-bird="meoGuide"');
    expect(body).not.toContain('data-mascot-coach');
  });

  test('les dessins sont décoratifs', () => {
    expect(body.match(/<svg(?![^>]*aria-hidden="true")/g)).toBeNull();
  });
});

describe('l’écran', () => {
  const page = renderToStaticMarkup(<ProgressionRulesScreen />);

  test('il se nomme et ramène à la progression', () => {
    expect(page).toContain('Comment ça marche');
    expect(page).toContain('/me/progression');
  });

  test('un seul titre de page', () => {
    expect(page.match(/<h1/g)).toHaveLength(1);
  });
});
