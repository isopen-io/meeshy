/**
 * La variante AVIF d'une photo HDR reste HDR (#12290, verdict #11247 : « HDR
 * conservé »).
 *
 * sharp 0.35 (libvips 8.18) sait APPLIQUER une carte de gain (`withGainMap`)
 * mais n'écrit qu'un AVIF sans boîte `colr` : ni étiquette BT.2100, ni carte
 * de gain AVIF. Un AVIF tiré d'une photo HDR par sharp serait donc SDR.
 *
 * Ici : sharp rend l'image HDR en flottants LINÉAIRES (1,0 = blanc SDR,
 * primaires BT.709), redimensionnée ; elle est convertie en BT.2020, posée à
 * 203 cd/m² pour le blanc SDR (ITU-R BT.2408) et encodée en PQ (SMPTE ST
 * 2084) sur 16 bits ; `avifenc` (libavif) l'écrit en AVIF 10 bits étiqueté
 * CICP 9/16/9 (BT.2020, PQ, BT.2020 NCL). Chrome, Safari et iOS l'affichent en
 * HDR ; un écran SDR le mappe.
 *
 * `null` quand l'encodeur manque ou échoue : l'appelant ne sert alors AUCUN
 * AVIF pour cette source — jamais un AVIF SDR à la place d'un HDR.
 */
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import sharp, { type Sharp } from 'sharp';

export const SDR_WHITE_NITS = 203;
const PQ_PEAK_NITS = 10_000;
const AVIFENC_TIMEOUT_MS = 60_000;
export const HDR_AVIF_QUANTIZER = 20;

const BT709_TO_BT2020 = [
  [0.6274, 0.3293, 0.0433],
  [0.0691, 0.9195, 0.0114],
  [0.0164, 0.0880, 0.8956],
] as const;

const M1 = 2610 / 16384;
const M2 = (2523 / 4096) * 128;
const C1 = 3424 / 4096;
const C2 = (2413 / 4096) * 32;
const C3 = (2392 / 4096) * 32;

/** OETF inverse PQ : luminance absolue (cd/m²) → signal [0, 1]. */
export function pqEncode(nits: number): number {
  const y = Math.min(Math.max(nits / PQ_PEAK_NITS, 0), 1);
  const p = Math.pow(y, M1);
  return Math.pow((C1 + C2 * p) / (1 + C3 * p), M2);
}

type GainMapAware = Sharp & { readonly withGainMap: () => Sharp };

/** La source porte-t-elle une carte de gain que sharp sait appliquer ? */
export async function hasGainMap(source: Buffer): Promise<boolean> {
  const metadata = await sharp(source).metadata().catch(() => null);
  return metadata?.gainMap !== undefined;
}

async function pqPng(source: Buffer, width: number): Promise<Buffer> {
  const { data, info } = await (sharp(source) as GainMapAware)
    .withGainMap()
    .resize(width, null, { fit: 'inside', withoutEnlargement: true })
    .raw({ depth: 'float' })
    .toBuffer({ resolveWithObject: true });
  const linear = new Float32Array(data.buffer, data.byteOffset, data.length / 4);
  const channels = info.channels;
  const out = new Uint16Array(info.width * info.height * 3);
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const [r, g, b] = [linear[pixel * channels], linear[pixel * channels + 1], linear[pixel * channels + 2]];
    BT709_TO_BT2020.forEach(([kr, kg, kb], c) => {
      out[pixel * 3 + c] = Math.round(pqEncode(Math.max(kr * r + kg * g + kb * b, 0) * SDR_WHITE_NITS) * 65535);
    });
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).toColourspace('rgb16').png().toBuffer();
}

function avifenc(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('avifenc', [
      '-d', '10', '--cicp', '9/16/9', '-r', 'full', '-s', '6',
      '--min', String(HDR_AVIF_QUANTIZER), '--max', String(HDR_AVIF_QUANTIZER),
      input, output,
    ], { stdio: ['ignore', 'ignore', 'pipe'], timeout: AVIFENC_TIMEOUT_MS });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`avifenc exit ${code}: ${stderr.slice(-300)}`))));
  });
}

export type HdrAvifEncoder = (source: Buffer, width: number) => Promise<Buffer | null>;

/** Une variante AVIF HDR (PQ 10 bits) de `source` à `width` px, ou `null`. */
export const encodeHdrAvif: HdrAvifEncoder = async (source, width) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hdr-avif-'));
  try {
    const png = path.join(dir, 'pq.png');
    const avif = path.join(dir, 'out.avif');
    await fs.writeFile(png, await pqPng(source, width));
    await avifenc(png, avif);
    return await fs.readFile(avif);
  } catch {
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
};
