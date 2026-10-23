/**
 * Le rendu H.264 de COMPATIBILITÉ d'une vidéo HEVC (#11261, défaut validé de
 * #11247).
 *
 * Un iPhone envoie du HEVC (Main10, HDR HLG ou PQ depuis #11290). iOS le lit ;
 * le web hors Safari et la coque Android ne le lisent pas toujours. Plutôt que
 * de réencoder l'original — une génération perdue, et le HDR d'iOS jeté —
 * la passerelle fabrique un rendu ADDITIONNEL :
 * - H.264 High, 1920 px au plus sur le grand côté (jamais agrandi), CRF 23,
 *   préréglage `medium`, `+faststart` pour la lecture progressive ;
 * - une source HDR (transfert `arib-std-b67` ou `smpte2084`) est MAPPÉE en
 *   SDR BT.709 8 bits (zscale linéaire → tonemap Hable → BT.709) et étiquetée
 *   BT.709 : sans ce mappage, le web l'afficherait délavée ;
 * - l'original n'est jamais touché, et c'est lui qu'iOS et la charge push
 *   continuent de servir.
 *
 * Gardé par `VIDEO_COMPAT_RENDITION=true` (posé en staging ; la production
 * attend que S2 ait chiffré le CPU, #9232) et borné par
 * `VIDEO_TRANSCODE_MAX_SYNC_BYTES`. Un drapeau PROPRE, et non
 * `VIDEO_TRANSCODE` : celui-ci allume aussi le REMPLACEMENT d'une vidéo trop
 * lourde (720p CRF 26), une seconde génération que ce lot ne veut pas activer. Si l'image de la passerelle n'a pas le
 * filtre `zscale`, une source HDR n'a PAS de rendu — jamais un rendu délavé —
 * et le manque est journalisé. Un échec ne fait jamais échouer l'upload.
 */
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import type { VideoRendition } from '@meeshy/shared/types/attachment';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'video-compat-rendition' });

export const COMPAT_RENDITION_CRF = 23;
export const COMPAT_RENDITION_MAX_LONG_SIDE = 1920;
const HDR_TRANSFERS = new Set(['arib-std-b67', 'smpte2084']);
const HEVC_CODECS = new Set(['hevc', 'h265']);
const PROBE_TIMEOUT_MS = 15_000;

export type VideoColourProbe = { readonly codec: string | null; readonly transfer: string | null };
export type CompatRenditionPlan = { readonly maxLongSide: number; readonly crf: number; readonly toneMap: boolean };

export type { VideoRendition };

export function planCompatibilityRendition(probe: VideoColourProbe): CompatRenditionPlan | null {
  if (probe.codec === null || !HEVC_CODECS.has(probe.codec.toLowerCase())) return null;
  return { maxLongSide: COMPAT_RENDITION_MAX_LONG_SIDE, crf: COMPAT_RENDITION_CRF, toneMap: probe.transfer !== null && HDR_TRANSFERS.has(probe.transfer) };
}

const TONE_MAP_TO_BT709 = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv';

export function buildCompatibilityRenditionArgs(input: string, output: string, plan: CompatRenditionPlan): string[] {
  const L = plan.maxLongSide;
  const fit = `scale='if(gte(iw,ih),min(${L},iw),-2)':'if(gte(iw,ih),-2,min(${L},ih))',scale=trunc(iw/2)*2:trunc(ih/2)*2`;
  const filters = [...(plan.toneMap ? [TONE_MAP_TO_BT709] : []), fit, 'format=yuv420p'].join(',');
  return [
    '-v', 'error',
    '-i', input,
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-map_metadata', '-1',
    '-vf', filters,
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-preset', 'medium',
    '-crf', String(plan.crf),
    '-color_primaries', 'bt709',
    '-color_trc', 'bt709',
    '-colorspace', 'bt709',
    '-color_range', 'tv',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-f', 'mp4',
    '-y', output,
  ];
}

export function compatRenditionPathFor(relPath: string): string {
  const ext = path.extname(relPath);
  return `${ext ? relPath.slice(0, relPath.length - ext.length) : relPath}_h264.mp4`;
}

function runProbe(args: readonly string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn('ffprobe', [...args], { timeout: PROBE_TIMEOUT_MS });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code === 0 ? Buffer.concat(chunks).toString() : null));
  });
}

type VideoStream = { readonly codec_name?: string; readonly color_transfer?: string; readonly width?: number; readonly height?: number };

async function probeVideo(file: string): Promise<VideoStream | null> {
  const out = await runProbe(['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,color_transfer,width,height', '-of', 'json', file]);
  if (out === null) return null;
  try {
    return (JSON.parse(out) as { streams?: VideoStream[] }).streams?.[0] ?? null;
  } catch {
    return null;
  }
}

const filterCache = new Map<string, Promise<boolean>>();

/** Le filtre ffmpeg est-il compilé dans CETTE image ? Lu une fois par processus. */
export function ffmpegHasFilter(name: string): Promise<boolean> {
  const cached = filterCache.get(name);
  if (cached) return cached;
  const probe = new Promise<boolean>((resolve) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-filters'], { timeout: PROBE_TIMEOUT_MS });
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString(); });
    child.on('error', () => resolve(false));
    child.on('close', () => resolve(new RegExp(`\\s${name}\\s`).test(out)));
  });
  filterCache.set(name, probe);
  return probe;
}

export type CompatRenditionDeps = {
  readonly uploadBasePath: string;
  readonly runFfmpeg: (args: string[]) => Promise<void>;
  readonly hasFilter?: (name: string) => Promise<boolean>;
};

export async function produceCompatibilityRendition(
  deps: CompatRenditionDeps,
  source: { readonly relPath: string; readonly fileSize: number },
): Promise<VideoRendition | null> {
  if (process.env.VIDEO_COMPAT_RENDITION !== 'true') return null;
  const maxSync = Number(process.env.VIDEO_TRANSCODE_MAX_SYNC_BYTES || 200 * 1024 * 1024);
  if (source.fileSize > maxSync) return null;

  const inputAbs = path.join(deps.uploadBasePath, source.relPath);
  const stream = await probeVideo(inputAbs);
  const plan = planCompatibilityRendition({ codec: stream?.codec_name ?? null, transfer: stream?.color_transfer ?? null });
  if (plan === null) return null;
  if (plan.toneMap && !(await (deps.hasFilter ?? ffmpegHasFilter)('zscale'))) {
    logger.warn('ffmpeg sans zscale : aucun rendu H.264 pour une vidéo HDR (il serait délavé)', { relPath: source.relPath });
    return null;
  }

  const outputRel = compatRenditionPathFor(source.relPath);
  const outputAbs = path.join(deps.uploadBasePath, outputRel);
  try {
    await deps.runFfmpeg(buildCompatibilityRenditionArgs(inputAbs, outputAbs, plan));
    const [rendered, stat] = await Promise.all([probeVideo(outputAbs), fs.stat(outputAbs)]);
    if (!rendered?.width || !rendered.height || stat.size === 0) throw new Error('rendu vide');
    return { codec: 'h264', url: outputRel, width: rendered.width, height: rendered.height, size: stat.size };
  } catch (error) {
    logger.error('Rendu H.264 de compatibilité échoué, original servi seul', error as Error);
    await fs.unlink(outputAbs).catch(() => undefined);
    return null;
  }
}
