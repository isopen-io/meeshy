import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { RulesBody } from './progression-rules';
import { RulesAtlas } from './progression-rules-atlas';
import { gloryForAchievement } from '@meeshy/shared/utils/game/glory';
import { formatCount } from '@/lib/view/game-copy';

const atlas = renderToStaticMarkup(<RulesAtlas />);
const count = (needle: RegExp, html = atlas): number => html.match(needle)?.length ?? 0;
const section = (family: string): string => {
  const start = atlas.indexOf(`data-game-atlas-family="${family}"`);
  const end = atlas.indexOf('data-game-atlas-family="', start + 1);
  return start === -1 ? '' : atlas.slice(start, end === -1 ? undefined : end);
};

/**
 * LE CARNET ILLUSTRÉ (#9538) — chaque famille d'éléments du jeu y est DESSINÉE,
 * par la brique qui la dessine déjà partout ailleurs : aucune image bitmap.
 * Un témoin par famille : elle est là, avec le bon nombre de dessins.
 */
describe('les neuf familles sont dessinées', () => {
  test('chaque famille a sa section, titrée, ouverte par Mee ou Meo', () => {
    for (const family of ['levels', 'coin', 'treasury', 'ranks', 'flames', 'leagues', 'medals', 'trophies', 'rarities']) {
      const html = section(family);
      expect(html).not.toBe('');
      expect(html).toMatch(/<h3/);
      expect(html).toMatch(/data-game-atlas-speaker="(mee|meo)"/);
    }
  });

  test('les dix paliers : dix anneaux et leur niveau d’entrée', () => {
    const html = section('levels');
    expect(count(/data-game-ring-sweep=/g, html)).toBe(10);
    expect(html).toContain('Étincelle');
    expect(html).toContain('Galaxie');
    expect(html).toContain('Niveau 90');
  });

  test('la Meesh : avers, revers, éditions or et prisme', () => {
    const html = section('coin');
    expect(count(/data-game-coin=/g, html)).toBe(4);
    expect(html).toContain('Avers');
    expect(html).toContain('Revers');
    expect(html).toContain('Édition or');
    expect(html).toContain('Édition prisme');
  });

  test('le trésor : six paliers, 1 + 2 + 3 + 4 + 5 + 6 pièces', () => {
    const html = section('treasury');
    expect(count(/<li[ >]/g, html)).toBe(6);
    expect(count(/data-game-coin=/g, html)).toBe(21);
    expect(html).toContain('Bourse');
    expect(html).toContain('Réserve');
  });

  test('les onze blasons de rang, Mythe compris', () => {
    const html = section('ranks');
    expect(count(/data-game-rank=/g, html)).toBe(11);
    expect(html).toContain('Murmure');
    expect(html).toContain('Mythe');
    expect(html).toContain('Les 100 premiers à atteindre 1 000 000 de Gloire');
  });

  test('les cinq formes de la Flamme', () => {
    const html = section('flames');
    expect(count(/data-game-flame=/g, html)).toBe(5);
    for (const name of ['Braise', 'Flamme', 'Brasier', 'Astre', 'Soleil']) expect(html).toContain(name);
  });

  test('les huit gemmes de ligue', () => {
    const html = section('leagues');
    expect(count(/data-game-league-gem=/g, html)).toBe(8);
    expect(html).toContain('Quartz');
    expect(html).toContain('Prisme');
  });

  test('les médailles : trois formes, sept matières, l’empreinte', () => {
    const html = section('medals');
    expect(count(/data-game-badge=/g, html)).toBe(11);
    for (const name of ['Accumulation', 'Record', 'Collection', 'Cuivre', 'Obsidienne', 'Prisme', 'Empreinte']) expect(html).toContain(name);
  });

  test('les trophées : trois coupes de ligue, la saison, le Prestige, la Flamme', () => {
    const html = section('trophies');
    expect(count(/data-game-trophy=/g, html)).toBe(6);
    expect(html).toContain('Coupe de ligue');
    expect(html).toContain('Trophée de Prestige');
  });

  test('les cinq raretés, avec leur liseré, leur part des comptes et leur Gloire', () => {
    const html = section('rarities');
    expect(count(/data-game-rarity=/g, html)).toBe(5);
    expect(html).toContain('Mythique');
    expect(html).toContain('moins de 0,2 % des comptes');
    expect(html).toContain(`+${formatCount(gloryForAchievement('epic'), 'fr')} de Gloire`);
  });
});

describe('une page qui explique', () => {
  test('aucun bouton, aucune image bitmap : seulement du dessin vectoriel', () => {
    expect(atlas).not.toContain('<button');
    expect(atlas).not.toContain('<img');
  });

  test('les dessins sont décoratifs : le texte porte le sens', () => {
    expect(atlas.match(/<svg(?![^>]*aria-hidden="true")/g)).toBeNull();
  });

  test('le carnet des règles l’intègre, entre les règles et les étapes', () => {
    const body = renderToStaticMarkup(<RulesBody />);
    const rules = body.indexOf('id="regle-8"');
    const atlasAt = body.indexOf('data-game-atlas=');
    const steps = body.indexOf('id="etapes-titre"');
    expect(rules).toBeGreaterThan(-1);
    expect(atlasAt).toBeGreaterThan(rules);
    expect(steps).toBeGreaterThan(atlasAt);
  });
});
