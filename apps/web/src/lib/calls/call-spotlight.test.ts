import { describe, expect, test } from 'bun:test';

import { chooseGrid, chooseMember, chooseSelf, resolveSpotlight, SCREEN_MAX_ZOOM, screenZoomAfterPinch, screenZoomAfterWheel, type SpotlightChoice } from './call-spotlight';
import type { CallMember } from './call-store';

/**
 * LA MISE À LA UNE D'UN APPEL DE GROUPE (#8392) — un partage d'écran monte
 * seul à la une ; un choix manuel l'emporte ; la fin du partage rend la main
 * à la règle. Choix LOCAL : rien n'en est diffusé.
 */

const member = (userId: string, overrides: Partial<CallMember> = {}): CallMember => ({ userId, name: userId.toUpperCase(), avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected', ...overrides });

const liveVideo = { getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;

const awa = member('awa');
const bintou = member('bintou');
const kofi = member('kofi');
const sharing = member('kofi', { screenSharing: true });

const view = (members: readonly CallMember[], choice: SpotlightChoice, streams: Readonly<Record<string, MediaStream>> = { kofi: liveVideo }) => resolveSpotlight({ members, choice, remoteStreams: streams });

describe('sans partage', () => {
  test('la règle rend la grille', () => {
    expect(view([awa, bintou, kofi], null)).toBeNull();
  });

  test('un toucher met la vignette à la une, les autres passent en bandeau', () => {
    expect(view([awa, bintou, kofi], chooseMember('bintou'))).toEqual({ featured: bintou, others: [awa, kofi], screen: false, automatic: false });
  });

  test('un participant choisi qui s’en va rend la grille', () => {
    expect(view([awa, kofi], chooseMember('bintou'))).toBeNull();
  });

  test('… et, si quelqu’un partage, la main à la règle : son écran remonte', () => {
    expect(view([awa, sharing], chooseMember('bintou'))?.featured).toEqual(sharing);
  });
});

describe('la montée automatique d’un partage', () => {
  test('dès qu’un membre partage, son ÉCRAN monte seul à la une', () => {
    expect(view([awa, bintou, sharing], null)).toEqual({ featured: sharing, others: [awa, bintou], screen: true, automatic: true });
  });

  test('l’annonce seule, sans piste vidéo reçue, ne vide pas la grille', () => {
    expect(view([awa, bintou, sharing], null, {})).toBeNull();
  });

  test('un choix manuel l’emporte sur la montée automatique', () => {
    expect(view([awa, bintou, sharing], chooseMember('awa'))).toEqual({ featured: awa, others: [bintou, sharing], screen: false, automatic: false });
  });

  test('choisir celui qui partage montre son écran', () => {
    expect(view([awa, sharing], chooseMember('kofi'))?.screen).toBe(true);
  });

  test('« Grille » rend la grille pendant le partage', () => {
    expect(view([awa, bintou, sharing], chooseGrid('kofi'))).toBeNull();
  });

  test('la fin du partage rend la main à la règle — un nouveau partage remonte seul', () => {
    const grid = chooseGrid('kofi');
    expect(view([awa, bintou, kofi], grid)).toBeNull();
    const bintouShares = member('bintou', { screenSharing: true });
    expect(view([awa, bintouShares, kofi], grid, { bintou: liveVideo })?.featured).toEqual(bintouShares);
  });

  test('« Grille » sans partage en cours reste la grille', () => {
    expect(view([awa, bintou], chooseGrid(null))).toBeNull();
  });
});

describe('ma tuile à la une (#9098, comme `GroupCallSpotlight.featuresLocal` sur iOS)', () => {
  test('toucher ma tuile la met à la une : `featured` nul dit « moi », tous les pairs passent en bandeau', () => {
    expect(view([awa, bintou], chooseSelf())).toEqual({ featured: null, others: [awa, bintou], screen: false, automatic: false });
  });

  test('ma tuile choisie l’emporte sur un partage, comme tout choix manuel', () => {
    expect(view([awa, sharing], chooseSelf())?.featured).toBeNull();
  });
});

describe('le zoom d’un écran partagé (#9098, `GroupCallSpotlight.clampedZoom`)', () => {
  test('pincer multiplie le zoom, borné entre 1 et 4', () => {
    expect(screenZoomAfterPinch(1, 2)).toBe(2);
    expect(screenZoomAfterPinch(3, 2)).toBe(SCREEN_MAX_ZOOM);
    expect(screenZoomAfterPinch(1.5, 0.2)).toBe(1);
  });

  test('Ctrl + molette zoome d’un cran, vers le haut grandit', () => {
    expect(screenZoomAfterWheel(1, -100)).toBeGreaterThan(1);
    expect(screenZoomAfterWheel(2, 100)).toBeLessThan(2);
    expect(screenZoomAfterWheel(1, 100)).toBe(1);
    expect(screenZoomAfterWheel(SCREEN_MAX_ZOOM, -100)).toBe(SCREEN_MAX_ZOOM);
  });
});
