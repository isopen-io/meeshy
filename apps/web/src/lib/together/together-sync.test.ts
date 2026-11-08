import { describe, expect, test } from 'bun:test';

import { estimateClockOffset, localGestureEffect, playbackCorrection, servedPositionMs } from './together-sync';

/**
 * LA LOI DE SYNCHRONISATION DE « ENSEMBLE » (#17055) — la position servie se lit à
 * l'horloge du SERVEUR, et chaque client rattrape son retard sans à-coup quand il le peut.
 */

const playback = (overrides: Partial<{ playing: boolean; positionMs: number; at: number; rev: number }> = {}) => ({
  playing: true,
  positionMs: 10_000,
  at: 1_000_000,
  rev: 1,
  byUserId: 'proche',
  ...overrides,
});

describe('servedPositionMs', () => {
  test('en lecture, la position avance avec l’horloge du serveur depuis `at`', () => {
    expect(servedPositionMs(playback(), 1_002_500)).toBe(12_500);
  });

  test('en pause, la position est celle servie, quel que soit le temps écoulé', () => {
    expect(servedPositionMs(playback({ playing: false }), 1_090_000)).toBe(10_000);
  });

  test('une horloge locale en retard sur `at` ne recule jamais la position', () => {
    expect(servedPositionMs(playback(), 999_000)).toBe(10_000);
  });
});

describe('estimateClockOffset', () => {
  test('le premier échantillon donne l’écart serveur − local', () => {
    expect(estimateClockOffset(null, { serverAt: 5_000, localAt: 4_000 })).toBe(1_000);
  });

  test('l’écart garde le plus grand échantillon : la latence ne fait que le sous-estimer', () => {
    expect(estimateClockOffset(1_000, { serverAt: 5_000, localAt: 4_500 })).toBe(1_000);
    expect(estimateClockOffset(500, { serverAt: 5_000, localAt: 4_200 })).toBe(800);
  });
});

describe('playbackCorrection', () => {
  test('sous 150 ms d’écart en lecture, rien ne bouge', () => {
    expect(playbackCorrection({ localMs: 10_100, targetMs: 10_000, playing: true })).toEqual({ kind: 'none' });
  });

  test('en retard de 400 ms, la lecture accélère un peu ; en avance, elle ralentit', () => {
    expect(playbackCorrection({ localMs: 9_600, targetMs: 10_000, playing: true })).toEqual({ kind: 'rate', rate: 1.05 });
    expect(playbackCorrection({ localMs: 10_400, targetMs: 10_000, playing: true })).toEqual({ kind: 'rate', rate: 0.95 });
  });

  test('au-delà d’une seconde, on saute à la position servie', () => {
    expect(playbackCorrection({ localMs: 2_000, targetMs: 10_000, playing: true })).toEqual({ kind: 'seek', toMs: 10_000 });
  });

  test('en pause, tout écart sensible se règle par un saut, jamais par la vitesse', () => {
    expect(playbackCorrection({ localMs: 10_400, targetMs: 10_000, playing: false })).toEqual({ kind: 'seek', toMs: 10_000 });
    expect(playbackCorrection({ localMs: 10_050, targetMs: 10_000, playing: false })).toEqual({ kind: 'none' });
  });
});

describe('localGestureEffect', () => {
  test('un geste qui change l’état partagé part chez l’autre', () => {
    expect(localGestureEffect({ gesture: 'pause', localMs: 10_000, targetMs: 10_000, sharedPlaying: true })).toBe('send');
    expect(localGestureEffect({ gesture: 'play', localMs: 10_000, targetMs: 10_000, sharedPlaying: false })).toBe('send');
    expect(localGestureEffect({ gesture: 'seek', localMs: 40_000, targetMs: 10_000, sharedPlaying: true })).toBe('send');
  });

  test('« lecture » pendant que la séance lit déjà réaligne ici, sans rien envoyer (lecture bloquée puis relancée)', () => {
    expect(localGestureEffect({ gesture: 'play', localMs: 0, targetMs: 30_000, sharedPlaying: true })).toBe('align');
    expect(localGestureEffect({ gesture: 'pause', localMs: 10_000, targetMs: 10_000, sharedPlaying: false })).toBe('align');
  });

  test('un petit déplacement (rattrapage, image clé) ne réveille personne', () => {
    expect(localGestureEffect({ gesture: 'seek', localMs: 10_400, targetMs: 10_000, sharedPlaying: true })).toBe('align');
  });
});
