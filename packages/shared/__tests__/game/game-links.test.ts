/**
 * Les LIENS du Jeu (#9947) : une saison ou une semaine de ligue, passée, en cours
 * ou future, a une adresse canonique. La forme sans paramètre reste la saison ou
 * la semaine EN COURS. Le web, iOS, l'AASA et les événements in-app d'andp
 * écrivent et lisent ces mêmes chemins.
 */

import { describe, it, expect } from 'vitest';
import {
  GAME_LINK_PATHS,
  gameLinkUrl,
  isLeagueWeekKeyParam,
  leagueWeekLinkPath,
  parseGameLinkPath,
  parseSeasonNumberParam,
  seasonLinkPath,
} from '../../utils/game/game-links';
import { seasonCalendar } from '../../utils/game/season';

describe('les chemins canoniques', () => {
  it('une saison et une semaine de ligue vivent sous /me/progression', () => {
    expect(GAME_LINK_PATHS).toEqual({ season: '/me/progression/saison', league: '/me/progression/ligue' });
    expect(seasonLinkPath(3)).toBe('/me/progression/saison/3');
    expect(seasonLinkPath(null)).toBe('/me/progression/saison');
    expect(leagueWeekLinkPath('2026-10-19')).toBe('/me/progression/ligue/2026-10-19');
    expect(leagueWeekLinkPath(null)).toBe('/me/progression/ligue');
  });

  it('chaque semaine du calendrier d’une saison a son lien', () => {
    const calendar = seasonCalendar(2)!;
    for (const weekKey of calendar.weekKeys) {
      expect(parseGameLinkPath(leagueWeekLinkPath(weekKey))).toEqual({ kind: 'league', weekKey });
    }
  });

  it('l’URL complète se forme sur l’origine donnée, https ou meeshy://', () => {
    expect(gameLinkUrl('https://meeshy.me', { kind: 'season', number: 2 })).toBe('https://meeshy.me/me/progression/saison/2');
    expect(gameLinkUrl('https://meeshy.me/', { kind: 'league', weekKey: '2026-10-12' })).toBe('https://meeshy.me/me/progression/ligue/2026-10-12');
    expect(gameLinkUrl('meeshy:/', { kind: 'season', number: 1 })).toBe('meeshy://me/progression/saison/1');
  });
});

describe('la lecture d’un chemin', () => {
  it('la forme nue ouvre la saison ou la semaine en cours', () => {
    expect(parseGameLinkPath('/me/progression/saison')).toEqual({ kind: 'season', number: null });
    expect(parseGameLinkPath('/me/progression/ligue/')).toEqual({ kind: 'league', weekKey: null });
  });

  it('une saison passée, en cours ou future se lit par son numéro', () => {
    expect(parseGameLinkPath('/me/progression/saison/1')).toEqual({ kind: 'season', number: 1 });
    expect(parseGameLinkPath('/me/progression/saison/42')).toEqual({ kind: 'season', number: 42 });
  });

  it('un paramètre invalide n’est pas une destination du Jeu', () => {
    for (const path of [
      '/me/progression/saison/0',
      '/me/progression/saison/-1',
      '/me/progression/saison/1.5',
      '/me/progression/saison/abc',
      '/me/progression/saison/01',
      '/me/progression/saison/100000',
      '/me/progression/saison/2/extra',
      '/me/progression/ligue/2026-10-13',
      '/me/progression/ligue/2026-02-30',
      '/me/progression/ligue/20261012',
      '/me/progression/ligue/semaine',
      '/me/progression/vitrine',
      '/me',
    ]) {
      expect(parseGameLinkPath(path)).toBeNull();
    }
  });

  it('les gardes de paramètre se lisent seules', () => {
    expect(parseSeasonNumberParam('7')).toBe(7);
    expect(parseSeasonNumberParam('0')).toBeNull();
    expect(isLeagueWeekKeyParam('2026-10-12')).toBe(true);
    expect(isLeagueWeekKeyParam('2026-10-18')).toBe(false);
  });
});
