/**
 * Une vidéo perd son GPS et ses métadonnées sans être ré-encodée (#11258,
 * #9746).
 *
 * Un iPhone écrit la position de la prise (`com.apple.quicktime.location.ISO6709`,
 * `©xyz`), l'appareil, le logiciel et l'heure dans le conteneur. Un REMUX les
 * retire sans toucher un paquet : `-map_metadata -1` (globales et par piste),
 * `-map_chapters -1`, `-c copy`. Seules les pistes vidéo et audio sont
 * gardées — une piste de données QuickTime (`mebx`) peut porter ses propres
 * métadonnées temporisées. La rotation d'affichage vit dans la matrice de la
 * piste, pas dans les métadonnées : elle est conservée. `+faststart` place
 * l'index en tête pour une lecture progressive.
 *
 * Un échec (conteneur illisible, ffmpeg absent, délai) garde l'ORIGINAL et le
 * dit au retour (`false`) : c'est le régime de l'image (#3627), assumé tant
 * qu'un refus d'upload ne se décide pas (suivi de #11258).
 */
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { runFfmpeg } from './ffmpeg-run';

type RemuxTarget = { readonly format: string; readonly faststart: boolean };
type FfmpegRunner = (args: string[]) => Promise<void>;

const REMUX_TARGETS: Readonly<Record<string, RemuxTarget>> = {
  'video/mp4': { format: 'mp4', faststart: true },
  'video/x-m4v': { format: 'mp4', faststart: true },
  'video/quicktime': { format: 'mov', faststart: true },
  'video/3gpp': { format: '3gp', faststart: true },
  'video/webm': { format: 'webm', faststart: false },
  'video/x-matroska': { format: 'matroska', faststart: false },
  'video/ogg': { format: 'ogg', faststart: false },
};

function targetOf(mimeType: string): RemuxTarget | undefined {
  return REMUX_TARGETS[mimeType.toLowerCase().split(';')[0].trim()];
}

export function isVideoMetadataStrippable(mimeType: string): boolean {
  return targetOf(mimeType) !== undefined;
}

export function videoRemuxArgs(params: { input: string; output: string; mimeType: string }): string[] {
  const target = targetOf(params.mimeType);
  if (!target) throw new Error(`video metadata strip: unsupported ${params.mimeType}`);
  return [
    '-v', 'error',
    '-i', params.input,
    '-map', '0:v?',
    '-map', '0:a?',
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-c', 'copy',
    ...(target.faststart ? ['-movflags', '+faststart'] : []),
    '-f', target.format,
    '-y', params.output,
  ];
}

export async function stripVideoMetadataFile(params: {
  filePath: string;
  mimeType: string;
  run?: FfmpegRunner;
}): Promise<boolean> {
  if (!isVideoMetadataStrippable(params.mimeType)) return false;
  const run = params.run ?? ((args: string[]) => runFfmpeg(args));
  const output = path.join(path.dirname(params.filePath), `${path.basename(params.filePath)}.strip-${randomUUID()}${path.extname(params.filePath)}`);
  try {
    await run(videoRemuxArgs({ input: params.filePath, output, mimeType: params.mimeType }));
    await fs.rename(output, params.filePath);
    return true;
  } catch {
    await fs.unlink(output).catch(() => undefined);
    return false;
  }
}

export async function stripVideoMetadataBuffer(params: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  run?: FfmpegRunner;
}): Promise<Buffer> {
  if (!isVideoMetadataStrippable(params.mimeType)) return params.buffer;
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-strip-'));
  const filePath = path.join(workDir, `source${path.extname(params.fileName) || '.bin'}`);
  try {
    await fs.writeFile(filePath, params.buffer);
    const stripped = await stripVideoMetadataFile({ filePath, mimeType: params.mimeType, run: params.run });
    return stripped ? await fs.readFile(filePath) : params.buffer;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
