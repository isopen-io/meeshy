/**
 * #11257 — chaque étape de la chaîne média alimente `media_stage_seconds` à
 * l'endroit où elle s'exécute, quel que soit le chemin qui l'appelle
 * (multipart, résumable, chiffré côté serveur) : sonde, vignette, variantes,
 * retrait des métadonnées, transcodage. Une étape qui échoue est mesurée aussi.
 * L'étape `audio` est posée par #11259 (S4), qui réécrit la normalisation.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { processMediaStageMetrics } from '../mediaStageMetrics';
import { MetadataManager } from '../../attachments/MetadataManager';
import { stripMediaMetadataBuffer, stripStoredMediaMetadata } from '../../attachments/media-metadata-strip';
import { transcodeVideoRendition } from '../../attachments/media-renditions';
import { produceCompatibilityRendition } from '../../attachments/video-compat-rendition';

const count = async (stage: string, kind: string): Promise<number> => {
  const text = await processMediaStageMetrics.registry.metrics();
  const line = text.split('\n').find((row) => row.startsWith(`media_stage_seconds_count{stage="${stage}",kind="${kind}"}`));
  return line === undefined ? 0 : Number(line.split(' ').pop());
};

const delta = async (stage: string, kind: string, run: () => Promise<unknown>): Promise<number> => {
  const before = await count(stage, kind);
  await run().catch(() => undefined);
  return (await count(stage, kind)) - before;
};

const absent = path.join(os.tmpdir(), 'meeshy-media-stage-absent');
const manager = () => new MetadataManager(absent);

describe('les étapes de la chaîne média sont mesurées là où elles s’exécutent', () => {
  const previousTranscode = process.env.VIDEO_TRANSCODE;
  const previousCompat = process.env.VIDEO_COMPAT_RENDITION;
  afterEach(() => {
    if (previousTranscode === undefined) delete process.env.VIDEO_TRANSCODE;
    else process.env.VIDEO_TRANSCODE = previousTranscode;
    if (previousCompat === undefined) delete process.env.VIDEO_COMPAT_RENDITION;
    else process.env.VIDEO_COMPAT_RENDITION = previousCompat;
  });

  it('probe — la sonde des pistes et l’extraction des métadonnées', async () => {
    expect(await delta('probe', 'video', () => manager().probeMediaStreams(path.join(absent, 'clip.mp4')))).toBe(1);
    expect(await delta('probe', 'document', () => manager().extractMetadata('note.txt', 'text', 'text/plain'))).toBe(1);
  });

  it('thumbnail — la vignette d’une image et celle d’une vidéo', async () => {
    expect(await delta('thumbnail', 'image', () => manager().generateThumbnail('photo.jpg'))).toBe(1);
    expect(await delta('thumbnail', 'video', () => manager().generateVideoThumbnail('clip.mp4'))).toBe(1);
  });

  it('variants — les variantes responsives d’une image', async () => {
    expect(await delta('variants', 'image', () => manager().generateImageVariants('photo.jpg'))).toBe(1);
  });

  it('exif — le retrait des métadonnées, sur un tampon comme sur un fichier posé', async () => {
    expect(await delta('exif', 'image', () => stripMediaMetadataBuffer({ buffer: Buffer.from('pas une image'), mimeType: 'image/jpeg', fileName: 'p.jpg' }))).toBe(1);
    expect(await delta('exif', 'image', () => stripStoredMediaMetadata({ filePath: path.join(absent, 'p.jpg'), mimeType: 'image/jpeg' }))).toBe(1);
  });

  // Une vidéo HEVC n'est plus JAMAIS remplacée depuis #11261 (S6) : elle
  // gagne un rendu H.264 de compatibilité, mesuré ci-dessous. Le transcodage
  // de bande passante ne vise plus qu'un codec lourd non HEVC (ici VP9 4K).
  it('transcode — l’encodage d’une vidéo trop lourde, même quand ffmpeg échoue', async () => {
    process.env.VIDEO_TRANSCODE = 'true';
    const run = () =>
      transcodeVideoRendition(
        { uploadBasePath: absent, runFfmpeg: async () => Promise.reject(new Error('ffmpeg absent')) },
        { relPath: 'clip.webm', fileSize: 80 * 1024 * 1024, metadata: { width: 3840, height: 2160, bitrate: 60_000_000, videoCodec: 'vp9' } },
      );
    expect(await delta('transcode', 'video', run)).toBe(1);
  });

  it('une vidéo laissée telle quelle n’est pas comptée comme transcodée', async () => {
    delete process.env.VIDEO_TRANSCODE;
    const run = () =>
      transcodeVideoRendition(
        { uploadBasePath: absent, runFfmpeg: async () => undefined },
        { relPath: 'clip.webm', fileSize: 80 * 1024 * 1024, metadata: { width: 3840, height: 2160, bitrate: 60_000_000, videoCodec: 'vp9' } },
      );
    expect(await delta('transcode', 'video', run)).toBe(0);
  });

  it('transcode — le rendu H.264 de compatibilité d’une vidéo HEVC (#11261), même quand ffmpeg échoue', async () => {
    process.env.VIDEO_COMPAT_RENDITION = 'true';
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'media-stage-hevc-'));
    try {
      const made = spawnSync('ffmpeg', [
        '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=1',
        '-c:v', 'libx265', '-preset', 'ultrafast', '-tag:v', 'hvc1', '-x265-params', 'log-level=error', '-pix_fmt', 'yuv420p',
        '-y', path.join(base, 'clip.mov'),
      ]);
      if (made.status !== 0) throw new Error(made.stderr.toString());
      const run = () => produceCompatibilityRendition(
        { uploadBasePath: base, runFfmpeg: async () => Promise.reject(new Error('ffmpeg absent')) },
        { relPath: 'clip.mov', fileSize: 1 },
      );
      expect(await delta('transcode', 'video', run)).toBe(1);
    } finally {
      await fs.rm(base, { recursive: true, force: true });
    }
  }, 60_000);
});
