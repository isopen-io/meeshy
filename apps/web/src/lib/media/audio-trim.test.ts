import { describe, expect, test } from 'bun:test';

import { audioTrimUntouched, decodeAudioFile, MAXIMUM_TRIM_SOURCE_BYTES, trimmedAudioFileName, trimmedWav, trimSourceFits } from './audio-trim';

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

describe('decodeAudioFile', () => {
  const withAudioContext = async (run: (constructed: number[]) => Promise<void>) => {
    const constructed: number[] = [];
    const scope = globalThis as unknown as { AudioContext?: unknown };
    const previous = scope.AudioContext;
    scope.AudioContext = class {
      constructor() {
        constructed.push(1);
      }
      decodeAudioData() {
        return Promise.resolve({ sampleRate: 8000, numberOfChannels: 1, length: 8000, getChannelData: () => new Float32Array(8000) });
      }
      close() {
        return Promise.resolve();
      }
    };
    try {
      await run(constructed);
    } finally {
      scope.AudioContext = previous;
    }
  };

  test('un son au-delà de la borne n’ouvre aucun décodeur et rend null', async () => {
    await withAudioContext(async (constructed) => {
      const decoded = await decodeAudioFile({ size: MAXIMUM_TRIM_SOURCE_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) });
      expect(decoded).toBeNull();
      expect(constructed).toEqual([]);
    });
  });

  test('un son dans la borne est décodé', async () => {
    await withAudioContext(async (constructed) => {
      const decoded = await decodeAudioFile({ size: 1024, arrayBuffer: async () => new ArrayBuffer(0) });
      expect(decoded?.length).toBe(8000);
      expect(constructed).toEqual([1]);
    });
  });
});

describe('trimSourceFits', () => {
  test('la borne est incluse, un octet de plus est refusé', () => {
    expect(trimSourceFits({ size: MAXIMUM_TRIM_SOURCE_BYTES })).toBe(true);
    expect(trimSourceFits({ size: MAXIMUM_TRIM_SOURCE_BYTES + 1 })).toBe(false);
  });
});
