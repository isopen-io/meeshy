/**
 * Watermark SERVEUR appliqué au téléchargement d'un média de post (#3600).
 *
 * Décision d'architecture (voir l'issue) : le watermark n'est jamais posé à
 * l'upload — il est calculé à la demande, sur `GET
 * /posts/:postId/media/:mediaId/export`, et mis en cache sous
 * `<UPLOAD_PATH>/watermarked/<mediaId><ext>`. La variante n'est référencée par
 * AUCUNE ligne — elle vit hors du territoire de
 * `OrphanMediaCleanupService` (qui ne purge que ce qu'un producteur a
 * explicitement `track()`é) et hors de celui du script manuel
 * `scripts/cleanup-orphan-files.sh` tant que ce dernier n'énumère pas
 * `watermarked/` dans les chemins valides — ne PAS le faire tourner sur ce
 * répertoire sans l'y ajouter d'abord.
 *
 * Le COIN où se pose le bloc (logo + `@handle`) est dérivé DÉTERMINISTIQUEMENT
 * de l'id du média — jamais tiré au hasard à chaque appel — pour que la
 * variante mise en cache ne change pas de position entre deux téléchargements
 * du même fichier.
 */

import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

/** DejaVu est installée dans l'image Docker du gateway pour ce lot — voir le Dockerfile. */
export const WATERMARK_FONT_FILE =
  process.env.WATERMARK_FONT_PATH || '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

export type WatermarkCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const CORNERS: readonly WatermarkCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/**
 * Coin déterministe à partir d'un identifiant stable (l'id du média). Deux
 * appels avec le même id rendent toujours le même coin — c'est ce qui permet
 * de mettre la variante en cache sans qu'elle change d'apparence à chaque
 * régénération (purge de cache, redéploiement).
 */
export function watermarkCorner(seed: string): WatermarkCorner {
  const hash = crypto.createHash('sha256').update(seed).digest();
  return CORNERS[hash[0] % CORNERS.length];
}

/** Chemin de la variante watermarkée en cache pour un média donné. */
export function watermarkedVariantPath(uploadBasePath: string, mediaId: string, ext: string): string {
  return path.join(uploadBasePath, 'watermarked', `${mediaId}${ext}`);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MARGIN_RATIO = 0.04;

function watermarkOrigin(
  corner: WatermarkCorner,
  width: number,
  height: number,
  boxWidth: number,
  boxHeight: number,
): { x: number; y: number } {
  const marginX = Math.round(width * MARGIN_RATIO);
  const marginY = Math.round(height * MARGIN_RATIO);
  const x = corner.includes('right') ? width - boxWidth - marginX : marginX;
  const y = corner.includes('bottom') ? height - boxHeight - marginY : marginY;
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

/** Construit l'overlay SVG (logo + `@handle`) prêt à être composité par sharp. */
export function watermarkSvg(params: {
  width: number;
  height: number;
  handle: string;
  corner: WatermarkCorner;
}): Buffer {
  const { width, height, handle, corner } = params;
  const boxWidth = Math.max(160, Math.round(width * 0.28));
  const boxHeight = Math.round(boxWidth * 0.22);
  const { x, y } = watermarkOrigin(corner, width, height, boxWidth, boxHeight);
  const fontSize = Math.max(12, Math.round(boxHeight * 0.32));

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(${x}, ${y})">
    <rect width="${boxWidth}" height="${boxHeight}" rx="8" fill="black" fill-opacity="0.35" />
    <text x="12" y="${Math.round(boxHeight * 0.42)}" font-family="DejaVu Sans" font-weight="bold" font-size="${fontSize}" fill="white" fill-opacity="0.92">Meeshy</text>
    <text x="12" y="${Math.round(boxHeight * 0.82)}" font-family="DejaVu Sans" font-size="${Math.round(fontSize * 0.85)}" fill="white" fill-opacity="0.85">${escapeXml(handle)}</text>
  </g>
</svg>`;
  return Buffer.from(svg);
}

/** Écrit `data` sur un fichier temporaire puis le renomme — jamais de fichier partiel visible sous `destPath`. */
async function writeAtomically(destPath: string, write: (tmpPath: string) => Promise<void>): Promise<void> {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  const tmpPath = `${destPath}.${crypto.randomUUID()}.tmp`;
  try {
    await write(tmpPath);
    await fs.rename(tmpPath, destPath);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

/**
 * Watermark IMAGE : overlay logo + `@handle`, coin déterministe par média.
 * `sharp().rotate()` sans argument applique l'orientation EXIF avant de
 * mesurer les dimensions — sans quoi une photo portrait prise en paysage
 * recevrait un overlay dimensionné pour l'orientation brute.
 */
export async function applyImageWatermark(params: {
  sourcePath: string;
  destPath: string;
  handle: string;
  mediaId: string;
}): Promise<void> {
  const { sourcePath, destPath, handle, mediaId } = params;
  const oriented = sharp(sourcePath).rotate();
  const metadata = await oriented.metadata();
  const width = metadata.width ?? 1080;
  const height = metadata.height ?? 1080;
  const corner = watermarkCorner(mediaId);
  const overlay = watermarkSvg({ width, height, handle, corner });

  await writeAtomically(destPath, (tmpPath) =>
    sharp(sourcePath)
      .rotate()
      .composite([{ input: overlay, top: 0, left: 0 }])
      .toFile(tmpPath)
      .then(() => undefined),
  );
}

/** Escape des métacaractères du filtre `drawtext` ffmpeg (`:`, `'`, `\`). */
function escapeDrawtext(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function drawTextPosition(corner: WatermarkCorner): { x: string; y: string } {
  const margin = 24;
  const x = corner.includes('right') ? `w-tw-${margin}` : `${margin}`;
  const y = corner.includes('bottom') ? `h-th-${margin}` : `${margin}`;
  return { x, y };
}

export type FfmpegCommandFactory = (input: string) => ffmpeg.FfmpegCommand;

/**
 * Watermark VIDÉO : `drawtext` ffmpeg, police DejaVu, coin déterministe par
 * média (même dérivation que l'image). Overlay ANIMÉ : l'opacité alterne
 * entre deux paliers toutes les 3 secondes — visible sans dépendre d'un flux
 * de sous-titres additionnel ni d'un second passage d'encodage.
 */
export async function applyVideoWatermark(params: {
  sourcePath: string;
  destPath: string;
  handle: string;
  mediaId: string;
  ffmpegFactory?: FfmpegCommandFactory;
}): Promise<void> {
  const { sourcePath, destPath, handle, mediaId, ffmpegFactory = ffmpeg } = params;
  const corner = watermarkCorner(mediaId);
  const { x, y } = drawTextPosition(corner);
  const text = escapeDrawtext(`Meeshy ${handle}`);
  // `\,` échappe la virgule pour le parseur de filtres ffmpeg (sinon lue
  // comme séparateur entre deux filtres de la même chaîne).
  const alphaExpr = 'if(lt(mod(t\\,6)\\,3)\\,0.9\\,0.55)';
  const drawtext = [
    `drawtext=fontfile=${WATERMARK_FONT_FILE}`,
    `text='${text}'`,
    `x=${x}`,
    `y=${y}`,
    'fontsize=28',
    'fontcolor=white',
    'box=1',
    'boxcolor=black@0.35',
    'boxborderw=10',
    `alpha=${alphaExpr}`,
  ].join(':');

  await writeAtomically(destPath, (tmpPath) =>
    new Promise<void>((resolve, reject) => {
      ffmpegFactory(sourcePath)
        .videoFilters(drawtext)
        .outputOptions('-c:a', 'copy')
        .on('error', (err: Error) => reject(err))
        .on('end', () => resolve())
        .save(tmpPath);
    }),
  );
}
