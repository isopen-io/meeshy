/**
 * Un HEIC, un HEIF ou un AVIF téléversé est servi aux lecteurs en JPEG
 * (#11263) : un ancien web, la coque Android ancienne ou l'extension de
 * notification ne reçoivent jamais `image/heic`. L'original est CONSERVÉ à
 * côté (`<base>_original.<ext>`), rangé dans `renditions` pour qu'un client
 * qui le décode (iOS) le choisisse.
 *
 * Une génération : le décodage est sans perte (PNG intermédiaire), seul le
 * JPEG q90 4:4:4 encode, au profil couleur d'origine (Display P3 d'un iPhone).
 * L'orientation `irot`/`imir` est appliquée par le décodeur. La carte de gain
 * HDR d'un HEIC n'est PAS reportée sur le JPEG : l'original la garde.
 *
 * Décodeurs : sharp lit l'AVIF (libvips précompilée avec aom) mais PAS le HEIC
 * (aucun décodeur HEVC dans ses binaires) ; le HEIC passe par `heif-convert`
 * (libheif + libde265, paquet `libheif-examples` de l'image). Un fichier que
 * ni l'un ni l'autre ne décode lève {@link UnconvertibleImageError} : l'upload
 * est REFUSÉ plutôt que servi en HEIC.
 */
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import type { MediaRendition } from '@meeshy/shared/types/attachment';

export const READER_JPEG_QUALITY = 90;
const HEIF_CONVERT_TIMEOUT_MS = 60_000;

const CONVERTIBLE: Readonly<Record<string, { readonly codec: MediaRendition['codec']; readonly extension: string; readonly sharpReads: boolean }>> = {
  'image/heic': { codec: 'heic', extension: '.heic', sharpReads: false },
  'image/heif': { codec: 'heic', extension: '.heif', sharpReads: false },
  'image/avif': { codec: 'avif', extension: '.avif', sharpReads: true },
};

export class UnconvertibleImageError extends Error {
  constructor(readonly mimeType: string, cause?: unknown) {
    super(`image ${mimeType} illisible par le serveur`);
    this.name = 'UnconvertibleImageError';
    if (cause !== undefined) Object.assign(this, { cause });
  }
}

export function isServerConvertedImage(mimeType: string): boolean {
  return CONVERTIBLE[mimeType.toLowerCase().split(';')[0].trim()] !== undefined;
}

function heifConvert(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('heif-convert', [input, output], { stdio: ['ignore', 'ignore', 'pipe'], timeout: HEIF_CONVERT_TIMEOUT_MS });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`heif-convert exit ${code}: ${stderr.slice(-300)}`))));
  });
}

async function decodedLossless(input: Buffer, sharpReads: boolean): Promise<Buffer> {
  if (sharpReads) return input;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'heif-convert-'));
  try {
    const source = path.join(dir, `${randomUUID()}.heic`);
    const decoded = path.join(dir, 'decoded.png');
    await fs.writeFile(source, input);
    await heifConvert(source, decoded);
    return await fs.readFile(decoded);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Le JPEG servi aux lecteurs, depuis les octets d'un HEIC/HEIF/AVIF. */
export async function convertHeifBuffer(input: Buffer, mimeType: string): Promise<Buffer> {
  const kind = CONVERTIBLE[mimeType.toLowerCase().split(';')[0].trim()];
  if (!kind) throw new UnconvertibleImageError(mimeType);
  try {
    const decoded = await decodedLossless(input, kind.sharpReads);
    return await sharp(decoded)
      .flatten({ background: '#ffffff' })
      .keepIccProfile()
      .jpeg({ quality: READER_JPEG_QUALITY, chromaSubsampling: '4:4:4' })
      .toBuffer();
  } catch (error) {
    throw new UnconvertibleImageError(mimeType, error);
  }
}

export type ConvertedImage = {
  readonly relPath: string;
  readonly mimeType: 'image/jpeg';
  readonly fileSize: number;
  readonly original: MediaRendition;
};

/**
 * Convertit le fichier POSÉ à `relPath` : écrit `<base>.jpg`, déplace
 * l'original en `<base>_original.<ext>`. Rend `null` pour un type qui ne se
 * convertit pas ; lève {@link UnconvertibleImageError} pour un fichier
 * illisible (l'original est alors laissé en place, l'appelant le retire).
 */
export async function convertStoredHeif(uploadBasePath: string, relPath: string, mimeType: string): Promise<ConvertedImage | null> {
  const normalized = mimeType.toLowerCase().split(';')[0].trim();
  const kind = CONVERTIBLE[normalized];
  if (!kind) return null;
  const ext = path.extname(relPath);
  const base = ext ? relPath.slice(0, relPath.length - ext.length) : relPath;
  const sourceAbs = path.join(uploadBasePath, relPath);
  const original = await fs.readFile(sourceAbs);
  const jpeg = await convertHeifBuffer(original, mimeType);
  const { width, height } = await sharp(jpeg).metadata();
  const jpegRel = `${base}.jpg`;
  const originalRel = `${base}_original${kind.extension}`;
  await fs.writeFile(path.join(uploadBasePath, jpegRel), jpeg);
  await fs.rename(sourceAbs, path.join(uploadBasePath, originalRel));
  return {
    relPath: jpegRel,
    mimeType: 'image/jpeg',
    fileSize: jpeg.length,
    original: { codec: kind.codec, mimeType: normalized, url: originalRel, width: width ?? 0, height: height ?? 0, size: original.length },
  };
}
