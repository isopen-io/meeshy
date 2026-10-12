import { describe, expect, test } from 'bun:test';

import { AUDIO_GAIN, audioEditUntouched, editedWav, renderedChannels, untouchedAudioEdit, volumePercent, type AudioEdit } from './audio-edit';
import type { DecodedAudio } from './audio-trim';

/**
 * L'ÉDITEUR AUDIO DU MESSAGE (#9164, miroir de `AudioEditorController` et
 * `AudioEditEngine` iOS) — chaque réglage se lit sur les ÉCHANTILLONS rendus,
 * jamais sur l'état de l'interface.
 */
const constant = (seconds: number, level: number, sampleRate = 8000): DecodedAudio => ({
  sampleRate,
  numberOfChannels: 1,
  length: seconds * sampleRate,
  getChannelData: () => new Float32Array(seconds * sampleRate).fill(level),
});

const edit = (audio: DecodedAudio, patch: Partial<AudioEdit>): AudioEdit => ({ ...untouchedAudioEdit(audio.length / audio.sampleRate), ...patch });

describe('volume', () => {
  test('le gain multiplie chaque échantillon rendu', () => {
    const audio = constant(2, 0.25);
    const [samples] = renderedChannels(audio, edit(audio, { gain: 1.5 }));
    expect(samples![0]).toBeCloseTo(0.375, 5);
    expect(samples![samples!.length - 1]).toBeCloseTo(0.375, 5);
  });

  test('gain nul : le son rendu se tait', () => {
    const audio = constant(1, 0.5);
    const [samples] = renderedChannels(audio, edit(audio, { gain: 0 }));
    expect(samples!.every((value) => value === 0)).toBe(true);
  });

  test('le gain s’applique à la seule fenêtre gardée', () => {
    const audio = constant(10, 0.2);
    const [samples] = renderedChannels(audio, edit(audio, { window: { start: 2, end: 6 }, gain: 2 }));
    expect(samples!.length).toBe(4 * 8000);
    expect(samples![100]).toBeCloseTo(0.4, 5);
  });

  test('le WAV rendu porte le gain, écrêté à la pleine échelle', async () => {
    const audio = constant(1, 0.8);
    const view = new DataView(await editedWav(audio, edit(audio, { gain: 2 })).arrayBuffer());
    expect(view.getInt16(44, true)).toBe(0x7fff);
  });

  test('mêmes bornes qu’iOS : un curseur de 0 à 200 %, au pas de 5 %', () => {
    expect(AUDIO_GAIN).toEqual({ min: 0, max: 2, step: 0.05 });
  });

  test('le libellé dit « Normal » à 100 %, le pourcentage arrondi ailleurs', () => {
    expect(volumePercent(1)).toBeNull();
    expect(volumePercent(1.5)).toBe(150);
    expect(volumePercent(0.35)).toBe(35);
  });
});

describe('audioEditUntouched', () => {
  test('rien de réglé : la pièce reste telle quelle', () => {
    expect(audioEditUntouched(untouchedAudioEdit(10), 10)).toBe(true);
  });

  test('un volume changé est une édition', () => {
    expect(audioEditUntouched({ ...untouchedAudioEdit(10), gain: 0.5 }, 10)).toBe(false);
  });
});
