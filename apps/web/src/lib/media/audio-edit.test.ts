import { describe, expect, test } from 'bun:test';

import { AUDIO_GAIN, audioEditUntouched, defaultAudioCut, editedWav, fadeSeconds, renderedChannels, untouchedAudioEdit, volumePercent, type AudioEdit } from './audio-edit';
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

describe('fondus (#9162)', () => {
  test('même durée qu’iOS : le tiers du son rendu, entre 0,2 et 1,2 s', () => {
    expect(fadeSeconds(9)).toBeCloseTo(1.2, 5);
    expect(fadeSeconds(1.5)).toBeCloseTo(0.5, 5);
    expect(fadeSeconds(0.3)).toBeCloseTo(0.2, 5);
  });

  test('fondu d’entrée : le son part du silence et rejoint son niveau à la fin du fondu', () => {
    const audio = constant(6, 0.5);
    const [samples] = renderedChannels(audio, edit(audio, { fadeIn: true }));
    expect(samples![0]).toBe(0);
    expect(samples![Math.round(0.6 * 8000)]).toBeCloseTo(0.25, 2);
    expect(samples![Math.round(1.2 * 8000)]).toBeCloseTo(0.5, 3);
    expect(samples![samples!.length - 1]).toBeCloseTo(0.5, 5);
  });

  test('fondu de sortie : le son finit au silence, le début reste intact', () => {
    const audio = constant(6, 0.5);
    const [samples] = renderedChannels(audio, edit(audio, { fadeOut: true }));
    expect(samples![0]).toBeCloseTo(0.5, 5);
    expect(samples![Math.round(4.8 * 8000) - 1]).toBeCloseTo(0.5, 3);
    expect(samples![samples!.length - 1]).toBeCloseTo(0, 3);
  });

  test('le fondu rejoint le volume réglé, pas le niveau d’origine', () => {
    const audio = constant(6, 0.25);
    const [samples] = renderedChannels(audio, edit(audio, { fadeIn: true, fadeOut: true, gain: 2 }));
    expect(samples![0]).toBe(0);
    expect(samples![3 * 8000]).toBeCloseTo(0.5, 5);
    expect(samples![samples!.length - 1]).toBeCloseTo(0, 3);
  });

  test('le fondu se mesure sur la fenêtre gardée', () => {
    const audio = constant(10, 0.5);
    const [samples] = renderedChannels(audio, edit(audio, { window: { start: 4, end: 7 }, fadeOut: true }));
    expect(samples!.length).toBe(3 * 8000);
    expect(samples![samples!.length - 1]).toBeCloseTo(0, 3);
    expect(samples![Math.round(1.9 * 8000)]).toBeCloseTo(0.5, 3);
  });
});

describe('vitesse (#9163)', () => {
  test('la vitesse s’applique à la fenêtre gardée : 4 s gardées à 2× durent 2 s', () => {
    const audio = constant(10, 0.25);
    const [samples] = renderedChannels(audio, edit(audio, { window: { start: 3, end: 7 }, speed: 2 }));
    expect(samples!.length / 8000).toBeCloseTo(2, 2);
  });

  test('0,75× allonge le son, et le fondu de sortie se pose sur la durée RENDUE', () => {
    const audio = constant(6, 0.5);
    const [samples] = renderedChannels(audio, edit(audio, { speed: 0.75, fadeOut: true }));
    expect(samples!.length / 8000).toBeCloseTo(8, 2);
    expect(samples![samples!.length - 1]).toBeCloseTo(0, 3);
    expect(samples![Math.round(6.7 * 8000)]).toBeCloseTo(0.5, 2);
  });
});

describe('audioEditUntouched', () => {
  test('une vitesse changée est une édition', () => {
    expect(audioEditUntouched({ ...untouchedAudioEdit(10), speed: 1.5 }, 10)).toBe(false);
  });

  test('un fondu posé est une édition', () => {
    expect(audioEditUntouched({ ...untouchedAudioEdit(10), fadeIn: true }, 10)).toBe(false);
    expect(audioEditUntouched({ ...untouchedAudioEdit(10), fadeOut: true }, 10)).toBe(false);
  });

  test('rien de réglé : la pièce reste telle quelle', () => {
    expect(audioEditUntouched(untouchedAudioEdit(10), 10)).toBe(true);
  });

  test('un volume changé est une édition', () => {
    expect(audioEditUntouched({ ...untouchedAudioEdit(10), gain: 0.5 }, 10)).toBe(false);
  });
});

describe('scission (#9161, miroir de AudioEditorTool.split)', () => {
  const ramp = (seconds: number, sampleRate = 8000): DecodedAudio => ({
    sampleRate,
    numberOfChannels: 1,
    length: seconds * sampleRate,
    getChannelData: () => Float32Array.from({ length: seconds * sampleRate }, (_, frame) => frame / (seconds * sampleRate)),
  });

  test('la plage d’iOS se pose de 40 à 60 % du son', () => {
    expect(defaultAudioCut(10)).toEqual({ start: 4, end: 6 });
  });

  test('retirer 4 → 6 s d’un son de 10 s : il en reste 8, et le son reprend après la plage', () => {
    const audio = ramp(10);
    const [samples] = renderedChannels(audio, edit(audio, { cut: { start: 4, end: 6 } }));
    expect(samples!.length / 8000).toBeCloseTo(8, 3);
    expect(samples![4 * 8000 - 1]).toBeCloseTo(0.4, 3);
    expect(samples![4 * 8000]).toBeCloseTo(0.6, 3);
  });

  test('la plage se lit dans la fenêtre gardée : 2 → 8 s gardées, 4 → 6 s retirées, il reste 4 s', () => {
    const audio = ramp(10);
    const [samples] = renderedChannels(audio, edit(audio, { window: { start: 2, end: 8 }, cut: { start: 4, end: 6 } }));
    expect(samples!.length / 8000).toBeCloseTo(4, 3);
    expect(samples![0]).toBeCloseTo(0.2, 3);
    expect(samples![2 * 8000]).toBeCloseTo(0.6, 3);
  });

  test('une plage plus courte que 0,2 s ne retire rien (isSplitMeaningful)', () => {
    const audio = ramp(10);
    const [samples] = renderedChannels(audio, edit(audio, { cut: { start: 5, end: 5.1 } }));
    expect(samples!.length).toBe(10 * 8000);
    expect(audioEditUntouched({ ...untouchedAudioEdit(10), cut: { start: 5, end: 5.1 } }, 10)).toBe(true);
  });

  test('une plage qui laisserait moins de 0,4 s ne retire rien', () => {
    const audio = ramp(10);
    const [samples] = renderedChannels(audio, edit(audio, { cut: { start: 0, end: 9.8 } }));
    expect(samples!.length).toBe(10 * 8000);
  });

  test('une plage posée est une édition ; la vitesse et le fondu se mesurent sur le son SCINDÉ', () => {
    expect(audioEditUntouched({ ...untouchedAudioEdit(10), cut: { start: 4, end: 6 } }, 10)).toBe(false);
    const audio = constant(10, 0.5);
    const [samples] = renderedChannels(audio, edit(audio, { cut: { start: 4, end: 6 }, speed: 2, fadeOut: true }));
    expect(samples!.length / 8000).toBeCloseTo(4, 2);
    expect(samples![samples!.length - 1]).toBeCloseTo(0, 3);
  });

  test('aucune plage par défaut', () => {
    expect(untouchedAudioEdit(10).cut).toBeNull();
  });
});
