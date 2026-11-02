import { describe, expect, test } from 'bun:test';

import { decodeAnimatedImage, frameAt, type AnimatedImage } from './scene-export-animated';

const named = (name: string) => ({ name }) as unknown as CanvasImageSource;

const loop: AnimatedImage = {
  frames: [
    { image: named('a'), endMs: 100 },
    { image: named('b'), endMs: 250 },
    { image: named('c'), endMs: 300 },
  ],
  totalMs: 300,
  close: () => undefined,
};

const nameOf = (image: CanvasImageSource | null) => (image as unknown as { name?: string } | null)?.name;

describe('l’image animée d’un sticker ou d’un média, à l’instant de la scène (#13880)', () => {
  test('chaque image tient sa durée, et l’animation boucle comme dans le lecteur', () => {
    expect(nameOf(frameAt(loop, 0))).toBe('a');
    expect(nameOf(frameAt(loop, 99))).toBe('a');
    expect(nameOf(frameAt(loop, 100))).toBe('b');
    expect(nameOf(frameAt(loop, 299))).toBe('c');
    expect(nameOf(frameAt(loop, 300))).toBe('a');
    expect(nameOf(frameAt(loop, 960))).toBe('a');
  });
  test('un instant négatif tient la première image', () => {
    expect(nameOf(frameAt(loop, -50))).toBe('a');
  });
});

type FakeFrame = { readonly name: string; readonly duration: number | null; closed: boolean; close: () => void };

function fakeDecoder(frameDurationsUs: readonly (number | null)[], options: { supported?: boolean } = {}) {
  const frames: FakeFrame[] = [];
  class Decoder {
    static isTypeSupported = async () => options.supported ?? true;
    readonly tracks = { ready: Promise.resolve(), selectedTrack: { frameCount: frameDurationsUs.length } };
    closed = false;
    async decode({ frameIndex }: { frameIndex: number }) {
      const frame: FakeFrame = {
        name: `f${frameIndex}`,
        duration: frameDurationsUs[frameIndex] ?? null,
        closed: false,
        close() {
          this.closed = true;
        },
      };
      frames.push(frame);
      return { image: frame };
    }
    close() {
      this.closed = true;
    }
  }
  return { Decoder: Decoder as unknown as typeof ImageDecoder, frames };
}

const gif = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/gif' });

describe('decodeAnimatedImage — le décodeur de la plateforme (WebCodecs), jamais un second', () => {
  test('un GIF de plusieurs images rend ses images et leurs fins, en millisecondes', async () => {
    const { Decoder } = fakeDecoder([100_000, 50_000, 100_000]);
    const animated = await decodeAnimatedImage(gif(), Decoder);
    expect(animated?.frames.map((frame) => frame.endMs)).toEqual([100, 150, 250]);
    expect(animated?.totalMs).toBe(250);
  });

  test('une image sans durée prend celle d’un navigateur (100 ms)', async () => {
    const { Decoder } = fakeDecoder([null, 0]);
    expect((await decodeAnimatedImage(gif(), Decoder))?.totalMs).toBe(200);
  });

  test('une image fixe, un format non lu ou l’absence de décodeur : l’image fixe', async () => {
    expect(await decodeAnimatedImage(gif(), fakeDecoder([100_000]).Decoder)).toBeNull();
    expect(await decodeAnimatedImage(gif(), fakeDecoder([100_000, 100_000], { supported: false }).Decoder)).toBeNull();
    expect(await decodeAnimatedImage(gif(), undefined)).toBeNull();
  });

  test('trop d’images pour la mémoire : l’image fixe, et rien ne reste ouvert', async () => {
    const { Decoder, frames } = fakeDecoder(Array.from({ length: 5 }, () => 40_000));
    expect(await decodeAnimatedImage(gif(), Decoder, { maxFrames: 4 })).toBeNull();
    expect(frames.every((frame) => frame.closed)).toBe(true);
  });

  test('close() referme chaque image décodée', async () => {
    const { Decoder, frames } = fakeDecoder([100_000, 100_000]);
    (await decodeAnimatedImage(gif(), Decoder))?.close();
    expect(frames.map((frame) => frame.closed)).toEqual([true, true]);
  });
});
