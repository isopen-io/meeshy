/**
 * Une vidéo HEVC envoyée depuis un iPhone se lit sur le web et la coque
 * Android grâce à un rendu H.264 de COMPATIBILITÉ, l'original restant servi à
 * iOS (#11261, défaut validé de #11247).
 *
 * - HEVC ⇒ rendu ADDITIONNEL H.264 High, 1080p au plus, CRF 23 `medium`,
 *   `+faststart` ; l'original n'est jamais touché.
 * - HEVC HDR (HLG `arib-std-b67` ou PQ `smpte2084`, BT.2020) ⇒ le rendu est
 *   mappé en SDR BT.709 8 bits (zscale + tonemap) et étiqueté BT.709 : sans
 *   cette conversion, le web l'afficherait délavé.
 * - H.264 conforme ⇒ aucun rendu.
 *
 * Témoins sur ffmpeg et ffprobe RÉELS.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  COMPAT_RENDITION_CRF,
  buildCompatibilityRenditionArgs,
  planCompatibilityRendition,
  produceCompatibilityRendition,
} from '../video-compat-rendition';
import { runFfmpeg } from '../ffmpeg-run';
import { produceMediaRenditions } from '../media-renditions';
import { derivedFileCandidates } from '../derivedAttachmentFiles';
import { resolveFileRouteVerdict, type FileRouteVerdictPrisma } from '../fileRouteVerdict';
import { signReaderAttachmentUrls } from '../signedAttachmentUrls';
import { readSigningKeys, readerFileUrlSigner } from '../readerFileSignature';
import { copiedAttachmentFields } from '../../messaging/copiedAttachmentFields';

const dirs: string[] = [];
const ORIGINAL_FLAG = process.env.VIDEO_COMPAT_RENDITION;
beforeEach(() => {
  process.env.VIDEO_COMPAT_RENDITION = 'true';
});
afterEach(async () => {
  if (ORIGINAL_FLAG === undefined) delete process.env.VIDEO_COMPAT_RENDITION;
  else process.env.VIDEO_COMPAT_RENDITION = ORIGINAL_FLAG;
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

type Colour = 'sdr' | 'hlg' | 'pq';

async function video(params: { codec: 'hevc' | 'h264'; colour?: Colour; width?: number; height?: number }): Promise<{ base: string; relPath: string }> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'compat-rendition-'));
  dirs.push(base);
  const relPath = 'clip_1.mov';
  const colour = params.colour ?? 'sdr';
  const hdr = colour !== 'sdr';
  const tags = hdr
    ? ['-color_primaries', 'bt2020', '-color_trc', colour === 'hlg' ? 'arib-std-b67' : 'smpte2084', '-colorspace', 'bt2020nc']
    : ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];
  const encoder = params.codec === 'hevc'
    ? ['-c:v', 'libx265', '-preset', 'ultrafast', '-tag:v', 'hvc1', '-x265-params', 'log-level=error', '-pix_fmt', hdr ? 'yuv420p10le' : 'yuv420p']
    : ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'];
  const result = spawnSync('ffmpeg', [
    '-v', 'error',
    '-f', 'lavfi', '-i', `testsrc2=size=${params.width ?? 640}x${params.height ?? 360}:rate=30:duration=1`,
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    ...encoder, ...tags,
    '-c:a', 'aac', '-shortest',
    '-y', path.join(base, relPath),
  ]);
  if (result.status !== 0) throw new Error(result.stderr.toString());
  return { base, relPath };
}

type Probe = { codec_name: string; profile: string; width: number; height: number; pix_fmt: string; color_primaries?: string; color_transfer?: string; color_space?: string };

function probe(file: string): Probe {
  const { stdout } = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,profile,width,height,pix_fmt,color_primaries,color_transfer,color_space', '-of', 'json', file]);
  return JSON.parse(stdout.toString()).streams[0];
}

async function moovBeforeMdat(file: string): Promise<boolean> {
  const bytes = await fs.readFile(file);
  return bytes.indexOf('moov', 0, 'latin1') < bytes.indexOf('mdat', 0, 'latin1');
}

const sha = async (file: string): Promise<string> => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const deps = (base: string) => ({ uploadBasePath: base, runFfmpeg: (args: string[]) => runFfmpeg(args) });

describe('planCompatibilityRendition (#11261)', () => {
  it('HEVC ⇒ un rendu H.264 1080p CRF 23 ; HDR HLG ou PQ ⇒ mappage tonal', () => {
    expect(planCompatibilityRendition({ codec: 'hevc', transfer: 'bt709' })).toEqual({ maxLongSide: 1920, crf: COMPAT_RENDITION_CRF, toneMap: false });
    expect(planCompatibilityRendition({ codec: 'hevc', transfer: 'arib-std-b67' })?.toneMap).toBe(true);
    expect(planCompatibilityRendition({ codec: 'hevc', transfer: 'smpte2084' })?.toneMap).toBe(true);
    expect(COMPAT_RENDITION_CRF).toBe(23);
  });

  it('H.264 (ou autre) ⇒ aucun rendu', () => {
    expect(planCompatibilityRendition({ codec: 'h264', transfer: 'bt709' })).toBeNull();
    expect(planCompatibilityRendition({ codec: 'vp9', transfer: null })).toBeNull();
  });

  it('l’argv vise H.264 High `medium`, +faststart, étiqueté BT.709', () => {
    const args = buildCompatibilityRenditionArgs('in.mov', 'out.mp4', { maxLongSide: 1920, crf: 23, toneMap: true });
    expect(args[args.indexOf('-c:v') + 1]).toBe('libx264');
    expect(args[args.indexOf('-profile:v') + 1]).toBe('high');
    expect(args[args.indexOf('-preset') + 1]).toBe('medium');
    expect(args[args.indexOf('-crf') + 1]).toBe('23');
    expect(args[args.indexOf('-movflags') + 1]).toBe('+faststart');
    expect(args[args.indexOf('-color_trc') + 1]).toBe('bt709');
    expect(args[args.indexOf('-vf') + 1]).toContain('tonemap');
  });
});

describe('produceCompatibilityRendition — ffmpeg réel (#11261)', () => {
  it.each(['hlg', 'pq'] as const)('une vidéo HEVC HDR (%s) rend un H.264 SDR BT.709 8 bits, l’original intact', async (colour) => {
    const { base, relPath } = await video({ codec: 'hevc', colour });
    const before = await sha(path.join(base, relPath));

    const rendition = await produceCompatibilityRendition(deps(base), { relPath, fileSize: 1 });

    expect(rendition).not.toBeNull();
    expect(rendition?.codec).toBe('h264');
    expect(rendition?.url).toBe('clip_1_h264.mp4');
    const out = probe(path.join(base, rendition?.url ?? ''));
    expect(out).toMatchObject({ codec_name: 'h264', profile: 'High', pix_fmt: 'yuv420p', color_primaries: 'bt709', color_transfer: 'bt709', color_space: 'bt709' });
    expect([out.width, out.height]).toEqual([rendition?.width, rendition?.height]);
    expect(await sha(path.join(base, relPath))).toBe(before);
    expect(await moovBeforeMdat(path.join(base, rendition?.url ?? ''))).toBe(true);
  }, 120_000);

  it('une vidéo HEVC SDR rend un H.264 BT.709, sans mappage tonal', async () => {
    const { base, relPath } = await video({ codec: 'hevc' });

    const rendition = await produceCompatibilityRendition(deps(base), { relPath, fileSize: 1 });

    expect(probe(path.join(base, rendition?.url ?? ''))).toMatchObject({ codec_name: 'h264', pix_fmt: 'yuv420p', color_transfer: 'bt709' });
  }, 120_000);

  it('une vidéo plus grande que 1080p est ramenée à 1920 px sur son grand côté, jamais agrandie', async () => {
    const { base, relPath } = await video({ codec: 'hevc', width: 2560, height: 1440 });

    const rendition = await produceCompatibilityRendition(deps(base), { relPath, fileSize: 1 });

    expect([rendition?.width, rendition?.height]).toEqual([1920, 1080]);
  }, 120_000);

  it('une vidéo H.264 n’a AUCUN rendu', async () => {
    const { base, relPath } = await video({ codec: 'h264' });

    expect(await produceCompatibilityRendition(deps(base), { relPath, fileSize: 1 })).toBeNull();
  }, 60_000);

  it('drapeau éteint (production tant que S2 n’a pas chiffré le CPU) ⇒ aucun rendu', async () => {
    const { base, relPath } = await video({ codec: 'hevc' });
    process.env.VIDEO_COMPAT_RENDITION = 'false';

    expect(await produceCompatibilityRendition(deps(base), { relPath, fileSize: 1 })).toBeNull();
  }, 60_000);

  it('sans `zscale` dans ffmpeg, une source HDR n’a PAS de rendu (jamais un rendu délavé)', async () => {
    const { base, relPath } = await video({ codec: 'hevc', colour: 'hlg' });

    const rendition = await produceCompatibilityRendition({ ...deps(base), hasFilter: async () => false }, { relPath, fileSize: 1 });

    expect(rendition).toBeNull();
  }, 60_000);
});

describe('la fabrique des rendus porte le rendu H.264 à côté de l’original (#11261)', () => {
  it('une vidéo HEVC garde son original servi, et gagne `renditions`', async () => {
    const { base, relPath } = await video({ codec: 'hevc', colour: 'hlg' });
    const metadataManager = {
      generateThumbnail: async () => null,
      generateImageVariants: async () => [],
      generateAvifVariants: async () => [],
      generateVideoThumbnail: async () => null,
      extractMetadata: async () => ({}),
    };

    const out = await produceMediaRenditions(
      { uploadBasePath: base, metadataManager, runFfmpeg: (args: string[]) => runFfmpeg(args) },
      { relPath, mimeType: 'video/quicktime', attachmentType: 'video', fileSize: 1, metadata: { videoCodec: 'hevc', width: 640, height: 360 } },
    );

    expect(out.storedPath).toBe(relPath);
    expect(out.storedMimeType).toBe('video/quicktime');
    expect(out.renditions).toEqual([{ codec: 'h264', mimeType: 'video/mp4', url: 'clip_1_h264.mp4', width: 640, height: 360, size: expect.any(Number) }]);
  }, 120_000);
});

describe('ce qui voyage AVEC une pièce porte aussi son rendu H.264 (#11261)', () => {
  const renditions = [{ codec: 'h264', url: '2026/10/u/clip_h264.mp4', width: 1920, height: 1080, size: 10 }];

  it('la suppression efface le rendu, le transfert le recopie', () => {
    expect(derivedFileCandidates({ renditions })).toEqual(['2026/10/u/clip_h264.mp4']);
    const copy = copiedAttachmentFields({ fileName: 'c.mov', originalName: 'c.mov', mimeType: 'video/quicktime', fileSize: 1, filePath: '2026/10/u/clip.mov', fileUrl: '2026/10/u/clip.mov', renditions } as never);
    expect(copy.renditions).toEqual(renditions);
  });

  it('une vue unique signe l’adresse de son rendu pour CE lecteur', () => {
    const signer = readerFileUrlSigner({ keys: readSigningKeys({ ATTACHMENT_URL_SIGNING_KEY: Buffer.alloc(32, 3).toString('base64') }), now: new Date('2026-10-23') });
    const out = signReaderAttachmentUrls(
      { id: 'aaaaaaaaaaaaaaaaaaaaaaa1', fileUrl: '2026/10/u/clip.mov', renditions, isViewOnce: true, isBlurred: false, effectFlags: 0 },
      { message: { isViewOnce: true, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null }, readerParticipantId: 'cccccccccccccccccccccc01', signer },
    );
    expect((out.renditions as Array<{ url: string }>)[0]?.url).toMatch(/^\/api\/v1\/attachments\/signed\//);
  });

  it('la route de fichier rattache `<base>_h264.mp4` à sa pièce : refusé quand le porteur est rappelé', async () => {
    const owner = { messageId: 'bbbbbbbbbbbbbbbbbbbbbbb1', isViewOnce: false, isBlurred: false, effectFlags: 0 };
    const prisma = {
      messageAttachment: {
        findMany: async ({ where }: { where: { OR?: Array<{ filePath?: unknown }> } }) =>
          (where.OR ?? []).some((branch) => branch.filePath === '2026/10/u/clip') ? [owner] : [],
        findUnique: async () => null,
      },
      message: { findMany: async () => [{ id: owner.messageId, deletedAt: new Date('2026-10-01'), expiresAt: null, viewOnceBurnAt: null, isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null }] },
    } as unknown as FileRouteVerdictPrisma;

    expect(await resolveFileRouteVerdict('2026/10/u/clip_h264.mp4', prisma, new Date('2026-10-23'))).toEqual({ kind: 'gone' });
  });
});
