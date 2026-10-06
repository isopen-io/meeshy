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

  test('la saison annonce son numéro et l’étape atteinte', () => {
    const html = renderToStaticMarkup(<GameDoors game={gameBlockWithExtrasFixture()} />);
    expect(html).toContain('href="/me/progression/saison"');
    expect(text(html)).toContain('Saison 1');
    expect(text(html)).toContain('Étape 14 sur 40');
  });

  test('aucune saison ouverte : la porte reste, et le dit', () => {
    const block = gameBlockWithExtrasFixture();
    expect(text(renderToStaticMarkup(<GameDoors game={{ ...block, season: null }} />))).toContain('Aucune saison ouverte');
  });

  test('la vitrine annonce le nombre de trophées, l’Atlas ses langues, le Prestige son étape', () => {
    const html = renderToStaticMarkup(<GameDoors game={gameBlockWithExtrasFixture()} />);
    expect(html).toContain('href="/me/progression/vitrine"');
    expect(html).toContain('href="/me/progression/atlas"');
    expect(html).toContain('href="/me/progression/prestige"');
    const t = text(html);
    expect(t).toContain('3 trophées');
    expect(t).toMatch(/4 langues sur \d+/);
    expect(t).toContain('Au niveau 100');
  });

  test('une vitrine vide le dit, un Prestige prêt le propose', () => {
    const block = gameBlockWithExtrasFixture();
    const empty = text(renderToStaticMarkup(<GameDoors game={{ ...block, trophies: { items: [], order: [] } }} />));
    expect(empty).toContain('Pas encore de trophée');
    const ready = block.prestige === undefined ? block : { ...block, prestige: { ...block.prestige, canPrestige: true } };
    expect(text(renderToStaticMarkup(<GameDoors game={ready} />))).toContain('Tu peux passer en Prestige');
  });

  test('chaque porte est une cible de 44 points au moins', () => {
    const html = renderToStaticMarkup(<GameDoors game={gameBlockWithExtrasFixture()} />);
    expect(html).toContain('min-height:44px');
  });
});
