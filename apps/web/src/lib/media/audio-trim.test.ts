import { describe, expect, test } from 'bun:test';

import {
  audioTrimUntouched,
  DECODED_AUDIO_BUDGET_BYTES,
  decodeAudioFile,
  decodeRateFor,
  MAXIMUM_TRIM_SOURCE_BYTES,
  MINIMUM_DECODE_RATE,
  PREFERRED_DECODE_RATE,
  trimmedAudioFileName,
  trimmedWav,
  trimSourceFits,
  trimSourceSeconds,
  windowChannels,
} from './audio-trim';

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

describe('windowChannels', () => {
  test('la fenêtre est une VUE des échantillons décodés : couper ne recopie pas le son', () => {
    const samples = new Float32Array(80_000);
    const audio = { sampleRate: 8000, numberOfChannels: 1, length: 80_000, getChannelData: () => samples };
    const [kept] = windowChannels(audio, { start: 3, end: 7 });
    expect(kept!.length).toBe(32_000);
    expect(kept!.buffer).toBe(samples.buffer);
  });
});

/** LE PCM DÉCODÉ EST BORNÉ, PAS LA SEULE SOURCE (#11312) — un vocal Opus de
 * 5 Mo dure 20 min et pèse 460 Mo décodé en stéréo 48 kHz : c'est la DURÉE qui
 * fait la mémoire, et la fréquence de décodage qui la tient sous le budget. */
describe('decodeRateFor', () => {
  const decodedBytes = (seconds: number, rate: number) => seconds * rate * 2 * 4;

  test('un son court se décode à pleine fréquence', () => {
    expect(decodeRateFor(60)).toBe(PREFERRED_DECODE_RATE);
  });

  test('un vocal de 20 min se décode à une fréquence plus basse, sous le budget', () => {
    const rate = decodeRateFor(20 * 60);
    expect(rate).not.toBeNull();
    expect(rate!).toBeLessThan(PREFERRED_DECODE_RATE);
    expect(rate!).toBeGreaterThanOrEqual(MINIMUM_DECODE_RATE);
    expect(decodedBytes(20 * 60, rate!)).toBeLessThanOrEqual(DECODED_AUDIO_BUDGET_BYTES);
  });

  test('un son trop long pour le budget même à la fréquence plancher n’est pas décodé', () => {
    const seconds = DECODED_AUDIO_BUDGET_BYTES / (MINIMUM_DECODE_RATE * 2 * 4) + 1;
    expect(decodeRateFor(seconds)).toBeNull();
  });

  test('une durée absente ou absurde n’est pas décodée', () => {
    expect(decodeRateFor(Number.POSITIVE_INFINITY)).toBeNull();
    expect(decodeRateFor(Number.NaN)).toBeNull();
    expect(decodeRateFor(0)).toBeNull();
  });
});

describe('trimSourceSeconds', () => {
  test('la durée connue fait foi', () => {
    expect(trimSourceSeconds({ size: 5_000_000, seconds: 1200 })).toBe(1200);
  });

  test('une durée inconnue se majore par la taille au débit le plus bas (8 kbit/s)', () => {
    expect(trimSourceSeconds({ size: 1_000_000, seconds: null })).toBe(1000);
    expect(trimSourceSeconds({ size: 1_000_000, seconds: Number.POSITIVE_INFINITY })).toBe(1000);
  });
});

describe('trimSourceFits', () => {
  test('la borne est incluse, un octet de plus est refusé', () => {
    expect(trimSourceFits({ size: MAXIMUM_TRIM_SOURCE_BYTES })).toBe(true);
    expect(trimSourceFits({ size: MAXIMUM_TRIM_SOURCE_BYTES + 1 })).toBe(false);
  });
});

describe('decodeAudioFile', () => {
  const withOfflineContext = async (run: (rates: number[]) => Promise<void>) => {
    const rates: number[] = [];
    const scope = globalThis as unknown as { OfflineAudioContext?: unknown };
    const previous = scope.OfflineAudioContext;
    scope.OfflineAudioContext = class {
      readonly sampleRate: number;
      constructor(_channels: number, _length: number, sampleRate: number) {
        this.sampleRate = sampleRate;
        rates.push(sampleRate);
      }
      decodeAudioData() {
        return Promise.resolve({ sampleRate: this.sampleRate, numberOfChannels: 1, length: this.sampleRate, getChannelData: () => new Float32Array(this.sampleRate) });
      }
    };
    try {
      await run(rates);
    } finally {
      scope.OfflineAudioContext = previous;
    }
  };
  const source = (size: number) => ({ size, arrayBuffer: async () => new ArrayBuffer(0) });
  const unknownDuration = async () => null;

  test('un son au-delà de la borne de taille n’ouvre aucun décodeur et rend null', async () => {
    await withOfflineContext(async (rates) => {
      expect(await decodeAudioFile(source(MAXIMUM_TRIM_SOURCE_BYTES + 1), { probeSeconds: unknownDuration })).toBeNull();
      expect(rates).toEqual([]);
    });
  });

  test('un son court est décodé à pleine fréquence', async () => {
    await withOfflineContext(async (rates) => {
      const decoded = await decodeAudioFile(source(1024), { durationMs: 10_000 });
      expect(decoded?.sampleRate).toBe(PREFERRED_DECODE_RATE);
      expect(rates).toEqual([PREFERRED_DECODE_RATE]);
    });
  });

  test('un vocal enregistré de 20 min (5 Mo) se décode sous le budget, pas à pleine fréquence', async () => {
    await withOfflineContext(async (rates) => {
      const decoded = await decodeAudioFile(source(5_000_000), { durationMs: 20 * 60_000 });
      expect(decoded).not.toBeNull();
      expect(rates).toEqual([decodeRateFor(20 * 60)!]);
      expect(rates[0]!).toBeLessThan(PREFERRED_DECODE_RATE);
    });
  });

  test('sans durée enregistrée, la durée lue dans les métadonnées fait foi', async () => {
    await withOfflineContext(async (rates) => {
      await decodeAudioFile(source(3_000_000), { probeSeconds: async () => 180 });
      expect(rates).toEqual([PREFERRED_DECODE_RATE]);
    });
  });

  test('un son trop long n’ouvre aucun décodeur et rend null', async () => {
    await withOfflineContext(async (rates) => {
      expect(await decodeAudioFile(source(1024), { durationMs: 3 * 3_600_000 })).toBeNull();
      expect(rates).toEqual([]);
    });
  });

  test('sans OfflineAudioContext (navigateur ancien), rien n’est décodé', async () => {
    const scope = globalThis as unknown as { OfflineAudioContext?: unknown };
    const previous = scope.OfflineAudioContext;
    scope.OfflineAudioContext = undefined;
    try {
      expect(await decodeAudioFile(source(1024), { durationMs: 10_000 })).toBeNull();
    } finally {
      scope.OfflineAudioContext = previous;
    }
  });
});
