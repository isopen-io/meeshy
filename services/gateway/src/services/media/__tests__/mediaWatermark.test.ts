/**
 * Watermark serveur (#3600) — `watermarkCorner` (déterminisme du placement),
 * `applyImageWatermark` (sharp RÉEL — pas de double, pour prouver que
 * l'overlay est effectivement composité) et `applyVideoWatermark`
 * (`fluent-ffmpeg` doublé via le seam `ffmpegFactory` : aucun binaire ffmpeg
 * n'est supposé présent dans l'environnement de test).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';

import {
  watermarkCorner,
  watermarkedVariantPath,
  watermarkSvg,
  applyImageWatermark,
  applyVideoWatermark,
  WATERMARK_FONT_FILE,
} from '../mediaWatermark';

describe('watermarkCorner', () => {
  it('est déterministe pour un même id — le cache ne doit jamais changer de position', () => {
    const id = '507f1f77bcf86cd799439011';
    expect(watermarkCorner(id)).toBe(watermarkCorner(id));
  });

  it('rend toujours un des quatre coins déclarés', () => {
    const corners = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((seed) => watermarkCorner(seed)),
    );
    for (const corner of corners) {
      expect(['top-left', 'top-right', 'bottom-left', 'bottom-right']).toContain(corner);
    }
  });

  it('distribue sur plusieurs coins pour des ids différents (pas toujours le même)', () => {
    const corners = new Set(
      Array.from({ length: 40 }, (_, i) => watermarkCorner(`media-${i}`)),
    );
    expect(corners.size).toBeGreaterThan(1);
  });
});

describe('watermarkedVariantPath', () => {
  it('range la variante sous <UPLOAD_PATH>/watermarked/<mediaId><ext>', () => {
    expect(watermarkedVariantPath('/app/uploads', 'media-1', '.jpg')).toBe(
      '/app/uploads/watermarked/media-1.jpg',
    );
  });
});

describe('watermarkSvg', () => {
  it('échappe le handle contre une injection XML', () => {
    const svg = watermarkSvg({
      width: 800,
      height: 600,
      handle: '@a&<b>"',
      corner: 'bottom-right',
    }).toString('utf8');
    expect(svg).not.toContain('@a&<b>"');
    expect(svg).toContain('@a&amp;&lt;b&gt;&quot;');
  });

  it('positionne le bloc dans le coin demandé (bottom-right ⇒ proche du bord bas-droit)', () => {
    const width = 1000;
    const height = 800;
    const svg = watermarkSvg({ width, height, handle: '@alice', corner: 'bottom-right' }).toString('utf8');
    const match = /translate\((\d+), (\d+)\)/.exec(svg);
    expect(match).not.toBeNull();
    const [, x, y] = match!;
    // Le bloc doit être dans la moitié droite/basse de l'image.
    expect(Number(x)).toBeGreaterThan(width / 2);
    expect(Number(y)).toBeGreaterThan(height / 2);
  });

  it('positionne le bloc dans le coin opposé pour top-left', () => {
    const width = 1000;
    const height = 800;
    const svg = watermarkSvg({ width, height, handle: '@alice', corner: 'top-left' }).toString('utf8');
    const match = /translate\((\d+), (\d+)\)/.exec(svg);
    const [, x, y] = match!;
    expect(Number(x)).toBeLessThan(width / 2);
    expect(Number(y)).toBeLessThan(height / 2);
  });
});

describe('applyImageWatermark — sharp réel', () => {
  const uploadBasePath = path.join(os.tmpdir(), `meeshy-watermark-image-${Date.now()}`);

  afterEach(async () => {
    await fs.rm(uploadBasePath, { recursive: true, force: true });
  });

  it('produit un fichier image valide, aux mêmes dimensions que la source', async () => {
    await fs.mkdir(uploadBasePath, { recursive: true });
    const sourcePath = path.join(uploadBasePath, 'source.png');
    await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toFile(sourcePath);

    const destPath = path.join(uploadBasePath, 'watermarked', 'out.png');
    await applyImageWatermark({
      sourcePath,
      destPath,
      handle: '@bob',
      mediaId: 'media-xyz',
    });

    const metadata = await sharp(destPath).metadata();
    expect(metadata.width).toBe(400);
    expect(metadata.height).toBe(300);
    expect(metadata.format).toBe('png');
  });

  it('ne laisse jamais de fichier `.tmp` derrière une écriture réussie', async () => {
    await fs.mkdir(uploadBasePath, { recursive: true });
    const sourcePath = path.join(uploadBasePath, 'source2.png');
    await sharp({
      create: { width: 120, height: 120, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toFile(sourcePath);

    const destDir = path.join(uploadBasePath, 'watermarked2');
    const destPath = path.join(destDir, 'out.png');
    await applyImageWatermark({ sourcePath, destPath, handle: '@carol', mediaId: 'media-abc' });

    const entries = await fs.readdir(destDir);
    expect(entries).toEqual(['out.png']);
  });

  it('rejette et n’écrit rien quand la source est introuvable', async () => {
    const destPath = path.join(uploadBasePath, 'watermarked3', 'out.png');
    await expect(
      applyImageWatermark({
        sourcePath: path.join(uploadBasePath, 'does-not-exist.png'),
        destPath,
        handle: '@dave',
        mediaId: 'media-404',
      }),
    ).rejects.toThrow();
    await expect(fs.stat(destPath)).rejects.toThrow();
  });
});

describe('applyVideoWatermark — fluent-ffmpeg doublé (aucun binaire supposé)', () => {
  const uploadBasePath = path.join(os.tmpdir(), `meeshy-watermark-video-${Date.now()}`);

  afterEach(async () => {
    await fs.rm(uploadBasePath, { recursive: true, force: true });
  });

  function fakeFfmpegFactory(onSave: (savedPath: string) => void | Promise<void>) {
    return jest.fn((_input: string) => {
      const command: any = {
        videoFilters: jest.fn(() => command),
        outputOptions: jest.fn(() => command),
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'end') command.__end = handler;
          if (event === 'error') command.__error = handler;
          return command;
        }),
        save: jest.fn((savedPath: string) => {
          Promise.resolve(onSave(savedPath)).then(() => command.__end?.());
          return command;
        }),
      };
      return command;
    });
  }

  it('construit un filtre drawtext avec la police DejaVu, le texte et une position dérivée du coin', async () => {
    const destPath = path.join(uploadBasePath, 'watermarked', 'clip.mp4');
    let capturedFilter = '';
    const factory = fakeFfmpegFactory(async (savedPath) => {
      await fs.mkdir(path.dirname(savedPath), { recursive: true });
      await fs.writeFile(savedPath, 'fake-mp4-bytes');
    });

    await applyVideoWatermark({
      sourcePath: '/tmp/does-not-matter.mp4',
      destPath,
      handle: '@erin',
      mediaId: 'media-vid-1',
      ffmpegFactory: factory as any,
    });

    const command = factory.mock.results[0].value;
    capturedFilter = command.videoFilters.mock.calls[0][0];

    expect(capturedFilter).toContain(`drawtext=fontfile=${WATERMARK_FONT_FILE}`);
    expect(capturedFilter).toContain("text='Meeshy @erin'");
    expect(capturedFilter).toContain('alpha=if(lt(mod(t\\,6)\\,3)\\,0.9\\,0.55)');

    const fileBytes = await fs.readFile(destPath, 'utf8');
    expect(fileBytes).toBe('fake-mp4-bytes');
  });

  it('échappe les deux-points et apostrophes du handle pour ne pas casser le filtre ffmpeg', async () => {
    const destPath = path.join(uploadBasePath, 'watermarked', 'clip2.mp4');
    const factory = fakeFfmpegFactory(async (savedPath) => {
      await fs.mkdir(path.dirname(savedPath), { recursive: true });
      await fs.writeFile(savedPath, 'x');
    });

    await applyVideoWatermark({
      sourcePath: '/tmp/x.mp4',
      destPath,
      handle: "@o'brien:studio",
      mediaId: 'media-vid-2',
      ffmpegFactory: factory as any,
    });

    const command = factory.mock.results[0].value;
    const filter = command.videoFilters.mock.calls[0][0] as string;
    expect(filter).toContain("text='Meeshy @o\\'brien\\:studio'");
  });

  it('rejette quand ffmpeg signale une erreur, et n’écrit rien de définitif', async () => {
    const destPath = path.join(uploadBasePath, 'watermarked', 'clip3.mp4');
    const factory = jest.fn((_input: string) => {
      const command: any = {
        videoFilters: jest.fn(() => command),
        outputOptions: jest.fn(() => command),
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'error') command.__error = handler;
          return command;
        }),
        save: jest.fn(() => {
          queueMicrotask(() => command.__error?.(new Error('ffmpeg exploded')));
          return command;
        }),
      };
      return command;
    });

    await expect(
      applyVideoWatermark({
        sourcePath: '/tmp/x.mp4',
        destPath,
        handle: '@fred',
        mediaId: 'media-vid-3',
        ffmpegFactory: factory as any,
      }),
    ).rejects.toThrow('ffmpeg exploded');

    await expect(fs.stat(destPath)).rejects.toThrow();
  });

  it('positionne le texte à droite (w-tw-…) pour un coin *-right, et à gauche (marge fixe) sinon', async () => {
    const destPathRight = path.join(uploadBasePath, 'watermarked', 'right.mp4');
    const destPathLeft = path.join(uploadBasePath, 'watermarked', 'left.mp4');

    // Deux ids dont on connaît le coin dérivé par lecture directe de watermarkCorner.
    const rightFactory = fakeFfmpegFactory(async (p) => {
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, 'x');
    });
    const leftFactory = fakeFfmpegFactory(async (p) => {
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, 'x');
    });

    // On cherche un id dont le coin contient "right" et un autre "left" —
    // watermarkCorner est déterministe et testé séparément ; ici on se
    // contente de vérifier la cohérence x ⇔ coin pour l'id choisi.
    const { watermarkCorner: corner } = await import('../mediaWatermark');
    let rightId = '';
    let leftId = '';
    for (let i = 0; i < 50 && (!rightId || !leftId); i++) {
      const c = corner(`probe-${i}`);
      if (c.includes('right') && !rightId) rightId = `probe-${i}`;
      if (!c.includes('right') && !leftId) leftId = `probe-${i}`;
    }
    expect(rightId).not.toBe('');
    expect(leftId).not.toBe('');

    await applyVideoWatermark({
      sourcePath: '/tmp/x.mp4',
      destPath: destPathRight,
      handle: '@r',
      mediaId: rightId,
      ffmpegFactory: rightFactory as any,
    });
    await applyVideoWatermark({
      sourcePath: '/tmp/x.mp4',
      destPath: destPathLeft,
      handle: '@l',
      mediaId: leftId,
      ffmpegFactory: leftFactory as any,
    });

    const rightFilter = rightFactory.mock.results[0].value.videoFilters.mock.calls[0][0] as string;
    const leftFilter = leftFactory.mock.results[0].value.videoFilters.mock.calls[0][0] as string;
    expect(rightFilter).toContain('x=w-tw-24');
    expect(leftFilter).toContain('x=24');
  });
});
