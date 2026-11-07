import { describe, expect, test } from 'bun:test';

import { aacConfigFor, createTalkieCapture, talkieEncodingSupported, type TalkieEncoderEnv } from './talkie-encoder';

/**
 * L'ENCODAGE DU TALKIE PAR LE NAVIGATEUR (#16641) — le bouton n'existe que là où
 * le navigateur capte ET encode l'AAC ADTS ; ailleurs, le message vocal.
 */

const probing = (supported: boolean | 'throws'): NonNullable<TalkieEncoderEnv['AudioEncoder']> =>
  Object.assign(function Encoder() {}, {
    isConfigSupported: async () => {
      if (supported === 'throws') throw new Error('nope');
      return { supported };
    },
  }) as unknown as NonNullable<TalkieEncoderEnv['AudioEncoder']>;

const Processor = function Processor() {} as unknown as NonNullable<TalkieEncoderEnv['MediaStreamTrackProcessor']>;
const getUserMedia = async () => ({}) as MediaStream;

describe('talkieEncodingSupported', () => {
  test('Chrome / Edge : processeur de piste + AAC ADTS accepté ⇒ oui', async () => {
    expect(await talkieEncodingSupported({ AudioEncoder: probing(true), MediaStreamTrackProcessor: Processor, getUserMedia })).toBe(true);
  });

  test('Firefox : l’encodeur refuse l’AAC ⇒ non', async () => {
    expect(await talkieEncodingSupported({ AudioEncoder: probing(false), MediaStreamTrackProcessor: Processor, getUserMedia })).toBe(false);
  });

  test('Safari : pas de processeur de piste sur la page ⇒ non', async () => {
    expect(await talkieEncodingSupported({ AudioEncoder: probing(true), getUserMedia })).toBe(false);
  });

  test('sans WebCodecs, sans micro, ou une sonde qui lève ⇒ non', async () => {
    expect(await talkieEncodingSupported({ MediaStreamTrackProcessor: Processor, getUserMedia })).toBe(false);
    expect(await talkieEncodingSupported({ AudioEncoder: probing(true), MediaStreamTrackProcessor: Processor })).toBe(false);
    expect(await talkieEncodingSupported({ AudioEncoder: probing('throws'), MediaStreamTrackProcessor: Processor, getUserMedia })).toBe(false);
  });

  test('la configuration demande des trames ADTS, mono, 64 kb/s — l’encodage que le receveur décode', () => {
    expect(aacConfigFor(48_000, 1)).toEqual({ codec: 'mp4a.40.2', sampleRate: 48_000, numberOfChannels: 1, bitrate: 64_000, aac: { format: 'adts' } });
  });

  test('une capture sans encodeur ne s’ouvre pas', async () => {
    const failure = await createTalkieCapture({ getUserMedia })({ onFrame: () => undefined }).then(
      () => null,
      (error: unknown) => (error instanceof Error ? error.message : null),
    );
    expect(failure).toBe('talkie-unsupported');
  });
});
