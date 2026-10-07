import { describe, expect, test } from 'bun:test';

import { pushTapTarget } from '@/lib/notifications/target';

import { shellPushUrl } from './shell-push-runtime';

/**
 * L'ADRESSE D'UN TAP DANS LA COQUE (#9490) — par le `href` du routeur, jamais un littéral : une
 * notification du jeu ouvre la page de ce qu'elle annonce (Ligue, Saison), pas le hub que son indice
 * `progression` nomme.
 */
describe('le tap d’une notification du jeu, dans la coque', () => {
  test('duo et résultat de ligue : la page Ligue ; étape de saison : la page Saison', () => {
    expect(shellPushUrl(pushTapTarget({ type: 'game_duo_invited', route: 'progression' }))).toBe('/me/progression/ligue');
    expect(shellPushUrl(pushTapTarget({ type: 'game_league_result', route: 'progression' }))).toBe('/me/progression/ligue');
    expect(shellPushUrl(pushTapTarget({ type: 'game_season_step', route: 'progression' }))).toBe('/me/progression/saison');
  });

  /* Carte de navigation (#9563, amendement n° 4) : un badge ouvre la fiche des Badges, par l'adresse que Progression redirige. */
  test('un badge ouvre la fiche des Badges ; la mission du jour, celle des Missions', () => {
    expect(shellPushUrl(pushTapTarget({ type: 'badge_earned' }))).toBe('/me/progression?section=badges');
    expect(shellPushUrl(pushTapTarget({ type: 'game_mission_window', route: 'progression' }))).toBe('/me/progression?section=missions');
  });
});
