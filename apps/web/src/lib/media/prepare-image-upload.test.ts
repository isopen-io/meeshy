import { describe, expect, test } from 'bun:test';

import type { ImageJob } from './image-job';
import { createImagePreparer, type ImagePort } from './prepare-image-upload';
import { servedMediaFile } from './served-media';

/**
 * RECOMPRESSER AVANT D'ENVOYER (#11310) — une photo de téléphone pèse 3 à
 * 8 Mo ; elle part à 1 Mo sans que personne ne le demande (miroir de
 * `ImageCompressor.compressOffMain`, iOS). Le worker est INJECTÉ.
 */

const MODIFIED = Date.UTC(2026, 9, 20, 9, 0, 0);

const file = (name: string, type: string, bytes: readonly number[] | number = 8): File =>
  new File([typeof bytes === 'number' ? new Uint8Array(bytes) : new Uint8Array(bytes)], name, { type, lastModified: MODIFIED });

const answering = (blob: Blob | null): { readonly port: ImagePort; readonly jobs: ImageJob[] } => {
  const jobs: ImageJob[] = [];
  return { jobs, port: (job) => (jobs.push(job), Promise.resolve(blob)) };
};

const webp = (size: number): Blob => new Blob([new Uint8Array(size)], { type: 'image/webp' });

const apng = (): File => file('anim.png', 'image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x08, 0x61, 0x63, 0x54, 0x4c]);

const animatedWebp = (): File => {
  const header = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8X');
  return file('anim.webp', 'image/webp', [...header, 0, 0, 0, 10, 0x02, 0, 0, 0]);
};

describe('ce qui n’est jamais touché', () => {
  const untouched: ReadonlyArray<readonly [string, string, string]> = [
    ['un document', 'a.pdf', 'application/pdf'],
    ['un GIF animé', 'a.gif', 'image/gif'],
    ['un SVG', 'a.svg', 'image/svg+xml'],
    ['une photo HEIC', 'a.heic', 'image/heic'],
  ];

  untouched.forEach(([label, name, type]) => {
    test(`${label} part tel quel, sans réveiller le worker`, async () => {
      const { port, jobs } = answering(webp(1));
      const original = file(name, type);
      expect(await createImagePreparer(port).prepare(original)).toBe(original);
      expect(jobs).toEqual([]);
    });
  });

  test('un média relu depuis la passerelle (transfert, republication) part tel quel : jamais une seconde génération (#11247)', async () => {
    const { port, jobs } = answering(webp(1));
    const served = servedMediaFile(new Uint8Array(8), 'photo.jpg', { type: 'image/jpeg' });
    const preparer = createImagePreparer(port);
    expect(await preparer.prepare(served)).toBe(served);
    expect((await preparer.prepareUploads([{ file: served }]))[0]?.file).toBe(served);
    expect(jobs).toEqual([]);
  });

  test('la même photo, choisie sur l’appareil, est bien recompressée', async () => {
    const { port, jobs } = answering(webp(1));
    await createImagePreparer(port).prepare(file('photo.jpg', 'image/jpeg'));
    expect(jobs).toHaveLength(1);
  });

  test('un PNG animé (APNG) garde son animation', async () => {
    const { port, jobs } = answering(webp(1));
    const original = apng();
    expect(await createImagePreparer(port).prepare(original)).toBe(original);
    expect(jobs).toEqual([]);
  });

  test('un WebP animé garde son animation', async () => {
    const { port, jobs } = answering(webp(1));
    const original = animatedWebp();
    expect(await createImagePreparer(port).prepare(original)).toBe(original);
    expect(jobs).toEqual([]);
  });
});

describe('le travail demandé au worker', () => {
  test('un JPEG : WebP à 0,85, 2560 px, déclaré opaque, sans look', async () => {
    const { port, jobs } = answering(webp(4));
    await createImagePreparer(port).prepare(file('IMG_1.JPG', 'image/jpeg', 100));
    expect(jobs[0]).toMatchObject({ maxEdge: 2560, look: null, output: { kind: 'efficient', quality: 0.85, opaque: true } });
  });

  test('un PNG : l’alpha reste à surveiller (non déclaré opaque)', async () => {
    const { port, jobs } = answering(webp(4));
    await createImagePreparer(port).prepare(file('a.png', 'image/png', 100));
    expect(jobs[0]?.output).toEqual({ kind: 'efficient', quality: 0.85 });
  });
});

describe('le résultat', () => {
  test('un JPEG est TOUJOURS ré-encodé, même plus gros : c’est ce qui retire l’EXIF et le GPS', async () => {
    const { port } = answering(webp(500));
    const prepared = await createImagePreparer(port).prepare(file('IMG_1.JPG', 'image/jpeg', 100));
    expect(prepared.type).toBe('image/webp');
    expect(prepared.name).toBe('IMG_1.webp');
    expect(prepared.size).toBe(500);
    expect(prepared.lastModified).toBe(MODIFIED);
  });

  test('l’extension suit le format réellement écrit', async () => {
    const jpeg = await createImagePreparer(answering(new Blob(['j'], { type: 'image/jpeg' })).port).prepare(file('a.webp', 'image/webp', 100));
    const png = await createImagePreparer(answering(new Blob(['p'], { type: 'image/png' })).port).prepare(file('b.jpeg', 'image/jpeg', 100));
    expect([jpeg.name, png.name]).toEqual(['a.jpg', 'b.png']);
  });

  test('un PNG ou un WebP qui ne rétrécit pas part tel quel : jamais pire que l’original', async () => {
    const original = file('a.png', 'image/png', 100);
    expect(await createImagePreparer(answering(webp(100)).port).prepare(original)).toBe(original);
    expect(await createImagePreparer(answering(webp(400)).port).prepare(original)).toBe(original);
  });

  test('un WebP qui porte de l’EXIF (drapeau VP8X) est ré-encodé même plus gros : la position ne part pas', async () => {
    const header = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8X');
    const withExif = file('IMG_2.webp', 'image/webp', [...header, 0, 0, 0, 10, 0x08, 0, 0, 0, ...new Array<number>(80).fill(0)]);
    const prepared = await createImagePreparer(answering(webp(500)).port).prepare(withExif);
    expect(prepared).not.toBe(withExif);
    expect(prepared.size).toBe(500);
  });

  test('un PNG qui porte un bloc eXIf est ré-encodé même plus gros : la position ne part pas', async () => {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const exif = [0, 0, 0, 4, ...new TextEncoder().encode('eXIf'), 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 0];
    const withExif = file('shot.png', 'image/png', [...signature, ...exif, ...new Array<number>(80).fill(0)]);
    const prepared = await createImagePreparer(answering(webp(500)).port).prepare(withExif);
    expect(prepared).not.toBe(withExif);
    expect(prepared.size).toBe(500);
  });

  test('un PNG qui rétrécit est remplacé', async () => {
    const prepared = await createImagePreparer(answering(webp(10)).port).prepare(file('a.png', 'image/png', 100));
    expect(prepared.type).toBe('image/webp');
    expect(prepared.name).toBe('a.webp');
  });
});

describe('la panne', () => {
  test('worker absent, image illisible, worker en erreur : l’original part, jamais un échec d’envoi', async () => {
    const original = file('a.jpg', 'image/jpeg', 100);
    expect(await createImagePreparer(() => undefined).prepare(original)).toBe(original);
    expect(await createImagePreparer(answering(null).port).prepare(original)).toBe(original);
    expect(await createImagePreparer(() => Promise.reject(new Error('worker'))).prepare(original)).toBe(original);
  });
});

describe('le renvoi', () => {
  test('« Réessayer » ne ré-encode pas : la même pièce rend la même préparation', async () => {
    const { port, jobs } = answering(webp(10));
    const preparer = createImagePreparer(port);
    const original = file('a.jpg', 'image/jpeg', 100);
    const first = await preparer.prepare(original);
    const second = await preparer.prepare(original);
    expect(second).toBe(first);
    expect(jobs).toHaveLength(1);
  });
});

describe('prepareUploads', () => {
  test('garde l’ordre, la durée et l’identifiant local de chaque pièce', async () => {
    const preparer = createImagePreparer(answering(webp(10)).port);
    const voice = file('v.m4a', 'audio/mp4');
    const prepared = await preparer.prepareUploads([
      { file: file('a.jpg', 'image/jpeg', 100), localId: 'l1' },
      { file: voice, durationMs: 4200, localId: 'l2' },
    ]);
    expect(prepared.map((p) => p.file.name)).toEqual(['a.webp', 'v.m4a']);
    expect(prepared[1]).toEqual({ file: voice, durationMs: 4200, localId: 'l2' });
    expect(prepared[0]?.localId).toBe('l1');
  });
});
