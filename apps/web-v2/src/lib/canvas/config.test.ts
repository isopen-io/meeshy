import { describe, expect, test } from 'bun:test';

import { hostMute, playerConfig, type ScenePlayerMode } from './config';

// T-C — miroir ScenePlayerMode.swift:26-44 : le mode gouverne UNIQUEMENT le
// son, la boucle et le chrome — jamais startsPaused, toujours vrai.
describe('playerConfig — le mode gouverne le son, la boucle et le chrome (T-C)', () => {
  test('card ⇒ muet verrouillé, boucle, sans chrome', () => {
    expect(playerConfig('card')).toEqual({ startsPaused: true, isMuted: true, locksMute: true, loops: true, showsChrome: false });
  });

  test('reader ⇒ sonore, sans boucle, avec chrome', () => {
    expect(playerConfig('reader')).toEqual({ startsPaused: true, isMuted: false, locksMute: false, loops: false, showsChrome: true });
  });

  test('reel ⇒ sonore, boucle, avec chrome', () => {
    expect(playerConfig('reel')).toEqual({ startsPaused: true, isMuted: false, locksMute: false, loops: true, showsChrome: true });
  });

  test('story et preview ⇒ sans chrome, sans boucle', () => {
    expect(playerConfig('story').showsChrome).toBe(false);
    expect(playerConfig('story').loops).toBe(false);
    expect(playerConfig('preview').showsChrome).toBe(false);
    expect(playerConfig('preview').loops).toBe(false);
  });

  test('startsPaused === true pour les cinq modes', () => {
    const modes: readonly ScenePlayerMode[] = ['card', 'reader', 'story', 'preview', 'reel'];
    for (const mode of modes) expect(playerConfig(mode).startsPaused).toBe(true);
  });
});

// T-C2 — miroir MeeshyScenePlayer.swift:151-158.
describe('hostMute — le verrou du muet (T-C2)', () => {
  test('card VERROUILLE le muet — aucune demande ne peut l’ouvrir', () => {
    expect(hostMute({ config: playerConfig('card'), requestedMute: false })).toBe(true);
  });

  test('reader + requestedMute: true ⇒ true (la demande gouverne)', () => {
    expect(hostMute({ config: playerConfig('reader'), requestedMute: true })).toBe(true);
  });

  test('reader sans demande ⇒ le muet du mode (sonore, false)', () => {
    expect(hostMute({ config: playerConfig('reader'), requestedMute: undefined })).toBe(false);
  });
});
