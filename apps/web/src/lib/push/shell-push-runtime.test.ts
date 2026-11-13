import { describe, expect, test } from 'bun:test';

import { pushTapTarget, type NotificationTargetInput } from '@/lib/notifications/target';

// @ts-expect-error — module .mjs sans déclaration de types ; le témoin rejoue LA
// table du gate de parité, jamais une copie de ses attentes.
import { ADRESSES } from '../../../scripts/check-push-target-parity.mjs';

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

/**
 * **LA COQUE EST LE TROISIÈME SITE, ET RIEN NE LE COMPARAIT AUX DEUX AUTRES.**
 *
 * `scripts/check-push-target-parity.mjs` tient la loi « une destination, une
 * adresse » sur DEUX sites : le résolveur (`target.ts`) et son jumeau classique
 * (`public/sw-push.js`), dont il REJOUE la table `ADRESSES`. `shellPushUrl` est
 * un TROISIÈME mappage route → adresse, écrit à la main pour la coque Capacitor
 * — et aucun gate ne l'interrogeait.
 *
 * Ce que `tsc` attrape : un membre de l'union SANS `case` (TS2366). Ce qu'il
 * n'attrape PAS : un `case` qui rend la MAUVAISE adresse — `href('communityMembers', …)`
 * au lieu de `href('community', …)` compile, et mène le doigt ailleurs. C'est
 * exactement le défaut de `firebase-messaging-sw.js` que le doc-comment du gate
 * raconte : la prose portait la bonne règle, le code servait trois routes sur
 * trois qui n'existaient pas.
 *
 * Le témoin ne réécrit donc AUCUNE attente : il rejoue LA table du gate, celle
 * que le worker doit déjà servir, à travers la coque. Une famille de destination
 * ajoutée au critère de fin interroge les trois sites d'un coup.
 */
describe('la coque sert les mêmes adresses que le worker', () => {
  const adresses = ADRESSES as ReadonlyArray<readonly [NotificationTargetInput, string]>;

  test('chaque famille du critère de fin mène, dans la coque, où le worker la mène', () => {
    const servies = adresses.map(([charge]) => shellPushUrl(pushTapTarget(charge)));
    expect(servies).toEqual(adresses.map(([, attendue]) => attendue));
  });
});
