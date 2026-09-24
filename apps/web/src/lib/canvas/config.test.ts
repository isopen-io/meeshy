import { describe, expect, test } from 'bun:test';

import { hostMute, playerConfig, type ScenePlayerMode } from './config';

// T-C — miroir ScenePlayerMode.swift:26-44 : le mode gouverne UNIQUEMENT le
// son, la boucle et le chrome — jamais startsPaused, toujours vrai.
describe('playerConfig — le mode gouverne le son, la boucle et le chrome (T-C)', () => {
  test('card ⇒ muet verrouillé, boucle, sans chrome', () => {
    expect(playerConfig('card')).toEqual({ startsPaused: true, isMuted: true, locksMute: true, loops: true, showsChrome: false, showsMuteBadge: true });
  });

  test('reader ⇒ sonore, sans boucle, avec chrome', () => {
    expect(playerConfig('reader')).toEqual({ startsPaused: true, isMuted: false, locksMute: false, loops: false, showsChrome: true, showsMuteBadge: true });
  });

  test('reel ⇒ sonore, boucle, avec chrome', () => {
    expect(playerConfig('reel')).toEqual({ startsPaused: true, isMuted: false, locksMute: false, loops: true, showsChrome: true, showsMuteBadge: false });
  });

  /**
   * Revue-correction #6903 — LA PASTILLE DE MUET SE DIT UNE FOIS PAR ÉCRAN :
   * `reel` est le SEUL mode dont l'hôte porte déjà l'état du son sur un
   * contrôle à lui (le bouton son du rail des Réels). Un témoin de rang AUTRE
   * que le premier : les quatre modes qui la gardent sont éprouvés en face du
   * seul qui la perd — sans quoi « tout à `true` » passerait aussi.
   */
  test('showsMuteBadge ⇒ vrai partout SAUF `reel`, où le rail dit déjà le son', () => {
    const modes: readonly ScenePlayerMode[] = ['card', 'reader', 'story', 'preview'];
    for (const mode of modes) expect(playerConfig(mode).showsMuteBadge).toBe(true);
    expect(playerConfig('reel').showsMuteBadge).toBe(false);
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
