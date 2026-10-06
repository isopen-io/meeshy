import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { gameBlockFixture, gameBlockWithExtrasFixture, gameExtrasFactsFixture } from '@/lib/api/game-fixture';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';

import { GameLeagueSummary } from './game-league-summary';

/**
 * LE DÉTAIL DE LIGUE (#9541) — la gemme, la place, les points de la semaine,
 * le temps qui reste : quatre lignes courtes, seulement quand le joueur est
 * PLACÉ dans la ligue publique.
 */
beforeAll(async () => {
  await loadGameCatalog('fr');
});

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const placed = () => gameBlockWithExtrasFixture({}, { league: { ...gameExtrasFactsFixture().league, consented: true } }).league;
const at = (league: ReturnType<typeof placed>) => renderToStaticMarkup(<GameLeagueSummary league={league} now={new Date('2026-10-07T09:00:00')} />);

describe('placé dans la ligue publique', () => {
  const league = placed();
  const html = at(league);

  test('la gemme de la ligue, son nom, la place, les points de la semaine, le temps jusqu’à la fermeture', () => {
    expect(league?.current).not.toBeNull();
    expect(html).toContain('data-game-league-summary="jade"');
    expect(html).toContain('data-game-league-gem="jade"');
    expect(text(html)).toContain('Ligue · Jade');
    expect(html).toMatch(/data-game-league-place=""[^>]*>Rang \d+ sur \d+</);
    expect(html).toMatch(/data-game-league-points=""[^>]*>[\d\s  ]+ points? cette semaine</);
    expect(html).toMatch(/data-game-league-closes=""[^>]*>Se ferme dans /);
  });

  test('un toucher mène à la ligue, d’une cible de 44 points', () => {
    expect(html).toContain('href="/me/progression/ligue"');
    expect(html).toMatch(/min-height:44px/);
  });

  test('la gemme est décorative : le texte dit tout', () => {
    expect(html).toMatch(/aria-hidden="true"[^>]*><svg[^>]*data-game-league-gem/);
  });
});

describe('seulement quand il y a un détail à donner', () => {
  test('aucune extension servie (ancien serveur) : rien', () => {
    expect(at(undefined)).toBe('');
    expect(at(gameBlockFixture().league)).toBe('');
  });

  test('ligue verrouillée, fermée aux mineurs ou en attente de consentement : rien', () => {
    const base = placed();
    if (base === undefined) throw new Error('ligue attendue');
    for (const access of ['locked', 'minor', 'consent-required'] as const) expect(at({ ...base, access })).toBe('');
  });

  test('ouverte mais sans groupe encore : rien', () => {
    const base = placed();
    if (base === undefined) throw new Error('ligue attendue');
    expect(at({ ...base, access: 'open', current: null })).toBe('');
  });
});
