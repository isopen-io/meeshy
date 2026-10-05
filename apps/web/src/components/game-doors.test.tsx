import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { GameBlock } from '@meeshy/shared/types/game';

import { gameBlockFixture, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';

import { GameDoors } from './game-doors';

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const withLeague = (patch: Partial<NonNullable<GameBlock['league']>>): GameBlock => {
  const block = gameBlockWithExtrasFixture();
  return block.league === undefined ? block : { ...block, league: { ...block.league, ...patch } };
};

/**
 * LES PORTES DE LA VAGUE 2 SUR « PROGRESSION » (#9481) — une entrée par page
 * (Ligue, Saison, Vitrine, Atlas, Prestige), chacune avec ce qu’elle annonce :
 * le rang de la semaine, l’étape de la saison, le nombre de trophées. Devant un
 * ancien serveur — aucune extension — l’écran d’avant reste INTACT : pas une
 * porte, pas une ligne.
 */
describe('les portes du jeu', () => {
  test('un ancien serveur : rien', () => {
    expect(renderToStaticMarkup(<GameDoors game={gameBlockFixture()} />)).toBe('');
  });

  test('la ligue annonce sa ligue et mon rang', () => {
    const html = renderToStaticMarkup(<GameDoors game={gameBlockWithExtrasFixture()} />);
    expect(html).toContain('href="/me/progression/ligue"');
    expect(text(html)).toContain('Jade · rang 8 sur 30');
  });

  test('la ligue verrouillée annonce son niveau d’ouverture', () => {
    const html = text(renderToStaticMarkup(<GameDoors game={withLeague({ access: 'locked', current: null })} />));
    expect(html).toContain('Dès le niveau 10');
  });

  test('la ligue qui attend un consentement annonce le classement', () => {
    const html = text(renderToStaticMarkup(<GameDoors game={withLeague({ access: 'consent-required', current: null })} />));
    expect(html).toContain('Classement de la semaine');
  });

  test('chaque porte est une cible de 44 points au moins', () => {
    const html = renderToStaticMarkup(<GameDoors game={gameBlockWithExtrasFixture()} />);
    expect(html).toContain('min-height:44px');
  });
});
