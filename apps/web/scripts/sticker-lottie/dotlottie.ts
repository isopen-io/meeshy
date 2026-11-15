/**
 * LE PAQUET `.lottie` D'UN STICKER (#10639) — le format dotLottie : un zip
 * qui porte `manifest.json` et `animations/<id>.json`. lottie-ios l'ouvre par
 * `DotLottieFile`, et le zip ramène un film d'une centaine de Ko de JSON à
 * quelques Ko. La date de chaque entrée est FIXE : regénérer le catalogue ne
 * réécrit que les stickers dont le dessin a changé.
 */
import { strToU8, zipSync } from 'fflate';

const EPOCH = new Date('1980-01-01T00:00:00Z');

export function packDotLottie(o: { readonly id: string; readonly animation: unknown }): Uint8Array {
  const manifest = { version: '1', generator: 'meeshy/sticker-lottie', animations: [{ id: o.id }] };
  return zipSync(
    {
      'manifest.json': [strToU8(JSON.stringify(manifest)), { mtime: EPOCH }],
      [`animations/${o.id}.json`]: [strToU8(JSON.stringify(o.animation)), { mtime: EPOCH }],
    },
    { level: 9 },
  );
}
