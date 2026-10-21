import { describe, expect, test } from 'bun:test';

import wallpapers from '@meeshy/shared/design/appearance/wallpapers/designs.json';
import banners from '@meeshy/shared/design/appearance/banners/designs.json';
import rings from '@meeshy/shared/design/appearance/avatar-rings/rings.json';

import { decodeLottie } from './decode';
import { BUILTIN_LOTTIE_SRCS, lottieBytesLoader } from './sources';

type Ref = { readonly src: string; readonly bytes: number; readonly sha256: string };
const declared = (): readonly Ref[] =>
  [
    ...wallpapers.packs.flatMap((pack) => pack.designs as readonly unknown[]),
    ...banners.packs.flatMap((pack) => pack.designs as readonly unknown[]),
    ...rings.packs.flatMap((pack) => pack.rings as readonly unknown[]),
  ].flatMap((item) => ((item as { lottie?: Ref }).lottie === undefined ? [] : [(item as { lottie: Ref }).lottie]));

describe('les couches Lottie des packs intégrés (#10638)', () => {
  test('toute couche déclarée par le catalogue intégré est embarquée et se lit', async () => {
    const refs = declared();
    expect(refs.length).toBeGreaterThanOrEqual(3);
    for (const ref of refs) {
      expect(BUILTIN_LOTTIE_SRCS).toContain(ref.src);
      const bytes = await lottieBytesLoader(ref, { origin: 'https://gate.test' })();
      expect(bytes).not.toBeNull();
      expect((await decodeLottie(bytes!)).ok).toBe(true);
    }
  });

  test('une couche servie est vérifiée à son empreinte complète : un octet changé est refusé', async () => {
    const body = new TextEncoder().encode('{"v":"5.7.0"}');
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', body)), (b) => b.toString(16).padStart(2, '0')).join('');
    const ref: Ref = { src: `${digest.slice(0, 16)}.json`, bytes: body.length, sha256: digest };
    const serve = (payload: Uint8Array) => (async () => new Response(payload as BodyInit)) as unknown as typeof fetch;
    expect(await lottieBytesLoader(ref, { origin: 'https://gate.test', fetcher: serve(body) })()).toEqual(body);
    expect(await lottieBytesLoader(ref, { origin: 'https://gate.test', fetcher: serve(new TextEncoder().encode('{"v":"5.7.1"}')) })()).toBeNull();
    expect(await lottieBytesLoader(ref, { origin: 'https://gate.test', fetcher: (async () => new Response('', { status: 404 })) as unknown as typeof fetch })()).toBeNull();
  });
});
