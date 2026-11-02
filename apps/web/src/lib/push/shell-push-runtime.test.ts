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
    expect(shellPushUrl(pushTapTarget({ type: 'game_photo_moment', route: 'progression' }))).toBe('/me/progression/carnet');
  });

  /* Carte de navigation (#9563, amendement n° 4) : un badge ouvre la fiche des Badges, par l'adresse que Progression redirige. */
  test('un badge ouvre la fiche des Badges ; la mission du jour, celle des Missions', () => {
    expect(shellPushUrl(pushTapTarget({ type: 'badge_earned' }))).toBe('/me/progression?section=badges');
    expect(shellPushUrl(pushTapTarget({ type: 'game_mission_window', route: 'progression' }))).toBe('/me/progression?section=missions');
  });
});

/**
 * LA PROVENANCE D'UNE VUE (#10483, #11097) — le worker web ouvre une publication par
 * `/post/:id?from=notification` (`sw-push.js` § `resolvePushTarget`), et la vue du détail compte en
 * `notification`. La coque doit poser le même paramètre, et seulement sur une publication.
 */
describe('le tap d’une notification de publication, dans la coque', () => {
  const postId = '65f0a1b2c3d4e5f6a7b8c9d0';

  test('une publication s’ouvre avec ?from=notification, comme le worker web', () => {
    expect(shellPushUrl(pushTapTarget({ type: 'post_like', postId }))).toBe(`/post/${postId}?from=notification`);
  });

  test('une story, une humeur et un fil gardent leur adresse nue, comme le worker web', () => {
    expect(shellPushUrl({ route: 'story', params: { post: postId } })).toBe(`/story/${postId}`);
    expect(shellPushUrl({ route: 'mood', params: { post: postId } })).toBe(`/mood/${postId}`);
    expect(shellPushUrl({ route: 'thread', params: { conversation: postId } })).toBe(`/c/${postId}`);
  });
});
