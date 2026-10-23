import { describe, expect, test } from 'bun:test';

import { decodesInBrowser, isHeifFamily, needsServedPreview, servableHeif } from './heif';

const file = (name: string, type: string): File => new File([new Uint8Array([0, 0, 0, 24])], name, { type });

describe('isHeifFamily — une photo HEIC/HEIF, typée ou non', () => {
  test('le type déclaré suffit', () => {
    expect(isHeifFamily(file('IMG_0001.HEIC', 'image/heic'))).toBe(true);
    expect(isHeifFamily(file('a.heif', 'image/heif'))).toBe(true);
  });

  test('sans type (Chrome sur Android ne nomme pas toujours le HEIC), l’extension décide', () => {
    expect(isHeifFamily(file('IMG_0001.HEIC', ''))).toBe(true);
    expect(isHeifFamily(file('IMG_0001.heif', 'application/octet-stream'))).toBe(true);
  });

  test('une photo JPEG, PNG ou AVIF n’en est pas', () => {
    expect(isHeifFamily(file('a.jpg', 'image/jpeg'))).toBe(false);
    expect(isHeifFamily(file('a.png', ''))).toBe(false);
    expect(isHeifFamily(file('a.avif', 'image/avif'))).toBe(false);
  });
});

describe('servableHeif — le fichier HEIC part sous son vrai type', () => {
  test('un HEIC sans type repart typé, octets et nom inchangés', async () => {
    const source = file('IMG_0001.HEIC', '');
    const served = servableHeif(source);
    expect(served.type).toBe('image/heic');
    expect(served.name).toBe('IMG_0001.HEIC');
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(new Uint8Array([0, 0, 0, 24]));
  });

  test('un HEIC déjà typé est rendu tel quel', () => {
    const source = file('a.heic', 'image/heic');
    expect(servableHeif(source)).toBe(source);
  });
});

describe('decodesInBrowser — l’essai createImageBitmap', () => {
  test('le décodeur rend une image : décodable, et l’image est fermée', async () => {
    const closed: string[] = [];
    expect(await decodesInBrowser(file('a.heic', 'image/heic'), async () => ({ close: () => closed.push('closed') }))).toBe(true);
    expect(closed).toEqual(['closed']);
  });

  test('le décodeur lève (Chrome sur un HEIC) : non décodable', async () => {
    expect(
      await decodesInBrowser(file('a.heic', 'image/heic'), async () => {
        throw new DOMException('The source image could not be decoded.', 'InvalidStateError');
      }),
    ).toBe(false);
  });

  test('aucun décodeur (navigateur ancien) : non décodable', async () => {
    expect(await decodesInBrowser(file('a.heic', 'image/heic'), null)).toBe(false);
  });
});

describe('needsServedPreview — l’aperçu attend-il la vignette servie ?', () => {
  const failing = async (): Promise<{ close: () => void }> => {
    throw new Error('undecodable');
  };

  test('un HEIC que le navigateur ne décode pas : oui', async () => {
    expect(await needsServedPreview(file('IMG_1.HEIC', ''), failing)).toBe(true);
  });

  test('un HEIC que le navigateur décode (Safari) : non, l’aperçu local se montre', async () => {
    expect(await needsServedPreview(file('IMG_1.HEIC', 'image/heic'), async () => ({ close: () => undefined }))).toBe(false);
  });

  test('toute autre photo : non, sans même essayer de la décoder', async () => {
    const tried: string[] = [];
    const spy = async (): Promise<{ close: () => void }> => {
      tried.push('decode');
      throw new Error('x');
    };
    expect(await needsServedPreview(file('a.jpg', 'image/jpeg'), spy)).toBe(false);
    expect(tried).toEqual([]);
  });
});
