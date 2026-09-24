import { describe, expect, test } from 'bun:test';

import {
  initialScenePlayback,
  scenePlaybackEnded,
  scenePlaybackPaused,
  scenePlaybackShowsPlay,
  scenePlaybackToggled,
  scenePlays,
} from './scene-playback';

/**
 * #6902 (revue-correction) — LE GESTE DE LECTURE D'UNE PAGE SCÈNE. Le témoin
 * qui compte est celui de la SCÈNE TERMINÉE : partout ailleurs, « basculer la
 * pause » et « rejouer » rendent le même verdict, donc un témoin écrit sur une
 * scène en cours ne pourrait pas tomber (leçon 261, portée à un état).
 */
describe('scenePlaybackToggled — une scène TERMINÉE se REJOUE, elle ne se « dé-pause » pas', () => {
  test("presser lecture sur une scène finie remonte le player (`run` change) et la relance", () => {
    const finished = scenePlaybackEnded(initialScenePlayback(false));
    expect(scenePlays({ state: finished, isActive: true, moves: true })).toBe(false);
    expect(scenePlaybackShowsPlay(finished)).toBe(true);

    const replayed = scenePlaybackToggled(finished);
    expect(replayed.run).toBe(finished.run + 1);
    expect(replayed.ended).toBe(false);
    expect(replayed.paused).toBe(false);
    expect(scenePlays({ state: replayed, isActive: true, moves: true })).toBe(true);
    expect(scenePlaybackShowsPlay(replayed)).toBe(false);
  });

  test('sur une scène EN COURS, le geste met en pause et ne remonte RIEN', () => {
    const playing = initialScenePlayback(false);
    const paused = scenePlaybackToggled(playing);
    expect(paused.paused).toBe(true);
    expect(paused.run).toBe(playing.run);
    expect(scenePlays({ state: paused, isActive: true, moves: true })).toBe(false);

    const resumed = scenePlaybackToggled(paused);
    expect(resumed.paused).toBe(false);
    expect(resumed.run).toBe(playing.run);
  });

  test("un appui long ARRÊTE, il ne remet rien à zéro (`pausedOnEntry`)", () => {
    expect(initialScenePlayback(true).paused).toBe(true);
    const state = scenePlaybackPaused(initialScenePlayback(false));
    expect(state.paused).toBe(true);
    expect(state.run).toBe(0);
    expect(state.ended).toBe(false);
  });

  test('une scène FIXE ou une page INACTIVE ne joue jamais, quel que soit l’état', () => {
    const state = initialScenePlayback(false);
    expect(scenePlays({ state, isActive: false, moves: true })).toBe(false);
    expect(scenePlays({ state, isActive: true, moves: false })).toBe(false);
    expect(scenePlays({ state, isActive: true, moves: true })).toBe(true);
  });

  test('aucune transition ne MUTE son entrée (données immuables)', () => {
    const state = initialScenePlayback(false);
    scenePlaybackToggled(scenePlaybackEnded(state));
    expect(state).toEqual({ paused: false, ended: false, run: 0 });
  });
});
