import { describe, expect, test } from 'bun:test';

import { orderedTopBanners, recordingBannerPresent, topBannersAbove, topBannersClearance, TOP_BANNER_CLEARANCE } from './call-top-banners';

/**
 * LA PILE DES BANDEAUX DU HAUT (P16.7, `CallTopBannerStack.ordered` d'iOS) — ordre fixe, quel que
 * soit l'ordre d'arrivée : partage → enregistrement → capture → cadre en direct. Un bandeau absent
 * ne laisse pas de trou, et la place de ma vignette est la somme de ce qui est posé au-dessus d'elle.
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
  test('ma vignette descend de la somme des bandeaux posés (partage 60, enregistrement 60, capture 56)', () => {
    expect(topBannersClearance({ 'screen-share': true })).toBe(TOP_BANNER_CLEARANCE['screen-share']);
    expect(topBannersClearance({ 'screen-share': true, capture: true })).toBe(TOP_BANNER_CLEARANCE['screen-share'] + TOP_BANNER_CLEARANCE.capture);
    expect(topBannersClearance({})).toBe(0);
  });

  test('l’indicateur d’enregistrement se pose sous le partage, et lui seul', () => {
    expect(topBannersAbove('recording', { 'screen-share': true, capture: true, recording: true })).toBe(TOP_BANNER_CLEARANCE['screen-share']);
    expect(topBannersAbove('recording', { capture: true, recording: true })).toBe(0);
  });
});

describe('l’enregistrement dans la pile', () => {
  test('l’indicateur et son avis occupent leur place ; la carte d’accord flotte par-dessus', () => {
    expect(recordingBannerPresent({ view: { kind: 'recording' }, notice: null })).toBe(true);
    expect(recordingBannerPresent({ view: { kind: 'asking' }, notice: null })).toBe(true);
    expect(recordingBannerPresent({ view: { kind: 'pending', mustAnswer: false }, notice: null })).toBe(true);
    expect(recordingBannerPresent({ view: { kind: 'idle' }, notice: { kind: 'stopped' } })).toBe(true);
    expect(recordingBannerPresent({ view: { kind: 'pending', mustAnswer: true }, notice: null })).toBe(false);
    expect(recordingBannerPresent({ view: { kind: 'idle' }, notice: null })).toBe(false);
  });
});
