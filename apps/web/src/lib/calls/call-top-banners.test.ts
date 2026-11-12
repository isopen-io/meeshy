import { describe, expect, test } from 'bun:test';

import { orderedTopBanners, RECORDING_SLOT_MIN, recordingBannerPresent, recordingSlotHeight, selfTileClearance, topBannersAbove, TOP_BANNER_CLEARANCE } from './call-top-banners';

/**
 * LA PILE DES BANDEAUX DU HAUT (P16.7, `CallTopBannerStack.ordered` d'iOS) — ordre fixe, quel que
 * soit l'ordre d'arrivée : partage → enregistrement → capture → cadre en direct. Un bandeau absent
 * ne laisse pas de trou, et ma vignette ne descend que sous MON partage et la capture, comme sur iOS et Android.
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

  test('l’enregistrement et le cadre ne déplacent pas ma vignette (`CallTopBannerStack.selfTileClearance` d’iOS, `selfTileClearanceDp` d’Android)', () => {
    expect(selfTileClearance({ recording: true })).toBe(0);
    expect(selfTileClearance({ 'live-frame': true })).toBe(0);
    expect(selfTileClearance({ 'screen-share': true, recording: true, capture: true, 'live-frame': true })).toBe(TOP_BANNER_CLEARANCE['screen-share'] + TOP_BANNER_CLEARANCE.capture);
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
