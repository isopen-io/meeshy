import { describe, expect, test } from 'bun:test';

import { groupStageTop, headerFloatsOverGroupStage, orderedTopBanners, RECORDING_CARD_MAX_WIDTH, RECORDING_SLOT_MIN, recordingBannerPresent, recordingSlotHeight, selfTileClearance, topBannersAbove, TOP_BANNER_CLEARANCE, TOP_BANNER_LANDSCAPE_MIN, TOP_BANNER_MARGIN, topBannerNeighborOf, topBannerSpan, topBannerStackMaxWidth } from './call-top-banners';

/**
 * LA PILE DES BANDEAUX DU HAUT (P16.7, `CallTopBannerStack.ordered` d'iOS) — ordre fixe, quel que
 * soit l'ordre d'arrivée : partage → enregistrement → capture → cadre en direct. Un bandeau absent
 * ne laisse pas de trou, et ma vignette descend sous MON partage, l'enregistrement et la capture, comme sur iOS et Android.
 */
describe('l’ordre de la pile', () => {
  test('partage, enregistrement, capture, cadre : toujours dans cet ordre', () => {
    expect(orderedTopBanners({ 'live-frame': true, capture: true, recording: true, 'screen-share': true })).toEqual(['screen-share', 'recording', 'capture', 'live-frame']);
  });

  test('un bandeau absent ne laisse pas de trou', () => {
    expect(orderedTopBanners({ capture: true, 'screen-share': true })).toEqual(['screen-share', 'capture']);
    expect(orderedTopBanners({})).toEqual([]);
  });
});

describe('la place réservée', () => {
  test('ma vignette descend sous MON bandeau de partage et sous la capture (partage 60, capture 56)', () => {
    expect(selfTileClearance({ 'screen-share': true })).toBe(TOP_BANNER_CLEARANCE['screen-share']);
    expect(selfTileClearance({ 'screen-share': true, capture: true })).toBe(TOP_BANNER_CLEARANCE['screen-share'] + TOP_BANNER_CLEARANCE.capture);
    expect(selfTileClearance({})).toBe(0);
  });

  test('ma vignette descend aussi sous l’enregistrement — capsule, avis ou carte d’accord à sa hauteur mesurée (R3.10 ; `CallTopBannerStack.selfTileClearance` d’iOS, `selfTileClearanceDp` d’Android)', () => {
    expect(selfTileClearance({ recording: true })).toBe(TOP_BANNER_CLEARANCE.recording);
    expect(selfTileClearance({ recording: true }, 132)).toBe(132 + TOP_BANNER_CLEARANCE.recording - RECORDING_SLOT_MIN);
    expect(selfTileClearance({ recording: true }, 20)).toBe(TOP_BANNER_CLEARANCE.recording);
    expect(selfTileClearance({}, 132)).toBe(0);
  });

  test('le cadre en direct ne déplace pas ma vignette', () => {
    expect(selfTileClearance({ 'live-frame': true })).toBe(0);
    expect(selfTileClearance({ 'screen-share': true, recording: true, capture: true, 'live-frame': true })).toBe(TOP_BANNER_CLEARANCE['screen-share'] + TOP_BANNER_CLEARANCE.recording + TOP_BANNER_CLEARANCE.capture);
  });

  test('l’indicateur d’enregistrement se pose sous le partage, et lui seul', () => {
    expect(topBannersAbove('recording', { 'screen-share': true, capture: true, recording: true })).toBe(TOP_BANNER_CLEARANCE['screen-share']);
    expect(topBannersAbove('recording', { capture: true, recording: true })).toBe(0);
  });
});

describe('l’enregistrement dans la pile', () => {
  test('l’indicateur, son avis ET la carte d’accord occupent leur place dans la pile (R2.1 ; `CallRecordingBannerStage` d’iOS)', () => {
    expect(recordingBannerPresent({ view: { kind: 'recording' }, notice: null })).toBe(true);
    expect(recordingBannerPresent({ view: { kind: 'asking' }, notice: null })).toBe(true);
    expect(recordingBannerPresent({ view: { kind: 'pending', mustAnswer: false }, notice: null })).toBe(true);
    expect(recordingBannerPresent({ view: { kind: 'idle' }, notice: { kind: 'stopped' } })).toBe(true);
    expect(recordingBannerPresent({ view: { kind: 'pending', mustAnswer: true }, notice: null })).toBe(true);
    expect(recordingBannerPresent({ view: { kind: 'idle' }, notice: null })).toBe(false);
  });
});

describe('la hauteur de la case de l’enregistrement', () => {
  test('une capsule tient le plancher de 52 px ; la carte d’accord, sa hauteur mesurée, jamais moins', () => {
    expect(RECORDING_SLOT_MIN).toBe(52);
    expect(recordingSlotHeight(0)).toBe(52);
    expect(recordingSlotHeight(40)).toBe(52);
    expect(recordingSlotHeight(132)).toBe(132);
  });
});

/**
 * L1.8 (#17965 point 2, L6) — en paysage, la pile est bornée à 560 et centrée, et ma vignette garde son coin à côté
 * d'elle. Mêmes vecteurs qu'iOS (`CallTopBannerStack.span`, `CallTopBannerStackTests`, #18247).
 */
describe('la largeur de la pile (L1.8)', () => {
  const phoneLandscape = { width: 852, height: 393 };
  const phonePortrait = { width: 393, height: 852 };
  const padLandscape = { width: 1194, height: 834 };

  test('debout, la pile tient toute la largeur et ma vignette descend dessous', () => {
    const span = topBannerSpan({ window: phonePortrait, safeHorizontal: 0, selfTile: { width: 100, edgeDistance: 16 } });
    expect(span).toEqual({ bannerMaxWidth: null, keepsSelfTileBeside: false });
    expect(topBannerStackMaxWidth(span)).toBeNull();
  });

  test('couchée, sans vignette en haut, elle est bornée à 560', () => {
    const span = topBannerSpan({ window: phoneLandscape, safeHorizontal: 59, selfTile: null });
    expect(span).toEqual({ bannerMaxWidth: 560, keepsSelfTileBeside: false });
    expect(topBannerStackMaxWidth(span)).toBe(560 + 2 * TOP_BANNER_MARGIN);
  });

  test('couchée, ma vignette en haut garde son coin à côté de la pile', () => {
    expect(topBannerSpan({ window: phoneLandscape, safeHorizontal: 59, selfTile: { width: 130, edgeDistance: 16 } })).toEqual({ bannerMaxWidth: 544, keepsSelfTileBeside: true });
  });

  test('les rails sortis, ma vignette leur cède le coin et la pile se resserre encore pour elle', () => {
    expect(topBannerSpan({ window: phoneLandscape, safeHorizontal: 59, selfTile: { width: 130, edgeDistance: 135 } })).toEqual({ bannerMaxWidth: 306, keepsSelfTileBeside: true });
  });

  test('trop étroite à côté, ma vignette descend dessous et la pile reprend 560', () => {
    expect(topBannerSpan({ window: phoneLandscape, safeHorizontal: 59, selfTile: { width: 195, edgeDistance: 135 } })).toEqual({ bannerMaxWidth: 560, keepsSelfTileBeside: false });
  });

  test('une grande fenêtre couchée : 560, ma vignette à côté', () => {
    expect(topBannerSpan({ window: padLandscape, safeHorizontal: 0, selfTile: { width: 130, edgeDistance: 16 } })).toEqual({ bannerMaxWidth: 560, keepsSelfTileBeside: true });
  });

  test('« Vous partagez votre écran · Arrêter » tient sur une ligne à la plus petite largeur', () => {
    expect(TOP_BANNER_LANDSCAPE_MIN).toBeGreaterThanOrEqual(300);
  });

  test('la carte d’accord, plus large qu’un bandeau, garde ma vignette à côté seulement si elle y tient (web : la carte flotte hors de la pile)', () => {
    expect(topBannerSpan({ window: phoneLandscape, safeHorizontal: 0, selfTile: { width: 130, edgeDistance: 80 }, minimumWidth: 448 })).toEqual({ bannerMaxWidth: 560, keepsSelfTileBeside: false });
    expect(topBannerSpan({ window: phoneLandscape, safeHorizontal: 0, selfTile: { width: 130, edgeDistance: 16 }, minimumWidth: 448 })).toEqual({ bannerMaxWidth: 544, keepsSelfTileBeside: true });
  });
});

/**
 * P11.1 — en groupe, l'en-tête flotte sur la grille (planche P11) ; pas en hauteur compacte (L4, #17885), ni sur la une
 * (P14). Une pile de bandeaux le garde dans le flux (L4.11), et le plein écran part de la zone sûre. Mêmes vecteurs
 * qu'iOS (`headerFloatsOverGroupStage`, `groupStageTopBase`, #18395) et Android (#18414).
 */
describe('l’en-tête du groupe sur la grille (P11.1)', () => {
  test('il flotte sur la grille debout', () => {
    expect(headerFloatsOverGroupStage({ isGrid: true, isCompactHeight: false })).toBe(true);
  });

  test('pas en hauteur compacte : la rangée de quatre reste entre l’en-tête et la pilule (L4)', () => {
    expect(headerFloatsOverGroupStage({ isGrid: true, isCompactHeight: true })).toBe(false);
  });

  test('pas sur la une : sa capsule se pose au haut de sa vignette, sous l’en-tête (P14)', () => {
    expect(headerFloatsOverGroupStage({ isGrid: false, isCompactHeight: false })).toBe(false);
  });

  test('l’en-tête flottant, la grille part de la zone sûre', () => {
    expect(groupStageTop({ headerFloats: true, hasBanners: false, isStageFullScreen: false })).toBe('safe-area');
  });

  test('un en-tête qui ne flotte pas garde la scène sous lui', () => {
    expect(groupStageTop({ headerFloats: false, hasBanners: false, isStageFullScreen: false })).toBe('under-header');
  });

  test('un bandeau présent repousse la grille sous la pile, même quand l’en-tête flotterait (L4.11)', () => {
    expect(groupStageTop({ headerFloats: true, hasBanners: true, isStageFullScreen: false })).toBe('under-header');
  });

  test('plein écran : la zone sûre, que l’en-tête flotte ou non', () => {
    for (const headerFloats of [true, false]) expect(groupStageTop({ headerFloats, hasBanners: false, isStageFullScreen: true })).toBe('safe-area');
  });
});

describe('ma vignette vue de la pile (L1.8)', () => {
  test('dans un coin du haut : sa largeur et sa distance au bord de son coin, rail compris', () => {
    expect(topBannerNeighborOf({ corner: 'top-right', x: 706, width: 130 }, 852)).toEqual({ width: 130, edgeDistance: 16 });
    expect(topBannerNeighborOf({ corner: 'top-right', x: 642, width: 130 }, 852)).toEqual({ width: 130, edgeDistance: 80 });
    expect(topBannerNeighborOf({ corner: 'top-left', x: 16, width: 130 }, 852)).toEqual({ width: 130, edgeDistance: 16 });
  });

  test('dans un coin du bas, ou absente, elle ne gêne pas la pile', () => {
    expect(topBannerNeighborOf({ corner: 'bottom-right', x: 706, width: 130 }, 852)).toBeNull();
    expect(topBannerNeighborOf(null, 852)).toBeNull();
  });

  test('la carte d’accord du web garde sa largeur (`max-w-md`, 448)', async () => {
    const layer = await Bun.file(new URL('../../components/call-recording-layer.tsx', import.meta.url)).text();
    expect(layer).toContain('mx-auto max-w-md');
    expect(RECORDING_CARD_MAX_WIDTH).toBe(448);
  });
});
