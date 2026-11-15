import { describe, expect, test } from 'bun:test';
import { strFromU8, unzipSync } from 'fflate';

import { packDotLottie } from './dotlottie';

const animation = { v: '5.12.0', fr: 30, ip: 0, op: 60, w: 216, h: 216, layers: [] };

describe('packDotLottie — un fichier .lottie que lottie-ios ouvre', () => {
  test('le paquet porte le manifeste et l’animation sous animations/<id>.json', () => {
    const files = unzipSync(packDotLottie({ id: 'mee-coucou', animation }));
    const manifest = JSON.parse(strFromU8(files['manifest.json'] as Uint8Array));
    expect(manifest.animations).toEqual([{ id: 'mee-coucou' }]);
    expect(JSON.parse(strFromU8(files['animations/mee-coucou.json'] as Uint8Array))).toEqual(animation);
  });

  test('deux paquets du même contenu sont identiques octet pour octet : regénérer ne change aucun fichier', () => {
    const first = packDotLottie({ id: 'a', animation });
    const second = packDotLottie({ id: 'a', animation });
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });
});
