import { describe, expect, test } from 'bun:test';

import { PREVIEW_ENTRANCE_MAX_MS } from '@meeshy/shared/utils/conversation-preview';

import { entranceAnimation, shouldPlayEntrance } from './preview-entrance';

/**
 * #16975 — L'EFFET D'APPARITION DE LA LIGNE 2 SE JOUE UNE FOIS, ET À L'ARRIVÉE
 * SEULEMENT : jamais au premier rendu (la liste qui s'ouvre ne danse pas),
 * jamais sur le même message, jamais sous « réduire les animations », dans un
 * onglet caché ou hors écran.
 */
const gate = (over: Partial<Parameters<typeof shouldPlayEntrance>[0]> = {}) =>
  shouldPlayEntrance({ previousKey: 'm1', currentKey: 'm2', reducedMotion: false, hidden: false, onScreen: true, ...over });

describe('shouldPlayEntrance', () => {
  test('un nouveau dernier message sur une ligne visible joue l’apparition', () => {
    expect(gate()).toBe(true);
  });

  test('jamais au premier rendu, jamais sur le même message, jamais sans message', () => {
    expect(gate({ previousKey: undefined })).toBe(false);
    expect(gate({ currentKey: 'm1' })).toBe(false);
    expect(gate({ currentKey: null })).toBe(false);
  });

  test('rien ne s’anime sous « réduire les animations », dans un onglet caché ou hors écran', () => {
    expect(gate({ reducedMotion: true })).toBe(false);
    expect(gate({ hidden: true })).toBe(false);
    expect(gate({ onScreen: false })).toBe(false);
  });
});

describe('entranceAnimation', () => {
  test('transformation seule, une itération, au plus la borne partagée', () => {
    for (const entrance of ['shake', 'pop'] as const) {
      const { keyframes, options } = entranceAnimation(entrance);
      expect(keyframes.every((frame) => Object.keys(frame).every((key) => key === 'transform' || key === 'offset'))).toBe(true);
      expect(options.iterations).toBe(1);
      expect(Number(options.duration)).toBeLessThanOrEqual(PREVIEW_ENTRANCE_MAX_MS);
    }
  });
});
