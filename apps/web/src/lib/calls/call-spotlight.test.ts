import { describe, expect, test } from 'bun:test';

import { choiceAfterSharerChange, resolveSpotlight, type SpotlightChoice } from './call-spotlight';
import { chooseGrid, chooseMember, chooseSelf } from './call-spotlight-gestures';
import { SCREEN_MAX_ZOOM, screenPanAfterDrag, screenPanClamp, screenZoomAfterPinch, screenZoomAfterWheel, screenZoomResets, screenZoomTransform } from './screen-zoom';
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

describe('« Grille » ne vaut que pour CE partage (U2.1, `GroupCallSpotlight.choice(afterSharerChangedFrom:)` d’iOS)', () => {
  test('la fin du partage, un autre partage ou un nouveau partage rendent la main à la règle', () => {
    expect(choiceAfterSharerChange(chooseGrid('kofi'), 'kofi', null)).toBeNull();
    expect(choiceAfterSharerChange(chooseGrid('kofi'), 'kofi', 'bintou')).toBeNull();
    expect(choiceAfterSharerChange(chooseGrid(null), null, 'kofi')).toBeNull();
  });

  test('le même partageur ne change rien : la grille congédiée le reste', () => {
    expect(choiceAfterSharerChange(chooseGrid('kofi'), 'kofi', 'kofi')).toEqual(chooseGrid('kofi'));
  });

  test('une vignette épinglée, ma tuile ou l’absence de choix restent', () => {
    expect(choiceAfterSharerChange(chooseMember('awa'), 'kofi', null)).toEqual(chooseMember('awa'));
    expect(choiceAfterSharerChange(chooseSelf(), 'kofi', null)).toEqual(chooseSelf());
    expect(choiceAfterSharerChange(null, 'kofi', null)).toBeNull();
  });

  test('X congédie son partage, l’arrête, puis repartage : son écran remonte seul', () => {
    const dismissed = chooseGrid('kofi');
    const afterStop = choiceAfterSharerChange(dismissed, 'kofi', null);
    expect(view([awa, sharing], afterStop)?.featured).toEqual(sharing);
  });
});

describe('le déplacement d’un écran reçu zoomé (P15.11)', () => {
  const frame = { width: 400, height: 200 };

  test('à 1× rien ne se déplace : l’image remplit déjà son cadre', () => {
    expect(screenPanClamp({ x: 50, y: -30 }, 1, frame)).toEqual({ x: 0, y: 0 });
  });

  test('zoomé, l’image ne quitte jamais son cadre : le bord reste au bord, de chaque côté', () => {
    expect(screenPanClamp({ x: 999, y: -999 }, 2, frame)).toEqual({ x: 200, y: -100 });
    expect(screenPanClamp({ x: 40, y: -20 }, 2, frame)).toEqual({ x: 40, y: -20 });
    expect(screenPanClamp({ x: 999, y: 999 }, SCREEN_MAX_ZOOM, frame)).toEqual({ x: 600, y: 300 });
  });

  test('revenir vers 1× recentre : la borne se resserre avec le zoom', () => {
    expect(screenPanClamp({ x: 600, y: 300 }, 2, frame)).toEqual({ x: 200, y: 100 });
    expect(screenPanClamp({ x: 600, y: 300 }, 1, frame)).toEqual({ x: 0, y: 0 });
  });

  test('un glissé ajoute son écart au déplacement acquis, borné', () => {
    expect(screenPanAfterDrag({ x: 10, y: 0 }, { dx: 25, dy: -5 }, 2, frame)).toEqual({ x: 35, y: -5 });
    expect(screenPanAfterDrag({ x: 190, y: 0 }, { dx: 50, dy: 0 }, 2, frame)).toEqual({ x: 200, y: 0 });
  });

  test('un cadre sans mesure ne déplace rien (aucune division, aucun NaN)', () => {
    expect(screenPanClamp({ x: 5, y: 5 }, 3, { width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });

  test('la transformation est une seule matrice GPU, absente à 1×', () => {
    expect(screenZoomTransform(1, { x: 0, y: 0 })).toBe('none');
    expect(screenZoomTransform(2.5, { x: 12, y: -8 })).toBe('translate3d(12px, -8px, 0) scale(2.5)');
  });

  test('le double toucher ne sert qu’à revenir : il n’agit qu’une fois zoomé', () => {
    expect(screenZoomResets(1)).toBe(false);
    expect(screenZoomResets(1.01)).toBe(true);
    expect(screenZoomResets(SCREEN_MAX_ZOOM)).toBe(true);
  });
});
