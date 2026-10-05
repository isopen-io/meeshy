import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { DECODED_SWAP_FADE_MS, type ImageDecode } from '@/lib/media/decoded-swap';
import type { StudioFloor } from '@/lib/stories/studio-floor';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { StudioFloorLayer } from './story-compose-floor';

/**
 * LE SOL NE SCINTILLE PLUS (#8534) — l'image locale floutée cède la place au
 * thumbhash du composite quelques centaines de millisecondes après la pose :
 * la nouvelle source ne se montre qu'une fois DÉCODÉE, et l'ancienne reste
 * dessous le temps d'un fondu. Jamais un instant sans image.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

/** Un décodeur que le témoin libère à la main. */
function heldDecoder() {
  const pending = new Map<string, () => void>();
  const decode: ImageDecode = (src) => new Promise<void>((resolve) => pending.set(src, resolve));
  const release = async (src: string) => {
    await act(async () => {
      pending.get(src)?.();
      await Promise.resolve();
    });
  };
  return { decode, release, asked: () => [...pending.keys()] };
}

const floorImages = (host: ParentNode) => [...host.querySelectorAll<HTMLImageElement>('[data-story-studio-floor] img')];
const topSrc = (host: ParentNode) => floorImages(host).at(-1)?.getAttribute('src');

const MEDIA: StudioFloor = { kind: 'media', src: 'blob:local' };
const HASH: StudioFloor = { kind: 'hash', src: 'data:image/bmp;base64,AAAA' };

describe('StudioFloorLayer — la bascule vers le thumbhash est imperceptible (#8534)', () => {
  test('la nouvelle source ne se peint qu’après son décodage ; l’ancienne reste jusque-là', async () => {
    const decoder = heldDecoder();
    const host = await mounter.mount(<StudioFloorLayer floor={MEDIA} decode={decoder.decode} />);
    const first = floorImages(host)[0];
    expect(topSrc(host)).toBe('blob:local');

    await mounter.rerender(host, <StudioFloorLayer floor={HASH} decode={decoder.decode} />);
    expect(decoder.asked()).toEqual([HASH.src]);
    expect(topSrc(host)).toBe('blob:local');
    expect(floorImages(host)).toHaveLength(1);

    await decoder.release(HASH.src);
    expect(topSrc(host)).toBe(HASH.src);
    expect(floorImages(host).map((img) => img.getAttribute('src'))).toEqual(['blob:local', HASH.src]);
    expect(floorImages(host)[0]).toBe(first!);
  });

  test('après le fondu, seule la nouvelle image reste', async () => {
    const decoder = heldDecoder();
    const host = await mounter.mount(<StudioFloorLayer floor={MEDIA} decode={decoder.decode} />);
    await mounter.rerender(host, <StudioFloorLayer floor={HASH} decode={decoder.decode} />);
    await decoder.release(HASH.src);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, DECODED_SWAP_FADE_MS + 20));
    });
    expect(floorImages(host).map((img) => img.getAttribute('src'))).toEqual([HASH.src]);
  });

  test('un décodage devenu inutile (la scène a changé entre-temps) ne se peint jamais', async () => {
    const decoder = heldDecoder();
    const other: StudioFloor = { kind: 'hash', src: 'data:image/bmp;base64,BBBB' };
    const host = await mounter.mount(<StudioFloorLayer floor={MEDIA} decode={decoder.decode} />);
    await mounter.rerender(host, <StudioFloorLayer floor={HASH} decode={decoder.decode} />);
    await mounter.rerender(host, <StudioFloorLayer floor={other} decode={decoder.decode} />);
    await decoder.release(HASH.src);
    expect(topSrc(host)).toBe('blob:local');
    await decoder.release(other.src);
    expect(topSrc(host)).toBe(other.src);
  });
});
