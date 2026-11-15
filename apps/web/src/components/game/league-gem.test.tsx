import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { LEAGUE_KEYS } from '@meeshy/shared/utils/game/league';

import { LeagueGem } from './league-gem';

const CSS = readFileSync(new URL('../../styles/game.css', import.meta.url), 'utf8');
const render = (props: Parameters<typeof LeagueGem>[0]): string => renderToStaticMarkup(<LeagueGem {...props} />);

/**
 * LES GEMMES DE LIGUE (#9384, conception II.7) — huit gemmes du Quartz au
 * Prisme, taillées en losange allongé, la Signature gravée au centre. Une
 * gemme est une ILLUSTRATION : sa couleur est un jeton `--game-league-*`, le
 * code n’écrit aucun littéral. Le Prisme porte le dégradé irisé.
 */
describe('LeagueGem', () => {
  test('une gemme décorative de 72 × 72, à la taille demandée', () => {
    const html = render({ league: 'jade', size: 58 });
    expect(html).toContain('viewBox="0 0 72 72"');
    expect(html).toContain('width="58"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-game-league-gem="jade"');
  });

  test('la Signature est gravée au centre, comme sur les blasons', () => {
    expect(render({ league: 'jade', size: 58 })).toContain('data-game-signature="engraved"');
  });

  test('chaque ligue a son jeton de couleur, déclaré par game.css', () => {
    for (const league of LEAGUE_KEYS.filter((key) => key !== 'prisme')) {
      expect(render({ league, size: 58 })).toContain(`fill="var(--game-league-${league})"`);
      expect(CSS).toMatch(new RegExp(`--game-league-${league}\\s*:`));
    }
  });

  test('le Prisme prend le dégradé irisé de la matière prisme', () => {
    expect(render({ league: 'prisme', size: 58 })).toContain('-p-prism)');
  });

  test('aucun littéral de couleur écrit par le composant', () => {
    for (const league of LEAGUE_KEYS) expect(render({ league, size: 58 })).not.toMatch(/ (?:fill|stroke|stop-color)="#/);
  });
});
