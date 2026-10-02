import { describe, expect, test } from 'bun:test';

import { audioTrimUntouched, trimmedAudioFileName, trimmedWav } from './audio-trim';

/** COUPER UN AUDIO EN ATTENTE (#9136, miroir de l'éditeur audio iOS) — la
 * fenêtre gardée seule repart, à la bonne durée, en WAV PCM 16 bits. */
const tone = (seconds: number, sampleRate = 8000, channels = 1) => ({
  sampleRate,
  numberOfChannels: channels,
  length: seconds * sampleRate,
  getChannelData: () => Float32Array.from({ length: seconds * sampleRate }, (_, index) => Math.sin(index / 10) * 0.5),
});

const header = async (blob: Blob) => new DataView(await blob.arrayBuffer());

describe('trimmedWav', () => {
  test('rend la seule fenêtre gardée — 4 s d’un son de 10 s pèsent 4 s', async () => {
    const blob = trimmedWav(tone(10), { start: 3, end: 7 });
    const view = await header(blob);
    expect(blob.type).toBe('audio/wav');
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
    const dataBytes = view.getUint32(40, true);
    const byteRate = view.getUint32(28, true);
    expect(dataBytes / byteRate).toBeCloseTo(4, 3);
  });

  test('garde ses canaux et sa fréquence', async () => {
    const view = await header(trimmedWav(tone(2, 44100, 2), { start: 0, end: 1 }));
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44100);
  });
});

describe('audioTrimUntouched', () => {
  test('une fenêtre qui couvre tout le son n’est pas une coupe', () => {
    expect(audioTrimUntouched({ start: 0, end: 10 }, 10)).toBe(true);
    expect(audioTrimUntouched({ start: 0.5, end: 10 }, 10)).toBe(false);
  });
});

test('le nom dit la coupe et le conteneur', () => {
  expect(trimmedAudioFileName('vocal.webm')).toBe('vocal-coupe.wav');
});
