import { describe, expect, test } from 'bun:test';

import { captureIntent, clipClock, DOUBLE_TAP_MS, keyIntent, MAX_CLIP_MS, tapGesture } from './call-capture-gesture';

/**
 * LE GESTE SUR LE STYLE CHOISI (#8625) — deux tapes : une photo ; un appui
 * long : une vidéo ; une tape sur un AUTRE style le choisit. Plus de
 * déclencheur.
 */

describe('tapGesture', () => {
  test('deux tapes rapprochées sur le style déjà choisi font une double tape', () => {
    expect(tapGesture({ id: 'grid', at: 1000, selected: true }, { id: 'grid', at: 1000 + DOUBLE_TAP_MS })).toBe('double-tap');
  });

  test('trop espacées, sur un autre style, ou la première tape CHOISISSAIT : une simple tape', () => {
    expect(tapGesture({ id: 'grid', at: 1000, selected: true }, { id: 'grid', at: 1001 + DOUBLE_TAP_MS })).toBe('tap');
    expect(tapGesture({ id: 'grid', at: 1000, selected: true }, { id: 'cover', at: 1100 })).toBe('tap');
    expect(tapGesture({ id: 'grid', at: 1000, selected: false }, { id: 'grid', at: 1100 })).toBe('tap');
    expect(tapGesture(null, { id: 'grid', at: 1100 })).toBe('tap');
  });
});

describe('captureIntent', () => {
  const idle = { recording: false };

  test('sur le style choisi : deux tapes font une photo, un appui long une vidéo, une tape rien', () => {
    expect(captureIntent({ ...idle, gesture: 'double-tap', selected: true })).toBe('photo');
    expect(captureIntent({ ...idle, gesture: 'long-press', selected: true })).toBe('record');
    expect(captureIntent({ ...idle, gesture: 'tap', selected: true })).toBe('none');
  });

  test('sur un autre style, tout geste le choisit — jamais de capture par surprise', () => {
    expect(captureIntent({ ...idle, gesture: 'tap', selected: false })).toBe('select');
    expect(captureIntent({ ...idle, gesture: 'double-tap', selected: false })).toBe('select');
    expect(captureIntent({ ...idle, gesture: 'long-press', selected: false })).toBe('select');
  });

  test('pendant une vidéo, on change encore de style ; le reste attend le bouton stop', () => {
    const recording = { recording: true };
    expect(captureIntent({ ...recording, gesture: 'tap', selected: false })).toBe('select');
    expect(captureIntent({ ...recording, gesture: 'double-tap', selected: true })).toBe('none');
    expect(captureIntent({ ...recording, gesture: 'long-press', selected: true })).toBe('none');
    expect(captureIntent({ ...recording, gesture: 'long-press', selected: false })).toBe('select');
  });
});

describe('keyIntent', () => {
  test('Entrée sur le style choisi prend la photo ; ailleurs, ou pendant une vidéo, le clavier garde son sens', () => {
    expect(keyIntent({ key: 'Enter', selected: true, recording: false })).toBe('photo');
    expect(keyIntent({ key: 'Enter', selected: false, recording: false })).toBeNull();
    expect(keyIntent({ key: 'Enter', selected: true, recording: true })).toBeNull();
    expect(keyIntent({ key: ' ', selected: true, recording: false })).toBeNull();
  });
});

describe('clipClock', () => {
  test('le chrono discret de la vidéo : minutes et secondes', () => {
    expect(clipClock(0)).toBe('0:00');
    expect(clipClock(7_400)).toBe('0:07');
    expect(clipClock(65_000)).toBe('1:05');
  });

  test('une vidéo ne dépasse pas trois minutes', () => {
    expect(MAX_CLIP_MS).toBe(180_000);
  });
});
