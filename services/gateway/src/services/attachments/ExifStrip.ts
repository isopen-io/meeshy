/**
 * Retrait d'EXIF/GPS des images uploadées (#3627), SANS perte de génération
 * (#11258).
 *
 * Les métadonnées partent au niveau des OCTETS, par une liste blanche propre à
 * chaque format (`metadata-strip/`) : les pixels ressortent tels qu'ils sont
 * entrés, le profil de couleur ICC reste, un WebP sans perte le reste, un PNG
 * à palette ne gonfle pas, une image animée garde toutes ses images (#10639).
 *
 * `sharp` n'intervient que dans deux cas :
 * - une image FIXE dont l'orientation EXIF vaut autre chose que 1 : la
 *   rotation est appliquée aux pixels (`autoOrient`) avant que l'EXIF ne
 *   parte, le profil ICC gardé (`keepIccProfile`), dans un encodage aussi
 *   fidèle que le format le permet (JPEG q92 4:4:4, WebP sans perte si la
 *   source l'était, PNG à palette si la source l'était) ;
 * - une structure JPEG ou WebP illisible : ré-encodage plutôt que de laisser
 *   partir l'original.
 * Une image ANIMÉE n'est jamais pivotée : sur plusieurs pages, sharp refuse,
 * et l'appelant garderait l'original AVEC son EXIF (audit #10639).
 *
 * GIF et HEIF (HEIC, AVIF) passent aussi (contre-analyse W4) : le client web
 * ne retire l'EXIF que des images qu'il ré-encode, et `sharp` ne décode pas le
 * HEIC. SVG est du XML, sans concept d'EXIF.
 */
import sharp, { type Metadata, type Sharp } from 'sharp';
import { stripGifMetadataBlocks } from './metadata-strip/gif-blocks';
import { blankIsobmffMetadataItems } from './metadata-strip/isobmff-items';
import { stripJpegMetadataSegments } from './metadata-strip/jpeg-segments';
import { isAnimatedPng, readPngChunks, stripPngMetadataChunks } from './metadata-strip/png-chunks';
import { isLosslessWebp, stripWebpMetadataChunks } from './metadata-strip/webp-chunks';

type ImageFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'heif';

const FORMAT_BY_MIME_TYPE: Readonly<Record<string, ImageFormat>> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heif',
  'image/heif': 'heif',
  'image/avif': 'heif',
};

const JPEG_REENCODE = { quality: 92, chromaSubsampling: '4:4:4' } as const;
const WEBP_LOSSY_REENCODE = { quality: 90 } as const;

function formatOf(mimeType: string): ImageFormat | undefined {
  return FORMAT_BY_MIME_TYPE[mimeType.toLowerCase()];
}

export function isExifStrippable(mimeType: string): boolean {
  return formatOf(mimeType) !== undefined;
}

type ReencodableFormat = 'jpeg' | 'png' | 'webp';
type ImageFacts = Partial<Pick<Metadata, 'isPalette' | 'pages' | 'orientation'>>;

function encode(image: Sharp, format: ReencodableFormat, source: Buffer, metadata: ImageFacts): Promise<Buffer> {
  if (format === 'jpeg') return image.jpeg(JPEG_REENCODE).toBuffer();
  if (format === 'png') return image.png({ palette: metadata.isPalette === true }).toBuffer();
  return image.webp(isLosslessWebp(source) ? { lossless: true } : WEBP_LOSSY_REENCODE).toBuffer();
}

function stripBytes(format: ReencodableFormat, buffer: Buffer): Buffer | null {
  if (format === 'jpeg') return stripJpegMetadataSegments(buffer);
  if (format === 'png') return stripPngMetadataChunks(buffer);
  return stripWebpMetadataChunks(buffer);
}

async function reencoded(buffer: Buffer, format: ReencodableFormat, metadata: ImageFacts): Promise<Buffer> {
  const pixels = await encode(sharp(buffer).autoOrient().keepIccProfile(), format, buffer, metadata);
  return stripBytes(format, pixels) ?? pixels;
}

async function stripStillOrReencode(buffer: Buffer, format: ReencodableFormat): Promise<Buffer> {
  const metadata: ImageFacts = await sharp(buffer).metadata().catch((): ImageFacts => ({}));
  const still = (metadata.pages ?? 1) <= 1;
  if (still && (metadata.orientation ?? 1) !== 1) return reencoded(buffer, format, metadata);
  return stripBytes(format, buffer) ?? reencoded(buffer, format, metadata);
}

/**
 * Rend `buffer` sans métadonnées. Rend `buffer` INCHANGÉ si `mimeType` n'est
 * pas couvert — l'appelant décide via `isExifStrippable`, la fonction reste
 * sans risque à appeler sur un type non couvert.
 */
export async function stripExifFromImageBuffer(buffer: Buffer, mimeType: string): Promise<Buffer> {
  const format = formatOf(mimeType);
  if (format === undefined) return buffer;
  if (format === 'gif') return stripGifMetadataBlocks(buffer) ?? buffer;
  if (format === 'heif') return blankIsobmffMetadataItems(buffer);
  if (format === 'png') {
    const read = readPngChunks(buffer);
    if (isAnimatedPng(read.chunks)) return stripPngMetadataChunks(buffer, read);
  }
  return stripStillOrReencode(buffer, format);
}
